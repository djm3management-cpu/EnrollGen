import { requireClerkAuth } from "./_clerkAuth.js";
import {
  DEFAULT_CARRIER_OPTIONS,
  DEFAULT_COMPLIANCE_CONFIG,
  DEFAULT_COOP_RATES,
  findTenantByOrg,
  getSupabase,
  isAdminAuth,
  json,
  normalizeAgents,
  normalizeComplianceConfig,
  normalizeCoopRates,
  normalizeLicensedStates,
  normalizeStringArray,
  readFirst,
  safeText,
  seedScriptTemplatesForTenant,
} from "./_tenantSettings.js";

const TENANT_SELECT = [
  "id",
  "name",
  "clerk_org_id",
  "agency_display_name",
  "agency_npn",
  "licensed_states",
  "ghl_webhook_url",
  "ghl_location_id",
  "carrier_options",
  "coop_rates",
  "compliance_config",
  "created_at",
  "updated_at",
].join(", ");

function textValue(body, keys) {
  const field = readFirst(body, keys);
  return field.found ? { found: true, value: safeText(field.value) } : field;
}

function bodyOrgId(body, auth) {
  const provided = textValue(body, ["clerk_org_id", "clerkOrgId", "org_id", "orgId"]);
  return auth.orgId || provided.value || "";
}

function buildTenantPayload(body, existing, orgId) {
  const isNew = !existing;
  const payload = { clerk_org_id: orgId };
  const errors = [];

  const agencyName = textValue(body, ["agency_name", "agencyName", "name"]);
  const agencyDisplayName = textValue(body, [
    "agency_display_name",
    "agencyDisplayName",
    "display_name",
    "displayName",
  ]);
  const agencyNpn = textValue(body, ["agency_npn", "agencyNpn", "npn"]);
  const ghlWebhookUrl = textValue(body, ["ghl_webhook_url", "ghlWebhookUrl", "webhook_url"]);
  const ghlLocationId = textValue(body, ["ghl_location_id", "ghlLocationId", "location_id"]);

  const resolvedName =
    agencyName.value ||
    agencyDisplayName.value ||
    existing?.name ||
    existing?.agency_display_name ||
    "New Agency";

  if (agencyName.found || isNew) payload.name = resolvedName;
  if (agencyDisplayName.found || isNew) {
    payload.agency_display_name = agencyDisplayName.value || resolvedName;
  }
  if (agencyNpn.found || isNew) payload.agency_npn = agencyNpn.value || null;
  if (ghlWebhookUrl.found || isNew) payload.ghl_webhook_url = ghlWebhookUrl.value || null;
  if (ghlLocationId.found || isNew) payload.ghl_location_id = ghlLocationId.value || null;

  const licensedStates = readFirst(body, ["licensed_states", "licensedStates", "states"]);
  if (licensedStates.found) {
    const normalized = normalizeLicensedStates(licensedStates.value);
    if (!normalized) errors.push("licensed_states must be an array or comma-separated state list.");
    else payload.licensed_states = normalized;
  } else if (isNew) {
    payload.licensed_states = [];
  }

  const carrierOptions = readFirst(body, ["carrier_options", "carrierOptions", "carriers"]);
  if (carrierOptions.found) {
    const normalized = normalizeStringArray(carrierOptions.value);
    if (!normalized) errors.push("carrier_options must be an array or comma-separated list.");
    else payload.carrier_options = normalized;
  } else if (isNew) {
    payload.carrier_options = DEFAULT_CARRIER_OPTIONS;
  }

  const coopRates = readFirst(body, ["coop_rates", "coopRates"]);
  if (coopRates.found) {
    const normalized = normalizeCoopRates(coopRates.value);
    if (!normalized) errors.push("coop_rates must be an object keyed by carrier name.");
    else payload.coop_rates = normalized;
  } else if (isNew) {
    payload.coop_rates = DEFAULT_COOP_RATES;
  }

  const complianceConfig = readFirst(body, ["compliance_config", "complianceConfig"]);
  if (complianceConfig.found) {
    const normalized = normalizeComplianceConfig(complianceConfig.value);
    if (!normalized) errors.push("compliance_config must be a JSON object.");
    else payload.compliance_config = normalized;
  } else if (isNew) {
    payload.compliance_config = DEFAULT_COMPLIANCE_CONFIG;
  }

  return { payload, errors };
}

