const CACHE_TTL = 15 * 60 * 1000;
const LOOKBACK_DAYS = 30;
const MAX_ITEMS = 12;

const NEWS_FEEDS = [
  { carrier: "CMS", query: "CMS Medicare Advantage" },
  { carrier: "UHC", query: "UnitedHealthcare Medicare Advantage" },
  { carrier: "Humana", query: "Humana Medicare Advantage" },
  { carrier: "Aetna", query: "Aetna Medicare Advantage" },
  { carrier: "BCBS", query: "Blue Cross Blue Shield Medicare Advantage" },
  { carrier: "Cigna", query: "Cigna Medicare Advantage" },
  { carrier: "Wellcare", query: "Wellcare Medicare Advantage" },
];

const NEWS_KEYWORDS = [
  "medicare",
  "medicare advantage",
  "advantage",
  "ma plan",
  "part d",
  "star ratings",
  "enrollment",
];

let responseCache = { data: null, fetchedAt: 0 };

function googleNewsUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(
    query
  )}&hl=en-US&gl=US&ceid=US:en`;
}

function decodeEntities(text = "") {
  return text
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#8211;|&#x2013;/gi, "-")
    .replace(/&#8212;|&#x2014;/gi, "-");
}

function normalizeText(text = "") {
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

function stripHtml(html = "") {
  return normalizeText(html.replace(/<[^>]+>/g, " "));
}

function parseItems(xml) {
  const items = [];
  const matches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);

  for (const match of matches) {
    const block = match[1];
    const title = decodeEntities(
      block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || ""
    );
    const link = decodeEntities(
      block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() || ""
    );
    const desc = decodeEntities(
      block.match(/<description>([\s\S]*?)<\/description>/i)?.[1]?.trim() || ""
    );
    const pubDate = decodeEntities(
      block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() || ""
    );
    const guid = decodeEntities(
      block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1]?.trim() || link
    );
    items.push({ title, link, desc, pubDate, guid });
  }

  return items;
}

function splitGoogleNewsTitle(rawTitle = "") {
  const parts = rawTitle.split(/\s+-\s+/);
  if (parts.length < 2) {
    return {
      title: rawTitle,
      sourceLabel: "Google News",
    };
  }

  return {
    title: parts.slice(0, -1).join(" - ").trim(),
    sourceLabel: parts.at(-1).trim(),
  };
}

function isRelevant(text) {
  const normalized = text.toLowerCase();
  return NEWS_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

async function fetchNewsFeed(feed) {
  const response = await fetch(googleNewsUrl(feed.query), {
    signal: AbortSignal.timeout(9000),
    headers: { "User-Agent": "EnrollGen-LiveNews/1.0" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const xml = await response.text();
  const items = parseItems(xml);
  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  return items
    .map((item) => {
      const parsedTitle = splitGoogleNewsTitle(item.title);
      return {
        carrier: feed.carrier,
        date: item.pubDate,
        title: parsedTitle.title,
        body: stripHtml(item.desc).slice(0, 420),
        link: item.link || null,
        sourceId: item.guid || item.link || `${feed.carrier}-${parsedTitle.title}`,
        sourceLabel: parsedTitle.sourceLabel,
        sourceHost: "news.google.com",
      };
    })
    .filter((item) => item.title && isRelevant(`${item.title} ${item.body}`))
    .filter((item) => {
      const publishedAt = item.date ? new Date(item.date).getTime() : Date.now();
      return Number.isFinite(publishedAt) && publishedAt >= cutoff;
    });
}

function buildJsonResponse(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}

export default async () => {
  const now = Date.now();
  if (responseCache.data && now - responseCache.fetchedAt < CACHE_TTL) {
    return buildJsonResponse(responseCache.data);
  }

  const results = await Promise.allSettled(
    NEWS_FEEDS.map((feed) => fetchNewsFeed(feed))
  );

  const seen = new Set();
  const news = results
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((item) => {
      if (seen.has(item.sourceId)) return false;
      seen.add(item.sourceId);
      return true;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, MAX_ITEMS);

  const payload = {
    news,
    fetchedAt: new Date().toISOString(),
  };

  responseCache = { data: payload, fetchedAt: now };
  return buildJsonResponse(payload);
};
