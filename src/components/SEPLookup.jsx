import { useState, useEffect, useCallback, useRef } from "react";

// ─── DATA LAYER ────────────────────────────────────────────────────────────────
// Simulated data sources that mirror real API structures from FEMA, CMS, carriers

const FEMA_DISASTERS = [
  {
    id: "DR-4856",
    title: "Hurricane Helene",
    type: "Hurricane",
    state: "NC",
    counties: [
      "Buncombe",
      "Henderson",
      "McDowell",
      "Rutherford",
      "Yancey",
      "Mitchell",
      "Avery",
      "Watauga",
      "Ashe",
      "Caldwell",
    ],
    declaredDate: "2024-09-28",
    sepEndDate: "2025-03-28",
    zips: [
      "28801",
      "28806",
      "28803",
      "28804",
      "28805",
      "28715",
      "28791",
      "28792",
      "28752",
      "28139",
      "28167",
      "28714",
      "28753",
      "28777",
      "28705",
      "28740",
      "28604",
      "28607",
      "28679",
      "28611",
      "28645",
    ],
  },
  {
    id: "DR-4867",
    title: "Hurricane Milton",
    type: "Hurricane",
    state: "FL",
    counties: [
      "Hillsborough",
      "Pinellas",
      "Manatee",
      "Sarasota",
      "Polk",
      "Hardee",
      "Volusia",
      "Brevard",
      "St. Lucie",
      "Indian River",
    ],
    declaredDate: "2024-10-09",
    sepEndDate: "2025-04-09",
    zips: [
      "33601",
      "33602",
      "33603",
      "33604",
      "33605",
      "33606",
      "33607",
      "33609",
      "33610",
      "33611",
      "33612",
      "33613",
      "33614",
      "33615",
      "33616",
      "33617",
      "33701",
      "33702",
      "33703",
      "33704",
      "33705",
      "33706",
      "33707",
      "33710",
      "34201",
      "34202",
      "34203",
      "34205",
      "34207",
      "34208",
      "34209",
      "34210",
      "34211",
      "34212",
      "34228",
      "34229",
      "34230",
      "34231",
      "34232",
      "34233",
      "34234",
      "34235",
      "34236",
      "34237",
      "34238",
      "34239",
      "34240",
      "34241",
      "34242",
      "33801",
      "33803",
      "33805",
      "33809",
      "33810",
      "33811",
      "33813",
      "33815",
      "33823",
      "33825",
      "33827",
      "33830",
      "33834",
      "33837",
      "33838",
      "33839",
      "33841",
      "33843",
      "33844",
      "33849",
      "33850",
      "33853",
      "33855",
      "33859",
      "33860",
      "33863",
      "33868",
      "33870",
      "33873",
      "33875",
      "33876",
      "33877",
      "33880",
      "33881",
      "33884",
      "32114",
      "32117",
      "32118",
      "32119",
      "32124",
      "32127",
      "32128",
      "32129",
      "32130",
      "32132",
      "32141",
      "32168",
      "32169",
      "32170",
      "32174",
      "32176",
      "32180",
      "32190",
      "32901",
      "32903",
      "32904",
      "32905",
      "32907",
      "32908",
      "32909",
      "32920",
      "32922",
      "32926",
      "32927",
      "32931",
      "32934",
      "32935",
      "32937",
      "32940",
      "32950",
      "32951",
      "32952",
      "32953",
      "32955",
      "32976",
      "34945",
      "34946",
      "34947",
      "34949",
      "34950",
      "34951",
      "34952",
      "34953",
      "34957",
      "34981",
      "34982",
      "34983",
      "34984",
      "34986",
      "34987",
      "34988",
      "32958",
      "32960",
      "32962",
      "32963",
      "32966",
      "32967",
      "32968",
    ],
  },
  {
    id: "DR-4891",
    title: "Severe Storms & Flooding",
    type: "Severe Storm",
    state: "TX",
    counties: [
      "Harris",
      "Fort Bend",
      "Galveston",
      "Brazoria",
      "Montgomery",
      "Liberty",
      "Chambers",
      "Jefferson",
      "Orange",
    ],
    declaredDate: "2025-01-15",
    sepEndDate: "2025-07-15",
    zips: [
      "77001",
      "77002",
      "77003",
      "77004",
      "77005",
      "77006",
      "77007",
      "77008",
      "77009",
      "77010",
      "77011",
      "77012",
      "77013",
      "77014",
      "77015",
      "77016",
      "77017",
      "77018",
      "77019",
      "77020",
      "77021",
      "77022",
      "77023",
      "77024",
      "77025",
      "77026",
      "77027",
      "77028",
      "77029",
      "77030",
      "77031",
      "77032",
      "77033",
      "77034",
      "77035",
      "77036",
      "77037",
      "77038",
      "77039",
      "77040",
      "77041",
      "77042",
      "77043",
      "77044",
      "77045",
      "77046",
      "77047",
      "77048",
      "77049",
      "77050",
      "77051",
      "77053",
      "77054",
      "77055",
      "77056",
      "77057",
      "77058",
      "77059",
      "77060",
      "77061",
      "77062",
      "77063",
      "77064",
      "77065",
      "77066",
      "77067",
      "77068",
      "77069",
      "77070",
      "77071",
      "77072",
      "77073",
      "77074",
      "77075",
      "77076",
      "77077",
      "77078",
      "77079",
      "77080",
      "77081",
      "77082",
      "77083",
      "77084",
      "77085",
      "77086",
      "77087",
      "77088",
      "77089",
      "77090",
      "77091",
      "77092",
      "77093",
      "77094",
      "77095",
      "77096",
      "77098",
      "77099",
      "77406",
      "77407",
      "77441",
      "77450",
      "77459",
      "77461",
      "77469",
      "77471",
      "77477",
      "77478",
      "77479",
      "77489",
      "77494",
      "77498",
      "77510",
      "77511",
      "77517",
      "77518",
      "77520",
      "77521",
      "77523",
      "77530",
      "77531",
      "77534",
      "77536",
      "77539",
      "77546",
      "77547",
      "77550",
      "77551",
      "77554",
      "77563",
      "77565",
      "77568",
      "77571",
      "77573",
      "77581",
      "77583",
      "77584",
      "77586",
      "77587",
      "77590",
      "77591",
      "77592",
      "77301",
      "77302",
      "77303",
      "77304",
      "77306",
      "77316",
      "77318",
      "77328",
      "77339",
      "77354",
      "77356",
      "77362",
      "77365",
      "77373",
      "77375",
      "77378",
      "77380",
      "77381",
      "77382",
      "77384",
      "77385",
      "77386",
      "77388",
      "77389",
    ],
  },
  {
    id: "DR-4900",
    title: "Severe Winter Storm",
    type: "Winter Storm",
    state: "KY",
    counties: [
      "Jefferson",
      "Fayette",
      "Kenton",
      "Boone",
      "Campbell",
      "Warren",
      "Hardin",
      "Daviess",
      "Madison",
      "Pike",
    ],
    declaredDate: "2025-02-01",
    sepEndDate: "2025-08-01",
    zips: [
      "40201",
      "40202",
      "40203",
      "40204",
      "40205",
      "40206",
      "40207",
      "40208",
      "40209",
      "40210",
      "40211",
      "40212",
      "40213",
      "40214",
      "40215",
      "40216",
      "40217",
      "40218",
      "40219",
      "40220",
      "40222",
      "40223",
      "40228",
      "40229",
      "40231",
      "40232",
      "40233",
      "40241",
      "40242",
      "40243",
      "40245",
      "40258",
      "40259",
      "40261",
      "40266",
      "40268",
      "40269",
      "40270",
      "40272",
      "40280",
      "40281",
      "40282",
      "40283",
      "40285",
      "40287",
      "40289",
      "40290",
      "40291",
      "40292",
      "40293",
      "40294",
      "40295",
      "40296",
      "40297",
      "40298",
      "40299",
      "40502",
      "40503",
      "40504",
      "40505",
      "40506",
      "40507",
      "40508",
      "40509",
      "40510",
      "40511",
      "40512",
      "40513",
      "40514",
      "40515",
      "40516",
      "40517",
      "41011",
      "41012",
      "41014",
      "41015",
      "41016",
      "41017",
      "41018",
      "41042",
      "41048",
      "41051",
      "41059",
      "41071",
      "41073",
      "41074",
      "41075",
      "41076",
      "41080",
      "41085",
      "41091",
      "41094",
      "41005",
      "41006",
      "41007",
      "41022",
      "41033",
      "41042",
      "41048",
      "41080",
      "41094",
      "42101",
      "42103",
      "42104",
    ],
  },
];

