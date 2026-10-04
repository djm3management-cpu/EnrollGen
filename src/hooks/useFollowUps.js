import { useCallback, useEffect, useRef, useState } from 'react';
import { useTenantConfig } from './useTenantConfig';
import { useCurrentAgent } from './useCurrentAgent';
import { FOLLOW_UPS_UPDATED, notifyFollowUpsUpdated, updateFollowUp } from '../lib/followUps';

export function useFollowUps() {
  const { tenantId, supabaseClient, agents, loading: tenantLoading, error: tenantError } = useTenantConfig();
  const { agentUuid, agentSlug, isAdmin } = useCurrentAgent();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!tenantId || !supabaseClient || !agentUuid) {
      setRows([]); setLoading(tenantLoading); setError(tenantLoading ? '' : tenantError || 'Your agent account must be linked to this workspace.');
      return;
    }
    setLoading(true); setError('');
    try {
      const all = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error: readError } = await supabaseClient.from('follow_ups')
          .select('id, contact_id, agent_id, due_at, reason, status').eq('tenant_id', tenantId).eq('status', 'open')
          .order('due_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499);
        if (readError) throw readError;
        all.push(...(data || []));
        if (!data || data.length < 500) break;
      }
      if (request === generation.current) { setRows(all); setNow(new Date()); }
    } catch (err) {
      if (request === generation.current) { setRows([]); setError(err.message || 'Follow-ups unavailable.'); }
    } finally { if (request === generation.current) setLoading(false); }
  }, [tenantId, supabaseClient, agentUuid, tenantLoading, tenantError]);
  useEffect(() => {
    setRows([]); void refresh();
    const update = () => { void refresh(); };
    window.addEventListener(FOLLOW_UPS_UPDATED, update);
    const timer = setInterval(update, 60000);
    return () => { generation.current += 1; clearInterval(timer); window.removeEventListener(FOLLOW_UPS_UPDATED, update); };
  }, [refresh]);
  const update = async (id, action, dueAt) => {
    await updateFollowUp(supabaseClient, tenantId, id, action, dueAt);
    notifyFollowUpsUpdated();
  };
  return { rows, loading, error, refresh, update, agents, agentSlug, isAdmin, now };
}
