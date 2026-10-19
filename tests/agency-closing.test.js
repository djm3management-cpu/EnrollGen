import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENCY_CLOSING } from '../src/data/agencyClosing.js';
import { MA_SCRIPT_SECTIONS, resolveMASections } from '../src/data/maScript2027.js';
import { MEDSUP_SECTIONS, resolveMedSupClosing } from '../src/context/MedSupScript.js';
import { MEDSUP_COMPLIANCE_KNOWLEDGE } from '../src/data/medSupComplianceKnowledge.js';
import { getMAScriptView } from '../src/lib/maScriptFlow.js';
import { initialState } from '../src/context/scriptReducer.js';
import { normalizeApprovedClosingDetection } from '../src/compliance/shared/approvedClosing.js';
import { scoreCall } from '../src/compliance/engine/ScoringEngine.js';
import { classifyCall } from '../src/compliance/engine/IntentClassifier.js';
import { engineBuilders, promptOptions } from './helpers/copilotPrompts.js';

const code = 'CONDUCT_001_NO_CROSS_SELLING';
const closing = "Thank you for calling New Gen Health Solutions. If you're ever interested, we'd be happy to set up a separate time to review other coverage options with you. You can reach us at (609) 806-5996, Monday through Friday, 10 AM to 6 PM. Have a great day!";
const fragment = "If you're ever interested, we'd be happy to set up a separate time to review other coverage options with you.";
const pitch = 'Before we review Medicare Advantage, our life insurance pays your family $50,000 for just $25 a month.';
const detection = (text = closing, patch = {}) => ({ intent_code: code,
  detected: true, confidence: 0.99, transcript_segment: text,
  anti_pattern_match: true, hard_cms_violation: true, detection_method: 'cms_hard_violation',
  anti_pattern_detail: 'Cross-selling', sequence_violation: true, ...patch });
const score = (detections, intentCode = code) => scoreCall({ detections,
  template: { passing_threshold: 85 }, templateItems: [{ id: intentCode, intent_code: intentCode,
    question_text: 'No cross-selling', category: 'conduct', points_possible: 10, is_auto_fail: true }] });

test('MA, shared PDP flow and Med Supp end with the exact closing and agency number', () => {
  assert.equal(AGENCY_CLOSING, closing);
  const wrap = MA_SCRIPT_SECTIONS.at(-1);
  assert.ok(wrap.body.endsWith(closing));
  for (const planKind of ['mapd', 'pdp']) {
    const state = { ...structuredClone(initialState), maAnswers: { sob: { planKind } } };
    const view = getMAScriptView(wrap, state);
    assert.ok(view.items.at(-1).text.endsWith(closing));
  }
  assert.equal(MEDSUP_SECTIONS.at(-1).script.at(-1), closing);
  assert.equal(MEDSUP_COMPLIANCE_KNOWLEDGE['Wrap Up'].verbatimScript.at(-1), closing);
  const stale = MA_SCRIPT_SECTIONS.map(section => ({ ...section, revision: 'sms-2027-2026-09-29' }));
  assert.equal(resolveMASections(stale), MA_SCRIPT_SECTIONS);
});

test('saved Med Supp templates gain the closing without overwriting custom text or duplicating it', () => {
  const saved = [{ key: 'custom', gate_field: 'wrapOk', body: 'Custom recap and next steps.', sort_order: 7 }];
  const resolved = resolveMedSupClosing(saved);
  assert.equal(resolved[0].body, `Custom recap and next steps.\n\n${closing}`);
  assert.deepEqual(resolveMedSupClosing(resolved), resolved);
  assert.equal(saved[0].body, 'Custom recap and next steps.');
  const missingWrap = resolveMedSupClosing([{ key: 'intro', body: 'Custom introduction.', sort_order: 1 }]);
  assert.equal(missingWrap.at(-1).gate_field, 'wrapOk');
  assert.ok(missingWrap.at(-1).body.endsWith(closing));
});

