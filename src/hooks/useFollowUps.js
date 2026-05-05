import { useCallback, useEffect, useMemo, useState } from "react";
import { useTenantConfig } from "./useTenantConfig";

const VALID_STATUSES = new Set(["pending", "contacted", "cleared", "at_risk", "disenrolled"]);

function isOverdue(row) {
  if (row.followup_status !== "pending" || !row.recommended_followup_date) return false;
  const due = new Date(row.recommended_followup_date);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return due < today;
}

export function useFollowUps() {
  const { tenantId, supabaseClient, loading: tenantLoading, error: tenantError } = useTenantConfig();
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (tenantLoading) return undefined;
    if (!tenantId) {
      setFollowups([]);
      setLoading(false);
      setError(tenantError || "Tenant unavailable.");
      return undefined;
    }

    async function load() {
      setLoading(true);
      setError("");
      try {
        const { data, error } = await supabaseClient
          .from("followup_queue")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("recommended_followup_date", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (!cancelled) setFollowups(data || []);
      } catch (error) {
        if (!cancelled) {
          setFollowups([]);
          setError(error.message || "Follow-ups unavailable.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabaseClient, tenantError, tenantId, tenantLoading]);

  const updateStatus = useCallback(async (id, newStatus) => {
    if (!id || !VALID_STATUSES.has(newStatus)) return { error: "Invalid status" };
    const previous = followups;
    setFollowups((rows) => rows.map((row) => (
      row.id === id ? { ...row, followup_status: newStatus, updated_at: new Date().toISOString() } : row
    )));

    const { data, error } = await supabaseClient
      .from("followup_queue")
      .update({ followup_status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      setFollowups(previous);
      setError(error.message || "Follow-up update failed.");
      return { error };
    }

    setFollowups((rows) => rows.map((row) => (row.id === id ? data : row)));
    return { data };
  }, [followups, supabaseClient]);

  const overdue = useMemo(() => followups.filter(isOverdue), [followups]);
  const highRisk = useMemo(() => followups.filter((row) => row.risk_level === "high"), [followups]);

  return { followups, overdue, highRisk, loading, error, updateStatus };
}
