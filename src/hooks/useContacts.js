import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeContactPhone, normalizePhoneE164 } from "../lib/phone";
import { subscribeSms } from "../lib/smsEvents";
import { useTenantConfig } from "./useTenantConfig";

// CRM data access. All queries run through the tenant-scoped
// authenticated Supabase client; RLS enforces isolation.
//
// Read metadata directly, then hydrate full agent-visible details through an
// authenticated, audited RPC. Encryption stays inside Supabase.
const CONTACT_SAFE_COLUMNS =
  "id, tenant_id, status, source, assigned_agent_id, county, state, zip, medicare_parts, current_carrier, current_plan, mbi_last4, do_not_call, ghl_contact_id, first_initial, last_initial, phone_last4, email_set, dob_set, created_at, updated_at";

// PII fields decrypt_pii() can return, merged onto the safe-column
// row automatically for the agent UI. mbi_full has no backing column
// on contacts at all (write-only into pii_encrypted via
// update_pii_field(), see migration 025) — decrypt_pii() surfaces it
// dynamically the same as any other pii_encrypted key.
const PII_FIELD_KEYS = ["first_name", "last_name", "dob", "phone", "email", "address", "mbi_full"];

export function useContactsList(searchTerm, requestingAgentId) {
  const {
    supabaseClient,
    tenant,
    loading: tenantLoading,
    error: tenantError,
  } = useTenantConfig();
  const [contacts, setContacts] = useState([]);
  const detailsCache = useRef({ client: null, agent: null, rows: new Map() });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async ({ background = false } = {}) => {
    if (!supabaseClient) {
      // Do not spin forever when the workspace client never arrived
      // (tenant bootstrap failed); surface the reason instead.
      if (!tenantLoading) {
        setLoading(false);
        setError(tenantError || "Workspace connection not ready. Reload the page.");
      }
      return;
    }
    if (!background) setLoading(true);
    setError(null);
    try {
      const term = String(searchTerm || "").trim();
      let matchedIds = null;

      // Blind-index search: exact match only (no ilike/"contains" —
      // the underlying columns are HMAC hashes, not plaintext). This
      // is a real capability regression vs. the old ilike search,
      // inherent to searching without decrypting.
      if (term) {
        if (!requestingAgentId) {
          setContacts([]);
          setLoading(false);
          setError(null);
          return;
        }
        const { data: matches, error: searchError } = await supabaseClient.rpc("search_contacts_secure", {
          p_query: normalizePhoneE164(term) || term,
          p_requesting_agent_id: requestingAgentId,
        });
        if (searchError) throw searchError;
        matchedIds = (matches || []).map((row) => row.contact_id);
        if (matchedIds.length === 0) {
          setContacts([]);
          setLoading(false);
          setError(null);
          return;
        }
      }

      const rows = [];
      for (let offset = 0; ; offset += 200) {
        let query = supabaseClient.from("contacts").select(CONTACT_SAFE_COLUMNS)
          .order("updated_at", { ascending: false }).order("id")
          .range(offset, offset + 199);
        if (matchedIds) query = query.in("id", matchedIds);
        const { data, error: queryError } = await query;
        if (queryError) throw queryError;
        rows.push(...(data || []));
        if (!data || data.length < 200) break;
      }
      if (!requestingAgentId) throw new Error("Your agent account is still connecting. Contact details will load automatically.");
      if (detailsCache.current.client !== supabaseClient || detailsCache.current.agent !== requestingAgentId) {
        detailsCache.current = { client: supabaseClient, agent: requestingAgentId, rows: new Map() };
      }
      const cache = detailsCache.current.rows;
      const changed = rows.filter((row) => cache.get(row.id)?.updatedAt !== row.updated_at);
      for (let offset = 0; offset < changed.length; offset += 200) {
        const chunk = changed.slice(offset, offset + 200);
        const { data, error: detailsError } = await supabaseClient.rpc("read_contact_details", {
          p_contact_ids: chunk.map((row) => row.id), p_requesting_agent_id: requestingAgentId,
        });
        if (detailsError) throw detailsError;
        for (const row of chunk) {
          const details = data?.find((item) => item.contact_id === row.id);
          if (!details) throw new Error("Contact details could not be loaded. Please refresh.");
          cache.set(row.id, { updatedAt: row.updated_at, fields: details.fields });
        }
      }
      for (const id of cache.keys()) if (!rows.some((row) => row.id === id)) cache.delete(id);
      const intelByContact = {};
      const messageByContact = {};
      const activityByContact = {};
      for (let offset = 0; offset < rows.length; offset += 200) {
        const chunk = rows.slice(offset, offset + 200);
        const { data: intel } = await supabaseClient
          .from("contact_lead_intel")
          .select("contact_id, lead_score, churn_risk, vendor_source, received_at")
          .in("contact_id", chunk.map((row) => row.id))
          .order("received_at", { ascending: false });
        for (const entry of intel || []) {
          if (!intelByContact[entry.contact_id]) intelByContact[entry.contact_id] = entry;
        }

        const contactIds = chunk.map((row) => row.id);
        const { data: messages, error: messageError } = await supabaseClient
          .from("messages")
          .select("contact_id, body, direction, status, created_at")
          .in("contact_id", contactIds)
          .order("created_at", { ascending: false })
          .limit(600);
        if (!messageError) {
          for (const entry of messages || []) {
            if (!messageByContact[entry.contact_id]) messageByContact[entry.contact_id] = entry;
          }
        }

        const { data: activities, error: activityError } = await supabaseClient
          .from("contact_activities")
          .select("contact_id, type, summary, occurred_at")
          .in("contact_id", contactIds)
          .order("occurred_at", { ascending: false })
          .limit(600);
        if (!activityError) {
          for (const entry of activities || []) {
            if (!activityByContact[entry.contact_id]) activityByContact[entry.contact_id] = entry;
          }
        }
      }

      setContacts(
        rows.map((row) => ({
          ...row,
          ...cache.get(row.id)?.fields,
          lead_intel: intelByContact[row.id] || null,
          last_message: messageByContact[row.id] || null,
          last_activity: activityByContact[row.id] || null,
        }))
      );
    } catch (err) {
      console.error("[useContactsList] load failed:", err);
      setError(err.message || "Contacts unavailable.");
    } finally {
      if (!background) setLoading(false);
    }
  }, [supabaseClient, searchTerm, requestingAgentId, tenantLoading, tenantError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const refreshInBackground = () => refresh({ background: true });
    const unsubscribe = subscribeSms((event) => {
      // Read receipts only change badges, which useUnreadMessages refreshes.
      if (event?.type === "sms") refreshInBackground();
    });
    const timer = window.setInterval(refreshInBackground, 20000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, [refresh]);

  return { contacts, loading, error, refresh, tenantId: tenant?.id || null };
}

export function useContactDetail(contactId) {
  const { supabaseClient, loading: tenantLoading, error: tenantError } = useTenantConfig();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(Boolean(contactId));
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!contactId) return;
    if (!supabaseClient) {
      if (!tenantLoading) {
        setLoading(false);
        setError(tenantError || "Workspace connection not ready. Reload the page.");
      }
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [contactRes, intelRes, activityRes, notesRes, followUpsRes, policiesRes, callsRes] =
        await Promise.all([
          supabaseClient.from("contacts").select(CONTACT_SAFE_COLUMNS).eq("id", contactId).single(),
          supabaseClient
            .from("contact_lead_intel")
            .select("*")
            .eq("contact_id", contactId)
            .order("received_at", { ascending: false })
            .limit(5),
          supabaseClient
            .from("contact_activities")
            .select("*")
            .eq("contact_id", contactId)
            .order("occurred_at", { ascending: false })
            .limit(100),
          supabaseClient
            .from("contact_notes")
            .select("*")
            .eq("contact_id", contactId)
            .order("pinned", { ascending: false })
            .order("created_at", { ascending: false }),
          supabaseClient
            .from("follow_ups")
            .select("*")
            .eq("contact_id", contactId)
            .order("due_at", { ascending: true }),
          supabaseClient
            .from("policies")
            .select("*")
            .eq("contact_id", contactId)
            .order("effective_date", { ascending: false }),
          supabaseClient
            .from("call_records")
            .select("id, call_start, call_duration_seconds, call_outcome, product_type, carrier_name, plan_name, enrollment_completed, agent_name, recording_url, recording_storage_path")
            .eq("contact_id", contactId)
            .order("call_start", { ascending: false })
            .limit(50),
        ]);

      if (contactRes.error) throw contactRes.error;

      setBundle({
        contact: contactRes.data,
        leadIntel: intelRes.data || [],
        activities: activityRes.data || [],
        notes: notesRes.data || [],
        followUps: followUpsRes.data || [],
        policies: policiesRes.data || [],
        calls: callsRes.data || [],
      });
    } catch (err) {
      console.error("[useContactDetail] load failed:", err);
      setError(err.message || "Contact unavailable.");
    } finally {
      setLoading(false);
    }
  }, [supabaseClient, contactId, tenantLoading, tenantError]);

  useEffect(() => {
    setBundle(null);
    refresh();
  }, [refresh]);

  return { bundle, loading, error, refresh };
}

