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
    url: "https://www.cms.gov/files/document/cms-newsroom-rss.xml",
    carrier: "CMS",
    label: "CMS Newsroom",
    keywords: CMS_KEYWORDS,
  },
  {
    url: "https://www.cms.gov/files/document/medicare-learning-network-rss.xml",
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
    url: "https://press.humana.com/rss/news-releases.xml",
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
    url: "https://www.bcbs.com/press-releases/feed",
    label: "BCBS Press Releases",
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
    url: "https://newsroom.cigna.com/rss",
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
    url: "https://news.centene.com/rss/news-releases.xml",
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

const ALL_FEEDS = [...CMS_FEEDS, ...CARRIER_FEEDS];

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

  console.log("[sync-bulletins] Starting daily bulletin sync...");

  let totalInserted = 0;
  let totalSkipped = 0;
  let feedErrors = 0;
  const seenIds = new Set();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

  for (const feed of ALL_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "EnrollGen-BulletinSync/2.0" },
      });

      if (!res.ok) {
        console.warn(
          `[sync-bulletins] ${feed.carrier}/${feed.label}: HTTP ${res.status}`
        );
        feedErrors += 1;
        continue;
      }

      const xml = await res.text();
      const items = parseItems(xml).slice(0, MAX_ITEMS_PER_FEED);

      for (const item of items) {
        if (!item.title) {
          totalSkipped += 1;
          continue;
        }

        const publishedAt = item.pubDate ? new Date(item.pubDate) : null;
        if (publishedAt && Number.isFinite(publishedAt.valueOf()) && publishedAt < cutoff) {
          totalSkipped += 1;
          continue;
        }

        const body = stripHtml(item.desc).slice(0, 1000);
        if (!isRelevant(feed, item.title, body)) {
          totalSkipped += 1;
          continue;
        }

        const sourceId = buildSourceId(feed, item, publishedAt);
        if (seenIds.has(sourceId)) {
          totalSkipped += 1;
          continue;
        }
        seenIds.add(sourceId);

        const stateText = normalizeText(`${item.title} ${body}`).toUpperCase();
        const row = {
          carrier: feed.carrier,
          title: decodeEntities(item.title).slice(0, 500),
          body,
          states: extractStates(stateText),
          link: item.link || null,
          published_at:
            publishedAt && Number.isFinite(publishedAt.valueOf())
              ? publishedAt.toISOString().slice(0, 10)
              : new Date().toISOString().slice(0, 10),
          source_id: sourceId.slice(0, 500),
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("bulletins")
          .upsert(row, { onConflict: "source_id" });

        if (error) {
          console.warn(
            `[sync-bulletins] Upsert error for "${item.title}":`,
            error.message
          );
          totalSkipped += 1;
        } else {
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
      feedErrors += 1;
    }
  }

  console.log(
    `[sync-bulletins] Done. Inserted: ${totalInserted}, Skipped: ${totalSkipped}, Feed errors: ${feedErrors}`
  );

  return new Response(
    JSON.stringify({ inserted: totalInserted, skipped: totalSkipped, feedErrors }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};

export const config = {
  schedule: "0 10 * * *",
};
