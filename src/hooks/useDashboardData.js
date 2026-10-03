import { loadCallLogPages } from '../lib/callLogApi';
import { useEffect, useMemo, useState } from 'react';
import { useTenantConfig } from './useTenantConfig';
import { useAvailability } from '../context/AvailabilityContext';
import { dayStart, shiftDays } from '../lib/dashboardMetrics';
import { dashboardAgents, selectDashboardScope } from '../lib/dashboardScope';
import { useAppAuth } from '../context/AuthContext';
import { getEvidenceSupabase } from '../lib/evidenceSupabase';

const PAGE_SIZE = 500;
const EMPTY_DATA = { calls: [], contactCounts: {}, enrolled: [], loading: true, error: null, updatedAt: null };

function normalizeAgent(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function useDashboardData(userId, scope = 'self') {
  const { getToken } = useAppAuth();
  const { supabaseClient: client, tenant, agents, loading: tenantLoading, error: tenantError } = useTenantConfig();
  const availability = useAvailability();
  const currentSlug = availability?.agentId;
  const roster = useMemo(() => {
    const hasDirectIdentity = (agents || []).some((agent) => agent.clerk_user_id === userId);
    return (agents || []).map((agent) => {
      // A signed-in Clerk identity is authoritative. Availability can retain
      // a stale/local alias (for example M3 -> mark_endres) and must not
      // relabel another agent as the current user.
      if (hasDirectIdentity || agent.agent_slug !== currentSlug) return agent;
      return {
        ...agent,
        clerkUserIds: [agent.clerk_user_id, userId].filter(Boolean),
        clerk_user_id: userId,
      };
    });
  }, [agents, currentSlug, userId]);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState(EMPTY_DATA);
  const tenantId = tenant?.id;
  const contextKey = `${tenantId || ''}:${userId || ''}`;
  useEffect(() => {
    let cancelled = false;
    let busy = false;
    async function pages(query) {
      const rows = [];
      for (let offset = 0; !cancelled; offset += PAGE_SIZE) {
        const { data, error } = await query().range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
      }
      return rows;
    }
    async function refresh() {
      if (busy) return;
      if (!client || !tenantId || !userId) {
        setState({ ...EMPTY_DATA, contextKey, loading: tenantLoading, error: tenantLoading ? null : tenantError || 'Sign in to load your agent dashboard.' });
        return;
      }
      busy = true;
      try {
        const now = new Date();
        // Existing agency read access is enforced by RLS. Every query also pins the active tenant.
        const evidenceClient = getEvidenceSupabase(getToken);
        const [enrolled, calls, callLogs, contacts] = await Promise.all([
          pages(() => evidenceClient.from('enrolled_agents').select('id, name, clerk_user_id')
            .eq('tenant_id', tenantId).order('id')),
          pages(() => client.from('call_records')
            .select('id, external_call_id, session_id, agent_id, call_start, call_duration_seconds, call_outcome, compliance_scorecard_id, compliance_scorecards!compliance_scorecards_call_id_fkey(id, overall_score, created_at, is_thread_composite)')
            .eq('tenant_id', tenantId)
            .gte('call_start', shiftDays(dayStart(now), -30).toISOString())
            .lt('call_start', now.toISOString()).order('call_start').order('id')),
          loadCallLogPages(getToken, {
            from: shiftDays(dayStart(now), -30).toISOString(),
            to: now.toISOString(), ascending: '1',
          }, () => cancelled),
          pages(() => client.from('contacts').select('id, assigned_agent_id')
            .eq('tenant_id', tenantId).order('id')),
        ]);
        const recordedCallIds = new Set(
          calls.flatMap((call) => [call.id, call.external_call_id, call.session_id].filter(Boolean))
        );
        const enrolledByAgent = new Map();
        for (const agent of enrolled) {
          enrolledByAgent.set(normalizeAgent(agent.id), agent.id);
          enrolledByAgent.set(normalizeAgent(agent.name), agent.id);
        }
        for (const agent of roster) {
          const id = enrolled.find(item => item.clerk_user_id === agent.clerk_user_id)?.id;
          if (id) enrolledByAgent.set(normalizeAgent(agent.agent_slug), id);
        }
        const testCalls = callLogs
          .filter((log) => !recordedCallIds.has(log.call_record_id) && !recordedCallIds.has(log.inbound_call_id))
          .map((log) => ({
            id: `call-log:${log.log_id}`,
            agent_id: enrolledByAgent.get(normalizeAgent(log.agent)) || null,
            call_start: log.occurred_at,
            call_duration_seconds: log.duration_seconds,
            call_outcome: log.disposition || null,
            compliance_scorecard_id: null,
            compliance_scorecards: log.compliance_score == null ? [] : [{
              overall_score: Number(log.compliance_score),
              created_at: log.occurred_at,
              is_thread_composite: false,
            }],
            source: 'call_log',
            contact_id: log.contact_id,
            contact_name: log.contact_name,
            contact_phone: log.contact_phone,
            direction: log.direction,
            recording_url: log.recording_url,
            recording_storage_path: log.recording_storage_path,
            transcript_preview: log.transcript_preview,
            agent_notes: log.agent_notes,
          }));
        const measuredByRecord = new Map(callLogs.filter(log => log.call_record_id).map(log => [log.call_record_id, log.duration_seconds]));
        const measuredCalls = calls.map(call => ({ ...call, call_duration_seconds: measuredByRecord.get(call.id) ?? null }));
        const dashboardCalls = [...measuredCalls, ...testCalls].sort(
          (a, b) => new Date(a.call_start) - new Date(b.call_start) || String(a.id).localeCompare(String(b.id))
        );
        const contactCounts = Object.create(null);
        for (const contact of contacts) {
          const key = contact.assigned_agent_id || '';
          contactCounts[key] = (contactCounts[key] || 0) + 1;
        }
        if (!cancelled) setState({ contextKey, calls: dashboardCalls, contactCounts, enrolled, loading: false, error: null, updatedAt: now });
      } catch (error) {
        if (!cancelled) setState(previous => ({ ...previous, loading: false, error: error.message || 'Dashboard data could not be loaded.' }));
      } finally {
        busy = false;
      }
    }
    setState({ ...EMPTY_DATA, contextKey });
    refresh();
    const timer = window.setInterval(refresh, 60000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [client, tenantId, userId, contextKey, tenantLoading, tenantError, version, getToken, roster]);
  const current = state.contextKey === contextKey ? state : EMPTY_DATA;
  const agentOptions = useMemo(() => dashboardAgents(roster, current.enrolled), [roster, current.enrolled]);
  const scoped = useMemo(() => selectDashboardScope(current.calls, current.contactCounts, agentOptions, scope, userId), [current.calls, current.contactCounts, agentOptions, scope, userId]);
  return { ...current, ...scoped, agentOptions, refresh: () => setVersion(value => value + 1) };
}
