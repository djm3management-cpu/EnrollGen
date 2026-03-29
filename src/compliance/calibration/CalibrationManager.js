/**
 * CalibrationManager — Orchestrates batch ingestion and auto-grading
 * of call recordings for calibration mode.
 *
 * Flow:
 * 1. Accept batch of call recording files/URLs
 * 2. Create call_records for each
 * 3. Transcribe via Deepgram
 * 4. Run full 152-intent classification + scoring on each
 * 5. Triage results by confidence
 * 6. Generate calibration report
 */

import { generateScorecard } from '../engine/ScorecardGenerator.js';
import { triageByConfidence } from './ConfidenceTriager.js';

/**
 * Start a calibration run: create call records, score them, triage results.
 *
 * @param {Object} params
 * @param {Object} params.supabase - Supabase client
 * @param {Array} params.recordings - [{filename, url, agent_name, date, carrier}]
 * @param {Function} params.callLLM - async (system, user) => string
 * @param {Function} params.transcribeAudio - async (url) => {raw, diarized, duration_seconds}
 * @param {Function} [params.onProgress] - (pct, message) => void
 * @returns {Object} { run, scorecards, triageResult }
 */
export async function runCalibration({ supabase, recordings, callLLM, transcribeAudio, onProgress }) {
  const progress = (pct, msg) => onProgress?.(pct, msg);

  // 1. Create calibration run
  progress(2, 'Creating calibration run...');
  const { data: run } = await supabase.from('calibration_runs').insert({
    run_name: `Calibration ${new Date().toISOString().slice(0, 10)}`,
    total_calls: recordings.length,
    status: 'processing',
    started_at: new Date().toISOString(),
  }).select().single();

  const results = [];
  const errors = [];

  // 2. Process each recording
  for (let i = 0; i < recordings.length; i++) {
    const rec = recordings[i];
    const callPct = Math.round(((i + 0.5) / recordings.length) * 90) + 5;
    progress(callPct, `Processing ${i + 1}/${recordings.length}: ${rec.filename || 'recording'}...`);

    try {
      // 2a. Transcribe
      let transcript = { raw: '', diarized: [], duration_seconds: 0 };
      if (transcribeAudio && rec.url) {
        transcript = await transcribeAudio(rec.url);
      } else if (rec.transcript_raw || rec.transcript_diarized) {
        transcript = {
          raw: rec.transcript_raw || '',
          diarized: rec.transcript_diarized || [],
          duration_seconds: rec.duration_seconds || 0,
        };
      }

      // 2b. Create call record
      const agentName = rec.agent_name || extractAgentFromFilename(rec.filename);
      const callDate = rec.date || new Date().toISOString();

      const { data: callRecord } = await supabase.from('call_records').insert({
        agent_id: rec.agent_id || crypto.randomUUID(),
        agent_name: agentName,
        call_direction: rec.call_direction || 'outbound',
        call_type: rec.call_type || 'enrollment',
        product_type: rec.product_type || 'MA',
        carrier_name: rec.carrier || null,
        call_start: callDate,
        call_duration_seconds: transcript.duration_seconds || null,
        recording_url: rec.url || null,
        recording_storage_path: rec.storage_path || null,
        transcript_raw: transcript.raw,
        transcript_diarized: transcript.diarized,
        metadata: { calibration_run_id: run.id, source_filename: rec.filename },
      }).select().single();

      // 2c. Score the call
      const scoreResult = await generateScorecard({
        supabase,
        callRecord,
        callLLM,
      });

      results.push({
        call_id: callRecord.id,
        scorecard_id: scoreResult.scorecard?.id,
        filename: rec.filename,
        agent_name: agentName,
        overall_score: scoreResult.scorecard?.overall_score,
        overall_grade: scoreResult.scorecard?.overall_grade,
        pass_fail: scoreResult.scorecard?.pass_fail,
        avg_confidence: scoreResult.avgConfidence,
        auto_fail_triggered: scoreResult.scorecard?.auto_fail_triggered,
      });
    } catch (err) {
      console.error(`Error processing ${rec.filename}:`, err);
      errors.push({ filename: rec.filename, error: err.message });
    }
  }

  // 3. Triage by confidence
  progress(95, 'Triaging results...');
  const triageResult = triageByConfidence(results);

  // 4. Update calibration run record
  await supabase.from('calibration_runs').update({
    status: 'triaged',
    high_confidence_count: triageResult.high.length,
    medium_confidence_count: triageResult.medium.length,
    low_confidence_count: triageResult.low.length,
    spot_checks_required: triageResult.low.length,
  }).eq('id', run.id);

  progress(100, 'Calibration complete');

  return {
    run: { ...run, status: 'triaged' },
    results,
    errors,
    triage: triageResult,
  };
}

