import { useEffect, useMemo, useState } from 'react';
import { useTenantConfig } from './useTenantConfig';
import { useAvailability } from '../context/AvailabilityContext';
import { dayStart, shiftDays } from '../lib/dashboardMetrics';
import { dashboardAgents, selectDashboardScope } from '../lib/dashboardScope';

const PAGE_SIZE = 500;
const EMPTY_DATA = { calls: [], contactCounts: {}, enrolled: [], loading: true, error: null, updatedAt: null };
export function useDashboardData(userId, scope = 'self') {
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
        const [enrolled, calls, callLogs, contacts] = await Promise.all([
          pages(() => client.from('enrolled_agents').select('id, name, clerk_user_id')
            .eq('tenant_id', tenantId).order('id')),
          pages(() => client.from('call_records')
            .select('id, external_call_id, session_id, agent_id, call_start, call_duration_seconds, call_outcome, compliance_scorecard_id, compliance_scorecards!compliance_scorecards_call_id_fkey(id, overall_score, created_at, is_thread_composite)')
            .eq('tenant_id', tenantId)
            .gte('call_start', shiftDays(dayStart(now), -30).toISOString())
            .lt('call_start', now.toISOString()).order('call_start').order('id')),
          // Short phone/test calls are stored by the audio call timer in
          // call_logs rather than call_records. Shape them like dashboard
          // calls so they appear in Calls vs Sales (with no sale outcome).
          pages(() => client.from('call_logs')
            .select('id, call_id, agent_id, started_at, duration_seconds, billable')
            .gte('started_at', shiftDays(dayStart(now), -30).toISOString())
            .lt('started_at', now.toISOString()).order('started_at').order('id'))
            .catch((error) => {
              // Older databases may not have the optional phone-log table yet.
              // Keep the primary call_records dashboard usable while migration catches up.
              console.warn('[Dashboard] call_logs unavailable; showing enrollment calls only.', error?.message || error);
              return [];
            }),
          pages(() => client.from('contacts').select('id, assigned_agent_id')
            .eq('tenant_id', tenantId).order('id')),
        ]);
        const recordedCallIds = new Set(
          calls.flatMap((call) => [call.external_call_id, call.session_id].filter(Boolean))
        );
        const testCalls = callLogs
          .filter((log) => !recordedCallIds.has(log.call_id))
          .map((log) => ({
            id: `call-log:${log.id}`,
            agent_id: log.agent_id,
            call_start: log.started_at,
            call_duration_seconds: log.duration_seconds,
            call_outcome: null,
            compliance_scorecard_id: null,
            compliance_scorecards: [],
            source: 'call_log',
            billable: log.billable,
          }));
        const dashboardCalls = [...calls, ...testCalls].sort(
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
  }, [client, tenantId, userId, contextKey, tenantLoading, tenantError, version]);
  const current = state.contextKey === contextKey ? state : EMPTY_DATA;
  const agentOptions = useMemo(() => dashboardAgents(roster, current.enrolled), [roster, current.enrolled]);
  const scoped = useMemo(() => selectDashboardScope(current.calls, current.contactCounts, agentOptions, scope, userId), [current.calls, current.contactCounts, agentOptions, scope, userId]);
  return { ...current, ...scoped, agentOptions, refresh: () => setVersion(value => value + 1) };
}
