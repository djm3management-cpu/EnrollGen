import OpenAI from 'openai';
import type { Adapter, Completion, CompletionRequest, Json } from './types.ts';

export function toResponsesRequest(request: CompletionRequest, model: string): Json {
  const system = typeof request.system === 'string' ? request.system : request.system.map(b => b.text || '').join('\n');
  // Cache hits depend on exact prefix stability. Never sort chronological turns/tool results.
  const hasCachePrefix = Array.isArray(request.system) && request.system.some(b => b.cache_prefix === true);
  const input: Json[] = [{ role: 'developer', content: hasCachePrefix
    ? (request.system as Json[]).map(b => ({ type: 'input_text', text: b.text || '',
      ...(b.cache_prefix === true ? { prompt_cache_breakpoint: { mode: 'explicit' } } : {}),
    })) : system }];
  for (const message of [...(request.static_messages || []), ...request.messages]) {
    if (message.role === 'tool') {
      input.push({ type: 'function_call_output', call_id: message.tool_call_id, output: String(message.content) });
      continue;
    }
    const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content || [];
    for (const block of blocks) {
      if (block.type === 'text') input.push({ role: message.role === 'system' ? 'developer' : message.role, content: block.text });
      else if (block.type === 'tool_use') input.push({ type: 'function_call', call_id: block.id, name: block.name, arguments: JSON.stringify(block.input) });
      else if (block.type === 'tool_result') input.push({ type: 'function_call_output', call_id: block.tool_use_id, output: typeof block.content === 'string' ? block.content : JSON.stringify(block.content) });
      else throw Object.assign(new Error(`Unsupported LLM content block: ${block.type}`), { status: 400 });
    }
    for (const call of message.tool_calls || []) input.push({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments });
  }
  const body: Json = {
    model, input, store: false,
    reasoning: { effort: request.path === 'summary' ? 'medium' : 'low' },
    // max_completion_tokens is the shared interface; Responses calls this max_output_tokens.
    max_output_tokens: request.max_completion_tokens ?? (request.path === 'summary' ? 16384 : 2048),
  };
  // Only the live builders opt in. Classifier/summary request bodies stay unchanged.
  if (hasCachePrefix) body.prompt_cache_options = { mode: 'explicit' };
  if (request.tools?.length) body.tools = request.tools.map(tool => ({
    type: 'function', name: tool.function?.name || tool.name,
    description: tool.function?.description || tool.description,
    parameters: tool.function?.parameters || tool.input_schema,
    strict: tool.function?.strict ?? false,
  }));
  if (request.tool_choice) {
    const choice = request.tool_choice;
    body.tool_choice = typeof choice === 'string' ? choice
      : choice.type === 'tool' ? { type: 'function', name: choice.name }
      : choice.type === 'any' ? 'required' : choice.type;
  }
  if (request.response_format) body.text = { format: { type: 'json_schema', ...request.response_format.json_schema } };
  return body;
}

export function normalizeResponse(response: Json): Completion {
  const content: Json[] = [];
  const tool_calls: Json[] = [];
  for (const item of response.output || []) {
    if (item.type === 'message') for (const block of item.content || []) {
      if (block.type === 'output_text') content.push({ type: 'text', text: block.text });
      if (block.type === 'refusal') content.push({ type: 'refusal', refusal: block.refusal });
    }
    if (item.type === 'function_call') {
      content.push({ type: 'tool_use', id: item.call_id, name: item.name, input: JSON.parse(item.arguments) });
      tool_calls.push({ id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments } });
    }
  }
  const usage = response.usage || {};
  return {
    id: response.id, model: response.model, content, tool_calls,
    stop_reason: response.status === 'incomplete' ? 'max_tokens' : tool_calls.length ? 'tool_use' : 'end_turn',
    usage: { input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0,
      cached_tokens: usage.input_tokens_details?.cached_tokens || 0,
      reasoning_tokens: usage.output_tokens_details?.reasoning_tokens || 0 },
  };
}

// Emit the Anthropic event envelope retained by existing streaming consumers.
export async function* mapResponsesStream(events: AsyncIterable<Json>): AsyncGenerator<Json> {
  const indices = new Map<string, number>();
  let nextIndex = 0;
  let completed = false;
  for await (const event of events) {
    if (event.type === 'response.created') yield { type: 'message_start', message: { ...normalizeResponse({ ...event.response, output: [] }), type: 'message', role: 'assistant' } };
    if (event.type === 'response.content_part.added' && event.part.type === 'output_text') {
      const index = nextIndex++;
      indices.set(`${event.output_index}:${event.content_index}`, index);
      yield { type: 'content_block_start', index, content_block: { type: 'text', text: '' } };
    }
    if (event.type === 'response.output_text.delta') yield {
      type: 'content_block_delta', index: indices.get(`${event.output_index}:${event.content_index}`),
      delta: { type: 'text_delta', text: event.delta },
    };
    if (event.type === 'response.content_part.done' && event.part.type === 'output_text') yield { type: 'content_block_stop', index: indices.get(`${event.output_index}:${event.content_index}`) };
    if (event.type === 'response.output_item.added' && event.item.type === 'function_call') {
      const index = nextIndex++;
      indices.set(event.item.id, index);
      yield { type: 'content_block_start', index, content_block: { type: 'tool_use', id: event.item.call_id, name: event.item.name, input: {} } };
    }
    if (event.type === 'response.function_call_arguments.delta') yield {
      type: 'content_block_delta', index: indices.get(event.item_id), delta: { type: 'input_json_delta', partial_json: event.delta },
    };
    if (event.type === 'response.output_item.done' && event.item.type === 'function_call') yield { type: 'content_block_stop', index: indices.get(event.item.id) };
    if (event.type === 'response.completed' || event.type === 'response.incomplete') {
      completed = true;
      const result = normalizeResponse(event.response);
      yield { type: 'message_delta', delta: { stop_reason: result.stop_reason, stop_sequence: null }, usage: result.usage };
      yield { type: 'message_stop', completion: result };
    }
    if (event.type === 'error' || event.type === 'response.failed') {
      const error = event.error || event.response?.error || event;
      const status = error.code === 'rate_limit_exceeded' ? 429 : ['server_error', 'internal_error'].includes(error.code) ? 500 : 400;
      throw Object.assign(new Error('LLM stream failed'), { status, code: error.code });
    }
  }
  if (!completed) throw Object.assign(new Error('LLM stream ended prematurely'), { code: 'ETIMEDOUT' });
}

export function createOpenAIAdapter(env: Record<string, string | undefined>, fetchImpl?: typeof fetch): Adapter {
  const client = () => new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0, fetch: fetchImpl });
  return {
    async complete(request, model, signal) {
      const response = await client().responses.create(toResponsesRequest(request, model) as any, { signal });
      return normalizeResponse(response);
    },
    async *stream(request, model, signal) {
      const events = await client().responses.create({ ...toResponsesRequest(request, model), stream: true } as any, { signal });
      yield* mapResponsesStream(events as unknown as AsyncIterable<Json>);
    },
  };
}
