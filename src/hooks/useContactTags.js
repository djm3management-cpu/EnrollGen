import { useCallback, useEffect, useRef, useState } from 'react';
import { useTenantConfig } from './useTenantConfig';
import { useCurrentAgent } from './useCurrentAgent';

const TAGS_CHANGED = 'enrollgen:contact-tags-changed';

export function useContactTags(contactIds) {
  const { supabaseClient, tenant } = useTenantConfig();
  const { agentUuid } = useCurrentAgent();
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  const idsKey = JSON.stringify([...new Set(contactIds.filter(Boolean))].sort());
  const tenantId = tenant?.id;
  const workspaceKey = `${tenantId}:${agentUuid}:${idsKey}`;
  const currentWorkspace = useRef(workspaceKey);
  currentWorkspace.current = workspaceKey;
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    if (!supabaseClient || !tenantId || !agentUuid) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const ids = JSON.parse(idsKey), result = [];
      for (let offset = 0; offset < ids.length; offset += 200) {
        const { data, error: err } = await supabaseClient.rpc('read_contact_tags', {
          p_tenant_id: tenantId, p_requesting_agent_id: agentUuid, p_contact_ids: ids.slice(offset, offset + 200),
        });
        if (err) throw err;
        result.push(...(data || []));
      }
      if (version === generation.current) setTags(result);
    } catch (err) { if (version === generation.current) setError(err.message || 'Tags could not be loaded.'); }
    finally { if (version === generation.current) setLoading(false); }
  }, [supabaseClient, tenantId, agentUuid, idsKey]);

  useEffect(() => {
    const requestState = generation;
    setTags([]);
    void refresh();
    const changed = () => { void refresh(); };
    window.addEventListener(TAGS_CHANGED, changed);
    return () => { requestState.current++; window.removeEventListener(TAGS_CHANGED, changed); };
  }, [refresh]);

  const mutate = async (name, args) => {
    setSaving(true); setError('');
    try {
      if (!agentUuid || !tenantId || !supabaseClient) throw new Error('Your workspace is still connecting.');
      const { error: err } = await supabaseClient.rpc(name, { ...args, p_requesting_agent_id: agentUuid });
      if (err) throw err;
      if (currentWorkspace.current !== workspaceKey) return;
      window.dispatchEvent(new CustomEvent(TAGS_CHANGED));
      await refresh();
    } catch (err) { setError(err.message || 'Tag could not be saved.'); throw err; }
    finally { setSaving(false); }
  };
  return { tags, loading, error, saving, refresh,
    add: (contactId, name) => mutate('add_contact_tag', { p_tenant_id: tenantId, p_contact_id: contactId, p_name: name }),
    remove: (tagId) => mutate('remove_contact_tag', { p_tag_id: tagId }),
  };
}
