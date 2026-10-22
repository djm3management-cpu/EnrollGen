import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppAuth } from '../context/AuthContext';
import { useTenantConfig } from './useTenantConfig';
import { loadCallLog, loadCallLogPages } from '../lib/callLogApi';
const EMPTY_ROWS = [];

// Both CRM surfaces use the authenticated, tenant-bound v_call_log endpoint.
// In particular, never substitute the script timer from call_records for Talk.
export function useCallLogRows(filters = {}, { allPages = false, enabled = true } = {}) {
  const { getToken } = useAppAuth();
  const { supabaseClient, tenant, loading: tenantLoading, error: tenantError } = useTenantConfig();
  const filterKey = JSON.stringify(filters);
  const stableFilters = useMemo(() => JSON.parse(filterKey), [filterKey]);
  const key = `${tenant?.id || ''}:${filterKey}:${allPages}:${enabled}`;
  const version = useRef(null);
  const [state, setState] = useState({ key: null, rows: [], count: 0, loading: enabled, error: null });
  const refresh = useCallback(async ({ background = false } = {}) => {
    const request = Symbol();
    version.current = request;
    if (!enabled || !supabaseClient) {
      setState({ key, rows: [], count: 0, loading: enabled && tenantLoading,
        error: enabled && !tenantLoading ? tenantError || 'Workspace connection not ready. Reload the page.' : null });
      return;
    }
    setState(previous => ({ ...(previous.key === key ? previous : { rows: [], count: 0 }), key, loading: background && previous.key === key ? previous.loading : true, error: null }));
    try {
      const result = allPages
        ? await loadCallLogPages(getToken, stableFilters, () => request !== version.current)
        : await loadCallLog(getToken, stableFilters);
      if (request !== version.current) return;
      const rows = allPages ? result : result.rows || [];
      setState({ key, rows, count: allPages ? rows.length : result.count || 0, loading: false, error: null });
    } catch (error) {
      if (request === version.current) setState(previous => ({ ...(previous.key === key ? previous : { rows: [], count: 0 }), key, loading: false, error: error.message || 'Calls unavailable. Please try again.' }));
    }
  }, [key, enabled, supabaseClient, tenantLoading, tenantError, getToken, allPages, stableFilters]);
  useEffect(() => {
    void refresh();
    const onRefresh = () => void refresh({ background: true });
    window.addEventListener('focus', onRefresh);
    window.addEventListener('crm-calls-updated', onRefresh);
    return () => {
      version.current = null;
      window.removeEventListener('focus', onRefresh);
      window.removeEventListener('crm-calls-updated', onRefresh);
    };
  }, [refresh]);
  const current = state.key === key ? state : { rows: EMPTY_ROWS, count: 0, loading: enabled, error: null };
  return { ...current, refresh };
}
