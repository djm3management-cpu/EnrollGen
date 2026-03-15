/*
  Fetch carrier & CMS bulletins from Supabase.
  Falls back to hardcoded seed data if the table is empty or unreachable.
*/

import { supabase } from "./supabase";

const SEED_BULLETINS = [
  {
    carrier: "UHC",
    date: "2025-06-10",
    title: "UHC Extends SEP Filing for DR-4856 (TX Severe Storms)",
    body: "UnitedHealthcare is accepting enrollment forms for affected TX counties through Aug 31. Telephonic enrollment available via 1-877-596-3258.",
    states: ["TX"],
    link: "https://www.uhcprovider.com",
  },
  {
    carrier: "Humana",
    date: "2025-06-08",
    title: "Humana Activates Disaster Response for Multiple States",
    body: "Humana is waiving prior authorizations and extending Rx refills for members in FEMA-declared disaster areas. SEP enrollments accepted for all MA/MAPD plans.",
    states: ["TX", "OK", "LA"],
    link: "https://www.humana.com",
  },
  {
    carrier: "Aetna",
    date: "2025-06-05",
    title: "Aetna/CVS Health FEMA Disaster SEP Processing Update",
    body: "Aetna is processing disaster SEP enrollments for all active FEMA declarations. Applications can be submitted via agent portal or by calling 1-800-307-4830.",
    states: [],
    link: "https://www.aetna.com",
  },
  {
    carrier: "CMS",
    date: "2025-06-12",
    title: "CMS Memo: FEMA SEP Documentation Requirements Reminder",
    body: "CMS reminds plans that attestation of residence in a FEMA-declared area is sufficient for SEP verification. No additional documentation required from beneficiaries.",
    states: [],
    link: "https://www.cms.gov/medicare/enrollment-renewal/special-enrollment-periods",
  },
  {
    carrier: "CMS",
    date: "2025-05-15",
    title: "CMS Updates County-Level SEP Designations for Q2 2025",
    body: "New counties added to active disaster SEPs following FEMA amendments. Agents should verify county eligibility before enrollment submission.",
    states: [],
    link: "https://www.cms.gov",
  },
];

let bulletinCache = { data: null, fetchedAt: 0 };
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function fetchBulletins() {
  const now = Date.now();
  if (bulletinCache.data && now - bulletinCache.fetchedAt < CACHE_TTL) {
    return bulletinCache.data;
  }

  try {
    const { data, error } = await supabase
      .from("bulletins")
      .select("carrier, title, body, states, link, published_at")
      .order("published_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    if (data && data.length > 0) {
      const mapped = data.map((r) => ({
        carrier: r.carrier,
        date: r.published_at,
        title: r.title,
        body: r.body,
        states: r.states || [],
        link: r.link,
      }));
      bulletinCache = { data: mapped, fetchedAt: now };
      return mapped;
    }
  } catch (err) {
    console.warn("Bulletin fetch failed, using seed data:", err.message);
  }

  // Fallback to seed data
  bulletinCache = { data: SEED_BULLETINS, fetchedAt: now };
  return SEED_BULLETINS;
}
