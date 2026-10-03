export const LINES_OF_BUSINESS = ['MA', 'Med Supp', 'ACA', 'U65', 'Annuity', 'Ancillary'];

// TODO: future opt-in inbound automation should call the same transactional RPC.
// Never create an opportunity from a call automatically in this MVP.
export const AUTO_CREATE_OPPS_FROM_CALLS = false;

export async function readOpportunityMetadata(client, tenantId, agentId) {
  const sourceArgs = { p_tenant_id: tenantId, p_requesting_agent_id: agentId };
  const results = await Promise.all([
    client.from('pipelines').select('*').eq('tenant_id', tenantId).order('created_at'),
    client.from('pipeline_stages').select('*').eq('tenant_id', tenantId).order('position'),
    // lead_sources is service-only and contains credentials/configuration.
    // The authenticated RPC returns exactly id/name, with identity binding.
    client.rpc('read_opportunity_sources', { ...sourceArgs, p_active_only: false }),
    client.rpc('read_opportunity_sources', { ...sourceArgs, p_active_only: true }),
  ]);
  for (const result of results) if (result.error) throw result.error;
  return { pipelines: results[0].data || [], stages: results[1].data || [],
    sources: results[2].data || [], activeSources: results[3].data || [] };
}

export function stageStatus(stage) {
  return stage?.is_won ? 'won' : stage?.is_lost ? 'lost' : 'open';
}

export function daysInStage(row, now = Date.now()) {
  const entered = Date.parse(row.stage_entered_at || row.created_at || '');
  return Number.isFinite(entered) ? Math.max(0, Math.floor((now - entered) / 86400000)) : 0;
}

// Display fallback for older/incomplete rows; this never changes stored data.
export function opportunityStatus(row, stage) {
  return ['open', 'won', 'lost'].includes(row.status) ? row.status : stageStatus(stage);
}

export function agentInitials(agent) {
  return (agent?.name || '').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || '—';
}

export function filterOpportunities(rows, filters) {
  const term = (filters.search || '').trim().toLocaleLowerCase();
  return rows.filter((row) => (!filters.pipeline || row.pipeline_id === filters.pipeline)
    && (!filters.agent || row.assigned_agent_id === filters.agent)
    && (!filters.lob || row.line_of_business === filters.lob)
    && (!filters.carrier || row.carrier === filters.carrier)
    && (!filters.source || row.lead_source_id === filters.source)
    && (!term || (row.contact_name || '').toLocaleLowerCase().includes(term)));
}

export function sortOpportunities(rows, key, direction, valueFor = (row) => row[key]) {
  return [...rows].sort((a, b) => {
    const left = valueFor(a) ?? '';
    const right = valueFor(b) ?? '';
    const result = typeof left === 'number' && typeof right === 'number'
      ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
    return direction === 'desc' ? -result : result;
  });
}

// A move is one RPC: stage, clock, history and the single event commit together.
export async function persistStageMove(client, row, stageId, agentId) {
  const { data, error } = await client.rpc('move_opportunity_stage', {
    p_opportunity_id: row.id,
    p_to_stage_id: stageId,
    p_requesting_agent_id: agentId,
    p_expected_stage_id: row.stage_id,
  });
  if (error) throw error;
  return data;
}

export const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0);

export function opportunityFields(row) {
  return Object.fromEntries(['pipeline_id', 'stage_id', 'contact_id', 'assigned_agent_id', 'title', 'line_of_business',
    'carrier', 'plan_name', 'effective_date', 'est_value', 'lead_source_id', 'call_id', 'notes']
    .map((key) => [key, row[key] ?? '']));
}

// Horizontal keyboard movement targets columns rather than another card in
// the current column (which can otherwise win collision detection).
export function opportunityKeyboardCoordinates(event, { context, currentCoordinates }) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.code)) return undefined;
  event.preventDefault();
  if (!context.active || !context.collisionRect) return undefined;
  const columns = context.droppableContainers.getEnabled()
    .filter((entry) => entry.data.current?.stageId === entry.id)
    .map((entry) => ({ id: entry.id, rect: context.droppableRects.get(entry.id) }))
    .filter((entry) => entry.rect).sort((a, b) => a.rect.left - b.rect.left);
  const currentStage = context.over?.data.current?.stageId || context.active.data.current?.stageId;
  const index = columns.findIndex((entry) => entry.id === currentStage);
  if (index < 0) return undefined;
  const target = columns[index + (event.code === 'ArrowRight' ? 1 : -1)];
  if (!target) return undefined;
  return { x: currentCoordinates.x + target.rect.left + 12 - context.collisionRect.left, y: currentCoordinates.y };
}
