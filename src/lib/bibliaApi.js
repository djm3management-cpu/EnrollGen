/**
 * Thin wrapper around api.biblia.com endpoints used by DailyVerse.
 * Key is embedded at build time via VITE_BIBLIA_API_KEY.
 */
const BIBLIA_KEY = import.meta.env.VITE_BIBLIA_API_KEY;
const BASE = "https://api.biblia.com/v1/bible";

function toBibliaPassage(reference) {
  // "John 3:16" → "John+3:16". Biblia tolerates both formats; encode.
  return encodeURIComponent(reference.trim());
}

export async function fetchCrossReferences(reference, { signal } = {}) {
  if (!BIBLIA_KEY) return [];
  const url = `${BASE}/crossreferences/leb.json?passage=${toBibliaPassage(
    reference
  )}&limit=12&key=${BIBLIA_KEY}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Biblia crossrefs ${res.status}`);
  const data = await res.json();
  return (data?.results || [])
    .map((row) => row?.target?.passage)
    .filter(Boolean);
}

export async function fetchBibliaContent(reference, bibleId, { signal } = {}) {
  if (!BIBLIA_KEY) throw new Error("Biblia key missing");
  const url = `${BASE}/content/${bibleId}.txt.json?passage=${toBibliaPassage(
    reference
  )}&key=${BIBLIA_KEY}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Biblia content ${res.status}`);
  const data = await res.json();
  return {
    text: (data?.text || "").trim(),
    reference,
  };
}
