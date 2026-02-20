import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from "react";

// ─── DATA LAYER ────────────────────────────────────────────────────────────────
// FEMA: Live from OpenFEMA API v2 (free, no key, CORS allowed)
// CMS Plans: Static from CMS Landscape Files CY2025 (see SETUP.md for DB import)
// ─────────────────────────────────────────────────────────────────────────────────

// ── Hardcoded 2026 FEMA Major Disaster Declarations (fallback if API is down) ──
// Source: FEMA.gov/disaster/declarations + Federal Register (verified Feb 19, 2026)
// These serve as a safety net — the live API will override with richer county data
// ═══════════════════════════════════════════════════════════════════════════════
// FEMA DISASTER DATABASE — Verified from fema.gov/disaster/declarations
// Last updated: February 19, 2026 | Covers active IA + PA declarations
// For Medicare SEP: only IA-declared disasters trigger enrollment windows
// Update this list when new disasters are declared or IA amendments are issued
// ═══════════════════════════════════════════════════════════════════════════════
const FEMA_DISASTER_DB = [
  // ── 2026 Winter Storm Fern (Jan 22-27, 2026) ──
  {
    id: "DR-4900",
    disasterNumber: 4900,
    title: "Louisiana Severe Winter Storm",
    type: "Severe Ice Storm",
    state: "LA",
    declaredDate: "2026-02-18",
    incidentBegin: "2026-01-23",
    incidentEnd: "2026-01-27",
    iaProgram: false,
    ihProgram: false,
    paOnly: true,
    femaUrl: "https://www.fema.gov/disaster/4900",
    counties: [
      "Bienville",
      "De Soto",
      "East Carroll",
      "Franklin",
      "Morehouse",
      "Ouachita",
      "Richland",
      "Tensas",
      "West Carroll",
    ],
    notes: "PA only as of 2/19/2026. IA may be added — monitor for amendments.",
  },
  {
    id: "DR-4899",
    disasterNumber: 4899,
    title: "Mississippi Severe Winter Storm",
    type: "Severe Ice Storm",
    state: "MS",
    declaredDate: "2026-02-06",
    incidentBegin: "2026-01-23",
    incidentEnd: "2026-01-27",
    iaProgram: false,
    ihProgram: false,
    paOnly: true,
    femaUrl: "https://www.fema.gov/disaster/4899",
    counties: ["Statewide"],
    notes: "PA only. No IA declared yet — no Medicare SEP triggered.",
  },
  {
    id: "DR-4898",
    disasterNumber: 4898,
    title: "Tennessee Severe Winter Storm (Winter Storm Fern)",
    type: "Severe Ice Storm",
    state: "TN",
    declaredDate: "2026-02-06",
    incidentBegin: "2026-01-22",
    incidentEnd: "2026-01-27",
    iaProgram: false,
    ihProgram: false,
    paOnly: true,
    femaUrl: "https://www.fema.gov/disaster/4898",
    counties: [
      "Cheatham",
      "Chester",
      "Clay",
      "Davidson",
      "Decatur",
      "Dickson",
      "Hardeman",
      "Hardin",
      "Henderson",
      "Hickman",
      "Lawrence",
      "Lewis",
      "Macon",
      "McNairy",
      "Maury",
      "Perry",
      "Robertson",
      "Rutherford",
      "Sumner",
      "Trousdale",
      "Wayne",
      "Williamson",
      "Wilson",
    ],
    notes:
      "PA approved for 23 counties. IA still under federal review as of 2/7/2026.",
  },
  // ── 2026 Oklahoma Wildfires (Feb 17, 2026 — ongoing) ──
  {
    id: "FM-5618",
    disasterNumber: 5618,
    title: "Oklahoma 43 Fire",
    type: "Fire",
    state: "OK",
    declaredDate: "2026-02-17",
    incidentBegin: "2026-02-17",
    incidentEnd: null,
    iaProgram: false,
    ihProgram: false,
    paOnly: true,
    femaUrl: "https://www.fema.gov/disaster/5618",
    counties: ["Statewide"],
    notes: "Fire Management Assistance. Active/ongoing.",
  },
  {
    id: "FM-5617",
    disasterNumber: 5617,
    title: "Oklahoma Ranger Road Fire",
    type: "Fire",
    state: "OK",
    declaredDate: "2026-02-17",
    incidentBegin: "2026-02-17",
    incidentEnd: null,
    iaProgram: false,
    ihProgram: false,
    paOnly: true,
    femaUrl: "https://www.fema.gov/disaster/5617",
    counties: ["Statewide"],
    notes: "Fire Management Assistance. Active/ongoing.",
  },
  {
    id: "FM-5616",
    disasterNumber: 5616,
    title: "Oklahoma Stevens Fire",
    type: "Fire",
    state: "OK",
    declaredDate: "2026-02-17",
    incidentBegin: "2026-02-17",
    incidentEnd: null,
    iaProgram: false,
    ihProgram: false,
    paOnly: true,
    femaUrl: "https://www.fema.gov/disaster/5616",
    counties: ["Statewide"],
    notes: "Fire Management Assistance. Active/ongoing.",
  },
  // ── 2025 Alaska Typhoon Halong (Oct 2025 — IA active) ──
  {
    id: "DR-4893",
    disasterNumber: 4893,
    title: "Alaska Severe Storms, Flooding & Typhoon Halong Remnants",
    type: "Severe Storm(s)",
    state: "AK",
    declaredDate: "2025-10-22",
    incidentBegin: "2025-10-08",
    incidentEnd: "2025-10-13",
    iaProgram: true,
    ihProgram: true,
    femaUrl: "https://www.fema.gov/disaster/4893",
    counties: [
      "Northwest Arctic Borough",
      "Lower Yukon REAA",
      "Lower Kuskokwim REAA",
      "Kashunamiut REAA",
      "Yupiit REAA",
      "City of Saint Mary's",
    ],
    iaDeadline: "2026-02-20",
    notes:
      "IA active. Application deadline Feb 20, 2026. $30.2M approved for 1,713 households.",
  },
  // ── 2025 Tennessee Severe Storms & Tornadoes (Apr 2025 — IA active) ──
  {
    id: "DR-4878",
    disasterNumber: 4878,
    title: "Tennessee Severe Storms, Straight-line Winds, Tornadoes & Flooding",
    type: "Severe Storm(s)",
    state: "TN",
    declaredDate: "2025-06-20",
    incidentBegin: "2025-04-02",
    incidentEnd: "2025-04-24",
    iaProgram: true,
    ihProgram: true,
    femaUrl: "https://www.fema.gov/disaster/4878",
    counties: [
      "Cheatham",
      "Davidson",
      "Dickson",
      "Dyer",
      "Hardeman",
      "McNairy",
      "Montgomery",
      "Obion",
      "Wilson",
    ],
    notes: "IA for 9 counties. PA for 19 counties.",
  },
  // ── 2025 Kentucky Severe Storms & Flooding (Feb 2025 — IA active) ──
  {
    id: "DR-4863",
    disasterNumber: 4863,
    title: "Kentucky Severe Storms & Flooding",
    type: "Flood",
    state: "KY",
    declaredDate: "2025-02-25",
    incidentBegin: "2025-02-14",
    incidentEnd: "2025-02-28",
    iaProgram: true,
    ihProgram: true,
    femaUrl: "https://www.fema.gov/disaster/4863",
    counties: [
      "Breathitt",
      "Clay",
      "Estill",
      "Floyd",
      "Harlan",
      "Johnson",
      "Knott",
      "Lee",
      "Letcher",
      "Martin",
      "Owsley",
      "Perry",
      "Pike",
      "Simpson",
    ],
    notes: "IA for 14 counties.",
  },
  // ── 2025 Kentucky Severe Storms (Apr-May 2025) ──
  {
    id: "DR-4876",
    disasterNumber: 4876,
    title: "Kentucky Severe Storms, Straight-line Winds & Flooding",
    type: "Severe Storm(s)",
    state: "KY",
    declaredDate: "2025-04-24",
    incidentBegin: "2025-04-02",
    incidentEnd: "2025-04-06",
    iaProgram: true,
    ihProgram: true,
    femaUrl: "https://www.fema.gov/disaster/4876",
    counties: ["Clark", "Garrard", "Lincoln"],
    notes: "IA for 3 counties.",
  },
  {
    id: "DR-4880",
    disasterNumber: 4880,
    title: "Kentucky Severe Storms, Tornadoes & Flooding",
    type: "Severe Storm(s)",
    state: "KY",
    declaredDate: "2025-05-23",
    incidentBegin: "2025-05-07",
    incidentEnd: "2025-05-12",
    iaProgram: true,
    ihProgram: true,
    femaUrl: "https://www.fema.gov/disaster/4880",
    counties: ["Caldwell", "Laurel", "Pulaski", "Russell", "Trigg", "Union"],
    notes: "IA for 6 counties.",
  },
];
const FEMA_2026_FALLBACK = FEMA_DISASTER_DB;

// Fetch live FEMA disaster declarations from OpenFEMA API
// Queries 2025–2026 Major Disaster Declarations (DR type)
// Falls back to hardcoded data if API fails (government shutdown, etc.)
async function fetchLiveFemaDisasters() {
  const now = new Date();
  // Look back 12 months to catch all active SEP windows
  const lookbackDate = new Date(now);
  lookbackDate.setMonth(lookbackDate.getMonth() - 12);
  const dateStr = lookbackDate.toISOString().split("T")[0];

  const url = `https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=declarationDate ge '${dateStr}' and declarationType eq 'DR'&$orderby=declarationDate desc&$top=1000&$select=disasterNumber,declarationDate,incidentType,declarationTitle,state,designatedArea,ihProgramDeclared,iaProgramDeclared,paProgramDeclared,incidentBeginDate,incidentEndDate`;

  let apiResults = null;
  let apiFailed = false;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`FEMA API ${res.status}`);
    const data = await res.json();
    const records = data.DisasterDeclarationsSummaries || [];
    if (records.length === 0) throw new Error("FEMA API returned 0 records");

    // Group by disaster number — aggregate counties
    const map = {};
    records.forEach((r) => {
      const key = r.disasterNumber;
      if (!map[key]) {
        map[key] = {
          id: `DR-${r.disasterNumber}`,
          disasterNumber: r.disasterNumber,
          title: r.declarationTitle || "Unnamed Disaster",
          type: r.incidentType || "Other",
          state: r.state,
          declaredDate: r.declarationDate?.split("T")[0],
          incidentBegin: r.incidentBeginDate?.split("T")[0],
          incidentEnd: r.incidentEndDate?.split("T")[0],
          iaProgram: r.iaProgramDeclared,
          ihProgram: r.ihProgramDeclared,
          paOnly:
            !r.iaProgramDeclared && !r.ihProgramDeclared && r.paProgramDeclared,
          counties: [],
        };
      }
      const county = (r.designatedArea || "")
        .replace(/\s*\(County\)\s*/i, "")
        .replace(/\s*\(Parish\)\s*/i, "")
        .replace(/\s*\(Borough\)\s*/i, "")
        .replace(/\s*\(Census Area\)\s*/i, "")
        .replace(/\s*\(Municipality\)\s*/i, "")
        .replace(/\s*\(Statewide\)\s*/i, "Statewide")
        .trim();
      if (county && !map[key].counties.includes(county))
        map[key].counties.push(county);
    });

    apiResults = Object.values(map);
  } catch (err) {
    console.error("FEMA API error:", err);
    apiFailed = true;
  }

  // Use API results if available AND non-empty, otherwise fall back to hardcoded data
  // The FEMA API may return empty results during government funding lapses
  const disasters =
    apiResults && apiResults.length > 0 ? apiResults : FEMA_2026_FALLBACK;
  if (!apiResults || apiResults.length === 0) apiFailed = true;

  // Process SEP windows for all DR declarations
  // CMS rule: SEP lasts 2 full calendar months after the END of the incident
  // period. For PA-only disasters, note they may still qualify for SEP if
  // IA is added later (common with winter storms).
  return {
    apiFailed,
    disasters: disasters
      .filter((d) => d.iaProgram || d.ihProgram || d.paOnly)
      .map((d) => {
        const declared = new Date(d.declaredDate);
        const incidentEnd = d.incidentEnd ? new Date(d.incidentEnd) : null;
        const isOngoing = !incidentEnd || incidentEnd > now;

        let sepEnd;
        let durationLabel;
        if (d.paOnly) {
          // PA-only — no SEP yet, but may be amended to include IA
          const baseDate = incidentEnd || declared;
          sepEnd = new Date(baseDate);
          sepEnd.setMonth(sepEnd.getMonth() + 2);
          sepEnd = new Date(sepEnd.getFullYear(), sepEnd.getMonth() + 1, 0);
          durationLabel = "PA only — SEP activates if IA is declared";
        } else if (isOngoing) {
          sepEnd = new Date(now.getFullYear() + 1, 0, 1);
          durationLabel =
            "Ongoing — incident still active (SEP open until closed + 2 mo)";
        } else {
          const baseDate = incidentEnd > declared ? incidentEnd : declared;
          sepEnd = new Date(baseDate);
          sepEnd.setMonth(sepEnd.getMonth() + 2);
          sepEnd = new Date(sepEnd.getFullYear(), sepEnd.getMonth() + 1, 0);
          durationLabel = `2 calendar months after incident end (${d.incidentEnd})`;
        }

        return {
          ...d,
          sepEndDate: sepEnd.toISOString().split("T")[0],
          isOngoing,
          durationLabel,
          counties: (d.counties || []).sort(),
        };
      })
      .filter((d) => new Date(d.sepEndDate) > now),
  };
}

