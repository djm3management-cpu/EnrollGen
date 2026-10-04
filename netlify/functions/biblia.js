import { requireClerkAuth } from './_clerkAuth.js';
const json = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
export default async function handler(request) {
  if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
  const auth = await requireClerkAuth(request, { allowBypass: false });
  if (auth.response) return auth.response;
  const key = process.env.BIBLIA_API_KEY;
  if (!key) return json(503, { error: 'Bible provider unavailable' });
  const query = new URL(request.url).searchParams;
  const reference = (query.get('reference') || '').trim();
  const operation = query.get('operation');
  const bibleId = query.get('bibleId');
  if (!reference || reference.length > 160 || !['content', 'crossreferences'].includes(operation) ||
      (operation === 'content' && bibleId !== 'leb')) return json(400, { error: 'Invalid Bible request' });
  const url = new URL(operation === 'content' ? 'https://api.biblia.com/v1/bible/content/leb.txt.json' :
    'https://api.biblia.com/v1/bible/crossreferences/leb.json');
  url.searchParams.set('passage', reference); url.searchParams.set('key', key);
  if (operation === 'crossreferences') url.searchParams.set('limit', '12');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return json(503, { error: 'Bible provider unavailable' });
    const data = await response.json();
    return json(200, operation === 'content' ? { text: String(data.text || '').trim(), reference } :
      { references: (data.results || []).map(row => row?.target?.passage).filter(value => typeof value === 'string') });
  } catch {
    return json(503, { error: 'Bible provider unavailable' });
  }
}