test('approved closing cannot cause cross-sell or scope deductions, including spurious hard flags', () => {
  for (const intentCode of [code, 'CONDUCT_005_NO_SCOPE_CREEP', 'SOA_005_SOA_SCOPE_MATCH', 'SOA_006_SOA_SCOPE_VIOLATION']) {
    const result = score([detection(closing, { intent_code: intentCode })], intentCode);
    assert.equal(result.overall_score, 100);
    assert.equal(result.auto_fail_triggered, false);
    assert.equal(result.scorecard_items[0].result, 'pass');
    assert.deepEqual(result.risk_flags, []);
    assert.equal(result.sequence_violations, 0);
  }
  const redacted = closing.replace('(609) 806-5996', '[PHONE_REDACTED]').replaceAll("'", '’');
  assert.equal(score([detection(`[agent]: “${redacted}”`)]).overall_score, 100);
  // Unrelated requirements retain their own evidence and scoring.
  const other = detection(closing, { intent_code: 'ENROLL_012_NO_INCENTIVES_OFFERED' });
  assert.equal(normalizeApprovedClosingDetection(other), other);
});

test('closing exception never hides a separate pitch, even one with lower confidence', () => {
  for (const detections of [
    [detection(), detection(pitch, { confidence: 0.95, sequence_violation: false })],
    [detection(pitch, { confidence: 0.95, sequence_violation: false }), detection()],
    [detection(`${pitch} ${closing}`, { sequence_violation: false })],
  ]) {
    const result = score(detections);
    assert.equal(result.overall_score, 0);
    assert.equal(result.auto_fail_triggered, true);
    assert.equal(result.scorecard_items[0].result, 'fail');
  }
  const partial = detection(fragment);
  assert.equal(normalizeApprovedClosingDetection(partial), partial);
  assert.equal(normalizeApprovedClosingDetection(partial, closing).anti_pattern_match, false);
  const actualPitch = detection(pitch);
  assert.equal(normalizeApprovedClosingDetection(actualPitch, `${pitch} ${closing}`), actualPitch);
});

async function classifyMock(evidence) {
  return classifyCall({ callContext: { call_direction: 'inbound' },
    diarized: [{ speaker: 'agent', text: pitch, start_ms: 0, end_ms: 10000 },
      { speaker: 'agent', text: closing, start_ms: 170000, end_ms: 180000 }],
    callLLM: async system => {
      assert.ok(system.includes(closing));
      return { detections: evidence.map(evidence_text => ({ intent_code: code,
        detected: true, confidence: evidence_text === pitch ? 0.95 : 0.99,
        speaker: 'agent', evidence_text, anti_pattern: true, hard_cms_violation: true,
        anti_pattern_detail: 'Cross-selling' })) };
    } });
}

test('classifier normalizes quoted closing fragments before merging; mock only, no API calls', async () => {
  const allowed = await classifyMock([fragment]);
  const found = allowed.detections.find(d => d.intent_code === code);
  assert.equal(found.detection_method, 'approved_agency_closing');
  assert.equal(found.anti_pattern_match, false);
  assert.equal(score(allowed.detections).overall_score, 100);
  for (const evidence of [[pitch, fragment], [fragment, pitch]]) {
    const actual = await classifyMock(evidence);
    assert.equal(actual.detections.find(d => d.intent_code === code).transcript_segment, pitch);
    assert.equal(score(actual.detections).auto_fail_triggered, true);
  }
});

test('MA/PDP and Med Supp live coaching and questions receive the approved closing guidance', () => {
  for (const engine of ['MA', 'MEDSUP']) {
    const builders = engineBuilders(engine);
    for (const name of ['buildCoachingSystemPrompt', 'buildAskSystemPrompt']) {
      const prompt = builders[name](promptOptions());
      assert.ok(prompt.staticPrefix.includes(closing));
      assert.ok(prompt.staticPrefix.includes('never flag this wording as cross-selling'));
    }
  }
});
