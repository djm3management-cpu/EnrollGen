const CACHE_TTL = 15 * 60 * 1000;

let liveNewsCache = { data: null, fetchedAt: 0, promise: null };

function normalizeNewsItem(item) {
  return {
    carrier: item.carrier || "MA",
    date: item.date,
    title: item.title,
    body: item.body,
    link: item.link || null,
    sourceId: item.sourceId || `${item.carrier}-${item.title}`,
    sourceLabel: item.sourceLabel || "Google News",
    sourceHost: item.sourceHost || "",
  };
}

export async function fetchLiveNews() {
  const now = Date.now();
  if (liveNewsCache.data && now - liveNewsCache.fetchedAt < CACHE_TTL) {
    return liveNewsCache.data;
  }

  if (liveNewsCache.promise) {
    return liveNewsCache.promise;
  }

  liveNewsCache.promise = (async () => {
    try {
      const response = await fetch("/api/live-bulletins", {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const normalized = Array.isArray(payload.news)
        ? payload.news.map(normalizeNewsItem)
        : [];

      liveNewsCache.data = normalized;
      liveNewsCache.fetchedAt = Date.now();
      return normalized;
    } catch (err) {
      console.warn("Live news fetch failed:", err.message);
      return liveNewsCache.data || [];
    } finally {
      liveNewsCache.promise = null;
    }
  })();

  return liveNewsCache.promise;
}