const CARRIERS = {
  uhc: {
    name: "UnitedHealthcare",
    abbr: "UHC",
    color: "#002677",
    products: ["MA", "MAPD", "PDP", "Medigap", "ACA"],
    website: "uhc.com",
  },
  aetna: {
    name: "Aetna (CVS Health)",
    abbr: "Aetna",
    color: "#7D3F98",
    products: ["MA", "MAPD", "PDP", "Medigap", "ACA"],
    website: "aetna.com",
  },
  bcbs: {
    name: "Blue Cross Blue Shield",
    abbr: "BCBS",
    color: "#0079C1",
    products: ["MA", "MAPD", "PDP", "Medigap", "ACA"],
    website: "bcbs.com",
  },
  cigna: {
    name: "Cigna Healthcare",
    abbr: "Cigna",
    color: "#E57200",
    products: ["MA", "MAPD", "PDP", "ACA"],
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
    products: ["MA", "MAPD", "ACA"],
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
    products: ["MA", "MAPD", "ACA"],
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

// Check for 5-star plans in a zip (simulated — real data from CMS star ratings)
function hasFiveStarPlans(zip) {
  const fiveStarZips = [
    "33601",
    "33602",
    "33603",
    "33604",
    "33605",
    "33701",
    "33702",
    "33703",
    "40502",
    "40503",
    "40504",
    "40505",
    "77001",
    "77002",
    "77003",
    "77004",
    "77005",
    "90001",
    "90002",
    "90003",
    "90004",
    "90005",
    "10001",
    "10002",
    "10003",
    "10004",
    "10005",
    "28801",
    "28803",
    "28805",
    "60601",
    "60602",
    "60603",
    "60604",
    "60605",
  ];
  return fiveStarZips.includes(zip);
}

// Build all SEPs for a given zip
function getSEPsForZip(zip) {
  const state = getStateFromZip(zip);
  const today = new Date("2025-02-17");
  const seps = [];

  // 1. FEMA Disaster SEPs
  FEMA_DISASTERS.forEach((d) => {
    if (d.zips.includes(zip) && new Date(d.sepEndDate) > today) {
      seps.push({
        id: `fema-${d.id}`,
        category: "FEMA Disaster",
        type: "FEMA Disaster SEP",
        code: "SEP-FEMA",
        event: d.title,
        description: `Federal disaster declaration ${d.id} — ${d.type} in ${
          d.state
        }. Affected counties: ${d.counties.join(", ")}.`,
        startDate: d.declaredDate,
        endDate: d.sepEndDate,
        duration: "60 days from declaration",
        eligibleProducts: ["MA", "MAPD", "PDP", "ACA"],
        source: "FEMA",
        urgency:
          new Date(d.sepEndDate) - today < 30 * 86400000 ? "high" : "medium",
        counties: d.counties,
      });
    }
  });

  // 2. Medicare OEP (Jan 1 - Mar 31)
  seps.push({
    id: "medicare-oep-2025",
    category: "Medicare",
    type: "Medicare Advantage Open Enrollment Period (MA OEP)",
    code: "OEP",
    event: "Annual Medicare Advantage OEP",
    description:
      "Beneficiaries already enrolled in a Medicare Advantage plan can switch to a different MA/MAPD plan or return to Original Medicare + standalone PDP. One plan change allowed.",
    startDate: "2025-01-01",
    endDate: "2025-03-31",
    duration: "Jan 1 – Mar 31 annually",
    eligibleProducts: ["MA", "MAPD", "PDP"],
    source: "CMS",
    urgency: "medium",
  });

  // 3. ICEP (Initial Coverage Election Period)
  seps.push({
    id: "medicare-icep",
    category: "Medicare",
    type: "Initial Coverage Election Period (ICEP)",
    code: "ICEP",
    event: "Turning 65 / New to Medicare",
    description:
      "Individuals first eligible for Medicare. Begins 3 months before the month they turn 65, includes their birthday month, and extends 3 months after. Can enroll in MA, MAPD, PDP, or Medigap.",
    startDate: "Varies by individual",
    endDate: "Varies by individual",
    duration: "7-month window around 65th birthday",
    eligibleProducts: ["MA", "MAPD", "PDP", "Medigap"],
    source: "CMS",
    urgency: "info",
  });

  // 4. IEP (Initial Enrollment Period) — Part B
  seps.push({
    id: "medicare-iep",
    category: "Medicare",
    type: "Initial Enrollment Period (IEP)",
    code: "IEP",
    event: "First eligible for Medicare Part A/B",
    description:
      "7-month period around 65th birthday (or 25th month of disability) to enroll in Part A and/or Part B. Late enrollment may result in penalties.",
    startDate: "Varies by individual",
    endDate: "Varies by individual",
    duration: "7-month window",
    eligibleProducts: ["MA", "MAPD", "PDP", "Medigap"],
    source: "CMS",
    urgency: "info",
  });

  // 5. 5-Star Plan SEP
  if (hasFiveStarPlans(zip)) {
    seps.push({
      id: "medicare-5star",
      category: "Medicare",
      type: "5-Star Special Enrollment Period",
      code: "5-STAR",
      event: "5-Star rated plan available in service area",
      description:
        "A CMS 5-star rated Medicare Advantage or PDP plan is available in this zip code. Beneficiaries can enroll once per year between Dec 8 – Nov 30.",
      startDate: "2024-12-08",
      endDate: "2025-11-30",
      duration: "Dec 8 – Nov 30 (once per year)",
      eligibleProducts: ["MA", "MAPD", "PDP"],
      source: "CMS Star Ratings",
      urgency: "low",
    });
  }

  // 6. Dual-Eligible / LIS SEP
  seps.push({
    id: "medicare-dual-lis",
    category: "Medicare",
    type: "Dual-Eligible / LIS (Extra Help) SEP",
    code: "DUAL/LIS",
    event: "Dual-eligible or Low Income Subsidy recipient",
    description:
      "Individuals who are dual-eligible (Medicare + Medicaid) or receive Extra Help/LIS can change plans once per quarter (Jan–Mar, Apr–Jun, Jul–Sep). Continuous SEP year-round.",
    startDate: "Year-round",
    endDate: "Year-round",
    duration: "Continuous — once per quarter",
    eligibleProducts: ["MA", "MAPD", "PDP", "D-SNP"],
    source: "CMS",
    urgency: "info",
  });

  // 7. Moved out of service area
  seps.push({
    id: "medicare-move",
    category: "Medicare",
    type: "Moved Out of Service Area SEP",
    code: "SEP-MOVE",
    event: "Permanent move out of plan service area",
    description:
      "Beneficiary permanently moved and their current plan is no longer available. 63-day SEP to select a new plan in the new service area.",
    startDate: "Varies by individual",
    endDate: "63 days from move date",
    duration: "63 days from move",
    eligibleProducts: ["MA", "MAPD", "PDP", "Medigap"],
    source: "CMS",
    urgency: "info",
  });

  // 8. Loss of creditable coverage
  seps.push({
    id: "medicare-loss-coverage",
    category: "Medicare",
    type: "Loss of Creditable Coverage SEP",
    code: "SEP-LOSS",
    event: "Involuntary loss of employer/union coverage",
    description:
      "Lost creditable coverage through no fault of their own (employer coverage ended, moved, plan left area, etc.). 63-day SEP to enroll.",
    startDate: "Varies by individual",
    endDate: "63 days from loss",
    duration: "63 days from loss of coverage",
    eligibleProducts: ["MA", "MAPD", "PDP", "Medigap"],
    source: "CMS",
    urgency: "info",
  });

  // 9. Institutionalized (SNF) SEP
  seps.push({
    id: "medicare-institution",
    category: "Medicare",
    type: "Institutionalized / SNF SEP",
    code: "SEP-INST",
    event: "Move into/out of institution (nursing facility, etc.)",
    description:
      "Continuous SEP for individuals who move into, reside in, or move out of an institution (SNF, nursing home, etc.). Can change plans at any time.",
    startDate: "Year-round",
    endDate: "Year-round",
    duration: "Continuous while institutionalized + 2 months after",
    eligibleProducts: ["MA", "MAPD", "PDP", "I-SNP"],
    source: "CMS",
    urgency: "info",
  });

  // 10. Chronic Condition SNP SEP
  seps.push({
    id: "medicare-csnp",
    category: "Medicare",
    type: "Chronic Condition SNP (C-SNP) SEP",
    code: "SEP-CSNP",
    event: "Diagnosed with qualifying chronic condition",
    description:
      "Individuals diagnosed with a severe or disabling chronic condition (diabetes, ESRD, heart failure, chronic lung disorders, etc.) may enroll in a C-SNP plan year-round.",
    startDate: "Year-round",
    endDate: "Year-round",
    duration: "Continuous",
    eligibleProducts: ["C-SNP"],
    source: "CMS",
    urgency: "info",
  });

  // 11. ACA / Marketplace SEPs
  seps.push({
    id: "aca-sep-job-loss",
    category: "ACA/Marketplace",
    type: "Loss of Minimum Essential Coverage SEP",
    code: "ACA-SEP",
    event: "Lost job-based or other qualifying coverage",
    description:
      "60-day SEP for individuals who lost qualifying health coverage (job loss, aging off parent's plan, divorce, COBRA expiration, etc.).",
    startDate: "Varies by individual",
    endDate: "60 days from loss event",
    duration: "60 days from qualifying event",
    eligibleProducts: ["ACA"],
    source: "Healthcare.gov / State Exchange",
    urgency: "info",
  });

  seps.push({
    id: "aca-sep-move",
    category: "ACA/Marketplace",
    type: "Moved to New Coverage Area SEP",
    code: "ACA-MOVE",
    event: "Permanent move to new zip code/coverage area",
    description:
      "60-day SEP for individuals who permanently moved to a new coverage area with access to different Marketplace plans.",
    startDate: "Varies by individual",
    endDate: "60 days from move date",
    duration: "60 days from qualifying event",
    eligibleProducts: ["ACA"],
    source: "Healthcare.gov / State Exchange",
    urgency: "info",
  });

  seps.push({
    id: "aca-sep-life",
    category: "ACA/Marketplace",
    type: "Life Event SEP (Marriage, Birth, Adoption)",
    code: "ACA-LIFE",
    event: "Marriage, birth of child, adoption, or other life event",
    description:
      "60-day SEP triggered by qualifying life events: marriage, birth, adoption, foster care placement, death in family, domestic violence, etc.",
    startDate: "Varies by individual",
    endDate: "60 days from event",
    duration: "60 days from qualifying event",
    eligibleProducts: ["ACA"],
    source: "Healthcare.gov / State Exchange",
    urgency: "info",
  });

  seps.push({
    id: "aca-sep-income",
    category: "ACA/Marketplace",
    type: "Income Change / Medicaid Loss SEP",
    code: "ACA-INCOME",
    event: "Income change or loss of Medicaid/CHIP",
    description:
      "60-day SEP for individuals who lost Medicaid or CHIP coverage, or experienced income changes affecting subsidy eligibility. Extended through Medicaid unwinding period.",
    startDate: "Varies by individual",
    endDate: "60 days from determination",
    duration: "60 days from qualifying event",
    eligibleProducts: ["ACA"],
    source: "Healthcare.gov / State Exchange",
    urgency: "info",
  });

  return seps;
}

// ─── ICONS ─────────────────────────────────────────────────────────────────────

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
  "ACA/Marketplace": {
    bg: "#f0fdf4",
    border: "#86efac",
    text: "#14532d",
    badge: "#16a34a",
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
    ACA: "#16a34a",
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

          {/* Matching Carriers */}
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
              Carriers Available in Area
            </div>
            <div style={{ display: "flex", flexWrap: "wrap" }}>
              {matchingCarriers.map((c) => (
                <CarrierChip key={c.key} carrier={c} />
              ))}
            </div>
          </div>
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

  const handleSearch = useCallback(() => {
    const cleanZip = zip.trim();
    if (!/^\d{5}$/.test(cleanZip)) return;
    setLoading(true);
    // Simulate API delay
    setTimeout(() => {
      const seps = getSEPsForZip(cleanZip);
      const zipCarriers = getCarriersForZip(cleanZip);
      setResults(seps);
      setCarriers(zipCarriers);
      setSearchedZip(cleanZip);
      setExpanded({});
      setFilterCategory("all");
      setFilterProduct("all");
      setLoading(false);
    }, 600);
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

  return (
    <div
      style={{
        fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@500;700&display=swap"
        rel="stylesheet"
      />

      {/* Search Bar */}
      <div style={{ padding: "24px 24px 0" }}>
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
        <div style={{ padding: "24px" }}>
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
                SEPs Found
              </div>
              <div
                style={{ fontSize: "22px", fontWeight: 800, color: "#f1f5f9" }}
              >
                {filtered?.length || 0}
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
          {femaActive.length > 0 && filterCategory !== "ACA/Marketplace" && (
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
                style={{ color: "#f87171", flexShrink: 0, marginTop: "2px" }}
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
                gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
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
                    style={{ display: "flex", flexWrap: "wrap", gap: "2px" }}
                  >
                    {c.products.map((p) => (
                      <ProductBadge key={p} product={p} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

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
              <strong>Disclaimer:</strong> This tool aggregates SEP data from
              CMS, FEMA, Healthcare.gov, and carrier sources for informational
              purposes only. Always verify eligibility directly with CMS
              (medicare.gov) or the applicable carrier. FEMA disaster SEPs are
              based on declared disaster areas — confirm client's address falls
              within affected counties. Data refreshes may lag behind real-time
              CMS/FEMA updates. Not intended as legal or enrollment advice. For
              agent/broker use only.
            </p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ padding: "80px 24px", textAlign: "center" }}>
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
        <div style={{ padding: "60px 24px", textAlign: "center" }}>
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
        select:focus { border-color: rgba(99,102,241,0.5) !important; }
        button:hover { filter: brightness(1.1); }
        input::placeholder { color: #475569; }
      `}</style>
    </div>
  );
}
