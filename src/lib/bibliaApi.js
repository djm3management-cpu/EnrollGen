/** Biblia requests go through the authenticated server proxy; keys stay server-side. */
async function requestBiblia(reference, operation, bibleId, { signal, getToken } = {}) {
  const token = await getToken?.();
  const params = new URLSearchParams({ reference, operation, ...(bibleId ? { bibleId } : {}) });
  const res = await fetch(`/.netlify/functions/biblia?${params}`, {
    signal, headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(res.status === 503 ? 'Bible provider unavailable' : `Bible provider request failed (${res.status})`);
  return res.json();
}
export async function fetchCrossReferences(reference, options = {}) {
  const data = await requestBiblia(reference, 'crossreferences', null, options);
  return data.references || [];
}
export async function fetchBibliaContent(reference, bibleId, options = {}) {
  return requestBiblia(reference, 'content', bibleId, options);
}
