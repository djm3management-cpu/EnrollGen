/*
  Netlify Scheduled Function: sync-bulletins
  Runs weekly — scrapes CMS and carrier feeds for new bulletins,
  upserts into the Supabase `bulletins` table.
*/

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ── Feed sources ── */
const CMS_FEEDS = [
  {
    url: "https://www.cms.gov/files/document/cms-newsroom-rss.xml",
    carrier: "CMS",
    label: "CMS Newsroom",
  },
  {
    url: "https://www.cms.gov/files/document/medicare-learning-network-rss.xml",
    carrier: "CMS",
    label: "Medicare Learning Network",
  },
];

const CARRIER_FEEDS = [
  {
    carrier: "UHC",
    url: "https://www.uhcprovider.com/content/dam/provider/docs/public/resources/news/UHC-News-RSS.xml",
    label: "UHC Provider News",
  },
  {
    carrier: "Humana",
    url: "https://press.humana.com/rss/news-releases.xml",
    label: "Humana Press Releases",
  },
  {
    carrier: "Aetna",
    url: "https://news.aetna.com/feed/",
    label: "Aetna Newsroom",
  },
  {
    carrier: "BCBS",
    url: "https://www.bcbs.com/press-releases/feed",
    label: "BCBS Press Releases",
  },
  {
    carrier: "Cigna",
    url: "https://newsroom.cigna.com/rss",
    label: "Cigna Newsroom",
  },
  {
    carrier: "Centene",
    url: "https://news.centene.com/rss/news-releases.xml",
    label: "Centene/Wellcare News",
  },
];

const ALL_FEEDS = [...CMS_FEEDS, ...CARRIER_FEEDS];

/* ── Keywords that indicate Medicare/SEP/FEMA relevance ── */
const KEYWORDS = [
  "medicare", "advantage", "enrollment", "sep ", "special enrollment",
  "fema", "disaster", "part d", "mapd", "cms final rule",
  "star rating", "network adequacy", "d-snp", "dual eligible",
  "open enrollment", "annual enrollment", "oep", "aep",
  "beneficiary", "plan year", "coverage gap", "medigap",
];

function isRelevant(title, body) {
  const text = `${title} ${body}`.toLowerCase();
  return KEYWORDS.some((kw) => text.includes(kw));
}

/* ── Parse RSS/Atom XML into items ── */
function parseItems(xml) {
  const items = [];

  // RSS 2.0 <item> elements
  const rssMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
  for (const m of rssMatches) {
    const block = m[1];
    const title = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || "";
    const link = block.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/i)?.[1]?.trim() || "";
    const desc = block.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/is)?.[1]?.trim() || "";
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1]?.trim() ||
                    block.match(/<dc:date>(.*?)<\/dc:date>/i)?.[1]?.trim() || "";
    const guid = block.match(/<guid[^>]*>(.*?)<\/guid>/i)?.[1]?.trim() || link;
    items.push({ title, link, desc, pubDate, guid });
  }

  // Atom <entry> elements
  const atomMatches = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi);
  for (const m of atomMatches) {
    const block = m[1];
    const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || "";
    const link = block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1]?.trim() || "";
    const desc = block.match(/<(?:summary|content)[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/(?:summary|content)>/is)?.[1]?.trim() || "";
    const pubDate = block.match(/<(?:published|updated)>(.*?)<\/(?:published|updated)>/i)?.[1]?.trim() || "";
    const guid = block.match(/<id>(.*?)<\/id>/i)?.[1]?.trim() || link;
    items.push({ title, link, desc, pubDate, guid });
  }

  return items;
}

/* ── Strip HTML tags for clean body text ── */
function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

/* ── Detect state abbreviations in text ── */
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

function extractStates(text) {
  const found = [];
  for (const st of US_STATES) {
    // Match state abbreviation as a whole word
    if (new RegExp(`\\b${st}\\b`).test(text)) found.push(st);
  }
  return found;
}

/* ── Main handler ── */
export default async () => {
  console.log("[sync-bulletins] Starting weekly bulletin sync...");
  let totalInserted = 0;
  let totalSkipped = 0;
  let feedErrors = 0;

  for (const feed of ALL_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "EnrollGen-BulletinSync/1.0" },
      });

      if (!res.ok) {
        console.warn(`[sync-bulletins] ${feed.carrier}/${feed.label}: HTTP ${res.status}`);
        feedErrors++;
        continue;
      }

      const xml = await res.text();
      const items = parseItems(xml);

      // Only keep items from the last 30 days that are relevant
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      for (const item of items) {
        const pubDate = item.pubDate ? new Date(item.pubDate) : null;
        if (pubDate && pubDate < cutoff) continue;

        const body = stripHtml(item.desc).slice(0, 1000);
        if (!isRelevant(item.title, body)) continue;

        const sourceId = item.guid || item.link || `${feed.carrier}-${item.title}`;
        const states = extractStates(`${item.title} ${body}`);

        const row = {
          carrier: feed.carrier,
          title: item.title.slice(0, 500),
          body,
          states,
          link: item.link || null,
          published_at: pubDate ? pubDate.toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
          source_id: sourceId.slice(0, 500),
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("bulletins")
          .upsert(row, { onConflict: "source_id", ignoreDuplicates: true });

        if (error) {
          console.warn(`[sync-bulletins] Upsert error for "${item.title}":`, error.message);
          totalSkipped++;
        } else {
          totalInserted++;
        }
      }

      console.log(`[sync-bulletins] ${feed.carrier}/${feed.label}: processed ${items.length} items`);
    } catch (err) {
      console.error(`[sync-bulletins] ${feed.carrier}/${feed.label} failed:`, err.message);
      feedErrors++;
    }
  }

  console.log(`[sync-bulletins] Done. Inserted: ${totalInserted}, Skipped: ${totalSkipped}, Feed errors: ${feedErrors}`);

  return new Response(
    JSON.stringify({ inserted: totalInserted, skipped: totalSkipped, feedErrors }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

// Run every Sunday at 6:00 AM UTC
export const config = {
  schedule: "0 6 * * 0",
};
