// Manual checklist. Run against a staging Twilio number and inspect inbound_calls/telephony_events.
export const scenarios = [
  ['all busy + new caller', 'reject busy; no answer, no voicemail'],
  ['all busy + known caller', 'voicemail'],
  ['two simultaneous new calls + one idle agent', 'one route, one reject busy'],
  ['vendor pause on', 'availability count 0'],
  ['outside staffed hours', 'availability count 0'],
];
console.table(scenarios.map(([scenario, expected]) => ({ scenario, expected })));
