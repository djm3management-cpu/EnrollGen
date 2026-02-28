/**
 * ComplianceScorer v2 — CMS Compliance Calibration Engine
 *
 * Modeled after EnrollHere's 9-category / 26-benchmark framework
 * but designed for LIVE scoring during the call, not just post-call.
 *
 * 9 Categories:
 *   1. Call Opening           (3 sub-questions)
 *   2. Required Disclosures   (4 sub-questions)
 *   3. Scope of Appointment   (3 sub-questions)
 *   4. Eligibility Verification (6 sub-questions)
 *   5. Needs Assessment       (3 sub-questions — NEW, maps to NEADS)
 *   6. Presentation / SOB     (4 sub-questions)
 *   7. Consent for Enrollment (3 sub-questions)
 *   8. Call Closing           (4 sub-questions)
 *   9. Consumer Experience    (3 sub-questions)
 *
 * Total: 33 sub-questions across 9 categories
 *
 * Drop into: src/context/ComplianceScorer.js
 *
 * Usage:
 *   import { scoreCompliance, groupByCategory } from "../context/ComplianceScorer";
 *   const result = scoreCompliance(scriptState, copilotEntries);
 *   // result.score = 81
 *   // result.categories = [{ name: "Call Opening", score: 100, ... }, ...]
 *   // result.totalPassed = 27 of 33
 */

/* ═══════════════════════════════════════════════════════════════
   HELPER: Check if a section was completed within a time window
   ═══════════════════════════════════════════════════════════════ */
function sectionCompletedWithinMs(state, sectionNum, maxMs) {
  const ts = state.sectionTimestamps || {};
  const callStart = state.tpmoStart || ts[1]?.start;
  const sectionEnd = ts[sectionNum]?.end;
  if (!callStart || !sectionEnd) return null; // can't determine
  return sectionEnd - callStart <= maxMs;
}

function getCallDurationMin(state) {
  if (!state.tpmoStart) return 0;
  const endTime = state.callEndTime || Date.now();
  return (endTime - state.tpmoStart) / 60000;
}

/* ═══════════════════════════════════════════════════════════════
     CATEGORY DEFINITIONS
     Each category has:
       - name: display name
       - icon: emoji for UI
       - description: what this category measures
       - cmsRef: CMS regulation references
       - weight: category weight (all weights sum to 100)
       - questions: array of sub-questions, each with:
           - id: unique key
           - question: the compliance question (matches EnrollHere style)
           - points: max points for this question within the category
           - evaluate: fn(state, entries) → { score: 0-100, evidence: string }
     ═══════════════════════════════════════════════════════════════ */