export function useContactMutations(requestingAgentId) {
  const { supabaseClient, tenant } = useTenantConfig();

  const contactError = useCallback(async (error, phone, contactId) => {
    if (error.code !== "23505") throw error;
    let duplicate = null;
    if (phone && requestingAgentId) {
      const result = await supabaseClient.rpc("match_contacts_by_phone", {
        p_phones: [phone], p_requesting_agent_id: requestingAgentId,
      });
      duplicate = result.data?.find((row) => row.id !== contactId);
    }
    const friendly = new Error("A contact already uses this phone number.");
    friendly.duplicateId = duplicate?.id;
    friendly.phone = phone;
    throw friendly;
  }, [supabaseClient, requestingAgentId]);

  const mergeContacts = useCallback(async (contactId, duplicateId, phone) => {
    const { error } = await supabaseClient.rpc("merge_contacts_secure", {
      p_keep_id: contactId, p_duplicate_id: duplicateId, p_phone: phone,
      p_requesting_agent_id: requestingAgentId,
    });
    if (error) throw error;
  }, [supabaseClient, requestingAgentId]);

  const updateContact = useCallback(
    async (contactId, updates) => {
      updates = normalizeContactPhone(updates);
      const { data, error } = await supabaseClient
        .from("contacts")
        .update(updates)
        .eq("id", contactId)
        .select(CONTACT_SAFE_COLUMNS)
        .single();
      if (error) await contactError(error, updates.phone, contactId);
      return data;
    },
    [supabaseClient, contactError]
  );

  const createContact = useCallback(
    async (fields) => {
      fields = normalizeContactPhone(fields);
      const { data, error } = await supabaseClient
        .from("contacts")
        .insert({ tenant_id: tenant?.id, source: "manual", ...fields })
        .select(CONTACT_SAFE_COLUMNS)
        .single();
      if (error) await contactError(error, fields.phone);
      return data;
    },
    [supabaseClient, tenant, contactError]
  );

  const addNote = useCallback(
    async ({ contactId, agentId, body }) => {
      const { error } = await supabaseClient.from("contact_notes").insert({
        tenant_id: tenant?.id,
        contact_id: contactId,
        agent_id: agentId || null,
        body,
      });
      if (error) throw error;
      await supabaseClient.from("contact_activities").insert({
        tenant_id: tenant?.id,
        contact_id: contactId,
        type: "note",
        summary: body.slice(0, 120),
      });
    },
    [supabaseClient, tenant]
  );

  const toggleNotePin = useCallback(
    async (noteId, pinned) => {
      const { error } = await supabaseClient
        .from("contact_notes")
        .update({ pinned })
        .eq("id", noteId);
      if (error) throw error;
    },
    [supabaseClient]
  );

  const updateLeadIntel = useCallback(
    async (intelId, updates) => {
      const { data, error } = await supabaseClient
        .from("contact_lead_intel")
        .update(updates)
        .eq("id", intelId)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    [supabaseClient]
  );

  const addPolicy = useCallback(
    async ({ contactId, fields }) => {
      const { data, error } = await supabaseClient
        .from("policies")
        .insert({ tenant_id: tenant?.id, contact_id: contactId, ...fields })
        .select("*")
        .single();
      if (error) throw error;

      const policyLabel =
        [fields.product_line, fields.carrier, fields.plan_name].filter(Boolean).join(" ") || "Policy";
      await supabaseClient.from("contact_activities").insert({
        tenant_id: tenant?.id,
        contact_id: contactId,
        type: "enrollment",
        ref_id: data.id,
        summary: `Policy added: ${policyLabel.slice(0, 120)}`,
      });
      return data;
    },
    [supabaseClient, tenant]
  );

  const updatePolicy = useCallback(
    async (policyId, updates) => {
      const { data, error } = await supabaseClient
        .from("policies")
        .update(updates)
        .eq("id", policyId)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    [supabaseClient]
  );

  const addFollowUp = useCallback(
    async ({ contactId, agentId, dueAt, reason }) => {
      const { error } = await supabaseClient.from("follow_ups").insert({
        tenant_id: tenant?.id,
        contact_id: contactId,
        agent_id: agentId || null,
        due_at: dueAt,
        reason,
      });
      if (error) throw error;
      await supabaseClient.from("contact_activities").insert({
        tenant_id: tenant?.id,
        contact_id: contactId,
        type: "follow_up",
        summary: reason ? `Follow-up scheduled: ${reason.slice(0, 100)}` : "Follow-up scheduled",
      });
    },
    [supabaseClient, tenant]
  );

  const setFollowUpStatus = useCallback(
    async (followUpId, status) => {
      const { error } = await supabaseClient
        .from("follow_ups")
        .update({ status })
        .eq("id", followUpId);
      if (error) throw error;
    },
    [supabaseClient]
  );

  return {
    updateContact,
    createContact,
    mergeContacts,
    addNote,
    toggleNotePin,
    updateLeadIntel,
    addPolicy,
    updatePolicy,
    addFollowUp,
    setFollowUpStatus,
  };
}

// Prefers real name/phone (available once useContactPii's decrypt_pii
// call resolves, or in contexts that still carry them e.g. server-side
// lead intake). Falls back to the initials/last4 columns while that
// load is in flight.
export function contactDisplayName(contact) {
  const name = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (contact?.phone) return contact.phone;
  return "Unknown contact";
}

// Automatically load full contact details; Supabase handles encryption, tenant
// access checks, and audit logging without agent-facing reveal controls.
export function useContactPii(contactId, requestingAgentId) {
  const { supabaseClient } = useTenantConfig();
  const [piiFields, setPiiFields] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!supabaseClient || !contactId) return null;
    if (!requestingAgentId) {
      console.warn(
        "[useContactPii] no tenant_agents match for the signed-in user — check that your tenant_agents row has agent_slug (or clerk_user_id) set correctly."
      );
      setError("Your agent account isn't linked to a tenant_agents record, so contact details cannot load. Contact an admin.");
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabaseClient.rpc("decrypt_pii", {
        p_contact_id: contactId,
        p_requesting_agent_id: requestingAgentId,
        p_action: "view",
      });
      if (rpcError) throw rpcError;
      const fields = {};
      for (const key of PII_FIELD_KEYS) {
        if (data && key in data) fields[key] = data[key];
      }
      setPiiFields(fields);
      return fields;
    } catch (err) {
      console.error("[useContactPii] load failed:", err);
      setError(err.message || "Could not load contact details.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [supabaseClient, contactId, requestingAgentId]);

  const logCopy = useCallback(() => {
    if (!supabaseClient || !contactId || !requestingAgentId) return;
    supabaseClient
      .rpc("log_pii_access", { p_contact_id: contactId, p_requesting_agent_id: requestingAgentId, p_action: "export" })
      .then(({ error: logError }) => {
        if (logError) console.error("[useContactPii] copy log failed:", logError.message);
      });
  }, [supabaseClient, contactId, requestingAgentId]);

  // Keep a locally-loaded field in sync with an edit the agent just
  // made, without another decrypt_pii round trip.
  const patchField = useCallback((field, value) => {
    setPiiFields((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  // Fields with no backing column on contacts (mbi_full, ssn) — write
  // directly into pii_encrypted via update_pii_field() instead of the
  // normal contacts.update() path, which only knows real columns.
  const updatePiiField = useCallback(
    async (field, value) => {
      if (!supabaseClient || !contactId || !requestingAgentId) {
        throw new Error("Your agent account isn't linked to a tenant_agents record, so contact details cannot be edited.");
      }
      const { error: rpcError } = await supabaseClient.rpc("update_pii_field", {
        p_contact_id: contactId,
        p_requesting_agent_id: requestingAgentId,
        p_field: field,
        p_value: value,
      });
      if (rpcError) throw rpcError;
      patchField(field, value || null);
    },
    [supabaseClient, contactId, requestingAgentId, patchField]
  );

  useEffect(() => {
    setPiiFields(null);
    load();
  }, [contactId, requestingAgentId, load]);

  return { piiFields, loading, error, reload: load, logCopy, patchField, updatePiiField };
}
