/** Repair one saved TPMO timing result without model calls.
 * Preview: node --env-file=.env.local scripts/post-call/repair-tpmo-timing.mjs --call-id UUID --output /tmp/tpmo-review.json
 * Apply: repeat with --baseline /tmp/tpmo-review.json --apply.
 * Requires migration 116. Original scorecard/evidence remain immutable.
 * Human-reviewed results are refused.
 */
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createSupabaseAdminClient } from '../sep-data/common.js';
import { applyTpmo2027Policy } from '../../src/compliance/engine/IntentClassifier.js';
import { scoreCall } from '../../src/compliance/engine/ScoringEngine.js';
import { MA_2027_POLICY_VERSION } from '../../src/compliance/shared/scoringPolicy.js';
import { isComplianceSale } from '../../src/lib/saleCompliance.js';

const checked = async query => {
  const { data, error } = await query;
  if (error) throw new Error(error.message || String(error));
  return data;
};
const transcriptSnapshot = call => ({ raw: call.transcript_raw ?? null,
  diarized: call.transcript_diarized ?? null, duration: call.call_duration_seconds ?? null });

export function previewTpmoRepair(snapshot) {
  const { call, card, detections, template, templateItems } = snapshot;
  if (call.id !== card.call_id || call.compliance_scorecard_id !== card.id) throw new Error('Snapshot is not the current scorecard.');
  if (template.policy_version !== MA_2027_POLICY_VERSION) throw new Error('Not a CY2027 MA scorecard.');
  if (card.reviewed || detections.some(d => d.manually_overridden)) throw new Error('Human-reviewed evidence must be retained.');
  if (!isComplianceSale(call.call_outcome)) throw new Error('Call is not a scored sale.');
  const before = scoreCall({ detections, templateItems, template });
  if (before.overall_score !== Number(card.overall_score) || before.auto_fail_triggered !== card.auto_fail_triggered ||
    before.total_points_earned !== Number(card.total_points_earned) || before.total_points_possible !== Number(card.total_points_possible)) {
    throw new Error('Saved evidence does not reproduce the original score.');
  }
  const revised = structuredClone(detections);
  const evaluation = applyTpmo2027Policy(revised, call.transcript_diarized || []);
  const oldTiming = before.scorecard_items.find(i => i.intent_code === 'CALL_OPEN_009_TPMO_TIMING_2027');
  if (!oldTiming?.auto_fail_triggered || (!evaluation.timingOk && !evaluation.timingUncertain)) {
    throw new Error('No supported false TPMO timing auto-fail to repair.');
  }
  const score = scoreCall({ detections: revised, templateItems, template });
  for (let i = 0; i < before.scorecard_items.length; i++) {
    if (!before.scorecard_items[i].intent_code?.includes('TPMO') &&
      JSON.stringify(before.scorecard_items[i]) !== JSON.stringify(score.scorecard_items[i])) {
      throw new Error('Repair changed a non-TPMO result.');
    }
  }
  return { detections: revised, score, summary: {
    call_id: call.id, original_scorecard_id: card.id, direction: call.call_direction,
    original_score: before.overall_score, original_grade: before.overall_grade,
    revised_score: score.overall_score, revised_grade: score.overall_grade,
    auto_fail: score.auto_fail_triggered, manual_review_required: evaluation.timingUncertain,
    disclosure_start_ms: (evaluation.timingUncertain ? evaluation.earlyDisclosure : evaluation.disclaimer)?.start_ms,
    first_benefit_ms: evaluation.firstBenefit?.start_ms, model_requests: 0,
  } };
}

