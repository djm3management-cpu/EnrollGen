import { createOpenAIAdapter } from './openai.ts';
import { createAnthropicAdapter } from './anthropic.ts';
import { assertNoPublicApiKeys, resolveEngine, resolveProvider } from './config.js';
import { validateCompletion } from './validation.ts';
import type { Completion, CompletionRequest, Json, Runtime, Provider } from './types.ts';

if (typeof window !== 'undefined') throw new Error('LLM client is server-only');
assertNoPublicApiKeys(process.env);

const PRIMARY_MODEL = 'gpt-5.6-luna'; // No dated snapshot listed in the official model catalog.
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const EMPTY_USAGE = { input_tokens: 0, output_tokens: 0, cached_tokens: 0, reasoning_tokens: 0 };
const errorCode = (error: any) => String(error.status ?? error.code ?? error.name ?? 'unknown');
const transient = (error: any) => error.status === 429 || (error.status >= 500 && error.status <= 599)
  || ['APIConnectionTimeoutError', 'TimeoutError'].includes(error.name) || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(error.code);

function degraded(request: CompletionRequest, model: string, error: any): Completion {
  const message = 'Co-Pilot is temporarily unavailable. Continue using the checklist and retry shortly.';
  const parsed = { level: 'info', issue_tag: 'service_degraded', confidence: 0, message };
  return { id: '', model, content: [{ type: 'text', text: request.response_format ? JSON.stringify(parsed) : message }],
    tool_calls: [], stop_reason: 'degraded', usage: EMPTY_USAGE, degraded: true, error_code: errorCode(error),
    ...(request.response_format ? { parsed } : {}) };
}

function background(task: Promise<unknown>, runtime: Runtime) {
  const safe = task.catch(error => console.error('[llm] background telemetry failed', errorCode(error)));
  if (runtime.waitUntil) runtime.waitUntil(safe);
  else void safe; // CLI/tests are long-lived; serverless callers must supply waitUntil.
}

function record(runtime: Runtime, row: Json) {
  background(Promise.resolve().then(() => runtime.telemetry?.(row)), runtime);
}

function comparisonKey(result: Completion, request: CompletionRequest) {
  if (request.response_format?.json_schema.name === 'compliance_intents') {
    // intent_code is the catalog's stable resolved ID, not the model's prose/reasoning.
    return JSON.stringify([...new Set((result.parsed?.detections || []).filter((d: Json) => d.detected).map((d: Json) => d.intent_code))].sort());
  }
  return JSON.stringify(result.parsed || { content: result.content, tool_calls: result.tool_calls });
}