function getAgentsFromBody(body) {
  const field = readFirst(body, ["agents", "tenant_agents", "tenantAgents"], [
    "",
    "tenant",
    "profile",
    "agency",
  ]);

  if (!field.found) return { agents: [], errors: [] };
  if (!Array.isArray(field.value)) {
    return { agents: [], errors: ["agents must be an array."] };
  }

  return { agents: normalizeAgents(field.value), errors: [] };
}

function isBootstrapOnly(body) {
  const field = readFirst(body, ["bootstrap_only", "bootstrapOnly"]);
  if (!field.found) return false;
  if (typeof field.value === "boolean") return field.value;
  return ["true", "1", "yes"].includes(String(field.value || "").trim().toLowerCase());
}

async function upsertTenant(supabase, existing, payload) {
  if (existing?.id) {
    const { data, error } = await supabase
      .from("tenants")
      .update(payload)
      .eq("id", existing.id)
      .select(TENANT_SELECT)
      .single();

    if (error) throw error;
    return { tenant: data, created: false };
  }

  const { data, error } = await supabase
    .from("tenants")
    .upsert(payload, { onConflict: "clerk_org_id" })
    .select(TENANT_SELECT)
    .single();

  if (error) throw error;
  return { tenant: data, created: true };
}

async function upsertAgents(supabase, tenantId, agents) {
  if (!agents.length) return 0;

  const rows = agents.map((agent) => ({
    ...agent,
    tenant_id: tenantId,
  }));

  const { data, error } = await supabase
    .from("tenant_agents")
    .upsert(rows, { onConflict: "tenant_id,name" })
    .select("id");

  if (error) throw error;
  return data?.length || 0;
}

export default async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const auth = await requireClerkAuth(request);
  if (auth.response) return auth.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  try {
    const orgId = bodyOrgId(body, auth);
    if (!orgId) {
      return json(400, {
        error: "Missing Clerk organization",
        detail: "Create or select a Clerk organization before seeding a tenant.",
      });
    }

    const supabase = getSupabase();
    const existing = await findTenantByOrg(supabase, orgId);
    const bootstrapOnly = isBootstrapOnly(body);
    if (existing && bootstrapOnly) {
      const { agents, errors: agentErrors } = getAgentsFromBody(body);
      if (agentErrors.length) {
        return json(400, {
          error: "Invalid tenant seed payload",
          details: agentErrors,
        });
      }

      const agentsUpserted = isAdminAuth(auth)
        ? await upsertAgents(supabase, existing.id, agents)
        : 0;

      return json(200, {
        tenant: existing,
        created: false,
        counts: {
          agents_upserted: agentsUpserted,
          script_templates_copied: 0,
        },
        script_templates: { copied: 0, skipped: true, reason: "existing tenant" },
      });
    }

    if (existing && !isAdminAuth(auth)) {
      return json(403, {
        error: "Forbidden",
        detail: "Only organization admins can update an existing tenant.",
      });
    }

    const { payload, errors: tenantErrors } = buildTenantPayload(body, existing, orgId);
    const { agents, errors: agentErrors } = getAgentsFromBody(body);
    const errors = [...tenantErrors, ...agentErrors];

    if (errors.length) {
      return json(400, {
        error: "Invalid tenant seed payload",
        details: errors,
      });
    }

    const { tenant, created } = await upsertTenant(supabase, existing, payload);
    const agentsUpserted = await upsertAgents(supabase, tenant.id, agents);
    const scriptTemplates = created
      ? await seedScriptTemplatesForTenant(supabase, tenant.id)
      : { copied: 0, skipped: true, reason: "existing tenant" };

    return json(200, {
      tenant,
      created,
      counts: {
        agents_upserted: agentsUpserted,
        script_templates_copied: scriptTemplates.copied || 0,
      },
      script_templates: scriptTemplates,
    });
  } catch (error) {
    console.error("[seed-new-tenant] failed:", error);
    return json(500, {
      error: "Unable to seed tenant",
      detail: error.message || String(error),
    });
  }
};

export const config = { path: "/api/seed-new-tenant" };
