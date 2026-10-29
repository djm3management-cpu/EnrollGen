import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { AgentAudioProcessor, installAgentAudio, MICROPHONE_CONSTRAINTS, requestAgentMicrophone } from '../src/lib/audio/AgentAudioProcessor.js';
import { calibratedThreshold, normalizeAudioPreferences, readAudioPreferences, saveAudioPreferences } from '../src/lib/audioPreferences.js';

class Node extends EventTarget {
  constructor() { super(); this.connections = []; this.port = new EventTarget(); this.port.postMessage = () => {}; this.port.close = () => {}; this.port.start = () => {}; }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.connections = []; }
}
function stream() {
  const track = new EventTarget(); track.stopped = 0; track.stop = () => track.stopped++;
  return { track, getAudioTracks: () => [track], getTracks: () => [track] };
}
function fixture(overrides = {}) {
  const contexts = [], errors = [], suppressors = [];
  const processor = new AgentAudioProcessor({
    createContext() {
      const context = { sampleRate: 48000, state: 'running', closeCount: 0,
        audioWorklet: { addModule: async () => {} }, resume: async () => {},
        createMediaStreamSource: () => (context.source = new Node()),
        createMediaStreamDestination: () => Object.assign(new Node(), { stream: stream() }),
        close: async () => { context.state = 'closed'; context.closeCount++; },
      }; contexts.push(context); return context;
    },
    async createSuppressor(_context, options) {
      const handle = { node: new Node(), ready: Promise.resolve(), options, disposed: 0, dispose() { this.disposed++; this.node.disconnect(); } };
      suppressors.push(handle); return handle;
    },
    createGate: () => Object.assign(new Node(), { parameters: new Map([['thresholdDb', { value: 0 }]]) }),
    logger: { error: (...args) => errors.push(args) }, ...overrides,
  });
  return { processor, contexts, errors, suppressors };
}

test('successive calls and overlapping replacement streams release each context without stopping SDK input', async () => {
  const { processor, contexts, suppressors } = fixture();
  for (let i = 0; i < 12; i++) {
    const mic = stream();
    const output = await processor.createProcessedStream(mic);
    assert.notEqual(output, mic);
    assert.equal(suppressors[i].options.pauseAttenuationDb, suppressors[i].options.speechAttenuationDb);
    await processor.destroyProcessedStream(output);
    await processor.destroyProcessedStream(output);
    assert.equal(output.track.stopped, 1);
    assert.equal(mic.track.stopped, 0);
    assert.equal(contexts[i].closeCount, 1);
    assert.equal(processor.sessions.size, 0);
  }
  const old = await processor.createProcessedStream(stream());
  const next = await processor.createProcessedStream(stream());
  await processor.destroyProcessedStream(old);
  assert.equal(processor.sessions.size, 1);
  assert.equal(next.track.stopped, 0);
  await processor.dispose();
  assert.equal(processor.sessions.size, 0);
});

test('disabled, model failure, gate failure and ready rejection return raw mic and close allocations', async () => {
  for (const overrides of [
    { getPreferences: () => ({ enabled: false }) },
    { createSuppressor: async () => { throw new Error('model 404'); } },
    { createGate: () => { throw new Error('gate failure'); } },
    { createSuppressor: async () => ({ node: new Node(), ready: Promise.reject(new Error('Wasm failure')), dispose() {} }) },
  ]) {
    const { processor, contexts } = fixture(overrides), mic = stream();
    assert.equal(await processor.createProcessedStream(mic), mic);
    assert.equal(processor.sessions.size, 0);
    for (const context of contexts) assert.equal(context.closeCount, 1);
    assert.equal(mic.track.stopped, 0);
  }
});

test('teardown while model loads disposes a late handle and never publishes a processed stream', async () => {
  let resolveModel;
  const { processor, contexts } = fixture({ createSuppressor: () => new Promise(resolve => { resolveModel = resolve; }) });
  const mic = stream(), pending = processor.createProcessedStream(mic);
  await Promise.resolve();
  await processor.dispose();
  assert.equal(await pending, mic);
  let disposed = 0;
  resolveModel({ ready: Promise.resolve(), dispose: () => disposed++ });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(disposed, 1);
  assert.equal(contexts[0].closeCount, 1);
  assert.equal(processor.sessions.size, 0);
});

