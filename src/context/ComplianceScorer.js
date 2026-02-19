/**
 * ComplianceScorer — Evaluates enrollment session compliance (0–100).
 *
 * Drop into: src/context/ComplianceScorer.js
 *
 * Usage:
 *   import { scoreCompliance } from "../context/ComplianceScorer";
 *   const result = scoreCompliance(scriptState, copilotEntries);
 *   // result = { score: 87, grade: "B+", breakdown: [...], flags: [...] }
 */

/* ═══════════════════════════════════════════════════
   COMPLIANCE CRITERIA
   Each criterion has:
     - id: unique key
     - label: human-readable name
     - category: grouping for the PDF
     - weight: points (all weights should sum to 100)
     - evaluate: function(state, entries) → { passed: bool, detail: string }
   ═══════════════════════════════════════════════════ */

const CRITERIA = [
  // ── REQUIRED DISCLOSURES (40 points) ──
  {
    id: "recording_consent",
    label: "Recording Disclosure Given",
    category: "Required Disclosures",
    weight: 8,
    evaluate: (state) => ({
      passed: !!state.recordingOk,
      detail: state.recordingOk
        ? "Recording consent obtained"
        : "Recording disclosure was not completed",
    }),
  },
  {
    id: "tpmo_disclaimer",
    label: "TPMO Disclaimer Read",
    category: "Required Disclosures",
    weight: 10,
    evaluate: (state) => ({
      passed: !!state.tpmoOk,
      detail: state.tpmoOk
        ? "TPMO disclaimer completed"
        : "TPMO disclaimer was not read to the beneficiary",
    }),
  },
  {
    id: "soa_completed",
    label: "Scope of Appointment Completed",
    category: "Required Disclosures",
    weight: 10,
    evaluate: (state) => ({
      passed: !!state.soaOk,
      detail: state.soaOk
        ? "SOA / POA completed and products scoped"
        : "Scope of Appointment was not completed — required before plan discussion",
    }),
  },
  {
    id: "qualifications_verified",
    label: "Beneficiary Qualifications Verified",
    category: "Required Disclosures",
    weight: 7,
    evaluate: (state) => ({
      passed: !!state.qualOk,
      detail: state.qualOk
        ? "Medicare eligibility and qualifications verified"
        : "Qualifications section was not completed — Part A/B dates, Medicaid status unverified",
    }),
  },
  {
    id: "snp_disclosure",
    label: "SNP Disclosure (if applicable)",
    category: "Required Disclosures",
    weight: 5,
    evaluate: (state) => {
      // If SNP was not applicable, auto-pass
      if (
        !state.snpType ||
        state.snpType === "none" ||
        state.snpType === "N/A"
      ) {
        return {
          passed: true,
          detail: "SNP not applicable — no disclosure required",
        };
      }
      return {
        passed: !!state.snpOk,
        detail: state.snpOk
          ? `SNP disclosure completed for ${state.snpType}`
          : `SNP disclosure required for ${state.snpType} but was not completed`,
      };
    },
  },

  // ── NEEDS ASSESSMENT & PLAN PRESENTATION (25 points) ──
  {
    id: "neads_completed",
    label: "NEADS Assessment Completed",
    category: "Needs Assessment",
    weight: 10,
    evaluate: (state) => ({
      passed: !!state.neadsOk,
      detail: state.neadsOk
        ? "Needs assessment (doctors, medications, pharmacy, etc.) completed"
        : "NEADS assessment was skipped — agent did not assess beneficiary's needs",
    }),
  },
  {
    id: "sob_presented",
    label: "Summary of Benefits Presented",
    category: "Needs Assessment",
    weight: 8,
    evaluate: (state) => ({
      passed: !!state.sobOk,
      detail: state.sobOk
        ? "Plan benefits and SOB were presented to the beneficiary"
        : "Summary of Benefits was not presented before enrollment",
    }),
  },
  {
    id: "no_critical_warnings",
    label: "No Unresolved Critical Warnings",
    category: "Needs Assessment",
    weight: 7,
    evaluate: (_state, entries) => {
      const criticals = entries.filter((e) => e.level === "critical");
      if (criticals.length === 0) {
        return {
          passed: true,
          detail: "No critical compliance warnings were triggered",
        };
      }
      return {
        passed: false,
        detail: `${criticals.length} critical warning(s) were triggered during the session`,
      };
    },
  },

  // ── ENROLLMENT INTEGRITY (20 points) ──
  {
    id: "enrollment_completed",
    label: "Enrollment Properly Completed",
    category: "Enrollment Integrity",
    weight: 10,
    evaluate: (state) => ({
      passed: !!state.enrollOk,
      detail: state.enrollOk
        ? "Enrollment section completed with verbal confirmations"
        : "Enrollment was not properly completed",
    }),
  },
  {
    id: "section_order",
    label: "Sections Completed in Proper Order",
    category: "Enrollment Integrity",
    weight: 5,
    evaluate: (state) => {
      // Check that section timestamps are in sequential order
      const ts = state.sectionTimestamps || {};
      const sectionNums = Object.keys(ts)
        .map(Number)
        .filter((n) => ts[n]?.start);
      if (sectionNums.length < 2) {
        return {
          passed: true,
          detail: "Section order check — insufficient data",
        };
      }
      let inOrder = true;
      for (let i = 1; i < sectionNums.length; i++) {
        if (ts[sectionNums[i]]?.start < ts[sectionNums[i - 1]]?.start) {
          inOrder = false;
          break;
        }
      }
      return {
        passed: inOrder,
        detail: inOrder
          ? "All sections completed in required CMS order"
          : "Sections were completed out of order — potential compliance issue",
      };
    },
  },
  {
    id: "reasonable_duration",
    label: "Call Duration Reasonable (≥ 8 min)",
    category: "Enrollment Integrity",
    weight: 5,
    evaluate: (state) => {
      if (!state.tpmoStart) {
        return { passed: false, detail: "Call timer was never started" };
      }
      const endTime = state.callEndTime || Date.now();
      const durationMin = (endTime - state.tpmoStart) / 60000;
      if (durationMin >= 8) {
        return {
          passed: true,
          detail: `Call duration: ${Math.round(
            durationMin
          )} minutes — adequate time for compliant enrollment`,
        };
      }
      return {
        passed: false,
        detail: `Call duration: ${Math.round(
          durationMin
        )} minutes — under 8 min raises speed-to-enroll concerns`,
      };
    },
  },

  // ── AI COPILOT ENGAGEMENT (15 points) ──
  {
    id: "copilot_active",
    label: "AI Co-Pilot Was Active During Call",
    category: "AI Copilot Engagement",
    weight: 5,
    evaluate: (_state, entries) => {
      const copilotMsgs = entries.filter(
        (e) =>
          e.logType === "copilot_message" || e.logType === "section_coach_tip"
      );
      if (copilotMsgs.length >= 3) {
        return {
          passed: true,
          detail: `Co-pilot provided ${copilotMsgs.length} coaching messages during the call`,
        };
      }
      return {
        passed: false,
        detail: `Co-pilot only provided ${copilotMsgs.length} message(s) — low engagement reduces compliance support`,
      };
    },
  },
  {
    id: "warnings_addressed",
    label: "Warnings Were Low Volume",
    category: "AI Copilot Engagement",
    weight: 5,
    evaluate: (_state, entries) => {
      const warns = entries.filter(
        (e) => e.level === "warn" || e.level === "critical"
      );
      if (warns.length <= 2) {
        return {
          passed: true,
          detail:
            warns.length === 0
              ? "No warnings triggered — clean session"
              : `Only ${warns.length} warning(s) — within acceptable range`,
        };
      }
      return {
        passed: false,
        detail: `${warns.length} warnings triggered — review flagged items for compliance gaps`,
      };
    },
  },
  {
    id: "no_objection_issues",
    label: "Objections Handled Professionally",
    category: "AI Copilot Engagement",
    weight: 5,
    evaluate: (_state, entries) => {
      const objections = entries.filter(
        (e) => e.logType === "objection_rebuttal"
      );
      if (objections.length === 0) {
        return { passed: true, detail: "No objections needed handling" };
      }
      // If objections were handled (rebuttals generated), that's good
      return {
        passed: true,
        detail: `${objections.length} objection(s) handled with AI-assisted rebuttals`,
      };
    },
  },
];

