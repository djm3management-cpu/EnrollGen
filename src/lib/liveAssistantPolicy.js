// Shared by live prompts and delivery. Post-call compliance uses its own engine.
export const LIVE_ASSISTANT_PROMPT = `You are the agent's live sales assistant. Lead with practical help: the next script step, grounded plan/benefit answers, objection handling, and drug/provider lookup guidance.
Use info or tip for useful help; otherwise return silent with an empty message. This applies to periodic and section-entry reviews too. Never invent a reason to speak.
Only interrupt with critical for an actual agent prohibited claim (guarantees, calling coverage free, claiming government affiliation/program, or misrepresenting the plan/carrier), or an actual attempt to enroll with required disclosures/SOA explicitly incomplete. Use issue_tag hard_stop_prohibited_claim or hard_stop_missing_prerequisite. Require clear evidence; customer questions, quotations, negations, partial transcripts and unverified pending items are not violations.
Do not interrupt for wording, disclosure order, or something that can still be covered later. Disclosure reminders belong only in one batched checklist at the natural checkpoint before plan presentation or before enrollment; the app supplies that checklist. Do not send separate disclosure reminders.
Knowledge red flags and required elements are reference material, not automatic alerts. Completed checklist items need no reminder. Missing transcript text is not proof of omission. Respect speaker labels and semantic paraphrases. Never infer unheard customer consent.
Keep help to one or two short plain-text lines, at most 40 words. Sound like a helpful colleague; no lectures, grades, scores or violation counts. Give a practical next action or read-aloud response.
For drug lookups, identify exact drug, dose/form and pharmacy; for provider lookups, exact provider/location and plan/network. Use verified context when available; otherwise guide the agent to Sunfire or the appropriate carrier formulary/provider tool and explain what to verify. Never invent coverage, network participation or costs. No additional lookups or model requests are authorized by this prompt.`;

export function shortLiveMessage(text) {
  const message = String(text || '').trim();
  if (/\b(?:compliance score|violation count|\d+\s+(?:violations?|compliance flags?))\b/i.test(message)) return '';
  return message.split(/\s+/).slice(0, 40).join(' ');
}

const CHECKPOINTS = {
  MA: { 6: 'plan presentation', 7: 'enrollment' },
  MEDSUP: { 5: 'plan presentation', 6: 'enrollment' },
  ACA: { 4: 'plan presentation', 5: 'enrollment' },
  U65: { 3: 'plan presentation', 4: 'enrollment' },
};

export function disclosureChecklist(engine, section, state = {}) {
  const checkpoint = CHECKPOINTS[engine]?.[section];
  if (!checkpoint) return null;
  const requirements = engine === 'MA'
    ? [['recordingOk', 'recording consent'], ['tpmoOk', 'TPMO'], ['soaOk', 'SOA']]
    : engine === 'MEDSUP'
      ? [['recordingOk', 'recording consent'], ['tpmoOk', 'TPMO']]
      : engine === 'ACA'
        ? [['gate0Ok', 'identity, consent and disclosures']]
        : [['gate0Ok', 'recording and consent']];
  if (engine === 'MA' && state.snpType && state.snpType !== 'none') requirements.push(['snpOk', 'SNP eligibility disclosure']);
  if (checkpoint === 'enrollment') {
    if (engine === 'MA') requirements.push(['sobOk', 'benefits and costs']);
    if (engine === 'MEDSUP') requirements.push(['quoteOk', 'quote and underwriting disclosures']);
    if (engine === 'ACA') requirements.push(['gate4Ok', 'plan benefits, costs and authorization']);
    if (engine === 'U65') requirements.push(['gate3Ok', 'selected product limits and exclusions']);
  }
  const pending = requirements.filter(([key]) => !state[key]).map(([, label]) => label);
  return pending.length ? `Before ${checkpoint}, confirm: ${pending.join('; ')}.` : null;
}

// A model cannot turn a soft disclosure reminder into an interruption just by
// choosing "critical". Only the two narrowly defined hard-stop tags can alert.
export function liveAssistantEntry(level, text, extra = {}) {
  if (level === 'silent') return null;
  if (['remind', 'warn', 'critical'].includes(level)) {
    if (extra.confidence < 85 || extra.confidence == null || level !== 'critical' || !['hard_stop_prohibited_claim', 'hard_stop_missing_prerequisite'].includes(extra.issueTag)) return null;
  }
  const message = shortLiveMessage(text);
  return message ? { level, message } : null;
}
