import { supabase } from "./supabase";
import { getStateFromZip } from "./sepGeo";
import { fetchPlansFromSupabase, transformCmsPlan } from "./sepCms";
import { getCountyFromZip, getPlansForState } from "../data/sepPlanDb";
import {
  DEFAULT_CSNP_CARRIER_VERIFICATION,
  DEFAULT_DSNP_EAE_LOOKUP,
  getSnpMedicaidBucket,
  SNP_CARRIER_LABELS,
  SNP_ROUTING_RULE_SUMMARIES,
} from "../data/snpRoutingData";

export const SNP_ROUTE_STATUS_META = {
  clear: { label: "Clear Path", color: "#39ff88" },
  conditional: { label: "Conditional", color: "#d29922" },
  blocked: { label: "Blocked", color: "#ff7b72" },
};

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupeBy(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function parseBenefitAmount(value) {
  if (value == null) {
    return 0;
  }

  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function normalizePlanCarrier(plan) {
  return normalizeText(plan?.carrier || plan?.orgName || plan?.name);
}

function isSameCarrier(currentCarrier, selectedPlan) {
  if (!currentCarrier || !selectedPlan) {
    return false;
  }

  return normalizeText(currentCarrier) === normalizeText(selectedPlan.carrier);
}

function getStatusMeta(status) {
  return SNP_ROUTE_STATUS_META[status] || SNP_ROUTE_STATUS_META.clear;
}

function getRuleFor(
  medicaidStatus,
  chronicCondition,
  ruleSource = SNP_ROUTING_RULE_SUMMARIES
) {
  const chronicBucket = chronicCondition && chronicCondition !== "none" ? "chronic" : "none";
  return (
    ruleSource.find(
      (rule) =>
        rule.medicaid_status === medicaidStatus &&
        rule.chronic_condition_bucket === chronicBucket
    ) || null
  );
}

function scorePlanForPriority(plan, memberPriority, routeKind) {
  const otcScore =
    parseBenefitAmount(plan.otc) +
    parseBenefitAmount(plan.grocery) * 3 +
    parseBenefitAmount(plan.flex) * 2;
  const networkScore =
    (plan.type || "").includes("PPO") ? 120 : 0;
  const medigapScore = plan.cat === "Medigap" ? 160 : 0;
  const premiumScore = Math.max(0, 120 - (Number(plan.prem) || 0) * 3);
  const moopScore = Math.max(0, 140 - (Number(plan.moop) || 0) / 50);
  const starScore = (Number(plan.stars) || 0) * 24;
  const partDScore = plan.partD ? 60 : 0;
  const snpBonus =
    routeKind === "csnp" && plan.snp === "C-SNP"
      ? 300
      : routeKind === "dsnp" && plan.snp === "D-SNP"
        ? 300
        : 0;

  switch (memberPriority) {
    case "otc":
      return snpBonus + otcScore + premiumScore + partDScore + starScore;
    case "drug_costs":
      return snpBonus + partDScore * 2 + premiumScore + starScore + moopScore;
    case "giveback":
      return snpBonus + parseBenefitAmount(plan.flex) * 3 + premiumScore + starScore;
    case "provider_continuity":
      return snpBonus + networkScore + medigapScore + starScore + moopScore;
    default:
      return snpBonus + premiumScore + starScore + moopScore;
  }
}

function pickBestPlan(plans, memberPriority, routeKind) {
  if (!plans?.length) {
    return null;
  }

  return [...plans].sort((a, b) => {
    const scoreDiff =
      scorePlanForPriority(b, memberPriority, routeKind) -
      scorePlanForPriority(a, memberPriority, routeKind);

    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return String(a.name || "").localeCompare(String(b.name || ""));
  })[0];
}

function formatPlanLabel(plan) {
  if (!plan) {
    return null;
  }

  const carrierName = getCarrierDisplayName(plan.carrier || plan.orgName);
  return `${carrierName} - ${plan.name}`;
}

function getCarrierVerificationMap(rows) {
  return rows.reduce((acc, row) => {
    acc[row.carrier] = row;
    return acc;
  }, {});
}

function matchAlignmentRow(dsnpRows, plan) {
  if (!plan) {
    return null;
  }

  const matchingById = dsnpRows.find(
    (row) =>
      normalizeText(row.contract_id) === normalizeText(plan.cid) &&
      normalizeText(row.plan_id) === normalizeText(plan.pbp)
  );

  if (matchingById) {
    return matchingById;
  }

  return (
    dsnpRows.find(
      (row) =>
        normalizeText(row.carrier) === normalizePlanCarrier(plan) ||
        normalizeText(row.plan_name) === normalizeText(plan.name)
    ) || null
  );
}

function medicaidMcoMatches(input, expected) {
  if (!input || !expected) {
    return false;
  }

  const normalizedInput = normalizeText(input);
  const normalizedExpected = normalizeText(expected);

  return (
    normalizedInput.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedInput)
  );
}

async function fetchCarrierVerificationRows() {
  try {
    const { data, error } = await supabase
      .from("csnp_carrier_verification")
      .select("*");

    if (error) {
      throw error;
    }

    if (data?.length) {
      return data;
    }
  } catch (error) {
    console.warn("[SNP Routing] Carrier verification lookup failed, using seed data.", error);
  }

  return DEFAULT_CSNP_CARRIER_VERIFICATION;
}

async function fetchDsnpAlignmentRows(state) {
  if (!state) {
    return DEFAULT_DSNP_EAE_LOOKUP;
  }

  try {
    const { data, error } = await supabase
      .from("dsnp_eae_lookup")
      .select("*")
      .eq("state", state);

    if (error) {
      throw error;
    }

    if (data?.length) {
      return data;
    }
  } catch (error) {
    console.warn("[SNP Routing] D-SNP alignment lookup failed, using seed data.", error);
  }

  return DEFAULT_DSNP_EAE_LOOKUP.filter((row) => row.state === state);
}

async function fetchRoutingRules() {
  try {
    const { data, error } = await supabase
      .from("snp_routing_rules")
      .select("*");

    if (error) {
      throw error;
    }

    if (data?.length) {
      return data;
    }
  } catch (error) {
    console.warn("[SNP Routing] Routing rules lookup failed, using seed data.", error);
  }

  return SNP_ROUTING_RULE_SUMMARIES;
}

export function getCarrierDisplayName(carrier) {
  if (!carrier) {
    return "Carrier Pending";
  }

  return SNP_CARRIER_LABELS[carrier] || carrier;
}

export async function loadSnpRoutingContext(zip) {
  const sanitizedZip = String(zip || "").replace(/\D/g, "").slice(0, 5);
  if (sanitizedZip.length !== 5) {
    return {
      zip: sanitizedZip,
      state: "",
      county: "",
      countyResolved: false,
      planInventoryChecked: false,
      planInventorySource: "none",
      plans: [],
      dsnpAlignmentRows: DEFAULT_DSNP_EAE_LOOKUP,
      carrierVerificationMap: getCarrierVerificationMap(
        DEFAULT_CSNP_CARRIER_VERIFICATION
      ),
      routingRules: SNP_ROUTING_RULE_SUMMARIES,
    };
  }

  const state = getStateFromZip(sanitizedZip);
  const county = getCountyFromZip(sanitizedZip);

  let cmsPlans = [];
  if (state && county) {
    try {
      const rows = await fetchPlansFromSupabase(state, county);
      cmsPlans = rows.map(transformCmsPlan);
    } catch (error) {
      console.warn("[SNP Routing] CMS plan lookup failed, using seed inventory.", error);
    }
  }

  const seedPlans = getPlansForState(sanitizedZip).filter((plan) =>
    plan.states?.includes?.("ALL") || plan.states?.includes?.(state)
  );

  const plans = dedupeBy(cmsPlans.length ? cmsPlans : seedPlans, (plan) =>
    [plan.cid, plan.pbp, normalizeText(plan.name)].join("|")
  );

  const [carrierVerificationRows, dsnpAlignmentRows, routingRules] = await Promise.all([
    fetchCarrierVerificationRows(),
    fetchDsnpAlignmentRows(state),
    fetchRoutingRules(),
  ]);

  return {
    zip: sanitizedZip,
    state,
    county: county || "",
    countyResolved: Boolean(county),
    planInventoryChecked: true,
    planInventorySource: cmsPlans.length ? "cms" : seedPlans.length ? "seed" : "none",
    plans,
    dsnpAlignmentRows,
    carrierVerificationMap: getCarrierVerificationMap(carrierVerificationRows),
    routingRules,
  };
}

function buildDualStandardDisclosure() {
  return [
    "This plan does not coordinate your Medicaid benefits. Your Medicare and Medicaid will operate as separate coverage.",
  ];
}

function buildCsnpDisclosure(timeline) {
  return [
    `This enrollment is conditional. If your provider cannot verify your chronic condition within ${timeline || "the carrier timeline"}, you may be disenrolled and given a special enrollment period to choose another plan.`,
  ];
}

function buildDsnpDisclosure() {
  return [
    "Your continued enrollment depends on maintaining your Medicaid eligibility. If you lose Medicaid, you will enter a grace period and may be disenrolled.",
  ];
}

function buildSepLanes(routeLabel, medicaidStatus, hasIntegratedDsnp) {
  if (routeLabel === "C-SNP") {
    return [
      "Chronic Condition SEP: year-round when the beneficiary meets the diagnosis requirements for the target C-SNP.",
      "AEP: October 15-December 7.",
      "MA OEP: January 1-March 31 for beneficiaries already enrolled in MA.",
      "ICEP: available when the member is first eligible for MA.",
    ];
  }

  if (routeLabel === "D-SNP") {
    const lanes = [];
    if (medicaidStatus === "full_dual") {
      lanes.push(
        hasIntegratedDsnp
          ? "Integrated Care SEP: full-benefit duals can align into an integrated D-SNP in any month."
          : "Integrated Care SEP applies only when an integrated D-SNP is available in the county."
      );
    }
    lanes.push("Dual/LIS SEP: monthly PDP changes and dual-eligible MA movement rules may apply.");
    lanes.push("AEP: October 15-December 7.");
    lanes.push("MA OEP: January 1-March 31 for beneficiaries already enrolled in MA.");
    return lanes;
  }

  const standardLanes = [
    "AEP: October 15-December 7.",
    "MA OEP: January 1-March 31 for beneficiaries already enrolled in MA.",
    "ICEP: available when the member is first eligible for MA.",
  ];

  if (medicaidStatus === "full_dual" || medicaidStatus === "partial_dual") {
    standardLanes.unshift(
      "Dual/LIS SEP: monthly SEP rules may support a standard MA fallback when Medicaid or Extra Help applies."
    );
  }

  return standardLanes;
}

function buildRecommendationBase({
  routeLabel,
  status,
  rule,
  summary,
  selectedPlan,
  disclosures,
  alerts = [],
  fallbackRoutes = [],
  carrierVerification = null,
  alignment = null,
  memberPriority,
  medicaidStatus,
}) {
  return {
    routeLabel,
    status,
    statusMeta: getStatusMeta(status),
    rule,
    summary,
    selectedPlan,
    selectedPlanLabel: formatPlanLabel(selectedPlan),
    selectedCarrierName: getCarrierDisplayName(selectedPlan?.carrier || ""),
    disclosures,
    alerts,
    fallbackRoutes,
    carrierVerification,
    alignment,
    memberPriority,
    sepLanes: buildSepLanes(routeLabel, medicaidStatus, Boolean(alignment?.integratedPlan)),
    commissionFlag:
      selectedPlan && isSameCarrier(memberPriority?.currentCarrier, selectedPlan)
        ? "Same-carrier switch: 50% commission applies."
        : null,
  };
}

function resolveDsnpChoice({
  dsnpPlans,
  dsnpAlignmentRows,
  memberPriority,
  medicaidMco,
  countyResolved,
}) {
  if (!dsnpPlans.length) {
    if (countyResolved) {
      return {
        available: false,
        blockedMessage:
          "No county-level D-SNP inventory is available for this zip. Use the standard MA fallback.",
      };
    }

    return {
      available: false,
      pendingMessage:
        "Enter a member zip code to confirm county-level D-SNP availability and alignment.",
    };
  }

  const sortCandidates = (candidates) =>
    [...candidates].sort((a, b) => {
      const scoreDiff =
        scorePlanForPriority(b.plan, memberPriority, "dsnp") -
        scorePlanForPriority(a.plan, memberPriority, "dsnp");

      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return String(a.plan.name || "").localeCompare(String(b.plan.name || ""));
    });

  const candidates = dsnpPlans.map((plan) => ({
    plan,
    alignmentRow: matchAlignmentRow(dsnpAlignmentRows, plan),
  }));
  const unrestrictedCandidates = sortCandidates(
    candidates.filter((candidate) => !candidate.alignmentRow?.eae_status)
  );
  const restrictedCandidates = sortCandidates(
    candidates.filter((candidate) => candidate.alignmentRow?.eae_status)
  );

  if (unrestrictedCandidates.length) {
    const { plan: selectedPlan, alignmentRow } = unrestrictedCandidates[0];

    if (!alignmentRow) {
      return {
        available: true,
        selectedPlan,
        summary:
          "A county-level D-SNP is available and is not listed as an aligned integrated D-SNP in the CMS CY 2026 file.",
        alignment: {
          integratedPlan: false,
          eaeStatus: false,
          integrationLevel: "",
          affiliatedMedicaidMco: "",
        },
        alerts: [],
      };
    }

    return {
      available: true,
      selectedPlan,
      summary:
        normalizeText(alignmentRow.integration_level) === "co"
          ? "A coordination-only D-SNP is available in this county, so no Medicaid alignment restriction is flagged."
          : "An integrated D-SNP without an exclusive alignment restriction is available in this county.",
      alignment: {
        integratedPlan: true,
        eaeStatus: false,
        integrationLevel: alignmentRow.integration_level,
        affiliatedMedicaidMco: alignmentRow.affiliated_medicaid_mco || "",
      },
      alerts: [],
    };
  }

  const { plan: selectedPlan, alignmentRow } = restrictedCandidates[0];
  if (!alignmentRow) {
    return {
      available: false,
      blockedMessage:
        "County-level D-SNP alignment could not be matched for this plan. Use the standard MA fallback.",
    };
  }

  const requiredMco = alignmentRow.affiliated_medicaid_mco || "";
  if (requiredMco && medicaidMco && !medicaidMcoMatches(medicaidMco, requiredMco)) {
    return {
      available: false,
      blockedMessage: `This D-SNP requires Medicaid through ${requiredMco}. Member's Medicaid MCO does not align. Recommend C-SNP or Standard MA instead.`,
      alignment: {
        integratedPlan: true,
        eaeStatus: true,
        integrationLevel: alignmentRow.integration_level,
        affiliatedMedicaidMco: requiredMco,
      },
    };
  }

  return {
    available: true,
    selectedPlan,
    summary: requiredMco
      ? "All matched county D-SNP options are aligned plans, so Medicaid MCO alignment must be confirmed before submission."
      : "All matched county D-SNP options are aligned plans in the CMS CY 2026 file. Confirm Medicaid alignment before submission.",
    alignment: {
      integratedPlan: true,
      eaeStatus: true,
      integrationLevel: alignmentRow.integration_level,
      affiliatedMedicaidMco: requiredMco,
    },
    alerts: [
      {
        tone: "conditional",
        text: requiredMco
          ? `D-SNPs in this area require Medicaid through ${requiredMco}. Confirm member's Medicaid MCO matches before submitting.`
          : "D-SNPs in this area are aligned plans in the CMS CY 2026 integrated D-SNP file. The source file does not list the affiliated Medicaid MCO, so confirm Medicaid alignment before submitting.",
      },
    ],
  };
}

export function buildSnpRoutingRecommendation({
  medicaidStatus,
  chronicCondition,
  memberPriority,
  zip,
  medicaidMco,
  currentCarrier,
  lookup,
}) {
  if (!medicaidStatus || !chronicCondition || !memberPriority) {
    return null;
  }

  const normalizedMedicaidStatus = getSnpMedicaidBucket(medicaidStatus);
  if (!normalizedMedicaidStatus) {
    return null;
  }

  const rule = getRuleFor(
    normalizedMedicaidStatus,
    chronicCondition,
    lookup?.routingRules?.length ? lookup.routingRules : SNP_ROUTING_RULE_SUMMARIES
  );
  const plans = lookup?.plans || [];
  const countyResolved = Boolean(lookup?.countyResolved);
  const hasChronic = chronicCondition !== "none";

  const standardPlans = plans.filter(
    (plan) => !plan.snp && ["MA", "MAPD", "Medigap"].includes(plan.cat)
  );
  const csnpPlans = plans.filter((plan) => plan.snp === "C-SNP");
  const dsnpPlans = plans.filter((plan) => plan.snp === "D-SNP");

  const standardPlan = pickBestPlan(standardPlans, memberPriority, "standard");
  const csnpPlan = pickBestPlan(csnpPlans, memberPriority, "csnp");
  const carrierVerification =
    lookup?.carrierVerificationMap?.[csnpPlan?.carrier] || null;
  const csnpTimeline = carrierVerification?.verification_timeline || "the carrier timeline";

  const baseAvailabilityAlert =
    zip && !countyResolved
      ? [
          {
            tone: "conditional",
            text: "County could not be resolved from this zip in the local seed map. Verify county before final plan selection.",
          },
        ]
      : [];

  if (normalizedMedicaidStatus === "none" && !hasChronic) {
    return {
      ...buildRecommendationBase({
        routeLabel: "STANDARD MA / MED SUP",
        status: "clear",
        rule,
        summary:
          rule?.rule_summary ||
          "No Medicaid and no qualifying chronic condition route this beneficiary to a standard MA or Med Supp lane.",
        selectedPlan:
          memberPriority === "provider_continuity" && standardPlan?.cat === "Medigap"
            ? standardPlan
            : standardPlan,
        disclosures: [],
        alerts: baseAvailabilityAlert,
        fallbackRoutes: [],
        memberPriority: { value: memberPriority, currentCarrier },
        medicaidStatus: normalizedMedicaidStatus,
      }),
      recommendedScriptType: null,
    };
  }

  if (normalizedMedicaidStatus === "none" && hasChronic) {
    if (csnpPlan || !countyResolved) {
      return {
        ...buildRecommendationBase({
          routeLabel: "C-SNP",
          status: "clear",
          rule,
          summary:
            rule?.rule_summary ||
            "A qualifying chronic condition without Medicaid routes this beneficiary to C-SNP first.",
          selectedPlan: csnpPlan,
          disclosures: buildCsnpDisclosure(csnpTimeline),
          alerts:
            csnpPlan || !zip
              ? baseAvailabilityAlert
              : [
                  ...baseAvailabilityAlert,
                  {
                    tone: "conditional",
                    text: "Enter a zip code to confirm that a county-level C-SNP exists before finalizing the route.",
                  },
                ],
          fallbackRoutes: rule?.fallback_route || ["STANDARD MA / MED SUP"],
          carrierVerification,
          memberPriority: { value: memberPriority, currentCarrier },
          medicaidStatus: normalizedMedicaidStatus,
        }),
        recommendedScriptType: "CSNP",
      };
    }

    return {
      ...buildRecommendationBase({
        routeLabel: "STANDARD MA / MED SUP",
        status: "clear",
        rule,
        summary:
          "No county-level C-SNP was found for this zip, so the clean fallback is a standard MA or Med Supp comparison.",
        selectedPlan: standardPlan,
        disclosures: [],
        alerts: [
          ...baseAvailabilityAlert,
          {
            tone: "blocked",
            text: "No county-level C-SNP inventory was found. Use the standard lane instead.",
          },
        ],
        fallbackRoutes: [],
        memberPriority: { value: memberPriority, currentCarrier },
        medicaidStatus: normalizedMedicaidStatus,
      }),
      recommendedScriptType: null,
    };
  }

  if (normalizedMedicaidStatus === "partial_dual" && !hasChronic) {
    return {
      ...buildRecommendationBase({
        routeLabel: "STANDARD MA WITH GIVEBACK",
        status: "clear",
        rule,
        summary:
          rule?.rule_summary ||
          "Partial dual status should skip D-SNP and route to a standard MA giveback lane.",
        selectedPlan: standardPlan,
        disclosures: buildDualStandardDisclosure(),
        alerts: baseAvailabilityAlert,
        fallbackRoutes: [],
        memberPriority: { value: memberPriority, currentCarrier },
        medicaidStatus: normalizedMedicaidStatus,
      }),
      recommendedScriptType: null,
    };
  }

  if (normalizedMedicaidStatus === "partial_dual" && hasChronic) {
    if (csnpPlan || !countyResolved) {
      return {
        ...buildRecommendationBase({
          routeLabel: "C-SNP",
          status: "clear",
          rule,
          summary:
            rule?.rule_summary ||
            "Partial dual plus a qualifying chronic condition should route to C-SNP first.",
          selectedPlan: csnpPlan,
          disclosures: [
            ...buildCsnpDisclosure(csnpTimeline),
            ...buildDualStandardDisclosure(),
          ],
          alerts: baseAvailabilityAlert,
          fallbackRoutes: rule?.fallback_route || ["STANDARD MA WITH GIVEBACK"],
          carrierVerification,
          memberPriority: { value: memberPriority, currentCarrier },
          medicaidStatus: normalizedMedicaidStatus,
        }),
        recommendedScriptType: "CSNP",
      };
    }

    return {
      ...buildRecommendationBase({
        routeLabel: "STANDARD MA WITH GIVEBACK",
        status: "clear",
        rule,
        summary:
          "No county-level C-SNP was found for this zip, so the route falls back to standard MA with giveback positioning.",
        selectedPlan: standardPlan,
        disclosures: buildDualStandardDisclosure(),
        alerts: [
          ...baseAvailabilityAlert,
          {
            tone: "blocked",
            text: "No county-level C-SNP inventory was found. Use the standard MA fallback.",
          },
        ],
        fallbackRoutes: [],
        memberPriority: { value: memberPriority, currentCarrier },
        medicaidStatus: normalizedMedicaidStatus,
      }),
      recommendedScriptType: null,
    };
  }

  const dsnpChoice = resolveDsnpChoice({
    dsnpPlans,
    dsnpAlignmentRows: lookup?.dsnpAlignmentRows || [],
    memberPriority,
    medicaidMco,
    countyResolved,
  });

  if (normalizedMedicaidStatus === "full_dual" && !hasChronic) {
    if (dsnpChoice.available) {
      return {
        ...buildRecommendationBase({
          routeLabel: "D-SNP",
          status: "conditional",
          rule,
          summary:
            dsnpChoice.summary ||
            rule?.rule_summary ||
            "Full dual without a qualifying chronic condition routes to D-SNP first, subject to alignment and integrated-plan rules.",
          selectedPlan: dsnpChoice.selectedPlan,
          disclosures: buildDsnpDisclosure(),
          alerts: [...baseAvailabilityAlert, ...(dsnpChoice.alerts || [])],
          fallbackRoutes: rule?.fallback_route || ["STANDARD MA WITH GIVEBACK"],
          alignment: dsnpChoice.alignment || null,
          memberPriority: { value: memberPriority, currentCarrier },
          medicaidStatus: normalizedMedicaidStatus,
        }),
        recommendedScriptType: "DSNP",
      };
    }

    return {
      ...buildRecommendationBase({
        routeLabel: "STANDARD MA WITH GIVEBACK",
        status: "clear",
        rule,
        summary:
          "The D-SNP lane is blocked or unavailable for this member, so the fallback is standard MA with giveback positioning.",
        selectedPlan: standardPlan,
        disclosures: buildDualStandardDisclosure(),
        alerts: [
          ...baseAvailabilityAlert,
          {
            tone: dsnpChoice.pendingMessage ? "conditional" : "blocked",
            text:
              dsnpChoice.blockedMessage ||
              dsnpChoice.pendingMessage ||
              "Run the county-level D-SNP alignment check before presenting integrated benefits.",
          },
        ],
        fallbackRoutes: [],
        alignment: dsnpChoice.alignment || null,
        memberPriority: { value: memberPriority, currentCarrier },
        medicaidStatus: normalizedMedicaidStatus,
      }),
      recommendedScriptType: null,
    };
  }

  if (csnpPlan || !countyResolved) {
    return {
      ...buildRecommendationBase({
        routeLabel: "C-SNP",
        status: "clear",
        rule,
        summary:
          rule?.rule_summary ||
          "Full dual plus a qualifying chronic condition routes to C-SNP first because it avoids Medicaid alignment friction.",
        selectedPlan: csnpPlan,
        disclosures: buildCsnpDisclosure(csnpTimeline),
        alerts: baseAvailabilityAlert,
        fallbackRoutes: rule?.fallback_route || ["D-SNP", "STANDARD MA WITH GIVEBACK"],
        carrierVerification,
        memberPriority: { value: memberPriority, currentCarrier },
        medicaidStatus: normalizedMedicaidStatus,
      }),
      recommendedScriptType: "CSNP",
    };
  }

  if (dsnpChoice.available) {
    return {
      ...buildRecommendationBase({
        routeLabel: "D-SNP",
        status: "conditional",
        rule,
        summary:
          dsnpChoice.summary
            ? `No county-level C-SNP was found. ${dsnpChoice.summary}`
            : "No county-level C-SNP was found, so the route falls back to D-SNP with alignment review.",
        selectedPlan: dsnpChoice.selectedPlan,
        disclosures: buildDsnpDisclosure(),
        alerts: [...baseAvailabilityAlert, ...(dsnpChoice.alerts || [])],
        fallbackRoutes: ["STANDARD MA WITH GIVEBACK"],
        alignment: dsnpChoice.alignment || null,
        memberPriority: { value: memberPriority, currentCarrier },
        medicaidStatus: normalizedMedicaidStatus,
      }),
      recommendedScriptType: "DSNP",
    };
  }

  return {
    ...buildRecommendationBase({
      routeLabel: "STANDARD MA WITH GIVEBACK",
      status: "clear",
      rule,
      summary:
        "Neither county-level C-SNP nor D-SNP routing cleared, so the fallback is standard MA with giveback positioning.",
      selectedPlan: standardPlan,
      disclosures: buildDualStandardDisclosure(),
      alerts: [
        ...baseAvailabilityAlert,
        {
          tone: dsnpChoice.pendingMessage ? "conditional" : "blocked",
          text:
            dsnpChoice.blockedMessage ||
            dsnpChoice.pendingMessage ||
            "Integrated D-SNP routing could not be cleared for this zip.",
        },
      ],
      fallbackRoutes: [],
      alignment: dsnpChoice.alignment || null,
      memberPriority: { value: memberPriority, currentCarrier },
      medicaidStatus: normalizedMedicaidStatus,
    }),
    recommendedScriptType: null,
  };
}
