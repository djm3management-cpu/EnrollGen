import test from 'node:test';
import assert from 'node:assert/strict';
import { complete, completeStream } from '../src/lib/llm/client.ts';
import { createOpenAIAdapter, toResponsesRequest, mapResponsesStream } from '../src/lib/llm/openai.ts';
import { createAnthropicAdapter, toAnthropicRequest } from '../src/lib/llm/anthropic.ts';
import { assertNoPublicApiKeys, resolveProvider } from '../src/lib/llm/config.js';
import { coachingFormat } from '../src/lib/llm/schemas/coaching.js';
import { classificationFormat, assessmentFormat } from '../src/lib/llm/schemas/compliance.js';
import { buildCachedPrompt } from '../src/lib/llm/prompts.js';
import { buildClassificationPrompt } from '../src/compliance/prompts/intent-classification.js';
import { ALL_INTENTS } from '../src/compliance/intents/index.js';
import { classifyCall } from '../src/compliance/engine/IntentClassifier.js';
import { llmRuntime } from '../netlify/functions/_llmTelemetry.js';

const request = { engine: 'MA', system: 'Static rules', messages: [{ role: 'user', content: 'Live transcript' }] };
const usage = { input_tokens: 100, output_tokens: 30, input_tokens_details: { cached_tokens: 80 }, output_tokens_details: { reasoning_tokens: 10 } };
const coaching = { level: 'info', issue_tag: 'test', confidence: 0.9, message: 'Read the checklist.' };
const response = (text = 'Hello', model = 'gpt-5.6-luna') => ({ id: 'resp_1', model, status: 'completed', usage,
  output: [{ type: 'message', id: 'msg_1', role: 'assistant', content: [{ type: 'output_text', text }] }] });
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const errorResponse = status => new Response(JSON.stringify({ error: { message: 'Mock error', type: 'test_error', code: String(status) } }), { status, headers: { 'Content-Type': 'application/json' } });

function harness(fetchImpl, env = {}) {
  const requests = [], rows = [], tasks = [], sleeps = [];
  const runtime = {
    env, sleep: async ms => { sleeps.push(ms); }, random: () => 0.5,
    telemetry: async row => { rows.push(row); }, waitUntil: task => tasks.push(task),
    adapters: {
      openai: createOpenAIAdapter({ OPENAI_API_KEY: 'mock-key' }, async (url, init) => {
        const body = JSON.parse(init.body); requests.push(body);
        assert.equal(String(url), 'https://api.openai.com/v1/responses');
        return fetchImpl(body, requests.length);
      }),
      anthropic: createAnthropicAdapter({ ANTHROPIC_API_KEY: 'mock-key' }, async (_url, init) => {
        const body = JSON.parse(init.body); requests.push(body);
        return json({ id: 'ant_1', type: 'message', role: 'assistant', model: body.model,
          content: [{ type: 'text', text: JSON.stringify(coaching) }], stop_reason: 'end_turn',
          usage: { input_tokens: 20, cache_read_input_tokens: 80, output_tokens: 30 } });
      }),
    },
  };
  return { runtime, requests, rows, sleeps, flush: async () => { for (const task of tasks) await task; } };
}

