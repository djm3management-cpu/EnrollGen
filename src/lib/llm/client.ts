import { redactPromptPayload, safeDiagnosticCode } from '../../../telephony/src/lib/redaction.js';
import { featureEnabled } from '../../../telephony/src/lib/featureFlags.js';
import { createOpenAIAdapter } from './openai.ts';
import { assertNoPublicApiKeys, resolveEngine, resolveProvider, resolveModel } from './config.js';
import { validateCompletion } from './validation.ts';
import type { Completion, CompletionRequest, Json, Runtime, Provider } from './types.ts';

if (typeof window !== 'undefined') throw new Error('LLM client is server-only');
assertNoPublicApiKeys(process.env);

const PRIMARY_MODEL = resolveModel(undefined, {});
const EMPTY_USAGE = { input_tokens: 0, output_tokens: 0, cached_tokens: 0, reasoning_tokens: 0 };
const errorCode = (error: any) => String(Number.isInteger(error.status) ? error.status : safeDiagnosticCode(error));
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
  const safe = task.catch(() => { if (typeof window !== 'undefined' && process.env.ENROLLGEN_DEBUG_LOGS === 'true' && process.env.NODE_ENV !== 'production') console.debug('[llm] background telemetry failed'); });
  if (runtime.waitUntil) runtime.waitUntil(safe);
  else void safe; // CLI/tests are long-lived; serverless callers must supply waitUntil.
}

async function record(runtime: Runtime, row: Json) {
  if(row.metadata?.path==='scoring' || row.metadata?.task) {await runtime.telemetry?.(row);return;}
  background(Promise.resolve().then(() => runtime.telemetry?.(row)), runtime);
}

async function run(request: CompletionRequest, runtime: Runtime, stream: boolean): Promise<{ result: Completion; events: Json[] }> {
  // Preserve the jobs' original total deadlines across shared-client retries.
  if (request.task) {
    const deadline = AbortSignal.timeout(request.task === 'rts_ingestion' ? 90000 : 60000);
    runtime = {...runtime, signal: runtime.signal ? AbortSignal.any([runtime.signal, deadline]) : deadline};
  }
  const env = runtime.env || process.env;
  const engine = resolveEngine(request.engine);
  // Compliance scoring must stay on OpenAI, including legacy product engines.
  const provider: Provider = resolveProvider(engine, env);
  const adapters = runtime.adapters || { openai: createOpenAIAdapter(env) };
  let model = resolveModel(request.task, env);
  const fallback = env.LLM_FALLBACK_MODEL === undefined ? 'gpt-5.6-terra' : env.LLM_FALLBACK_MODEL.trim();
  const started = Date.now();
  const requestId = crypto.randomUUID();
  let lastError: any;
  let originalError: string | null = null;
  let fallbackUsed = false;
  const sleep = runtime.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const random = runtime.random || Math.random;

  if(request.path === 'scoring') {
    if(!featureEnabled('SCORING_ENABLED',env)) throw Object.assign(new Error('Scoring disabled'),{code:'scoring_disabled'});
    if(!runtime.authorizeScoringRequest) throw Object.assign(new Error('Scoring ledger authorization required'),{code:'scoring_ledger_required'});
    if(JSON.stringify(request.messages).length<200) throw new Error('Scoring payload too small');
    await runtime.authorizeScoringRequest(request,model,requestId);
  }
  // Three primary attempts, followed by exactly one fallback attempt when eligible.
  for (let attempt = 1; attempt <= (request.path === 'scoring' ? 1 : 4); attempt++) {
    if (attempt === 4) {
      if (request.task || model !== PRIMARY_MODEL || !fallback || !transient(lastError) || runtime.signal?.aborted) break;
      originalError = errorCode(lastError);
      model = fallback;
      fallbackUsed = true;
    }
    const attemptStarted = Date.now();
    const timeout = AbortSignal.timeout(request.task === 'rts_ingestion' ? 90000 : request.task === 'knowledge_update' ? 60000 : request.path === 'summary' || request.path === 'scoring' ? 120000 : 9000);
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
      await record(runtime, { request_id: requestId, engine_name: engine, model: result.model || model,
        prompt_tokens: result.usage.input_tokens, cached_tokens: result.usage.cached_tokens,
        completion_tokens: result.usage.output_tokens, reasoning_tokens: result.usage.reasoning_tokens,
        latency_ms: Date.now() - attemptStarted, fallback_used: fallbackUsed, original_error_code: originalError,
        metadata: { attempt, provider, path: request.path || 'live', task: request.task, total_latency_ms: Date.now() - started } });
      return { result, events };
    } catch (caught) {
      const error = caught as any;
      lastError = timeout.aborted && !runtime.signal?.aborted ? Object.assign(new Error('LLM request timed out'), { code: 'ETIMEDOUT' }) : error;
      const usage = result?.usage || error.completion?.usage || EMPTY_USAGE;
      await record(runtime, { request_id: requestId, engine_name: engine, model,
        prompt_tokens: usage.input_tokens, cached_tokens: usage.cached_tokens, completion_tokens: usage.output_tokens, reasoning_tokens: usage.reasoning_tokens,
        latency_ms: Date.now() - attemptStarted, fallback_used: fallbackUsed, original_error_code: originalError,
        metadata: { attempt, provider, path: request.path || 'live', task: request.task, error_code: errorCode(lastError) } });
      if (request.path==='scoring' || !transient(lastError) || runtime.signal?.aborted || attempt === 4) break;
      if (attempt < 3) await sleep(250 * 2 ** (attempt - 1) * (0.5 + random()));
    }
  }
  if (request.path === 'summary' || request.path === 'scoring' || runtime.signal?.aborted) throw lastError;
  return { result: degraded(request, model, lastError), events: [] };
}

function start(request: CompletionRequest, runtime: Runtime, stream: boolean) {
  request = redactPromptPayload(request);
  return run(request, runtime, stream);
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