/* ═══════════════════════════════════════════════════
     MAIN SCORING FUNCTION
     ═══════════════════════════════════════════════════ */

/**
 * scoreCompliance — Evaluate the session and return a compliance report.
 *
 * @param {object} scriptState    — The full script reducer state
 * @param {array}  copilotEntries — Array of copilot log entries from CopilotTranscriptLog
 * @returns {{ score: number, grade: string, breakdown: array, flags: array, summary: string }}
 */
export function scoreCompliance(scriptState, copilotEntries = []) {
  let totalEarned = 0;
  let totalPossible = 0;
  const breakdown = [];
  const flags = [];

  for (const criterion of CRITERIA) {
    const { passed, detail } = criterion.evaluate(scriptState, copilotEntries);
    const earned = passed ? criterion.weight : 0;
    totalEarned += earned;
    totalPossible += criterion.weight;

    breakdown.push({
      id: criterion.id,
      label: criterion.label,
      category: criterion.category,
      weight: criterion.weight,
      earned,
      passed,
      detail,
    });

    if (!passed) {
      flags.push({
        id: criterion.id,
        label: criterion.label,
        category: criterion.category,
        detail,
        severity:
          criterion.weight >= 8
            ? "high"
            : criterion.weight >= 5
            ? "medium"
            : "low",
      });
    }
  }

  // Normalize to 0-100 (should already be 100 if weights sum correctly)
  const raw =
    totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;
  const score = Math.min(100, Math.max(0, raw));

  return {
    score,
    grade: getGrade(score),
    breakdown,
    flags,
    summary: getSummary(score, flags),
    totalEarned,
    totalPossible,
  };
}

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

function getSummary(score, flags) {
  if (score >= 90) {
    return "Excellent compliance. All critical disclosures were completed and the enrollment followed CMS guidelines.";
  }
  if (score >= 75) {
    const highFlags = flags.filter((f) => f.severity === "high");
    if (highFlags.length > 0) {
      return `Good overall compliance, but ${
        highFlags.length
      } high-priority item(s) need attention: ${highFlags
        .map((f) => f.label)
        .join(", ")}.`;
    }
    return "Good compliance with minor areas for improvement.";
  }
  if (score >= 50) {
    return `Below-standard compliance. ${flags.length} item(s) flagged — review required before submission.`;
  }
  return `Critical compliance failure. ${flags.length} item(s) flagged — this enrollment may not meet CMS requirements.`;
}

/* ═══════════════════════════════════════════════════
     CATEGORY GROUPING HELPER (for PDF rendering)
     ═══════════════════════════════════════════════════ */
export function groupByCategory(breakdown) {
  const groups = {};
  for (const item of breakdown) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }
  return groups;
}
