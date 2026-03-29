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

    // POST /calls/:id/score — trigger scoring
    if (parts[0] === "calls" && parts[2] === "score" && method === "POST") {
      const callId = parts[1];
      const { data: callRecord, error } = await sb
        .from("call_records").select("*").eq("id", callId).single();
      if (error || !callRecord) return json(404, { error: "Call not found" });

      // Dynamic import to keep cold starts fast
      const { generateScorecard } = await import("../../src/compliance/engine/ScorecardGenerator.js");
      const result = await generateScorecard({
        supabase: sb,
        callRecord,
        callLLM: callClaude,
      });
      return json(200, result);
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
        .select("*, call_records(agent_name, call_start, carrier_name, product_type)")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (agentId) {
        query = query.eq("call_records.agent_id", agentId);
      }

      const { data } = await query;
      return json(200, data || []);
    }

    // GET /scorecards/:id — scorecard detail
    if (parts[0] === "scorecards" && parts[1] && method === "GET") {
      const { data: scorecard } = await sb
        .from("compliance_scorecards").select("*").eq("id", parts[1]).single();
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

    // GET /calibration/:id — get calibration run status
    if (parts[0] === "calibration" && parts[1] && !parts[2] && method === "GET") {
      const { data: run } = await sb
        .from("calibration_runs").select("*").eq("id", parts[1]).single();
      if (!run) return json(404, { error: "Calibration run not found" });
      return json(200, run);
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

    return json(404, { error: "Not found", path: parts.join("/") });

  } catch (err) {
    console.error("compliance function error:", err);
    return json(500, { error: err.message || "Internal server error" });
  }
};