test('runtime errors and CPU overload bypass the gate while keeping the transmitted destination alive', async () => {
  for (const overload of [false, true]) {
    const { processor, contexts, suppressors, errors } = fixture();
    const mic = stream(), output = await processor.createProcessedStream(mic);
    if (overload) suppressors[0].options.onOverload(0.9);
    else suppressors[0].node.dispatchEvent(new Event('processorerror'));
    const session = [...processor.sessions][0];
    assert.deepEqual(contexts[0].source.connections, [session.destination]);
    assert.equal(output.track.stopped, 0);
    assert.equal(errors.length, 1);
    await processor.dispose();
    assert.equal(output.track.stopped, 1);
  }
});

test('registration sets mic constraints before processor; every capture overrides conflicting browser processing', async () => {
  const calls = [], device = { audio: {
    setAudioConstraints: async constraints => calls.push(['constraints', constraints]),
    addProcessor: async processor => calls.push(['processor', processor]),
  } };
  const processor = await installAgentAudio(device);
  assert.deepEqual(calls.map(call => call[0]), ['constraints', 'processor']);
  assert.deepEqual(calls[0][1], MICROPHONE_CONSTRAINTS);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
    getUserMedia: async constraints => constraints,
  } } });
  try {
    const capture = await requestAgentMicrophone({ audio: { deviceId: 'headset', noiseSuppression: true, autoGainControl: true } });
    assert.deepEqual(capture.audio, { deviceId: 'headset', ...MICROPHONE_CONSTRAINTS });
  } finally { if (previous) Object.defineProperty(globalThis, 'navigator', previous); else delete globalThis.navigator; }
  await processor.dispose();
});

test('calibration rejects weak separation and persists profile preferences without dropping other metadata', async () => {
  const threshold = calibratedThreshold([0.03, 0.04, 0.05], [0.001, 0.002, 0.001]);
  assert.ok(threshold > -54 && threshold < -30, 'threshold sits between noise and speech');
  assert.throws(() => calibratedThreshold([0.01], [0.009]), /too similar/);
  assert.throws(() => calibratedThreshold([], [0.001]), /No microphone samples/);
  assert.deepEqual(normalizeAudioPreferences({ thresholdDb: NaN }), { enabled: true, thresholdDb: -50 });
  let update;
  const user = { id: 'agent-a', unsafeMetadata: { other: 'keep' }, update: async value => { update = value; } };
  await saveAudioPreferences(user, null, { enabled: false, thresholdDb: -43 });
  assert.deepEqual(update.unsafeMetadata, { other: 'keep', audioPreferences: { enabled: false, thresholdDb: -43 } });
  user.unsafeMetadata = update.unsafeMetadata;
  assert.deepEqual(readAudioPreferences(user), { enabled: false, thresholdDb: -43 });
});

test('actual gate has no delay buffer, opens in ~5 ms, holds 200 ms and releases over 150 ms', () => {
  let Gate;
  vm.runInNewContext(readFileSync(new URL('../src/lib/audio/noiseGate.worklet.js', import.meta.url), 'utf8'), {
    sampleRate: 48000,
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage() {} }; } },
    registerProcessor: (_name, constructor) => { Gate = constructor; },
  });
  const gate = new Gate();
  const tick = (amplitude, count = 128) => {
    const input = new Float32Array(count).fill(amplitude), output = new Float32Array(count);
    gate.process([[input]], [[output]], { thresholdDb: [-40] }); return output;
  };
  const attack = tick(0.1, 240);
  assert.ok(attack[0] > 0, 'same-sample output, no lookahead');
  assert.ok(Math.abs(gate.gain - (1 - Math.exp(-1))) < 0.001);
  tick(0.1, 2400);
  tick(0.001, 9600);
  assert.ok(gate.gain > 0.99, 'quiet word ending survives hold');
  tick(0.001, 7200);
  assert.ok(Math.abs(gate.gain - Math.exp(-1)) < 0.002);
  tick(0.001, 48000);
  assert.ok(gate.gain < 0.001);
});
