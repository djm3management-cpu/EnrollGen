import { useCallback, useEffect, useRef, useState } from "react";
import { useTenantConfig } from "./useTenantConfig";

// CRM data access. All queries run through the tenant-scoped
// authenticated Supabase client; RLS enforces isolation.
//
// Plaintext PII columns (first_name, last_name, phone, email, dob,
// address) are column-privilege-revoked from the `authenticated` role
// (see migration 023) — selecting them directly fails with "permission
// denied for column". Reads go through the masked/initials columns
// below by default, or through decrypt_pii() via useContactPii() when
// an agent explicitly reveals a record. mbi_last4 is deliberately NOT
// in that set (migration 024) — same low-sensitivity "last 4 only"
// tier as phone_last4, per the original design in migration 017.
const CONTACT_SAFE_COLUMNS =
  "id, tenant_id, status, source, assigned_agent_id, county, state, zip, medicare_parts, current_carrier, current_plan, mbi_last4, do_not_call, ghl_contact_id, first_initial, last_initial, phone_last4, email_set, dob_set, created_at, updated_at";

// PII fields decrypt_pii() can return, merged onto the safe-column
// row once an agent reveals a contact. mbi_full has no backing column
// on contacts at all (write-only into pii_encrypted via
// update_pii_field(), see migration 025) — decrypt_pii() surfaces it
// dynamically the same as any other pii_encrypted key.
const PII_FIELD_KEYS = ["first_name", "last_name", "dob", "phone", "email", "address", "mbi_full"];

const PII_AUTO_HIDE_MS = 30_000;

