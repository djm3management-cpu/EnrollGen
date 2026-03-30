/**
 * Compliance Engine API — Netlify serverless function.
 * Handles all compliance-related API routes via path-based routing.
 *
 * Routes:
 *   POST   /compliance/calls                     — Create a call record
 *   POST   /compliance/calls/:id/score           — Trigger scoring for a call
 *   GET    /compliance/calls/:id/scorecard       — Get scorecard for a call
 *   GET    /compliance/calls/:id/detections      — Get intent detections
 *   POST   /compliance/calls/:id/override        — Override a scorecard item
 *   GET    /compliance/scorecards                 — List scorecards
 *   GET    /compliance/scorecards/:id             — Get scorecard detail
 *   GET    /compliance/templates                  — List scoring templates
 *   GET    /compliance/dashboard/overview         — Dashboard overview data
 *   GET    /compliance/corrective-actions         — List corrective actions
 *   PATCH  /compliance/corrective-actions/:id     — Update corrective action
 *   POST   /compliance/calibration/start          — Start calibration run
 *   GET    /compliance/calibration/:id            — Get calibration run status
 *   POST   /compliance/calibration/:id/override   — Submit spot-check override
 *   POST   /compliance/recalculate                — Retroactive score recalculation
 *   GET    /compliance/agents                     — Agent profiles aggregation
 */

import { requireClerkAuth } from "./_clerkAuth.js";
import { createClient } from "@supabase/supabase-js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const AI_TIMEOUT_MS = 120000; // 2 min for classification calls

function json(status, data) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

async function callClaude(system, user) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: controller.signal,
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || `API error ${resp.status}`);
    return data.content?.map(b => b.type === "text" ? b.text : "").join("") || "";
  } finally {
    clearTimeout(timeout);
  }
}

function parsePath(url) {
  const u = new URL(url);
  // Path after /.netlify/functions/compliance
  const prefix = "/.netlify/functions/compliance";
  const path = u.pathname.startsWith(prefix)
    ? u.pathname.slice(prefix.length)
    : u.pathname.replace(/^\/api\/compliance/, "");
  const parts = path.split("/").filter(Boolean);
  return { parts, searchParams: u.searchParams };
}

