/*
  Netlify Scheduled Function: sync-bulletins
  Runs daily to pull fresh CMS bulletins, carrier updates, and relevant
  Medicare Advantage news stories into the Supabase `bulletins` table.
*/

import { createClient } from "@supabase/supabase-js";

const LOOKBACK_DAYS = 45;
const MAX_ITEMS_PER_FEED = 18;

const MA_KEYWORDS = [
  "medicare",
  "medicare advantage",
  "advantage plan",
  "part d",
  "mapd",
  "pdp",
  "d-snp",
  "dsnp",
  "dual eligible",
  "supplemental benefits",
  "benefit design",
  "star rating",
  "stars",
  "enrollment",
  "aep",
  "oep",
  "special enrollment",
  "broker",
  "agent",
  "cms rule",
  "rate notice",
];

const CMS_KEYWORDS = [
  ...MA_KEYWORDS,
  "cms",
  "medicare final rule",
  "medicare communications",
  "hpms",
  "managed care",
];

function googleNewsUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(
    query
  )}&hl=en-US&gl=US&ceid=US:en`;
}

const CMS_FEEDS = [
  {
    url: "https://www.cms.gov/about-cms/contact/newsroom",
    carrier: "CMS",
    label: "CMS Newsroom",
    format: "cms-newsroom",
    keywords: CMS_KEYWORDS,
  },
  {
    url: "https://www.cms.gov/rss/31241",
    carrier: "CMS",
    label: "Medicare Learning Network",
    keywords: CMS_KEYWORDS,
  },
  {
    url: googleNewsUrl("CMS Medicare Advantage"),
    carrier: "CMS",
    label: "CMS MA News",
    keywords: CMS_KEYWORDS,
    mustInclude: ["cms", "medicare"],
    dedupeByTitle: true,
  },
  {
    url: googleNewsUrl("CMS star ratings Medicare Advantage"),
    carrier: "CMS",
    label: "CMS Star Ratings News",
    keywords: CMS_KEYWORDS,
    mustInclude: ["cms", "medicare"],
    dedupeByTitle: true,
  },
];

const CARRIER_FEEDS = [
  {
    carrier: "UHC",
    url: "https://www.uhcprovider.com/content/dam/provider/docs/public/resources/news/UHC-News-RSS.xml",
    label: "UHC Provider News",
    keywords: MA_KEYWORDS,
    mustInclude: ["unitedhealthcare", "uhc", "united healthcare"],
  },
  {
    carrier: "UHC",
    url: googleNewsUrl("UnitedHealthcare Medicare Advantage"),
    label: "UHC MA News",
    keywords: MA_KEYWORDS,
    mustInclude: ["unitedhealthcare", "uhc", "united healthcare"],
    dedupeByTitle: true,
  },
  {
    carrier: "Humana",
    url: "https://humana.gcs-web.com/rss/news-releases.xml",
    label: "Humana Press Releases",
    keywords: MA_KEYWORDS,
    mustInclude: ["humana"],
  },
  {
    carrier: "Humana",
    url: googleNewsUrl("Humana Medicare Advantage"),
    label: "Humana MA News",
    keywords: MA_KEYWORDS,
    mustInclude: ["humana"],
    dedupeByTitle: true,
  },
  {
    carrier: "Aetna",
    url: "https://news.aetna.com/feed/",
    label: "Aetna Newsroom",
    keywords: MA_KEYWORDS,
    mustInclude: ["aetna", "cvs health", "cvs"],
  },
  {
    carrier: "Aetna",
    url: googleNewsUrl("Aetna Medicare Advantage"),
    label: "Aetna MA News",
    keywords: MA_KEYWORDS,
    mustInclude: ["aetna", "cvs health", "cvs"],
    dedupeByTitle: true,
  },
  {
    carrier: "BCBS",
    url: "https://www.bcbs.com/about-us/association-news",
    label: "BCBS Press Releases",
    format: "bcbs-newsroom",
    keywords: MA_KEYWORDS,
    mustInclude: ["blue cross", "blue shield", "bcbs"],
  },
  {
    carrier: "BCBS",
    url: googleNewsUrl("Blue Cross Blue Shield Medicare Advantage"),
    label: "BCBS MA News",
    keywords: MA_KEYWORDS,
    mustInclude: ["blue cross", "blue shield", "bcbs"],
    dedupeByTitle: true,
  },
  {
    carrier: "Cigna",
    url: "https://newsroom.thecignagroup.com/latest-press-releases?pagetemplate=rss",
    label: "Cigna Newsroom",
    keywords: MA_KEYWORDS,
    mustInclude: ["cigna"],
  },
  {
    carrier: "Cigna",
    url: googleNewsUrl("Cigna Medicare Advantage"),
    label: "Cigna MA News",
    keywords: MA_KEYWORDS,
    mustInclude: ["cigna"],
    dedupeByTitle: true,
  },
  {
    carrier: "Wellcare",
    url: "https://investors.centene.com/press-releases?pagetemplate=rss",
    label: "Centene / Wellcare News",
    keywords: MA_KEYWORDS,
    mustInclude: ["wellcare", "centene"],
  },
  {
    carrier: "Wellcare",
    url: googleNewsUrl("Wellcare Medicare Advantage"),
    label: "Wellcare MA News",
    keywords: MA_KEYWORDS,
    mustInclude: ["wellcare", "centene"],
    dedupeByTitle: true,
  },
  {
    carrier: "Elevance",
    url: googleNewsUrl("Elevance Health Medicare Advantage"),
    label: "Elevance MA News",
    keywords: MA_KEYWORDS,
    mustInclude: ["elevance", "anthem"],
    dedupeByTitle: true,
  },
  {
    carrier: "Kaiser",
    url: googleNewsUrl("Kaiser Permanente Medicare Advantage"),
    label: "Kaiser MA News",
    keywords: MA_KEYWORDS,
    mustInclude: ["kaiser"],
    dedupeByTitle: true,
  },
  {
    carrier: "Molina",
    url: googleNewsUrl("Molina Medicare Advantage"),
    label: "Molina MA News",
    keywords: MA_KEYWORDS,
    mustInclude: ["molina"],
    dedupeByTitle: true,
  },
  {
    carrier: "Devoted",
    url: googleNewsUrl("Devoted Health Medicare Advantage"),
    label: "Devoted MA News",
    keywords: MA_KEYWORDS,
    mustInclude: ["devoted"],
    dedupeByTitle: true,
  },
  {
    carrier: "Alignment",
    url: googleNewsUrl("Alignment Health Medicare Advantage"),
    label: "Alignment MA News",
    keywords: MA_KEYWORDS,
    mustInclude: ["alignment"],
    dedupeByTitle: true,
  },
  {
    carrier: "Clover",
    url: googleNewsUrl("Clover Health Medicare Advantage"),
    label: "Clover MA News",
    keywords: MA_KEYWORDS,
    mustInclude: ["clover"],
    dedupeByTitle: true,
  },
  {
    carrier: "SCAN",
    url: googleNewsUrl("SCAN Health Plan Medicare Advantage"),
    label: "SCAN MA News",
    keywords: MA_KEYWORDS,
    mustInclude: ["scan health", "scan"],
    dedupeByTitle: true,
  },
];

export const ALL_FEEDS = [...CMS_FEEDS, ...CARRIER_FEEDS];

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
];

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

function normalizeText(value = "") {
  return decodeEntities(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(title = "") {
  return normalizeText(title)
    .replace(/[^a-z0-9 ]/g, "")
    .slice(0, 220);
}

function stripHtml(html = "") {
  return decodeEntities(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseItems(xml) {
  const items = [];

  const rssMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
  for (const match of rssMatches) {
    const block = match[1];
    const title =
      decodeEntities(
        block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || ""
      );
    const link =
      decodeEntities(
        block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() || ""
      );
    const desc =
      decodeEntities(
        block.match(/<(?:description|content:encoded)>([\s\S]*?)<\/(?:description|content:encoded)>/i)?.[1]?.trim() || ""
      );
    const pubDate =
      decodeEntities(
        block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ||
          block.match(/<dc:date>([\s\S]*?)<\/dc:date>/i)?.[1]?.trim() ||
          ""
      );
    const guid =
      decodeEntities(
        block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1]?.trim() || link
      );

    items.push({ title, link, desc, pubDate, guid });
  }

  const atomMatches = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi);
  for (const match of atomMatches) {
    const block = match[1];
    const title =
      decodeEntities(
        block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || ""
      );
    const link =
      decodeEntities(
        block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1]?.trim() || ""
      );
    const desc =
      decodeEntities(
        block.match(/<(?:summary|content)[^>]*>([\s\S]*?)<\/(?:summary|content)>/i)?.[1]?.trim() || ""
      );
    const pubDate =
      decodeEntities(
        block.match(/<(?:published|updated)>([\s\S]*?)<\/(?:published|updated)>/i)?.[1]?.trim() || ""
      );
    const guid =
      decodeEntities(
        block.match(/<id>([\s\S]*?)<\/id>/i)?.[1]?.trim() || link
      );

    items.push({ title, link, desc, pubDate, guid });
  }

  return items;
}

function extractStates(text) {
  const found = [];
  for (const state of US_STATES) {
    if (new RegExp(`\\b${state}\\b`).test(text)) found.push(state);
  }
  return found;
}

function isRelevant(feed, title, body) {
  const text = normalizeText(`${title} ${body}`);

  if (
    Array.isArray(feed.mustInclude) &&
    feed.mustInclude.length > 0 &&
    !feed.mustInclude.some((term) => text.includes(term))
  ) {
    return false;
  }

  const keywords = feed.keywords?.length ? feed.keywords : MA_KEYWORDS;
  return keywords.some((keyword) => text.includes(keyword));
}

function buildSourceId(feed, item, publishedAt) {
  if (feed.dedupeByTitle) {
    const datePart = publishedAt
      ? publishedAt.toISOString().slice(0, 10)
      : "undated";
    return `${feed.carrier}:${normalizeTitle(item.title)}:${datePart}`;
  }

  return (
    item.guid ||
    item.link ||
    `${feed.carrier}:${normalizeTitle(item.title)}`
  );
}

// Official HTML listings expose publication dates and canonical article links.
export function parseFeed(content, feed) {
  if (!feed.format) {
    if (!/<(?:rss|feed)\b/i.test(content)) throw new Error("Expected RSS or Atom feed");
    return parseItems(content);
  }
  const blocks = feed.format === "cms-newsroom"
    ? content.split(/<div class="views-row">/i).slice(1)
    : [...content.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map(m => m[1]);
  const items = blocks.map(block => {
    const heading = block.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] || "";
    const href = block.match(/href=["']([^"']*(?:\/newsroom\/|\/association-news\/)[^"']+)["']/i)?.[1];
    const link = href ? new URL(decodeEntities(href), feed.url).href : "";
    return { title: stripHtml(heading), link, guid: link,
      desc: stripHtml(block.match(/<(?:span|p)[^>]*class="(?:newsroom-main-view-body|bcbs-news-item-listing-content__text)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|p)>/i)?.[1] || ""),
      pubDate: block.match(/datetime=["']([^"']+)["']/i)?.[1] || "" };
  }).filter(item => item.title && item.link && item.pubDate);
  if (!items.length) throw new Error("Official newsroom listing could not be parsed");
  return items;
}

export async function syncBulletins(supabase, { feeds = ALL_FEEDS, fetchImpl = fetch, now = new Date() } = {}) {
  console.log("[sync-bulletins] Starting daily bulletin sync...");

  let totalInserted = 0;
  let totalSkipped = 0;
  let feedErrors = 0;
  const seenIds = new Set();

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

  let statusErrors = 0;
  // Fetch independently so multiple 15-second timeouts do not accumulate.
  const fetched = await Promise.allSettled(feeds.map(async feed => {
    const res = await fetchImpl(feed.url, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "EnrollGen-BulletinSync/2.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseFeed(await res.text(), feed).slice(0, MAX_ITEMS_PER_FEED);
  }));
  for (const [index, feed] of feeds.entries()) {
    let feedError = null;
    let upserted = 0;
    const skippedBefore = totalSkipped;
    try {
      if (fetched[index].status === "rejected") throw fetched[index].reason;
      const items = fetched[index].value;

      for (const item of items) {
        if (!item.title) {
          totalSkipped += 1;
          continue;
        }

        const publishedAt = item.pubDate ? new Date(item.pubDate) : null;
        // Never invent a current publication date for undated/invalid news.
        if (!publishedAt || !Number.isFinite(publishedAt.valueOf()) || publishedAt > now) {
          totalSkipped += 1;
          continue;
        }
        if (publishedAt && Number.isFinite(publishedAt.valueOf()) && publishedAt < cutoff) {
          totalSkipped += 1;
          continue;
        }

        const body = stripHtml(item.desc).slice(0, 1000);
        if (!isRelevant(feed, item.title, body)) {
          totalSkipped += 1;
          continue;
        }

        const sourceId = buildSourceId(feed, item, publishedAt).slice(0, 500);
        if (seenIds.has(sourceId)) {
          totalSkipped += 1;
          continue;
        }

        const stateText = normalizeText(`${item.title} ${body}`).toUpperCase();
        const row = {
          carrier: feed.carrier,
          title: decodeEntities(item.title).slice(0, 500),
          body,
          states: extractStates(stateText),
          link: item.link || null,
          published_at: publishedAt.toISOString().slice(0, 10),
          source_id: sourceId.slice(0, 500),
          updated_at: now.toISOString(),
        };

        const { error } = await supabase
          .from("bulletins")
          .upsert(row, { onConflict: "source_id" });

        if (error) {
          console.warn(
            `[sync-bulletins] Upsert error for "${item.title}":`,
            error.message
          );
          feedError = `Bulletin upsert failed: ${error.message}`;
          totalSkipped += 1;
        } else {
          seenIds.add(sourceId);
          upserted += 1;
          totalInserted += 1;
        }
      }

      console.log(
        `[sync-bulletins] ${feed.carrier}/${feed.label}: processed ${items.length} items`
      );
    } catch (err) {
      console.error(
        `[sync-bulletins] ${feed.carrier}/${feed.label} failed:`,
        err.message
      );
      feedError = err.message;
    }
    const skipped = totalSkipped - skippedBefore;
    if (feedError) feedErrors += 1;
    const status = {
      feed_id: feed.label, label: feed.label, carrier: feed.carrier, url: feed.url,
      checked_at: now.toISOString(), status: feedError ? "error" : "ok",
      error: feedError ? feedError.slice(0, 500) : null, upserted, skipped,
      ...(!feedError ? { last_success_at: now.toISOString() } : {}),
    };
    try {
      const { error: statusError } = await supabase.from("bulletin_feed_status").upsert(status, { onConflict: "feed_id" });
      if (statusError) throw statusError;
    } catch (statusError) {
      statusErrors += 1;
      console.error("[sync-bulletins] Status write failed:", statusError.message);
    }
  }

  console.log(
    `[sync-bulletins] Done. Inserted: ${totalInserted}, Skipped: ${totalSkipped}, Feed errors: ${feedErrors}`
  );

  return { upserted: totalInserted, skipped: totalSkipped, feedErrors, statusErrors };
}

export default async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[sync-bulletins] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return new Response(
      JSON.stringify({
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const result = await syncBulletins(supabase);
  return new Response(JSON.stringify(result), {
    status: result.statusErrors ? 500 : 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config = {
  schedule: "0 10 * * *",
};
