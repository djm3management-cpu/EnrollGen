/*
  Fetch MA carrier news and CMS bulletins from Supabase.
  Falls back to seed data if the table is empty or unreachable.
*/

import { supabase } from "./supabase";

const SEED_BULLETINS = [
  {
    carrier: "UHC",
    date: "2025-06-10",
    title: "UHC Extends SEP Filing for DR-4856 (TX Severe Storms)",
    body: "UnitedHealthcare is accepting enrollment forms for affected TX counties through Aug 31. Telephonic enrollment remains available for impacted Medicare members.",
    states: ["TX"],
    link: "https://www.uhcprovider.com",
    sourceId: "seed-uhc-disaster-sep",
  },
  {
    carrier: "Humana",
    date: "2025-06-08",
    title: "Humana Activates Disaster Response for Multiple States",
    body: "Humana is waiving select prior authorizations and extending refill flexibility for members in FEMA-declared areas. Medicare enrollment support remains active for affected counties.",
    states: ["TX", "OK", "LA"],
    link: "https://press.humana.com",
    sourceId: "seed-humana-disaster-response",
  },
  {
    carrier: "Aetna",
    date: "2025-06-05",
    title: "Aetna/CVS Health FEMA Disaster SEP Processing Update",
    body: "Aetna is processing disaster SEP enrollments tied to active FEMA declarations and directing brokers to submit impacted cases through the normal Medicare workflow.",
    states: [],
    link: "https://news.aetna.com",
    sourceId: "seed-aetna-fema-processing",
  },
  {
    carrier: "CMS",
    date: "2025-06-12",
    title: "CMS Memo: FEMA SEP Documentation Requirements Reminder",
    body: "CMS reminds plans that attestation of residence in a FEMA-declared area is sufficient for SEP verification and that extra beneficiary documentation should not be required.",
    states: [],
    link: "https://www.cms.gov/medicare/enrollment-renewal/special-enrollment-periods",
    sourceId: "seed-cms-sep-documentation",
  },
  {
    carrier: "CMS",
    date: "2025-05-15",
    title: "CMS Updates County-Level SEP Designations for Q2 2025",
    body: "Additional counties were added to active disaster SEP designations following FEMA amendments. Agents should verify county-level eligibility before submission.",
    states: [],
    link: "https://www.cms.gov",
    sourceId: "seed-cms-county-update",
  },
];

const CACHE_TTL = 60 * 60 * 1000;

const CMS_HOSTS = new Set(["cms.gov", "medicare.gov"]);
const CARRIER_HOSTS = {
  UHC: ["uhcprovider.com", "uhc.com", "unitedhealthgroup.com"],
  Humana: ["humana.com", "press.humana.com"],
  Aetna: ["aetna.com", "news.aetna.com", "cvshealth.com"],
  BCBS: ["bcbs.com"],
  Cigna: ["cigna.com", "newsroom.cigna.com"],
  Wellcare: ["wellcare.com", "centene.com", "news.centene.com"],
  Centene: ["centene.com", "news.centene.com"],
  Elevance: ["elevancehealth.com"],
  Anthem: ["anthem.com"],
  Kaiser: ["kaiserpermanente.org"],
  Molina: ["molinahealthcare.com"],
  Devoted: ["devoted.com"],
  Alignment: ["alignmenthealth.com"],
  Clover: ["cloverhealth.com"],
  SCAN: ["scanhealthplan.com"],
};

const CARRIER_PRIORITY = {
  CMS: 4,
  UHC: 3,
  Humana: 3,
  Aetna: 3,
  BCBS: 3,
  Cigna: 3,
  Wellcare: 3,
  Centene: 3,
  Elevance: 3,
  Anthem: 3,
  Kaiser: 3,
  Molina: 3,
  Devoted: 3,
  Alignment: 3,
  Clover: 3,
  SCAN: 3,
};

let bulletinCache = { data: null, fetchedAt: 0 };

function normalizeHost(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function looksOfficialCarrierHost(host) {
  return Object.values(CARRIER_HOSTS).some((hosts) =>
    hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))
  );
}

function getSourceLabel(host, carrier) {
  if (!host) return carrier || "Unknown source";
  if (host === "news.google.com") return "Google News";
  if (CMS_HOSTS.has(host) || [...CMS_HOSTS].some((candidate) => host.endsWith(`.${candidate}`))) {
    return "CMS";
  }
  return host
    .replace(/^news\./, "")
    .replace(/^press\./, "")
    .replace(/^provider\./, "")
    .replace(/^www\./, "");
}

function getBulletinKind(carrier, host) {
  const isCmsSource =
    carrier === "CMS" ||
    CMS_HOSTS.has(host) ||
    [...CMS_HOSTS].some((candidate) => host.endsWith(`.${candidate}`));

  if (isCmsSource) {
    return {
      label: "CMS Bulletin",
      tone: "cms",
      priority: 3,
    };
  }

  if (looksOfficialCarrierHost(host)) {
    return {
      label: "Carrier Update",
      tone: "carrier",
      priority: 2,
    };
  }

  return {
    label: "News Story",
    tone: "news",
    priority: 1,
  };
}

function enrichBulletin(item) {
  const carrier = item.carrier || "Carrier";
  const host = normalizeHost(item.link);
  const kind = getBulletinKind(carrier, host);

  return {
    carrier,
    date: item.date,
    title: item.title,
    body: item.body,
    states: Array.isArray(item.states) ? item.states : [],
    link: item.link || null,
    sourceId: item.sourceId || `${carrier}-${item.title}`,
    sourceHost: host,
    sourceLabel: getSourceLabel(host, carrier),
    kindLabel: kind.label,
    kindTone: kind.tone,
    priority: (CARRIER_PRIORITY[carrier] || 1) + kind.priority,
  };
}

function sortBulletins(a, b) {
  const dateDelta = new Date(b.date) - new Date(a.date);
  if (dateDelta !== 0) return dateDelta;

  if (b.priority !== a.priority) return b.priority - a.priority;

  return a.title.localeCompare(b.title);
}

function normalizeRows(rows) {
  return rows
    .map(enrichBulletin)
    .sort(sortBulletins);
}

export async function fetchBulletins() {
  const now = Date.now();
  if (bulletinCache.data && now - bulletinCache.fetchedAt < CACHE_TTL) {
    return bulletinCache.data;
  }

  try {
    const { data, error } = await supabase
      .from("bulletins")
      .select("carrier, title, body, states, link, published_at, source_id")
      .order("published_at", { ascending: false })
      .limit(80);

    if (error) throw error;

    if (data && data.length > 0) {
      const mapped = normalizeRows(
        data.map((row) => ({
          carrier: row.carrier,
          date: row.published_at,
          title: row.title,
          body: row.body,
          states: row.states || [],
          link: row.link,
          sourceId: row.source_id,
        }))
      );
      bulletinCache = { data: mapped, fetchedAt: now };
      return mapped;
    }
  } catch (err) {
    console.warn("Bulletin fetch failed, using seed data:", err.message);
  }

  const fallback = normalizeRows(SEED_BULLETINS);
  bulletinCache = { data: fallback, fetchedAt: now };
  return fallback;
}
