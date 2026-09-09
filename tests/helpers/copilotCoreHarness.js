import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import { createTranscriptGuard, createSkipCounterReporter } from '../../src/lib/llm/transcriptGuard.js';

// Run the actual core with controlled hook storage, effects, and timers. This
// exercises scheduling without mounting the unrelated auth/log provider trees.
export function coreHarness(engine) {
  const slots = [], effects = [], intervals = new Map(), timeouts = new Map(), sent = [];
  let cursor = 0, nextId = 0;
  const memo = (factory, deps) => {
    const i = cursor++, old = slots[i];
    if (!old || deps.some((value, n) => !Object.is(value, old.deps[n]))) slots[i] = { value: factory(old?.value), deps };
    return slots[i].value;
  };
  const source = fs.readFileSync(new URL('../../src/hooks/useCopilotEngineCore.js', import.meta.url), 'utf8');
  const nodes = parse(source, { sourceType: 'module' }).program.body.filter(n => n.type !== 'ImportDeclaration');
  const code = nodes.map(n => source.slice((n.declaration || n).start, n.end)).join('\n');
  const hook = vm.runInNewContext(code + '\nuseCopilotEngineCore', {
    createTranscriptGuard, createSkipCounterReporter,
    useRef: initial => memo(() => ({ current: initial }), []),
    useState: initial => { const ref = memo(() => ({ value: initial }), []); return [ref.value, next => { ref.value = typeof next === 'function' ? next(ref.value) : next; }]; },
    useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: (fn, deps) => memo(old => {
      const effect = { cleanup: null };
      effects.push(() => { old?.cleanup?.(); effect.cleanup = fn(); });
      return effect;
    }, deps),
    useCopilotLog: () => ({ logEntry() {}, clearLog() {}, entries: [] }),
    useAppAuth: () => ({ getToken: async () => 'mock-token' }),
    LOG_TYPES: {},
    fetchWithClerk: async (_token, url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: true }; },
    setInterval: (fn, ms) => { intervals.set(++nextId, { fn, ms }); return nextId; },
    clearInterval: id => intervals.delete(id),
    setTimeout: (fn, ms) => { timeouts.set(++nextId, { fn, ms }); return nextId; },
    clearTimeout: id => timeouts.delete(id),
    window: { addEventListener() {}, removeEventListener() {} },
  });
  const transcriptRef = { current: 'Agent disclosed the purpose of the call.' };
  let options = { engine, transcriptRef, activeSection: 1, currentStep: 'Opening', state: { callStart: 1 }, callStarted: true,
    config: { coachingDebounceMs: 1000 }, buildContextSignature: () => 'unchanged-signature' };
  let core;
  const calls = [];
  const render = (overrides = {}) => {
    options = { ...options, ...overrides }; cursor = 0; core = hook(options);
    for (const effect of effects.splice(0)) effect();
    core.requestCoachingRef.current = input => {
      const ticket = core.captureCoachingTranscript();
      calls.push(input); core.markCoachingDispatched(ticket);
    };
    return core;
  };
  render();
  return { render, transcriptRef, calls, sent, get core() { return core; },
    tick: ms => { for (const timer of [...intervals.values()]) if (timer.ms === ms) timer.fn(); },
    debounce: () => { for (const [id, timer] of [...timeouts]) { timeouts.delete(id); timer.fn(); } },
  };
}