/**
 * Process a single call for calibration (used when processing calls one at a time
 * from the frontend, rather than batch).
 */
export async function processCalibrationCall({ supabase, callId, callLLM }) {
  const { data: callRecord } = await supabase
    .from('call_records').select('*').eq('id', callId).single();

  if (!callRecord) throw new Error(`Call ${callId} not found`);

  return generateScorecard({ supabase, callRecord, callLLM });
}

function extractAgentFromFilename(filename) {
  if (!filename) return 'Unknown Agent';
  // Try pattern: agentname_date_carrier.mp3
  const base = filename.replace(/\.[^.]+$/, '');
  const parts = base.split(/[_\-\s]+/);
  if (parts.length > 0) {
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }
  return base;
}

/**
 * Get calibration report data for a run.
 */
export async function getCalibrationReport(supabase, runId) {
  const { data: run } = await supabase
    .from('calibration_runs').select('*').eq('id', runId).single();

  if (!run) return null;

  // Get all scorecards from this calibration run
  const { data: calls } = await supabase
    .from('call_records')
    .select('id, agent_name, call_start, carrier_name, metadata')
    .contains('metadata', { calibration_run_id: runId });

  const callIds = (calls || []).map(c => c.id);
  if (callIds.length === 0) return { run, scorecards: [], weakestIntents: [], topCallsForReview: [] };

  const { data: scorecards } = await supabase
    .from('compliance_scorecards')
    .select('*, scorecard_items(*)')
    .in('call_id', callIds)
    .order('overall_score');

  // Find weakest intents (lowest avg confidence)
  const intentConfidences = {};
  for (const sc of (scorecards || [])) {
    for (const item of (sc.scorecard_items || [])) {
      if (!intentConfidences[item.question_text]) {
        intentConfidences[item.question_text] = { total: 0, count: 0, intent_code: item.intent_code };
      }
      intentConfidences[item.question_text].total += item.confidence || 0;
      intentConfidences[item.question_text].count++;
    }
  }

  const weakestIntents = Object.entries(intentConfidences)
    .map(([q, v]) => ({ question: q, intent_code: v.intent_code, avg_confidence: v.count > 0 ? v.total / v.count : 0 }))
    .sort((a, b) => a.avg_confidence - b.avg_confidence)
    .slice(0, 15);

  // Top 10 calls for spot-check (lowest avg confidence)
  const topCallsForReview = (scorecards || [])
    .map(sc => {
      const items = sc.scorecard_items || [];
      const avgConf = items.length > 0 ? items.reduce((s, i) => s + (i.confidence || 0), 0) / items.length : 0;
      const call = calls.find(c => c.id === sc.call_id);
      return {
        call_id: sc.call_id,
        scorecard_id: sc.id,
        agent_name: call?.agent_name || 'Unknown',
        filename: call?.metadata?.source_filename || '',
        overall_score: sc.overall_score,
        overall_grade: sc.overall_grade,
        avg_confidence: avgConf,
        auto_fail_triggered: sc.auto_fail_triggered,
      };
    })
    .sort((a, b) => a.avg_confidence - b.avg_confidence)
    .slice(0, 10);

  // Overrides count
  const { data: overrides } = await supabase
    .from('calibration_overrides')
    .select('id')
    .eq('calibration_run_id', runId);

  return {
    run,
    totalScored: scorecards?.length || 0,
    scorecards: (scorecards || []).map(({ scorecard_items, ...rest }) => rest),
    weakestIntents,
    topCallsForReview,
    overridesCount: overrides?.length || 0,
  };
}
