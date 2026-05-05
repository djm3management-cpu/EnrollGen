import { createClient } from "@supabase/supabase-js";

export const NGHS_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const JSON_HEADERS = { "Content-Type": "application/json" };

export const DEFAULT_CARRIER_OPTIONS = [
  "Devoted Health",
  "Aetna",
  "Elevance / Anthem",
  "UnitedHealthcare",
  "Humana",
  "Cigna / HealthSpring",
  "Wellcare / Centene",
  "Zing Health",
  "HCSC / BCBS",
  "Manhattan Life",
  "Other",
];

export const DEFAULT_COOP_RATES = {
  aetna: 150,
  cigna: 225,
  "cigna / healthspring": 225,
  elevance: 125,
  "elevance / anthem": 125,
  zing: 200,
  "zing health": 200,
};

export const DEFAULT_COMPLIANCE_CONFIG = {
  version: 1,
  source: "ComplianceScorer v3 defaults",
  categories: [
    {
      key: "call_opening",
      name: "Call Opening",
      weight: 10,
      cms_ref: "42 CFR sec. 422.2274(b); MMCM CH 2: 40.1.3",
      questions: [
        {
          id: "opening_agent_id",
          label: "Did the agent use the required call opening? (Name, licensing, agency, recording disclosure)",
          points: 4,
          weight: 40,
        },
        {
          id: "opening_beneficiary_name",
          label: "Did the agent identify the name of the primary beneficiary?",
          points: 2,
          weight: 20,
        },
        {
          id: "opening_recording_consent",
          label: "Did the agent obtain consent to continue on a recorded line?",
          points: 4,
          weight: 40,
        },
      ],
    },
    {
      key: "required_disclosures",
      name: "Required Disclosures",
      weight: 15,
      cms_ref: "42 CFR sec. 422.2267(e)(41); MMCM CH 2: 30.5",
      questions: [
        {
          id: "disclosures_tpmo",
          label: "Was the TPMO disclaimer read with actual org/plan counts for the beneficiary's area?",
          points: 5,
          weight: 33,
        },
        {
          id: "disclosures_tpmo_timing",
          label: "Was the TPMO disclaimer read within the first minute of the call?",
          points: 3,
          weight: 20,
        },
        {
          id: "disclosures_snp",
          label: "If applicable, was the SNP-specific disclosure provided?",
          points: 3,
          weight: 20,
        },
        {
          id: "disclosures_no_misleading",
          label: "Were all statements accurate with no misleading or unsubstantiated claims?",
          points: 4,
          weight: 27,
        },
      ],
    },
    {
      key: "scope_of_appointment",
      name: "Scope of Appointment",
      weight: 12,
      cms_ref: "42 CFR sec. 422.2260-2274; MMCM CH 2: 60",
      questions: [
        {
          id: "soa_poa_check",
          label: "Did the agent verify POA / decision-making authority?",
          points: 3,
          weight: 25,
        },
        {
          id: "soa_not_obligated",
          label: "Did the agent state the beneficiary is not obligated to enroll?",
          points: 4,
          weight: 33,
        },
        {
          id: "soa_products_permission",
          label: "Did the agent list product types and obtain permission to discuss them?",
          points: 5,
          weight: 42,
        },
      ],
    },
    {
      key: "eligibility_verification",
      name: "Eligibility Verification",
      weight: 15,
      cms_ref: "42 CFR sec. 422.50-422.74; MMCM CH 2: 40.2",
      questions: [
        {
          id: "elig_decision_authority",
          label: "Was decision-making authority confirmed?",
          points: 3,
          weight: 20,
        },
        {
          id: "elig_parts_ab",
          label: "Was the beneficiary confirmed to have active Parts A and B?",
          points: 4,
          weight: 27,
        },
        {
          id: "elig_election_period",
          label: "Was a valid election period determined?",
          points: 3,
          weight: 20,
        },
        {
          id: "elig_disqualifying",
          label: "Was a disqualifying coverage check performed?",
          points: 3,
          weight: 20,
        },
        {
          id: "elig_reason",
          label: "Was the reason for inquiry determined?",
          points: 1,
          weight: 7,
        },
        {
          id: "elig_priorities",
          label: "Were benefit priorities identified?",
          points: 1,
          weight: 6,
        },
      ],
    },
    {
      key: "needs_assessment",
      name: "Needs Assessment",
      weight: 10,
      cms_ref: "MMCM CH 2: 40.2.5 (PECL requirements)",
      questions: [
        {
          id: "needs_providers",
          label: "Did the agent ask about current doctors, specialists, and facilities?",
          points: 4,
          weight: 36,
        },
        {
          id: "needs_medications",
          label: "Did the agent ask about medications (names, dosages) and preferred pharmacy?",
          points: 4,
          weight: 36,
        },
        {
          id: "needs_recap",
          label: "Did the agent summarize/recap needs before recommending a plan?",
          points: 3,
          weight: 28,
        },
      ],
    },
    {
      key: "presentation_sob",
      name: "Presentation / SOB",
      weight: 13,
      cms_ref: "42 CFR sec. 422.111; MMCM CH 2: 40.3",
      questions: [
        {
          id: "sob_review",
          label: "Was the SOB reviewed (premium, deductible, MOOP, copays, drugs, extras)?",
          points: 4,
          weight: 27,
        },
        {
          id: "sob_network",
          label: "Was network status offered for provider, pharmacy, hospital?",
          points: 4,
          weight: 27,
        },
        {
          id: "sob_coverage_impact",
          label: "Was the coverage impact explained? (Plan replaces Original Medicare)",
          points: 3,
          weight: 20,
        },
        {
          id: "sob_disclosures",
          label: "Were all required SOB disclosures read?",
          points: 4,
          weight: 26,
        },
      ],
    },
    {
      key: "consent_for_enrollment",
      name: "Consent for Enrollment",
      weight: 10,
      cms_ref: "42 CFR sec. 422.2274(a); MMCM CH 2: 40.3.5",
      questions: [
        {
          id: "consent_plan_confirmed",
          label: "Were full plan name, type, and effective date confirmed?",
          points: 4,
          weight: 36,
        },
        {
          id: "consent_verbal",
          label: "Was explicit verbal consent obtained?",
          points: 4,
          weight: 36,
        },
        {
          id: "consent_subject_to_approval",
          label: "Was effective date stated as 'subject to approval by Medicare'?",
          points: 3,
          weight: 28,
        },
      ],
    },
    {
      key: "call_closing",
      name: "Call Closing",
      weight: 10,
      cms_ref: "MMCM CH 2: 40.4.1; 42 CFR sec. 422.111(h)(1)",
      questions: [
        {
          id: "closing_confirmation",
          label: "Was the confirmation/application number provided?",
          points: 3,
          weight: 30,
        },
        {
          id: "closing_carrier_number",
          label: "Was the carrier customer service number provided (with TTY)?",
          points: 3,
          weight: 30,
        },
        {
          id: "closing_rights",
          label: "Were EOC, cancellation rights, and appeal rights mentioned?",
          points: 2,
          weight: 20,
        },
        {
          id: "closing_next_steps",
          label: "Were next steps explained?",
          points: 2,
          weight: 20,
        },
      ],
    },
    {
      key: "consumer_experience",
      name: "Consumer Experience",
      weight: 5,
      cms_ref: "MMCM CH 2: 10.7",
      questions: [
        {
          id: "cx_call_duration",
          label: "Was call duration adequate? (>=8 minutes)",
          points: 3,
          weight: 38,
        },
        {
          id: "cx_section_order",
          label: "Were sections completed in proper order?",
          points: 3,
          weight: 38,
        },
        {
          id: "cx_warnings_volume",
          label: "Were compliance warnings minimal?",
          points: 2,
          weight: 24,
        },
      ],
    },
  ],
};

