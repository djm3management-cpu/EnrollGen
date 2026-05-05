import { useRef, useCallback } from "react";
import { useAppAuth } from "../context/AuthContext";
import { getAuthSupabase } from "../lib/supabase";
import { fetchTenantConfig } from "../lib/postCallPipeline";

const DISABLED = import.meta.env.VITE_DISABLE_CLERK_AUTH === "true";
const EMPTY_SESSION_METADATA = {
  agentId: null,
  agentName: null,
  sessionId: null,
  callRecordId: null,
  transcriptId: null,
};

const noop = () => {};
const STUB = {
  sessionId: null,
  startSession: noop,
  endSession: noop,
  logComplianceFlag: noop,
  logSectionScore: noop,
};
let activeSessionMetadata = { ...EMPTY_SESSION_METADATA };

function setActiveSessionMetadata(patch) {
  activeSessionMetadata = {
    ...activeSessionMetadata,
    ...patch,
  };
}

export function setActivePostCallMetadata(patch) {
  setActiveSessionMetadata(patch);
}

export function getActiveSessionMetadata() {
  return activeSessionMetadata;
}

export async function waitForActiveSessionMetadata(timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (activeSessionMetadata.agentId && activeSessionMetadata.sessionId) {
      return activeSessionMetadata;
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
  }

  return activeSessionMetadata;
}

export function useSessionTracker() {
  const { getToken } = useAppAuth();
  const sessionIdRef = useRef(null);
  const agentIdRef = useRef(null);
  const tenantIdRef = useRef(null);
  const startedAtRef = useRef(null);

  // Extract the Clerk user ID (sub claim) from a JWT
  const getClerkSub = useCallback((token) => {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.sub || null;
    } catch {
      return null;
    }
  }, []);

  const getSupabaseToken = useCallback(async () => {
    try {
      const token = await getToken({ template: "supabase" });
      if (token) return token;
    } catch {
      // Fall back to the default Clerk token for local/dev JWT setups.
    }
    return getToken();
  }, [getToken]);

  const resolveTenantId = useCallback(async (sb) => {
    if (tenantIdRef.current) return tenantIdRef.current;
    try {
      const tenant = await fetchTenantConfig(sb);
      tenantIdRef.current = tenant?.id || null;
      return tenantIdRef.current;
    } catch (err) {
      console.error("[SessionTracker] resolveTenantId:", err);
      return null;
    }
  }, []);

  // Resolve or create the enrolled_agents row for this Clerk user
  const resolveAgentId = useCallback(async (sb, token, tenantId) => {
    if (agentIdRef.current) return agentIdRef.current;
    const clerkUserId = getClerkSub(token);
    try {
      const query = sb.from("enrolled_agents").select("id, name").limit(1);
      if (tenantId) query.eq("tenant_id", tenantId);
      if (clerkUserId) query.eq("clerk_user_id", clerkUserId);
      const { data, error } = await query.single();
      if (data) {
        agentIdRef.current = data.id;
        setActiveSessionMetadata({ agentId: data.id, agentName: data.name || "Agent" });
        return data.id;
      }
      // Auto-create agent row if missing (RLS lets user insert their own)
      if (error?.code === "PGRST116") {
        if (!clerkUserId) throw new Error("Could not extract sub from Clerk JWT");
        if (!tenantId) throw new Error("Could not resolve tenant for Clerk organization");
        const { data: inserted, error: insertErr } = await sb
          .from("enrolled_agents")
          .insert({ tenant_id: tenantId, clerk_user_id: clerkUserId, name: "Agent" })
          .select("id")
          .single();
        if (insertErr) throw insertErr;
        agentIdRef.current = inserted.id;
        setActiveSessionMetadata({ agentId: inserted.id, agentName: "Agent" });
        return inserted.id;
      }
      if (error) throw error;
    } catch (err) {
      console.error("[SessionTracker] resolveAgentId:", err);
      return null;
    }
  }, [getClerkSub]);

  const startSession = useCallback(async (flow = "ma") => {
    if (DISABLED) return;
    try {
      const token = await getSupabaseToken();
      if (!token) return;
      const sb = getAuthSupabase(token);
      const tenantId = await resolveTenantId(sb);
      const agentId = await resolveAgentId(sb, token, tenantId);
      if (!agentId) return;
      setActiveSessionMetadata({ agentId });
      const sessionPayload = { agent_id: agentId, flow };
      if (tenantId) sessionPayload.tenant_id = tenantId;

      const { data, error } = await sb
        .from("sessions")
        .insert(sessionPayload)
        .select("id")
        .single();
      if (error) throw error;
      sessionIdRef.current = data.id;
      startedAtRef.current = Date.now();
      setActiveSessionMetadata({ sessionId: data.id, callRecordId: null, transcriptId: null });
    } catch (err) {
      console.error("[SessionTracker] startSession:", err);
    }
  }, [getSupabaseToken, resolveAgentId, resolveTenantId]);

  const endSession = useCallback(async (finalSection, completed = false) => {
    if (DISABLED || !sessionIdRef.current) return;
    try {
      const token = await getSupabaseToken();
      if (!token) return;
      const sb = getAuthSupabase(token);
      const durationSeconds = startedAtRef.current
        ? Math.round((Date.now() - startedAtRef.current) / 1000)
        : null;

      const { error } = await sb
        .from("sessions")
        .update({
          ended_at: new Date().toISOString(),
          final_section: finalSection ?? null,
          completed,
          duration_seconds: durationSeconds,
        })
        .eq("id", sessionIdRef.current);
      if (error) throw error;
      sessionIdRef.current = null;
      setActiveSessionMetadata({ sessionId: null });
    } catch (err) {
      console.error("[SessionTracker] endSession:", err);
    }
  }, [getSupabaseToken]);

  const logComplianceFlag = useCallback(async (sectionLabel, level, issueTag, confidence, message, addressed = false) => {
    if (DISABLED || !sessionIdRef.current) return;
    try {
      const token = await getSupabaseToken();
      if (!token) return;
      const sb = getAuthSupabase(token);

      const { error } = await sb
        .from("compliance_flags")
        .insert({
          session_id: sessionIdRef.current,
          section_label: sectionLabel,
          level,
          issue_tag: issueTag || null,
          confidence: confidence != null ? Math.round(confidence) : null,
          message: message || null,
          addressed,
        });
      if (error) throw error;
    } catch (err) {
      console.error("[SessionTracker] logComplianceFlag:", err);
    }
  }, [getSupabaseToken]);

  const logSectionScore = useCallback(async (sectionNumber, sectionLabel, completed, durationSeconds, checklistTotal, checklistDone) => {
    if (DISABLED || !sessionIdRef.current) return;
    try {
      const token = await getSupabaseToken();
      if (!token) return;
      const sb = getAuthSupabase(token);

      const { error } = await sb
        .from("section_scores")
        .insert({
          session_id: sessionIdRef.current,
          section_number: sectionNumber,
          section_label: sectionLabel,
          completed,
          duration_seconds: durationSeconds ?? null,
          checklist_total: checklistTotal ?? null,
          checklist_done: checklistDone ?? null,
        });
      if (error) throw error;
    } catch (err) {
      console.error("[SessionTracker] logSectionScore:", err);
    }
  }, [getSupabaseToken]);

  if (DISABLED) {
    activeSessionMetadata = { ...EMPTY_SESSION_METADATA };
    return STUB;
  }

  return {
    sessionId: sessionIdRef.current,
    startSession,
    endSession,
    logComplianceFlag,
    logSectionScore,
  };
}