test('Responses SDK tool-call round trip and cache marker removal', async () => {
  const h = harness(body => body.input.some(i => i.type === 'function_call_output') ? json(response()) : json({
    ...response(), output: [{ type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'lookup', arguments: '{"state":"NY"}' }],
  }));
  const tools = [{ name: 'lookup', description: 'Lookup', input_schema: { type: 'object', properties: { state: { type: 'string' } }, required: ['state'] }, cache_control: { type: 'ephemeral' } }];
  const first = await complete({ ...request, tools, system: [{ type: 'text', text: 'Static rules', cache_control: { type: 'ephemeral' } }] }, h.runtime);
  assert.equal(first.stop_reason, 'tool_use');
  assert.deepEqual(first.content[0].input, { state: 'NY' });
  assert.equal(first.tool_calls[0].id, 'call_1');
  const second = await complete({ ...request, tools, messages: [...request.messages,
    { role: 'assistant', content: first.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'Found' }] },
  ] }, h.runtime);
  assert.equal(second.content[0].text, 'Hello');
  assert.deepEqual(h.requests[0].input[0], { role: 'developer', content: 'Static rules' });
  assert.deepEqual(h.requests[0].tools[0].parameters, tools[0].input_schema);
  assert.equal(JSON.stringify(h.requests).includes('cache_control'), false);
  assert.equal(h.requests[1].input.at(-1).call_id, 'call_1');
  assert.equal(h.requests[1].input.at(-1).type, 'function_call_output');
  const canonical = { ...request, messages: [{ role: 'assistant', tool_calls: first.tool_calls }, { role: 'tool', tool_call_id: 'call_1', content: 'Found' }] };
  assert.equal(toResponsesRequest(canonical, 'test').input.at(-1).call_id, 'call_1');
  assert.equal(toAnthropicRequest(canonical, 'test').messages.at(-1).content[0].tool_use_id, 'call_1');
  await h.flush();
  assert.deepEqual([h.rows[0].prompt_tokens, h.rows[0].cached_tokens, h.rows[0].completion_tokens, h.rows[0].reasoning_tokens], [100, 80, 30, 10]);
});

test('Responses body uses reasoning effort, token budget and strict schema without sampling fields', () => {
  for (const path of ['live', 'summary']) {
    const body = toResponsesRequest({ ...request, path, max_completion_tokens: 3000, response_format: coachingFormat, temperature: 1, top_p: 1 }, 'gpt-5.6-luna');
    assert.equal(body.reasoning.effort, path === 'live' ? 'low' : 'medium');
    assert.equal(body.max_output_tokens, 3000);
    for (const key of ['temperature', 'top_p', 'max_tokens', 'max_completion_tokens', 'response_format']) assert.equal(key in body, false);
    assert.equal(body.text.format.strict, true);
    assert.deepEqual(body.text.format.schema, coachingFormat.json_schema.schema);
  }
});

test('strict-schema failure and refusal degrade live calls without fallback', async () => {
  for (const output of [JSON.stringify({ ...coaching, confidence: 'high' }), '```json\n{}\n```', JSON.stringify({ ...coaching, extra: true })]) {
    const h = harness(() => json(response(output)));
    const result = await complete({ ...request, response_format: coachingFormat }, h.runtime);
    assert.equal(result.degraded, true);
    assert.equal(result.parsed.issue_tag, 'service_degraded');
    assert.equal(h.requests.length, 1);
  }
  const h = harness(() => json({ ...response(), output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }));
  assert.equal((await complete(request, h.runtime)).degraded, true);
});

test('summary schema failures throw and never fabricate a scorecard', async () => {
  const h = harness(() => json(response('{}')));
  await assert.rejects(complete({ ...request, path: 'summary', response_format: assessmentFormat }, h.runtime), /schema validation/);
  assert.equal(h.requests.length, 1);
});

test('global provider and each engine override select Anthropic with normalized usage', async () => {
  assert.equal(resolveProvider('MA', {}), 'openai');
  assert.equal(resolveProvider('ANCILLARY', { LLM_PROVIDER: 'openai' }), 'anthropic');
  assert.equal(resolveProvider('ANNUITY', { LLM_PROVIDER: 'openai' }), 'anthropic');
  for (const engine of ['MA', 'MEDSUP', 'ACA', 'U65']) {
    const h = harness(() => { throw new Error('OpenAI must not be called'); }, { LLM_PROVIDER: 'openai', [`LLM_PROVIDER_${engine}`]: 'anthropic' });
    const result = await complete({ ...request, engine, response_format: coachingFormat }, h.runtime);
    assert.equal(result.model, 'claude-sonnet-4-6');
    assert.equal(result.usage.input_tokens, 100);
    assert.equal(h.requests[0].output_config.format.type, 'json_schema');
    assert.equal('minimum' in h.requests[0].output_config.format.schema.properties.confidence, false);
    assert.equal(coachingFormat.json_schema.schema.properties.confidence.minimum, 0);
    assert.equal(resolveProvider(engine, { LLM_PROVIDER: 'anthropic', [`LLM_PROVIDER_${engine}`]: 'openai' }), 'openai');
  }
  assert.throws(() => resolveProvider('MA', { LLM_PROVIDER: 'bad' }), /Invalid/);
});

