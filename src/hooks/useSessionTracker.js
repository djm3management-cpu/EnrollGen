import { useRef, useCallback } from "react";
import { useAppAuth } from "../context/AuthContext";
import { getAuthSupabase } from "../lib/supabase";

const DISABLED = import.meta.env.VITE_DISABLE_CLERK_AUTH === "true";

const noop = () => {};
const STUB = {
  sessionId: null,
  startSession: noop,
  endSession: noop,
  logComplianceFlag: noop,
  logSectionScore: noop,
};

export function useSessionTracker() {
  const { getToken } = useAppAuth();
  const sessionIdRef = useRef(null);
  const agentIdRef = useRef(null);
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

  // Resolve or create the enrolled_agents row for this Clerk user
  const resolveAgentId = useCallback(async (sb, token) => {
    if (agentIdRef.current) return agentIdRef.current;
    try {
      const { data, error } = await sb
        .from("enrolled_agents")
        .select("id")
        .limit(1)
        .single();
      if (data) {
        agentIdRef.current = data.id;
        return data.id;
      }
      // Auto-create agent row if missing (RLS lets user insert their own)
      if (error?.code === "PGRST116") {
        const clerkUserId = getClerkSub(token);
        if (!clerkUserId) throw new Error("Could not extract sub from Clerk JWT");
        const { data: inserted, error: insertErr } = await sb
          .from("enrolled_agents")
          .insert({ clerk_user_id: clerkUserId, name: "Agent" })
          .select("id")
          .single();
        if (insertErr) throw insertErr;
        agentIdRef.current = inserted.id;
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
      const token = await getToken();
      if (!token) return;
      const sb = getAuthSupabase(token);
      const agentId = await resolveAgentId(sb, token);
      if (!agentId) return;

      const { data, error } = await sb
        .from("sessions")
        .insert({ agent_id: agentId, flow })
        .select("id")
        .single();
      if (error) throw error;
      sessionIdRef.current = data.id;
      startedAtRef.current = Date.now();
    } catch (err) {
      console.error("[SessionTracker] startSession:", err);
    }
  }, [getToken, resolveAgentId]);

  const endSession = useCallback(async (finalSection, completed = false) => {
    if (DISABLED || !sessionIdRef.current) return;
    try {
      const token = await getToken();
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
    } catch (err) {
      console.error("[SessionTracker] endSession:", err);
    }
  }, [getToken]);

  const logComplianceFlag = useCallback(async (sectionLabel, level, issueTag, confidence, message, addressed = false) => {
    if (DISABLED || !sessionIdRef.current) return;
    try {
      const token = await getToken();
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
  }, [getToken]);

  const logSectionScore = useCallback(async (sectionNumber, sectionLabel, completed, durationSeconds, checklistTotal, checklistDone) => {
    if (DISABLED || !sessionIdRef.current) return;
    try {
      const token = await getToken();
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
  }, [getToken]);

  if (DISABLED) return STUB;

  return {
    sessionId: sessionIdRef.current,
    startSession,
    endSession,
    logComplianceFlag,
    logSectionScore,
  };
}
