import { ALL_INTENTS } from '../../../compliance/intents/index.js';

const string = { type: 'string' };
const boolean = { type: 'boolean' };
const strings = { type: 'array', items: string };
const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const format = (name, schema) => ({ type: 'json_schema', json_schema: { name, strict: true, schema } });
const score = { type: 'number', minimum: 1, maximum: 10 };

// Derive the enum from the complete intent catalog so additions cannot silently drift.
export const classificationFormat = format('compliance_intents', object({
  detections: { type: 'array', items: object({
    intent_code: { type: 'string', enum: ALL_INTENTS.map(i => i.intent_code) },
    detected: boolean,
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    speaker: { type: 'string', enum: ['agent', 'beneficiary', 'unknown'] },
    evidence_text: string, reasoning: string, anti_pattern: boolean,
    anti_pattern_detail: { type: ['string', 'null'] },
    sequence_position: { type: ['integer', 'null'], minimum: 0 },
  }) },
  risk_indicators: strings,
  sentiment: object({ agent: string, beneficiary: string }),
}));

export const assessmentFormat = format('call_assessment', object({
  agent: object({
    rapport_score: score, rapport_notes: string, listening_score: score, listening_notes: string,
    product_knowledge_score: score, product_knowledge_notes: string, missed_opportunities: strings,
    audit_risk_flags: strings, top_coaching_priority: string,
  }),
  beneficiary: object({
    engagement_score: score, confusion_indicators: strings, competing_plan_mentioned: boolean,
    disenrollment_risk: { type: 'string', enum: ['low', 'medium', 'high'] },
    disenrollment_risk_reason: string,
    recommended_followup_days: { type: 'integer', minimum: 14, maximum: 60 },
  }),
}));
