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

// Fetch live FEMA disaster declarations from OpenFEMA API
async function fetchLiveFemaDisasters() {
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const dateStr = sixMonthsAgo.toISOString().split("T")[0];

  const url = `https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=declarationDate ge '${dateStr}' and declarationType eq 'DR'&$orderby=declarationDate desc&$top=1000&$select=disasterNumber,declarationDate,incidentType,declarationTitle,state,designatedArea,ihProgramDeclared,iaProgramDeclared,incidentBeginDate,incidentEndDate`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`FEMA API ${res.status}`);
    const data = await res.json();
    const records = data.DisasterDeclarationsSummaries || [];

    // Group by disaster number — aggregate counties
    const map = {};
    records.forEach((r) => {
      const key = r.disasterNumber;
      if (!map[key]) {
        map[key] = {
          id: `DR-${r.disasterNumber}`,
          title: r.declarationTitle || "Unnamed Disaster",
          type: r.incidentType || "Other",
          state: r.state,
          declaredDate: r.declarationDate?.split("T")[0],
          incidentBegin: r.incidentBeginDate?.split("T")[0],
          incidentEnd: r.incidentEndDate?.split("T")[0],
          iaProgram: r.iaProgramDeclared,
          ihProgram: r.ihProgramDeclared,
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

    // Only keep IA-declared (triggers Medicare SEP), compute 60-day window
    return Object.values(map)
      .filter((d) => d.iaProgram || d.ihProgram)
      .map((d) => {
        const declared = new Date(d.declaredDate);
        const sepEnd = new Date(declared);
        sepEnd.setDate(sepEnd.getDate() + 60);
        return {
          ...d,
          sepEndDate: sepEnd.toISOString().split("T")[0],
          counties: d.counties.sort(),
        };
      })
      .filter((d) => new Date(d.sepEndDate) > now); // Only active SEP windows
  } catch (err) {
    console.error("FEMA API error:", err);
    return []; // Fail gracefully — agent sees 0 FEMA results
  }
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
// PLAN DATABASE — CMS Landscape File format: ContractID-PBP
// H=local MA, R=regional PPO, S=PDP, MG=Medigap
// ═══════════════════════════════════════════════════════════════════════════════

const PLAN_DB = [
  // ── UHC ──
  {
    cid: "H0543",
    pbp: "003",
    carrier: "uhc",
    name: "AARP Medicare Advantage (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 4,
    prem: 0,
    moop: 5900,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$120/qtr",
    grocery: null,
    flex: "$50/mo",
    transport: "24 trips",
    states: [
      "FL",
      "TX",
      "NC",
      "GA",
      "SC",
      "TN",
      "AL",
      "MS",
      "LA",
      "AR",
      "OK",
      "KY",
      "IN",
      "OH",
      "PA",
      "VA",
      "WV",
      "MD",
      "NJ",
      "CT",
      "NY",
    ],
  },
  {
    cid: "H0543",
    pbp: "006",
    carrier: "uhc",
    name: "AARP Medicare Advantage Plan 2 (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 4,
    prem: 25,
    moop: 4500,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$200/qtr",
    grocery: "$50/mo",
    flex: "$100/mo",
    transport: "36 trips",
    states: [
      "FL",
      "TX",
      "NC",
      "GA",
      "TN",
      "OH",
      "PA",
      "NJ",
      "NY",
      "IL",
      "MI",
      "WI",
      "MN",
      "MO",
      "CA",
      "AZ",
      "NV",
      "CO",
      "WA",
      "OR",
    ],
  },
  {
    cid: "H2228",
    pbp: "001",
    carrier: "uhc",
    name: "UHC Dual Complete (HMO-POS D-SNP)",
    type: "HMO-POS",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 3.5,
    prem: 0,
    moop: 3400,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$200/qtr",
    grocery: "$100/mo",
    flex: "$150/mo",
    transport: "48 trips",
    states: [
      "FL",
      "TX",
      "NC",
      "GA",
      "SC",
      "TN",
      "AL",
      "KY",
      "OH",
      "PA",
      "VA",
      "NJ",
      "NY",
      "IL",
      "MI",
      "CA",
      "AZ",
    ],
  },
  {
    cid: "H5521",
    pbp: "040",
    carrier: "uhc",
    name: "AARP Medicare Advantage Patriot (PPO)",
    type: "PPO",
    cat: "MAPD",
    snp: null,
    stars: 4,
    prem: 0,
    moop: 6700,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$100/qtr",
    grocery: null,
    flex: null,
    transport: "12 trips",
    states: [
      "FL",
      "TX",
      "NC",
      "GA",
      "SC",
      "TN",
      "OH",
      "PA",
      "VA",
      "NJ",
      "NY",
      "IL",
      "MI",
      "CA",
      "AZ",
      "CO",
      "WA",
    ],
  },
  {
    cid: "H5521",
    pbp: "055",
    carrier: "uhc",
    name: "UHC Medicare Advantage Choice (PPO)",
    type: "PPO",
    cat: "MAPD",
    snp: null,
    stars: 4.5,
    prem: 35,
    moop: 3900,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$250/qtr",
    grocery: "$75/mo",
    flex: "$125/mo",
    transport: "48 trips",
    states: ["FL", "TX", "NC", "GA", "OH", "PA", "NY", "IL", "CA", "AZ"],
  },
  {
    cid: "H5015",
    pbp: "010",
    carrier: "uhc",
    name: "UHC Chronic Complete (HMO C-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "C-SNP",
    stars: 4,
    prem: 0,
    moop: 4200,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$175/qtr",
    grocery: "$60/mo",
    flex: "$100/mo",
    transport: "36 trips",
    states: ["FL", "TX", "GA", "TN", "KY", "OH", "PA", "IL", "CA"],
  },
  {
    cid: "S5820",
    pbp: "019",
    carrier: "uhc",
    name: "AARP MedicareRx Walgreens (PDP)",
    type: "PDP",
    cat: "PDP",
    snp: null,
    stars: 3.5,
    prem: 7.5,
    moop: null,
    partD: true,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["ALL"],
  },
  {
    cid: "S5921",
    pbp: "001",
    carrier: "uhc",
    name: "AARP MedicareRx Preferred (PDP)",
    type: "PDP",
    cat: "PDP",
    snp: null,
    stars: 4,
    prem: 32.5,
    moop: null,
    partD: true,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["ALL"],
  },
  // ── Aetna ──
  {
    cid: "H3312",
    pbp: "055",
    carrier: "aetna",
    name: "Aetna Medicare Eagle Plus (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 4.5,
    prem: 0,
    moop: 4900,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$150/qtr",
    grocery: "$35/mo",
    flex: "$75/mo",
    transport: "36 trips",
    states: ["FL", "TX", "NC", "GA", "PA", "NJ", "NY", "IL", "OH", "CA"],
  },
  {
    cid: "H3312",
    pbp: "090",
    carrier: "aetna",
    name: "Aetna Medicare Assure (HMO-POS D-SNP)",
    type: "HMO-POS",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 3.5,
    prem: 0,
    moop: 3400,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$200/qtr",
    grocery: "$100/mo",
    flex: "$150/mo",
    transport: "48 trips",
    states: ["FL", "TX", "NC", "GA", "PA", "NJ", "NY", "OH", "IL", "CA", "AZ"],
  },
  {
    cid: "H5521",
    pbp: "200",
    carrier: "aetna",
    name: "Aetna Medicare Advantage (PPO)",
    type: "PPO",
    cat: "MAPD",
    snp: null,
    stars: 4,
    prem: 0,
    moop: 5900,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$100/qtr",
    grocery: null,
    flex: "$40/mo",
    transport: "24 trips",
    states: [
      "FL",
      "TX",
      "NC",
      "GA",
      "SC",
      "OH",
      "PA",
      "VA",
      "NJ",
      "NY",
      "IL",
      "CA",
      "AZ",
    ],
  },
  {
    cid: "S5810",
    pbp: "003",
    carrier: "aetna",
    name: "SilverScript Choice (PDP)",
    type: "PDP",
    cat: "PDP",
    snp: null,
    stars: 3.5,
    prem: 10,
    moop: null,
    partD: true,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["ALL"],
  },
  // ── Humana ──
  {
    cid: "H1036",
    pbp: "235",
    carrier: "humana",
    name: "Humana Gold Plus (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 4.5,
    prem: 0,
    moop: 4900,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$150/qtr",
    grocery: "$50/mo",
    flex: "$100/mo",
    transport: "36 trips",
    states: [
      "FL",
      "TX",
      "NC",
      "GA",
      "SC",
      "TN",
      "AL",
      "KY",
      "OH",
      "PA",
      "VA",
      "NJ",
      "IL",
      "IN",
      "WI",
      "MO",
      "LA",
      "AR",
      "MS",
      "OK",
    ],
  },
  {
    cid: "H1036",
    pbp: "300",
    carrier: "humana",
    name: "Humana Honor (PPO)",
    type: "PPO",
    cat: "MAPD",
    snp: null,
    stars: 4,
    prem: 0,
    moop: 5900,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$100/qtr",
    grocery: null,
    flex: "$50/mo",
    transport: "24 trips",
    states: [
      "FL",
      "TX",
      "NC",
      "GA",
      "SC",
      "TN",
      "KY",
      "OH",
      "PA",
      "VA",
      "IL",
      "IN",
      "WI",
      "MO",
      "LA",
      "AZ",
      "CO",
      "NV",
    ],
  },
  {
    cid: "H4461",
    pbp: "010",
    carrier: "humana",
    name: "Humana Dual Achieve (HMO D-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 3.5,
    prem: 0,
    moop: 3400,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$200/qtr",
    grocery: "$120/mo",
    flex: "$175/mo",
    transport: "48 trips",
    states: [
      "FL",
      "TX",
      "NC",
      "GA",
      "SC",
      "TN",
      "KY",
      "OH",
      "PA",
      "VA",
      "IL",
      "IN",
      "LA",
      "AZ",
    ],
  },
  {
    cid: "H5619",
    pbp: "022",
    carrier: "humana",
    name: "Humana Gold Plus C-SNP Diabetes (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: "C-SNP",
    stars: 4,
    prem: 0,
    moop: 4200,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$150/qtr",
    grocery: "$60/mo",
    flex: "$100/mo",
    transport: "36 trips",
    states: ["FL", "TX", "GA", "TN", "KY", "OH", "PA", "IL", "LA"],
  },
  {
    cid: "S5884",
    pbp: "063",
    carrier: "humana",
    name: "Humana Basic Rx Plan (PDP)",
    type: "PDP",
    cat: "PDP",
    snp: null,
    stars: 3.5,
    prem: 8.9,
    moop: null,
    partD: true,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["ALL"],
  },
  // ── BCBS ──
  {
    cid: "H3949",
    pbp: "001",
    carrier: "bcbs",
    name: "Blue Cross Medicare Advantage (PPO)",
    type: "PPO",
    cat: "MAPD",
    snp: null,
    stars: 4,
    prem: 0,
    moop: 5900,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$100/qtr",
    grocery: null,
    flex: "$40/mo",
    transport: "24 trips",
    states: [
      "FL",
      "TX",
      "NC",
      "GA",
      "SC",
      "TN",
      "AL",
      "PA",
      "VA",
      "MD",
      "NJ",
      "NY",
      "IL",
      "MI",
      "OH",
      "IN",
    ],
  },
  {
    cid: "H3949",
    pbp: "015",
    carrier: "bcbs",
    name: "Blue Cross Medicare Classic (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 4.5,
    prem: 0,
    moop: 4500,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$150/qtr",
    grocery: "$40/mo",
    flex: "$75/mo",
    transport: "36 trips",
    states: ["FL", "TX", "NC", "GA", "PA", "NJ", "NY", "IL", "MI", "OH"],
  },
  {
    cid: "H3949",
    pbp: "050",
    carrier: "bcbs",
    name: "Blue Cross Dual Advantage (HMO D-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 3.5,
    prem: 0,
    moop: 3400,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$200/qtr",
    grocery: "$100/mo",
    flex: "$150/mo",
    transport: "48 trips",
    states: ["FL", "TX", "NC", "GA", "PA", "NJ", "NY", "IL", "OH"],
  },
  {
    cid: "S5715",
    pbp: "004",
    carrier: "bcbs",
    name: "Blue Cross MedicareRx Plus (PDP)",
    type: "PDP",
    cat: "PDP",
    snp: null,
    stars: 4,
    prem: 15,
    moop: null,
    partD: true,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["ALL"],
  },
  // ── Cigna ──
  {
    cid: "H4513",
    pbp: "046",
    carrier: "cigna",
    name: "Cigna True Choice Medicare (PPO)",
    type: "PPO",
    cat: "MAPD",
    snp: null,
    stars: 4,
    prem: 0,
    moop: 5900,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$100/qtr",
    grocery: null,
    flex: "$50/mo",
    transport: "24 trips",
    states: [
      "FL",
      "TX",
      "NC",
      "GA",
      "SC",
      "TN",
      "PA",
      "VA",
      "NJ",
      "NY",
      "IL",
      "OH",
      "AZ",
      "CO",
      "CT",
    ],
  },
  {
    cid: "H4513",
    pbp: "080",
    carrier: "cigna",
    name: "Cigna True Choice Value (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 4.5,
    prem: 0,
    moop: 4200,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$150/qtr",
    grocery: "$40/mo",
    flex: "$75/mo",
    transport: "36 trips",
    states: ["FL", "TX", "NC", "PA", "NJ", "NY", "IL", "AZ", "CT"],
  },
  {
    cid: "H4513",
    pbp: "120",
    carrier: "cigna",
    name: "Cigna True Choice Dual (HMO-POS D-SNP)",
    type: "HMO-POS",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 3.5,
    prem: 0,
    moop: 3400,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$200/qtr",
    grocery: "$100/mo",
    flex: "$150/mo",
    transport: "48 trips",
    states: ["FL", "TX", "NC", "PA", "NJ", "NY", "IL", "AZ"],
  },
  // ── Wellcare ──
  {
    cid: "H1032",
    pbp: "075",
    carrier: "wellcare",
    name: "Wellcare No Premium (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 3.5,
    prem: 0,
    moop: 5900,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$100/qtr",
    grocery: "$25/mo",
    flex: "$50/mo",
    transport: "24 trips",
    states: [
      "FL",
      "TX",
      "NC",
      "GA",
      "SC",
      "TN",
      "AL",
      "KY",
      "OH",
      "PA",
      "VA",
      "NJ",
      "NY",
      "IL",
      "IN",
      "LA",
      "MS",
      "AR",
      "AZ",
      "NV",
    ],
  },
  {
    cid: "H1032",
    pbp: "090",
    carrier: "wellcare",
    name: "Wellcare Dual Liberty (HMO D-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 3,
    prem: 0,
    moop: 3400,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$200/qtr",
    grocery: "$125/mo",
    flex: "$200/mo",
    transport: "48 trips",
    states: [
      "FL",
      "TX",
      "NC",
      "GA",
      "SC",
      "TN",
      "KY",
      "OH",
      "PA",
      "NJ",
      "NY",
      "IL",
      "LA",
      "AZ",
      "NV",
    ],
  },
  {
    cid: "H1032",
    pbp: "110",
    carrier: "wellcare",
    name: "Wellcare Chronic Complete C-SNP (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: "C-SNP",
    stars: 3.5,
    prem: 0,
    moop: 4200,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$150/qtr",
    grocery: "$50/mo",
    flex: "$100/mo",
    transport: "36 trips",
    states: ["FL", "TX", "NC", "GA", "OH", "PA", "NY", "IL"],
  },
  {
    cid: "S4802",
    pbp: "002",
    carrier: "wellcare",
    name: "Wellcare Value Script (PDP)",
    type: "PDP",
    cat: "PDP",
    snp: null,
    stars: 3,
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
    states: ["ALL"],
  },
  // ── Molina ──
  {
    cid: "H9622",
    pbp: "005",
    carrier: "molina",
    name: "Molina Complete Care (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 3.5,
    prem: 0,
    moop: 5900,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$75/qtr",
    grocery: null,
    flex: "$40/mo",
    transport: "24 trips",
    states: [
      "FL",
      "TX",
      "CA",
      "OH",
      "IL",
      "MI",
      "WA",
      "SC",
      "NY",
      "WI",
      "UT",
      "NM",
    ],
  },
  {
    cid: "H9622",
    pbp: "020",
    carrier: "molina",
    name: "Molina Dual Options (HMO D-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 3,
    prem: 0,
    moop: 3400,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$200/qtr",
    grocery: "$100/mo",
    flex: "$150/mo",
    transport: "48 trips",
    states: ["FL", "TX", "CA", "OH", "IL", "MI", "WA", "SC", "NY"],
  },
  // ── Devoted ──
  {
    cid: "H7145",
    pbp: "001",
    carrier: "devoted",
    name: "Devoted Medicare Advantage (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 4.5,
    prem: 0,
    moop: 4500,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$175/qtr",
    grocery: "$50/mo",
    flex: "$100/mo",
    transport: "36 trips",
    states: [
      "FL",
      "TX",
      "NC",
      "GA",
      "SC",
      "TN",
      "AL",
      "OH",
      "PA",
      "VA",
      "IL",
      "AZ",
      "NV",
      "OK",
      "IN",
    ],
  },
  {
    cid: "H7145",
    pbp: "010",
    carrier: "devoted",
    name: "Devoted Dual Complete (HMO D-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 4,
    prem: 0,
    moop: 3400,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$225/qtr",
    grocery: "$125/mo",
    flex: "$175/mo",
    transport: "48 trips",
    states: ["FL", "TX", "NC", "GA", "SC", "TN", "OH", "PA", "VA", "IL", "AZ"],
  },
  // ── Alignment ──
  {
    cid: "H2427",
    pbp: "001",
    carrier: "alignment",
    name: "Alignment Access (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 4,
    prem: 0,
    moop: 5400,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$100/qtr",
    grocery: null,
    flex: "$50/mo",
    transport: "24 trips",
    states: ["CA", "NC", "NV", "AZ", "TX"],
  },
  {
    cid: "H2427",
    pbp: "005",
    carrier: "alignment",
    name: "Alignment Dual Complete (HMO D-SNP)",
    type: "HMO",
    cat: "MAPD",
    snp: "D-SNP",
    stars: 3.5,
    prem: 0,
    moop: 3400,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$200/qtr",
    grocery: "$100/mo",
    flex: "$150/mo",
    transport: "48 trips",
    states: ["CA", "NC", "NV", "AZ", "TX"],
  },
  // ── Kaiser ──
  {
    cid: "H0524",
    pbp: "003",
    carrier: "kaiser",
    name: "Kaiser Senior Advantage (HMO)",
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
    otc: "$100/qtr",
    grocery: null,
    flex: null,
    transport: null,
    states: ["CA", "CO", "GA", "HI", "MD", "OR", "VA", "WA", "DC"],
  },
  {
    cid: "H0524",
    pbp: "010",
    carrier: "kaiser",
    name: "Kaiser Senior Advantage Plus (HMO)",
    type: "HMO",
    cat: "MAPD",
    snp: null,
    stars: 5,
    prem: 35,
    moop: 2500,
    partD: true,
    dental: true,
    vision: true,
    hearing: true,
    otc: "$150/qtr",
    grocery: null,
    flex: "$50/mo",
    transport: "12 trips",
    states: ["CA", "CO", "GA", "HI", "MD", "OR", "VA", "WA", "DC"],
  },
  // ── Mutual of Omaha (Medigap) ──
  {
    cid: "MG-N",
    pbp: "—",
    carrier: "mutual",
    name: "Mutual of Omaha Medigap Plan N",
    type: "Medigap",
    cat: "Medigap",
    snp: null,
    stars: null,
    prem: 135,
    moop: null,
    partD: false,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["ALL"],
  },
  {
    cid: "MG-G",
    pbp: "—",
    carrier: "mutual",
    name: "Mutual of Omaha Medigap Plan G",
    type: "Medigap",
    cat: "Medigap",
    snp: null,
    stars: null,
    prem: 165,
    moop: null,
    partD: false,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["ALL"],
  },
  {
    cid: "MG-F",
    pbp: "—",
    carrier: "mutual",
    name: "Mutual of Omaha Medigap Plan F",
    type: "Medigap",
    cat: "Medigap",
    snp: null,
    stars: null,
    prem: 195,
    moop: null,
    partD: false,
    dental: false,
    vision: false,
    hearing: false,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: ["ALL"],
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
function getSEPsForZip(zip, femaDisasters = []) {
  const state = getStateFromZip(zip);
  const today = new Date();
  const seps = [];
  const zipPlans = getPlansForState(zip);
  const maPlans = (filter) => zipPlans.filter(filter);

  // 1. FEMA Disaster SEPs (LIVE from OpenFEMA API)
  // Match by state — agents verify specific county from the list
  femaDisasters
    .filter((d) => d.state === state)
    .forEach((d) => {
      if (new Date(d.sepEndDate) > today) {
        seps.push({
          id: `fema-${d.id}`,
          category: "FEMA Disaster",
          type: "FEMA Disaster SEP",
          code: "SEP-FEMA",
          event: d.title,
          description: `${d.id} — ${d.type} in ${
            d.state
          }. Counties: ${d.counties.join(
            ", "
          )}. Enroll in or switch MA/MAPD plans.`,
          startDate: d.declaredDate,
          endDate: d.sepEndDate,
          duration: "60 days from declaration",
          eligibleProducts: ["MA", "MAPD", "PDP"],
          source: "FEMA",
          urgency: daysRemaining(d.sepEndDate) < 30 ? "high" : "medium",
          counties: d.counties,
          daysLeft: daysRemaining(d.sepEndDate),
          matchingPlans: maPlans((p) => ["MA", "MAPD", "PDP"].includes(p.cat)),
        });
      }
    });

  // 2. MA OEP (Jan 1 – Mar 31)
  if (isActiveNow("2025-01-01", "2025-03-31")) {
    seps.push({
      id: "medicare-oep-2025",
      category: "Medicare",
      type: "Medicare Advantage OEP",
      code: "OEP",
      event: "Annual MA Open Enrollment (Jan 1 – Mar 31)",
      description:
        "Currently enrolled MA beneficiaries can make ONE plan change: switch MA/MAPD plan, or drop MA and return to Original Medicare + PDP.",
      startDate: "2025-01-01",
      endDate: "2025-03-31",
      duration: "Jan 1 – Mar 31",
      eligibleProducts: ["MA", "MAPD"],
      source: "CMS",
      urgency: "medium",
      daysLeft: daysRemaining("2025-03-31"),
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

  // 5. 5-Star SEP
  if (hasFiveStarPlans(zip) && isActiveNow("2024-12-08", "2025-11-30")) {
    seps.push({
      id: "medicare-5star",
      category: "Medicare",
      type: "5-Star Special Enrollment Period",
      code: "5-STAR",
      event: "5-Star rated plan available in this area",
      description:
        "CMS 5-star rated MA/MAPD plan available. Switch to a 5-star plan once per year. Only 5-star plans shown below.",
      startDate: "2024-12-08",
      endDate: "2025-11-30",
      duration: "Dec 8 – Nov 30 (once/year)",
      eligibleProducts: ["MA", "MAPD"],
      source: "CMS Star Ratings",
      urgency: "low",
      daysLeft: daysRemaining("2025-11-30"),
      matchingPlans: maPlans((p) => p.stars >= 5),
    });
  }

  // 6. Dual-Eligible / LIS
  seps.push({
    id: "medicare-dual-lis",
    category: "Medicare",
    type: "Dual-Eligible / LIS (Extra Help) SEP",
    code: "DUAL/LIS",
    event: "Dual-eligible (Medicare+Medicaid) or Extra Help/LIS",
    description:
      "Continuous SEP — change MA/MAPD once per quarter (Q1–Q3). D-SNP plans designed for dual-eligible beneficiaries.",
    startDate: "Year-round",
    endDate: "Year-round",
    duration: "Continuous — once per quarter",
    eligibleProducts: ["MA", "MAPD", "D-SNP"],
    source: "CMS",
    urgency: "info",
    matchingPlans: maPlans(
      (p) => p.snp === "D-SNP" || ["MA", "MAPD"].includes(p.cat)
    ),
  });

  // 7. Moved Out of Service Area
  seps.push({
    id: "medicare-move",
    category: "Medicare",
    type: "Moved Out of Service Area SEP",
    code: "SEP-MOVE",
    event: "Permanent move — current plan no longer available",
    description:
      "63-day SEP to enroll in a new MA/MAPD plan in new service area after permanent address change.",
    startDate: "Varies by individual",
    endDate: "63 days from move date",
    duration: "63 days from move",
    eligibleProducts: ["MA", "MAPD", "Medigap"],
    source: "CMS",
    urgency: "info",
    matchingPlans: maPlans((p) => ["MA", "MAPD", "Medigap"].includes(p.cat)),
  });

  // 8. Loss of Creditable Coverage
  seps.push({
    id: "medicare-loss-coverage",
    category: "Medicare",
    type: "Loss of Creditable Coverage SEP",
    code: "SEP-LOSS",
    event: "Involuntary loss of employer/union/group coverage",
    description:
      "63-day SEP after involuntary loss of creditable coverage (employer ended, COBRA expired, etc.).",
    startDate: "Varies by individual",
    endDate: "63 days from loss",
    duration: "63 days from loss",
    eligibleProducts: ["MA", "MAPD", "Medigap"],
    source: "CMS",
    urgency: "info",
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
          "Year-round enrollment in C-SNP plans for individuals with qualifying chronic conditions. Specialized care coordination included.",
        startDate: "Year-round",
        endDate: "Year-round",
        duration: "Continuous",
        eligibleProducts: ["C-SNP"],
        source: "CMS",
        urgency: "info",
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
    bg: "#fef2f2",
    border: "#fca5a5",
    text: "#991b1b",
    badge: "#dc2626",
  },
  Medicare: {
    bg: "#eff6ff",
    border: "#93c5fd",
    text: "#1e3a5f",
    badge: "#2563eb",
  },
};

const URGENCY_STYLES = {
  high: { bg: "#dc2626", text: "#fff", label: "URGENT" },
  medium: { bg: "#f59e0b", text: "#000", label: "ACTIVE" },
  low: { bg: "#6366f1", text: "#fff", label: "OPEN" },
  info: { bg: "#64748b", text: "#fff", label: "ONGOING" },
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
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.05em",
        color: "#fff",
        backgroundColor: colors[product] || "#64748b",
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
        borderRadius: "6px",
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
        borderRadius: "12px",
        border: `1px solid ${catColors.border}`,
        backgroundColor: "#fff",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
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
                borderRadius: "4px",
                textTransform: "uppercase",
                backgroundColor: urgStyle.bg,
                color: urgStyle.text,
              }}
            >
              {urgStyle.label}
            </span>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.06em",
                padding: "2px 8px",
                borderRadius: "4px",
                textTransform: "uppercase",
                backgroundColor: catColors.badge + "18",
                color: catColors.badge,
              }}
            >
              {sep.category}
            </span>
            {sep.code === "5-STAR" && <IconStar />}
            {sep.daysLeft != null && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  backgroundColor:
                    sep.daysLeft <= 14
                      ? "#fef2f2"
                      : sep.daysLeft <= 30
                      ? "#fffbeb"
                      : "#f0fdf4",
                  color:
                    sep.daysLeft <= 14
                      ? "#dc2626"
                      : sep.daysLeft <= 30
                      ? "#d97706"
                      : "#16a34a",
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
              color: "#0f172a",
              lineHeight: 1.3,
            }}
          >
            {sep.type}
          </div>
          <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
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
              style={{ fontSize: "11px", color: "#64748b", padding: "2px 4px" }}
            >
              +{sep.eligibleProducts.length - 4}
            </span>
          )}
        </div>
      </div>

      {/* Expanded Detail */}
      {isExpanded && (
        <div style={{ padding: "20px", background: catColors.bg + "60" }}>
          <p
            style={{
              fontSize: "14px",
              color: "#334155",
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
                background: "#fff",
                borderRadius: "8px",
                padding: "12px 16px",
                border: "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#94a3b8",
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
                style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}
              >
                {sep.duration}
              </div>
              <div
                style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}
              >
                {sep.startDate !== "Year-round" &&
                sep.startDate !== "Varies by individual"
                  ? `${sep.startDate} → ${sep.endDate}`
                  : sep.startDate}
              </div>
            </div>
            <div
              style={{
                background: "#fff",
                borderRadius: "8px",
                padding: "12px 16px",
                border: "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#94a3b8",
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
                background: "#fff",
                borderRadius: "8px",
                padding: "12px 16px",
                border: "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: "4px",
                }}
              >
                Source
              </div>
              <div
                style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}
              >
                {sep.source}
              </div>
              <div
                style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}
              >
                Code: {sep.code}
              </div>
            </div>
          </div>

          {sep.counties && (
            <div
              style={{
                background: "#fff",
                borderRadius: "8px",
                padding: "12px 16px",
                border: "1px solid #e2e8f0",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#94a3b8",
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
                style={{ fontSize: "13px", color: "#334155", lineHeight: 1.6 }}
              >
                {sep.counties.join("  •  ")}
              </div>
            </div>
          )}

          {/* Matching Plans for this SEP */}
          {sep.matchingPlans && sep.matchingPlans.length > 0 && (
            <div
              style={{
                background: "#fff",
                borderRadius: "8px",
                padding: "12px 16px",
                border: "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#94a3b8",
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
                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
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
                            color: "#94a3b8",
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
                        "HMO-POS": "#3b82f6",
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
                          style={{ borderBottom: "1px solid #f1f5f9" }}
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
                                  color: "#334155",
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
                              color: "#334155",
                              maxWidth: "200px",
                            }}
                          >
                            {p.name}
                          </td>
                          <td
                            style={{
                              padding: "6px 6px",
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: "10px",
                              color: "#64748b",
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
                                borderRadius: "3px",
                                fontSize: "9px",
                                fontWeight: 700,
                                color: "#fff",
                                backgroundColor:
                                  typeColors[p.type] || "#475569",
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
                                  borderRadius: "3px",
                                  fontSize: "9px",
                                  fontWeight: 700,
                                  color: "#fff",
                                  backgroundColor:
                                    snpColors[p.snp] || "#475569",
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
                              color: p.prem === 0 ? "#16a34a" : "#334155",
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
                              color: "#334155",
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
                              color: p.grocery ? "#16a34a" : "#cbd5e1",
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
                              color: p.otc ? "#16a34a" : "#cbd5e1",
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
                              color: p.flex ? "#16a34a" : "#cbd5e1",
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
                background: "#fff",
                borderRadius: "8px",
                padding: "12px 16px",
                border: "1px solid #e2e8f0",
                color: "#94a3b8",
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

  // Live FEMA data cache (persists across searches within session)
  const femaCache = useRef({ data: null, fetchedAt: 0 });

  const handleSearch = useCallback(async () => {
    const cleanZip = zip.trim();
    if (!/^\d{5}$/.test(cleanZip)) return;
    setLoading(true);

    try {
      // Fetch live FEMA data (cached for 30 min within session)
      let femaData = femaCache.current.data;
      const now = Date.now();
      if (!femaData || now - femaCache.current.fetchedAt > 30 * 60 * 1000) {
        femaData = await fetchLiveFemaDisasters();
        femaCache.current = { data: femaData, fetchedAt: now };
      }

      const seps = getSEPsForZip(cleanZip, femaData);
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
        if (planFilterSnp === "none" ? p.snp : p.snp !== planFilterSnp)
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
          "linear-gradient(165deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)",
        fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@500;700&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <div
        style={{
          background:
            "linear-gradient(135deg, rgba(37,99,235,0.12) 0%, rgba(99,102,241,0.08) 100%)",
          borderBottom: "1px solid rgba(148,163,184,0.1)",
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
                borderRadius: "10px",
                background: "linear-gradient(135deg, #2563eb, #6366f1)",
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
                  color: "#f1f5f9",
                  letterSpacing: "-0.02em",
                }}
              >
                SEP Lookup Tool
              </h1>
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  color: "#94a3b8",
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
            background: "rgba(30,41,59,0.8)",
            borderRadius: "14px",
            padding: "8px",
            border: "1px solid rgba(148,163,184,0.15)",
            backdropFilter: "blur(12px)",
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
              color: "#f1f5f9",
              background: "transparent",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.08em",
            }}
          />
          <button
            onClick={handleSearch}
            disabled={!/^\d{5}$/.test(zip.trim()) || loading}
            style={{
              padding: "12px 28px",
              borderRadius: "10px",
              border: "none",
              background: /^\d{5}$/.test(zip.trim())
                ? "linear-gradient(135deg, #2563eb, #6366f1)"
                : "#334155",
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
              style={{ fontSize: "12px", color: "#64748b", padding: "6px 0" }}
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
                  borderRadius: "8px",
                  border: "1px solid rgba(148,163,184,0.2)",
                  background: "rgba(30,41,59,0.6)",
                  color: "#94a3b8",
                  fontSize: "13px",
                  fontFamily: "'JetBrains Mono', monospace",
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
                background: "rgba(37,99,235,0.12)",
                border: "1px solid rgba(37,99,235,0.25)",
                borderRadius: "10px",
                padding: "12px 18px",
                flex: "1 1 auto",
                minWidth: "200px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#60a5fa",
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
                  color: "#f1f5f9",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {searchedZip}{" "}
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#94a3b8",
                  }}
                >
                  ({state})
                </span>
              </div>
            </div>
            <div
              style={{
                background: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(34,197,94,0.25)",
                borderRadius: "10px",
                padding: "12px 18px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#4ade80",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                SEPs
              </div>
              <div
                style={{ fontSize: "22px", fontWeight: 800, color: "#f1f5f9" }}
              >
                {filtered?.length || 0}
              </div>
            </div>
            <div
              style={{
                background: "rgba(168,85,247,0.1)",
                border: "1px solid rgba(168,85,247,0.25)",
                borderRadius: "10px",
                padding: "12px 18px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#c084fc",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Plans
              </div>
              <div
                style={{ fontSize: "22px", fontWeight: 800, color: "#f1f5f9" }}
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
                borderRadius: "10px",
                padding: "12px 18px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: femaActive.length > 0 ? "#f87171" : "#94a3b8",
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
                style={{ fontSize: "22px", fontWeight: 800, color: "#f1f5f9" }}
              >
                {femaActive.length > 0 ? femaActive.length : "—"}
              </div>
            </div>
            <div
              style={{
                background: "rgba(99,102,241,0.1)",
                border: "1px solid rgba(99,102,241,0.25)",
                borderRadius: "10px",
                padding: "12px 18px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#a5b4fc",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Carriers
              </div>
              <div
                style={{ fontSize: "22px", fontWeight: 800, color: "#f1f5f9" }}
              >
                {carriers.length}
              </div>
            </div>
          </div>

          {/* ═══ TABS ═══ */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid rgba(148,163,184,0.1)",
              marginBottom: "20px",
            }}
          >
            {[
              ["plans", `📋 Plans & Codes (${filteredPlans.length})`],
              ["seps", `🔁 SEPs (${filtered?.length || 0})`],
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
                    activeTab === key ? "rgba(37,99,235,0.15)" : "transparent",
                  color: activeTab === key ? "#60a5fa" : "#94a3b8",
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
                  background: "rgba(30,41,59,0.5)",
                  borderRadius: "10px",
                  padding: "10px 16px",
                  border: "1px solid rgba(148,163,184,0.1)",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#94a3b8",
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
                    borderRadius: "6px",
                    border: "1px solid rgba(148,163,184,0.2)",
                    background: "#1e293b",
                    color: "#e2e8f0",
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
                    borderRadius: "6px",
                    border: "1px solid rgba(148,163,184,0.2)",
                    background: "#1e293b",
                    color: "#e2e8f0",
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
                    borderRadius: "6px",
                    border: "1px solid rgba(148,163,184,0.2)",
                    background: "#1e293b",
                    color: "#e2e8f0",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <option value="all">All Plans</option>
                  <option value="D-SNP">D-SNP Only</option>
                  <option value="C-SNP">C-SNP Only</option>
                  <option value="none">Non-SNP Only</option>
                </select>
                <input
                  type="text"
                  value={planSearch}
                  onChange={(e) => setPlanSearch(e.target.value)}
                  placeholder="Search plans or contract ID..."
                  style={{
                    flex: "1 1 160px",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: "1px solid rgba(148,163,184,0.2)",
                    background: "#1e293b",
                    color: "#e2e8f0",
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
                      borderRadius: "6px",
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
                  border: "1px solid rgba(148,163,184,0.12)",
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
                        background: "rgba(15,23,42,0.9)",
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
                            color: "#64748b",
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
                          "HMO-POS": "#3b82f6",
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
                                  "1px solid rgba(148,163,184,0.06)",
                                background: isOpen
                                  ? "rgba(37,99,235,0.06)"
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
                                      color: "#e2e8f0",
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
                                    color: "#e2e8f0",
                                    lineHeight: 1.3,
                                  }}
                                >
                                  {p.name}
                                </div>
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: "#64748b",
                                    fontFamily: "'JetBrains Mono', monospace",
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
                                    borderRadius: "4px",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    color: "#fff",
                                    backgroundColor:
                                      typeColors[p.type] || "#475569",
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
                                      borderRadius: "4px",
                                      fontSize: "10px",
                                      fontWeight: 700,
                                      color: "#fff",
                                      backgroundColor:
                                        snpColors[p.snp] || "#475569",
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
                                      color: "#64748b",
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
                                    color: p.prem === 0 ? "#4ade80" : "#e2e8f0",
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
                                    color: "#e2e8f0",
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
                                    color: p.grocery ? "#4ade80" : "#475569",
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
                                    color: p.otc ? "#4ade80" : "#475569",
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
                                    color: p.flex ? "#4ade80" : "#475569",
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
                                    background: "rgba(37,99,235,0.04)",
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
                                            borderRadius: "6px",
                                            fontSize: "11px",
                                            fontWeight: 600,
                                            background: "rgba(34,197,94,0.1)",
                                            border:
                                              "1px solid rgba(34,197,94,0.2)",
                                            color: "#4ade80",
                                          }}
                                        >
                                          {lbl}:{" "}
                                          <span style={{ color: "#e2e8f0" }}>
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
                                          background: "rgba(15,23,42,0.8)",
                                          borderRadius: "6px",
                                          padding: "8px 12px",
                                          border:
                                            "1px solid rgba(148,163,184,0.1)",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize: "10px",
                                            fontWeight: 700,
                                            color: "#64748b",
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
                                            color: "#e2e8f0",
                                            fontFamily:
                                              lbl === "Contract ID" ||
                                              lbl === "PBP"
                                                ? "'JetBrains Mono', monospace"
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
                            color: "#94a3b8",
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
                  background: "rgba(30,41,59,0.5)",
                  borderRadius: "10px",
                  padding: "10px 16px",
                  border: "1px solid rgba(148,163,184,0.1)",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#94a3b8",
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
                    borderRadius: "6px",
                    border: "1px solid rgba(148,163,184,0.2)",
                    background: "#1e293b",
                    color: "#e2e8f0",
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
                    borderRadius: "6px",
                    border: "1px solid rgba(148,163,184,0.2)",
                    background: "#1e293b",
                    color: "#e2e8f0",
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
                      borderRadius: "6px",
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
                      "linear-gradient(135deg, rgba(220,38,38,0.15), rgba(239,68,68,0.08))",
                    border: "1px solid rgba(239,68,68,0.35)",
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
                        color: "#fca5a5",
                        marginBottom: "4px",
                      }}
                    >
                      Active FEMA Disaster Declaration
                      {femaActive.length > 1 ? "s" : ""} in This Area
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#fda4af",
                        lineHeight: 1.5,
                      }}
                    >
                      {femaActive.map((f) => f.event).join("; ")} — 60-day SEP
                      applies for affected beneficiaries. Verify client address
                      against affected counties.
                    </div>
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
                      color: "#94a3b8",
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
                  background: "rgba(30,41,59,0.6)",
                  borderRadius: "14px",
                  padding: "20px",
                  border: "1px solid rgba(148,163,184,0.1)",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 14px 0",
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "#e2e8f0",
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
                        background: "#0f172a",
                        borderRadius: "10px",
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
                          color: "#f1f5f9",
                          marginBottom: "6px",
                        }}
                      >
                        {c.abbr}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#94a3b8",
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

          {/* Disclaimer */}
          <div
            style={{
              marginTop: "24px",
              padding: "16px 20px",
              borderRadius: "10px",
              background: "rgba(100,116,139,0.08)",
              border: "1px solid rgba(100,116,139,0.15)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "11px",
                color: "#64748b",
                lineHeight: 1.6,
              }}
            >
              <strong>Disclaimer:</strong> FEMA disaster data is fetched live
              from the OpenFEMA API (api.fema.gov). Plan data is sourced from
              CMS Landscape Files for CY2025 — in production, import CMS CSV
              files into your database for county-level precision (see
              SETUP.md). Premiums, benefits, and service areas may vary — always
              verify on Medicare.gov. For agent/broker use only.
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
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#94a3b8" }}>
            Scanning sources for {zip}...
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
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
              color: "#64748b",
              marginBottom: "8px",
            }}
          >
            Enter a zip code to begin
          </div>
          <div
            style={{
              fontSize: "14px",
              color: "#475569",
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
        * { box-sizing: border-box; }
        table tbody tr:hover td { background: rgba(37,99,235,0.06) !important; }
        select:focus { border-color: rgba(99,102,241,0.5) !important; }
        button:hover { filter: brightness(1.1); }
        input::placeholder { color: #475569; }
      `}</style>
    </div>
  );
}
