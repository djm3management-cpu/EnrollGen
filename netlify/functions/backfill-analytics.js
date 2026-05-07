import {
  getSupabase,
  processTenant,
} from "./nightly-analytics.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const NGHS_TENANT_ID = "00000000-0000-4000-8000-000000000001";
const NGHS_CLERK_ORG_ID = "org_3DHzWeCe9QZ4zmAYXCmUpGnDwfQ";

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function isAuthorized(request) {
  const secret = process.env.BACKFILL_SECRET || process.env.KNOWLEDGE_UPDATE_SECRET;
  if (!secret) return true;
  return request.headers.get("x-backfill-secret") === secret
    || request.headers.get("x-knowledge-update-secret") === secret;
}

async function maybeSingle(query) {
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data || null;
}

async function findNghsTenant(supabase) {
  const columns = "id, name, agency_display_name, clerk_org_id";

  const byId = await maybeSingle(
    supabase.from("tenants").select(columns).eq("id", NGHS_TENANT_ID)
  );
  if (byId) return byId;

  const byClerkOrg = await maybeSingle(
    supabase.from("tenants").select(columns).eq("clerk_org_id", NGHS_CLERK_ORG_ID)
  );
  if (byClerkOrg) return byClerkOrg;

  const { data: byName, error } = await supabase
    .from("tenants")
    .select(columns)
    .or("name.ilike.%New Gen Health%,agency_display_name.ilike.%New Gen Health%,name.ilike.%NGHS%,agency_display_name.ilike.%NGHS%")
    .limit(1);

  if (error) throw error;
  return byName?.[0] || null;
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
    const tenant = await findNghsTenant(supabase);

    if (!tenant) {
      return json(404, {
        ok: false,
        error: "NGHS tenant not found",
      });
    }

    const result = await processTenant(supabase, tenant);

    return json(200, {
      ok: true,
      tenant,
      result,
    });
  } catch (error) {
    console.error("[backfill-analytics] Failed:", error);
    return json(500, {
      ok: false,
      error: error?.message || String(error),
    });
  }
};
