import { createClient } from "@supabase/supabase-js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ET_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  hourCycle: "h23",
});
const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
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

function inRange(value, start, end = null) {
  const time = new Date(value || 0).getTime();
  if (!Number.isFinite(time)) return false;
  if (time < start.getTime()) return false;
  return !end || time < end.getTime();
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

function customerName(row) {
  const full = [row.customer_first_name, row.customer_last_name].filter(Boolean).join(" ");
  return full || row.beneficiary_name || null;
}

function conversionRate(total, enrollments) {
  return total > 0 ? Math.round((enrollments / total) * 1000) / 10 : 0;
}

function durationMinutes(row) {
  const seconds = asNumber(row.call_duration_seconds);
  return seconds === null ? null : seconds / 60;
}

function summarizeCalls(calls) {
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
    avg_compliance_score: avg(calls.map((row) => row.overall_score), 1),
  };
}

function trend(current, previous, key) {
  const currentValue = asNumber(current[key]);
  const previousValue = asNumber(previous[key]);
  if (currentValue === null || previousValue === null) return null;
  return Math.round((currentValue - previousValue) * 10) / 10;
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

function etDayHour(value) {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = ET_PARTS.formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const day = DAY_INDEX[weekday];
  const hourValue = Number(hour);
  if (!Number.isFinite(day) || !Number.isFinite(hourValue)) return null;
  return { day_of_week: day, day_name: DAY_NAMES[day], hour_of_day: hourValue };
}

function durationBucket(seconds) {
  const value = Number(seconds || 0);
  if (value < 600) return "under_10min";
  if (value < 1200) return "10_20min";
  if (value < 1800) return "20_30min";
  if (value < 2400) return "30_40min";
  return "over_40min";
}

function clampFollowupDays(value) {
  const days = Number.parseInt(value, 10);
  if (!Number.isFinite(days)) return 30;
  return Math.min(60, Math.max(14, days));
}

async function fetchCallsWithScores(supabase, tenantId, sinceIso) {
  const { data: calls, error } = await supabase
    .from("call_records")
    .select("id, tenant_id, agent_name, writing_agent, beneficiary_name, customer_first_name, customer_last_name, call_outcome, enrollment_completed, call_duration_seconds, carrier_name, plan_name, effective_date, call_start, created_at, call_analytics, dg_sentiment, agent_assessment, beneficiary_risk")
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
    console.warn("[nightly-analytics] Could not fetch scorecards:", scoreError.message);
    return rows.map((row) => ({ ...row, overall_score: null }));
  }

  const scoreByCall = new Map();
  for (const scorecard of scorecards || []) {
    if (!scoreByCall.has(scorecard.call_id)) scoreByCall.set(scorecard.call_id, scorecard.overall_score);
  }

  return rows.map((row) => ({ ...row, overall_score: scoreByCall.get(row.id) ?? null }));
}

function buildAgentInsights(tenantId, calls, asOf, start30, start60) {
  const current = calls.filter((row) => inRange(row.created_at, start30));
  const previous = calls.filter((row) => inRange(row.created_at, start60, start30));
  const currentGroups = groupBy(current, resolveAgentName);
  const previousGroups = groupBy(previous, resolveAgentName);
  const periodStart = dateKey(start30);
  const periodEnd = dateKey(asOf);

  return Array.from(currentGroups.entries()).map(([agentName, agentCalls]) => {
    const stats = summarizeCalls(agentCalls);
    const previousStats = summarizeCalls(previousGroups.get(agentName) || []);
    return {
      tenant_id: tenantId,
      insight_type: "agent_30d",
      insight_key: agentName,
      insight_data: {
        agent_name: agentName,
        ...stats,
        previous_30d: previousStats,
        trend: {
          conversion_rate_delta: trend(stats, previousStats, "conversion_rate"),
          avg_sentiment_delta: trend(stats, previousStats, "avg_sentiment"),
          avg_rapport_delta: trend(stats, previousStats, "avg_rapport"),
          avg_listening_delta: trend(stats, previousStats, "avg_listening"),
        },
      },
      period_start: periodStart,
      period_end: periodEnd,
      computed_at: new Date().toISOString(),
    };
  });
}

function buildCarrierInsights(tenantId, calls, asOf, start30) {
  const enrolled = calls.filter((row) => inRange(row.created_at, start30) && isEnrolled(row) && row.carrier_name);
  const groups = groupBy(enrolled, (row) => row.carrier_name);
  const periodStart = dateKey(start30);
  const periodEnd = dateKey(asOf);

  return Array.from(groups.entries()).map(([carrierName, carrierCalls]) => ({
    tenant_id: tenantId,
    insight_type: "carrier_30d",
    insight_key: carrierName,
    insight_data: {
      carrier_name: carrierName,
      total_enrollments: carrierCalls.length,
      avg_call_duration: avg(carrierCalls.map(durationMinutes), 1),
      avg_sentiment: avg(carrierCalls.map((row) => nestedNumber(row.dg_sentiment, ["average_score"])), 2),
      high_risk_count: carrierCalls.filter((row) => row.beneficiary_risk?.disenrollment_risk === "high").length,
      avg_compliance_score: avg(carrierCalls.map((row) => row.overall_score), 1),
    },
    period_start: periodStart,
    period_end: periodEnd,
    computed_at: new Date().toISOString(),
  }));
}