async function run(request: CompletionRequest, runtime: Runtime, stream: boolean, shadowModel?: string): Promise<{ result: Completion; events: Json[] }> {
  const env = runtime.env || process.env;
  const engine = resolveEngine(request.engine);
  const provider: Provider = shadowModel ? 'anthropic' : resolveProvider(engine, env);
  const adapters = runtime.adapters || { openai: createOpenAIAdapter(env), anthropic: createAnthropicAdapter(env) };
  let model = shadowModel || (provider === 'openai' ? PRIMARY_MODEL : ANTHROPIC_MODEL);
  const fallback = env.LLM_FALLBACK_MODEL === undefined ? 'gpt-5.6-terra' : env.LLM_FALLBACK_MODEL.trim();
  const started = Date.now();
  const requestId = crypto.randomUUID();
  let lastError: any;
  let originalError: string | null = null;
  let fallbackUsed = false;
  const sleep = runtime.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const random = runtime.random || Math.random;

  // Three primary attempts, followed by exactly one fallback attempt when eligible.
  for (let attempt = 1; attempt <= 4; attempt++) {
    if (attempt === 4) {
      if (provider !== 'openai' || model !== PRIMARY_MODEL || !fallback || !transient(lastError) || runtime.signal?.aborted) break;
      originalError = errorCode(lastError);
      model = fallback;
      fallbackUsed = true;
    }
    const attemptStarted = Date.now();
    const timeout = AbortSignal.timeout(request.path === 'summary' ? 120000 : 9000);
    const signal = runtime.signal ? AbortSignal.any([runtime.signal, timeout]) : timeout;
    let result: Completion | undefined;
    try {
      const events: Json[] = [];
      if (stream) {
        // Commit an attempt atomically: retries/fallback must never mix partial JSON or tool calls.
        for await (const event of adapters[provider].stream(request, model, signal)) {
          if (event.completion) result = event.completion;
          events.push(event);
        }
        if (!result) throw Object.assign(new Error('Stream ended without completion'), { code: 'ETIMEDOUT' });
      } else result = await adapters[provider].complete(request, model, signal);
      result = validateCompletion(result, request);
      record(runtime, { request_id: requestId, engine_name: engine, model: result.model || model,
        prompt_tokens: result.usage.input_tokens, cached_tokens: result.usage.cached_tokens,
        completion_tokens: result.usage.output_tokens, reasoning_tokens: result.usage.reasoning_tokens,
        latency_ms: Date.now() - attemptStarted, fallback_used: fallbackUsed, original_error_code: originalError,
        metadata: { attempt, provider, path: request.path || 'live', shadow: !!shadowModel, total_latency_ms: Date.now() - started } });
      return { result, events };
    } catch (caught) {
      const error = caught as any;
      lastError = timeout.aborted && !runtime.signal?.aborted ? Object.assign(new Error('LLM request timed out'), { code: 'ETIMEDOUT' }) : error;
      const usage = result?.usage || error.completion?.usage || EMPTY_USAGE;
      record(runtime, { request_id: requestId, engine_name: engine, model,
        prompt_tokens: usage.input_tokens, cached_tokens: usage.cached_tokens, completion_tokens: usage.output_tokens, reasoning_tokens: usage.reasoning_tokens,
        latency_ms: Date.now() - attemptStarted, fallback_used: fallbackUsed, original_error_code: originalError,
        metadata: { attempt, provider, path: request.path || 'live', shadow: !!shadowModel, error_code: errorCode(lastError) } });
      if (!transient(lastError) || runtime.signal?.aborted || attempt === 4) break;
      if (attempt < 3) await sleep(250 * 2 ** (attempt - 1) * (0.5 + random()));
    }
  }
  if (request.path === 'summary' || shadowModel || runtime.signal?.aborted) throw lastError;
  return { result: degraded(request, model, lastError), events: [] };
}

function start(request: CompletionRequest, runtime: Runtime, stream: boolean) {
  const primary = run(request, runtime, stream);
  const shadowModel = (runtime.env || process.env)[`LLM_SHADOW_${resolveEngine(request.engine)}`];
  if (shadowModel) {
    const shadow = run(request, { ...runtime, signal: undefined }, false, shadowModel);
    background(Promise.allSettled([primary, shadow]).then(async ([p, s]) => {
      const primaryResult = p.status === 'fulfilled' ? p.value.result : null;
      const shadowResult = s.status === 'fulfilled' ? s.value.result : null;
      await runtime.telemetry?.({ engine_name: request.engine, model: shadowModel,
        prompt_tokens: 0, cached_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, latency_ms: 0,
        fallback_used: false, original_error_code: null,
        primary_output: primaryResult, shadow_output: shadowResult,
        shadow_match: primaryResult && shadowResult && !primaryResult.degraded ? comparisonKey(primaryResult, request) === comparisonKey(shadowResult, request) : null,
        metadata: { event: 'shadow_compare', primary_error: p.status === 'rejected' ? errorCode(p.reason) : null,
          shadow_error: s.status === 'rejected' ? errorCode(s.reason) : null } });
    }), runtime);
  }
  return primary;
}

export async function complete(request: CompletionRequest, runtime: Runtime = {}): Promise<Completion> {
  return (await start(request, runtime, false)).result;
}

export async function* completeStream(request: CompletionRequest, runtime: Runtime = {}): AsyncGenerator<Json> {
  const { result, events } = await start(request, runtime, true);
  if (events.length) {
    for (const { completion: _completion, ...event } of events) yield event;
    return;
  }
  yield { type: 'message_start', message: { ...result, content: [], type: 'message', role: 'assistant' } };
  yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
  yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: result.content[0].text } };
  yield { type: 'content_block_stop', index: 0 };
  yield { type: 'message_delta', delta: { stop_reason: result.stop_reason }, usage: result.usage };
  yield { type: 'message_stop' };
}