export async function applyTpmoRepair(snapshot, db) {
  const preview = previewTpmoRepair(snapshot);
  if (!preview.summary.manual_review_required) throw new Error('This repair path is limited to uncertain early TPMO evidence.');
  const { call, card, template, templateItems } = snapshot;
  const live = await checked(db.from('call_records').select('*').eq('id', call.id).single());
  const liveCard = await checked(db.from('compliance_scorecards').select('*').eq('id', card.id).single());
  if (live.compliance_scorecard_id !== card.id || liveCard.reviewed ||
    JSON.stringify(transcriptSnapshot(live)) !== JSON.stringify(transcriptSnapshot(call)) ||
    live.call_direction !== call.call_direction || live.call_outcome !== call.call_outcome) {
    throw new Error('Call or review changed after preview; reload before applying.');
  }
  const currentEvidence = await checked(db.from('intent_detections').select('*').in('id', snapshot.detections.map(d => d.id)));
  if (currentEvidence.length !== snapshot.detections.length || currentEvidence.some(d =>
    JSON.stringify(d) !== JSON.stringify(snapshot.detections.find(old => old.id === d.id)))) {
    throw new Error('Evidence changed after preview; reload before applying.');
  }
  // A separate inactive template identity allows the existing atomic scoring
  // transaction to create a revision without altering the active template.
  const name = `${template.template_name} [TPMO evidence review 2026-10-27]`;
  let target = await checked(db.from('scoring_templates').select('*').eq('template_name', name).maybeSingle());
  if (!target) {
    const base = { ...template, id: randomUUID(), template_name: name, version: template.version + 1, is_active: false };
    delete base.created_at; delete base.updated_at;
    target = await checked(db.from('scoring_templates').insert(base).select('*').single());
  }
  let targetItems = await checked(db.from('scoring_template_items').select('*,compliance_intents(intent_code)').eq('template_id', target.id));
  const missing = templateItems.filter(i => !targetItems.some(t => t.intent_id === i.intent_id));
  if (missing.length) {
    await checked(db.from('scoring_template_items').insert(missing.map(i => {
      const row = { ...i, id: randomUUID(), template_id: target.id }; delete row.compliance_intents; return row;
    })));
    targetItems = await checked(db.from('scoring_template_items').select('*,compliance_intents(intent_code)').eq('template_id', target.id));
  }
  const detections = preview.detections.map(d => ({ ...d, id: randomUUID() }));
  const result = scoreCall({ detections, templateItems: targetItems, template: target });
  const { scorecard_items: items, corrective_bucket: bucket, ...scorecard } = result;
  const actions = result.corrective_actions_needed ? [{
    severity: result.risk_level, category: 'CALL_OPENING', bucket,
    title: 'Review early TPMO disclosure wording',
    description: result.coaching_notes.join('\n'), intent_codes: ['CALL_OPEN_009_TPMO_TIMING_2027'],
    evidence: items.filter(i => /manual review required/i.test(i.notes || '')).map(i => ({ text: i.evidence_text, reason: i.notes })),
  }] : [];
  const saved = await checked(db.rpc('persist_tpmo_timing_repair', {
    p_call_id: call.id, p_original_scorecard_id: card.id, p_template_id: target.id,
    p_transcript: transcriptSnapshot(live), p_result: {
      scorecard: { ...scorecard, sentiment_summary: card.sentiment_summary || {} },
      items, detections, actions, redactions: [], isShortCall: false,
    },
  }));
  if (!saved.scorecard?.id) throw new Error('Repair did not persist a scorecard.');
  return { ...preview.summary, scorecard_id: saved.scorecard.id, applied: true };
}

export async function main(argv = process.argv.slice(2)) {
  const value = flag => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null;
  const callId = value('--call-id');
  if (!/^[0-9a-f-]{36}$/i.test(callId || '')) throw new Error('Pass --call-id UUID.');
  const baseline = value('--baseline'), output = value('--output') || baseline || `/tmp/tpmo-${callId}.json`;
  let snapshot, db;
  if (baseline) snapshot = JSON.parse(await fs.readFile(baseline, 'utf8'));
  else {
    db = await createSupabaseAdminClient();
    const call = await checked(db.from('call_records').select('*').eq('id', callId).single());
    if (!call.compliance_scorecard_id) throw new Error('Call has no current scorecard.');
    const card = await checked(db.from('compliance_scorecards').select('*').eq('id', call.compliance_scorecard_id).single());
    const [items, template, templateItems] = await Promise.all([
      checked(db.from('scorecard_items').select('*').eq('scorecard_id', card.id)),
      checked(db.from('scoring_templates').select('*').eq('id', card.template_id).single()),
      checked(db.from('scoring_template_items').select('*,compliance_intents(intent_code)').eq('template_id', card.template_id)),
    ]);
    const detections = await checked(db.from('intent_detections').select('*').in('id', items.map(i => i.detection_id).filter(Boolean)));
    snapshot = { call, card, items, template, templateItems, detections };
    await fs.writeFile(output, JSON.stringify(snapshot, null, 2), { mode: 0o600, flag: 'wx' });
  }
  if (snapshot.call.id !== callId) throw new Error('Baseline belongs to another call.');
  const preview = previewTpmoRepair(snapshot);
  if (!argv.includes('--apply')) return { ...preview.summary, applied: false, baseline: output };
  db ||= await createSupabaseAdminClient();
  return applyTpmoRepair(snapshot, db);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