function detectCallDirection(diarized) {
  if (!diarized || diarized.length === 0) return 'inbound';
  const firstMinute = diarized.filter(u => (u.start_ms || 0) < 60000);
  const text = firstMinute.map(u => (u.text || '')).join(' ').toLowerCase();

  const outPatterns = [/permission to contact/, /ptc.{0,20}(on file|valid)/, /i('m| am) (calling|reaching out) (you|to follow)/, /following up on (your|the) request/, /you (filled out|submitted).{0,30}(form|request)/, /gave us.{0,15}permission/];
  const inPatterns = [/thank you for calling/, /thanks for calling/, /how (can|may) i help/, /transfer(red)?/, /warm transfer/, /i was (told|informed)/, /calling (about|regarding) my/, /i('m| am) interested in/, /you('ve| have) reached/];

  let outScore = 0, inScore = 0;
  for (const p of outPatterns) if (p.test(text)) outScore++;
  for (const p of inPatterns) if (p.test(text)) inScore++;

  return (outScore >= 2 && outScore > inScore) ? 'outbound' : 'inbound';
}

function recalcGrade(score, autoFail) {
  if (autoFail) return 'F';
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 60) return 'D';
  return 'F';
}

function recalcRiskLevel(score, autoFail, sequenceViolations) {
  if (autoFail || score < 60) return "critical";
  if (score < 70 || sequenceViolations > 3) return "high";
  if (score < 85 || sequenceViolations > 1) return "medium";
  return "low";
}

function determineCorrectiveBucket(overallScore, autoFail, categoryScores) {
  if (autoFail) return "CRITICAL_VIOLATIONS";

  const majorFails = Object.values(categoryScores || {}).reduce((sum, cat) => {
    if (!cat || !cat.possible) return sum;
    return sum + (cat.earned / cat.possible < 0.5 ? 1 : 0);
  }, 0);

  if (overallScore < 70 || majorFails >= 3) return "MAJOR_DEFICIENCIES";
  if (overallScore < 85) return "COACHING_OPPORTUNITIES";
  if (overallScore < 93) return "MINOR_IMPROVEMENTS";
  return null;
}

function chunkArray(items, chunkSize = 250) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function selectInBatches(sb, table, column, values, select, chunkSize = 250) {
  const uniqueValues = [...new Set((values || []).filter(Boolean))];
  if (uniqueValues.length === 0) return [];

  const chunks = chunkArray(uniqueValues, chunkSize);
  const responses = await Promise.all(
    chunks.map((chunk) => sb.from(table).select(select).in(column, chunk))
  );

  const rows = [];
  for (const response of responses) {
    if (response.error) {
      throw new Error(`${table} select failed: ${response.error.message}`);
    }
    rows.push(...(response.data || []));
  }
  return rows;
}

async function upsertInBatches(sb, table, rows, chunkSize = 250) {
  if (!rows || rows.length === 0) return;

  const chunks = chunkArray(rows, chunkSize);
  for (const chunk of chunks) {
    const responses = await Promise.all(
      chunk.map((row) => {
        if (!row?.id) {
          throw new Error(`${table} update failed: missing id`);
        }
        const { id, ...updates } = row;
        return sb.from(table).update(updates).eq("id", id);
      })
    );

    for (const response of responses) {
      if (response.error) {
        throw new Error(`${table} update failed: ${response.error.message}`);
      }
    }
  }
}

function buildCategoryScoresWithPct(categoryScores) {
  return Object.fromEntries(
    Object.entries(categoryScores).map(([category, scores]) => [
      category,
      {
        ...scores,
        pct: scores.possible > 0
          ? Math.round((scores.earned / scores.possible) * 100)
          : 0,
      },
    ])
  );
}

function evaluateRecalculatedItem({
  item,
  templateItem,
  detection,
  intentMeta,
  direction,
  isShortCall,
}) {
  const questionText = item.question_text || templateItem?.question_text || "Unknown question";
  const category = item.category || templateItem?.category || "Uncategorized";
  const pointsPossibleBase = Number(
    templateItem?.points_possible ?? item.points_possible ?? 0
  );
  const isAutoFail = Boolean(templateItem?.is_auto_fail ?? item.is_auto_fail);
  const baseEvidenceText = detection?.transcript_segment ?? item.evidence_text ?? null;
  const baseEvidenceTimestamp = detection?.segment_start_ms ?? item.evidence_timestamp_ms ?? null;

  if (isShortCall) {
    return {
      row: {
        id: item.id,
        result: "not_applicable",
        points_earned: 0,
        points_possible: 0,
        confidence: 0,
        auto_fail_triggered: false,
        notes: "Short call - insufficient for scoring",
        evidence_text: baseEvidenceText,
        evidence_timestamp_ms: baseEvidenceTimestamp,
      },
      aggregate: {
        questionText,
        category,
        result: "not_applicable",
        pointsEarned: 0,
        pointsPossible: 0,
        autoFailTriggered: false,
        riskFlag: null,
        coachingNote: null,
        sequenceViolation: false,
      },
    };
  }

  const subcategory = (intentMeta?.subcategory || "").toUpperCase();
  const directionExcluded =
    (subcategory === "OUTBOUND" && direction !== "outbound") ||
    (subcategory === "INBOUND" && direction !== "inbound");

  if (directionExcluded) {
    return {
      row: {
        id: item.id,
        result: "not_applicable",
        points_earned: 0,
        points_possible: 0,
        confidence: 0,
        auto_fail_triggered: false,
        notes: `Not applicable - ${subcategory} intent on ${direction} call`,
        evidence_text: baseEvidenceText,
        evidence_timestamp_ms: baseEvidenceTimestamp,
      },
      aggregate: {
        questionText,
        category,
        result: "not_applicable",
        pointsEarned: 0,
        pointsPossible: 0,
        autoFailTriggered: false,
        riskFlag: null,
        coachingNote: null,
        sequenceViolation: false,
      },
    };
  }

  const manualOverride =
    Boolean(detection?.manually_overridden) &&
    ["pass", "fail", "partial"].includes(item.result);

  if (manualOverride) {
    const pointsPossible = pointsPossibleBase;
    const pointsEarned =
      item.result === "pass"
        ? pointsPossible
        : item.result === "partial"
        ? Math.floor(pointsPossible * 0.5)
        : 0;
    const autoFailTriggered = Boolean(isAutoFail && item.result === "fail");

    return {
      row: {
        id: item.id,
        result: item.result,
        points_earned: pointsEarned,
        points_possible: pointsPossible,
        confidence: Number(item.confidence ?? detection?.confidence ?? 0),
        auto_fail_triggered: autoFailTriggered,
        notes: item.notes || detection?.override_reason || detection?.llm_reasoning || null,
        evidence_text: item.evidence_text ?? baseEvidenceText,
        evidence_timestamp_ms: item.evidence_timestamp_ms ?? baseEvidenceTimestamp,
      },
      aggregate: {
        questionText,
        category,
        result: item.result,
        pointsEarned,
        pointsPossible,
        autoFailTriggered,
        riskFlag: autoFailTriggered ? `Auto-fail: ${questionText}` : null,
        coachingNote: null,
        sequenceViolation: false,
      },
    };
  }

  let result = "fail";
  let pointsEarned = 0;
  let notes = detection?.llm_reasoning || item.notes || null;
  let coachingNote = null;
  let riskFlag = null;
  let sequenceViolation = false;
  const confidence = Number(detection?.confidence || 0);

  if (!detection || !detection.detected) {
    if (isAutoFail) {
      riskFlag = `Auto-fail: ${questionText}`;
    }
    coachingNote = `Missing: ${questionText}`;
  } else if (detection.anti_pattern_match) {
    notes = detection.llm_reasoning || detection.anti_pattern_detail || notes;
    coachingNote = `Anti-pattern flagged for: ${questionText} - ${detection.anti_pattern_detail || "Review transcript"}`;
    riskFlag = `Anti-pattern detected: ${questionText}`;
  } else if (confidence >= 0.9) {
    if (detection.sequence_violation) {
      result = "partial";
      pointsEarned = Math.floor(pointsPossibleBase * 0.5);
      notes = detection.llm_reasoning || detection.sequence_violation_detail || notes;
      coachingNote = `Sequence violation: ${questionText} - ${detection.sequence_violation_detail}`;
      sequenceViolation = true;
    } else {
      result = "pass";
      pointsEarned = pointsPossibleBase;
    }
  } else if (confidence >= 0.7) {
    result = "pass";
    pointsEarned = pointsPossibleBase;
  } else if (confidence >= 0.5) {
    result = "partial";
    pointsEarned = Math.floor(pointsPossibleBase * 0.5);
    coachingNote = `Low confidence (${(confidence * 100).toFixed(0)}%): ${questionText} - needs manual review`;
  } else if (isAutoFail) {
    riskFlag = `Auto-fail: ${questionText}`;
  }

  const autoFailTriggered = Boolean(isAutoFail && result === "fail");
  if (autoFailTriggered && !riskFlag) {
    riskFlag = `Auto-fail: ${questionText}`;
  }

  return {
    row: {
      id: item.id,
      result,
      points_earned: pointsEarned,
      points_possible: pointsPossibleBase,
      confidence,
      auto_fail_triggered: autoFailTriggered,
      notes,
      evidence_text: baseEvidenceText,
      evidence_timestamp_ms: baseEvidenceTimestamp,
    },
    aggregate: {
      questionText,
      category,
      result,
      pointsEarned,
      pointsPossible: pointsPossibleBase,
      autoFailTriggered,
      riskFlag,
      coachingNote,
      sequenceViolation,
    },
  };
}

export default async (request) => {
  const auth = await requireClerkAuth(request);
  if (auth.response) return auth.response;

  const method = request.method.toUpperCase();
  const { parts, searchParams } = parsePath(request.url);

  try {
    const sb = getSupabase();

    // POST /calls — create call record
    if (parts[0] === "calls" && !parts[1] && method === "POST") {
      const body = await request.json();
      const { data, error } = await sb.from("call_records").insert(body).select().single();
      if (error) return json(400, { error: error.message });
      return json(201, data);
    }

    // POST /calls/:id/score — redirect to background scoring
    if (parts[0] === "calls" && parts[2] === "score" && method === "POST") {
      return json(202, { message: "Use /.netlify/functions/score-call-background for async scoring" });
    }

    // GET /calls/:id/scorecard
    if (parts[0] === "calls" && parts[2] === "scorecard" && method === "GET") {
      const callId = parts[1];
      const { data: scorecard } = await sb
        .from("compliance_scorecards").select("*").eq("call_id", callId).order("created_at", { ascending: false }).limit(1).single();
      if (!scorecard) return json(404, { error: "Scorecard not found" });

      const { data: items } = await sb
        .from("scorecard_items").select("*").eq("scorecard_id", scorecard.id).order("display_order");

      return json(200, { ...scorecard, items: items || [] });
    }

    // GET /calls/:id/detections
    if (parts[0] === "calls" && parts[2] === "detections" && method === "GET") {
      const callId = parts[1];
      const { data } = await sb
        .from("intent_detections").select("*").eq("call_id", callId).order("segment_start_ms");
      return json(200, data || []);
    }

    // POST /calls/:id/override — override a scorecard item
    if (parts[0] === "calls" && parts[2] === "override" && method === "POST") {
      const body = await request.json();
      const { scorecard_item_id, new_result, reason } = body;

      const pointsMap = { pass: null, fail: 0, partial: null }; // null = recalc from template
      const { data: item } = await sb
        .from("scorecard_items")
        .select("*")
        .eq("id", scorecard_item_id)
        .single();

      if (!item) return json(404, { error: "Scorecard item not found" });

      const newPoints = new_result === "fail" ? 0
        : new_result === "partial" ? Math.floor(item.points_possible * 0.5)
        : item.points_possible;

      await sb.from("scorecard_items").update({
        result: new_result,
        points_earned: newPoints,
        notes: reason || item.notes,
      }).eq("id", scorecard_item_id);

      // Update the detection if it exists
      if (item.detection_id) {
        await sb.from("intent_detections").update({
          manually_overridden: true,
          override_by: auth.userId,
          override_reason: reason,
          override_at: new Date().toISOString(),
        }).eq("id", item.detection_id);
      }

      return json(200, { success: true });
    }

    // GET /scorecards — list scorecards
    if (parts[0] === "scorecards" && !parts[1] && method === "GET") {
      const limit = parseInt(searchParams.get("limit") || "50");
      const offset = parseInt(searchParams.get("offset") || "0");
      const agentId = searchParams.get("agent_id");

      let query = sb
        .from("compliance_scorecards")
        .select("*, call_records(agent_name, call_start, carrier_name, product_type, call_direction, metadata)")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (agentId) {
        query = query.eq("call_records.agent_id", agentId);
      }

      const { data } = await query;
      return json(200, data || []);
    }

    // GET /scorecards/:id — scorecard detail with call record data
    if (parts[0] === "scorecards" && parts[1] && method === "GET") {
      const { data: scorecard } = await sb
        .from("compliance_scorecards")
        .select("*, call_records(recording_url, transcript_diarized, agent_name, call_direction, call_duration_seconds, metadata)")
        .eq("id", parts[1]).single();
      if (!scorecard) return json(404, { error: "Not found" });

      const { data: items } = await sb
        .from("scorecard_items").select("*").eq("scorecard_id", parts[1]).order("display_order");

      return json(200, { ...scorecard, items: items || [] });
    }

    // GET /templates — list scoring templates
    if (parts[0] === "templates" && method === "GET") {
      const { data } = await sb.from("scoring_templates").select("*").order("created_at", { ascending: false });
      return json(200, data || []);
    }

    // GET /dashboard/overview — agency-level dashboard data
    if (parts[0] === "dashboard" && parts[1] === "overview" && method === "GET") {
      const days = parseInt(searchParams.get("days") || "30");
      const since = new Date(Date.now() - days * 86400000).toISOString();

      const { data: scorecards } = await sb
        .from("compliance_scorecards")
        .select("overall_score, overall_grade, pass_fail, auto_fail_triggered, risk_level, category_scores, created_at, call_records(agent_name, agent_id)")
        .gte("created_at", since)
        .order("created_at", { ascending: false });

      const cards = scorecards || [];
      const totalCalls = cards.length;
      const avgScore = totalCalls > 0 ? cards.reduce((s, c) => s + Number(c.overall_score), 0) / totalCalls : 0;
      const passCount = cards.filter(c => c.pass_fail === "PASS").length;
      const autoFailCount = cards.filter(c => c.auto_fail_triggered).length;

      // Category breakdown
      const catTotals = {};
      for (const c of cards) {
        for (const [cat, scores] of Object.entries(c.category_scores || {})) {
          if (!catTotals[cat]) catTotals[cat] = { earned: 0, possible: 0 };
          catTotals[cat].earned += scores.earned || 0;
          catTotals[cat].possible += scores.possible || 0;
        }
      }
      const categoryBreakdown = Object.fromEntries(
        Object.entries(catTotals).map(([cat, s]) => [cat, { ...s, pct: s.possible > 0 ? Math.round((s.earned / s.possible) * 100) : 0 }])
      );

      // Risk distribution
      const riskDist = { low: 0, medium: 0, high: 0, critical: 0 };
      for (const c of cards) riskDist[c.risk_level] = (riskDist[c.risk_level] || 0) + 1;

      // Open corrective actions
      const { count: openActions } = await sb.from("corrective_actions").select("id", { count: "exact" }).eq("status", "open");

      return json(200, {
        period_days: days,
        total_calls: totalCalls,
        avg_score: Math.round(avgScore * 100) / 100,
        pass_rate: totalCalls > 0 ? Math.round((passCount / totalCalls) * 100) : 0,
        auto_fail_rate: totalCalls > 0 ? Math.round((autoFailCount / totalCalls) * 100) : 0,
        category_breakdown: categoryBreakdown,
        risk_distribution: riskDist,
        open_corrective_actions: openActions || 0,
      });
    }

    // GET /corrective-actions
    if (parts[0] === "corrective-actions" && !parts[1] && method === "GET") {
      const status = searchParams.get("status") || "open";
      const limit = parseInt(searchParams.get("limit") || "50");
      const { data } = await sb
        .from("corrective_actions")
        .select("*")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(limit);
      return json(200, data || []);
    }

    // PATCH /corrective-actions/:id
    if (parts[0] === "corrective-actions" && parts[1] && method === "PATCH") {
      const body = await request.json();
      const updates = {};
      if (body.status) updates.status = body.status;
      if (body.resolution_notes) updates.resolution_notes = body.resolution_notes;
      if (body.assigned_to) updates.assigned_to = body.assigned_to;
      if (body.status === "remediated" || body.status === "closed") {
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = auth.userId;
      }
      if (body.status === "escalated") {
        updates.escalated = true;
        updates.escalated_to = body.escalated_to;
        updates.escalated_at = new Date().toISOString();
      }
      updates.updated_at = new Date().toISOString();

      const { data, error } = await sb
        .from("corrective_actions").update(updates).eq("id", parts[1]).select().single();
      if (error) return json(400, { error: error.message });
      return json(200, data);
    }

    // GET /calibration/runs — list all calibration runs
    if (parts[0] === "calibration" && parts[1] === "runs" && method === "GET") {
      const { data } = await sb
        .from("calibration_runs")
        .select("*")
        .order("created_at", { ascending: false });
      return json(200, data || []);
    }

    // POST /calibration/start — start a calibration run
    if (parts[0] === "calibration" && parts[1] === "start" && method === "POST") {
      const body = await request.json();
      const { run_name, call_ids } = body;

      const { data: run } = await sb.from("calibration_runs").insert({
        run_name: run_name || `Calibration ${new Date().toISOString().slice(0, 10)}`,
        total_calls: call_ids.length,
        status: "processing",
        started_at: new Date().toISOString(),
      }).select().single();

      // Return immediately — actual processing happens async via the score endpoint
      return json(201, { run_id: run.id, status: "processing", total_calls: call_ids.length });
    }

    // GET /calibration/:id — full calibration report
    if (parts[0] === "calibration" && parts[1] && !parts[2] && method === "GET") {
      const runId = parts[1];
      const { data: run } = await sb
        .from("calibration_runs").select("*").eq("id", runId).single();
      if (!run) return json(404, { error: "Calibration run not found" });

      // Get calls linked to this run via metadata
      const { data: calls } = await sb
        .from("call_records")
        .select("id, agent_name, metadata")
        .filter("metadata->>calibration_run_id", "eq", runId);

      const callIds = (calls || []).map(c => c.id);
      if (callIds.length === 0) {
        return json(200, { run, totalScored: 0, scorecards: [], overridesCount: 0, topCallsForReview: [], weakestIntents: [] });
      }

      // Get scorecards for these calls
      const { data: scorecards } = await sb
        .from("compliance_scorecards")
        .select("id, call_id, overall_score, overall_grade, pass_fail, auto_fail_triggered, category_scores, risk_level")
        .in("call_id", callIds);

      const cards = scorecards || [];
      const scorecardIds = cards.map(s => s.id);

      // Get scorecard items for confidence data
      const { data: items } = scorecardIds.length > 0
        ? await sb.from("scorecard_items")
            .select("scorecard_id, confidence, category, question_text")
            .in("scorecard_id", scorecardIds)
        : { data: [] };

      // Compute avg confidence per scorecard
      const confByScorecard = {};
      for (const item of (items || [])) {
        if (!confByScorecard[item.scorecard_id]) confByScorecard[item.scorecard_id] = [];
        if (item.confidence != null) confByScorecard[item.scorecard_id].push(item.confidence);
      }
      const avgConfMap = {};
      for (const [sid, confs] of Object.entries(confByScorecard)) {
        avgConfMap[sid] = confs.length > 0 ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
      }

      // Confidence tiers
      let highConf = 0, medConf = 0, lowConf = 0;
      for (const avg of Object.values(avgConfMap)) {
        if (avg >= 0.85) highConf++;
        else if (avg >= 0.70) medConf++;
        else lowConf++;
      }

      // Build top calls for review (lowest confidence first)
      const callMetaMap = {};
      for (const c of (calls || [])) {
        callMetaMap[c.id] = { agent_name: c.agent_name, filename: c.metadata?.source_filename || null };
      }

      const topCallsForReview = cards
        .map(sc => ({
          call_id: sc.call_id,
          scorecard_id: sc.id,
          filename: callMetaMap[sc.call_id]?.filename || null,
          agent_name: callMetaMap[sc.call_id]?.agent_name || 'Unknown',
          overall_score: sc.overall_score,
          overall_grade: sc.overall_grade,
          avg_confidence: avgConfMap[sc.id] || 0,
          auto_fail_triggered: sc.auto_fail_triggered,
        }))
        .sort((a, b) => a.avg_confidence - b.avg_confidence)
        .slice(0, 20);

      // Weakest intents — aggregate from intent_detections
      const { data: detections } = await sb
        .from("intent_detections")
        .select("intent_code, confidence")
        .in("call_id", callIds)
        .eq("detected", true);

      const intentAgg = {};
      for (const d of (detections || [])) {
        if (!intentAgg[d.intent_code]) intentAgg[d.intent_code] = { total: 0, count: 0 };
        intentAgg[d.intent_code].total += d.confidence || 0;
        intentAgg[d.intent_code].count++;
      }
      const weakestIntents = Object.entries(intentAgg)
        .map(([code, agg]) => ({ intent_code: code, question: code.replace(/_/g, ' '), avg_confidence: agg.total / agg.count }))
        .sort((a, b) => a.avg_confidence - b.avg_confidence)
        .slice(0, 15);

      // Override count
      const { count: overridesCount } = await sb
        .from("calibration_overrides")
        .select("*", { count: "exact", head: true })
        .eq("calibration_run_id", runId);

      // Update run counts
      run.high_confidence_count = highConf;
      run.medium_confidence_count = medConf;
      run.low_confidence_count = lowConf;
      run.total_calls = callIds.length;

      return json(200, {
        run,
        totalScored: cards.length,
        scorecards: cards,
        overridesCount: overridesCount || 0,
        topCallsForReview,
        weakestIntents,
      });
    }

    // POST /calibration/:id/override — submit spot-check override
    if (parts[0] === "calibration" && parts[2] === "override" && method === "POST") {
      const body = await request.json();
      const { data, error } = await sb.from("calibration_overrides").insert({
        calibration_run_id: parts[1],
        ...body,
      }).select().single();
      if (error) return json(400, { error: error.message });

      // Increment override count on the run
      await sb.rpc("increment_calibration_overrides", { run_id: parts[1] });

      return json(201, data);
    }

    // POST /recalculate — retroactive score recalculation for existing scored calls
    if (parts[0] === "recalculate" && !parts[1] && method === "POST") {
      // Batched approach — minimize DB round-trips to stay under 10s limit

      // 1. Fetch all data upfront in parallel
      const [callsRes, scorecardsRes, intentsRes] = await Promise.all([
        sb
          .from("call_records")
          .select("id, transcript_diarized, call_duration_seconds")
          .not("transcript_diarized", "is", null),
        sb
          .from("compliance_scorecards")
          .select("id, call_id, template_id"),
        sb
          .from("compliance_intents")
          .select("id, intent_code, subcategory"),
      ]);

      if (callsRes.error) throw new Error(`call_records select failed: ${callsRes.error.message}`);
      if (scorecardsRes.error) throw new Error(`compliance_scorecards select failed: ${scorecardsRes.error.message}`);
      if (intentsRes.error) throw new Error(`compliance_intents select failed: ${intentsRes.error.message}`);

      const eligibleCalls = (callsRes.data || []).filter(
        (call) => Array.isArray(call.transcript_diarized) && call.transcript_diarized.length > 0
      );
      const scorecardsByCall = {};
      for (const scorecard of (scorecardsRes.data || [])) {
        if (!scorecardsByCall[scorecard.call_id]) scorecardsByCall[scorecard.call_id] = [];
        scorecardsByCall[scorecard.call_id].push(scorecard);
      }

      const intentById = {};
      const intentByCode = {};
      for (const intent of (intentsRes.data || [])) {
        intentById[intent.id] = intent;
        intentByCode[intent.intent_code] = intent;
      }

      const now = new Date().toISOString();
      const callUpdates = [];
      const workItems = [];
      const results = [];

      for (const call of eligibleCalls) {
        const direction = detectCallDirection(call.transcript_diarized);
        const isShortCall = (call.call_duration_seconds || 0) < 120;

        callUpdates.push({
          id: call.id,
          call_direction: direction,
          updated_at: now,
        });

        const scorecards = scorecardsByCall[call.id] || [];
        if (scorecards.length === 0) {
          results.push({
            call_id: call.id,
            direction,
            skipped: true,
            reason: "no scorecard",
          });
          continue;
        }

        for (const scorecard of scorecards) {
          workItems.push({
            call,
            direction,
            isShortCall,
            scorecard,
          });
        }
      }

      // 3. Exit early if there are no scorecards to recalculate
      const scorecardIds = workItems.map((item) => item.scorecard.id);
      if (scorecardIds.length === 0) {
        await upsertInBatches(sb, "call_records", callUpdates, 100);
        return json(200, { recalculated: 0, results }); /*
          risk_flags: ["Short call — insufficient for scoring"],
      */
      }

      // 4. Fetch scorecard items for all scorecards in one query
      const allItems = await selectInBatches(
        sb,
        "scorecard_items",
        "scorecard_id",
        scorecardIds,
        "id, scorecard_id, template_item_id, intent_id, detection_id, question_text, category, result, points_earned, points_possible, confidence, is_auto_fail, auto_fail_triggered, notes, evidence_text, evidence_timestamp_ms, display_order"
      );
      const itemsByScorecard = {};
      for (const item of allItems) {
        if (!itemsByScorecard[item.scorecard_id]) itemsByScorecard[item.scorecard_id] = [];
        itemsByScorecard[item.scorecard_id].push(item);
      }

      const [templateItems, detections, templates] = await Promise.all([
        selectInBatches(
          sb,
          "scoring_template_items",
          "id",
          allItems.map((item) => item.template_item_id),
          "id, intent_id, question_text, category, points_possible, is_auto_fail, display_order, template_id"
        ),
        selectInBatches(
          sb,
          "intent_detections",
          "id",
          allItems.map((item) => item.detection_id),
          "id, intent_code, detected, confidence, anti_pattern_match, anti_pattern_detail, llm_reasoning, transcript_segment, segment_start_ms, sequence_violation, sequence_violation_detail, manually_overridden, override_reason"
        ),
        selectInBatches(
          sb,
          "scoring_templates",
          "id",
          workItems.map((item) => item.scorecard.template_id),
          "id, passing_threshold"
        ),
      ]);

      const templateItemById = {};
      for (const templateItem of templateItems) {
        templateItemById[templateItem.id] = templateItem;
      }

      const detectionById = {};
      for (const detection of detections) {
        detectionById[detection.id] = detection;
      }

      const templateById = {};
      for (const template of templates) {
        templateById[template.id] = template;
      }

      const itemUpdates = [];
      const scorecardUpdates = [];

      for (const workItem of workItems) {
        const { call, direction, isShortCall, scorecard } = workItem;
        const scorecardItems = itemsByScorecard[scorecard.id] || [];

        if (!isShortCall && scorecardItems.length === 0) {
          results.push({
            call_id: call.id,
            scorecard_id: scorecard.id,
            direction,
            skipped: true,
            reason: "no scorecard items",
          });
          continue;
        }

        let totalEarned = 0;
        let totalPossible = 0;
        let autoFailTriggered = false;
        let sequenceViolations = 0;
        const autoFailReasons = [];
        const categoryScores = {};
        const riskFlags = [];
        const coachingNotes = [];

        for (const item of scorecardItems) {
          const templateItem = templateItemById[item.template_item_id] || null;
          const detection = detectionById[item.detection_id] || null;
          const intentMeta =
            (detection?.intent_code && intentByCode[detection.intent_code]) ||
            (templateItem?.intent_id && intentById[templateItem.intent_id]) ||
            (item.intent_id && intentById[item.intent_id]) ||
            null;

          const recalculated = evaluateRecalculatedItem({
            item,
            templateItem,
            detection,
            intentMeta,
            direction,
            isShortCall,
          });

          itemUpdates.push(recalculated.row);

          const aggregate = recalculated.aggregate;
          if (aggregate.result === "not_applicable") continue;

          totalEarned += aggregate.pointsEarned;
          totalPossible += aggregate.pointsPossible;

          if (!categoryScores[aggregate.category]) {
            categoryScores[aggregate.category] = { earned: 0, possible: 0 };
          }
          categoryScores[aggregate.category].earned += aggregate.pointsEarned;
          categoryScores[aggregate.category].possible += aggregate.pointsPossible;

          if (aggregate.autoFailTriggered) {
            autoFailTriggered = true;
            autoFailReasons.push(aggregate.questionText);
          }
          if (aggregate.riskFlag) riskFlags.push(aggregate.riskFlag);
          if (aggregate.coachingNote) coachingNotes.push(aggregate.coachingNote);
          if (aggregate.sequenceViolation) sequenceViolations++;
        }

        if (isShortCall) {
          scorecardUpdates.push({
            id: scorecard.id,
            overall_score: 0,
            overall_grade: "N/A",
            total_points_earned: 0,
            total_points_possible: 0,
            pass_fail: "INSUFFICIENT",
            auto_fail_triggered: false,
            auto_fail_reasons: [],
            category_scores: {},
            risk_level: "low",
            risk_flags: ["Short call - insufficient for scoring"],
            sequence_violations: 0,
            coaching_notes: ["Short call flagged as insufficient during retroactive recalculation"],
            corrective_actions_needed: false,
            updated_at: now,
          });

          results.push({
            call_id: call.id,
            scorecard_id: scorecard.id,
            direction,
            short: true,
            grade: "N/A",
            pass_fail: "INSUFFICIENT",
          });
          continue;
        }

        const categoryScoresWithPct = buildCategoryScoresWithPct(categoryScores);
        const overallScore = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0;
        const roundedScore = Math.round(overallScore * 100) / 100;
        const grade = recalcGrade(roundedScore, autoFailTriggered);
        const passingThreshold = Number(templateById[scorecard.template_id]?.passing_threshold ?? 85);
        const passFail = autoFailTriggered ? "FAIL" : (roundedScore >= passingThreshold ? "PASS" : "FAIL");
        const riskLevel = recalcRiskLevel(roundedScore, autoFailTriggered, sequenceViolations);
        const correctiveBucket = determineCorrectiveBucket(
          roundedScore,
          autoFailTriggered,
          categoryScoresWithPct
        );

        scorecardUpdates.push({
          id: scorecard.id,
          overall_score: roundedScore,
          overall_grade: grade,
          total_points_earned: totalEarned,
          total_points_possible: totalPossible,
          pass_fail: passFail,
          auto_fail_triggered: autoFailTriggered,
          auto_fail_reasons: [...new Set(autoFailReasons)],
          category_scores: categoryScoresWithPct,
          risk_level: riskLevel,
          risk_flags: [...new Set(riskFlags)],
          sequence_violations: sequenceViolations,
          coaching_notes: [...new Set(coachingNotes)],
          corrective_actions_needed: correctiveBucket !== null,
          updated_at: now,
        });

        results.push({
          call_id: call.id,
          scorecard_id: scorecard.id,
          direction,
          score: roundedScore,
          grade,
          pass_fail: passFail,
          auto_fail: autoFailTriggered,
        });
      }

      await Promise.all([
        upsertInBatches(sb, "scorecard_items", itemUpdates, 500),
        upsertInBatches(sb, "compliance_scorecards", scorecardUpdates, 100),
        upsertInBatches(sb, "call_records", callUpdates, 100),
      ]);

      const recalculatedCallCount = new Set(
        results.filter((result) => !result.skipped).map((result) => result.call_id)
      ).size;

      return json(200, { recalculated: recalculatedCallCount, results }); /*

      // 5. Collect IDs for batch direction-exclusion updates
      const outboundExcludeIds = [];
      const inboundExcludeIds = [];

      for (const { call, direction, scorecardId } of normalCalls) {
        const items = itemsByScorecard[scorecardId] || [];
        for (const item of items) {
          const isOut = outboundCodes.has(item.intent_code);
          const isIn = inboundCodes.has(item.intent_code);
          if ((isOut && direction === "inbound") || (isIn && direction === "outbound")) {
            if (isOut) outboundExcludeIds.push(item.id);
            else inboundExcludeIds.push(item.id);
            item.result = "not_applicable";
            item.points_earned = 0;
            item.points_possible = 0;
            item.auto_fail_triggered = false;
          }
        }
      }

      // 6. Batch update excluded items (2 queries max)
      const excludePromises = [];
      if (outboundExcludeIds.length > 0) {
        excludePromises.push(sb.from("scorecard_items").update({
          result: "not_applicable", points_earned: 0, points_possible: 0, auto_fail_triggered: false,
          notes: "Not applicable — OUTBOUND intent on inbound call",
        }).in("id", outboundExcludeIds));
      }
      if (inboundExcludeIds.length > 0) {
        excludePromises.push(sb.from("scorecard_items").update({
          result: "not_applicable", points_earned: 0, points_possible: 0, auto_fail_triggered: false,
          notes: "Not applicable — INBOUND intent on outbound call",
        }).in("id", inboundExcludeIds));
      }
      await Promise.all(excludePromises);

      // 7. Recalculate scores and batch update scorecards
      const scorecardUpdates = [];
      for (const { call, direction, scorecardId } of normalCalls) {
        const items = itemsByScorecard[scorecardId] || [];
        const totalEarned = items.reduce((s, i) => s + (i.points_earned || 0), 0);
        const totalPossible = items.filter(i => i.result !== "not_applicable").reduce((s, i) => s + (i.points_possible || 0), 0);
        const score = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0;
        const autoFail = items.some(i => i.result === "fail" && i.auto_fail_triggered);
        const grade = recalcGrade(score, autoFail);
        const passFail = autoFail ? "FAIL" : (score >= 70 ? "PASS" : "FAIL");
        const rounded = Math.round(score * 100) / 100;

        scorecardUpdates.push(sb.from("compliance_scorecards").update({
          overall_score: rounded, overall_grade: grade, pass_fail: passFail, auto_fail_triggered: autoFail,
        }).eq("id", scorecardId));

        results.push({ call_id: call.id, scorecard_id: scorecardId, direction, score: rounded, grade, pass_fail: passFail, auto_fail: autoFail });
      }

      // 8. Batch update call directions + scorecards in parallel
      const dirPromises = directionUpdates.map(u => sb.from("call_records").update({ call_direction: u.direction }).eq("id", u.id));
      await Promise.all([...scorecardUpdates, ...dirPromises]);

      return json(200, { recalculated: results.length, results });
      */
    }

    // GET /agents — agent profiles aggregation
    if (parts[0] === "agents" && !parts[1] && method === "GET") {
      const { data: scorecards } = await sb
        .from("compliance_scorecards")
        .select("id, overall_score, pass_fail, auto_fail_triggered, category_scores, call_records(agent_name, agent_id, call_direction, metadata)");

      const cards = scorecards || [];

      // Group by agent_name
      const agentMap = {};
      for (const card of cards) {
        const agentName = card.call_records?.agent_name || "Unknown";
        if (!agentMap[agentName]) {
          agentMap[agentName] = {
            agent_name: agentName,
            agent_id: card.call_records?.agent_id || null,
            calls: [],
          };
        }
        agentMap[agentName].calls.push(card);
      }

      // Build agent profiles
      const agents = Object.values(agentMap).map(agent => {
        const total = agent.calls.length;
        const avgScore = total > 0
          ? agent.calls.reduce((sum, c) => sum + Number(c.overall_score || 0), 0) / total
          : 0;
        const passCount = agent.calls.filter(c => c.pass_fail === "PASS").length;
        const autoFailCount = agent.calls.filter(c => c.auto_fail_triggered).length;

        // Top 5 failing categories
        const catFails = {};
        for (const card of agent.calls) {
          for (const [cat, scores] of Object.entries(card.category_scores || {})) {
            if (!catFails[cat]) catFails[cat] = { earned: 0, possible: 0 };
            catFails[cat].earned += scores.earned || 0;
            catFails[cat].possible += scores.possible || 0;
          }
        }
        const topFailingCategories = Object.entries(catFails)
          .map(([cat, s]) => ({
            category: cat,
            pct: s.possible > 0 ? Math.round((s.earned / s.possible) * 100) : 100,
          }))
          .sort((a, b) => a.pct - b.pct)
          .slice(0, 5);

        return {
          agent_name: agent.agent_name,
          agent_id: agent.agent_id,
          call_count: total,
          avg_score: Math.round(avgScore * 100) / 100,
          pass_rate: total > 0 ? Math.round((passCount / total) * 100) : 0,
          auto_fail_count: autoFailCount,
          top_failing_categories: topFailingCategories,
        };
      });

      // Sort by call count descending
      agents.sort((a, b) => b.call_count - a.call_count);

      return json(200, agents);
    }

    return json(404, { error: "Not found", path: parts.join("/") });

  } catch (err) {
    console.error("compliance function error:", err);
    return json(500, { error: err.message || "Internal server error" });
  }
};
