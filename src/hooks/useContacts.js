import { useCallback, useEffect, useState } from "react";
import { useTenantConfig } from "./useTenantConfig";

// CRM data access. All queries run through the tenant-scoped
// authenticated Supabase client; RLS enforces isolation.

export function useContactsList(searchTerm) {
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
      let query = supabaseClient
        .from("contacts")
        .select("id, first_name, last_name, phone, email, status, source, assigned_agent_id, county, state, do_not_call, updated_at")
        .order("updated_at", { ascending: false })
        .limit(200);

      const term = String(searchTerm || "").trim();
      if (term) {
        const like = `%${term}%`;
        query = query.or(
          `first_name.ilike.${like},last_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`
        );
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      const rows = data || [];
      const intelByContact = {};
      if (rows.length) {
        const { data: intel } = await supabaseClient
          .from("contact_lead_intel")
          .select("contact_id, lead_score, churn_risk, vendor_source, received_at")
          .in("contact_id", rows.map((row) => row.id))
          .order("received_at", { ascending: false });
        for (const entry of intel || []) {
          if (!intelByContact[entry.contact_id]) intelByContact[entry.contact_id] = entry;
        }
      }

      setContacts(rows.map((row) => ({ ...row, lead_intel: intelByContact[row.id] || null })));
    } catch (err) {
      console.error("[useContactsList] load failed:", err);
      setError(err.message || "Contacts unavailable.");
    } finally {
      setLoading(false);
    }
  }, [supabaseClient, searchTerm, tenantLoading, tenantError]);

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
          supabaseClient.from("contacts").select("*").eq("id", contactId).single(),
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
            .select("id, call_start, call_duration_seconds, call_outcome, product_type, carrier_name, plan_name, enrollment_completed, agent_name")
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
        .select("*")
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
        .select("*")
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

  return { updateContact, createContact, addNote, toggleNotePin, addFollowUp, setFollowUpStatus };
}

export function contactDisplayName(contact) {
  const name = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim();
  return name || contact?.phone || "Unknown contact";
}
