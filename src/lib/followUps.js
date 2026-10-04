export const FOLLOW_UPS_UPDATED = 'enrollgen:follow-ups-updated';
export function notifyFollowUpsUpdated() {
  window.dispatchEvent(new Event(FOLLOW_UPS_UPDATED));
}
export function followUpBucket(row, now = new Date()) {
  if (row.status !== 'open' || !row.due_at) return null;
  const due = new Date(row.due_at);
  if (Number.isNaN(due.getTime())) return null;
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return due < start ? 'overdue' : due < end ? 'today' : 'upcoming';
}
export async function createFollowUp(client, fields) {
  const { data, error } = await client.rpc('save_follow_up', fields);
  if (error) throw error;
  return data;
}
export async function updateFollowUp(client, tenantId, id, action, dueAt = null) {
  if (!['complete', 'reschedule'].includes(action)) throw new Error('Invalid follow-up action');
  if (action === 'reschedule' && (!dueAt || Number.isNaN(new Date(dueAt).getTime()))) throw new Error('A valid due date is required');
  const fields = action === 'complete' ? { status: 'done' } : { due_at: new Date(dueAt).toISOString(), status: 'open' };
  const { data, error } = await client.from('follow_ups').update(fields).eq('tenant_id', tenantId).eq('id', id).eq('status', 'open').select('id').single();
  if (error) throw error;
  if (!data) throw new Error('Follow-up unavailable or access denied');
  return data;
}
