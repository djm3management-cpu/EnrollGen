export const coachingFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'live_coaching', strict: true,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['level', 'issue_tag', 'confidence', 'message'],
      properties: {
        level: { type: 'string', enum: ['silent', 'info', 'tip', 'remind', 'warn', 'critical'] },
        issue_tag: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        message: { type: 'string' },
      },
    },
  },
};
