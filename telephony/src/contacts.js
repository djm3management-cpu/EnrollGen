import { supabase } from "./supabase.js";
import { config } from "./config.js";
import { normalizePhoneE164 } from "./phone.js";

// Matching rule: tenant + normalized phone. If no match, create a
// contact so the call and lead intel always have somewhere to land.
export async function findOrCreateContactByPhone({
  phone,
  tenantId = config.defaultTenantId,
  source = "fmo_transfer",
  fields = {},
}) {
  const normalized = normalizePhoneE164(phone);
  if (!normalized) {
    return { contact: null, created: false, error: "unparseable phone" };
  }

  const { data: existing, error: findError } = await supabase
    .from("contacts")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("phone", normalized)
    .maybeSingle();

  if (findError) return { contact: null, created: false, error: findError.message };
  if (existing) return { contact: existing, created: false };

  const { data: created, error: insertError } = await supabase
    .from("contacts")
    .insert({
      tenant_id: tenantId,
      phone: normalized,
      source,
      status: "lead",
      ...fields,
    })
    .select("*")
    .single();

  if (insertError) {
    // Concurrent insert can lose the unique (tenant, phone) race;
    // re-read before giving up.
    const { data: retry } = await supabase
      .from("contacts")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("phone", normalized)
      .maybeSingle();
    if (retry) return { contact: retry, created: false };
    return { contact: null, created: false, error: insertError.message };
  }

  return { contact: created, created: true };
}

export async function latestLeadIntel(contactId) {
  const { data } = await supabase
    .from("contact_lead_intel")
    .select("lead_score, churn_risk, vendor_source, received_at")
    .eq("contact_id", contactId)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

export async function logContactActivity({
  contactId,
  tenantId = config.defaultTenantId,
  type,
  refId = null,
  summary = null,
}) {
  const { error } = await supabase.from("contact_activities").insert({
    tenant_id: tenantId,
    contact_id: contactId,
    type,
    ref_id: refId,
    summary,
  });
  if (error) console.error("contact_activities insert failed:", error.message);
}
