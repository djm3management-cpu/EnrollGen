// Screener providers (spec sections 3.10 and 13; session S7). A provider only
// classifies a caller's answer into a closed label; it never produces words
// for the caller. 'scripted' is the only implementation: a small OpenAI model
// named by SCREENER_OPENAI_MODEL, a strict JSON schema response and a 3 second
// timeout. 'conversational' is a slot that is not available. Transcripts pass
// through memory only and are never logged or returned.

export const YES_NO_LABELS = Object.freeze(['yes', 'no', 'unclear']);
export const REASON_LABELS = Object.freeze(['plan_review', 'new_enrollment', 'benefits_question',
  'allowance_or_card', 'current_plan_service', 'not_medicare', 'other']);
export const MODEL_TIMEOUT_MS = 3000;
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export class ScreenerProviderError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/** The approved small OpenAI model from the environment. There is no default. */
export function resolveScreenerModel(env = process.env) {
  const model = env.SCREENER_OPENAI_MODEL?.trim();
  if (!model) throw new ScreenerProviderError('model_setting_required');
  return model;
}

/** True only when the scripted provider has a model and a key configured. */
export function screenerConfigured(env = process.env) {
  return Boolean(env.SCREENER_OPENAI_MODEL?.trim() && env.OPENAI_API_KEY?.trim());
}

const INSTRUCTIONS = {
  medicare: 'Classify whether the caller confirmed they are on Medicare now or turning 65 within a few months. ' +
    'Return yes, no, or unclear when the answer does not say.',
  connect: 'Classify whether the caller agreed to be connected to a licensed agent now. ' +
    'Return yes, no, or unclear when the answer does not say.',
  reason: 'Classify why the caller is calling about Medicare coverage into one label: plan_review, new_enrollment, ' +
    'benefits_question, allowance_or_card, current_plan_service (questions about a plan they already have, such as ' +
    'claims or member services), not_medicare, or other.',
  zip: 'Extract the caller\'s five digit US ZIP code from the answer. Return an empty string when no complete ' +
    'five digit ZIP code is present.',
};

function schemaFor(question) {
  const label = question === 'reason' ? { type: 'string', enum: [...REASON_LABELS] }
    : question === 'zip' ? { type: 'string' } : { type: 'string', enum: [...YES_NO_LABELS] };
  const name = question === 'zip' ? 'zip' : 'label';
  return { name: `screener_${question}`, strict: true, schema: { type: 'object', additionalProperties: false,
    required: [name, 'confidence'], properties: { [name]: label, confidence: { type: 'number' } } } };
}

function parsed(question, body) {
  const content = body?.choices?.[0]?.message?.content;
  let value;
  try { value = JSON.parse(content); } catch { throw new ScreenerProviderError('model_error'); }
  const confidence = Number(value?.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new ScreenerProviderError('model_error');
  if (question === 'zip') {
    if (value.zip === '') return { label: null, confidence };
    if (typeof value.zip !== 'string' || !/^\d{5}$/.test(value.zip)) throw new ScreenerProviderError('model_error');
    return { label: value.zip, confidence };
  }
  const allowed = question === 'reason' ? REASON_LABELS : YES_NO_LABELS;
  if (!allowed.includes(value?.label)) throw new ScreenerProviderError('model_error');
  return { label: value.label, confidence };
}

/**
 * The scripted provider. classify({ question, transcript }) resolves to
 * { label, confidence } or rejects with code model_timeout or model_error.
 */
export function createScriptedProvider({ env = process.env, fetchImpl = globalThis.fetch,
  timeoutMs = MODEL_TIMEOUT_MS } = {}) {
  const model = resolveScreenerModel(env);
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) throw new ScreenerProviderError('model_setting_required');
  return Object.freeze({
    name: 'scripted',
    async classify({ question, transcript }) {
      if (!INSTRUCTIONS[question]) throw new ScreenerProviderError('model_error');
      const controller = new AbortController();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new ScreenerProviderError('model_timeout')); }, timeoutMs);
      });
      const request = (async () => {
        let response;
        try {
          response = await fetchImpl(OPENAI_URL, { method: 'POST', signal: controller.signal,
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, max_completion_tokens: 60, store: false,
              messages: [{ role: 'system', content: `${INSTRUCTIONS[question]} Never respond with any other text.` },
                { role: 'user', content: String(transcript || '').slice(0, 500) }],
              response_format: { type: 'json_schema', json_schema: schemaFor(question) } }) });
        } catch {
          throw new ScreenerProviderError(controller.signal.aborted ? 'model_timeout' : 'model_error');
        }
        if (!response?.ok) throw new ScreenerProviderError('model_error');
        let body;
        try { body = await response.json(); } catch { throw new ScreenerProviderError('model_error'); }
        return parsed(question, body);
      })();
      try { return await Promise.race([request, timeout]); }
      finally { clearTimeout(timer); request.catch(() => {}); }
    },
  });
}

/** The provider slot. Only 'scripted' exists; anything else is not available. */
export function screenerProvider(kind = 'scripted', deps = {}) {
  if (kind === 'scripted') return createScriptedProvider(deps);
  throw new ScreenerProviderError('not_available');
}
