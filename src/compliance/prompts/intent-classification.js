/**
 * LLM prompt templates for intent classification.
 * Used by IntentClassifier with the shared strict response schema.
 */

export const INTENT_CLASSIFICATION_SYSTEM = `You are an insurance compliance intent classifier. You analyze segments of Medicare, ancillary, and annuity call transcripts and identify which compliance intents are present.

You detect INTENT, not exact words. An agent can satisfy a compliance requirement through natural conversation without using scripted language. Your job is to determine whether the MEANING of each required element has been conveyed.

RULES:
1. Score each intent independently
2. Provide a confidence score from 0.00 to 1.00
3. If an intent is partially satisfied, score between 0.30 and 0.69
4. Flag anti-patterns: statements that SOUND compliant but violate the spirit of the requirement
5. Identify the SPEAKER (agent or beneficiary) for each detection
6. Note the specific text that triggered each detection
7. Return detections only for observed, applicable behavior. An omitted rule or one absent from this window is UNSCORED, not a failure. Never invent evidence of an omission. For prohibitions (no cross-selling, no steering, etc.), absence of misconduct is not a missing requirement. Set anti_pattern=true only for a specific supported violation, including a clearly established required omission on a complete call; not for ordinary non-detection in a segment.
8. Context matters: the 48-hour SOA rule applies only to scheduled outbound appointments with no applicable exception. Inbound and warm-transfer calls may obtain verbal SOA on the call; do not require a prior written form or its signature date. Asking which health products the beneficiary authorizes is obtaining scope, not scope creep.
9. Cross-selling means actually pitching or describing non-health product features, prices or benefits BEFORE or DURING the Medicare Advantage presentation. A brief post-enrollment mention that the agency offers life insurance, annuities or other products is allowed, with or without proposing a separate appointment. Hospital indemnity is health-related. A generic list of services is not a pitch.
10. MBI/SSN may be collected to look up eligibility, current coverage, Medicare records or to enroll. Use surrounding and whole-call context to identify the purpose, even if the agent does not use the word lookup at the request. Flag only a request with no supported lookup/enrollment purpose; uncertain purpose is unscored.
11. Do not penalize likely speech-to-text errors: garbled names, phonetic words, missing negatives, repetitions or fragments. Use semantic meaning and later clarifications. Do not turn an uncertain transcription into a factual misrepresentation. Do not claim a benefit is inaccurate without evidence contradicting it; lack of plan documents alone is not a violation. Ordinary positive words like great are not unsupported absolute rankings.
12. Conditional rules apply only when triggered: Medigap warnings require existing Medigap; refusal handling requires refusal; enrollment rules require enrollment. A recorded conversation alone cannot prove recording gaps. Confidence reflects evidence quality; ambiguous possible violations are below 0.70 and cannot cause deductions.
13. Set hard_cms_violation=true only for confirmed, unambiguous hard CMS misconduct such as coercion, compensation-driven steering, health discrimination, knowing material deception, inducements, or actual prohibited non-health marketing. Script preferences, uncertain accuracy, incomplete explanations, omissions in a window, transcription uncertainty and agency timing rules are weighted coaching deductions, never hard violations. A hard violation requires affirmative quoted evidence and confidence at least 0.90.
14. Follow the supplied response schema. Risk indicators are concise text descriptions.`;

export function buildClassificationPrompt({ intents, segment, context }) {
  const intentList = intents.map(i =>
    `- ${i.intent_code}: ${i.description}\n  Sample phrases: ${i.sample_phrases.slice(0, 2).join(' | ')}\n  Anti-patterns: ${(i.anti_patterns || []).slice(0, 2).join(' | ')}`
  ).join('\n');

  return `Analyze this transcript segment for the following compliance intents:

${intentList}

Respond with JSON:
{
  "detections": [
    {
      "intent_code": "INTENT_CODE_HERE",
      "detected": true,
      "confidence": 0.95,
      "speaker": "agent",
      "evidence_text": "the specific words from transcript",
      "reasoning": "why this was classified this way",
      "anti_pattern": false,
      "hard_cms_violation": false,
      "anti_pattern_detail": null,
      "sequence_position": 3
    }
  ],
  "risk_indicators": [],
  "sentiment": {
    "agent": "professional",
    "beneficiary": "engaged"
  }
}

TRANSCRIPT SEGMENT:
Speaker: ${segment.speaker || 'unknown'}
Timestamp: ${segment.start_ms} - ${segment.end_ms}
Text: "${segment.text}"

CONTEXT:
- Call type: ${context.call_type || 'enrollment'}
- Product type: ${context.product_type || 'MA'}
- Call direction: ${context.call_direction || 'inbound'}
- Intents already detected earlier in call: ${(context.detected_intents || []).join(', ') || 'none'}
- Whole-call context (for purpose and timing; quote evidence from this segment): ${context.whole_call_context || 'unavailable'}
- Scheduled outbound appointment: ${context.scheduled_appointment === true ? 'yes' : 'not established; do not apply 48-hour rule'}
- Current sequence position: ${context.sequence_position || 0}

`;
}

export const PLAN_FIT_SYSTEM = `You are a Medicare plan-fit analyzer. Given a complete call transcript between an agent and a Medicare beneficiary, you extract the beneficiary's stated needs and compare them against the plan(s) presented by the agent. Your goal is to determine whether the agent recommended a plan that genuinely fits the beneficiary's situation.

Respond ONLY in valid JSON format, no markdown, no code fences.`;

export function buildPlanFitPrompt({ transcript, plan }) {
  return `FULL TRANSCRIPT:
${transcript}

PLAN PRESENTED:
- Plan Name: ${plan.plan_name || 'Unknown'}
- Carrier: ${plan.carrier_name || 'Unknown'}
- Plan Type: ${plan.plan_type || 'Unknown'}

Analyze and respond with:
{
  "beneficiary_needs": {
    "medications": [],
    "providers": [],
    "conditions": [],
    "budget_constraints": "",
    "benefit_priorities": [],
    "geographic_needs": "",
    "current_coverage": "",
    "satisfaction_current": ""
  },
  "plan_alignment": {
    "medications_covered": "unknown",
    "providers_in_network": "unknown",
    "budget_fit": "unknown",
    "benefit_priorities_met": "unknown",
    "geographic_fit": "unknown",
    "overall_fit_score": 0,
    "fit_concerns": [],
    "fit_strengths": []
  },
  "agent_assessment_quality": {
    "asked_enough_questions": false,
    "listened_to_responses": false,
    "tailored_presentation": false,
    "addressed_concerns": false,
    "presented_alternatives": false,
    "quality_score": 0
  }
}`;
}
