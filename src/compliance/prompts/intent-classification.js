/**
 * LLM prompt templates for intent classification.
 * Used by IntentClassifier to send transcript segments to Claude Sonnet.
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
7. Respond ONLY in valid JSON format, no markdown, no code fences`;

export function buildClassificationPrompt({ intents, segment, context }) {
  const intentList = intents.map(i =>
    `- ${i.intent_code}: ${i.description}\n  Sample phrases: ${i.sample_phrases.slice(0, 2).join(' | ')}\n  Anti-patterns: ${(i.anti_patterns || []).slice(0, 2).join(' | ')}`
  ).join('\n');

  return `Analyze this transcript segment for the following compliance intents:

${intentList}

TRANSCRIPT SEGMENT:
Speaker: ${segment.speaker || 'unknown'}
Timestamp: ${segment.start_ms} - ${segment.end_ms}
Text: "${segment.text}"

CONTEXT:
- Call type: ${context.call_type || 'enrollment'}
- Product type: ${context.product_type || 'MA'}
- Call direction: ${context.call_direction || 'inbound'}
- Intents already detected earlier in call: ${(context.detected_intents || []).join(', ') || 'none'}
- Current sequence position: ${context.sequence_position || 0}

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
      "anti_pattern_detail": null,
      "sequence_position": 3
    }
  ],
  "risk_indicators": [],
  "sentiment": {
    "agent": "professional",
    "beneficiary": "engaged"
  }
}`;
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
