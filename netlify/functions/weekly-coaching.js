import { createClient } from "@supabase/supabase-js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const AI_TIMEOUT_MS = 60000;
const COACHING_SYSTEM_PROMPT =
  "You are a Medicare enrollment agency manager generating a weekly coaching summary for an agent.";

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase service-role env vars not configured");
  return createClient(url, serviceRoleKey);
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function nestedNumber(row, path) {
  let current = row;
  for (const key of path) current = current?.[key];
  return asNumber(current);
}

function avg(values, decimals = 1) {
  const valid = values.map(asNumber).filter((value) => value !== null);
  if (valid.length === 0) return null;
  const factor = 10 ** decimals;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * factor) / factor;
}

function isEnrolled(row) {
  return row.call_outcome === "enrolled" || row.enrollment_completed === true;
}

function resolveAgentName(row) {
  return row.writing_agent || row.agent_name || "Unknown";
}

function conversionRate(total, enrollments) {
  return total > 0 ? Math.round((enrollments / total) * 1000) / 10 : 0;
}

function durationMinutes(row) {
  const seconds = asNumber(row.call_duration_seconds);
  return seconds === null ? null : seconds / 60;
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

async function callClaude(system, user) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 700,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: controller.signal,
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `API error ${response.status}`);
    return data.content?.map((block) => block.type === "text" ? block.text : "").join("").trim() || "";
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCallsWithScores(supabase, tenantId, sinceIso) {
  const { data: calls, error } = await supabase
    .from("call_records")
    .select("id, tenant_id, agent_name, writing_agent, call_outcome, enrollment_completed, call_duration_seconds, created_at, call_analytics, dg_sentiment, agent_assessment")
    .eq("tenant_id", tenantId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const rows = calls || [];
  if (rows.length === 0) return [];

  const { data: scorecards, error: scoreError } = await supabase
    .from("compliance_scorecards")
    .select("id, call_id, overall_score, created_at")
    .in("call_id", rows.map((row) => row.id))
    .order("created_at", { ascending: false });

  if (scoreError) {
    console.warn("[weekly-coaching] Could not fetch scorecards:", scoreError.message);
    return rows.map((row) => ({ ...row, overall_score: null }));
  }

  const scoreByCall = new Map();
  for (const scorecard of scorecards || []) {
    if (!scoreByCall.has(scorecard.call_id)) scoreByCall.set(scorecard.call_id, scorecard.overall_score);
  }

  return rows.map((row) => ({ ...row, overall_score: scoreByCall.get(row.id) ?? null }));
}

function summarizeAgentWeek(calls) {
  const total = calls.length;
  const enrollments = calls.filter(isEnrolled).length;
  return {
    total_calls: total,
    enrollments,
    conversion_rate: conversionRate(total, enrollments),
    avg_duration_min: avg(calls.map(durationMinutes), 1),
    avg_talk_pct: avg(calls.map((row) => nestedNumber(row.call_analytics, ["talk_time", "agent_talk_pct"])), 1),
    avg_wpm: avg(calls.map((row) => nestedNumber(row.call_analytics, ["wpm", "agent_wpm"])), 0),
    avg_interruptions: avg(calls.map((row) => nestedNumber(row.call_analytics, ["interruptions", "agent_interruptions"])), 1),
    avg_sentiment: avg(calls.map((row) => nestedNumber(row.dg_sentiment, ["average_score"])), 2),
    avg_rapport: avg(calls.map((row) => nestedNumber(row.agent_assessment, ["rapport_score"])), 1),
    avg_listening: avg(calls.map((row) => nestedNumber(row.agent_assessment, ["listening_score"])), 1),
    avg_compliance: avg(calls.map((row) => row.overall_score), 1),
  };
}

function priorityList(calls) {
  const priorities = calls
    .map((row) => row.agent_assessment?.top_coaching_priority)
    .filter(Boolean);
  return Array.from(new Set(priorities)).slice(0, 12);
}

function valueOrDash(value, suffix = "") {
  return value === null || value === undefined ? "--" : `${value}${suffix}`;
}

function buildCoachingPrompt(agentName, periodStart, periodEnd, stats, priorities) {
  const priorityText = priorities.length > 0
    ? priorities.map((priority) => `- ${priority}`).join("\n")
    : "None flagged.";

  return `You are a Medicare enrollment agency manager generating a weekly coaching summary for an agent.

Agent: ${agentName}
Period: ${periodStart} to ${periodEnd}

Stats this week:
- Calls: ${stats.total_calls}
- Enrollments: ${stats.enrollments} (${stats.conversion_rate}%)
- Avg Duration: ${valueOrDash(stats.avg_duration_min)} min
- Avg Talk Time: ${valueOrDash(stats.avg_talk_pct, "%")} (ideal: 40-55%)
- Avg WPM: ${valueOrDash(stats.avg_wpm)} (ideal: 130-160)
- Avg Interruptions: ${valueOrDash(stats.avg_interruptions)} per call (ideal: 0-1)
- Avg Beneficiary Sentiment: ${valueOrDash(stats.avg_sentiment)} (-1 to 1 scale)
- Avg Rapport Score: ${valueOrDash(stats.avg_rapport)}/10
- Avg Listening Score: ${valueOrDash(stats.avg_listening)}/10
- Compliance Score Avg: ${valueOrDash(stats.avg_compliance, "%")}

Coaching priorities flagged on individual calls this week:
${priorityText}

Write a 3-4 sentence coaching summary. Be specific and constructive. End with the single most important thing this agent should focus on next week. Do not use bullet points.`;
}

async function fetchLatestAgentInsights(supabase, tenantId) {
  const { data, error } = await supabase
    .from("call_insights")
    .select("insight_key, insight_data, period_end")
    .eq("tenant_id", tenantId)
    .eq("insight_type", "agent_30d")
    .order("period_end", { ascending: false });

  if (error) {
    console.warn("[weekly-coaching] Could not fetch agent insights:", error.message);
    return new Map();
  }

  const byAgent = new Map();
  for (const row of data || []) {
    if (!byAgent.has(row.insight_key)) byAgent.set(row.insight_key, row.insight_data);
  }
  return byAgent;
}

async function processTenant(supabase, tenant) {
  const periodEndDate = startOfToday();
  const periodStartDate = addDays(periodEndDate, -7);
  const periodStart = dateKey(periodStartDate);
  const periodEnd = dateKey(periodEndDate);
  const calls = await fetchCallsWithScores(supabase, tenant.id, periodStartDate.toISOString());
  const groups = groupBy(calls, resolveAgentName);
  const latestInsights = await fetchLatestAgentInsights(supabase, tenant.id);
  const saved = [];

  for (const [agentName, agentCalls] of groups.entries()) {
    if (agentCalls.length < 3) continue;

    try {
      const stats = summarizeAgentWeek(agentCalls);
      const priorities = priorityList(agentCalls);
      const prompt = buildCoachingPrompt(agentName, periodStart, periodEnd, stats, priorities);
      const coachingSummary = await callClaude(COACHING_SYSTEM_PROMPT, prompt);
      const { error } = await supabase.from("agent_coaching").upsert({
        tenant_id: tenant.id,
        agent_name: agentName,
        period_start: periodStart,
        period_end: periodEnd,
        stats: {
          ...stats,
          agent_30d: latestInsights.get(agentName) || null,
        },
        coaching_summary: coachingSummary,
        coaching_priorities: priorities,
        generated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,agent_name,period_start,period_end" });

      if (error) throw error;
      saved.push(agentName);
    } catch (agentError) {
      console.error("[weekly-coaching] Agent failed:", tenant.id, agentName, agentError);
    }
  }

  return { tenant_id: tenant.id, agents_considered: groups.size, coaching_rows: saved.length };
}

export default async () => {
  try {
    const supabase = getSupabase();
    const { data: tenants, error } = await supabase
      .from("tenants")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) throw error;

    const results = [];
    for (const tenant of tenants || []) {
      try {
        results.push(await processTenant(supabase, tenant));
      } catch (tenantError) {
        console.error("[weekly-coaching] Tenant failed:", tenant.id, tenantError);
        results.push({ tenant_id: tenant.id, error: tenantError.message });
      }
    }

    return json(200, { ok: true, tenants: results.length, results });
  } catch (error) {
    console.error("[weekly-coaching] Failed:", error);
    return json(500, { ok: false, error: error.message });
  }
};

export const config = {
  schedule: "0 11 * * 1",
};