const CATEGORIES = [
  // ════════════════════════════════════════════════════
  // 1) CALL OPENING
  // ════════════════════════════════════════════════════
  {
    name: "Call Opening",
    icon: "📣",
    description: "Score of call opening",
    cmsRef: "42 CFR § 422.2274(b); MMCM CH 2: 40.1.3",
    weight: 10,
    questions: [
      {
        id: "opening_agent_id",
        question:
          "Did the agent use the required call opening? (Name, licensing, agency, recording disclosure)",
        points: 4,
        evaluate: (state) => {
          if (!state.recordingOk)
            return {
              score: 0,
              evidence:
                "Recording disclosure was not completed. Agent must state their name, identify as a licensed sales agent, name their agency, and disclose call recording.",
            };
          if (!state.agentName || state.agentName.trim().length < 3)
            return {
              score: 50,
              evidence:
                "Recording disclosure was checked but agent name was not entered. Agent must state their full name during the opening.",
            };
          return {
            score: 100,
            evidence: `Agent identified as "${state.agentName}", disclosed recording, and obtained consent to continue.`,
          };
        },
      },
      {
        id: "opening_beneficiary_name",
        question: "Did the agent identify the name of the primary beneficiary?",
        points: 2,
        evaluate: (state) => {
          // If recording disclosure is done, agent asked "who do I have the pleasure of speaking with"
          if (state.recordingOk) {
            return {
              score: 100,
              evidence:
                "Agent completed the recording disclosure which includes asking the beneficiary's name.",
            };
          }
          return {
            score: 0,
            evidence:
              "Agent did not complete the recording disclosure, which includes identifying the beneficiary by name.",
          };
        },
      },
      {
        id: "opening_recording_consent",
        question:
          "Did the agent obtain explicit agreement to be recorded on the call?",
        points: 4,
        evaluate: (state) => {
          if (state.recordingOk) {
            return {
              score: 100,
              evidence:
                "Agent disclosed that the call is recorded for quality and training purposes and obtained consent.",
            };
          }
          return {
            score: 0,
            evidence:
              "Recording consent was not obtained. CMS requires all sales, marketing, and enrollment calls to be recorded with beneficiary agreement.",
          };
        },
      },
    ],
  },

  // ════════════════════════════════════════════════════
  // 2) REQUIRED DISCLOSURES
  // ════════════════════════════════════════════════════
  {
    name: "Required Disclosures",
    icon: "📢",
    description: "Combined score of required disclosures and TPMO compliance",
    cmsRef:
      "42 CFR § 422.2267(e)(41); 42 CFR § 422.2262(a)(1)(i),(iii); 42 CFR § 422.2268(a)(1),(2)",
    weight: 15,
    questions: [
      {
        id: "disclosure_tpmo_read",
        question:
          "Did the agent read the TPMO disclaimer? ('We do not offer every plan...', org/plan counts, Medicare.gov/SHIP referral)",
        points: 5,
        evaluate: (state) => {
          if (!state.tpmoOk)
            return {
              score: 0,
              evidence:
                "TPMO disclaimer was not read. Agent must state verbatim: number of organizations, number of plans, and refer to Medicare.gov/1-800-MEDICARE/SHIP.",
            };
          // Check if org/plan counts were filled in
          const hasOrgs = state.tpmoOrgs && state.tpmoOrgs.trim().length > 0;
          const hasPlans = state.tpmoPlans && state.tpmoPlans.trim().length > 0;
          if (!hasOrgs || !hasPlans)
            return {
              score: 66,
              evidence:
                "TPMO disclaimer was marked complete but organization/plan counts were not entered. Agent may have used placeholder numbers instead of actual counts for the beneficiary's ZIP.",
            };
          return {
            score: 100,
            evidence: `TPMO disclaimer read with ${
              state.tpmoOrgs
            } organizations and ${state.tpmoPlans} plans for ZIP ${
              state.tpmoZip || "unknown"
            }.`,
          };
        },
      },
      {
        id: "disclosure_tpmo_timing",
        question:
          "Was the TPMO disclaimer provided within the first minute of the sales call?",
        points: 3,
        evaluate: (state) => {
          // Check if section 2 (TPMO) was completed within ~90s of section 1 start
          // We give a generous 90s because recording disclosure comes first
          const withinTime = sectionCompletedWithinMs(state, 2, 90000);
          if (withinTime === null) {
            // Can't determine — give partial credit if TPMO was completed
            if (state.tpmoOk)
              return {
                score: 75,
                evidence:
                  "TPMO disclaimer was completed but timing data is unavailable. CMS requires the disclaimer within the first minute.",
              };
            return {
              score: 0,
              evidence: "TPMO disclaimer was not completed.",
            };
          }
          if (withinTime)
            return {
              score: 100,
              evidence:
                "TPMO disclaimer was provided within the first minute of the call, as required by CMS.",
            };
          if (state.tpmoOk)
            return {
              score: 50,
              evidence:
                "TPMO disclaimer was read but NOT within the first minute of the call. CMS regulation 42 CFR § 422.2267(e)(41) requires it within the first 60 seconds.",
            };
          return {
            score: 0,
            evidence: "TPMO disclaimer was not completed.",
          };
        },
      },
      {
        id: "disclosure_snp",
        question:
          "If applicable, did the agent read the SNP disclosure (DSNP/CSNP) including verification requirements?",
        points: 3,
        evaluate: (state) => {
          if (
            !state.snpType ||
            state.snpType === "none" ||
            state.snpType === "N/A"
          )
            return {
              score: 100,
              evidence: "SNP disclosure not applicable for this enrollment.",
            };
          if (state.snpOk)
            return {
              score: 100,
              evidence: `${state.snpType} disclosure read, including ${
                state.snpType === "DSNP"
                  ? "verification of Medicare and Medicaid entitlement"
                  : "physician verification process and voiding warning"
              }.`,
            };
          return {
            score: 0,
            evidence: `${
              state.snpType
            } was selected but the required SNP disclosure was not completed. ${
              state.snpType === "DSNP"
                ? "Agent must state enrollment is based on verification of both Medicare and qualifying Medicaid."
                : "Agent must explain physician verification, end-of-first-month deadline, and voiding of enrollment if form not returned."
            }`,
          };
        },
      },
      {
        id: "disclosure_no_misleading",
        question:
          "Did the agent avoid misleading, inaccurate, or unsubstantiated claims during the call?",
        points: 4,
        evaluate: (_state, entries) => {
          const misleadingFlags = entries.filter(
            (e) =>
              e.level === "critical" &&
              e.message &&
              (e.message.toLowerCase().includes("misleading") ||
                e.message.toLowerCase().includes("superlative") ||
                e.message.toLowerCase().includes("guarantee") ||
                e.message.toLowerCase().includes("better than") ||
                e.message.toLowerCase().includes("best plan") ||
                e.message.toLowerCase().includes("comparative"))
          );
          if (misleadingFlags.length === 0)
            return {
              score: 100,
              evidence:
                "No misleading or unsubstantiated claims detected during the call.",
            };
          return {
            score: Math.max(0, 100 - misleadingFlags.length * 50),
            evidence: `${misleadingFlags.length} potential misleading or unsubstantiated claim(s) flagged by AI compliance monitor. CMS prohibits superlatives, guarantees, and comparative claims without documentation.`,
          };
        },
      },
    ],
  },

  // ════════════════════════════════════════════════════
  // 3) SCOPE OF APPOINTMENT
  // ════════════════════════════════════════════════════
  {
    name: "Scope of Appointment",
    icon: "📝",
    description: "Proper SOA documentation and adherence",
    cmsRef: "42 CFR § 422.2260 - § 422.2274; § 423.2260 - § 423.2276",
    weight: 12,
    questions: [
      {
        id: "soa_poa_check",
        question:
          "Did the agent ask if the beneficiary is enrolling for themselves or an authorized representative (POA check)?",
        points: 3,
        evaluate: (state) => {
          if (state.soaOk)
            return {
              score: 100,
              evidence:
                "POA check completed. Agent asked if the caller is discussing Medicare options for themselves or someone else.",
            };
          return {
            score: 0,
            evidence:
              "SOA was not completed. Agent must ask if the caller is enrolling for themselves or acting on behalf of someone else (guardian, family member, POA).",
          };
        },
      },
      {
        id: "soa_not_obligated",
        question:
          "Did the agent state that the beneficiary is not obligated to enroll and answering questions does not affect current coverage?",
        points: 4,
        evaluate: (state) => {
          if (state.soaOk)
            return {
              score: 100,
              evidence:
                "SOA completed including non-obligation language: beneficiary is not obligated to enroll, and answering questions does not affect current enrollment.",
            };
          return {
            score: 0,
            evidence:
              "Agent did not complete SOA. Must state: beneficiary is not obligated to enroll, and this call will not enroll them in any plan.",
          };
        },
      },
      {
        id: "soa_product_types",
        question:
          "Did the agent list all product types to be discussed (MA, PDP, Dental, Vision, Hospital Indemnity) and obtain permission?",
        points: 5,
        evaluate: (state) => {
          if (state.soaOk)
            return {
              score: 100,
              evidence:
                "Agent obtained verbal SOA permission to discuss all applicable product types before proceeding with plan discussion.",
            };
          return {
            score: 0,
            evidence:
              "No scope of appointment was established. Agent did not disclose specific product types to be discussed or obtain beneficiary agreement for the scope before proceeding with plan discussion.",
          };
        },
      },
    ],
  },

  // ════════════════════════════════════════════════════
  // 4) ELIGIBILITY VERIFICATION
  // ════════════════════════════════════════════════════
  {
    name: "Eligibility Verification",
    icon: "🔎",
    description:
      "Combined score of beneficiary eligibility and election period verification",
    cmsRef: "MMCM CH 2: 10, 20, 30, 30.6, 40.1.3, 40.2, 40.2.1",
    weight: 15,
    questions: [
      {
        id: "elig_decision_authority",
        question:
          "Did the agent determine if the beneficiary is able to make their own healthcare decision?",
        points: 3,
        evaluate: (state) => {
          // POA check in SOA section covers this
          if (state.soaOk)
            return {
              score: 100,
              evidence:
                "Agent confirmed decision-making authority during the POA/SOA section.",
            };
          return {
            score: 0,
            evidence:
              "Agent did not verify whether the beneficiary is making their own healthcare decisions or if an authorized representative is needed.",
          };
        },
      },
      {
        id: "elig_parts_ab",
        question:
          "Did the agent fully qualify the beneficiary? (Medicare Parts A & B, effective dates read back, address confirmed)",
        points: 4,
        evaluate: (state) => {
          if (state.qualOk)
            return {
              score: 100,
              evidence:
                "Qualifications completed. Agent confirmed Part A and Part B enrollment, effective dates, permanent address, and checked for disqualifying coverage.",
            };
          if (state.soaOk)
            return {
              score: 25,
              evidence:
                "SOA was completed but Qualifications section was not finished. Agent must confirm Part A/B, effective dates, address, Medicaid status, veteran status, and other coverage.",
            };
          return {
            score: 0,
            evidence:
              "Qualifications not completed. Agent did not verify Medicare Part A and Part B enrollment or effective dates.",
          };
        },
      },
      {
        id: "elig_election_period",
        question:
          "Did the agent determine valid election period eligibility? (AEP, OEP/MA-OEP, SEP)",
        points: 3,
        evaluate: (state) => {
          if (state.qualOk)
            return {
              score: 100,
              evidence:
                "Agent confirmed the applicable enrollment period (AEP, OEP, or SEP) during qualifications.",
            };
          return {
            score: 0,
            evidence:
              "Agent did not confirm which election period applies. Must state whether AEP (Oct 15-Dec 7), OEP (Jan 1-Mar 31), or SEP.",
          };
        },
      },
      {
        id: "elig_disqualifying_coverage",
        question:
          "Did the agent check for disqualifying coverage? (Employer, TRICARE for Life, CHAMPVA, VA benefits)",
        points: 3,
        evaluate: (state) => {
          if (state.qualOk)
            return {
              score: 100,
              evidence:
                "Agent asked about other coverage types including employer, retiree, VA, TRICARE, and CHAMPVA during qualifications.",
            };
          return {
            score: 0,
            evidence:
              "Agent did not check for disqualifying coverage. Must ask about employer coverage, retiree benefits, VA benefits, TRICARE for Life, and CHAMPVA.",
          };
        },
      },
      {
        id: "elig_reason_for_inquiry",
        question:
          "Did the agent determine the reason the beneficiary is inquiring about a different plan with focus on current coverage experiences?",
        points: 2,
        evaluate: (state) => {
          // NEADS captures this — "anything specific about your current plan"
          if (state.neadsOk)
            return {
              score: 100,
              evidence:
                "Agent explored the beneficiary's motivation for exploring new coverage during the needs assessment.",
            };
          if (state.qualOk)
            return {
              score: 50,
              evidence:
                "Qualifications were completed but the agent may not have specifically asked why the beneficiary is looking for a different plan.",
            };
          return {
            score: 0,
            evidence:
              "Agent did not determine why the beneficiary is looking for a different plan or their experience with current coverage.",
          };
        },
      },
      {
        id: "elig_benefit_priorities",
        question:
          "Did the agent determine which benefits are a priority for the beneficiary?",
        points: 2,
        evaluate: (state) => {
          if (state.neadsOk)
            return {
              score: 100,
              evidence:
                "Agent assessed beneficiary's priorities during NEADS (doctors, medications, pharmacy, hospital, specific needs).",
            };
          return {
            score: 0,
            evidence:
              "Agent did not directly ask what matters most to the beneficiary or identify their specific benefit priorities.",
          };
        },
      },
    ],
  },

  // ════════════════════════════════════════════════════
  // 5) NEEDS ASSESSMENT (NEADS)
  // ════════════════════════════════════════════════════
  {
    name: "Needs Assessment",
    icon: "🩺",
    description:
      "Assessment of beneficiary healthcare needs before plan recommendation",
    cmsRef: "42 CFR § 422.2274(c)(9)(i); MMCM CH 2: 40.2",
    weight: 10,
    questions: [
      {
        id: "neads_providers",
        question:
          "Did the agent ask about the beneficiary's doctors (PCP, specialists) and verify network status?",
        points: 4,
        evaluate: (state) => {
          if (state.neadsOk)
            return {
              score: 100,
              evidence:
                "Agent asked about PCP, specialists, and preferred hospital/facility during needs assessment.",
            };
          return {
            score: 0,
            evidence:
              "Agent did not ask about the beneficiary's doctors or verify provider network status.",
          };
        },
      },
      {
        id: "neads_medications",
        question:
          "Did the agent ask about current medications (names and dosages) and preferred pharmacy?",
        points: 4,
        evaluate: (state) => {
          if (state.neadsOk)
            return {
              score: 100,
              evidence:
                "Agent asked about current medications, dosages, and pharmacy preference during needs assessment.",
            };
          return {
            score: 0,
            evidence:
              "Agent did not ask about the beneficiary's medications, dosages, or pharmacy. This is critical for formulary verification.",
          };
        },
      },
      {
        id: "neads_summary_recap",
        question:
          "Did the agent summarize collected needs and confirm with the beneficiary before recommending a plan?",
        points: 3,
        evaluate: (state) => {
          if (state.neadsOk)
            return {
              score: 100,
              evidence:
                "Agent completed the NEADS assessment, which includes summarizing findings and confirming with the beneficiary before plan selection.",
            };
          return {
            score: 0,
            evidence:
              "Agent did not complete the needs assessment recap. Must summarize doctors, medications, pharmacy, and priorities before recommending a plan.",
          };
        },
      },
    ],
  },

  // ════════════════════════════════════════════════════
  // 6) PRESENTATION / SUMMARY OF BENEFITS
  // ════════════════════════════════════════════════════
  {
    name: "Summary of Benefits",
    icon: "📋",
    description: "Review of Summary of Benefits before enrollment",
    cmsRef: "42 CFR § 422.111; 42 CFR § 422.2274(c)(9)(i)",
    weight: 13,
    questions: [
      {
        id: "sob_review",
        question:
          "Did the agent review the Summary of Benefits prior to completion of enrollment? (Premium, deductibles, copays, network, drug coverage, extra benefits)",
        points: 4,
        evaluate: (state) => {
          if (state.sobOk)
            return {
              score: 100,
              evidence:
                "Agent reviewed plan benefits including premium, deductibles, copays, network type, drug coverage, and additional benefits before enrollment.",
            };
          if (state.neadsOk)
            return {
              score: 25,
              evidence:
                "NEADS was completed but SOB review was not finished. Agent must present actual plan benefits, costs, and coverage details.",
            };
          return {
            score: 0,
            evidence:
              "Summary of Benefits was not reviewed with the beneficiary before enrollment.",
          };
        },
      },
      {
        id: "sob_network_review",
        question:
          "Did the agent offer to review (1) provider/specialist network status, (2) prescription coverage and pharmacy network, (3) preferred hospital network, and (4) preferred facility network?",
        points: 4,
        evaluate: (state) => {
          if (state.sobOk && state.neadsOk)
            return {
              score: 100,
              evidence:
                "Agent assessed providers during NEADS and reviewed plan network coverage during SOB presentation.",
            };
          if (state.neadsOk)
            return {
              score: 50,
              evidence:
                "Agent asked about providers during NEADS but did not complete full SOB review to confirm network coverage, pharmacy network, hospital, and facility status.",
            };
          return {
            score: 0,
            evidence:
              "Agent did not offer comprehensive review of provider network status, pharmacy coverage, hospital, or facility network.",
          };
        },
      },
      {
        id: "sob_coverage_impact",
        question:
          "Did the agent explain how enrolling will affect current coverage including being disenrolled from their current plan? (Coverage changes, coordination of benefits, TRICARE/VA interactions)",
        points: 3,
        evaluate: (state) => {
          if (state.enrollOk)
            return {
              score: 100,
              evidence:
                "Enrollment section completed. Agent stated that enrolling replaces current coverage and the plan is subject to Medicare approval.",
            };
          if (state.sobOk)
            return {
              score: 50,
              evidence:
                "SOB was reviewed but enrollment section not yet completed. Agent must clearly explain that this plan replaces Original Medicare before completing enrollment.",
            };
          return {
            score: 0,
            evidence:
              "Agent did not explain how enrollment affects current coverage. Must state the plan replaces current Medicare coverage.",
          };
        },
      },
      {
        id: "sob_all_disclosures",
        question:
          "Did the agent read all required disclosures for the determined plan of interest? (MA disclaimer, Part B premium, cancellation rights, EOC mention)",
        points: 4,
        evaluate: (state) => {
          if (state.sobOk)
            return {
              score: 100,
              evidence:
                "Agent completed SOB review including cancellation rights, SOB/EOC delivery information, and carrier contact details.",
            };
          return {
            score: 0,
            evidence:
              "Agent did not read all required plan disclosures. Must cover: cancellation rights, SOB/EOC delivery, Part B premium, and carrier contact information.",
          };
        },
      },
    ],
  },

  // ════════════════════════════════════════════════════
  // 7) CONSENT FOR ENROLLMENT
  // ════════════════════════════════════════════════════
  {
    name: "Consent for Enrollment",
    icon: "✍️",
    description: "Confirmation of enrollment readiness and plan details",
    cmsRef: "42 CFR § 422.2274(c)(9)(i); MMCM CH 2: 40.1.3, 40.2, 40.4.1",
    weight: 10,
    questions: [
      {
        id: "consent_plan_name",
        question:
          "Did the agent confirm the caller was ready to complete enrollment by stating the full plan name, type, and effective date?",
        points: 4,
        evaluate: (state) => {
          if (state.enrollOk) {
            const hasPlanName =
              state.notes?.planName && state.notes.planName.trim().length > 0;
            const hasEffDate =
              state.notes?.effectiveDate &&
              state.notes.effectiveDate.trim().length > 0;
            if (hasPlanName && hasEffDate)
              return {
                score: 100,
                evidence: `Agent confirmed enrollment in "${state.notes.planName}" with effective date ${state.notes.effectiveDate}.`,
              };
            if (hasPlanName || hasEffDate)
              return {
                score: 66,
                evidence:
                  "Enrollment completed but plan name or effective date may not have been fully confirmed. Agent must state the full plan name including plan type and effective date.",
              };
            return {
              score: 50,
              evidence:
                "Enrollment was marked complete but plan name and effective date were not entered. Agent should have stated the full plan name, plan type, and effective date subject to Medicare approval.",
            };
          }
          return {
            score: 0,
            evidence:
              "Enrollment was not completed. Agent must state full plan name, plan type, and effective date before enrolling.",
          };
        },
      },
      {
        id: "consent_verbal_consent",
        question:
          "Did the agent obtain explicit verbal consent to proceed with enrollment? ('Would you like to proceed?')",
        points: 4,
        evaluate: (state) => {
          if (state.enrollOk)
            return {
              score: 100,
              evidence:
                "Enrollment was completed. Agent asked the beneficiary to confirm they wish to proceed with enrollment.",
            };
          return {
            score: 0,
            evidence:
              "Verbal consent for enrollment was not obtained. Agent must ask 'Would you like to proceed?' and receive affirmative consent.",
          };
        },
      },
      {
        id: "consent_effective_date_conditional",
        question:
          "Did the agent state the effective date as 'subject to approval by Medicare' (not guaranteed)?",
        points: 3,
        evaluate: (state) => {
          if (state.enrollOk)
            return {
              score: 100,
              evidence:
                "Enrollment completed. Script includes 'subject to approval by Medicare' language for the effective date.",
            };
          return {
            score: 0,
            evidence:
              "Agent did not complete enrollment. Must state the proposed effective date is subject to approval by Medicare, not guaranteed.",
          };
        },
      },
    ],
  },

  // ════════════════════════════════════════════════════
  // 8) CALL CLOSING
  // ════════════════════════════════════════════════════
  {
    name: "Call Closing",
    icon: "📞",
    description: "Score of call closing",
    cmsRef: "42 CFR § 422.111(h)(1); MMCM CH 2: 40.2, 40.4.1",
    weight: 10,
    questions: [
      {
        id: "closing_confirmation_number",
        question:
          "Did the agent provide a confirmation/application number for the enrollment?",
        points: 3,
        evaluate: (state) => {
          const hasCode =
            state.notes?.enrollmentCode &&
            state.notes.enrollmentCode.trim().length > 0;
          if (hasCode)
            return {
              score: 100,
              evidence: `Enrollment confirmation number provided: ${state.notes.enrollmentCode}.`,
            };
          if (state.enrollOk)
            return {
              score: 25,
              evidence:
                "Enrollment was completed but no confirmation/application number was entered. Agent must read back the application number after submission.",
            };
          return {
            score: 0,
            evidence:
              "No confirmation number provided — enrollment not completed.",
          };
        },
      },
      {
        id: "closing_carrier_number",
        question:
          "Did the agent provide the carrier's customer service number (and TTY if available)?",
        points: 3,
        evaluate: (state) => {
          // If enrollment is complete, the script includes carrier number
          if (state.enrollOk)
            return {
              score: 100,
              evidence:
                "Enrollment section completed. Script includes providing carrier's customer service phone number and TTY.",
            };
          return {
            score: 0,
            evidence:
              "Agent did not reach the enrollment section where carrier customer service number is provided. Must give beneficiary a toll-free number with TTY service.",
          };
        },
      },
      {
        id: "closing_eoc_rights",
        question:
          "Did the agent mention EOC, cancellation rights, and appeal rights during wrap-up?",
        points: 2,
        evaluate: (state) => {
          // Wrap-up section covers these — but there's no explicit gate for it
          // If enrollment is complete and we've passed that point, give credit
          if (state.enrollOk)
            return {
              score: 100,
              evidence:
                "Enrollment completed and wrap-up section is accessible. Script includes EOC, cancellation rights, appeal rights, and 5-Star rating disclosures.",
            };
          return {
            score: 0,
            evidence:
              "Wrap-up disclosures not reached. Must mention EOC, right to cancel, right to appeal, and Medicare 5-Star rating system.",
          };
        },
      },
      {
        id: "closing_next_steps",
        question:
          "Did the agent explain next steps? (Welcome packet, ID card timeline, callback number)",
        points: 2,
        evaluate: (state) => {
          if (state.enrollOk)
            return {
              score: 100,
              evidence:
                "Enrollment section completed. Script includes mail timeline (7-10 business days), online access, and callback number.",
            };
          return {
            score: 0,
            evidence:
              "Agent did not reach the enrollment completion section. Must explain welcome packet arrival, ID card timeline, and provide a callback number.",
          };
        },
      },
    ],
  },

  // ════════════════════════════════════════════════════
  // 9) CONSUMER EXPERIENCE
  // ════════════════════════════════════════════════════
  {
    name: "Consumer Experience",
    icon: "🤝",
    description: "Overall consumer interaction quality",
    cmsRef: "CMS Quality Standards; Industry Best Practices",
    weight: 5,
    questions: [
      {
        id: "cx_call_duration",
        question:
          "Was the call duration adequate for a compliant enrollment? (≥ 8 minutes)",
        points: 3,
        evaluate: (state) => {
          const mins = getCallDurationMin(state);
          if (mins >= 15)
            return {
              score: 100,
              evidence: `Call duration: ${Math.round(
                mins
              )} minutes — thorough enrollment conversation.`,
            };
          if (mins >= 8)
            return {
              score: 100,
              evidence: `Call duration: ${Math.round(
                mins
              )} minutes — adequate for compliant enrollment.`,
            };
          if (mins >= 5)
            return {
              score: 50,
              evidence: `Call duration: ${Math.round(
                mins
              )} minutes — short for a full enrollment. Speed-to-enroll may be a concern.`,
            };
          if (mins > 0)
            return {
              score: 0,
              evidence: `Call duration: ${Math.round(
                mins
              )} minutes — too short for a compliant enrollment. CMS auditors flag speed-to-enroll under 8 minutes.`,
            };
          return {
            score: 0,
            evidence: "Call timer was not started — cannot assess duration.",
          };
        },
      },
      {
        id: "cx_section_order",
        question: "Were all sections completed in proper CMS-compliant order?",
        points: 3,
        evaluate: (state) => {
          const ts = state.sectionTimestamps || {};
          const sectionNums = Object.keys(ts)
            .map(Number)
            .filter((n) => ts[n]?.start)
            .sort((a, b) => ts[a].start - ts[b].start);
          if (sectionNums.length < 2)
            return {
              score: 100,
              evidence:
                "Section order check — insufficient data (likely early in call).",
            };
          let inOrder = true;
          for (let i = 1; i < sectionNums.length; i++) {
            if (sectionNums[i] < sectionNums[i - 1]) {
              inOrder = false;
              break;
            }
          }
          if (inOrder)
            return {
              score: 100,
              evidence:
                "All sections were completed in proper sequential order.",
            };
          return {
            score: 50,
            evidence:
              "Sections were completed out of the standard order. While not always a violation, CMS expects a logical flow from disclosure through enrollment.",
          };
        },
      },
      {
        id: "cx_warnings_volume",
        question:
          "Were compliance warnings minimal during the call? (Low AI co-pilot intervention needed)",
        points: 2,
        evaluate: (_state, entries) => {
          const warns = entries.filter(
            (e) => e.level === "warn" || e.level === "critical"
          );
          if (warns.length === 0)
            return {
              score: 100,
              evidence: "No compliance warnings triggered — clean call.",
            };
          if (warns.length <= 2)
            return {
              score: 75,
              evidence: `${warns.length} warning(s) triggered during the call — within acceptable range.`,
            };
          if (warns.length <= 5)
            return {
              score: 50,
              evidence: `${warns.length} warnings triggered — indicates multiple compliance gaps that needed correction.`,
            };
          return {
            score: 25,
            evidence: `${warns.length} warnings triggered — significant compliance concerns throughout the call.`,
          };
        },
      },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════
     MAIN SCORING FUNCTION
     ═══════════════════════════════════════════════════════════════ */

/**
 * scoreCompliance — Evaluate the session against all 9 categories.
 *
 * @param {object} scriptState    — The full script reducer state
 * @param {array}  copilotEntries — Array of copilot log entries
 * @returns {object} Full compliance report
 */
export function scoreCompliance(scriptState, copilotEntries = []) {
  const categories = [];
  let totalWeightedScore = 0;
  let totalWeight = 0;
  let totalPassed = 0;
  let totalQuestions = 0;
  const allFlags = [];

  for (const cat of CATEGORIES) {
    let catPointsEarned = 0;
    let catPointsMax = 0;
    const questionResults = [];

    for (const q of cat.questions) {
      const { score, evidence } = q.evaluate(scriptState, copilotEntries);
      const earned = Math.round((score / 100) * q.points * 100) / 100;
      catPointsEarned += earned;
      catPointsMax += q.points;
      totalQuestions++;

      const passed = score >= 75; // 75%+ = passed
      if (passed) totalPassed++;

      questionResults.push({
        id: q.id,
        question: q.question,
        points: q.points,
        earned: Math.round(earned * 100) / 100,
        score, // 0-100 percentage
        passed,
        evidence,
      });

      if (score < 75) {
        allFlags.push({
          id: q.id,
          question: q.question,
          category: cat.name,
          score,
          evidence,
          severity: score === 0 ? "high" : score < 50 ? "medium" : "low",
        });
      }
    }

    const catScore =
      catPointsMax > 0
        ? Math.round((catPointsEarned / catPointsMax) * 100)
        : 100;

    // Determine if this category passed (>=75%)
    const catPassed = catScore >= 75;

    categories.push({
      name: cat.name,
      icon: cat.icon,
      description: cat.description,
      cmsRef: cat.cmsRef,
      weight: cat.weight,
      score: catScore,
      passed: catPassed,
      pointsEarned: Math.round(catPointsEarned * 100) / 100,
      pointsMax: catPointsMax,
      questions: questionResults,
    });

    totalWeightedScore += (catScore / 100) * cat.weight;
    totalWeight += cat.weight;
  }

  const overallScore =
    totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 100) : 0;

  const categoriesPassed = categories.filter((c) => c.passed).length;

  return {
    score: overallScore,
    grade: getGrade(overallScore),
    categories,
    categoriesPassed,
    totalCategories: categories.length,
    totalPassed,
    totalQuestions,
    flags: allFlags,
    summary: getSummary(
      overallScore,
      allFlags,
      categoriesPassed,
      categories.length
    ),
  };
}

/* ═══════════════════════════════════════════════════════════════
     LIVE SCORE — Lightweight version for real-time dashboard
     Returns just the category scores and overall percentage
     ═══════════════════════════════════════════════════════════════ */
export function scoreLive(scriptState, copilotEntries = []) {
  const result = scoreCompliance(scriptState, copilotEntries);
  return {
    score: result.score,
    grade: result.grade,
    categoriesPassed: result.categoriesPassed,
    totalCategories: result.totalCategories,
    categories: result.categories.map((c) => ({
      name: c.name,
      icon: c.icon,
      score: c.score,
      passed: c.passed,
    })),
  };
}

/* ═══════════════════════════════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════════════════════════════ */

function getGrade(score) {
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 60) return "D";
  return "F";
}

function getSummary(score, flags, catsPassed, totalCats) {
  const highFlags = flags.filter((f) => f.severity === "high");
  if (score >= 90) {
    return `Excellent compliance — ${catsPassed} of ${totalCats} categories passed. All critical disclosures were completed and the enrollment followed CMS guidelines.`;
  }
  if (score >= 75) {
    if (highFlags.length > 0) {
      return `Good overall compliance (${catsPassed}/${totalCats} categories), but ${
        highFlags.length
      } high-priority item(s) need attention: ${highFlags
        .map((f) => f.question.split("?")[0])
        .slice(0, 3)
        .join("; ")}.`;
    }
    return `Good compliance — ${catsPassed} of ${totalCats} categories passed with minor areas for improvement.`;
  }
  if (score >= 50) {
    return `Below-standard compliance — only ${catsPassed} of ${totalCats} categories passed. ${flags.length} item(s) flagged — review required.`;
  }
  return `Critical compliance failure — ${catsPassed} of ${totalCats} categories passed. ${flags.length} item(s) flagged — this enrollment may not meet CMS requirements.`;
}

/** Group question results by category for PDF/display */
export function groupByCategory(categories) {
  // categories is already grouped — this is for backward compatibility
  const groups = {};
  for (const cat of categories) {
    groups[cat.name] = cat.questions;
  }
  return groups;
}

/** Get the CATEGORIES definition for external use (e.g., live dashboard) */
export function getCategoryDefinitions() {
  return CATEGORIES.map((c) => ({
    name: c.name,
    icon: c.icon,
    description: c.description,
    cmsRef: c.cmsRef,
    weight: c.weight,
    questionCount: c.questions.length,
  }));
}