for (const status of [500, 503, 429]) test(`fallback after three ${status} attempts preserves body and logs invocation`, async () => {
  const h = harness((body, count) => count <= 3 ? errorResponse(status) : json(response('Fallback', body.model)));
  const result = await complete(request, h.runtime);
  assert.equal(result.model, 'gpt-5.6-terra');
  assert.deepEqual(h.requests.map(b => b.model), ['gpt-5.6-luna', 'gpt-5.6-luna', 'gpt-5.6-luna', 'gpt-5.6-terra']);
  assert.deepEqual({ ...h.requests[3], model: h.requests[0].model }, h.requests[0]);
  assert.deepEqual(h.sleeps, [250, 500]);
  await h.flush();
  assert.equal(h.rows[3].fallback_used, true);
  assert.equal(h.rows[3].original_error_code, String(status));
  assert.ok(h.rows.every(row => typeof row.latency_ms === 'number'));
});

for (const status of [400, 401, 403, 404, 422]) test(`no retry or fallback on ${status}`, async () => {
  const h = harness(() => errorResponse(status));
  const result = await complete(request, h.runtime);
  assert.equal(result.degraded, true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.sleeps.length, 0);
});

test('timeout triggers fallback, empty fallback disables it, terminal fallback degrades', async () => {
  const h = harness(() => json(response()));
  const models = [];
  h.runtime.adapters.openai.complete = async (_request, model) => {
    models.push(model);
    throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
  };
  assert.equal((await complete(request, h.runtime)).degraded, true);
  assert.equal(models.at(-1), 'gpt-5.6-terra');
  assert.equal(models.length, 4);
  const disabled = harness(() => errorResponse(500), { LLM_FALLBACK_MODEL: '' });
  assert.equal((await complete(request, disabled.runtime)).degraded, true);
  assert.equal(disabled.requests.length, 3);
  const custom = harness((body, count) => count < 4 ? errorResponse(500) : json(response('ok', body.model)), { LLM_FALLBACK_MODEL: 'configured-model' });
  assert.equal((await complete(request, custom.runtime)).model, 'configured-model');
});

async function* iterable(events) { yield* events; }
const streamEvents = (text = 'Hello') => [
  { type: 'response.created', response: { ...response(), output: [], usage: null } },
  { type: 'response.content_part.added', output_index: 1, content_index: 0, part: { type: 'output_text' } },
  { type: 'response.output_text.delta', output_index: 1, content_index: 0, delta: text },
  { type: 'response.content_part.done', output_index: 1, content_index: 0, part: { type: 'output_text' } },
  { type: 'response.completed', response: response(text) },
];

test('streaming text/tool events map to the existing Anthropic consumer envelope', async () => {
  const events = streamEvents();
  events.splice(4, 0,
    { type: 'response.output_item.added', item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'lookup' } },
    { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: '{"state":"NY"}' },
    { type: 'response.output_item.done', item: { type: 'function_call', id: 'fc_1' } });
  const mapped = await Array.fromAsync(mapResponsesStream(iterable(events)));
  assert.deepEqual(mapped.map(e => e.type), ['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop']);
  assert.deepEqual(mapped[2], { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } });
  assert.equal(mapped[4].content_block.id, 'call_1');
  assert.deepEqual(mapped[5].delta, { type: 'input_json_delta', partial_json: '{"state":"NY"}' });
  assert.equal(mapped[7].usage.cached_tokens, 80);
});

