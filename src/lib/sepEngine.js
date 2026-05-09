/*
  SEP Qualification Engine
  Determines which Special Enrollment Periods apply for a given zip code,
  including FEMA disaster SEPs, Medicare standard SEPs, and condition-based SEPs.
*/

import { getStateFromZip, hasFiveStarPlans, daysRemaining, isActiveNow } from "./sepGeo";
import { getPlansForState } from "../data/sepPlanDb";

export function getSEPsForState(stateCode, femaDisasters = []) {
  const today = new Date();
  const seps = [];

  // FEMA disaster SEPs for this state
  femaDisasters
    .filter((d) => d.state === stateCode)
    .forEach((d) => {
      if (new Date(d.sepEndDate) > today) {
        const isPAOnly = d.paOnly && !d.iaProgram && !d.ihProgram;
        seps.push({
          id: `fema-${d.id}`,
          category: "FEMA Disaster",
          type: isPAOnly
            ? "FEMA Disaster (PA Only, No SEP Yet)"
            : "FEMA Disaster SEP",
          code: "SEP-FEMA",
          event: d.title,
          description: `${d.id}, ${d.type} in ${d.state}. Counties: ${d.counties.join(", ")}.${
            isPAOnly
              ? " Public Assistance only, Medicare SEP NOT yet active. Monitor for IA amendment."
              : `Enroll in or switch MA/MAPD plans.${
                  d.isOngoing
                    ? " Incident still active, SEP window remains open."
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
          matchingPlans: [],
        });
      }
    });

  const yr = today.getFullYear();

  // Standard Medicare SEPs (state-level, no plan matching)
  if (isActiveNow(`${yr}-01-01`, `${yr}-03-31`)) {
    seps.push({
      id: `medicare-oep-${yr}`, category: "Medicare",
      type: "Medicare Advantage OEP", code: "OEP",
      event: `Annual MA Open Enrollment (Jan 1 – Mar 31, ${yr})`,
      description: "Currently enrolled MA beneficiaries can make ONE plan change: switch MA/MAPD plan, or drop MA and return to Original Medicare + PDP.",
      startDate: `${yr}-01-01`, endDate: `${yr}-03-31`,
      duration: "Jan 1 – Mar 31",
      eligibleProducts: ["MA", "MAPD"], source: "CMS", urgency: "medium",
      daysLeft: daysRemaining(`${yr}-03-31`), matchingPlans: [],
    });
  }

  seps.push(
    { id: "medicare-icep", category: "Medicare", type: "Initial Coverage Election Period (ICEP)", code: "ICEP",
      event: "Turning 65 / New to Medicare", description: "7-month window around 65th birthday. First chance to enroll in MA, MAPD, or Medigap.",
      startDate: "Varies by individual", endDate: "Varies by individual", duration: "3 mo before + birthday month + 3 mo after turning 65",
      eligibleProducts: ["MA", "MAPD", "Medigap"], source: "CMS", urgency: "info", matchingPlans: [] },
    { id: "medicare-iep", category: "Medicare", type: "Initial Enrollment Period (IEP)", code: "IEP",
      event: "First eligible for Medicare Part A/B", description: "7-month period to sign up for Part A/B, then enroll in MA/MAPD. Late Part B enrollment may trigger penalties.",
      startDate: "Varies by individual", endDate: "Varies by individual", duration: "7-month window around 65th birthday or 25th month of disability",
      eligibleProducts: ["MA", "MAPD", "PDP", "Medigap"], source: "CMS", urgency: "info", matchingPlans: [] },
    { id: "medicare-dual-lis", category: "Medicare", type: "Dual-Eligible / LIS (Extra Help) SEP", code: "DUAL/LIS",
      event: "Dual-eligible (Medicare+Medicaid) or Extra Help/LIS", description: "Continuous SEP, change MA/MAPD once per quarter (Q1–Q3). D-SNP plans designed for dual-eligible beneficiaries.",
      startDate: "Year-round", endDate: "Year-round", duration: "Continuous, once per quarter",
      eligibleProducts: ["MA", "MAPD", "D-SNP"], source: "CMS", urgency: "info", matchingPlans: [] },
    { id: "medicare-move", category: "Medicare", type: "Moved Out of Service Area SEP", code: "SEP-MOVE",
      event: "Permanent move, current plan no longer available", description: "63-day SEP to enroll in a new MA/MAPD plan in new service area after permanent address change.",
      startDate: "Varies by individual", endDate: "63 days from move date", duration: "63 days from move",
      eligibleProducts: ["MA", "MAPD", "Medigap"], source: "CMS", urgency: "info", matchingPlans: [] },
    { id: "medicare-loss-coverage", category: "Medicare", type: "Loss of Creditable Coverage SEP", code: "SEP-LOSS",
      event: "Involuntary loss of employer/union/group coverage", description: "63-day SEP after involuntary loss of creditable coverage (employer ended, COBRA expired, etc.).",
      startDate: "Varies by individual", endDate: "63 days from loss", duration: "63 days from loss",
      eligibleProducts: ["MA", "MAPD", "Medigap"], source: "CMS", urgency: "info", matchingPlans: [] },
    { id: "medicare-institution", category: "Medicare", type: "Institutionalized / SNF SEP", code: "SEP-INST",
      event: "Move into/out of nursing facility or institution", description: "Continuous SEP while in institution + 2 months after discharge.",
      startDate: "Year-round", endDate: "Year-round", duration: "Continuous + 2 mo after discharge",
      eligibleProducts: ["MA", "MAPD", "I-SNP"], source: "CMS", urgency: "info", matchingPlans: [] },
  );

  return seps;
}

export function getSEPsForZip(zip, femaDisasters = []) {
  const state = getStateFromZip(zip);
  const today = new Date();
  const seps = [];
  const zipPlans = getPlansForState(zip);
  const maPlans = (filter) => zipPlans.filter(filter);

  // FEMA disaster SEPs
  femaDisasters
    .filter((d) => d.state === state)
    .forEach((d) => {
      if (new Date(d.sepEndDate) > today) {
        const isPAOnly = d.paOnly && !d.iaProgram && !d.ihProgram;
        seps.push({
          id: `fema-${d.id}`,
          category: "FEMA Disaster",
          type: isPAOnly
            ? "FEMA Disaster (PA Only, No SEP Yet)"
            : "FEMA Disaster SEP",
          code: "SEP-FEMA",
          event: d.title,
          description: `${d.id}, ${d.type} in ${d.state}. Counties: ${d.counties.join(", ")}.${
            isPAOnly
              ? " Public Assistance only, Medicare SEP NOT yet active. Monitor for IA amendment."
              : `Enroll in or switch MA/MAPD plans.${
                  d.isOngoing
                    ? " Incident still active, SEP window remains open."
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

  // Medicare Advantage OEP (Jan 1 – Mar 31)
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

  // ICEP
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

  // IEP
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

  // 5-Star SEP
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

  // Dual/LIS
  seps.push({
    id: "medicare-dual-lis",
    category: "Medicare",
    type: "Dual-Eligible / LIS (Extra Help) SEP",
    code: "DUAL/LIS",
    event: "Dual-eligible (Medicare+Medicaid) or Extra Help/LIS",
    description:
      "Continuous SEP, change MA/MAPD once per quarter (Q1–Q3). D-SNP plans designed for dual-eligible beneficiaries.",
    startDate: "Year-round",
    endDate: "Year-round",
    duration: "Continuous, once per quarter",
    eligibleProducts: ["MA", "MAPD", "D-SNP"],
    source: "CMS",
    urgency: "info",
    matchingPlans: maPlans(
      (p) => p.snp === "D-SNP" || ["MA", "MAPD"].includes(p.cat)
    ),
  });

  // Move SEP
  seps.push({
    id: "medicare-move",
    category: "Medicare",
    type: "Moved Out of Service Area SEP",
    code: "SEP-MOVE",
    event: "Permanent move, current plan no longer available",
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

  // Loss of coverage
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

  // Institutionalized
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

  // C-SNP
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