export function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

export function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readFirst(body, keys = [], scopes = ["", "tenant", "profile", "agency", "crm", "config"]) {
  for (const scopeName of scopes) {
    const scope = scopeName ? body?.[scopeName] : body;
    if (!isPlainObject(scope)) continue;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(scope, key)) {
        return { found: true, value: scope[key] };
      }
    }
  }
  return { found: false, value: undefined };
}

export function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value
          .map((item) => (typeof item === "string" || typeof item === "number" ? safeText(String(item)) : ""))
          .filter(Boolean)
      ),
    ];
  }

  if (typeof value === "string") {
    return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  }

  return null;
}

export function normalizeLicensedStates(value) {
  const states = normalizeStringArray(value);
  if (!states) return null;
  return states.map((state) => state.toUpperCase()).filter((state) => /^[A-Z]{2}$/.test(state));
}

export function normalizeCoopRates(value) {
  if (!isPlainObject(value)) return null;

  return Object.entries(value).reduce((acc, [rawKey, rawValue]) => {
    const key = safeText(rawKey).toLowerCase();
    if (!key) return acc;
    const amount = Number(rawValue);
    acc[key] = Number.isFinite(amount) ? amount : rawValue;
    return acc;
  }, {});
}

export function normalizeComplianceConfig(value) {
  return isPlainObject(value) ? value : null;
}