function buildTimePatternInsight(tenantId, calls, asOf, start90) {
  const groups = groupBy(
    calls.filter((row) => inRange(row.created_at, start90)),
    (row) => {
      const parts = etDayHour(row.created_at);
      return parts ? `${parts.day_of_week}-${parts.hour_of_day}` : null;
    }
  );
  const patterns = Array.from(groups.entries()).map(([, rows]) => {
    const parts = etDayHour(rows[0].created_at);
    const total = rows.length;
    const enrollments = rows.filter(isEnrolled).length;
    return {
      ...parts,
      total_calls: total,
      enrollments,
      conversion_rate: conversionRate(total, enrollments),
    };
  }).sort((a, b) => b.conversion_rate - a.conversion_rate || b.total_calls - a.total_calls);

  return {
    tenant_id: tenantId,
    insight_type: "time_patterns",
    insight_key: "90d",
    insight_data: { patterns, best_pattern: patterns[0] || null },
    period_start: dateKey(start90),
    period_end: dateKey(asOf),
    computed_at: new Date().toISOString(),
  };
}

function buildDurationPatternInsight(tenantId, calls, asOf, start90) {
  const groups = groupBy(
    calls.filter((row) => inRange(row.created_at, start90) && Number(row.call_duration_seconds || 0) > 0),
    (row) => durationBucket(row.call_duration_seconds)
  );
  const patterns = Array.from(groups.entries()).map(([bucket, rows]) => {
    const total = rows.length;
    const enrollments = rows.filter(isEnrolled).length;
    return {
      duration_bucket: bucket,
      total_calls: total,
      enrollments,
      conversion_rate: conversionRate(total, enrollments),
    };
  }).sort((a, b) => b.conversion_rate - a.conversion_rate || b.total_calls - a.total_calls);

  return {
    tenant_id: tenantId,
    insight_type: "duration_patterns",
    insight_key: "90d",
    insight_data: { patterns, best_pattern: patterns[0] || null },
    period_start: dateKey(start90),
    period_end: dateKey(asOf),
    computed_at: new Date().toISOString(),
  };
}

function buildFollowupRows(tenantId, calls) {
  return calls
    .filter((row) => {
      const risk = row.beneficiary_risk?.disenrollment_risk;
      return isEnrolled(row) && (risk === "medium" || risk === "high");
    })
    .map((row) => {
      const enrollmentDate = row.effective_date
        || (row.call_start ? String(row.call_start).slice(0, 10) : String(row.created_at).slice(0, 10));
      const followupDays = clampFollowupDays(row.beneficiary_risk?.recommended_followup_days);
      return {
        tenant_id: tenantId,
        call_id: row.id,
        agent_name: resolveAgentName(row),
        customer_name: customerName(row),
        carrier_name: row.carrier_name || null,
        plan_name: row.plan_name || null,
        enrollment_date: enrollmentDate,
        risk_level: row.beneficiary_risk?.disenrollment_risk || "low",
        risk_reason: row.beneficiary_risk?.disenrollment_risk_reason || null,
        recommended_followup_date: dateKey(addDays(`${enrollmentDate}T00:00:00`, followupDays)),
        updated_at: new Date().toISOString(),
      };
    });
}

async function upsertRows(supabase, table, rows, onConflict) {
  if (rows.length === 0) return 0;
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw error;
  return rows.length;
}

async function processTenant(supabase, tenant) {
  const asOf = startOfToday();
  const start30 = addDays(asOf, -30);
  const start60 = addDays(asOf, -60);
  const start90 = addDays(asOf, -90);
  const calls = await fetchCallsWithScores(supabase, tenant.id, start90.toISOString());

  const insightRows = [
    ...buildAgentInsights(tenant.id, calls, asOf, start30, start60),
    ...buildCarrierInsights(tenant.id, calls, asOf, start30),
    buildTimePatternInsight(tenant.id, calls, asOf, start90),
    buildDurationPatternInsight(tenant.id, calls, asOf, start90),
  ];
  const followupRows = buildFollowupRows(tenant.id, calls);

  const insightCount = await upsertRows(
    supabase,
    "call_insights",
    insightRows,
    "tenant_id,insight_type,insight_key,period_start,period_end"
  );
  const followupCount = await upsertRows(supabase, "followup_queue", followupRows, "call_id");

  return { tenant_id: tenant.id, insights: insightCount, followups: followupCount };
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
        console.error("[nightly-analytics] Tenant failed:", tenant.id, tenantError);
        results.push({ tenant_id: tenant.id, error: tenantError.message });
      }
    }

    return json(200, { ok: true, tenants: results.length, results });
  } catch (error) {
    console.error("[nightly-analytics] Failed:", error);
    return json(500, { ok: false, error: error.message });
  }
};

export const config = {
  schedule: "0 6 * * *",
};
