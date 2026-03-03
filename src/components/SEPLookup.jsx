import React, { useState, useMemo, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import "../SEPLookupTool.css";

const FEMA_DISASTER_DB = [
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
    notes: "PA only as of 2/19/2026. IA may be added.",
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
    notes: "PA only. No IA — no Medicare SEP.",
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
    notes: "PA for 23 counties. IA under federal review.",
  },
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
    notes: "Fire Mgmt Assistance. Ongoing.",
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
    notes: "Fire Mgmt Assistance. Ongoing.",
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
    notes: "Fire Mgmt Assistance. Ongoing.",
  },
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
    notes: "IA active. $30.2M approved.",
  },
  {
    id: "DR-4878",
    disasterNumber: 4878,
    title: "Tennessee Severe Storms, Tornadoes & Flooding",
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
    notes: "IA for 9 counties.",
  },
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
  {
    id: "DR-4876",
    disasterNumber: 4876,
    title: "Kentucky Severe Storms & Flooding",
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

async function fetchLiveFemaDisasters() {
  const now = new Date();
  const lookbackDate = new Date(now);
  lookbackDate.setMonth(lookbackDate.getMonth() - 12);
  const dateStr = lookbackDate.toISOString().split("T")[0];
  const url = `https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=declarationDate ge '${dateStr}' and declarationType eq 'DR'&$orderby=declarationDate desc&$top=1000&$select=disasterNumber,declarationDate,incidentType,declarationTitle,state,designatedArea,ihProgramDeclared,iaProgramDeclared,paProgramDeclared,incidentBeginDate,incidentEndDate`;
  let apiResults = null;
  let apiFailed = false;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`FEMA API ${res.status}`);
    const data = await res.json();
    const records = data.DisasterDeclarationsSummaries || [];
    if (records.length === 0) throw new Error("FEMA API returned 0 records");
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
  const disasters =
    apiResults && apiResults.length > 0 ? apiResults : FEMA_DISASTER_DB;
  if (!apiResults || apiResults.length === 0) apiFailed = true;
  return {
    apiFailed,
    disasters: disasters
      .filter((d) => d.iaProgram || d.ihProgram || d.paOnly)
      .map((d) => {
        const declared = new Date(d.declaredDate);
        const incidentEnd = d.incidentEnd ? new Date(d.incidentEnd) : null;
        const isOngoing = !incidentEnd || incidentEnd > now;
        let sepEnd, durationLabel;
        if (d.paOnly) {
          const baseDate = incidentEnd || declared;
          sepEnd = new Date(baseDate);
          sepEnd.setMonth(sepEnd.getMonth() + 2);
          sepEnd = new Date(sepEnd.getFullYear(), sepEnd.getMonth() + 1, 0);
          durationLabel = "PA only — SEP activates if IA is declared";
        } else if (isOngoing) {
          sepEnd = new Date(now.getFullYear() + 1, 0, 1);
          durationLabel = "Ongoing — SEP open until closed + 2 mo";
        } else {
          const baseDate = incidentEnd > declared ? incidentEnd : declared;
          sepEnd = new Date(baseDate);
          sepEnd.setMonth(sepEnd.getMonth() + 2);
          sepEnd = new Date(sepEnd.getFullYear(), sepEnd.getMonth() + 1, 0);
          durationLabel = `2 cal months after incident end (${d.incidentEnd})`;
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
  },
  aetna: {
    name: "Aetna (CVS Health)",
    abbr: "Aetna",
    color: "#7D3F98",
    products: ["MA", "MAPD", "PDP", "Medigap"],
  },
  bcbs: {
    name: "Blue Cross Blue Shield",
    abbr: "BCBS",
    color: "#0079C1",
    products: ["MA", "MAPD", "PDP", "Medigap"],
  },
  cigna: {
    name: "Cigna Healthcare",
    abbr: "Cigna",
    color: "#E57200",
    products: ["MA", "MAPD", "PDP"],
  },
  humana: {
    name: "Humana",
    abbr: "Humana",
    color: "#43B02A",
    products: ["MA", "MAPD", "PDP", "Medigap"],
  },
  wellcare: {
    name: "Wellcare (Centene)",
    abbr: "Wellcare",
    color: "#005EB8",
    products: ["MA", "MAPD", "PDP"],
  },
  molina: {
    name: "Molina Healthcare",
    abbr: "Molina",
    color: "#BE1E2D",
    products: ["MA", "MAPD"],
  },
  devoted: {
    name: "Devoted Health",
    abbr: "Devoted",
    color: "#FF6B35",
    products: ["MA", "MAPD"],
  },
  alignment: {
    name: "Alignment Health",
    abbr: "Alignment",
    color: "#00A99D",
    products: ["MA", "MAPD"],
  },
  kaiser: {
    name: "Kaiser Permanente",
    abbr: "Kaiser",
    color: "#006BA6",
    products: ["MA", "MAPD"],
  },
  mutual: {
    name: "Mutual of Omaha",
    abbr: "MutualOmaha",
    color: "#003768",
    products: ["Medigap"],
  },
};

const PLAN_DB = [
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

const ZIP_COUNTY_MAP = {
  287: "Mecklenburg",
  288: "Buncombe",
  276: "Guilford",
  275: "Wake",
  277: "Durham",
  283: "Gaston",
  284: "Catawba",
  331: "Miami-Dade",
  332: "Miami-Dade",
  333: "Broward",
  334: "Palm Beach",
  336: "Hillsborough",
  337: "Polk",
  338: "Manatee",
  347: "Orange",
  327: "Orange",
  328: "Seminole",
  329: "Brevard",
  326: "Volusia",
  335: "Pinellas",
  339: "Lee",
  341: "Sarasota",
  770: "Harris",
  771: "Harris",
  750: "Dallas",
  751: "Dallas",
  760: "Tarrant",
  782: "Bexar",
  787: "Travis",
  799: "El Paso",
  900: "Los Angeles",
  901: "Los Angeles",
  902: "Los Angeles",
  906: "Los Angeles",
  917: "Los Angeles",
  921: "San Diego",
  941: "San Francisco",
  945: "Alameda",
  950: "Santa Clara",
  958: "Sacramento",
  300: "Fulton",
  303: "Fulton",
  310: "Chatham",
  150: "Allegheny",
  190: "Philadelphia",
  191: "Delaware",
  100: "New York",
  112: "Kings",
  114: "Queens",
  104: "Bronx",
  441: "Cuyahoga",
  432: "Franklin",
  452: "Hamilton",
  481: "Wayne",
  488: "Ingham",
  495: "Kent",
  606: "Cook",
  600: "Cook",
  850: "Maricopa",
  851: "Maricopa",
  852: "Maricopa",
  857: "Pima",
  891: "Clark",
  895: "Washoe",
  405: "Fayette",
  401: "Jefferson",
  402: "Jefferson",
  370: "Davidson",
  371: "Davidson",
  381: "Shelby",
  379: "Knox",
  700: "Orleans",
  701: "Jefferson",
  708: "East Baton Rouge",
  392: "Hinds",
  350: "Jefferson",
  351: "Jefferson",
  366: "Mobile",
  294: "Charleston",
  290: "Richland",
  296: "Greenville",
  230: "Richmond City",
  220: "Fairfax",
  223: "Fairfax",
  981: "King",
  984: "Pierce",
  972: "Multnomah",
  802: "Denver",
  800: "Denver",
  803: "El Paso",
  641: "Jackson",
  631: "St. Louis City",
  462: "Marion",
  532: "Milwaukee",
  537: "Dane",
  554: "Hennepin",
  551: "Ramsey",
  503: "Polk",
  681: "Douglas",
  "070": "Essex",
  "071": "Passaic",
  "088": "Middlesex",
  "061": "Hartford",
  "065": "New Haven",
  "021": "Suffolk",
  "017": "Worcester",
};
function getCountyFromZip(zip) {
  return ZIP_COUNTY_MAP[zip.substring(0, 3)] || null;
}

async function fetchCountiesForState(state) {
  const { data, error } = await supabase
    .from("cms_plans_PY2026")
    .select('"County Name"')
    .eq("State Territory Abbreviation", state)
    .neq("County Name", "All Counties")
    .order('"County Name"');
  if (error) {
    console.error("Counties fetch error:", error);
    return [];
  }
  return [...new Set(data.map((r) => r["County Name"]))].sort();
}
async function fetchPlansFromSupabase(state, county) {
  const { data, error } = await supabase
    .from("cms_plans_PY2026")
    .select("*")
    .eq("State Territory Abbreviation", state)
    .or(`County Name.eq.${county},County Name.eq.All Counties`)
    .neq("Sanctioned Plan", "Yes");
  if (error) {
    console.error("Plans fetch error:", error);
    return [];
  }
  return data;
}
function mapCarrierKey(parentOrg, contractName, orgMarketing) {
  const all = `${parentOrg} ${contractName} ${orgMarketing}`.toLowerCase();
  if (all.includes("unitedhealth") || all.includes("aarp")) return "uhc";
  if (
    all.includes("cvs") ||
    all.includes("aetna") ||
    all.includes("silverscript")
  )
    return "aetna";
  if (all.includes("humana")) return "humana";
  if (all.includes("centene") || all.includes("wellcare")) return "wellcare";
  if (
    all.includes("blue cross") ||
    all.includes("bluecross") ||
    all.includes("anthem") ||
    all.includes("elevance") ||
    all.includes("highmark") ||
    all.includes("health care service") ||
    all.includes("bcbs") ||
    all.includes("carefirst")
  )
    return "bcbs";
  if (all.includes("cigna")) return "cigna";
  if (all.includes("molina")) return "molina";
  if (all.includes("devoted")) return "devoted";
  if (all.includes("alignment")) return "alignment";
  if (all.includes("kaiser")) return "kaiser";
  if (all.includes("mutual of omaha")) return "mutual";
  return null;
}
function transformCmsPlan(row) {
  const cid = row["Contract ID"] || "";
  const pbp = String(row["Plan ID"] || "").padStart(3, "0");
  const planName = row["Plan Name"] || "Unknown Plan";
  const planType = row["Plan Type"] || "";
  const snpType = row["SNP Type"] || "";
  const catType = row["Contract Category Type"] || "";
  const parentOrg = row["Parent Organization Name"] || "";
  const contractName = row["Contract Name"] || "";
  const orgMarketing = row["Organization Marketing Name"] || "";
  let stars = null;
  const rawStars =
    row["Overall Star Rating"] || row["Part C Summary Star Rating"] || "";
  if (
    rawStars &&
    rawStars !== "Not enough data available" &&
    rawStars !== "Too new to rate"
  ) {
    stars = parseFloat(rawStars);
    if (isNaN(stars)) stars = null;
  }
  const partCPrem = parseFloat(row["Part C Premium"] || "0") || 0;
  const consolidatedPrem =
    parseFloat(row["Monthly Consolidated Premium (Part C + D)"] || "0") || 0;
  const prem = consolidatedPrem || partCPrem || 0;
  const moopRaw = row["In-Network Maximum Out-of-Pocket (MOOP) Amount"] || "";
  const moop = parseFloat(moopRaw.replace(/[$,]/g, "")) || null;
  let cat = "MA";
  if (catType === "PDP") cat = "PDP";
  else if (catType === "MA-PD" || catType === "SNP") cat = "MAPD";
  let snp = null;
  if (snpType === "Dual-Eligible") snp = "D-SNP";
  else if (snpType === "Chronic or Disabling Condition") snp = "C-SNP";
  else if (snpType === "Institutional") snp = "I-SNP";
  const carrier = mapCarrierKey(parentOrg, contractName, orgMarketing);
  return {
    cid,
    pbp,
    carrier,
    name: planName,
    type: planType || (cat === "PDP" ? "PDP" : "HMO"),
    cat,
    snp,
    stars,
    prem,
    moop,
    partD: catType === "MA-PD" || catType === "PDP" || catType === "SNP",
    dental: true,
    vision: true,
    hearing: true,
    otc: null,
    grocery: null,
    flex: null,
    transport: null,
    states: [row["State Territory Abbreviation"] || ""],
    orgName: orgMarketing || contractName || parentOrg,
    countyName: row["County Name"] || "",
  };
}
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
function getCarriersForZip(zip) {
  const state = getStateFromZip(zip);
  const allCarriers = Object.keys(CARRIERS);
  const kaiserStates = ["CA", "CO", "GA", "HI", "MD", "OR", "VA", "WA", "DC"];
  const alignmentStates = ["CA", "NC", "NV", "AZ", "TX"];
  return allCarriers
    .filter((key) => {
      if (key === "kaiser" && !kaiserStates.includes(state)) return false;
      if (key === "alignment" && !alignmentStates.includes(state)) return false;
      return true;
    })
    .map((key) => ({ key, ...CARRIERS[key] }));
}
function hasFiveStarPlans(zip) {
  const st = getStateFromZip(zip);
  return PLAN_DB.some(
    (p) => p.stars >= 5 && (p.states.includes("ALL") || p.states.includes(st))
  );
}
function daysRemaining(dateStr) {
  return Math.max(0, Math.ceil((new Date(dateStr) - new Date()) / 86400000));
}
function isActiveNow(s, e) {
  const now = new Date();
  if (s === "Year-round" || s === "Varies by individual") return true;
  return new Date(s) <= now && now <= new Date(e);
}

function getSEPsForZip(zip, femaDisasters = []) {
  const state = getStateFromZip(zip);
  const today = new Date();
  const seps = [];
  const zipPlans = getPlansForState(zip);
  const maPlans = (filter) => zipPlans.filter(filter);
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
              ? " Public Assistance only — Medicare SEP NOT yet active. Monitor for IA amendment."
              : `Enroll in or switch MA/MAPD plans.${
                  d.isOngoing
                    ? " Incident still active — SEP window remains open."
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
  const yr = today.getFullYear();
  if (isActiveNow(`${yr}-01-01`, `${yr}-03-31`)) {
    seps.push({
      id: `medicare-oep-${yr}`,
      category: "Medicare",
      type: "Medicare Advantage OEP",
      code: "OEP",
      event: `Annual MA Open Enrollment (Jan 1 – Mar 31, ${yr})`,
      description:
        "Currently enrolled MA beneficiaries can make ONE plan change: switch MA/MAPD plan, or drop MA and return to Original Medicare + PDP.",
      startDate: `${yr}-01-01`,
      endDate: `${yr}-03-31`,
      duration: "Jan 1 – Mar 31",
      eligibleProducts: ["MA", "MAPD"],
      source: "CMS",
      urgency: "medium",
      daysLeft: daysRemaining(`${yr}-03-31`),
      matchingPlans: maPlans((p) => ["MA", "MAPD"].includes(p.cat) && !p.snp),
    });
  }
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
  if (hasFiveStarPlans(zip) && isActiveNow(`${yr - 1}-12-08`, `${yr}-11-30`)) {
    seps.push({
      id: "medicare-5star",
      category: "Medicare",
      type: "5-Star Special Enrollment Period",
      code: "5-STAR",
      event: "5-Star rated plan available in this area",
      description:
        "CMS 5-star rated MA/MAPD plan available. Switch to a 5-star plan once per year.",
      startDate: `${yr - 1}-12-08`,
      endDate: `${yr}-11-30`,
      duration: "Dec 8 – Nov 30 (once/year)",
      eligibleProducts: ["MA", "MAPD"],
      source: "CMS Star Ratings",
      urgency: "low",
      daysLeft: daysRemaining(`${yr}-11-30`),
      matchingPlans: maPlans((p) => p.stars >= 5),
    });
  }
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
  seps.push({
    id: "medicare-institution",
    category: "Medicare",
    type: "Institutionalized / SNF SEP",
    code: "SEP-INST",
    event: "Move into/out of nursing facility or institution",
    description:
      "Continuous SEP while in institution + 2 months after discharge.",
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
          "Year-round enrollment in C-SNP plans for individuals with qualifying chronic conditions.",
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

// ═══════════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════════
const IconSearch = () => (
  <svg
    width="18"
    height="18"
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
    fill="#fbbf24"
    stroke="#fbbf24"
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

const Stars = ({ count }) =>
  count != null ? (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "1px" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width={11}
          height={11}
          viewBox="0 0 24 24"
          fill={i <= Math.floor(count) ? "#fbbf24" : "none"}
          stroke="#fbbf24"
          strokeWidth={1.5}
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
      {count % 1 !== 0 && (
        <span style={{ fontSize: "10px", color: "#fbbf24" }}>.5</span>
      )}
    </span>
  ) : (
    <span className="muted">—</span>
  );

function ProductBadge({ product }) {
  const cls =
    {
      MA: "ma",
      MAPD: "mapd",
      PDP: "pdp",
      Medigap: "medigap",
      "D-SNP": "dsnp",
      "I-SNP": "isnp",
      "C-SNP": "csnp",
    }[product] || "ma";
  return <span className={`sep-product-badge ${cls}`}>{product}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEP CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
function SEPCard({ sep, carriers, isExpanded, onToggle }) {
  const catCls = sep.category === "FEMA Disaster" ? "fema" : "medicare";
  const urgCls = sep.urgency || "info";
  const daysCls =
    sep.daysLeft != null
      ? sep.daysLeft <= 14
        ? "critical"
        : sep.daysLeft <= 30
        ? "warning"
        : "normal"
      : null;

  return (
    <div className={`sep-sep-card ${catCls} ${isExpanded ? "expanded" : ""}`}>
      <div className="sep-sep-header" onClick={onToggle}>
        <span style={{ color: "var(--text-muted)" }}>
          <IconChevron open={isExpanded} />
        </span>
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
            <span className={`sep-urgency-pill ${urgCls}`}>
              {
                {
                  high: "URGENT",
                  medium: "ACTIVE",
                  low: "OPEN",
                  info: "ONGOING",
                }[urgCls]
              }
            </span>
            <span className={`sep-category-pill ${catCls}`}>
              {sep.category}
            </span>
            {sep.code === "5-STAR" && <IconStar />}
            {daysCls && (
              <span className={`sep-days-pill ${daysCls}`}>
                {sep.daysLeft}d left
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: "15px",
              fontWeight: 700,
              color: "var(--text-primary)",
              lineHeight: 1.3,
            }}
          >
            {sep.type}
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "var(--text-secondary)",
              marginTop: "2px",
            }}
          >
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
            <span className="muted" style={{ padding: "2px 4px" }}>
              +{sep.eligibleProducts.length - 4}
            </span>
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="sep-sep-body">
          <p>{sep.description}</p>
          <div className="sep-info-grid">
            <div className="sep-info-box">
              <div className="sep-info-box-label">
                <IconClock /> Enrollment Window
              </div>
              <div className="sep-info-box-main">{sep.duration}</div>
              {sep.startDate !== "Year-round" &&
                sep.startDate !== "Varies by individual" && (
                  <div className="sep-info-box-sub">
                    {sep.startDate} → {sep.endDate}
                  </div>
                )}
            </div>
            <div className="sep-info-box">
              <div className="sep-info-box-label">
                <IconShield /> Eligible Products
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "2px",
                  marginTop: "4px",
                }}
              >
                {sep.eligibleProducts.map((p) => (
                  <ProductBadge key={p} product={p} />
                ))}
              </div>
            </div>
            <div className="sep-info-box">
              <div className="sep-info-box-label">Source</div>
              <div className="sep-info-box-main">{sep.source}</div>
              <div className="sep-info-box-sub">Code: {sep.code}</div>
            </div>
          </div>
          {sep.counties && (
            <div className="sep-info-box" style={{ marginBottom: "18px" }}>
              <div className="sep-info-box-label">
                <IconMap /> Affected Counties
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                {sep.counties.join("  •  ")}
              </div>
            </div>
          )}
          {sep.matchingPlans && sep.matchingPlans.length > 0 && (
            <div className="sep-info-box">
              <div className="sep-info-box-label">
                Eligible Plans Under This SEP ({sep.matchingPlans.length})
              </div>
              <div style={{ overflowX: "auto", marginTop: "8px" }}>
                <table className="sep-sub-table">
                  <thead>
                    <tr>
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
                            textAlign:
                              h === "Premium" || h === "MOOP"
                                ? "right"
                                : "left",
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
                      return (
                        <tr key={`${p.cid}-${p.pbp}-${i}`}>
                          <td className="nowrap">
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  backgroundColor: cr.color || "#666",
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: "var(--text-primary)",
                                }}
                              >
                                {cr.abbr}
                              </span>
                            </span>
                          </td>
                          <td
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: "var(--text-secondary)",
                              maxWidth: 200,
                            }}
                          >
                            {p.name}
                          </td>
                          <td
                            className="mono"
                            style={{ fontSize: 10, color: "var(--text-muted)" }}
                          >
                            {p.cid}-{p.pbp}
                          </td>
                          <td>
                            <span className="sep-type-badge">{p.type}</span>
                            {p.snp && (
                              <span className="sep-snp-badge">{p.snp}</span>
                            )}
                          </td>
                          <td>
                            <Stars count={p.stars} />
                          </td>
                          <td
                            className="text-right"
                            style={{
                              fontWeight: 700,
                              color:
                                p.prem === 0
                                  ? "var(--accent-green)"
                                  : "var(--text-primary)",
                              fontSize: 11,
                            }}
                          >
                            {p.prem === 0 ? "$0" : `$${p.prem.toFixed(2)}`}
                          </td>
                          <td
                            className="text-right"
                            style={{
                              fontWeight: 600,
                              color: "var(--text-secondary)",
                              fontSize: 11,
                            }}
                          >
                            {p.moop ? `$${p.moop.toLocaleString()}` : "—"}
                          </td>
                          <td
                            className="text-center"
                            style={{
                              fontSize: 10,
                              color: p.grocery
                                ? "var(--accent-green)"
                                : "var(--text-muted)",
                              fontWeight: 600,
                            }}
                          >
                            {p.grocery || "—"}
                          </td>
                          <td
                            className="text-center"
                            style={{
                              fontSize: 10,
                              color: p.otc
                                ? "var(--accent-gold)"
                                : "var(--text-muted)",
                              fontWeight: 600,
                            }}
                          >
                            {p.otc || "—"}
                          </td>
                          <td
                            className="text-center"
                            style={{
                              fontSize: 10,
                              color: p.flex
                                ? "var(--accent-teal)"
                                : "var(--text-muted)",
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
              className="sep-info-box"
              style={{ color: "var(--text-muted)", fontSize: 13 }}
            >
              No matching plans found in this zip for this SEP type.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP COMPONENT — uses CSS classes from styles.css + SEPLookupTool.css
// ═══════════════════════════════════════════════════════════════════════════════
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
  const [plans, setPlans] = useState(null);
  const [activeTab, setActiveTab] = useState("plans");
  const [expandedPlans, setExpandedPlans] = useState({});
  const [planFilterCarrier, setPlanFilterCarrier] = useState("all");
  const [planFilterType, setPlanFilterType] = useState("all");
  const [planFilterSnp, setPlanFilterSnp] = useState("all");
  const [planSearch, setPlanSearch] = useState("");
  const [selectedCounty, setSelectedCounty] = useState(null);
  const [countyList, setCountyList] = useState([]);
  const [countyLoading, setCountyLoading] = useState(false);
  const femaCache = useRef({ data: null, fetchedAt: 0 });

  const loadPlansForCounty = useCallback(async (st, county) => {
    if (!st || !county) return;
    setCountyLoading(true);
    try {
      const cmsRows = await fetchPlansFromSupabase(st, county);
      const seen = new Set();
      const transformed = [];
      for (const row of cmsRows) {
        const key = `${row["Contract ID"]}-${row["Plan ID"]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        transformed.push(transformCmsPlan(row));
      }
      transformed.sort((a, b) => {
        if ((b.stars || 0) !== (a.stars || 0))
          return (b.stars || 0) - (a.stars || 0);
        if (a.prem !== b.prem) return a.prem - b.prem;
        return a.name.localeCompare(b.name);
      });
      setPlans(transformed);
    } catch (err) {
      console.error("Supabase plan fetch error:", err);
      setPlans(getPlansForState(st));
    } finally {
      setCountyLoading(false);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    const cleanZip = zip.trim();
    if (!/^\d{5}$/.test(cleanZip)) return;
    setLoading(true);
    try {
      let femaData = femaCache.current.data;
      const now = Date.now();
      if (!femaData || now - femaCache.current.fetchedAt > 30 * 60 * 1000) {
        const r = await fetchLiveFemaDisasters();
        femaData = r.disasters;
        femaCache.current = {
          data: femaData,
          fetchedAt: now,
          apiFailed: r.apiFailed,
        };
      }
      const st = getStateFromZip(cleanZip);
      const seps = getSEPsForZip(cleanZip, femaData);
      const zipCarriers = getCarriersForZip(cleanZip);
      setResults(seps);
      setCarriers(zipCarriers);
      setSearchedZip(cleanZip);
      setExpanded({});
      setExpandedPlans({});
      setFilterCategory("all");
      setFilterProduct("all");
      setPlanFilterCarrier("all");
      setPlanFilterType("all");
      setPlanFilterSnp("all");
      setPlanSearch("");
      const autoCounty = getCountyFromZip(cleanZip);
      const counties = await fetchCountiesForState(st);
      setCountyList(counties);
      if (autoCounty && counties.includes(autoCounty)) {
        setSelectedCounty(autoCounty);
        await loadPlansForCounty(st, autoCounty);
      } else if (counties.length > 0) {
        setSelectedCounty(null);
        setPlans([]);
      } else {
        setSelectedCounty(null);
        setPlans(getPlansForState(cleanZip));
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  }, [zip, loadPlansForCounty]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };
  const isValidZip = /^\d{5}$/.test(zip.trim());
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
    <div className="app-shell sep-tool">
      <div className="viewport-bg" />
      <div className="app sep-tool-inner">
        {/* ── Header ── */}
        <div className="sep-header">
          <div className="sep-header-icon">
            <IconShield />
          </div>
          <div>
            <h1>SEP Lookup Tool</h1>
            <p>Medicare Advantage Plans & Active SEPs — Live Data</p>
          </div>
        </div>

        {/* ── Search ── */}
        <div className="card sep-search-bar">
          <input
            ref={inputRef}
            type="text"
            value={zip}
            onChange={(e) =>
              setZip(e.target.value.replace(/\D/g, "").slice(0, 5))
            }
            onKeyDown={handleKeyDown}
            placeholder="Enter 5-digit zip code..."
          />
          <button
            className="primary"
            onClick={handleSearch}
            disabled={!isValidZip || loading}
          >
            {loading ? <span className="sep-spinner-sm" /> : <IconSearch />}{" "}
            Search
          </button>
        </div>

        {!results && !loading && (
          <div className="sep-quick-zips">
            <span>Try:</span>
            {["33601", "77002", "28801", "40502", "90001"].map((z) => (
              <button
                key={z}
                className="sep-quick-zip-btn"
                onClick={() => setZip(z)}
              >
                {z}
              </button>
            ))}
          </div>
        )}

        {/* ═══ RESULTS ═══ */}
        {results && !loading && (
          <div style={{ marginTop: 24 }}>
            {/* Stats */}
            <div className="sep-stats-grid">
              <div className="sep-stat-box">
                <div className="sep-stat-label">Zip Code</div>
                <div
                  className="sep-stat-value"
                  style={{ color: "var(--text-primary)" }}
                >
                  {searchedZip}{" "}
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                    }}
                  >
                    ({state}){selectedCounty ? ` — ${selectedCounty} Co.` : ""}
                  </span>
                </div>
              </div>
              {[
                {
                  l: "SEPs",
                  v: filtered?.length || 0,
                  c: "var(--accent-cyan)",
                },
                { l: "Plans", v: plans?.length || 0, c: "var(--accent-teal)" },
                {
                  l: "FEMA",
                  v: femaActive.length > 0 ? femaActive.length : "—",
                  c:
                    femaActive.length > 0
                      ? "var(--accent-red)"
                      : "var(--text-muted)",
                  a: femaActive.length > 0,
                },
                { l: "Carriers", v: carriers.length, c: "var(--accent-gold)" },
              ].map((s, i) => (
                <div
                  key={i}
                  className={`sep-stat-box${s.a ? " alert" : ""}`}
                  style={{ textAlign: "center", minWidth: 80 }}
                >
                  <div className="sep-stat-label">
                    {s.a && <IconAlert />} {s.l}
                  </div>
                  <div className="sep-stat-value" style={{ color: s.c }}>
                    {s.v}
                  </div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="tabs">
              {[
                ["plans", `Plans & Codes (${filteredPlans.length})`],
                ["seps", `SEPs (${filtered?.length || 0})`],
              ].map(([k, l]) => (
                <button
                  key={k}
                  className={`tab${activeTab === k ? " active" : ""}`}
                  onClick={() => setActiveTab(k)}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* ════ PLANS TAB ════ */}
            {activeTab === "plans" && (
              <>
                {countyList.length > 0 && (
                  <div
                    className={`card sep-county-card ${
                      selectedCounty ? "active" : "pending"
                    }`}
                  >
                    <div className="sep-county-label">
                      <IconMap />
                      <span>County</span>
                    </div>
                    <select
                      value={selectedCounty || ""}
                      onChange={async (e) => {
                        const c = e.target.value;
                        if (!c) return;
                        setSelectedCounty(c);
                        await loadPlansForCounty(
                          getStateFromZip(searchedZip),
                          c
                        );
                      }}
                    >
                      {!selectedCounty && (
                        <option value="">
                          — Select your county ({countyList.length} available) —
                        </option>
                      )}
                      {countyList.map((c) => (
                        <option key={c} value={c}>
                          {c} County
                        </option>
                      ))}
                    </select>
                    {countyLoading && <span className="sep-spinner-sm" />}
                    {selectedCounty && plans && (
                      <span className="sep-county-count">
                        {plans.length} plans
                      </span>
                    )}
                  </div>
                )}
                {!selectedCounty && countyList.length > 0 && (
                  <div className="card sep-county-notice">
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--accent-gold)",
                        marginBottom: 4,
                      }}
                    >
                      Select a county above to load plans from CMS database
                    </div>
                    <div
                      className="muted"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      Medicare plan availability is county-specific. The CMS
                      database has {countyList.length} counties for {state}.
                    </div>
                  </div>
                )}
                {/* Filters */}
                <div className="card sep-filter-bar">
                  <span className="sep-filter-label">
                    <IconFilter /> Filter
                  </span>
                  <select
                    value={planFilterCarrier}
                    onChange={(e) => setPlanFilterCarrier(e.target.value)}
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
                  >
                    <option value="all">All Plans</option>
                    <option value="D-SNP">D-SNP Only</option>
                    <option value="C-SNP">C-SNP Only</option>
                    <option value="none">Non-SNP Only</option>
                  </select>
                  <input
                    type="text"
                    className="input-dark"
                    value={planSearch}
                    onChange={(e) => setPlanSearch(e.target.value)}
                    placeholder="Search plans or contract ID..."
                    style={{ flex: "1 1 160px", minWidth: 120 }}
                  />
                  {(planFilterCarrier !== "all" ||
                    planFilterType !== "all" ||
                    planFilterSnp !== "all" ||
                    planSearch) && (
                    <button
                      className="undo-btn"
                      onClick={() => {
                        setPlanFilterCarrier("all");
                        setPlanFilterType("all");
                        setPlanFilterSnp("all");
                        setPlanSearch("");
                      }}
                    >
                      <IconX /> Clear
                    </button>
                  )}
                </div>
                {/* Table */}
                <div className="card sep-plan-table-wrap">
                  <div className="sep-plan-table-scroll">
                    <table className="sep-plan-table">
                      <thead>
                        <tr>
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
                            return (
                              <React.Fragment key={pKey + idx}>
                                <tr
                                  className={isOpen ? "expanded" : ""}
                                  onClick={() =>
                                    setExpandedPlans((prev) => ({
                                      ...prev,
                                      [pKey]: !prev[pKey],
                                    }))
                                  }
                                >
                                  <td className="nowrap">
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 6,
                                      }}
                                    >
                                      <span
                                        style={{
                                          width: 8,
                                          height: 8,
                                          borderRadius: "50%",
                                          backgroundColor: c.color || "#666",
                                          flexShrink: 0,
                                        }}
                                      />
                                      <span
                                        style={{
                                          fontSize: 12,
                                          fontWeight: 700,
                                          color: "var(--text-primary)",
                                        }}
                                      >
                                        {c.abbr || p.carrier}
                                      </span>
                                    </span>
                                  </td>
                                  <td>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: "var(--text-primary)",
                                        lineHeight: 1.3,
                                      }}
                                    >
                                      {p.name}
                                    </div>
                                    <div
                                      className="mono"
                                      style={{
                                        fontSize: 11,
                                        color: "var(--text-muted)",
                                        marginTop: 2,
                                      }}
                                    >
                                      {p.cid}-{p.pbp}
                                    </div>
                                  </td>
                                  <td>
                                    <span className="sep-type-badge">
                                      {p.type}
                                    </span>
                                    {p.snp && (
                                      <span className="sep-snp-badge">
                                        {p.snp}
                                      </span>
                                    )}
                                  </td>
                                  <td className="text-center">
                                    <Stars count={p.stars} />
                                  </td>
                                  <td
                                    className="text-right mono"
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 700,
                                      color:
                                        p.prem === 0
                                          ? "var(--accent-green)"
                                          : "var(--text-primary)",
                                    }}
                                  >
                                    {p.prem === 0
                                      ? "$0"
                                      : `$${p.prem.toFixed(2)}`}
                                  </td>
                                  <td
                                    className="text-right mono"
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 600,
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    {p.moop
                                      ? `$${p.moop.toLocaleString()}`
                                      : "—"}
                                  </td>
                                  <td
                                    className="text-center"
                                    style={{
                                      color: p.grocery
                                        ? "var(--accent-green)"
                                        : "var(--text-muted)",
                                      fontSize: 12,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {p.grocery || "—"}
                                  </td>
                                  <td
                                    className="text-center"
                                    style={{
                                      color: p.otc
                                        ? "var(--accent-gold)"
                                        : "var(--text-muted)",
                                      fontSize: 12,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {p.otc || "—"}
                                  </td>
                                  <td
                                    className="text-center"
                                    style={{
                                      color: p.flex
                                        ? "var(--accent-teal)"
                                        : "var(--text-muted)",
                                      fontSize: 12,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {p.flex || "—"}
                                  </td>
                                  <td
                                    className="text-center"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    <IconChevron open={isOpen} />
                                  </td>
                                </tr>
                                {isOpen && (
                                  <tr>
                                    <td
                                      colSpan={10}
                                      className="sep-plan-detail"
                                    >
                                      <div className="sep-plan-benefits">
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
                                              className="sep-benefit-pill"
                                            >
                                              {lbl}:{" "}
                                              <span>
                                                {typeof val === "boolean"
                                                  ? "✓"
                                                  : val}
                                              </span>
                                            </span>
                                          ) : null
                                        )}
                                      </div>
                                      <div className="sep-plan-ids">
                                        {[
                                          ["Contract ID", p.cid, true],
                                          ["PBP", p.pbp, true],
                                          ["Category", p.cat, false],
                                          ...(p.snp
                                            ? [["SNP Type", p.snp, false]]
                                            : []),
                                        ].map(([lbl, val, isMono]) => (
                                          <div
                                            key={lbl}
                                            className="sep-plan-id-box"
                                          >
                                            <div className="sep-plan-id-label">
                                              {lbl}
                                            </div>
                                            <div
                                              className={`sep-plan-id-value${
                                                isMono ? " mono" : ""
                                              }`}
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
                              className="text-center muted"
                              style={{ padding: 40, fontSize: 14 }}
                            >
                              No plans match filters
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ════ SEPS TAB ════ */}
            {activeTab === "seps" && (
              <>
                <div className="card sep-filter-bar">
                  <span className="sep-filter-label">
                    <IconFilter /> Filter
                  </span>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
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
                      className="undo-btn"
                      onClick={() => {
                        setFilterCategory("all");
                        setFilterProduct("all");
                      }}
                    >
                      <IconX /> Clear
                    </button>
                  )}
                </div>
                {femaActive.length > 0 && (
                  <div className="card sep-fema-alert">
                    <div
                      style={{
                        color: "var(--accent-red)",
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      <IconAlert />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          marginBottom: 4,
                        }}
                      >
                        Active FEMA Disaster Declaration
                        {femaActive.length > 1 ? "s" : ""} in This Area
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--text-secondary)",
                          lineHeight: 1.5,
                        }}
                      >
                        {femaActive.map((f) => f.event).join("; ")} — 60-day SEP
                        applies for affected beneficiaries.
                      </div>
                    </div>
                  </div>
                )}
                <div className="flow">
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
                      className="text-center muted"
                      style={{ padding: "48px 24px" }}
                    >
                      <div style={{ fontSize: 16, fontWeight: 600 }}>
                        No SEPs match current filters
                      </div>
                      <div style={{ fontSize: 13, marginTop: 8 }}>
                        Try adjusting filters above.
                      </div>
                    </div>
                  )}
                </div>
                {/* Carriers */}
                <div className="card" style={{ marginTop: 28 }}>
                  <h2>
                    Carriers in {searchedZip} ({state})
                  </h2>
                  <div className="sep-carrier-grid">
                    {carriers.map((c) => (
                      <div
                        key={c.key}
                        className="sep-carrier-item"
                        style={{ borderColor: `${c.color}30` }}
                      >
                        <div
                          className="sep-carrier-stripe"
                          style={{ background: c.color }}
                        />
                        <div className="sep-carrier-name">{c.abbr}</div>
                        <div className="sep-carrier-full-name">{c.name}</div>
                        <div
                          style={{ display: "flex", flexWrap: "wrap", gap: 2 }}
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

            {/* Disclaimer */}
            <div className="sep-disclaimer">
              <p>
                <strong>Disclaimer:</strong> FEMA disaster data is fetched live
                from the OpenFEMA API with verified fallback data. Plan data is
                sourced from CMS Landscape Files for CY2026 (138K rows via
                Supabase, county-level precision). Premiums, benefits, and
                service areas may vary — always verify on Medicare.gov. For
                agent/broker use only.
              </p>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="sep-loading">
            <div className="sep-spinner" />
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-secondary)",
              }}
            >
              Scanning sources for {zip}...
            </div>
            <div
              className="muted mono"
              style={{ marginTop: 4, letterSpacing: "0.06em" }}
            >
              FEMA • CMS • Medicare.gov • Carrier Networks
            </div>
          </div>
        )}

        {/* Empty */}
        {!results && !loading && (
          <div className="sep-empty">
            <div
              style={{
                fontSize: 48,
                marginBottom: 16,
                opacity: 0.3,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <IconSearch />
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-secondary)",
                marginBottom: 8,
              }}
            >
              Enter a zip code to begin
            </div>
            <div
              className="muted"
              style={{ maxWidth: 460, margin: "0 auto", lineHeight: 1.6 }}
            >
              Search any 5-digit zip code to see all active Special Enrollment
              Periods, FEMA disaster declarations, and available carriers in the
              area.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
