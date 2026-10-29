import { normalizeAudioPreferences } from '../audioPreferences.js';
import { logAudioProcessingError } from '../debugLog.js';

export const MICROPHONE_CONSTRAINTS = Object.freeze({
  channelCount: 1, noiseSuppression: false, echoCancellation: true, autoGainControl: false,
});

// Also covers Twilio's default-device path, which does not always use AudioHelper constraints.
export function requestAgentMicrophone(constraints = { audio: true }) {
  return navigator.mediaDevices.getUserMedia({ ...constraints, audio: {
    ...(typeof constraints.audio === 'object' ? constraints.audio : {}), ...MICROPHONE_CONSTRAINTS,
  } });
}

const loadSuppressor = async (context, options) => {
  const { createDeepFilterNetAudioWorklet } = await import('@workadventure/noise-suppression/deepfilternet');
  return createDeepFilterNetAudioWorklet(context, options);
};

// Structural implementation of Twilio's AudioProcessor interface. Each SDK stream
// owns a context so closing it releases libDF's Wasm heap between calls/devices.
export class AgentAudioProcessor {
  constructor({ getPreferences = () => ({}), createSuppressor = loadSuppressor,
    createContext = () => new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' }),
    createGate = context => new AudioWorkletNode(context, 'enrollgen-noise-gate', {
      channelCount: 1, channelCountMode: 'explicit', outputChannelCount: [1],
    }), logger = { error: logAudioProcessingError }, calibration = false } = {}) {
    Object.assign(this, { getPreferences, createSuppressor, createContext, createGate, logger, calibration });
    this.sessions = new Set();
    this.disposed = false;
  }

  async createProcessedStream(stream) {
    const preferences = normalizeAudioPreferences(this.getPreferences());
    if (this.disposed || !preferences.enabled) return stream;
    const session = { input: stream, closed: false, cleanups: [] };
    this.sessions.add(session);
    let timer;
    try {
      session.context = this.createContext();
      const { context } = session;
      if (!context.audioWorklet || context.sampleRate !== 48000) throw new Error('48 kHz AudioWorklet is unavailable');
      // Resume synchronously with the call's user gesture, before downloading assets.
      const resume = context.resume();
      session.source = context.createMediaStreamSource(stream);
      session.destination = context.createMediaStreamDestination();
      session.output = session.destination.stream;
      const initialize = async () => {
        await resume;
        session.suppressor = await this.createSuppressor(context, {
          speechAttenuationDb: 25, pauseAttenuationDb: 25, postGain: false,
          bypassUntilReady: true, readyTimeoutMs: 5000,
          onOverload: load => this.bypass(session, new Error(`DeepFilterNet3 overloaded (${load})`)),
        });
        // Always observe ready, even when teardown wins the initialization race.
        const ready = session.suppressor.ready;
        ready.catch(() => {});
        if (session.closed) { session.suppressor.dispose(); return; }
        await context.audioWorklet.addModule(new URL('./noiseGate.worklet.js', import.meta.url).href);
        if (session.closed) return;
        session.gate = this.createGate(context);
        session.gate.parameters.get('thresholdDb').value = this.calibration ? -100 : preferences.thresholdDb;
        const fail = event => this.bypass(session, new Error(event?.data?.message || 'Audio worklet failed'));
        for (const node of [session.suppressor.node, session.gate]) {
          node.addEventListener('processorerror', fail);
          session.cleanups.push(() => node.removeEventListener('processorerror', fail));
        }
        const onMessage = event => { if (event.data.type === 'error') fail(event); };
        session.suppressor.node.port.addEventListener('message', onMessage);
        session.cleanups.push(() => session.suppressor.node.port.removeEventListener('message', onMessage));
        session.source.connect(session.suppressor.node).connect(session.gate).connect(session.destination);
        await ready;
        if (session.failed) throw new Error('Audio processing failed during initialization');
      };
      await Promise.race([initialize(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Audio processing initialization timed out')), 8000);
        session.cancel = () => reject(new Error('Audio processing canceled'));
      })]);
      if (session.closed || this.disposed) throw new Error('Audio processing canceled');
      const end = () => { void this.close(session); };
      for (const track of stream.getAudioTracks()) {
        track.addEventListener('ended', end);
        session.cleanups.push(() => track.removeEventListener('ended', end));
      }
      return session.output;
    } catch (error) {
      this.logger.error('[AgentAudio] Using raw microphone:', error);
      await this.close(session);
      if (this.calibration) throw error;
      return stream;
    } finally { clearTimeout(timer); session.cancel = null; }
  }

  bypass(session, error) {
    if (session.closed || session.failed) return;
    session.failed = true;
    this.logger.error('[AgentAudio] Using raw microphone:', error);
    session.rejectSample?.(error);
    session.source.disconnect();
    session.suppressor?.dispose();
    session.gate?.disconnect();
    // Keep the destination track alive for Twilio; switch its input to the raw mic.
    session.source.connect(session.destination);
  }

  sample(stream) {
    const session = [...this.sessions].find(item => item.output === stream);
    if (!session?.gate || session.failed || session.closed) return Promise.reject(new Error('Calibration audio is unavailable'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Microphone sampling timed out')), 5000);
      const onMessage = ({ data }) => { if (data.type === 'samples') finish(null, data.values); };
      const finish = (error, values) => {
        clearTimeout(timer);
        session.gate.port.removeEventListener('message', onMessage);
        session.rejectSample = null;
        if (error) reject(error); else resolve(values);
      };
      session.rejectSample = error => finish(error);
      session.gate.port.addEventListener('message', onMessage);
      session.gate.port.start();
      session.gate.port.postMessage({ type: 'sample' });
    });
  }

  async close(session) {
    if (session.closed) return;
    session.closed = true;
    this.sessions.delete(session);
    session.cancel?.();
    session.rejectSample?.(new Error('Calibration canceled'));
    session.cleanups.forEach(cleanup => cleanup());
    session.source?.disconnect();
    session.suppressor?.dispose();
    session.gate?.port.postMessage({ type: 'dispose' });
    session.gate?.port.close();
    session.gate?.disconnect();
    session.destination?.disconnect();
    session.output?.getTracks().forEach(track => track.stop());
    // Input tracks belong to Twilio (or the calibration caller), never this class.
    if (session.context && session.context.state !== 'closed') await session.context.close().catch(error => this.logger.error('[AgentAudio] Context cleanup failed:', error));
  }

  async destroyProcessedStream(stream) {
    await Promise.all([...this.sessions].filter(session => session.output === stream).map(session => this.close(session)));
  }

  async dispose() {
    this.disposed = true;
    await Promise.all([...this.sessions].map(session => this.close(session)));
  }
}

export async function installAgentAudio(device, options) {
  const processor = new AgentAudioProcessor(options);
  try {
    await device.audio.setAudioConstraints(MICROPHONE_CONSTRAINTS);
    await device.audio.addProcessor(processor);
    processor.registered = true;
  } catch (error) {
    logAudioProcessingError('[AgentAudio] Processor registration failed; using raw microphone:', error);
    await processor.dispose();
  }
  return processor;
}