test('official SDK SSE path and transactional fallback avoid mixed primary/fallback output', async () => {
  const h = harness((_body, count) => {
    const events = count < 4 ? [...streamEvents('partial').slice(0, 3), { type: 'response.failed', response: { error: { code: 'server_error' } } }] : streamEvents('Fallback');
    return new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
  });
  const events = await Array.fromAsync(completeStream(request, h.runtime));
  assert.equal(events.filter(e => e.delta?.type === 'text_delta').map(e => e.delta.text).join(''), 'Fallback');
  assert.equal(h.requests.length, 4);
  assert.equal(events.at(-1).type, 'message_stop');
  assert.equal('completion' in events.at(-1), false);
});

test('stream schema failure yields a complete degraded envelope', async () => {
  const h = harness(() => new Response(streamEvents('{}').map(e => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } }));
  const events = await Array.fromAsync(completeStream({ ...request, response_format: coachingFormat }, h.runtime));
  assert.equal(events[0].message.degraded, true);
  assert.equal(JSON.parse(events[2].delta.text).issue_tag, 'service_degraded');
  assert.equal(h.requests.length, 1);
});

test('shadow never delays primary and compares resolved intent IDs, ignoring prose/order', async () => {
  const detection = (code, reasoning) => ({ intent_code: code, detected: true, confidence: 0.9, speaker: 'agent', evidence_text: 'text', reasoning, anti_pattern: false, anti_pattern_detail: null, sequence_position: 1 });
  const result = { detections: [detection(ALL_INTENTS[0].intent_code, 'primary')], risk_indicators: [], sentiment: { agent: 'professional', beneficiary: 'engaged' } };
  const h = harness(() => json(response(JSON.stringify(result))), { LLM_SHADOW_MA: 'claude-sonnet-4-6' });
  let release;
  let shadowStarted = false;
  const gate = new Promise(resolve => { release = resolve; });
  h.runtime.adapters.anthropic.complete = async () => {
    shadowStarted = true;
    await gate;
    return { id: 'shadow', model: 'claude-sonnet-4-6', content: [{ type: 'text', text: JSON.stringify({ ...result, detections: [detection(ALL_INTENTS[0].intent_code, 'different prose')] }) }], tool_calls: [], stop_reason: 'end_turn', usage: { input_tokens: 1, cached_tokens: 0, output_tokens: 1, reasoning_tokens: 0 } };
  };
  const primary = await complete({ ...request, response_format: classificationFormat }, h.runtime);
  assert.equal(shadowStarted, true);
  assert.equal(primary.degraded, undefined);
  assert.equal(h.rows.some(row => row.metadata.event === 'shadow_compare'), false);
  release();
  await h.flush();
  const comparison = h.rows.find(row => row.metadata.event === 'shadow_compare');
  assert.equal(comparison.shadow_match, true);
  assert.ok(comparison.primary_output && comparison.shadow_output);
});

test('shadow mismatch and shadow failures never affect primary', async () => {
  const h = harness(() => json(response('primary')), { LLM_SHADOW_MA: 'claude-sonnet-4-6' });
  assert.equal((await complete(request, h.runtime)).content[0].text, 'primary');
  await h.flush();
  assert.equal(h.rows.find(row => row.metadata.event === 'shadow_compare').shadow_match, false);
  const failed = harness(() => json(response()), { LLM_SHADOW_MA: 'claude-sonnet-4-6' });
  failed.runtime.adapters.anthropic.complete = async () => { throw Object.assign(new Error('bad'), { status: 400 }); };
  assert.equal((await complete(request, failed.runtime)).degraded, undefined);
  await failed.flush();
  const comparison = failed.rows.find(row => row.metadata.event === 'shadow_compare');
  assert.equal(comparison.shadow_match, null);
  assert.equal(comparison.metadata.shadow_error, '400');
});

