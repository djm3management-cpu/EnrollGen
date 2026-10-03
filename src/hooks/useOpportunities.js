import { useCallback, useEffect, useRef, useState } from 'react';
import { useTenantConfig } from './useTenantConfig';
import { useCurrentAgent } from './useCurrentAgent';
import { persistStageMove, stageStatus, opportunityFields } from '../lib/opportunities';

const UPDATED = 'enrollgen:opportunities-updated';
export function notifyOpportunitiesUpdated() {
  window.dispatchEvent(new Event(UPDATED));
}

export function useOpportunities(contactId = null) {
  const { supabaseClient, tenantId, agents, loading: tenantLoading, error: tenantError } = useTenantConfig();
  const { agentUuid, isAdmin } = useCurrentAgent();
  const [rows, setRows] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [stages, setStages] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingIds, setPendingIds] = useState(new Set());
  const pending = useRef(new Set());
  const generation = useRef(0);

  const refresh = useCallback(async ({ background = false } = {}) => {
    if (!supabaseClient || !tenantId || !agentUuid) {
      if (!tenantLoading) {
        setLoading(false);
        setError(tenantError || 'Your agent account must be linked to this workspace to use Opportunities.');
      }
      return;
    }
    const request = ++generation.current;
    if (!background) setLoading(true);
    setError('');
    try {
      const { error: seedError } = await supabaseClient.rpc('ensure_opportunities_pipeline', {
        p_tenant_id: tenantId, p_requesting_agent_id: agentUuid,
      });
      if (seedError) throw seedError;
      const meta = await Promise.all([
        supabaseClient.from('pipelines').select('*').eq('tenant_id', tenantId).order('created_at'),
        supabaseClient.from('pipeline_stages').select('*').eq('tenant_id', tenantId).order('position'),
        supabaseClient.from('lead_sources').select('id, name, active').eq('tenant_id', tenantId).order('name'),
      ]);
      for (const result of meta) if (result.error) throw result.error;
      const all = [];
      for (let offset = 0; ; offset += 200) {
        const { data, error: readError } = await supabaseClient.rpc('read_opportunities', {
          p_tenant_id: tenantId, p_requesting_agent_id: agentUuid, p_contact_id: contactId, p_offset: offset, p_limit: 200,
        });
        if (readError) throw readError;
        all.push(...(data || []));
        if (!data || data.length < 200) break;
      }
      if (request !== generation.current) return;
      setPipelines(meta[0].data || []); setStages(meta[1].data || []); setSources(meta[2].data || []);
      setRows((current) => all.map((row) => pending.current.has(row.id) ? current.find((item) => item.id === row.id) || row : row));
    } catch (err) {
      if (request === generation.current) setError(err.message || 'Opportunities could not be loaded.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [supabaseClient, tenantId, agentUuid, tenantLoading, tenantError, contactId]);

  useEffect(() => {
    setRows([]);
    void refresh();
    return () => { generation.current += 1; };
  }, [refresh]);

  useEffect(() => {
    const update = () => { void refresh({ background: true }); };
    window.addEventListener(UPDATED, update);
    return () => window.removeEventListener(UPDATED, update);
  }, [refresh]);

  const moveStage = useCallback(async (id, stageId) => {
    const before = rows.find((row) => row.id === id);
    const stage = stages.find((item) => item.id === stageId);
    if (!before || !stage || before.stage_id === stageId || pending.current.has(id)) return;
    generation.current += 1;
    pending.current.add(id); setPendingIds(new Set(pending.current)); setError('');
    setRows((current) => current.map((row) => row.id === id ? { ...row, stage_id: stageId, pipeline_id: stage.pipeline_id,
      status: stageStatus(stage), stage_entered_at: new Date().toISOString() } : row));
    try {
      const saved = await persistStageMove(supabaseClient, before, stageId, agentUuid);
      setRows((current) => current.map((row) => row.id === id ? { ...row, ...saved } : row));
    } catch (err) {
      setRows((current) => current.map((row) => row.id === id ? before : row));
      setError(err.message || 'Stage move failed. The card was restored.');
      throw err;
    } finally {
      // A read begun before the RPC committed must not overwrite its result.
      generation.current += 1;
      pending.current.delete(id); setPendingIds(new Set(pending.current));
    }
  }, [rows, stages, supabaseClient, agentUuid]);

  const save = useCallback(async (fields, existing = null) => {
    const { data, error: saveError } = await supabaseClient.rpc('save_opportunity', {
      p_tenant_id: tenantId, p_requesting_agent_id: agentUuid, p_fields: opportunityFields(fields),
      p_opportunity_id: existing?.id || null, p_expected_updated_at: existing?.updated_at || null,
    });
    if (saveError) throw saveError;
    notifyOpportunitiesUpdated();
    return data;
  }, [supabaseClient, tenantId, agentUuid]);

  return { rows, pipelines, stages, sources, agents, loading, error, setError, pendingIds, moveStage, save, refresh,
    supabaseClient, tenantId, agentUuid, isAdmin };
}