export function useContactsList(searchTerm, requestingAgentId) {
  const {
    supabaseClient,
    tenant,
    loading: tenantLoading,
    error: tenantError,
  } = useTenantConfig();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabaseClient) {
      // Do not spin forever when the workspace client never arrived
      // (tenant bootstrap failed); surface the reason instead.
      if (!tenantLoading) {
        setLoading(false);
        setError(tenantError || "Workspace connection not ready. Reload the page.");
      }
      return;
    }
    setLoading(true);
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
          p_query: term,
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

      let query = supabaseClient
        .from("contacts")
        .select(CONTACT_SAFE_COLUMNS)
        .order("updated_at", { ascending: false })
        .limit(200);

      if (matchedIds) query = query.in("id", matchedIds);

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      const rows = data || [];
      const intelByContact = {};
      const messageByContact = {};
      const activityByContact = {};
      if (rows.length) {
        const { data: intel } = await supabaseClient
          .from("contact_lead_intel")
          .select("contact_id, lead_score, churn_risk, vendor_source, received_at")
          .in("contact_id", rows.map((row) => row.id))
          .order("received_at", { ascending: false });
        for (const entry of intel || []) {
          if (!intelByContact[entry.contact_id]) intelByContact[entry.contact_id] = entry;
        }

        const contactIds = rows.map((row) => row.id);
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
          lead_intel: intelByContact[row.id] || null,
          last_message: messageByContact[row.id] || null,
          last_activity: activityByContact[row.id] || null,
        }))
      );
    } catch (err) {
      console.error("[useContactsList] load failed:", err);
      setError(err.message || "Contacts unavailable.");
    } finally {
      setLoading(false);
    }
  }, [supabaseClient, searchTerm, requestingAgentId, tenantLoading, tenantError]);

  useEffect(() => {
    refresh();
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

export function useContactMutations() {
  const { supabaseClient, tenant } = useTenantConfig();

  const updateContact = useCallback(
    async (contactId, updates) => {
      const { data, error } = await supabaseClient
        .from("contacts")
        .update(updates)
        .eq("id", contactId)
        .select(CONTACT_SAFE_COLUMNS)
        .single();
      if (error) throw error;
      return data;
    },
    [supabaseClient]
  );

  const createContact = useCallback(
    async (fields) => {
      const { data, error } = await supabaseClient
        .from("contacts")
        .insert({ tenant_id: tenant?.id, source: "manual", ...fields })
        .select(CONTACT_SAFE_COLUMNS)
        .single();
      if (error) throw error;
      return data;
    },
    [supabaseClient, tenant]
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
    addNote,
    toggleNotePin,
    updateLeadIntel,
    addPolicy,
    updatePolicy,
    addFollowUp,
    setFollowUpStatus,
  };
}

// Prefers real name/phone (available once revealed, or in contexts
// that still carry them e.g. server-side lead intake). Falls back to
// the masked-safe initials/last4 columns, which are always readable.
export function contactDisplayName(contact) {
  const name = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (contact?.phone) return contact.phone;
  const initials = [contact?.first_initial, contact?.last_initial ? `${contact.last_initial}.` : null]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (initials) return initials;
  if (contact?.phone_last4) return `Contact --${contact.phone_last4}`;
  return "Unknown contact";
}

// Contact-level PII reveal: one decrypt_pii() call fetches every
// sensitive field at once (cheaper + fewer audit rows than per-field
// RPCs), merged onto the safe-column row by the caller. Auto-hides
// after 30s of inactivity and resets whenever the contact changes,
// so decrypted values never linger in memory longer than displayed.
export function useContactPii(contactId, requestingAgentId) {
  const { supabaseClient } = useTenantConfig();
  const [piiFields, setPiiFields] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState(null);
  const hideTimerRef = useRef(null);
  const activityHandlerRef = useRef(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (activityHandlerRef.current) {
      window.removeEventListener("mousemove", activityHandlerRef.current);
      window.removeEventListener("keydown", activityHandlerRef.current);
      activityHandlerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearHideTimer();
    setRevealed(false);
    setPiiFields(null);
  }, [clearHideTimer]);

  const armAutoHide = useCallback(() => {
    clearHideTimer();
    const schedule = () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(hide, PII_AUTO_HIDE_MS);
    };
    activityHandlerRef.current = schedule;
    window.addEventListener("mousemove", schedule);
    window.addEventListener("keydown", schedule);
    schedule();
  }, [clearHideTimer, hide]);

  const reveal = useCallback(
    async (action = "view") => {
      if (!supabaseClient || !contactId) return null;
      if (!requestingAgentId) {
        console.warn(
          "[useContactPii] no tenant_agents match for the signed-in user — check that your tenant_agents row has agent_slug (or clerk_user_id) set correctly."
        );
        setError("Your agent account isn't linked to a tenant_agents record, so PII can't be revealed. Contact an admin.");
        return null;
      }
      setRevealing(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabaseClient.rpc("decrypt_pii", {
          p_contact_id: contactId,
          p_requesting_agent_id: requestingAgentId,
          p_action: action,
        });
        if (rpcError) throw rpcError;
        const fields = {};
        for (const key of PII_FIELD_KEYS) {
          if (data && key in data) fields[key] = data[key];
        }
        setPiiFields(fields);
        setRevealed(true);
        armAutoHide();
        return fields;
      } catch (err) {
        console.error("[useContactPii] reveal failed:", err);
        setError(err.message || "Could not reveal PII.");
        return null;
      } finally {
        setRevealing(false);
      }
    },
    [supabaseClient, contactId, requestingAgentId, armAutoHide]
  );

  const logCopy = useCallback(() => {
    if (!supabaseClient || !contactId || !requestingAgentId) return;
    supabaseClient
      .rpc("log_pii_access", { p_contact_id: contactId, p_requesting_agent_id: requestingAgentId, p_action: "export" })
      .then(({ error: logError }) => {
        if (logError) console.error("[useContactPii] copy log failed:", logError.message);
      });
  }, [supabaseClient, contactId, requestingAgentId]);

  // Keep a locally-revealed field in sync with an edit the agent just
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
        throw new Error("Your agent account isn't linked to a tenant_agents record, so PII can't be edited.");
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
    hide();
  }, [contactId, hide]);

  useEffect(() => clearHideTimer, [clearHideTimer]);

  return { piiFields, revealed, revealing, error, reveal, hide, logCopy, patchField, updatePiiField };
}
