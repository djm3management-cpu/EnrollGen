import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAppAuth } from '../context/AuthContext';
import { readLocalAgentId } from '../lib/agentIdentity';
import { callContinuity } from '../lib/callContinuity.js';
import { calibratedThreshold, readAudioPreferences, saveAudioPreferences } from '../lib/audioPreferences.js';
import { AgentAudioProcessor, requestAgentMicrophone } from '../lib/audio/AgentAudioProcessor.js';

export default function AgentAudioSettings() {
  const { user } = useAppAuth();
  const agentId = readLocalAgentId();
  const [preferences, setPreferences] = useState(() => readAudioPreferences(user, agentId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const active = useRef(null);
  const callActive = useSyncExternalStore(callContinuity.subscribe, callContinuity.getSnapshot, () => false);
  useEffect(() => () => active.current?.cancel(), []);
  useEffect(() => { if (callActive) active.current?.cancel(); }, [callActive]);
  useEffect(() => { setPreferences(readAudioPreferences(user, agentId)); }, [user, agentId]);

  async function save(value) {
    setBusy(true);
    try {
      const saved = await saveAudioPreferences(user, agentId, value);
      setPreferences(saved);
      setMessage('Audio settings saved. Changes apply to your next call.');
    } catch (error) { setMessage(`Could not save audio settings: ${error.message}`); }
    finally { setBusy(false); }
  }

  async function calibrate() {
    if (callContinuity.getSnapshot()) return;
    setBusy(true);
    setMessage('Preparing microphone…');
    let input;
    let canceled = false;
    const processor = new AgentAudioProcessor({ calibration: true });
    const task = { cancel() {
      canceled = true;
      input?.getTracks().forEach(track => track.stop());
      void processor.dispose();
    } };
    active.current = task;
    try {
      input = await requestAgentMicrophone();
      if (canceled) return;
      const output = await processor.createProcessedStream(input);
      if (canceled) return;
      setMessage('Speak normally for 3 seconds…');
      const speech = await processor.sample(output);
      if (canceled) return;
      setMessage('Now stay silent. Sampling silence for 3 seconds…');
      // Give the agent time to stop speaking and let the denoiser tail settle.
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (canceled) return;
      const silence = await processor.sample(output);
      if (canceled) return;
      const thresholdDb = calibratedThreshold(speech, silence);
      await save({ ...preferences, thresholdDb });
    } catch (error) { if (!canceled) setMessage(`Calibration failed: ${error.message}`); }
    finally {
      input?.getTracks().forEach(track => track.stop());
      await processor.dispose();
      if (active.current === task) active.current = null;
      if (canceled) setMessage('Calibration canceled.');
      setBusy(false);
    }
  }

  return <section className="tenant-settings-card tenant-settings-card-wide">
    <div className="tenant-settings-section-title">Your microphone</div>
    <label className="tenant-settings-toggle">
      <input type="checkbox" checked={preferences.enabled} disabled={busy || callActive}
        onChange={event => void save({ ...preferences, enabled: event.target.checked })} />
      Noise suppression
    </label>
    <label className="tenant-settings-field">
      <span>Noise gate threshold: {preferences.thresholdDb} dBFS</span>
      <input type="range" min="-80" max="-10" step="1" value={preferences.thresholdDb} disabled={busy || callActive}
        onChange={event => setPreferences(value => ({ ...value, thresholdDb: Number(event.target.value) }))} />
    </label>
    <div className="tenant-settings-inline">
      <button type="button" className="billing-button" disabled={busy || callActive} onClick={() => void save(preferences)}>Save audio settings</button>
      <button type="button" className="billing-button" disabled={busy || callActive || !preferences.enabled} onClick={() => void calibrate()}>Calibrate</button>
      {busy && active.current ? <button type="button" className="billing-button" onClick={() => active.current?.cancel()}>Cancel</button> : null}
    </div>
    <p className="tenant-settings-muted" role="status" aria-live="polite">{callActive ? 'Finish your call to change microphone settings.' : message}</p>
  </section>;
}
