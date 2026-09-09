import { Ajv } from 'ajv';
import type { Completion, CompletionRequest, Json } from './types.ts';

const ajv = new Ajv({ allErrors: true, strict: false });
export function validateCompletion(result: Completion, request: CompletionRequest): Completion {
  if (!result.content.length || result.content.some(b => b.type === 'refusal')) {
    throw Object.assign(new Error('LLM response is empty or refused'), { status: 422, code: 'refusal_or_empty', completion: result });
  }
  if (!request.response_format || result.tool_calls.length) return result;
  try {
    const parsed = JSON.parse(result.content.filter(b => b.type === 'text').map(b => b.text).join(''));
    const validate = ajv.compile(request.response_format.json_schema.schema);
    if (!validate(parsed)) throw new Error(ajv.errorsText(validate.errors));
    if (result.stop_reason === 'max_tokens') throw new Error('Incomplete structured output');
    result.parsed = parsed as Json;
    return result;
  } catch {
    // A schema/refusal failure is not transient and must never trigger model fallback.
    throw Object.assign(new Error('LLM output failed strict schema validation'), { status: 422, code: 'schema_validation', completion: result });
  }
}