export function normalizeBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "active"].includes(normalized)) return true;
    if (["false", "0", "no", "inactive"].includes(normalized)) return false;
  }
  return fallback;
}

export function normalizeAgents(value) {
  const source = Array.isArray(value) ? value : [];

  return source
    .filter((agent) => isPlainObject(agent))
    .map((agent) => {
      const name = safeText(agent.name || agent.agent_name || agent.fullName);
      if (!name) return null;

      return {
        name,
        npn: safeText(agent.npn) || null,
        clerk_user_id: safeText(agent.clerk_user_id || agent.clerkUserId) || null,
        ghl_user_id: safeText(agent.ghl_user_id || agent.ghlUserId) || null,
        is_active: normalizeBoolean(agent.is_active ?? agent.isActive, true),
      };
    })
    .filter(Boolean);
}

export function isAdminAuth(auth) {
  if (auth?.userId === "dev-bypass") return true;

  const payload = auth?.tokenPayload || {};
  const candidates = [
    payload.org_role,
    payload.role,
    payload.public_metadata?.role,
    payload.private_metadata?.role,
    payload.metadata?.role,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return (
    candidates.includes("admin") ||
    candidates.includes("org:admin") ||
    candidates.includes("owner") ||
    payload.public_metadata?.isAdmin === true ||
    payload.metadata?.isAdmin === true
  );
}

export async function findTenantByOrg(supabase, orgId) {
  if (!orgId) return null;

  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("clerk_org_id", orgId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export function isMissingTableError(error, tableName) {
  const message = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`;
  return (
    error?.code === "42P01" ||
    (message.toLowerCase().includes(tableName.toLowerCase()) &&
      /does not exist|relation|schema cache/i.test(message))
  );
}

export async function seedScriptTemplatesForTenant(supabase, tenantId) {
  const check = await supabase.from("script_templates").select("id").limit(1);
  if (check.error) {
    if (isMissingTableError(check.error, "script_templates")) {
      return { copied: 0, skipped: true, reason: "script_templates table not found" };
    }
    throw check.error;
  }

  const existing = await supabase
    .from("script_templates")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (existing.error) throw existing.error;
  if ((existing.count || 0) > 0) {
    return { copied: 0, skipped: true, reason: "tenant already has script templates" };
  }

  let sourceName = "global";
  let source = await supabase
    .from("script_templates")
    .select("flow_type, version, sections")
    .is("tenant_id", null)
    .eq("is_active", true);

  if (source.error) throw source.error;

  if (!source.data?.length) {
    sourceName = "nghs";
    source = await supabase
      .from("script_templates")
      .select("flow_type, version, sections")
      .eq("tenant_id", NGHS_TENANT_ID)
      .eq("is_active", true);

    if (source.error) throw source.error;
  }

  if (!source.data?.length) {
    return { copied: 0, skipped: true, reason: "no source script templates found" };
  }

  const rows = source.data.map((template) => ({
    tenant_id: tenantId,
    flow_type: template.flow_type,
    version: template.version || 1,
    is_active: true,
    sections: template.sections,
  }));

  const { data, error } = await supabase
    .from("script_templates")
    .upsert(rows, { onConflict: "tenant_id,flow_type,version" })
    .select("id");

  if (error) throw error;
  return { copied: data?.length || 0, skipped: false, source: sourceName };
}

export function validateWebhookUrl(rawUrl) {
  const value = safeText(rawUrl);
  if (!value) throw new Error("Missing GHL webhook URL.");

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("GHL webhook URL is not a valid absolute URL.");
  }

  const allowInsecure = process.env.ALLOW_INSECURE_WEBHOOK_TESTS === "true";
  if (parsed.protocol !== "https:" && !(allowInsecure && parsed.protocol === "http:")) {
    throw new Error("GHL webhook URL must use HTTPS.");
  }

  const host = parsed.hostname.toLowerCase();
  const privateHostPattern =
    /^(localhost|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/;
  if (host.endsWith(".local") || privateHostPattern.test(host)) {
    throw new Error("GHL webhook URL cannot point to a local or private network host.");
  }

  return parsed.toString();
}

export async function postJsonWithTimeout(url, payload, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