const CARRIERS = {
  uhc: {
    name: "UnitedHealthcare",
    abbr: "UHC",
    color: "#002677",
    products: ["MA", "MAPD", "PDP", "Medigap"],
    website: "uhc.com",
  },
  aetna: {
    name: "Aetna (CVS Health)",
    abbr: "Aetna",
    color: "#7D3F98",
    products: ["MA", "MAPD", "PDP", "Medigap"],
    website: "aetna.com",
  },
  bcbs: {
    name: "Blue Cross Blue Shield",
    abbr: "BCBS",
    color: "#0079C1",
    products: ["MA", "MAPD", "PDP", "Medigap"],
    website: "bcbs.com",
  },
  cigna: {
    name: "Cigna Healthcare",
    abbr: "Cigna",
    color: "#E57200",
    products: ["MA", "MAPD", "PDP"],
    website: "cigna.com",
  },
  humana: {
    name: "Humana",
    abbr: "Humana",
    color: "#43B02A",
    products: ["MA", "MAPD", "PDP", "Medigap"],
    website: "humana.com",
  },
  wellcare: {
    name: "Wellcare (Centene)",
    abbr: "Wellcare",
    color: "#005EB8",
    products: ["MA", "MAPD", "PDP"],
    website: "wellcare.com",
  },
  molina: {
    name: "Molina Healthcare",
    abbr: "Molina",
    color: "#BE1E2D",
    products: ["MA", "MAPD"],
    website: "molinahealthcare.com",
  },
  devoted: {
    name: "Devoted Health",
    abbr: "Devoted",
    color: "#FF6B35",
    products: ["MA", "MAPD"],
    website: "devoted.com",
  },
  alignment: {
    name: "Alignment Health",
    abbr: "Alignment",
    color: "#00A99D",
    products: ["MA", "MAPD"],
    website: "alignmenthealthcare.com",
  },
  kaiser: {
    name: "Kaiser Permanente",
    abbr: "Kaiser",
    color: "#006BA6",
    products: ["MA", "MAPD"],
    website: "kaiserpermanente.org",
  },
  mutual: {
    name: "Mutual of Omaha",
    abbr: "MutualOmaha",
    color: "#003768",
    products: ["Medigap"],
    website: "mutualofomaha.com",
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PLAN DATABASE — CY2026 CMS Landscape Source File (November 2025 release)
// Parsed from CY2026_Landscape_202511.csv — Contract IDs verified against CMS
// H=local MA, R=regional PPO, S=PDP | Supplementals from carrier ANOC/PBP
// ═══════════════════════════════════════════════════════════════════════════════
const PLAN_DB = [
  // ── UHC (CY2026 CMS Landscape) ──
  {
    cid: "H2802",
    pbp: "001",
    carrier: "uhc",
    name: "AARP Medicare Advantage Essentials from UHC NE-3 (HMO-POS)",
    type: "HMO-POS",
    cat: "MAPD",
    snp: null,
    stars: 4,
    prem: 0,
    moop: 5900,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["IA", "NE"],
  },
  {
    cid: "H2001",
    pbp: "124",
    carrier: "uhc",
    name: "AARP Medicare Advantage Patriot No Rx FG-MA01 (PPO)",
    type: "PPO",
    cat: "MA",
    snp: null,
    stars: 4.5,
    prem: 0,
    moop: 4900,
    partD: false,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["MN", "ND"],
  },
  {
    cid: "H3256",
    pbp: "004",
    carrier: "uhc",
    name: "UHC Dual Complete GA-S2 (PPO D-SNP)",
    type: "PPO",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 5,
    prem: 25.4,
    moop: 9250,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["GA"],
  },
  {
    cid: "H5652",
    pbp: "004",
    carrier: "uhc",
    name: "Erickson Advantage Champion (HMO-POS C-SNP)",
    type: "HMO-POS",
    cat: "MAPD",
    snp: "C-SNP",
    stars: 5,
    prem: 182,
    moop: 3400,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["CO", "FL", "KS", "MA", "MD", "MI", "NC", "NJ", "PA", "TX", "VA"],
  },
  {
    cid: "S5921",
    pbp: "370",
    carrier: "uhc",
    name: "AARP Medicare Rx Saver from UHC (PDP)",
    type: "PDP",
    cat: "PDP",
    snp: null,
    stars: null,
    prem: 5.3,
    moop: null,
    partD: true,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["IA", "MN", "MT", "ND", "NE", "SD", "WY"],
  },
  {
    cid: "H2001",
    pbp: "139",
    carrier: "uhc",
    name: "AARP Medicare Advantage Patriot No Rx SI-MA2 (PPO)",
    type: "PPO",
    cat: "MA",
    snp: null,
    stars: 4.5,
    prem: 0,
    moop: 6700,
    partD: false,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["NE", "SD"],
  },
  {
    cid: "S5921",
    pbp: "406",
    carrier: "uhc",
    name: "AARP Medicare Rx Preferred from UHC (PDP)",
    type: "PDP",
    cat: "PDP",
    snp: null,
    stars: null,
    prem: 140.2,
    moop: null,
    partD: true,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["IA", "MN", "MT", "ND", "NE", "SD", "WY"],
  },
  // ── Aetna (CY2026 CMS Landscape) ──
  {
    cid: "H2663",
    pbp: "025",
    carrier: "aetna",
    name: "Aetna Medicare Eagle (HMO-POS)",
    type: "HMO-POS",
    cat: "MA",
    snp: null,
    stars: 4,
    prem: 0,
    moop: 5500,
    partD: false,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["KS", "MO"],
  },
  {
    cid: "H5521",
    pbp: "296",
    carrier: "aetna",
    name: "Aetna Medicare Eagle Giveback (PPO)",
    type: "PPO",
    cat: "MA",
    snp: null,
    stars: 4.5,
    prem: 0,
    moop: 5900,
    partD: false,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["CT", "MA", "ME", "NH", "RI"],
  },
  {
    cid: "H1609",
    pbp: "045",
    carrier: "aetna",
    name: "Aetna Medicare Dual Select (HMO D-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 4.5,
    prem: 0,
    moop: 9250,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["FL"],
  },
  {
    cid: "H2663",
    pbp: "098",
    carrier: "aetna",
    name: "Aetna Medicare Chronic Care (HMO C-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "C-SNP",
    stars: 4,
    prem: 0,
    moop: 6750,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["KS", "MO"],
  },
  {
    cid: "S5601",
    pbp: "050",
    carrier: "aetna",
    name: "SilverScript Choice (PDP)",
    type: "PDP",
    cat: "PDP",
    snp: null,
    stars: null,
    prem: 29.7,
    moop: null,
    partD: true,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["IA", "MN", "MT", "ND", "NE", "SD", "WY"],
  },
  {
    cid: "H5521",
    pbp: "286",
    carrier: "aetna",
    name: "Aetna Medicare Eagle (PPO)",
    type: "PPO",
    cat: "MA",
    snp: null,
    stars: 4.5,
    prem: 0,
    moop: 4900,
    partD: false,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["IL", "IN", "MI", "WI"],
  },
  {
    cid: "S5601",
    pbp: "004",
    carrier: "aetna",
    name: "SilverScript Choice (PDP)",
    type: "PDP",
    cat: "PDP",
    snp: null,
    stars: null,
    prem: 32.7,
    moop: null,
    partD: true,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["CT", "MA", "RI", "VT"],
  },
  // ── Humana (CY2026 CMS Landscape) ──
  {
    cid: "H0028",
    pbp: "053",
    carrier: "humana",
    name: "Humana Gold Plus H0028-053 (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 3.5,
    prem: 0,
    moop: 4200,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["IA", "NE"],
  },
  {
    cid: "H5216",
    pbp: "048",
    carrier: "humana",
    name: "HumanaChoice H5216-048 (PPO)",
    type: "PPO",
    cat: "MAPD",
    snp: null,
    stars: 3.5,
    prem: 87,
    moop: 6750,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["ID", "MT", "OR", "UT", "WA", "WY"],
  },
  {
    cid: "H1036",
    pbp: "210",
    carrier: "humana",
    name: "Humana Gold Plus SNP-DE H1036-210 (HMO D-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 4.5,
    prem: 0,
    moop: 3400,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["FL"],
  },
  {
    cid: "H1036",
    pbp: "306",
    carrier: "humana",
    name: "Humana Gold Plus - Diabetes and Heart (HMO C-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "C-SNP",
    stars: 4.5,
    prem: 0,
    moop: 5500,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["OR", "WA"],
  },
  {
    cid: "S5884",
    pbp: "145",
    carrier: "humana",
    name: "Humana Basic Rx Plan (PDP)",
    type: "PDP",
    cat: "PDP",
    snp: null,
    stars: null,
    prem: 4.7,
    moop: null,
    partD: true,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["IA", "MN", "MT", "ND", "NE", "SD", "WY"],
  },
  {
    cid: "H0028",
    pbp: "014",
    carrier: "humana",
    name: "Humana Gold Plus H0028-014 (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 3.5,
    prem: 0,
    moop: 2700,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["IL", "MO"],
  },
  {
    cid: "S5884",
    pbp: "102",
    carrier: "humana",
    name: "Humana Basic Rx Plan (PDP)",
    type: "PDP",
    cat: "PDP",
    snp: null,
    stars: null,
    prem: 8.4,
    moop: null,
    partD: true,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["CT", "MA", "RI", "VT"],
  },
  // ── BCBS (CY2026 CMS Landscape) ──
  {
    cid: "H8547",
    pbp: "001",
    carrier: "bcbs",
    name: "Blue Cross Medicare Advantage Secure (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 3.5,
    prem: 0,
    moop: 4750,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["IL"],
  },
  {
    cid: "H0107",
    pbp: "005",
    carrier: "bcbs",
    name: "Blue Cross Medicare Advantage Choice Plus (PPO)",
    type: "PPO",
    cat: "MAPD",
    snp: null,
    stars: 3.5,
    prem: 0,
    moop: 9250,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["MT"],
  },
  {
    cid: "H8634",
    pbp: "009",
    carrier: "bcbs",
    name: "Blue Cross MA Dual Care Plus Preferred (PPO D-SNP)",
    type: "PPO",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 3,
    prem: 0,
    moop: 9250,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["NM"],
  },
  {
    cid: "H7917",
    pbp: "044",
    carrier: "bcbs",
    name: "BlueAdvantage Total Heart and Diabetes (PPO C-SNP)",
    type: "PPO",
    cat: "MAPD",
    snp: "C-SNP",
    stars: 4,
    prem: 0,
    moop: 6700,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["GA", "TN"],
  },
  {
    cid: "S5715",
    pbp: "015",
    carrier: "bcbs",
    name: "Blue Cross MedicareRx Basic (PDP)",
    type: "PDP",
    cat: "PDP",
    snp: null,
    stars: null,
    prem: 0,
    moop: null,
    partD: true,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["OK"],
  },
  {
    cid: "H0107",
    pbp: "007",
    carrier: "bcbs",
    name: "Blue Cross Medicare Advantage Dental Premier (PPO)",
    type: "PPO",
    cat: "MAPD",
    snp: null,
    stars: 3.5,
    prem: 0,
    moop: 8100,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["MT"],
  },
  {
    cid: "S5715",
    pbp: "012",
    carrier: "bcbs",
    name: "Blue Cross MedicareRx Basic (PDP)",
    type: "PDP",
    cat: "PDP",
    snp: null,
    stars: null,
    prem: 89.7,
    moop: null,
    partD: true,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["IL"],
  },
  // ── Wellcare (CY2026 CMS Landscape) ──
  {
    cid: "H1032",
    pbp: "193",
    carrier: "wellcare",
    name: "Wellcare Giveback (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 4,
    prem: 0,
    moop: 7200,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["FL"],
  },
  {
    cid: "H5439",
    pbp: "015",
    carrier: "wellcare",
    name: "Wellcare Giveback Open (PPO)",
    type: "PPO",
    cat: "MAPD",
    snp: null,
    stars: 3,
    prem: 0,
    moop: 9250,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["OR", "WA"],
  },
  {
    cid: "H1032",
    pbp: "202",
    carrier: "wellcare",
    name: "Wellcare Dual Reserve (HMO D-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 4,
    prem: 4.8,
    moop: 3000,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["FL"],
  },
  {
    cid: "H0351",
    pbp: "057",
    carrier: "wellcare",
    name: "Wellcare Specialty Simple (HMO C-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "C-SNP",
    stars: 3.5,
    prem: 0,
    moop: 9250,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["AZ"],
  },
  {
    cid: "S4802",
    pbp: "158",
    carrier: "wellcare",
    name: "Wellcare Value Script (PDP)",
    type: "PDP",
    cat: "PDP",
    snp: null,
    stars: null,
    prem: 9.6,
    moop: null,
    partD: true,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["IA", "MN", "MT", "ND", "NE", "SD", "WY"],
  },
  {
    cid: "H5439",
    pbp: "019",
    carrier: "wellcare",
    name: "Wellcare Low Premium Open (PPO)",
    type: "PPO",
    cat: "MAPD",
    snp: null,
    stars: 3,
    prem: 59,
    moop: 7000,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["OR", "WA"],
  },
  {
    cid: "S4802",
    pbp: "089",
    carrier: "wellcare",
    name: "Wellcare Classic (PDP)",
    type: "PDP",
    cat: "PDP",
    snp: null,
    stars: null,
    prem: 12.7,
    moop: null,
    partD: true,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["IA", "MN", "MT", "ND", "NE", "SD", "WY"],
  },
  // ── Molina (CY2026 CMS Landscape) ──
  {
    cid: "H5810",
    pbp: "014",
    carrier: "molina",
    name: "Molina Medicare Choice Care (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 3,
    prem: 0,
    moop: 3600,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["CA"],
  },
  {
    cid: "H1799",
    pbp: "005",
    carrier: "molina",
    name: "Molina Medicare Complete Care (HMO D-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 3.5,
    prem: 0,
    moop: 9250,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["IA"],
  },
  {
    cid: "H5649",
    pbp: "025",
    carrier: "molina",
    name: "Central Health Embrace Care Plan (HMO C-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "C-SNP",
    stars: 3,
    prem: 0,
    moop: 1900,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["CA"],
  },
  {
    cid: "H2715",
    pbp: "003",
    carrier: "molina",
    name: "Molina Medicare Choice Care (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: null,
    prem: 0,
    moop: 9250,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["IL"],
  },
  // ── Devoted (CY2026 CMS Landscape) ──
  {
    cid: "H1290",
    pbp: "045",
    carrier: "devoted",
    name: "DEVOTED GIVEBACK 045 FL (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 5,
    prem: 0,
    moop: 6750,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["FL"],
  },
  {
    cid: "H9884",
    pbp: "008",
    carrier: "devoted",
    name: "DEVOTED CHOICE GIVEBACK 008 FL (PPO)",
    type: "PPO",
    cat: "MAPD",
    snp: null,
    stars: 4.5,
    prem: 0,
    moop: 9250,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["FL"],
  },
  {
    cid: "H1290",
    pbp: "052",
    carrier: "devoted",
    name: "DEVOTED DUAL PLUS 052 FL (HMO D-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 5,
    prem: 0,
    moop: 9250,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["FL"],
  },
  {
    cid: "H7993",
    pbp: "046",
    carrier: "devoted",
    name: "DEVOTED C-SNP 046 TX (HMO C-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "C-SNP",
    stars: 5,
    prem: 0,
    moop: 4450,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["TX"],
  },
  {
    cid: "H1290",
    pbp: "046",
    carrier: "devoted",
    name: "DEVOTED CORE 046 FL (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 5,
    prem: 0,
    moop: 4900,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["FL"],
  },
  // ── Alignment (CY2026 CMS Landscape) ──
  {
    cid: "H5296",
    pbp: "003",
    carrier: "alignment",
    name: "Alignment Health Platinum (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 5,
    prem: 0,
    moop: 3900,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["NC"],
  },
  {
    cid: "H4961",
    pbp: "006",
    carrier: "alignment",
    name: "Alignment Health Balance (PPO)",
    type: "PPO",
    cat: "MAPD",
    snp: null,
    stars: 4,
    prem: 41,
    moop: 2850,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["CA"],
  },
  {
    cid: "H9686",
    pbp: "005",
    carrier: "alignment",
    name: "Alignment Health the ONE (HMO D-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 5,
    prem: 9.5,
    moop: 9250,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["NV"],
  },
  {
    cid: "H5296",
    pbp: "011",
    carrier: "alignment",
    name: "Alignment Health Heart & Diabetes Care (HMO C-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "C-SNP",
    stars: 5,
    prem: 0,
    moop: 3400,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["NC"],
  },
  {
    cid: "H5296",
    pbp: "006",
    carrier: "alignment",
    name: "Alignment Health smartHMO (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 5,
    prem: 0,
    moop: 3400,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["NC"],
  },
  // ── Kaiser (CY2026 CMS Landscape) ──
  {
    cid: "H9003",
    pbp: "009",
    carrier: "kaiser",
    name: "Kaiser Permanente Senior Advantage Value (HMO-POS)",
    type: "HMO-POS",
    cat: "MAPD",
    snp: null,
    stars: 4,
    prem: 0,
    moop: 5500,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["OR", "WA"],
  },
  {
    cid: "H3138",
    pbp: "001",
    carrier: "kaiser",
    name: "Kaiser Permanente Senior Advantage Choice DM (PPO)",
    type: "PPO",
    cat: "MAPD",
    snp: null,
    stars: null,
    prem: 0,
    moop: 6100,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["CO"],
  },
  {
    cid: "H0630",
    pbp: "014",
    carrier: "kaiser",
    name: "Kaiser Permanente Dual Essential (HMO D-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 4.5,
    prem: 0,
    moop: 4900,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["CO"],
  },
  {
    cid: "H9003",
    pbp: "006",
    carrier: "kaiser",
    name: "Kaiser Permanente Senior Advantage Standard (HMO-POS)",
    type: "HMO-POS",
    cat: "MAPD",
    snp: null,
    stars: 4,
    prem: 37,
    moop: 4500,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["OR", "WA"],
  },
];

function getPlansForState(zip) {
  const st = getStateFromZip(zip);
  return PLAN_DB.filter(
    (p) => p.states.includes("ALL") || p.states.includes(st)
  );
}

// Zip-to-state mapping (simplified — covers major ranges)
function getStateFromZip(zip) {
  const z = parseInt(zip);
  if (z >= 35000 && z <= 36999) return "AL";
  if (z >= 99500 && z <= 99999) return "AK";
  if (z >= 85000 && z <= 86599) return "AZ";
  if (z >= 71600 && z <= 72999) return "AR";
  if (z >= 90000 && z <= 96699) return "CA";
  if (z >= 80000 && z <= 81699) return "CO";
  if (z >= 6000 && z <= 6999) return "CT";
  if (z >= 19700 && z <= 19999) return "DE";
  if (z >= 32000 && z <= 34999) return "FL";
  if (z >= 30000 && z <= 31999) return "GA";
  if (z >= 96700 && z <= 96899) return "HI";
  if (z >= 83200 && z <= 83899) return "ID";
  if (z >= 60000 && z <= 62999) return "IL";
  if (z >= 46000 && z <= 47999) return "IN";
  if (z >= 50000 && z <= 52899) return "IA";
  if (z >= 66000 && z <= 67999) return "KS";
  if (z >= 40000 && z <= 42799) return "KY";
  if (z >= 70000 && z <= 71499) return "LA";
  if (z >= 3900 && z <= 4999) return "ME";
  if (z >= 20600 && z <= 21999) return "MD";
  if (z >= 1000 && z <= 2799) return "MA";
  if (z >= 48000 && z <= 49999) return "MI";
  if (z >= 55000 && z <= 56799) return "MN";
  if (z >= 38600 && z <= 39799) return "MS";
  if (z >= 63000 && z <= 65899) return "MO";
  if (z >= 59000 && z <= 59999) return "MT";
  if (z >= 68000 && z <= 69399) return "NE";
  if (z >= 88900 && z <= 89899) return "NV";
  if (z >= 3000 && z <= 3899) return "NH";
  if (z >= 7000 && z <= 8999) return "NJ";
  if (z >= 87000 && z <= 88499) return "NM";
  if (z >= 10000 && z <= 14999) return "NY";
  if (z >= 27000 && z <= 28999) return "NC";
  if (z >= 58000 && z <= 58899) return "ND";
  if (z >= 43000 && z <= 45999) return "OH";
  if (z >= 73000 && z <= 74999) return "OK";
  if (z >= 97000 && z <= 97999) return "OR";
  if (z >= 15000 && z <= 19699) return "PA";
  if (z >= 2800 && z <= 2999) return "RI";
  if (z >= 29000 && z <= 29999) return "SC";
  if (z >= 57000 && z <= 57799) return "SD";
  if (z >= 37000 && z <= 38599) return "TN";
  if (z >= 75000 && z <= 79999) return "TX";
  if ((z >= 73300 && z <= 73399) || (z >= 77000 && z <= 77099)) return "TX";
  if (z >= 84000 && z <= 84799) return "UT";
  if (z >= 5000 && z <= 5999) return "VT";
  if (z >= 22000 && z <= 24699) return "VA";
  if (z >= 20000 && z <= 20599) return "DC";
  if (z >= 98000 && z <= 99499) return "WA";
  if (z >= 24700 && z <= 26899) return "WV";
  if (z >= 53000 && z <= 54999) return "WI";
  if (z >= 82000 && z <= 83199) return "WY";
  return "Unknown";
}

// Determine which carriers serve a given state (simplified service area logic)
function getCarriersForZip(zip) {
  const state = getStateFromZip(zip);
  const allCarriers = Object.keys(CARRIERS);
  // Kaiser only available in select states
  const kaiserStates = ["CA", "CO", "GA", "HI", "MD", "OR", "VA", "WA", "DC"];
  // Alignment primarily in CA, NC, NV, AZ, TX
  const alignmentStates = ["CA", "NC", "NV", "AZ", "TX"];

  return allCarriers
    .filter((key) => {
      if (key === "kaiser" && !kaiserStates.includes(state)) return false;
      if (key === "alignment" && !alignmentStates.includes(state)) return false;
      return true;
    })
    .map((key) => ({ key, ...CARRIERS[key] }));
}

// Check for 5-star plans — dynamically checks PLAN_DB for the zip's state
function hasFiveStarPlans(zip) {
  const st = getStateFromZip(zip);
  return PLAN_DB.some(
    (p) => p.stars >= 5 && (p.states.includes("ALL") || p.states.includes(st))
  );
}

// Helper: days remaining until a date from today
function daysRemaining(dateStr) {
  const end = new Date(dateStr);
  const now = new Date();
  return Math.max(0, Math.ceil((end - now) / 86400000));
}

// Helper: is a date-bounded SEP currently active?
function isActiveNow(startStr, endStr) {
  const now = new Date();
  if (startStr === "Year-round" || startStr === "Varies by individual")
    return true;
  return new Date(startStr) <= now && now <= new Date(endStr);
}

// Build ACTIVE Medicare Advantage SEPs only — each SEP includes matching plans
// clientQualifiers: { hasMedicaidLIS, hasChronicCondition, recentlyMoved, lostCoverage }
function getSEPsForZip(zip, femaDisasters = [], clientQualifiers = {}) {
  const state = getStateFromZip(zip);
  const today = new Date();
  const seps = [];
  const zipPlans = getPlansForState(zip);
  const maPlans = (filter) => zipPlans.filter(filter);

  const { hasMedicaidLIS, hasChronicCondition, recentlyMoved, lostCoverage } =
    clientQualifiers;

  // 1. FEMA Disaster SEPs (LIVE from OpenFEMA API, with 2026 fallback)
  // Match by state — agents verify specific county from the list
  // CMS: SEP = 2 full calendar months after incident end or declaration, whichever later
  femaDisasters
    .filter((d) => d.state === state)
    .forEach((d) => {
      if (new Date(d.sepEndDate) > today) {
        const isPAOnly = d.paOnly && !d.iaProgram && !d.ihProgram;
        seps.push({
          id: `fema-${d.id}`,
          category: "FEMA Disaster",
          type: isPAOnly
            ? "FEMA Disaster (PA Only — No SEP Yet)"
            : "FEMA Disaster SEP",
          code: "SEP-FEMA",
          event: d.title,
          description: `${d.id} — ${d.type} in ${
            d.state
          }. Counties: ${d.counties.join(", ")}.${
            isPAOnly
              ? " ⚠️ Public Assistance only — Medicare SEP NOT yet active. Monitor for IA amendment."
              : ` Enroll in or switch MA/MAPD plans.${
                  d.isOngoing
                    ? " ⚠️ Incident still active — SEP window remains open."
                    : ""
                }`
          }`,
          startDate: d.declaredDate,
          endDate: isPAOnly
            ? "Pending IA declaration"
            : d.isOngoing
            ? "Open (incident ongoing)"
            : d.sepEndDate,
          duration: d.durationLabel || "2 calendar months after incident end",
          eligibleProducts: isPAOnly ? [] : ["MA", "MAPD", "PDP"],
          source: "FEMA",
          urgency: isPAOnly
            ? "info"
            : d.isOngoing
            ? "high"
            : daysRemaining(d.sepEndDate) < 30
            ? "high"
            : "medium",
          counties: d.counties,
          daysLeft: isPAOnly
            ? null
            : d.isOngoing
            ? null
            : daysRemaining(d.sepEndDate),
          isOngoing: d.isOngoing,
          isPAOnly,
          matchingPlans: isPAOnly
            ? []
            : maPlans((p) => ["MA", "MAPD", "PDP"].includes(p.cat)),
        });
      }
    });

  // 2. MA OEP (Jan 1 – Mar 31) — dynamic year
  const curYear = today.getFullYear();
  if (isActiveNow(`${curYear}-01-01`, `${curYear}-03-31`)) {
    seps.push({
      id: `medicare-oep-${curYear}`,
      category: "Medicare",
      type: "Medicare Advantage OEP",
      code: "OEP",
      event: `Annual MA Open Enrollment (Jan 1 – Mar 31, ${curYear})`,
      description:
        "Currently enrolled MA beneficiaries can make ONE plan change: switch MA/MAPD plan, or drop MA and return to Original Medicare + PDP.",
      startDate: `${curYear}-01-01`,
      endDate: `${curYear}-03-31`,
      duration: "Jan 1 – Mar 31",
      eligibleProducts: ["MA", "MAPD"],
      source: "CMS",
      urgency: "medium",
      daysLeft: daysRemaining(`${curYear}-03-31`),
      matchingPlans: maPlans((p) => ["MA", "MAPD"].includes(p.cat) && !p.snp),
    });
  }

  // 3. ICEP
  seps.push({
    id: "medicare-icep",
    category: "Medicare",
    type: "Initial Coverage Election Period (ICEP)",
    code: "ICEP",
    event: "Turning 65 / New to Medicare",
    description:
      "7-month window around 65th birthday. First chance to enroll in MA, MAPD, or Medigap.",
    startDate: "Varies by individual",
    endDate: "Varies by individual",
    duration: "3 mo before + birthday month + 3 mo after turning 65",
    eligibleProducts: ["MA", "MAPD", "Medigap"],
    source: "CMS",
    urgency: "info",
    matchingPlans: maPlans((p) => ["MA", "MAPD", "Medigap"].includes(p.cat)),
  });

  // 4. IEP
  seps.push({
    id: "medicare-iep",
    category: "Medicare",
    type: "Initial Enrollment Period (IEP)",
    code: "IEP",
    event: "First eligible for Medicare Part A/B",
    description:
      "7-month period to sign up for Part A/B, then enroll in MA/MAPD. Late Part B enrollment may trigger penalties.",
    startDate: "Varies by individual",
    endDate: "Varies by individual",
    duration: "7-month window around 65th birthday or 25th month of disability",
    eligibleProducts: ["MA", "MAPD", "PDP", "Medigap"],
    source: "CMS",
    urgency: "info",
    matchingPlans: maPlans((p) => ["MA", "MAPD", "Medigap"].includes(p.cat)),
  });

  // 5. 5-Star SEP (Dec 8 prior year – Nov 30 current year)
  const fiveStarStart = `${curYear - 1}-12-08`;
  const fiveStarEnd = `${curYear}-11-30`;
  if (hasFiveStarPlans(zip) && isActiveNow(fiveStarStart, fiveStarEnd)) {
    seps.push({
      id: "medicare-5star",
      category: "Medicare",
      type: "5-Star Special Enrollment Period",
      code: "5-STAR",
      event: "5-Star rated plan available in this area",
      description:
        "CMS 5-star rated MA/MAPD plan available. Switch to a 5-star plan once per year. Only 5-star plans shown below.",
      startDate: fiveStarStart,
      endDate: fiveStarEnd,
      duration: "Dec 8 – Nov 30 (once/year)",
      eligibleProducts: ["MA", "MAPD"],
      source: "CMS Star Ratings",
      urgency: "low",
      daysLeft: daysRemaining(fiveStarEnd),
      matchingPlans: maPlans((p) => p.stars >= 5),
    });
  }

  // 6. Dual-Eligible / LIS (SEP-MDE) — quarterly changes Q1-Q3
  {
    const currentQuarter = Math.floor(today.getMonth() / 3) + 1;
    const quarterEndDates = {
      1: `${curYear}-03-31`,
      2: `${curYear}-06-30`,
      3: `${curYear}-09-30`,
      4: `${curYear}-12-31`,
    };
    const isInEnrollmentQuarters = currentQuarter <= 3; // Q1-Q3 only
    const dsnpPlans = maPlans(
      (p) => p.snp === "D-SNP" || ["MA", "MAPD"].includes(p.cat)
    );

    seps.push({
      id: "medicare-dual-lis",
      category: "Medicare",
      type: "Dual-Eligible / LIS (Extra Help) SEP",
      code: "DUAL/LIS",
      event: "Dual-eligible (Medicare+Medicaid) or Extra Help/LIS",
      description: `Continuous SEP — change MA/MAPD once per quarter during Q1–Q3 (Jan–Sep). D-SNP plans designed for dual-eligible beneficiaries.${
        isInEnrollmentQuarters
          ? ` Currently in Q${currentQuarter} — next quarterly deadline: ${quarterEndDates[currentQuarter]}.`
          : ` Q4 (Oct–Dec): No quarterly changes available until Jan 1.`
      }`,
      startDate: "Year-round",
      endDate: "Year-round",
      duration: "Continuous — once per quarter (Q1–Q3)",
      eligibleProducts: ["MA", "MAPD", "D-SNP"],
      source: "CMS",
      urgency: hasMedicaidLIS ? "high" : "info",
      clientQualified: hasMedicaidLIS,
      quarterInfo: isInEnrollmentQuarters
        ? `Q${currentQuarter} ends ${quarterEndDates[currentQuarter]}`
        : "Q4 — no changes until Jan",
      daysLeft: isInEnrollmentQuarters
        ? daysRemaining(quarterEndDates[currentQuarter])
        : null,
      matchingPlans: dsnpPlans,
    });
  }

  // 7. Moved Out of Service Area (SEP-MOV)
  seps.push({
    id: "medicare-move",
    category: "Medicare",
    type: "Moved Out of Service Area SEP",
    code: "SEP-MOVE",
    event: "Permanent move — current plan no longer available",
    description:
      "63-day SEP to enroll in a new MA/MAPD plan in new service area after permanent address change. Client must have moved in last 63 days and plan must not serve new address.",
    startDate: "Varies by individual",
    endDate: "63 days from move date",
    duration: "63 days from move",
    eligibleProducts: ["MA", "MAPD", "Medigap"],
    source: "CMS",
    urgency: recentlyMoved ? "high" : "info",
    clientQualified: recentlyMoved,
    matchingPlans: maPlans((p) => ["MA", "MAPD", "Medigap"].includes(p.cat)),
  });

  // 8. Loss of Creditable Coverage (SEP-LOSS)
  seps.push({
    id: "medicare-loss-coverage",
    category: "Medicare",
    type: "Loss of Creditable Coverage SEP",
    code: "SEP-LOSS",
    event: "Involuntary loss of employer/union/group coverage",
    description:
      "63-day SEP after involuntary loss of creditable coverage (employer ended, COBRA expired, etc.). Includes loss of employer group health plan (EGHP), retiree coverage, or union coverage.",
    startDate: "Varies by individual",
    endDate: "63 days from loss",
    duration: "63 days from loss",
    eligibleProducts: ["MA", "MAPD", "Medigap"],
    source: "CMS",
    urgency: lostCoverage ? "high" : "info",
    clientQualified: lostCoverage,
    matchingPlans: maPlans((p) => ["MA", "MAPD", "Medigap"].includes(p.cat)),
  });

  // 9. Institutionalized / SNF
  seps.push({
    id: "medicare-institution",
    category: "Medicare",
    type: "Institutionalized / SNF SEP",
    code: "SEP-INST",
    event: "Move into/out of nursing facility or institution",
    description:
      "Continuous SEP while in institution + 2 months after discharge. I-SNP plans designed for institutionalized beneficiaries.",
    startDate: "Year-round",
    endDate: "Year-round",
    duration: "Continuous + 2 mo after discharge",
    eligibleProducts: ["MA", "MAPD", "I-SNP"],
    source: "CMS",
    urgency: "info",
    matchingPlans: maPlans(
      (p) => p.snp === "I-SNP" || ["MA", "MAPD"].includes(p.cat)
    ),
  });

  // 10. C-SNP (only if C-SNP plans exist in area)
  {
    const csnpPlans = maPlans((p) => p.snp === "C-SNP");
    if (csnpPlans.length > 0) {
      seps.push({
        id: "medicare-csnp",
        category: "Medicare",
        type: "Chronic Condition SNP (C-SNP) SEP",
        code: "SEP-CSNP",
        event: "Qualifying chronic condition (diabetes, ESRD, CHF, etc.)",
        description:
          "Year-round enrollment in C-SNP plans for individuals with qualifying chronic conditions. Qualifying conditions include: Diabetes Mellitus, ESRD, Chronic Heart Failure, Chronic Lung Disorders, Cardiovascular Disorders, and others per CMS list. Specialized care coordination included.",
        startDate: "Year-round",
        endDate: "Year-round",
        duration: "Continuous",
        eligibleProducts: ["C-SNP"],
        source: "CMS",
        urgency: hasChronicCondition ? "high" : "info",
        clientQualified: hasChronicCondition,
        matchingPlans: csnpPlans,
      });
    }
  }

  return seps;
}

// ─── ICONS// ─── ICONS ─────────────────────────────────────────────────────────────────────

const IconSearch = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const IconAlert = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const IconClock = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconShield = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const IconMap = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
const IconChevron = ({ open }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    style={{
      transition: "transform 0.25s ease",
      transform: open ? "rotate(90deg)" : "rotate(0deg)",
    }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const IconStar = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="#f59e0b"
    stroke="#f59e0b"
    strokeWidth="1"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);
const IconFilter = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);
const IconX = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ─── COMPONENTS ────────────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
  "FEMA Disaster": {
    bg: "rgba(220,38,38,0.1)",
    border: "rgba(239,68,68,0.35)",
    text: "#f87171",
    badge: "#ef4444",
  },
  Medicare: {
    bg: "rgba(37,99,235,0.1)",
    border: "rgba(59,130,246,0.3)",
    text: "#93c5fd",
    badge: "#38bdf8",
  },
};

const URGENCY_STYLES = {
  high: { bg: "#dc2626", text: "#fff", label: "URGENT" },
  medium: { bg: "#d97706", text: "#fff", label: "ACTIVE" },
  low: { bg: "#6366f1", text: "#fff", label: "OPEN" },
  info: { bg: "#5a6a80", text: "#cbd5e1", label: "ONGOING" },
};

function ProductBadge({ product }) {
  const colors = {
    MA: "#2563eb",
    MAPD: "#7c3aed",
    PDP: "#0891b2",
    Medigap: "#0d9488",
    "D-SNP": "#be185d",
    "I-SNP": "#9333ea",
    "C-SNP": "#c2410c",
  };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "6px",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.05em",
        color: "#fff",
        backgroundColor: colors[product] || "#5a6a80",
        marginRight: "4px",
        marginBottom: "4px",
      }}
    >
      {product}
    </span>
  );
}

