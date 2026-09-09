import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import type { Adapter, CompletionRequest, Completion, Json } from './types.ts';

export function toAnthropicRequest(request: CompletionRequest, model: string): Json {
  const body: Json = {
    model, system: typeof request.system === 'string' ? request.system : request.system.map(({ cache_prefix, ...block }) => ({
      ...block, ...(cache_prefix === true ? { cache_control: { type: 'ephemeral' } } : {}),
    })),
    max_tokens: request.max_completion_tokens ?? (request.path === 'summary' ? 16384 : 2048),
    messages: [...(request.static_messages || []), ...request.messages].map(message => {
      if (message.role === 'tool') return { role: 'user', content: [{ type: 'tool_result', tool_use_id: message.tool_call_id, content: message.content }] };
      if (!message.tool_calls) return message;
      return { role: message.role, content: [
        ...(typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content || []),
        ...message.tool_calls.map((call: Json) => ({ type: 'tool_use', id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments) })),
      ] };
    }),
  };
  if (request.tools) body.tools = request.tools.map(tool => tool.function ? { name: tool.function.name, description: tool.function.description, input_schema: tool.function.parameters } : tool);
  if (request.tool_choice) body.tool_choice = typeof request.tool_choice === 'string' ? { type: request.tool_choice === 'required' ? 'any' : request.tool_choice } : request.tool_choice;
  // Claude's supported schema subset omits numeric bounds. Its official helper moves
  // those constraints into descriptions; validateCompletion still enforces the original.
  if (request.response_format) body.output_config = { format: jsonSchemaOutputFormat(request.response_format.json_schema.schema as any) };
  return body;
}

export function normalizeAnthropic(response: Json): Completion {
  const usage = response.usage || {};
  return {
    id: response.id, model: response.model, content: response.content || [], stop_reason: response.stop_reason,
    tool_calls: (response.content || []).filter((b: Json) => b.type === 'tool_use').map((b: Json) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input) } })),
    usage: {
      input_tokens: (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0),
      output_tokens: usage.output_tokens || 0, cached_tokens: usage.cache_read_input_tokens || 0, reasoning_tokens: 0,
    },
  };
}

export function createAnthropicAdapter(env: Record<string, string | undefined>, fetchImpl?: typeof fetch): Adapter {
  const client = () => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0, fetch: fetchImpl });
  return {
    async complete(request, model, signal) {
      return normalizeAnthropic(await client().messages.create(toAnthropicRequest(request, model) as any, { signal }));
    },
    async *stream(request, model, signal) {
      const stream = client().messages.stream(toAnthropicRequest(request, model) as any, { signal });
      for await (const event of stream) if (event.type !== 'message_stop') yield event;
      yield { type: 'message_stop', completion: normalizeAnthropic(await stream.finalMessage()) };
    },
  };
}
