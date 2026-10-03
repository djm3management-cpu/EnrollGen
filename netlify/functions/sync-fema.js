import { createClient } from '@supabase/supabase-js';
import { fetchLiveFemaDisasters } from '../../src/lib/sepFema.js';

export async function refreshFemaSnapshot(client, fetchFeed = fetchLiveFemaDisasters) {
  const feed = await fetchFeed();
  // One atomic upsert replaces all designated areas, including removed ones.
  // Failure invalidates the previous snapshot rather than advertising old SEPs.
  const { error } = await client.from('fema_feed_snapshot').upsert({
    singleton: true, status: feed.apiFailed ? 'unavailable' : 'live',
    fetched_at: feed.fetchedAt, checked_at: feed.checkedAt,
    disasters: feed.apiFailed ? [] : feed.disasters,
  });
  if (error) throw error;
  return { status: feed.apiFailed ? 'unavailable' : 'live', count: feed.disasters.length };
}

export default async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Response('FEMA refresh configuration unavailable', { status: 503 });
  try {
    const result = await refreshFemaSnapshot(createClient(url, key));
    return Response.json(result, { status: result.status === 'live' ? 200 : 503 });
  } catch {
    console.error('[sync-fema] Snapshot refresh failed');
    return new Response('FEMA snapshot refresh failed', { status: 503 });
  }
};
export const config = { schedule: '0 9 * * *' };