function CarrierChip({ carrier }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px",
        borderRadius: "10px",
        fontSize: "12px",
        fontWeight: 600,
        backgroundColor: carrier.color + "14",
        color: carrier.color,
        border: `1px solid ${carrier.color}30`,
        marginRight: "6px",
        marginBottom: "6px",
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: carrier.color,
          flexShrink: 0,
        }}
      />
      {carrier.abbr}
    </span>
  );
}

function SEPCard({ sep, carriers, isExpanded, onToggle }) {
  const catColors =
    CATEGORY_COLORS[sep.category] || CATEGORY_COLORS["Medicare"];
  const urgStyle = URGENCY_STYLES[sep.urgency] || URGENCY_STYLES.info;
  const matchingCarriers = carriers.filter((c) =>
    sep.eligibleProducts.some((p) => c.products.includes(p))
  );

  return (
    <div
      style={{
        borderRadius: "20px",
        border: sep.clientQualified
          ? "1px solid rgba(52,211,153,0.35)"
          : "1px solid rgba(255,255,255,0.04)",
        background:
          "linear-gradient(180deg, rgba(18,24,35,0.3) 0%, #0f141c 40%, #0d1119 100%)",
        overflow: "hidden",
        boxShadow: sep.clientQualified
          ? "0 2px 4px rgba(0,0,0,0.5), 0 8px 20px rgba(0,0,0,0.4), 0 0 40px rgba(52,211,153,0.04), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "0 2px 4px rgba(0,0,0,0.5), 0 8px 20px rgba(0,0,0,0.4), 0 20px 50px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.3)",
        transition: "box-shadow 0.2s ease",
        marginBottom: "12px",
      }}
    >
      {/* Header */}
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "16px 20px",
          cursor: "pointer",
          userSelect: "none",
          borderBottom: isExpanded ? `1px solid ${catColors.border}50` : "none",
          background: isExpanded ? catColors.bg : "transparent",
          transition: "background 0.2s ease",
        }}
      >
        <IconChevron open={isExpanded} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              marginBottom: "4px",
            }}
          >
            <span
              style={{
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                padding: "2px 8px",
                borderRadius: "6px",
                textTransform: "uppercase",
                backgroundColor: urgStyle.bg,
                color: urgStyle.text,
              }}
            >
              {urgStyle.label}
            </span>
            {sep.clientQualified && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  textTransform: "uppercase",
                  backgroundColor: "#34d399",
                  color: "#fff",
                  animation: "none",
                }}
              >
                ✓ CLIENT QUALIFIED
              </span>
            )}
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.06em",
                padding: "2px 8px",
                borderRadius: "6px",
                textTransform: "uppercase",
                backgroundColor: catColors.badge + "18",
                color: catColors.badge,
              }}
            >
              {sep.category}
            </span>
            {sep.code === "5-STAR" && <IconStar />}
            {sep.isOngoing && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  padding: "2px 6px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(220,38,38,0.2)",
                  color: "#f87171",
                  animation: "pulse 2s ease-in-out infinite",
                }}
              >
                ⚠ ONGOING
              </span>
            )}
            {sep.quarterInfo && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  padding: "2px 6px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(99,102,241,0.15)",
                  color: "#38bdf8",
                }}
              >
                {sep.quarterInfo}
              </span>
            )}
            {sep.daysLeft != null && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  padding: "2px 6px",
                  borderRadius: "6px",
                  backgroundColor:
                    sep.daysLeft <= 14
                      ? "rgba(220,38,38,0.2)"
                      : sep.daysLeft <= 30
                      ? "rgba(217,119,6,0.2)"
                      : "rgba(22,163,74,0.2)",
                  color:
                    sep.daysLeft <= 14
                      ? "#f87171"
                      : sep.daysLeft <= 30
                      ? "#fbbf24"
                      : "#34d399",
                }}
              >
                {sep.daysLeft}d left
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: "15px",
              fontWeight: 700,
              color: "#e8edf5",
              lineHeight: 1.3,
            }}
          >
            {sep.type}
          </div>
          <div style={{ fontSize: "13px", color: "#8896ab", marginTop: "2px" }}>
            {sep.event}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: "4px",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            maxWidth: "200px",
          }}
        >
          {sep.eligibleProducts.slice(0, 4).map((p) => (
            <ProductBadge key={p} product={p} />
          ))}
          {sep.eligibleProducts.length > 4 && (
            <span
              style={{ fontSize: "11px", color: "#5a6a80", padding: "2px 4px" }}
            >
              +{sep.eligibleProducts.length - 4}
            </span>
          )}
        </div>
      </div>

      {/* Expanded Detail */}
      {isExpanded && (
        <div
          style={{
            padding: "20px",
            background:
              "linear-gradient(180deg, rgba(18,24,35,0.3) 0%, #0f141c 100%)",
          }}
        >
          <p
            style={{
              fontSize: "14px",
              color: "#cbd5e1",
              lineHeight: 1.6,
              margin: "0 0 16px 0",
            }}
          >
            {sep.description}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                background: "linear-gradient(180deg, #0a0e15 0%, #090d13 100%)",
                borderRadius: "14px",
                padding: "12px 16px",
                border: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#8896ab",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: "4px",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <IconClock /> Enrollment Window
                </span>
              </div>
              <div
                style={{ fontSize: "13px", fontWeight: 600, color: "#e8edf5" }}
              >
                {sep.duration}
              </div>
              <div
                style={{ fontSize: "12px", color: "#5a6a80", marginTop: "2px" }}
              >
                {sep.startDate !== "Year-round" &&
                sep.startDate !== "Varies by individual"
                  ? `${sep.startDate} → ${sep.endDate}`
                  : sep.startDate}
              </div>
            </div>
            <div
              style={{
                background: "linear-gradient(180deg, #0a0e15 0%, #090d13 100%)",
                borderRadius: "14px",
                padding: "12px 16px",
                border: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#8896ab",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: "4px",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <IconShield /> Eligible Products
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2px" }}>
                {sep.eligibleProducts.map((p) => (
                  <ProductBadge key={p} product={p} />
                ))}
              </div>
            </div>
            <div
              style={{
                background: "linear-gradient(180deg, #0a0e15 0%, #090d13 100%)",
                borderRadius: "14px",
                padding: "12px 16px",
                border: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#8896ab",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: "4px",
                }}
              >
                Source
              </div>
              <div
                style={{ fontSize: "13px", fontWeight: 600, color: "#e8edf5" }}
              >
                {sep.source}
              </div>
              <div
                style={{ fontSize: "12px", color: "#5a6a80", marginTop: "2px" }}
              >
                Code: {sep.code}
              </div>
            </div>
          </div>

          {sep.counties && (
            <div
              style={{
                background: "linear-gradient(180deg, #0a0e15 0%, #090d13 100%)",
                borderRadius: "14px",
                padding: "12px 16px",
                border: "1px solid rgba(255,255,255,0.04)",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#8896ab",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: "6px",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <IconMap /> Affected Counties
                </span>
              </div>
              <div
                style={{ fontSize: "13px", color: "#cbd5e1", lineHeight: 1.6 }}
              >
                {sep.counties.join("  •  ")}
              </div>
            </div>
          )}

          {/* Matching Plans for this SEP */}
          {sep.matchingPlans && sep.matchingPlans.length > 0 && (
            <div
              style={{
                background: "linear-gradient(180deg, #0a0e15 0%, #090d13 100%)",
                borderRadius: "14px",
                padding: "12px 16px",
                border: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#8896ab",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: "8px",
                }}
              >
                📋 Eligible Plans Under This SEP ({sep.matchingPlans.length})
              </div>
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "11px",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      {[
                        "Carrier",
                        "Plan",
                        "ID",
                        "Type",
                        "Stars",
                        "Premium",
                        "MOOP",
                        "Grocery",
                        "OTC",
                        "Flex",
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "6px 6px",
                            textAlign:
                              h === "Premium" || h === "MOOP"
                                ? "right"
                                : "left",
                            fontSize: "9px",
                            fontWeight: 700,
                            color: "#8896ab",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sep.matchingPlans.map((p, i) => {
                      const cr = CARRIERS[p.carrier] || {};
                      const typeColors = {
                        HMO: "#2563eb",
                        "HMO-POS": "#38bdf8",
                        PPO: "#7c3aed",
                        PDP: "#0891b2",
                        Medigap: "#0d9488",
                      };
                      const snpColors = {
                        "D-SNP": "#be185d",
                        "C-SNP": "#c2410c",
                        "I-SNP": "#9333ea",
                      };
                      return (
                        <tr
                          key={`${p.cid}-${p.pbp}-${i}`}
                          style={{
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}
                        >
                          <td
                            style={{ padding: "6px 6px", whiteSpace: "nowrap" }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <span
                                style={{
                                  width: "6px",
                                  height: "6px",
                                  borderRadius: "50%",
                                  backgroundColor: cr.color || "#666",
                                }}
                              />
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  color: "#e8edf5",
                                }}
                              >
                                {cr.abbr}
                              </span>
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "6px 6px",
                              fontSize: "11px",
                              fontWeight: 600,
                              color: "#cbd5e1",
                              maxWidth: "200px",
                            }}
                          >
                            {p.name}
                          </td>
                          <td
                            style={{
                              padding: "6px 6px",
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: "10px",
                              color: "#5a6a80",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {p.cid}-{p.pbp}
                          </td>
                          <td style={{ padding: "6px 6px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "1px 5px",
                                borderRadius: "4px",
                                fontSize: "9px",
                                fontWeight: 700,
                                color: "#fff",
                                backgroundColor:
                                  typeColors[p.type] || "#5a6a80",
                                marginRight: 2,
                              }}
                            >
                              {p.type}
                            </span>
                            {p.snp && (
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "1px 5px",
                                  borderRadius: "4px",
                                  fontSize: "9px",
                                  fontWeight: 700,
                                  color: "#fff",
                                  backgroundColor:
                                    snpColors[p.snp] || "#5a6a80",
                                }}
                              >
                                {p.snp}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "6px 6px" }}>
                            {p.stars != null ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0px",
                                }}
                              >
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <svg
                                    key={s}
                                    width={9}
                                    height={9}
                                    viewBox="0 0 24 24"
                                    fill={
                                      s <= Math.floor(p.stars)
                                        ? "#f59e0b"
                                        : "none"
                                    }
                                    stroke="#f59e0b"
                                    strokeWidth={1.5}
                                  >
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                  </svg>
                                ))}
                              </span>
                            ) : (
                              <span style={{ color: "#cbd5e1" }}>—</span>
                            )}
                          </td>
                          <td
                            style={{
                              padding: "6px 6px",
                              textAlign: "right",
                              fontWeight: 700,
                              color: p.prem === 0 ? "#34d399" : "#cbd5e1",
                              fontSize: "11px",
                            }}
                          >
                            {p.prem === 0 ? "$0" : `$${p.prem.toFixed(2)}`}
                          </td>
                          <td
                            style={{
                              padding: "6px 6px",
                              textAlign: "right",
                              fontWeight: 600,
                              color: "#cbd5e1",
                              fontSize: "11px",
                            }}
                          >
                            {p.moop ? `$${p.moop.toLocaleString()}` : "—"}
                          </td>
                          <td
                            style={{
                              padding: "6px 6px",
                              textAlign: "center",
                              fontSize: "10px",
                              color: p.grocery ? "#34d399" : "#5a6a80",
                              fontWeight: 600,
                            }}
                          >
                            {p.grocery || "—"}
                          </td>
                          <td
                            style={{
                              padding: "6px 6px",
                              textAlign: "center",
                              fontSize: "10px",
                              color: p.otc ? "#34d399" : "#5a6a80",
                              fontWeight: 600,
                            }}
                          >
                            {p.otc || "—"}
                          </td>
                          <td
                            style={{
                              padding: "6px 6px",
                              textAlign: "center",
                              fontSize: "10px",
                              color: p.flex ? "#34d399" : "#5a6a80",
                              fontWeight: 600,
                            }}
                          >
                            {p.flex || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {sep.matchingPlans && sep.matchingPlans.length === 0 && (
            <div
              style={{
                background: "linear-gradient(180deg, #0a0e15 0%, #090d13 100%)",
                borderRadius: "14px",
                padding: "12px 16px",
                border: "1px solid rgba(255,255,255,0.04)",
                color: "#8896ab",
                fontSize: "13px",
              }}
            >
              No matching plans found in this zip for this SEP type.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────────────────────────

export default function SEPLookupTool() {
  const [zip, setZip] = useState("");
  const [searchedZip, setSearchedZip] = useState(null);
  const [results, setResults] = useState(null);
  const [carriers, setCarriers] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterProduct, setFilterProduct] = useState("all");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  // V2: Plan state
  const [plans, setPlans] = useState(null);
  const [activeTab, setActiveTab] = useState("plans");
  const [expandedPlans, setExpandedPlans] = useState({});
  const [planFilterCarrier, setPlanFilterCarrier] = useState("all");
  const [planFilterType, setPlanFilterType] = useState("all");
  const [planFilterSnp, setPlanFilterSnp] = useState("all");
  const [planSearch, setPlanSearch] = useState("");

  // V3: Client qualification toggles
  const [clientQualifiers, setClientQualifiers] = useState({
    hasMedicaidLIS: false,
    hasChronicCondition: false,
    recentlyMoved: false,
    lostCoverage: false,
  });
  const toggleQualifier = useCallback((key) => {
    setClientQualifiers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Live FEMA data cache (persists across searches within session)
  const femaCache = useRef({ data: null, fetchedAt: 0, apiFailed: false });

  const handleSearch = useCallback(async () => {
    const cleanZip = zip.trim();
    if (!/^\d{5}$/.test(cleanZip)) return;
    setLoading(true);

    try {
      // Fetch live FEMA data (cached for 30 min within session)
      let femaData = femaCache.current.data;
      const now = Date.now();
      if (!femaData || now - femaCache.current.fetchedAt > 30 * 60 * 1000) {
        const femaResult = await fetchLiveFemaDisasters();
        femaData = femaResult.disasters;
        femaCache.current = {
          data: femaData,
          fetchedAt: now,
          apiFailed: femaResult.apiFailed,
        };
      }

      const seps = getSEPsForZip(cleanZip, femaData, clientQualifiers);
      const zipCarriers = getCarriersForZip(cleanZip);
      setResults(seps);
      setCarriers(zipCarriers);
      setPlans(getPlansForState(cleanZip));
      setSearchedZip(cleanZip);
      setExpanded({});
      setExpandedPlans({});
      setFilterCategory("all");
      setFilterProduct("all");
      setPlanFilterCarrier("all");
      setPlanFilterType("all");
      setPlanFilterSnp("all");
      setPlanSearch("");
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  }, [zip]);

  // Re-run SEP calculation when client qualifiers change (if we have a searched zip)
  useEffect(() => {
    if (!searchedZip) return;
    const femaData = femaCache.current.data || [];
    const seps = getSEPsForZip(searchedZip, femaData, clientQualifiers);
    setResults(seps);
  }, [clientQualifiers, searchedZip]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  const filtered = results?.filter((s) => {
    if (filterCategory !== "all" && s.category !== filterCategory) return false;
    if (filterProduct !== "all" && !s.eligibleProducts.includes(filterProduct))
      return false;
    return true;
  });

  const femaActive =
    filtered?.filter((s) => s.category === "FEMA Disaster") || [];
  const state = searchedZip ? getStateFromZip(searchedZip) : "";

  const allProducts = [
    ...new Set((results || []).flatMap((s) => s.eligibleProducts)),
  ].sort();
  const allCategories = [...new Set((results || []).map((s) => s.category))];

  // V2: Filtered plans
  const filteredPlans = useMemo(() => {
    if (!plans) return [];
    return plans.filter((p) => {
      if (planFilterCarrier !== "all" && p.carrier !== planFilterCarrier)
        return false;
      if (planFilterType !== "all" && p.type !== planFilterType) return false;
      if (planFilterSnp !== "all") {
        if (planFilterSnp === "5star") {
          if (!p.stars || p.stars < 5) return false;
        } else if (planFilterSnp === "none" ? p.snp : p.snp !== planFilterSnp)
          return false;
      }
      if (planSearch) {
        const q = planSearch.toLowerCase();
        if (
          !`${p.name} ${p.cid} ${p.pbp} ${p.carrier} ${p.type} ${p.snp || ""}`
            .toLowerCase()
            .includes(q)
        )
          return false;
      }
      return true;
    });
  }, [plans, planFilterCarrier, planFilterType, planFilterSnp, planSearch]);
  const planCarrierOpts = useMemo(
    () => [...new Set((plans || []).map((p) => p.carrier))].sort(),
    [plans]
  );
  const planTypeOpts = useMemo(
    () => [...new Set((plans || []).map((p) => p.type))].sort(),
    [plans]
  );
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #06090e 0%, #0c1017 50%, #06090e 100%)",
        fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <div
        style={{
          background:
            "linear-gradient(180deg, rgba(56,189,248,0.04) 0%, transparent 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          padding: "32px 24px 28px",
        }}
      >
        <div style={{ maxWidth: "960px", margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "6px",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "14px",
                background: "linear-gradient(180deg, #162035 0%, #0f1724 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconShield />
            </div>
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: "24px",
                  fontWeight: 800,
                  color: "#e8edf5",
                  letterSpacing: "-0.02em",
                }}
              >
                SEP Lookup Tool
              </h1>
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  color: "#8896ab",
                  fontWeight: 500,
                }}
              >
                Medicare Advantage Plans & Active SEPs — Live Data
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div
        style={{ maxWidth: "960px", margin: "0 auto", padding: "24px 24px 0" }}
      >
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            background: "linear-gradient(180deg, #080c12 0%, #0b0f16 100%)",
            borderRadius: "50px",
            padding: "6px",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow:
              "inset 0 2px 6px rgba(0,0,0,0.45), inset 0 1px 2px rgba(0,0,0,0.3), inset 0 -1px 0 rgba(255,255,255,0.03)",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={zip}
            onChange={(e) =>
              setZip(e.target.value.replace(/\D/g, "").slice(0, 5))
            }
            onKeyDown={handleKeyDown}
            placeholder="Enter 5-digit zip code..."
            style={{
              flex: 1,
              padding: "14px 18px",
              border: "none",
              outline: "none",
              fontSize: "17px",
              fontWeight: 600,
              color: "#e8edf5",
              background: "transparent",
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: "0.08em",
            }}
          />
          <button
            onClick={handleSearch}
            disabled={!/^\d{5}$/.test(zip.trim()) || loading}
            style={{
              padding: "12px 28px",
              borderRadius: "50px",
              border: "1px solid rgba(56,189,248,0.12)",
              background: /^\d{5}$/.test(zip.trim())
                ? "linear-gradient(180deg, #162035 0%, #0f1724 100%)"
                : "linear-gradient(180deg, #111620 0%, #0d1119 100%)",
              color: "#fff",
              fontSize: "15px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              opacity: /^\d{5}$/.test(zip.trim()) ? 1 : 0.5,
              transition: "all 0.2s ease",
            }}
          >
            {loading ? (
              <span
                style={{
                  display: "inline-block",
                  width: "18px",
                  height: "18px",
                  border: "2.5px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                }}
              />
            ) : (
              <IconSearch />
            )}
            Search
          </button>
        </div>

        {/* Quick Examples */}
        {!results && !loading && (
          <div
            style={{
              marginTop: "16px",
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{ fontSize: "12px", color: "#5a6a80", padding: "6px 0" }}
            >
              Try:
            </span>
            {["33601", "77002", "28801", "40502", "90001"].map((z) => (
              <button
                key={z}
                onClick={() => {
                  setZip(z);
                }}
                style={{
                  padding: "6px 14px",
                  borderRadius: "14px",
                  border: "1px solid rgba(255,255,255,0.07)",
                  background:
                    "linear-gradient(180deg, rgba(18,24,35,0.3) 0%, #0f141c 100%)",
                  color: "#8896ab",
                  fontSize: "13px",
                  fontFamily: "'IBM Plex Mono', monospace",
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "all 0.15s ease",
                }}
              >
                {z}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {results && !loading && (
        <div style={{ maxWidth: "960px", margin: "0 auto", padding: "24px" }}>
          {/* Summary Bar */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginBottom: "20px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div
              style={{
                background:
                  "linear-gradient(180deg, rgba(18,24,35,0.5) 0%, #0f141c 100%)",
                border: "1px solid rgba(255,255,255,0.04)",
                borderRadius: "14px",
                padding: "12px 18px",
                flex: "1 1 auto",
                minWidth: "200px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#38bdf8",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Zip Code
              </div>
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: 800,
                  color: "#e8edf5",
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                {searchedZip}{" "}
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#8896ab",
                  }}
                >
                  ({state})
                </span>
              </div>
            </div>
            <div
              style={{
                background:
                  "linear-gradient(180deg, rgba(18,24,35,0.5) 0%, #0f141c 100%)",
                border: "1px solid rgba(255,255,255,0.04)",
                borderRadius: "14px",
                padding: "12px 18px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#34d399",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                SEPs
              </div>
              <div
                style={{ fontSize: "22px", fontWeight: 800, color: "#e8edf5" }}
              >
                {filtered?.length || 0}
              </div>
            </div>
            <div
              style={{
                background:
                  "linear-gradient(180deg, rgba(18,24,35,0.5) 0%, #0f141c 100%)",
                border: "1px solid rgba(255,255,255,0.04)",
                borderRadius: "14px",
                padding: "12px 18px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#2dd4bf",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Plans
              </div>
              <div
                style={{ fontSize: "22px", fontWeight: 800, color: "#e8edf5" }}
              >
                {plans?.length || 0}
              </div>
            </div>
            <div
              style={{
                background:
                  femaActive.length > 0
                    ? "rgba(239,68,68,0.12)"
                    : "rgba(100,116,139,0.1)",
                border: `1px solid ${
                  femaActive.length > 0
                    ? "rgba(239,68,68,0.3)"
                    : "rgba(100,116,139,0.2)"
                }`,
                borderRadius: "14px",
                padding: "12px 18px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: femaActive.length > 0 ? "#f87171" : "#8896ab",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  {femaActive.length > 0 && <IconAlert />} FEMA
                </span>
              </div>
              <div
                style={{ fontSize: "22px", fontWeight: 800, color: "#e8edf5" }}
              >
                {femaActive.length > 0 ? femaActive.length : "—"}
              </div>
            </div>
            <div
              style={{
                background:
                  "linear-gradient(180deg, rgba(18,24,35,0.5) 0%, #0f141c 100%)",
                border: "1px solid rgba(255,255,255,0.04)",
                borderRadius: "14px",
                padding: "12px 18px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#38bdf8",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Carriers
              </div>
              <div
                style={{ fontSize: "22px", fontWeight: 800, color: "#e8edf5" }}
              >
                {carriers.length}
              </div>
            </div>
          </div>

          {/* ═══ CLIENT QUALIFICATION TOGGLES ═══ */}
          <div
            style={{
              background: "rgba(30,41,59,0.6)",
              borderRadius: "12px",
              padding: "16px 20px",
              marginBottom: "20px",
              border: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#8896ab",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "12px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
              Client Qualifiers — Toggle to highlight applicable SEPs
            </div>
            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              {[
                {
                  key: "hasMedicaidLIS",
                  label: "Medicaid / LIS (Extra Help)",
                  icon: "💊",
                  desc: "Dual-eligible quarterly SEP",
                },
                {
                  key: "hasChronicCondition",
                  label: "Chronic Condition",
                  icon: "🏥",
                  desc: "C-SNP year-round enrollment",
                },
                {
                  key: "recentlyMoved",
                  label: "Recently Moved",
                  icon: "🏠",
                  desc: "63-day move SEP",
                },
                {
                  key: "lostCoverage",
                  label: "Lost Coverage",
                  icon: "📋",
                  desc: "63-day loss of coverage SEP",
                },
              ].map((q) => {
                const isActive = clientQualifiers[q.key];
                return (
                  <button
                    key={q.key}
                    onClick={() => toggleQualifier(q.key)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px 16px",
                      borderRadius: "14px",
                      border: isActive
                        ? "1px solid rgba(52,211,153,0.25)"
                        : "1px solid rgba(255,255,255,0.07)",
                      background: isActive
                        ? "rgba(52,211,153,0.08)"
                        : "linear-gradient(180deg, #0a0e15 0%, #090d13 100%)",
                      color: isActive ? "#34d399" : "#8896ab",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      flex: "1 1 auto",
                      minWidth: "180px",
                    }}
                  >
                    <span
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "5px",
                        border: isActive
                          ? "2px solid #4ade80"
                          : "2px solid #475569",
                        background: isActive ? "#34d399" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        transition: "all 0.2s ease",
                      }}
                    >
                      {isActive && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#0f172a"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <div style={{ textAlign: "left" }}>
                      <div>
                        {q.icon} {q.label}
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: isActive ? "#34d399" : "#5a6a80",
                          fontWeight: 500,
                          marginTop: "1px",
                        }}
                      >
                        {q.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {Object.values(clientQualifiers).some(Boolean) && (
              <div
                style={{
                  marginTop: "10px",
                  padding: "8px 12px",
                  borderRadius: "14px",
                  background: "rgba(34,197,94,0.08)",
                  border: "1px solid rgba(34,197,94,0.2)",
                  fontSize: "12px",
                  color: "#34d399",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Matching SEPs are highlighted with{" "}
                <strong style={{ color: "#34d399", margin: "0 3px" }}>
                  URGENT
                </strong>{" "}
                priority. Switch to the SEPs tab to see results.
              </div>
            )}
          </div>

          {/* ═══ TABS ═══ */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              marginBottom: "20px",
            }}
          >
            {[
              ["plans", `📋 Plans & Codes (${filteredPlans.length})`],
              ["seps", `🔁 SEPs (${filtered?.length || 0})`],
              ["fema", `🌪️ FEMA Disasters`],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px 8px 0 0",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  background:
                    activeTab === key
                      ? "linear-gradient(180deg, #1a2233 0%, #151c28 100%)"
                      : "transparent",
                  color: activeTab === key ? "#38bdf8" : "#8896ab",
                  borderBottom:
                    activeTab === key
                      ? "2px solid #3b82f6"
                      : "2px solid transparent",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ════════ PLANS TAB ════════ */}
          {activeTab === "plans" && (
            <>
              {/* Plan Filters */}
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginBottom: "16px",
                  flexWrap: "wrap",
                  alignItems: "center",
                  background:
                    "linear-gradient(180deg, rgba(18,24,35,0.3) 0%, #0f141c 100%)",
                  borderRadius: "14px",
                  padding: "10px 16px",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#8896ab",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  <IconFilter /> Filter
                </span>
                <select
                  value={planFilterCarrier}
                  onChange={(e) => setPlanFilterCarrier(e.target.value)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.07)",
                    background:
                      "linear-gradient(180deg, #080c12 0%, #0b0f16 100%)",
                    color: "#e8edf5",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <option value="all">All Carriers</option>
                  {planCarrierOpts.map((c) => (
                    <option key={c} value={c}>
                      {CARRIERS[c]?.abbr || c}
                    </option>
                  ))}
                </select>
                <select
                  value={planFilterType}
                  onChange={(e) => setPlanFilterType(e.target.value)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.07)",
                    background:
                      "linear-gradient(180deg, #080c12 0%, #0b0f16 100%)",
                    color: "#e8edf5",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <option value="all">All Types</option>
                  {planTypeOpts.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select
                  value={planFilterSnp}
                  onChange={(e) => setPlanFilterSnp(e.target.value)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.07)",
                    background:
                      "linear-gradient(180deg, #080c12 0%, #0b0f16 100%)",
                    color: "#e8edf5",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <option value="all">All Plans</option>
                  <option value="D-SNP">D-SNP Only</option>
                  <option value="C-SNP">C-SNP Only</option>
                  <option value="none">Non-SNP Only</option>
                  <option value="5star">⭐ 5-Star Only</option>
                </select>
                <input
                  type="text"
                  value={planSearch}
                  onChange={(e) => setPlanSearch(e.target.value)}
                  placeholder="Search plans or contract ID..."
                  style={{
                    flex: "1 1 160px",
                    padding: "6px 10px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.07)",
                    background:
                      "linear-gradient(180deg, #080c12 0%, #0b0f16 100%)",
                    color: "#e8edf5",
                    fontSize: "13px",
                    fontWeight: 600,
                    outline: "none",
                    minWidth: "120px",
                  }}
                />
                {(planFilterCarrier !== "all" ||
                  planFilterType !== "all" ||
                  planFilterSnp !== "all" ||
                  planSearch) && (
                  <button
                    onClick={() => {
                      setPlanFilterCarrier("all");
                      setPlanFilterType("all");
                      setPlanFilterSnp("all");
                      setPlanSearch("");
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "5px 10px",
                      borderRadius: "10px",
                      border: "1px solid rgba(239,68,68,0.3)",
                      background: "rgba(239,68,68,0.1)",
                      color: "#f87171",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <IconX /> Clear
                  </button>
                )}
              </div>

              {/* Plan Table */}
              <div
                style={{
                  overflowX: "auto",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "12px",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background:
                          "linear-gradient(180deg, #0a0e15 0%, #090d13 100%)",
                        borderBottom: "2px solid rgba(148,163,184,0.15)",
                      }}
                    >
                      {[
                        "Carrier",
                        "Plan Name / ID",
                        "Type",
                        "Stars",
                        "Premium",
                        "MOOP",
                        "Grocery",
                        "OTC",
                        "Flex Card",
                        "",
                      ].map((h, i) => (
                        <th
                          key={h + i}
                          style={{
                            padding: "10px 8px",
                            textAlign: ["Premium", "MOOP"].includes(h)
                              ? "right"
                              : [
                                  "Stars",
                                  "Grocery",
                                  "OTC",
                                  "Flex Card",
                                  "",
                                ].includes(h)
                              ? "center"
                              : "left",
                            fontSize: "10px",
                            fontWeight: 700,
                            color: "#5a6a80",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlans.length > 0 ? (
                      filteredPlans.map((p, idx) => {
                        const c = CARRIERS[p.carrier] || {};
                        const pKey = `${p.cid}-${p.pbp}-${p.carrier}`;
                        const isOpen = !!expandedPlans[pKey];
                        const typeColors = {
                          HMO: "#2563eb",
                          "HMO-POS": "#38bdf8",
                          PPO: "#7c3aed",
                          PDP: "#0891b2",
                          Medigap: "#0d9488",
                        };
                        const snpColors = {
                          "D-SNP": "#be185d",
                          "C-SNP": "#c2410c",
                          "I-SNP": "#9333ea",
                        };
                        return (
                          <React.Fragment key={pKey + idx}>
                            <tr
                              onClick={() =>
                                setExpandedPlans((prev) => ({
                                  ...prev,
                                  [pKey]: !prev[pKey],
                                }))
                              }
                              style={{
                                cursor: "pointer",
                                borderBottom:
                                  "1px solid rgba(255,255,255,0.04)",
                                background: isOpen
                                  ? "rgba(37,99,235,0.04)"
                                  : "transparent",
                              }}
                            >
                              <td
                                style={{
                                  padding: "10px 8px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  <span
                                    style={{
                                      width: "8px",
                                      height: "8px",
                                      borderRadius: "50%",
                                      backgroundColor: c.color || "#666",
                                      flexShrink: 0,
                                    }}
                                  />
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: 700,
                                      color: "#e8edf5",
                                    }}
                                  >
                                    {c.abbr || p.carrier}
                                  </span>
                                </span>
                              </td>
                              <td style={{ padding: "10px 8px" }}>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    color: "#e8edf5",
                                    lineHeight: 1.3,
                                  }}
                                >
                                  {p.name}
                                </div>
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: "#5a6a80",
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    marginTop: "2px",
                                  }}
                                >
                                  {p.cid}-{p.pbp}
                                </div>
                              </td>
                              <td style={{ padding: "10px 8px" }}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "2px 7px",
                                    borderRadius: "6px",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    color: "#fff",
                                    backgroundColor:
                                      typeColors[p.type] || "#5a6a80",
                                    marginRight: 3,
                                  }}
                                >
                                  {p.type}
                                </span>
                                {p.snp && (
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "2px 7px",
                                      borderRadius: "6px",
                                      fontSize: "10px",
                                      fontWeight: 700,
                                      color: "#fff",
                                      backgroundColor:
                                        snpColors[p.snp] || "#5a6a80",
                                    }}
                                  >
                                    {p.snp}
                                  </span>
                                )}
                              </td>
                              <td
                                style={{
                                  padding: "10px 8px",
                                  textAlign: "center",
                                }}
                              >
                                {p.stars != null ? (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "1px",
                                    }}
                                  >
                                    {[1, 2, 3, 4, 5].map((i) => (
                                      <svg
                                        key={i}
                                        width={11}
                                        height={11}
                                        viewBox="0 0 24 24"
                                        fill={
                                          i <= Math.floor(p.stars)
                                            ? "#f59e0b"
                                            : "none"
                                        }
                                        stroke="#f59e0b"
                                        strokeWidth={1.5}
                                      >
                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                      </svg>
                                    ))}
                                    {p.stars % 1 !== 0 && (
                                      <span
                                        style={{
                                          fontSize: "10px",
                                          color: "#f59e0b",
                                        }}
                                      >
                                        .5
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      color: "#5a6a80",
                                      fontSize: "11px",
                                    }}
                                  >
                                    —
                                  </span>
                                )}
                              </td>
                              <td
                                style={{
                                  padding: "10px 8px",
                                  textAlign: "right",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: 700,
                                    color: p.prem === 0 ? "#34d399" : "#e8edf5",
                                  }}
                                >
                                  {p.prem === 0
                                    ? "$0"
                                    : `$${p.prem.toFixed(2)}`}
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: "10px 8px",
                                  textAlign: "right",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: 600,
                                    color: "#e8edf5",
                                  }}
                                >
                                  {p.moop ? `$${p.moop.toLocaleString()}` : "—"}
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: "10px 8px",
                                  textAlign: "center",
                                }}
                              >
                                <span
                                  style={{
                                    color: p.grocery ? "#34d399" : "#5a6a80",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                  }}
                                >
                                  {p.grocery || "—"}
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: "10px 8px",
                                  textAlign: "center",
                                }}
                              >
                                <span
                                  style={{
                                    color: p.otc ? "#34d399" : "#5a6a80",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                  }}
                                >
                                  {p.otc || "—"}
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: "10px 8px",
                                  textAlign: "center",
                                }}
                              >
                                <span
                                  style={{
                                    color: p.flex ? "#34d399" : "#5a6a80",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                  }}
                                >
                                  {p.flex || "—"}
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: "10px 8px",
                                  textAlign: "center",
                                }}
                              >
                                <IconChevron open={isOpen} />
                              </td>
                            </tr>
                            {isOpen && (
                              <tr>
                                <td
                                  colSpan={10}
                                  style={{
                                    padding: "0 12px 14px",
                                    background:
                                      "linear-gradient(180deg, rgba(18,24,35,0.3) 0%, #0f141c 100%)",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      flexWrap: "wrap",
                                      gap: "6px",
                                      padding: "12px 0 8px",
                                    }}
                                  >
                                    {[
                                      ["Part D", p.partD],
                                      ["Dental", p.dental],
                                      ["Vision", p.vision],
                                      ["Hearing", p.hearing],
                                      ["OTC", p.otc],
                                      ["Grocery", p.grocery],
                                      ["Flex Card", p.flex],
                                      ["Transport", p.transport],
                                    ].map(([lbl, val]) =>
                                      val ? (
                                        <span
                                          key={lbl}
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "4px",
                                            padding: "3px 8px",
                                            borderRadius: "10px",
                                            fontSize: "11px",
                                            fontWeight: 600,
                                            background:
                                              "linear-gradient(180deg, rgba(18,24,35,0.5) 0%, #0f141c 100%)",
                                            border:
                                              "1px solid rgba(34,197,94,0.2)",
                                            color: "#34d399",
                                          }}
                                        >
                                          {lbl}:{" "}
                                          <span style={{ color: "#e8edf5" }}>
                                            {typeof val === "boolean"
                                              ? "✓"
                                              : val}
                                          </span>
                                        </span>
                                      ) : null
                                    )}
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "10px",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    {[
                                      ["Contract ID", p.cid],
                                      ["PBP", p.pbp],
                                      ["Category", p.cat],
                                      ...(p.snp ? [["SNP Type", p.snp]] : []),
                                    ].map(([lbl, val]) => (
                                      <div
                                        key={lbl}
                                        style={{
                                          background:
                                            "linear-gradient(180deg, #0a0e15 0%, #090d13 100%)",
                                          borderRadius: "10px",
                                          padding: "8px 12px",
                                          border:
                                            "1px solid rgba(255,255,255,0.04)",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize: "10px",
                                            fontWeight: 700,
                                            color: "#5a6a80",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.05em",
                                            marginBottom: "2px",
                                          }}
                                        >
                                          {lbl}
                                        </div>
                                        <div
                                          style={{
                                            fontSize: "13px",
                                            fontWeight: 600,
                                            color: "#e8edf5",
                                            fontFamily:
                                              lbl === "Contract ID" ||
                                              lbl === "PBP"
                                                ? "'IBM Plex Mono', monospace"
                                                : "inherit",
                                          }}
                                        >
                                          {val}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={10}
                          style={{
                            padding: "40px",
                            textAlign: "center",
                            color: "#8896ab",
                            fontSize: "14px",
                          }}
                        >
                          No plans match filters
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ════════ SEPS TAB ════════ */}
          {activeTab === "seps" && (
            <>
              {/* Filters */}
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  marginBottom: "20px",
                  flexWrap: "wrap",
                  alignItems: "center",
                  background:
                    "linear-gradient(180deg, rgba(18,24,35,0.3) 0%, #0f141c 100%)",
                  borderRadius: "14px",
                  padding: "10px 16px",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#8896ab",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  <IconFilter /> Filter
                </span>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.07)",
                    background:
                      "linear-gradient(180deg, #080c12 0%, #0b0f16 100%)",
                    color: "#e8edf5",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  <option value="all">All Categories</option>
                  {allCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  value={filterProduct}
                  onChange={(e) => setFilterProduct(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.07)",
                    background:
                      "linear-gradient(180deg, #080c12 0%, #0b0f16 100%)",
                    color: "#e8edf5",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  <option value="all">All Products</option>
                  {allProducts.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                {(filterCategory !== "all" || filterProduct !== "all") && (
                  <button
                    onClick={() => {
                      setFilterCategory("all");
                      setFilterProduct("all");
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "5px 10px",
                      borderRadius: "10px",
                      border: "1px solid rgba(239,68,68,0.3)",
                      background: "rgba(239,68,68,0.1)",
                      color: "#f87171",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <IconX /> Clear
                  </button>
                )}
              </div>

              {/* FEMA Alert Banner */}
              {femaActive.length > 0 && (
                <div
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(248,113,113,0.06), rgba(248,113,113,0.02))",
                    border: "1px solid rgba(248,113,113,0.15)",
                    borderRadius: "12px",
                    padding: "16px 20px",
                    marginBottom: "20px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      color: "#f87171",
                      flexShrink: 0,
                      marginTop: "2px",
                    }}
                  >
                    <IconAlert />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "#f87171",
                        marginBottom: "4px",
                      }}
                    >
                      Active FEMA Disaster Declaration
                      {femaActive.length > 1 ? "s" : ""} in This Area
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#f87171",
                        lineHeight: 1.5,
                      }}
                    >
                      {femaActive.map((f) => f.event).join("; ")} — FEMA
                      disaster SEP active for affected beneficiaries (2 calendar
                      months after incident end). Verify client address against
                      affected counties.
                    </div>
                  </div>
                </div>
              )}

              {/* FEMA API Status Warning */}
              {searchedZip && femaCache.current.apiFailed && (
                <div
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(251,191,36,0.08), rgba(251,191,36,0.02))",
                    border: "1px solid rgba(251,191,36,0.2)",
                    borderRadius: "12px",
                    padding: "14px 18px",
                    marginBottom: "20px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    fontSize: "13px",
                    color: "#fbbf24",
                  }}
                >
                  <span style={{ flexShrink: 0, fontSize: "16px" }}>⚠️</span>
                  <div>
                    <strong>FEMA API Unavailable</strong>
                    <span style={{ color: "#8896ab" }}>
                      {" "}
                      — Using hardcoded disaster data (may be incomplete). The
                      OpenFEMA API may be down due to a federal funding lapse.
                      Verify current disasters at{" "}
                      <a
                        href="https://www.fema.gov/disaster/declarations"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "#38bdf8",
                          textDecoration: "underline",
                        }}
                      >
                        fema.gov/disaster/declarations
                      </a>
                    </span>
                  </div>
                </div>
              )}

              {/* SEP Cards */}
              <div>
                {filtered && filtered.length > 0 ? (
                  filtered.map((sep) => (
                    <SEPCard
                      key={sep.id}
                      sep={sep}
                      carriers={carriers}
                      isExpanded={!!expanded[sep.id]}
                      onToggle={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [sep.id]: !prev[sep.id],
                        }))
                      }
                    />
                  ))
                ) : (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "48px 24px",
                      color: "#8896ab",
                    }}
                  >
                    <div style={{ fontSize: "16px", fontWeight: 600 }}>
                      No SEPs match current filters
                    </div>
                    <div style={{ fontSize: "13px", marginTop: "8px" }}>
                      Try adjusting category or product filters above.
                    </div>
                  </div>
                )}
              </div>

              {/* Carrier Grid */}
              <div
                style={{
                  marginTop: "28px",
                  background:
                    "linear-gradient(180deg, rgba(18,24,35,0.3) 0%, #0f141c 100%)",
                  borderRadius: "20px",
                  padding: "20px",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 14px 0",
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "#e8edf5",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Carriers in {searchedZip} ({state})
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(170px, 1fr))",
                    gap: "10px",
                  }}
                >
                  {carriers.map((c) => (
                    <div
                      key={c.key}
                      style={{
                        background:
                          "linear-gradient(180deg, #0a0e15 0%, #090d13 100%)",
                        borderRadius: "14px",
                        padding: "14px",
                        border: `1px solid ${c.color}30`,
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          height: "3px",
                          background: c.color,
                        }}
                      />
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 700,
                          color: "#e8edf5",
                          marginBottom: "6px",
                        }}
                      >
                        {c.abbr}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#8896ab",
                          marginBottom: "8px",
                        }}
                      >
                        {c.name}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "2px",
                        }}
                      >
                        {c.products.map((p) => (
                          <ProductBadge key={p} product={p} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {/* end tabs */}

          {/* ── FEMA DISASTERS TAB ── */}
          {activeTab === "fema" && (
            <>
              {/* FEMA API Status Banner */}
              {femaCache.current.apiFailed && (
                <div
                  style={{
                    padding: "14px 20px",
                    borderRadius: "14px",
                    marginBottom: "16px",
                    background:
                      "linear-gradient(180deg, rgba(248,113,113,0.08) 0%, rgba(248,113,113,0.03) 100%)",
                    border: "1px solid rgba(248,113,113,0.25)",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <span style={{ fontSize: "18px" }}>⚠️</span>
                  <div>
                    <div
                      style={{
                        color: "#f87171",
                        fontWeight: 600,
                        fontSize: "13px",
                      }}
                    >
                      FEMA API Unavailable — Using Verified Local Data
                    </div>
                    <div
                      style={{
                        color: "#8896ab",
                        fontSize: "12px",
                        marginTop: "2px",
                      }}
                    >
                      Due to the federal funding lapse, the OpenFEMA API may be
                      down. Showing disasters verified from fema.gov as of Feb
                      19, 2026. Always cross-check at{" "}
                      <a
                        href="https://www.fema.gov/disaster/declarations"
                        target="_blank"
                        rel="noopener"
                        style={{ color: "#38bdf8" }}
                      >
                        fema.gov/disaster/declarations
                      </a>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: "16px" }}>
                <h3
                  style={{
                    color: "#e8edf5",
                    fontSize: "16px",
                    fontWeight: 700,
                    margin: "0 0 6px 0",
                  }}
                >
                  🌪️ FEMA Disaster Declarations — Lookup by ZIP
                </h3>
                <p style={{ color: "#8896ab", fontSize: "13px", margin: 0 }}>
                  {searchedZip
                    ? `Showing disasters affecting ZIP ${searchedZip} (${getStateFromZip(
                        searchedZip
                      )}). Medicare SEP is triggered only for IA-declared disasters.`
                    : "Enter a ZIP code above and search to see FEMA disasters for that area."}
                </p>
              </div>

              {/* Disaster Cards */}
              {(() => {
                const allDisasters =
                  femaCache.current.data && femaCache.current.data.length > 0
                    ? femaCache.current.data
                    : FEMA_DISASTER_DB;
                const st = searchedZip ? getStateFromZip(searchedZip) : null;
                const stateDisasters = st
                  ? allDisasters.filter(
                      (d) =>
                        d.state === st ||
                        (d.counties && d.counties.includes("Statewide"))
                    )
                  : allDisasters;
                const now = new Date();

                return stateDisasters.length === 0 ? (
                  <div
                    style={{
                      padding: "40px 20px",
                      textAlign: "center",
                      background:
                        "linear-gradient(180deg, rgba(18,24,35,0.3) 0%, #0f141c 100%)",
                      borderRadius: "20px",
                      border: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <div style={{ fontSize: "36px", marginBottom: "12px" }}>
                      ✅
                    </div>
                    <div
                      style={{
                        color: "#e8edf5",
                        fontSize: "15px",
                        fontWeight: 600,
                      }}
                    >
                      No Active FEMA Disasters
                    </div>
                    <div
                      style={{
                        color: "#8896ab",
                        fontSize: "13px",
                        marginTop: "6px",
                      }}
                    >
                      {st
                        ? `No declared disasters found for ${st}.`
                        : "Search a ZIP code to check for disasters in that area."}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    {/* Summary Stats */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "10px",
                        marginBottom: "4px",
                      }}
                    >
                      {[
                        [
                          "Total Declarations",
                          stateDisasters.length,
                          "#38bdf8",
                        ],
                        [
                          "IA Declared (SEP)",
                          stateDisasters.filter(
                            (d) => d.iaProgram || d.ihProgram
                          ).length,
                          "#34d399",
                        ],
                        [
                          "PA Only (No SEP)",
                          stateDisasters.filter((d) => d.paOnly).length,
                          "#fbbf24",
                        ],
                      ].map(([label, count, color]) => (
                        <div
                          key={label}
                          style={{
                            padding: "14px",
                            borderRadius: "14px",
                            textAlign: "center",
                            background:
                              "linear-gradient(180deg, rgba(18,24,35,0.3) 0%, #0f141c 100%)",
                            border: "1px solid rgba(255,255,255,0.04)",
                            boxShadow:
                              "0 2px 8px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.2)",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "24px",
                              fontWeight: 800,
                              color,
                              fontFamily: "'IBM Plex Mono', monospace",
                            }}
                          >
                            {count}
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#8896ab",
                              marginTop: "4px",
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                            }}
                          >
                            {label}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Individual Disaster Cards */}
                    {stateDisasters.map((d) => {
                      const hasIA = d.iaProgram || d.ihProgram;
                      const isOngoing =
                        !d.incidentEnd || new Date(d.incidentEnd) > now;
                      const incEnd = d.incidentEnd
                        ? new Date(d.incidentEnd)
                        : null;
                      let sepEndDate = null;
                      if (hasIA && incEnd) {
                        const se = new Date(incEnd);
                        se.setMonth(se.getMonth() + 2);
                        sepEndDate = new Date(
                          se.getFullYear(),
                          se.getMonth() + 1,
                          0
                        );
                      }
                      const sepActive =
                        hasIA &&
                        (isOngoing || (sepEndDate && sepEndDate > now));
                      const borderColor = hasIA
                        ? "rgba(52,211,153,0.35)"
                        : d.paOnly
                        ? "rgba(251,191,36,0.2)"
                        : "rgba(255,255,255,0.07)";
                      const tagBg = hasIA
                        ? "rgba(52,211,153,0.12)"
                        : "rgba(251,191,36,0.12)";
                      const tagColor = hasIA ? "#34d399" : "#fbbf24";
                      const tagText = hasIA
                        ? "IA DECLARED — SEP ELIGIBLE"
                        : "PA ONLY — NO SEP";

                      return (
                        <div
                          key={d.id}
                          style={{
                            padding: "18px 20px",
                            borderRadius: "20px",
                            background:
                              "linear-gradient(180deg, rgba(18,24,35,0.3) 0%, #0f141c 40%, #0d1119 100%)",
                            border: `1px solid ${borderColor}`,
                            boxShadow:
                              "0 1px 3px rgba(0,0,0,0.5), 0 6px 20px rgba(0,0,0,0.35), 0 12px 40px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -1px 0 rgba(0,0,0,0.2)",
                          }}
                        >
                          {/* Header */}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              marginBottom: "10px",
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    color: "#38bdf8",
                                    background: "rgba(56,189,248,0.1)",
                                    padding: "3px 8px",
                                    borderRadius: "6px",
                                    border: "1px solid rgba(56,189,248,0.2)",
                                  }}
                                >
                                  {d.id}
                                </span>
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    color: tagColor,
                                    background: tagBg,
                                    padding: "3px 8px",
                                    borderRadius: "6px",
                                    border: `1px solid ${tagColor}33`,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                  }}
                                >
                                  {tagText}
                                </span>
                                {isOngoing && (
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 700,
                                      color: "#f87171",
                                      background: "rgba(248,113,113,0.1)",
                                      padding: "3px 8px",
                                      borderRadius: "6px",
                                      border: "1px solid rgba(248,113,113,0.2)",
                                      animation: "pulse 2s infinite",
                                    }}
                                  >
                                    🔴 ONGOING
                                  </span>
                                )}
                              </div>
                              <div
                                style={{
                                  color: "#e8edf5",
                                  fontSize: "15px",
                                  fontWeight: 700,
                                  marginTop: "8px",
                                }}
                              >
                                {d.title}
                              </div>
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                fontWeight: 700,
                                color: "#8896ab",
                                background: "rgba(255,255,255,0.04)",
                                padding: "4px 10px",
                                borderRadius: "8px",
                                fontFamily: "'IBM Plex Mono', monospace",
                                whiteSpace: "nowrap",
                                marginLeft: "12px",
                              }}
                            >
                              {d.state}
                            </div>
                          </div>

                          {/* Details Grid */}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fill, minmax(200px, 1fr))",
                              gap: "8px",
                              marginBottom: "12px",
                            }}
                          >
                            {[
                              ["Declared", d.declaredDate],
                              [
                                "Incident Period",
                                `${d.incidentBegin}${
                                  d.incidentEnd
                                    ? " → " + d.incidentEnd
                                    : " → ongoing"
                                }`,
                              ],
                              ["Type", d.type],
                              hasIA && sepActive && sepEndDate
                                ? [
                                    "SEP Window Ends",
                                    sepEndDate.toISOString().split("T")[0],
                                  ]
                                : null,
                              hasIA && d.iaDeadline
                                ? ["IA Application Deadline", d.iaDeadline]
                                : null,
                            ]
                              .filter(Boolean)
                              .map(([label, value]) => (
                                <div
                                  key={label}
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: "10px",
                                    background:
                                      "linear-gradient(180deg, #0a0e15 0%, #090d13 100%)",
                                    boxShadow:
                                      "inset 0 2px 6px rgba(0,0,0,0.45), inset 0 1px 2px rgba(0,0,0,0.3)",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "10px",
                                      color: "#5a6a80",
                                      fontWeight: 600,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.5px",
                                    }}
                                  >
                                    {label}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "13px",
                                      color: "#e8edf5",
                                      fontWeight: 600,
                                      marginTop: "2px",
                                      fontFamily: "'IBM Plex Mono', monospace",
                                    }}
                                  >
                                    {value}
                                  </div>
                                </div>
                              ))}
                          </div>

                          {/* Counties */}
                          <div style={{ marginBottom: d.notes ? "10px" : "0" }}>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "#5a6a80",
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                marginBottom: "6px",
                              }}
                            >
                              Designated Areas ({d.counties?.length || 0})
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "4px",
                              }}
                            >
                              {(d.counties || []).map((c) => (
                                <span
                                  key={c}
                                  style={{
                                    fontSize: "11px",
                                    padding: "2px 8px",
                                    borderRadius: "6px",
                                    background: "rgba(56,189,248,0.06)",
                                    border: "1px solid rgba(56,189,248,0.12)",
                                    color: "#8896ab",
                                    fontFamily: "'IBM Plex Mono', monospace",
                                  }}
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Notes */}
                          {d.notes && (
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#8896ab",
                                marginTop: "8px",
                                padding: "8px 12px",
                                borderRadius: "8px",
                                background: "rgba(251,191,36,0.04)",
                                borderLeft: "3px solid rgba(251,191,36,0.3)",
                                fontStyle: "italic",
                              }}
                            >
                              💡 {d.notes}
                            </div>
                          )}

                          {/* Link */}
                          {d.femaUrl && (
                            <div style={{ marginTop: "10px" }}>
                              <a
                                href={d.femaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: "12px",
                                  color: "#38bdf8",
                                  textDecoration: "none",
                                  fontWeight: 600,
                                }}
                              >
                                View on FEMA.gov →
                              </a>
                            </div>
                          )}

                          {/* SEP Eligibility Box for IA disasters */}
                          {hasIA && sepActive && (
                            <div
                              style={{
                                marginTop: "12px",
                                padding: "12px 16px",
                                borderRadius: "12px",
                                background:
                                  "linear-gradient(180deg, rgba(52,211,153,0.06) 0%, rgba(52,211,153,0.02) 100%)",
                                border: "1px solid rgba(52,211,153,0.2)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                }}
                              >
                                <span style={{ fontSize: "16px" }}>✅</span>
                                <div>
                                  <div
                                    style={{
                                      color: "#34d399",
                                      fontSize: "13px",
                                      fontWeight: 700,
                                    }}
                                  >
                                    Medicare SEP Active
                                  </div>
                                  <div
                                    style={{
                                      color: "#8896ab",
                                      fontSize: "12px",
                                      marginTop: "2px",
                                    }}
                                  >
                                    {isOngoing
                                      ? "Open-ended — SEP continues until incident closes + 2 full calendar months"
                                      : sepEndDate
                                      ? `SEP window through ${sepEndDate.toLocaleDateString(
                                          "en-US",
                                          {
                                            month: "long",
                                            day: "numeric",
                                            year: "numeric",
                                          }
                                        )}`
                                      : "SEP window active"}{" "}
                                    • Client can enroll in MA/PDP during this
                                    window
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* All Disasters (not just state-filtered) */}
                    {searchedZip &&
                      (() => {
                        const otherDisasters = (
                          femaCache.current.data &&
                          femaCache.current.data.length > 0
                            ? femaCache.current.data
                            : FEMA_DISASTER_DB
                        ).filter((d) => d.state !== st);
                        if (otherDisasters.length === 0) return null;
                        return (
                          <div style={{ marginTop: "12px" }}>
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#5a6a80",
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                marginBottom: "8px",
                                paddingLeft: "4px",
                              }}
                            >
                              Other Active Declarations ({otherDisasters.length}
                              )
                            </div>
                            <div
                              style={{
                                padding: "12px 16px",
                                borderRadius: "14px",
                                background:
                                  "linear-gradient(180deg, #0a0e15 0%, #090d13 100%)",
                                boxShadow: "inset 0 2px 6px rgba(0,0,0,0.45)",
                              }}
                            >
                              {otherDisasters.map((d) => (
                                <div
                                  key={d.id}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "8px 0",
                                    borderBottom:
                                      "1px solid rgba(255,255,255,0.04)",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "11px",
                                        fontWeight: 700,
                                        fontFamily:
                                          "'IBM Plex Mono', monospace",
                                        color: "#38bdf8",
                                        minWidth: "65px",
                                      }}
                                    >
                                      {d.id}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: "12px",
                                        color: "#8896ab",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {d.state}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: "12px",
                                        color: "#e8edf5",
                                      }}
                                    >
                                      {d.title}
                                    </span>
                                  </div>
                                  <span
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 700,
                                      color:
                                        d.iaProgram || d.ihProgram
                                          ? "#34d399"
                                          : "#fbbf24",
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    {d.iaProgram || d.ihProgram ? "IA" : "PA"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                  </div>
                );
              })()}
            </>
          )}

          {/* end all tabs */}

          {/* Disclaimer */}
          <div
            style={{
              marginTop: "24px",
              padding: "16px 20px",
              borderRadius: "14px",
              background:
                "linear-gradient(180deg, rgba(18,24,35,0.3) 0%, #0f141c 100%)",
              border: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "11px",
                color: "#5a6a80",
                lineHeight: 1.6,
              }}
            >
              <strong>Disclaimer:</strong> FEMA disaster data is fetched live
              from the OpenFEMA API (api.fema.gov) with hardcoded 2026 fallback
              data if the API is unavailable. Plan data is sourced from the CMS
              Landscape Source File CY2026 (November 2025 release). Premiums,
              benefits, and service areas may vary — always verify on
              Medicare.gov. For agent/broker use only.
            </p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div
          style={{
            maxWidth: "960px",
            margin: "0 auto",
            padding: "80px 24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "3px solid rgba(99,102,241,0.2)",
              borderTopColor: "#6366f1",
              borderRadius: "50%",
              margin: "0 auto 16px",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#8896ab" }}>
            Scanning sources for {zip}...
          </div>
          <div style={{ fontSize: "12px", color: "#5a6a80", marginTop: "4px" }}>
            FEMA • CMS • Medicare.gov • Carrier Networks
          </div>
        </div>
      )}

      {/* Empty State */}
      {!results && !loading && (
        <div
          style={{
            maxWidth: "960px",
            margin: "0 auto",
            padding: "60px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.3 }}>
            🔍
          </div>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#5a6a80",
              marginBottom: "8px",
            }}
          >
            Enter a zip code to begin
          </div>
          <div
            style={{
              fontSize: "14px",
              color: "#5a6a80",
              maxWidth: "460px",
              margin: "0 auto",
              lineHeight: 1.6,
            }}
          >
            Search any 5-digit zip code to see all active Special Enrollment
            Periods, FEMA disaster declarations, and available carriers in the
            area.
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        * { box-sizing: border-box; }
        table tbody tr:hover td { background: rgba(56,189,248,0.03) !important; }
        select:focus { border-color: rgba(56,189,248,0.3) !important; box-shadow: inset 0 2px 6px rgba(0,0,0,0.45), 0 0 0 3px rgba(56,189,248,0.06) !important; }
        button:hover { filter: brightness(1.1); }
        input::placeholder { color: #475569; }
      `}</style>
    </div>
  );
}
