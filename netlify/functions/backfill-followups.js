import { createClient } from "@supabase/supabase-js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const PAGE_SIZE = 1000;

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase service-role env vars not configured");
  return createClient(url, serviceRoleKey);
}

function isAuthorized(request) {
  const secret = process.env.BACKFILL_SECRET || process.env.KNOWLEDGE_UPDATE_SECRET;
  if (!secret) return true;
  return request.headers.get("x-backfill-secret") === secret
    || request.headers.get("x-knowledge-update-secret") === secret;
}

function addDays(dateValue, days) {
  const base = dateValue ? new Date(dateValue) : new Date();
  const validBase = Number.isNaN(base.getTime()) ? new Date() : base;
  validBase.setDate(validBase.getDate() + days);
  return validBase.toISOString().slice(0, 10);
}

function clampFollowupDays(value) {
  const days = Number.parseInt(value, 10);
  if (!Number.isFinite(days)) return 30;
  return Math.min(60, Math.max(14, days));
}

function resolveAgentName(row) {
  return row.writing_agent || row.agent_name || null;
}

function customerName(row) {
  return [row.customer_first_name, row.customer_last_name].filter(Boolean).join(" ")
    || row.beneficiary_name
    || null;
}

function toFollowupRow(row) {
  const risk = row.beneficiary_risk || {};
  const enrollmentDate = row.effective_date
    || (row.call_start ? String(row.call_start).slice(0, 10) : String(row.created_at).slice(0, 10));
  const followupDays = clampFollowupDays(risk.recommended_followup_days);

  return {
    tenant_id: row.tenant_id,
    call_id: row.id,
    agent_name: resolveAgentName(row),
    customer_name: customerName(row),
    carrier_name: row.carrier_name || null,
    plan_name: row.plan_name || null,
    enrollment_date: enrollmentDate,
    risk_level: risk.disenrollment_risk,
    risk_reason: risk.disenrollment_risk_reason || null,
    recommended_followup_date: addDays(`${enrollmentDate}T00:00:00`, followupDays),
    updated_at: new Date().toISOString(),
  };
}

async function fetchPage(supabase, from, to) {
  const { data, error } = await supabase
    .from("call_records")
    .select("id, tenant_id, agent_name, writing_agent, beneficiary_name, customer_first_name, customer_last_name, carrier_name, plan_name, effective_date, call_start, created_at, beneficiary_risk")
    .not("tenant_id", "is", null)
    .order("created_at", { ascending: true })
    .range(from, to);

  if (error) throw error;
  return data || [];
}

async function upsertFollowups(supabase, rows) {
  if (rows.length === 0) return 0;
  const { error } = await supabase
    .from("followup_queue")
    .upsert(rows, { onConflict: "call_id" });

  if (error) throw error;
  return rows.length;
}

export default async (request) => {
  if (!["GET", "POST"].includes(request.method)) {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!isAuthorized(request)) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  try {
    const supabase = getSupabase();
    let scanned = 0;
    let queued = 0;

    for (let from = 0; ; from += PAGE_SIZE) {
      const rows = await fetchPage(supabase, from, from + PAGE_SIZE - 1);
      scanned += rows.length;

      const followups = rows
        .filter((row) => {
          const risk = row.beneficiary_risk?.disenrollment_risk;
          return risk === "medium" || risk === "high";
        })
        .map(toFollowupRow);

      queued += await upsertFollowups(supabase, followups);

      if (rows.length < PAGE_SIZE) break;
    }

    return json(200, {
      ok: true,
      scanned,
      queued,
    });
  } catch (error) {
    console.error("[backfill-followups] Failed:", error);
    return json(500, {
      ok: false,
      error: error?.message || String(error),
    });
  }
};