test('startup rejects public API keys without disclosing secret values', () => {
  for (const env of [{ VITE_OPENAI_API_KEY: 'private' }, { VITE_OTHER: 'sk-proj-private12345' }, { VITE_OTHER: 'private', OPENAI_API_KEY: 'private' }]) {
    assert.throws(() => assertNoPublicApiKeys(env), error => !error.message.includes('private') && /Unsafe public secret/.test(error.message));
  }
  assert.doesNotThrow(() => assertNoPublicApiKeys({ OPENAI_API_KEY: 'private', VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_public', VITE_SUPABASE_ANON_KEY: 'public' }));
});

test('startup allows exactly the migration exceptions but rejects disguised provider secrets', () => {
  for (const name of ['VITE_BIBLIA_API_KEY', 'VITE_AGENT_API_KEY']) {
    assert.doesNotThrow(() => assertNoPublicApiKeys({ [name]: 'public-integration' }));
    for (const env of [
      { [name]: 'sk-proj-private12345' },
      { [name]: 'private', OPENAI_API_KEY: 'private' },
      { [name]: 'private', ANTHROPIC_API_KEY: 'private' },
    ]) assert.throws(() => assertNoPublicApiKeys(env), /Unsafe public secret/);
  }
  for (const env of [
    { VITE_BIBLIA_API_KEY_EXTRA: 'private' },
    { VITE_AGENT_API_KEY_EXTRA: 'private' },
    { VITE_biblia_api_key: 'private' },
    { VITE_OTHER_API_KEY: 'private' },
    { VITE_OTHER_SECRET: 'private' },
    { VITE_OTHER_SERVICE_ROLE: 'private' },
  ]) assert.throws(() => assertNoPublicApiKeys(env), /Unsafe public secret/);
});

test('static prompt prefix is stable across transcript and app-state changes', () => {
  const builder = o => `${o.knowledge}\n${o.flowOrder}\n${o.transcriptReferenceBlock}\n${o.sectionKey}\n${o.copilotContextJson}\n${o.recentTranscript}`;
  const options = { knowledge: 'rules', flowOrder: 'script', transcriptReferenceBlock: 'RAG', sectionKey: 'one', copilotContextJson: '{"checked":false}', recentTranscript: 'old' };
  const first = buildCachedPrompt(builder, options);
  const second = buildCachedPrompt(builder, { ...options, sectionKey: 'two', copilotContextJson: '{"checked":true}', recentTranscript: 'new' });
  assert.equal(first.system, second.system);
  assert.notDeepEqual(first.contextMessages, second.contextMessages);
  const prompt = buildClassificationPrompt({ intents: ALL_INTENTS, segment: { text: 'volatile transcript' }, context: {} });
  assert.ok(prompt.indexOf(ALL_INTENTS.at(-1).intent_code) < prompt.indexOf('volatile transcript'));
  assert.equal(classificationFormat.json_schema.schema.properties.detections.items.properties.intent_code.enum.length, 167);
});

test('Supabase telemetry preserves tenant, token columns, and shadow outputs', async () => {
  let inserted;
  const runtime = llmRuntime({ from(table) { assert.equal(table, 'usage_records'); return { async insert(row) { inserted = row; return {}; } }; } }, 'tenant', { waitUntil() {} }, { endpoint: 'coach' });
  await runtime.telemetry({ model: 'gpt-5.6-terra', engine_name: 'ACA', prompt_tokens: 100, cached_tokens: 80, completion_tokens: 30, reasoning_tokens: 10, fallback_used: true, original_error_code: '500', metadata: {} });
  assert.equal(inserted.tenant_id, 'tenant');
  assert.equal(inserted.record_type, 'llm_tokens');
  assert.equal(inserted.quantity, 130);
  assert.equal(inserted.fallback_used, true);
  assert.equal(inserted.metadata.endpoint, 'coach');
});

test('classifier passes the strict schema and aborts scoring on unavailable evidence', async () => {
  let receivedFormat;
  const diarized = [{ text: 'Thank you for calling', speaker: 'agent', start_ms: 0, end_ms: 1000 }];
  const result = await classifyCall({ diarized, callContext: {}, callLLM: async (_system, _user, options) => {
    receivedFormat = options.response_format;
    return JSON.stringify({ detections: [], risk_indicators: [], sentiment: { agent: 'professional', beneficiary: 'engaged' } });
  } });
  assert.equal(receivedFormat, classificationFormat);
  assert.equal(result.detections.length, 167);
  await assert.rejects(classifyCall({ diarized, callContext: {}, callLLM: async () => { throw new Error('unavailable'); } }), /unavailable/);
});
