import { useState, useRef, useEffect, useCallback, memo } from "react";
import { useAppAuth } from "../context/AuthContext";
import { useScript } from "../context/ScriptContext";
import { SECTION_LABELS } from "../context/scriptReducer";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";
import {
  getCmsKnowledgeForQuestion,
  getCmsKnowledgeForSection,
} from "../context/CopilotCmsKnowledge";
import { fetchWithClerk } from "../lib/clerkFetch";
import { fetchTranscriptReferences } from "../lib/transcriptSearch";

function formatSectionDuration(timestamps, sectionNum) {
  const ts = timestamps?.[sectionNum];
  if (!ts?.start) return null;
  const end = ts.end || Date.now();
  const sec = Math.max(0, Math.round((end - ts.start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function buildSectionChecklistState(state, activeSection, unlocked) {
  const base = {
    activeSection,
    currentLabel: SECTION_LABELS[activeSection] || `Section ${activeSection}`,
    unlocked: {
      current:
        activeSection === 2.5 ? unlocked.s2_5 : unlocked[`s${String(activeSection).replace(".", "_")}`] ?? true,
    },
  };

  if (activeSection === 1) {
    return {
      ...base,
      gates: {
        recordingOk: state.recordingOk,
      },
      fields: {
        agentName: state.agentName || null,
      },
    };
  }

  if (activeSection === 2) {
    return {
      ...base,
      gates: {
        recordingOk: state.recordingOk,
        tpmoOk: state.tpmoOk,
      },
      fields: {
        tpmoZip: state.tpmoZip || null,
        tpmoOrgs: state.tpmoOrgs || null,
        tpmoPlans: state.tpmoPlans || null,
      },
    };
  }

  if (activeSection === 2.5) {
    return {
      ...base,
      gates: {
        tpmoOk: state.tpmoOk,
        snpOk: state.snpOk,
      },
      fields: {
        snpType: state.snpType || null,
      },
    };
  }

  if (activeSection === 3) {
    return {
      ...base,
      gates: {
        tpmoOk: state.tpmoOk,
        snpOk: state.snpType ? state.snpOk : null,
        soaOk: state.soaOk,
      },
    };
  }

  if (activeSection === 4) {
    return {
      ...base,
      gates: {
        soaOk: state.soaOk,
        qualOk: state.qualOk,
      },
      checklist: state.preEnrollChecks,
      fields: {
        snpType: state.snpType || null,
      },
    };
  }

  if (activeSection === 5) {
    return {
      ...base,
      gates: {
        qualOk: state.qualOk,
        neadsOk: state.neadsOk,
      },
      checklist: state.preEnrollChecks,
    };
  }

  if (activeSection === 6) {
    return {
      ...base,
      gates: {
        neadsOk: state.neadsOk,
        sobOk: state.sobOk,
      },
      checklist: state.sobChecks,
      fields: {
        partBReduction: state.partBReduction,
      },
    };
  }

  if (activeSection === 7) {
    return {
      ...base,
      gates: {
        sobOk: state.sobOk,
        enrollOk: state.enrollOk,
      },
      checklist: state.enrollChecks,
      fields: {
        planName: state.notes.planName || null,
        effectiveDate: state.notes.effectiveDate || null,
        enrollmentCode: state.notes.enrollmentCode || null,
      },
    };
  }

  if (activeSection === 8) {
    return {
      ...base,
      gates: {
        enrollOk: state.enrollOk,
      },
      optionalProducts: {
        hospitalIndemnity: {
          active: state.hiActive,
          consentOk: state.hiConsentOk,
          discussed: state.hiDiscussed,
        },
        dentalVision: {
          active: state.dvActive,
          consentOk: state.dvConsentOk,
          discussed: state.dvDiscussed,
        },
        finalExpense: {
          active: state.feActive,
          consentOk: state.feConsentOk,
          discussed: state.feDiscussed,
        },
      },
      fields: {
        confirmation: state.notes.confirmation || null,
      },
    };
  }

  return base;
}

function buildCompletedSectionHistory(state) {
  const ordered = [
    [1, "recordingOk"],
    [2, "tpmoOk"],
    [2.5, "snpOk"],
    [3, "soaOk"],
    [4, "qualOk"],
    [5, "neadsOk"],
    [6, "sobOk"],
    [7, "enrollOk"],
  ];

  return ordered
    .filter(([sectionNum, field]) =>
      sectionNum === 2.5 ? state.snpType && state[field] : state[field]
    )
    .map(([sectionNum, field]) => ({
      section: sectionNum,
      label: SECTION_LABELS[sectionNum],
      completed: true,
      duration: formatSectionDuration(state.sectionTimestamps, sectionNum),
      endedAt: state.sectionTimestamps?.[sectionNum]?.end || null,
      field,
    }))
    .slice(-3);
}

function buildDerivedSignals(state, activeSection, transcript, recentInterventions) {
  const recentText = transcript.toLowerCase();
  const currentTs = state.sectionTimestamps?.[activeSection] || {};

  return {
    transcriptLikelyStartedMidCall: Boolean(
      activeSection > 1 || recentInterventions.length > 0
    ),
    transcriptLikelyStartedMidSection: Boolean(
      currentTs.start && transcript.length > 0 && !currentTs.end
    ),
    agentMovedPastCurrentSection:
      activeSection === 1
        ? state.tpmoOk
        : activeSection === 2
        ? state.soaOk || state.snpOk
        : activeSection === 2.5
        ? state.soaOk
        : activeSection === 3
        ? state.qualOk
        : activeSection === 4
        ? state.neadsOk
        : activeSection === 5
        ? state.sobOk
        : activeSection === 6
        ? state.enrollOk
        : activeSection === 7
        ? Boolean(state.notes.confirmation || state.hiActive || state.dvActive || state.feActive)
        : false,
    likelyCoveredByParaphrase: {
      tpmoCore:
        recentText.includes("don't represent every plan") ||
        recentText.includes("do not offer every plan"),
      recordingConsent:
        recentText.includes("recorded line") ||
        recentText.includes("recorded for quality") ||
        recentText.includes("okay if i continue") ||
        recentText.includes("ok if i continue"),
    },
    planDataEntered: Boolean(state.notes.planName || state.notes.effectiveDate),
    enrollmentIdEntered: Boolean(state.notes.enrollmentCode),
    confirmationEntered: Boolean(state.notes.confirmation),
  };
}

function normalizeIssueTag(tag) {
  return (tag || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "")
    .replace(/[\s-]+/g, "_")
    .slice(0, 64);
}

function shouldSuppressDuplicateIssue(messages, section, issueTag) {
  if (!issueTag) return false;
  return messages.some(
    (entry) =>
      entry.issueTag === issueTag &&
      entry.section === section &&
      (entry.level === "warn" ||
        entry.level === "critical" ||
        entry.level === "remind")
  );
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function summarizeRetrievalTrace(trace) {
  if (!trace) return null;
  const topics = Array.isArray(trace.topics) ? trace.topics : [];
  const scenarios = Array.isArray(trace.scenarios) ? trace.scenarios : [];
  const sources = Array.isArray(trace.sources) ? trace.sources : [];

  if (!topics.length && !scenarios.length && !sources.length) return null;

  return {
    topTopics: topics.slice(0, 2),
    topScenarios: scenarios.slice(0, 1),
    sourceCount: sources.length,
  };
}
/**
 * ScriptPrompter — AI Script Prompter with Speech Recognition
 *
 * Drop into: src/components/ScriptPrompter.jsx
 * Then import in ScriptFlow.jsx and render above the sections:
 *
 *   import ScriptPrompter from "./ScriptPrompter";
 *   // inside return, after <MainTimer>:
 *   <ScriptPrompter />
 */

/* ═══════════════════════════════════════════════════════════════════
   INTERVENTION TUNING CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */
const COACHING_DEBOUNCE_MS = 6000; // wait 6s of silence before analyzing
const COACHING_COOLDOWN_MS = 30000; // minimum 30s between AI messages
const MIN_NEW_CHARS = 180; // need more new content before analyzing
const WARN_CONFIDENCE_FLOOR = 85;
const REMIND_CONFIDENCE_FLOOR = 75;

const HIGH_RISK_KEYWORDS = [
  "mislead",
  "guarantee",
  "best plan",
  "no cost",
  "free",
  "government",
  "cms violation",
  "illegal",
  "pressure",
  "threat",
  "tricare",
  "champva",
  "disqual",
  "not a government",
];

function isHighRiskIntervention(issueTag, message) {
  const haystack = `${issueTag || ""} ${message || ""}`.toLowerCase();
  return HIGH_RISK_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function shouldSuppressForNuance({
  level,
  issueTag,
  message,
  derivedSignals,
}) {
  if (level !== "warn" && level !== "remind") return false;
  if (isHighRiskIntervention(issueTag, message)) return false;

  // Do not push disclosure misses unless the call has clearly progressed.
  if (!derivedSignals?.agentMovedPastCurrentSection) return true;

  // If transcript likely already covers core paraphrases, avoid nudging.
  const tag = (issueTag || "").toLowerCase();
  if (
    tag.includes("tpmo") &&
    derivedSignals?.likelyCoveredByParaphrase?.tpmoCore
  ) {
    return true;
  }
  if (
    (tag.includes("record") || tag.includes("consent")) &&
    derivedSignals?.likelyCoveredByParaphrase?.recordingConsent
  ) {
    return true;
  }

  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   COMPLIANCE KNOWLEDGE MAP
   Extracted verbatim from every Section component. This is the
   source of truth the AI uses to know EXACTLY what the agent
   is supposed to say — key phrases, required disclosures, and
   red-flag patterns for each section.
   ═══════════════════════════════════════════════════════════════════ */
const COMPLIANCE_KNOWLEDGE = {
  "Recording Disclosure": {
    verbatimScript: [
      "Thank you for calling New Gen Health Solutions",
      "My name is [Agent Name]",
      "I am a licensed sales agent on a recorded line",
      "Who do I have the pleasure of speaking with",
      "Please know our call will be recorded for quality and training purposes",
      "is it ok if I continue",
    ],
    keyPhrasesToListenFor: [
      "new gen health solutions",
      "licensed",
      "sales agent",
      "recorded line",
      "recorded for quality",
      "training purposes",
      "ok if I continue",
      "is it okay",
      "may I continue",
      "permission to continue",
    ],
    requiredElements: [
      "Agent must identify themselves by full name",
      "Agent must state they are a licensed sales agent",
      "Agent must disclose this is a recorded line",
      "Agent must ask who they are speaking with (get client name)",
      "Agent must state the call is recorded for quality and training",
      "Agent must get verbal permission to continue",
    ],
    commonMistakes: [
      "Skipping the recording disclosure entirely and jumping straight to the pitch",
      "Not stating they are on a recorded line",
      "Not asking permission to continue after stating the call is recorded",
      "Forgetting to ask the client's name before proceeding",
      "Rushing through the disclosure without pausing for the client to respond",
    ],
    redFlags: [
      "Agent starts discussing plans or benefits before completing recording disclosure",
      "Agent does not mention recorded line or recorded for quality",
      "Agent does not ask for permission to continue",
      "Agent skips asking the client's name",
    ],
  },

  "TPMO Disclaimer": {
    verbatimScript: [
      "Can I please have your Zipcode",
      "May I have your First and Last Name",
      "May I have a phone number to call you back",
      "We do not offer every plan available in your area",
      "Currently we represent [number] organizations which offer [number] products in your area",
      "Please contact Medicare.gov, 1-800-MEDICARE, or your local State Health Insurance Program (SHIP) to get information on all of your options",
      "Plans are insured or covered by a Medicare Advantage (HMO, PPO, PFFS) organization with a Medicare contract",
      "and/or a Medicare-approved Part D sponsor",
      "Enrollment in the plan depends on the plan's contract renewal with Medicare",
    ],
    keyPhrasesToListenFor: [
      "zipcode",
      "zip code",
      "first and last name",
      "phone number",
      "call you back",
      "do not offer every plan",
      "not every plan",
      "don't offer every plan",
      "represent",
      "organizations",
      "products in your area",
      "medicare.gov",
      "1-800-medicare",
      "1 800 medicare",
      "state health insurance",
      "SHIP",
      "all of your options",
      "medicare contract",
      "part d sponsor",
      "contract renewal",
    ],
    requiredElements: [
      "Agent must collect the client's ZIP code",
      "Agent must collect the client's first and last name",
      "Agent must collect a callback phone number",
      "Agent must state 'we do not offer every plan available in your area' — THIS IS THE MOST CRITICAL LINE OF THE TPMO",
      "Agent must state the specific number of organizations and plans they represent for the client's area",
      "Agent must direct client to Medicare.gov, 1-800-MEDICARE, or SHIP for all options — THIS IS LEGALLY REQUIRED",
      "Agent must state plans are insured by organizations with a Medicare contract and/or Medicare-approved Part D sponsor",
      "Agent must mention enrollment depends on the plan's contract renewal with Medicare",
    ],
    commonMistakes: [
      "Reading the TPMO without filling in the actual number of organizations and plans for the client's ZIP — using a generic or wrong number",
      "Saying a generic number instead of looking up the real count in Sunfire for that ZIP",
      "Skipping the Medicare.gov / 1-800-MEDICARE / SHIP referral — this is legally required and CMS auditors look for it specifically",
      "Not collecting ZIP code before reading the disclaimer (you need ZIP to look up org/plan counts)",
      "Not collecting a callback number in case the call drops",
      "Skipping the 'contract renewal with Medicare' language at the end",
      "Rushing through the TPMO so fast that key phrases are unintelligible",
    ],
    redFlags: [
      "Agent does not say 'we do not offer every plan' or any equivalent language — this is the core TPMO requirement",
      "Agent does not mention Medicare.gov, 1-800-MEDICARE, or SHIP — CMS requires this referral",
      "Agent skips the organization/plan count entirely or uses placeholder numbers",
      "Agent does not collect ZIP, name, or callback number before proceeding",
      "Agent says something like 'we have the best plans' or 'we offer all plans' — this DIRECTLY CONTRADICTS the required TPMO language and is a serious CMS violation",
      "Agent moves to Scope of Appointment without completing the TPMO disclaimer",
    ],
  },

  "SNP Disclosure (DSNP)": {
    verbatimScript: [
      "In your area we do offer Dual Eligible Special Needs Plans",
      "These are plans specifically designed for individuals who have both Medicare and Medicaid",
      "Would you like to hear more about this plan",
      "Your ability to enroll in this special needs plan is based on verification that you are entitled to both Medicare and the qualifying level of Medicaid",
    ],
    keyPhrasesToListenFor: [
      "dual eligible",
      "special needs",
      "medicare and medicaid",
      "both medicare and medicaid",
      "verification",
      "qualifying level of medicaid",
      "entitled to both",
    ],
    requiredElements: [
      "Agent must mention these are Dual Eligible Special Needs Plans",
      "Agent must state plans are for individuals with both Medicare and Medicaid",
      "Agent must ask if the client wants to hear more",
      "Agent must state enrollment is based on verification of both Medicare and qualifying Medicaid",
    ],
    commonMistakes: [
      "Not confirming the client actually has full Medicaid (not just LIS/Extra Help — these are NOT the same)",
      "Skipping the verification language about being entitled to both Medicare and Medicaid",
      "Confusing LIS/Extra Help with full Medicaid eligibility",
    ],
    redFlags: [
      "Agent enrolls in DSNP without confirming Medicaid status",
      "Agent does not read the verification disclosure",
      "Agent tells the client they 'qualify' without proper verification language",
    ],
  },

  "SNP Disclosure (CSNP)": {
    verbatimScript: [
      "In your area we do offer Chronic Care Special Needs Plans",
      "These are plans specifically designed for individuals who have been diagnosed with certain chronic conditions such as diabetes or cardiovascular disease",
      "Would you like to hear more about this plan",
      "There is a physician verification process required to confirm your chronic condition by the end of the first month of enrollment in the new plan",
      "You are responsible for ensuring that the form is completed and returned",
      "If not completed, your enrollment in the C-SNP will be voided",
      "The process may vary by carrier. Please see your new member materials",
    ],
    keyPhrasesToListenFor: [
      "chronic care",
      "chronic condition",
      "special needs",
      "diabetes",
      "cardiovascular",
      "physician verification",
      "confirm your chronic condition",
      "end of the first month",
      "form is completed and returned",
      "enrollment will be voided",
      "voided",
    ],
    requiredElements: [
      "Agent must mention these are Chronic Care Special Needs Plans",
      "Agent must explain the physician verification process is required",
      "Agent must state the form must be completed by the end of the first month of enrollment",
      "Agent must warn that if not completed, enrollment in the C-SNP WILL BE VOIDED",
      "Agent must state the client is responsible for ensuring the form is completed and returned",
    ],
    commonMistakes: [
      "Not explaining the physician verification process clearly",
      "Not warning that enrollment will be voided if the form is not returned — clients MUST hear this",
      "Not emphasizing the end-of-first-month deadline",
      "Making the form sound optional when it is absolutely mandatory",
    ],
    redFlags: [
      "Agent skips the voiding warning entirely — this is a required disclosure",
      "Agent does not mention physician verification at all",
      "Agent makes the verification process sound optional",
    ],
  },

  "POA & Scope of Appointment": {
    verbatimScript: [
      "Are you interested in discussing Medicare options for yourself or for someone else, such as a family member, guardian or someone that you are authorized to make decisions for",
      "Are they available now or should we discuss at a later time when they are available",
      "You are not obligated to enroll in a plan",
      "agreeing to answer these questions does not affect your current enrollment",
      "nor will it enroll you in any Medicare Advantage Prescription Drug Plan, or other Medicare Plan",
      "Do I have your permission to discuss the plans in your area which may include Medicare Advantage plans, Prescription drug plans, and other types of plans like Stand-alone Dental plan, Stand-alone Vision plans, and Hospital Indemnity Plans today",
    ],
    keyPhrasesToListenFor: [
      "discussing medicare options",
      "for yourself or for someone else",
      "for yourself",
      "someone else",
      "family member",
      "guardian",
      "authorized to make decisions",
      "power of attorney",
      "available now",
      "not obligated",
      "not obligated to enroll",
      "does not affect your current",
      "will not enroll you",
      "won't enroll you",
      "permission to discuss",
      "medicare advantage",
      "prescription drug",
      "dental",
      "vision",
      "hospital indemnity",
      "do I have your permission",
    ],
    requiredElements: [
      "Agent must ask if the client is discussing for themselves or someone else (POA check)",
      "If for someone else, agent must ask if that person is available NOW or needs to reschedule",
      "Agent must state the client is NOT obligated to enroll",
      "Agent must state answering questions does NOT affect their current enrollment",
      "Agent must state this will NOT enroll them in any plan",
      "Agent must list ALL available product types: Medicare Advantage, Prescription Drug, Dental, Vision, Hospital Indemnity",
      "Agent must get verbal permission to discuss these products",
    ],
    commonMistakes: [
      "Skipping the POA question entirely — jumping straight to scope without asking if they're deciding for themselves",
      "Not listing ALL product types in the scope (commonly skip dental, vision, or hospital indemnity)",
      "Not clearly stating the client is not obligated to enroll",
      "Not getting clear verbal permission before proceeding to discuss plans",
      "If caller is calling for someone else who is not on the line, not rescheduling the call",
    ],
    redFlags: [
      "Agent starts discussing specific plans or plan benefits BEFORE getting SOA permission",
      "Agent only mentions one or two product types instead of listing all available types",
      "Agent does not say 'not obligated to enroll' or equivalent language",
      "Agent proceeds with enrollment discussion for a third party who is not on the call and not a POA",
    ],
  },

  Qualifications: {
    verbatimScript: [
      "Do you have or will soon have Medicare Parts A and B",
      "Can you please grab your Red, White and Blue Medicare card",
      "Can you tell me what it says on your card for the Part A and Part B effective dates",
      "Are you currently receiving any assistance with your Part B premium through Medicaid, or help for prescription coverage",
      "Do you mind confirming your permanent home address",
      "Are you a veteran",
      "Do you currently have other coverage such as employer coverage, retiree benefits, VA benefits, TRICARE for Life, or CHAMPVA",
      "In the last twelve months, have you gone to an emergency room or an urgent care center for medical care",
      "The Annual Election Period runs from October 15 through December 7",
      "Medicare Open Enrollment runs from January 1 through March 31",
      "You qualify for a Special Election Period",
    ],
    keyPhrasesToListenFor: [
      "parts a and b",
      "part a",
      "part b",
      "medicare card",
      "red white and blue",
      "effective dates",
      "part a effective",
      "part b effective",
      "medicaid",
      "assistance with your part b",
      "help with prescription",
      "extra help",
      "permanent home address",
      "home address",
      "mailing address",
      "veteran",
      "served in the military",
      "employer coverage",
      "retiree benefits",
      "retiree coverage",
      "va benefits",
      "tricare",
      "champva",
      "emergency room",
      "urgent care",
      "annual election",
      "open enrollment",
      "special election",
      "october 15",
      "december 7",
      "january 1",
      "march 31",
    ],
    requiredElements: [
      "Agent must confirm client has or will have Medicare Parts A and B",
      "Agent must ask for Medicare card or verify identity (name, DOB, SSN/Medicare ID)",
      "Agent must ask for AND READ BACK Part A and Part B effective dates to confirm them",
      "Agent must ask about Medicaid or Part B premium assistance or prescription help",
      "Agent must confirm permanent home address",
      "Agent must ask if they are a veteran (and thank them for their service if yes)",
      "Agent must ask about ALL types of other coverage: employer, retiree, VA, TRICARE for Life, CHAMPVA",
      "If client has disqualifying coverage (TRICARE for Life, CHAMPVA, active employer coverage), agent MUST politely end the call",
      "Agent must ask about ER/urgent care visits in last 12 months",
      "Agent must state which enrollment period applies and read the correct enrollment period statement (AEP, OEP/MA-OEP, or SEP)",
    ],
    commonMistakes: [
      "Not reading back Part A and Part B effective dates to confirm them — just writing them down without verbal confirmation",
      "Asking about 'other coverage' generically instead of listing each type (employer, retiree, VA, TRICARE, CHAMPVA)",
      "Continuing the enrollment after learning the client has TRICARE for Life, CHAMPVA, or active employer coverage — these are disqualifiers",
      "Not asking about Medicaid status — this affects DSNP eligibility",
      "Skipping the enrollment period statement entirely",
      "Not asking about ER/urgent care visits",
      "Not asking about veteran status",
    ],
    redFlags: [
      "Agent proceeds to NEADS or plan discussion without confirming Part A and Part B",
      "Agent does not ask about disqualifying coverage (employer, TRICARE for Life, CHAMPVA) — ALL must be asked",
      "Agent continues enrollment after client reveals they have TRICARE for Life, CHAMPVA, or active employer coverage",
      "Agent does not read back effective dates for verbal confirmation",
      "Agent does not state which enrollment period applies",
    ],
  },

  "NEADS Assessment": {
    verbatimScript: [
      "I am going to ask you a few quick questions to make sure I find the best plan for your needs",
      "Who is your current primary care physician",
      "Do you see any specialists? If so, who",
      "Is there a particular hospital or facility you want to make sure is covered",
      "What medications do you take regularly",
      "Which pharmacy do you use",
      "Is there anything specific about your current plan that you want to make sure your new plan has",
      "Let me summarize what we've covered. Does that sound right? Anything else I should know before we look at plans",
      "Some people also ask about dental, vision, or final expense coverage",
    ],
    keyPhrasesToListenFor: [
      "primary care",
      "physician",
      "doctor",
      "pcp",
      "who do you see",
      "specialists",
      "specialist",
      "do you see any",
      "hospital",
      "facility",
      "medications",
      "prescriptions",
      "what do you take",
      "what medications",
      "dosage",
      "dose",
      "milligrams",
      "mg",
      "pharmacy",
      "which pharmacy",
      "where do you fill",
      "summarize",
      "recap",
      "does that sound right",
      "anything else",
      "before we look at plans",
      "dental",
      "vision",
      "final expense",
      "in network",
      "network",
      "formulary",
      "covered",
    ],
    requiredElements: [
      "Agent must ask about primary care physician/doctor and confirm their location or network status",
      "Agent must ask about specialists",
      "Agent must ask about preferred hospital or facility",
      "Agent must ask about current medications — including confirming NAMES and DOSAGES (not just names)",
      "Agent must ask about preferred pharmacy",
      "Agent must ask what's important to them about their current coverage / what they want in a new plan",
      "Agent must summarize/recap everything collected and confirm with the client before moving to plan selection",
      "Agent should mention dental, vision, or final expense as options to discuss after enrollment",
    ],
    commonMistakes: [
      "Not confirming medication DOSAGES — just getting names is not sufficient for formulary checks",
      "Not looking up providers in Sunfire during the call to verify network status",
      "Skipping the summary/recap before moving to plan selection — client should confirm what was collected",
      "Not asking about pharmacy preference — this affects cost tiers",
      "Only asking about PCP and not asking about specialists",
      "Rushing through medications without getting complete information",
      "Not asking about hospital/facility preference",
    ],
    redFlags: [
      "Agent moves to plan selection without asking about doctors, medications, OR pharmacy — the core NEADS elements",
      "Agent does not ask about medications at all",
      "Agent does not ask about doctors/physicians at all",
      "Agent skips the recap/summary before moving to plan selection",
      "Agent recommends a plan without having assessed the client's needs first",
    ],
  },

  "Plan Selection & SOB": {
    verbatimScript: [
      "Based on your doctors, prescriptions, and what you told me matters most, [Plan Name] looks like a good option for you",
      "Here are the benefits of the plan",
      "Do you have any questions about the benefits we just reviewed",
      "You will receive your Summary of Benefits and Evidence of Coverage in the mail or by email if chosen during enrollment",
      "The Evidence of Coverage is a detailed explanation of all services covered by the carrier",
      "You have the right to cancel your plan at any time before the effective date by calling the carrier directly",
      "I will give you that number at the end of this call",
      "This plan includes a Part B premium reduction",
      "There may be a delay — it can take one or more payment cycles to take effect",
    ],
    keyPhrasesToListenFor: [
      "based on your doctors",
      "based on your prescriptions",
      "based on what you told me",
      "based on your needs",
      "good option",
      "good fit",
      "benefits of the plan",
      "here are the benefits",
      "summary of benefits",
      "evidence of coverage",
      "eoc",
      "questions about the benefits",
      "any questions",
      "right to cancel",
      "cancel your plan",
      "before the effective date",
      "carrier directly",
      "call the carrier",
      "part b premium reduction",
      "part b giveback",
      "premium reduction",
      "payment cycles",
      "premium",
      "deductible",
      "maximum out of pocket",
      "moop",
      "out of pocket maximum",
      "copay",
      "copayment",
      "coinsurance",
      "network",
      "in network",
      "out of network",
      "formulary",
      "tier",
      "referral",
      "prior authorization",
      "hmo",
      "ppo",
    ],
    requiredElements: [
      "Agent must present the plan recommendation connected to the client's stated needs from NEADS (doctors, meds, priorities)",
      "Agent must review the actual plan benefits — not just say 'it's a great plan'",
      "Agent must ask if the client has any questions about the benefits reviewed",
      "Agent must mention the client will receive SOB and EOC by mail or email",
      "Agent must explain that the EOC is a detailed explanation of all covered services",
      "Agent must state the client has the right to cancel at any time before the effective date by calling the carrier",
      "Agent must mention they'll provide the carrier's phone number at the end of the call",
      "If Part B reduction applies: Agent must explain the potential delay in premium reduction taking effect",
      "If Part B reduction applies: Agent must explain how the reduction appears (Social Security increase or bill credit)",
    ],
    commonMistakes: [
      "Presenting a plan without connecting it to what the client said during NEADS — it should feel personalized",
      "Not reviewing actual benefit details — just saying 'it's a great plan' or 'you'll love it'",
      "Not mentioning the right to cancel before effective date — this is CMS required",
      "Not mentioning SOB/EOC will be sent to the client",
      "Making guarantees about savings or outcomes without presenting actual numbers",
      "For Part B reduction: not explaining the potential delay in when the reduction takes effect",
      "For HMO plans: not explaining referral requirements and out-of-network limitations",
    ],
    redFlags: [
      "Agent makes comparative superiority claims like 'this plan is better than what you have' without presenting a side-by-side comparison — CMS prohibits unsubstantiated comparative statements",
      "Agent guarantees savings, outcomes, or specific dollar amounts without qualification",
      "Agent does not present any actual plan benefits, costs, or details — just makes vague claims",
      "Agent skips the cancellation rights disclosure entirely",
      "Agent pressures the client to enroll without answering their questions or giving them time",
      "Agent does not mention SOB/EOC delivery",
    ],
  },

  Enrollment: {
    verbatimScript: [
      "I can enroll you today over the telephone in this [plan name with plan code]",
      "Enrolling in this plan will replace your current [coverage type]",
      "Once approved by Medicare, your new coverage begins on [effective date]",
      "Would you like to proceed",
      "Your enrollment application has been successfully submitted",
      "Your application number is [application ID]",
      "[Carrier]'s Customer Service number is [phone and TTY]",
      "Your proposed effective date is [effective date], subject to approval by Medicare",
      "You will receive a notice in the mail acknowledging your enrollment",
      "Plan materials and your member ID card should arrive within 7 to 10 business days",
      "but no later than 10 days before your effective date",
      "You can also access materials online at [carrier URL]",
      "If you have any questions or your needs change, you can reach us at [EnrollHere number] or our office at [office number]",
    ],
    keyPhrasesToListenFor: [
      "enroll you today",
      "enroll you over the telephone",
      "over the phone",
      "plan name",
      "plan code",
      "contract number",
      "replace your current",
      "replace your",
      "will replace",
      "would you like to proceed",
      "like to move forward",
      "ready to enroll",
      "approved by medicare",
      "effective date",
      "subject to approval",
      "subject to medicare approval",
      "application has been submitted",
      "successfully submitted",
      "application number",
      "application id",
      "confirmation number",
      "customer service",
      "customer service number",
      "member services",
      "notice in the mail",
      "member id card",
      "7 to 10 business days",
      "seven to ten",
      "10 days before",
      "access materials online",
      "access online",
      "reach us at",
      "call us at",
      "our number",
    ],
    requiredElements: [
      "Agent must state the FULL plan name and plan code (not just 'this plan')",
      "Agent must clearly state this plan will REPLACE their current coverage — this is legally critical",
      "Agent must state the effective date AND that it is SUBJECT TO APPROVAL by Medicare (not guaranteed)",
      "Agent must ask 'would you like to proceed' or equivalent — get EXPLICIT verbal consent to enroll",
      "After submission: Agent must read back the application/confirmation number",
      "Agent must provide the carrier's customer service phone number (and TTY if available)",
      "Agent must restate proposed effective date, subject to approval by Medicare",
      "Agent must explain mail timeline: enrollment acknowledgment notice first, then ID card within 7-10 business days",
      "Agent must mention materials can be accessed online",
      "Agent must provide callback/office number for future questions",
    ],
    commonMistakes: [
      "Not stating the full plan name and plan code — just saying 'this plan' or 'the plan we discussed'",
      "Not clearly stating the plan REPLACES current coverage — clients must understand this",
      "Not getting explicit verbal consent to proceed ('would you like to proceed?' or 'are you ready to enroll?')",
      "Not reading back the application/confirmation number clearly after submission",
      "Not providing the carrier's customer service number",
      "Not explaining the mail timeline for receiving enrollment materials",
      "Saying the effective date is guaranteed or confirmed instead of 'subject to approval by Medicare'",
      "Bundling multiple confirmations together instead of getting them one at a time",
    ],
    redFlags: [
      "Agent enrolls without getting explicit verbal consent — this is a major CMS violation",
      "Agent does not state the plan replaces current coverage — beneficiary must understand this before enrolling",
      "Agent states the effective date as guaranteed/confirmed instead of 'subject to approval by Medicare'",
      "Agent does not read back the application number after submission",
      "Agent bundles multiple required confirmations into one question instead of separate confirmations",
      "Agent does not provide carrier customer service number — beneficiary must have this",
      "Agent rushes through post-enrollment disclosures",
    ],
  },

  "Wrap-Up": {
    verbatimScript: [
      "You will receive an Evidence of Coverage (EOC) document that explains all of the plan's benefits, costs, and rules in detail",
      "You have the right to cancel this plan before it becomes effective if you change your mind",
      "Once you are a member, you have the right to appeal plan decisions about payment of benefits or coverage of services if you disagree",
      "This is explained in the Evidence of Coverage",
      "Medicare evaluates plans yearly using a 5-Star rating system",
      "You can review the plan's Star Rating and Summary of Benefits on Medicare.gov or the plan's website",
      "The plan's proposed effective date is [effective date], subject to approval by Medicare",
      "If you have any questions about your plan or if your needs change and you want to look at other plan options, please give me a call at 877-909-1995",
      "These are separate from Medicare and completely optional",
    ],
    keyPhrasesToListenFor: [
      "evidence of coverage",
      "eoc",
      "right to cancel",
      "cancel this plan",
      "before it becomes effective",
      "change your mind",
      "right to appeal",
      "appeal plan decisions",
      "appeal",
      "5 star",
      "five star",
      "star rating",
      "medicare.gov",
      "plan's website",
      "proposed effective date",
      "subject to approval",
      "877-909-1995",
      "give me a call",
      "call me at",
      "separate from medicare",
      "not a medicare plan",
      "not affiliated with medicare",
      "completely optional",
      "optional",
      "not medicare",
    ],
    requiredElements: [
      "Agent must mention the EOC document and explain it covers benefits, costs, and rules",
      "Agent must state the client's right to cancel before the plan becomes effective",
      "Agent must mention the right to appeal plan decisions about payments or coverage",
      "Agent must mention Medicare's 5-Star rating system and where to review it (Medicare.gov or plan website)",
      "Agent must restate the proposed effective date, subject to approval by Medicare",
      "Agent must provide callback number (877-909-1995 or office number)",
      "For ANY optional product discussion (hospital indemnity, dental/vision, final expense): Agent must FIRST clearly state the product is NOT a Medicare plan and is NOT affiliated with Medicare",
      "For optional products: Agent must get SEPARATE verbal permission before discussing each optional product",
      "Agent must NOT discuss optional products until ALL required Medicare wrap-up disclosures are complete",
    ],
    commonMistakes: [
      "Skipping the EOC disclosure, cancellation rights, or appeal rights — all three are required",
      "Not mentioning the 5-Star rating system — CMS requires this",
      "Jumping into optional products (hospital indemnity, dental, final expense) before completing all required wrap-up disclosures",
      "Discussing optional products without FIRST clearly stating they are NOT Medicare and NOT affiliated with Medicare",
      "Not getting separate verbal consent before discussing each optional product",
      "Making optional products sound like they are part of the Medicare enrollment",
      "Rushing through wrap-up to get to optional product sales",
    ],
    redFlags: [
      "Agent discusses optional products without first clearly stating they are NOT Medicare and NOT affiliated with Medicare — this is a MAJOR CMS violation that can result in sanctions",
      "Agent implies optional products are part of the Medicare enrollment or included in the plan",
      "Agent does not mention the right to cancel",
      "Agent does not mention the right to appeal",
      "Agent does not mention the EOC",
      "Agent pressures client into optional products before completing all required Medicare wrap-up disclosures",
      "Agent bundles optional product discussion with Medicare wrap-up, making it unclear what is Medicare and what is not",
    ],
  },
};

/* ── level → style map ── */
const LEVEL_STYLE = {
  info: {
    icon: "💡",
    color: "#38bdf8",
    bg: "rgba(56,189,248,0.08)",
    border: "rgba(56,189,248,0.25)",
  },
  remind: {
    icon: "🔔",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.08)",
    border: "rgba(167,139,250,0.25)",
  },
  tip: {
    icon: "✅",
    color: "#34d399",
    bg: "rgba(52,211,153,0.08)",
    border: "rgba(52,211,153,0.25)",
  },
  warn: {
    icon: "⚠️",
    color: "#fbbf24",
    bg: "rgba(251,191,36,0.08)",
    border: "rgba(251,191,36,0.35)",
  },
  critical: {
    icon: "🚨",
    color: "#f87171",
    bg: "rgba(248,113,113,0.1)",
    border: "rgba(248,113,113,0.5)",
  },
};

const ScriptPrompter = memo(function ScriptPrompter({ onTranscriptChange }) {
  const {
    state,
    activeSection,
    unlocked,
    preEnrollAllDone,
    sobAllDone,
    enrollAllDone,
    enrollmentCodeOk,
  } = useScript();
  const { logEntry, setEntryFeedback, exportFeedbackDataset } = useCopilotLog();
  const { getToken } = useAppAuth();
  const currentStep =
    SECTION_LABELS[activeSection] || `Section ${activeSection}`;

  /* ═══════ speech recognition ═══════ */
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef(null);
  const transcriptRef = useRef(""); // always current for async callbacks

  /* ═══════ AI assistant feed ═══════ */
  const [messages, setMessages] = useState([]); // [{id, level, text, ts}]
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [floatingAlert, setFloatingAlert] = useState(null); // {level, text}
  const debounceRef = useRef(null);
  const floatTimeout = useRef(null);
  const feedRef = useRef(null);
  const lastCoachingTime = useRef(0);
  const lastAnalyzedLength = useRef(0);

  /* ═══════ Q&A search bar ═══════ */
  const [askQuestion, setAskQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);

  /* ═══════ collapsible ═══════ */
  const [expanded, setExpanded] = useState(true);

  /* ─── keep transcriptRef in sync ─── */
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    if (onTranscriptChange) onTranscriptChange(transcript);
  }, [transcript, onTranscriptChange]);

  /* ─── browser support ─── */
  const supportsRecognition =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  /* ─── start / stop ─── */
  const startListening = useCallback(() => {
    if (!supportsRecognition) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    let processedUpTo = 0;

    recognition.onresult = (event) => {
      let newFinal = "";
      let interim = "";
      for (let i = processedUpTo; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          newFinal += r[0].transcript + " ";
          processedUpTo = i + 1;
        } else interim += r[0].transcript;
      }
      if (newFinal) {
        setTranscript((prev) => prev + newFinal);
        setInterimText("");
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(
          () => requestCoaching(),
          COACHING_DEBOUNCE_MS
        );
      }
      if (interim) setInterimText(interim);
    };

    recognition.onerror = (e) => {
      console.error("SpeechRecognition error:", e.error);
      if (e.error !== "no-speech") setListening(false);
    };
    recognition.onend = () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {
          /* already running */
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [supportsRecognition]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
    clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => () => stopListening(), [stopListening]);

  /* ─── auto-scroll feed ─── */
  useEffect(() => {
    if (feedRef.current)
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages]);

  /* ─── show floating alert for warn/critical ─── */
  const showFloat = useCallback(
    (level, text) => {
      if (level !== "warn" && level !== "critical") return;
      clearTimeout(floatTimeout.current);
      setFloatingAlert({ level, text });
      logEntry(LOG_TYPES.FLOATING_ALERT, level, text, { section: currentStep });
      floatTimeout.current = setTimeout(
        () => setFloatingAlert(null),
        level === "critical" ? 10000 : 6000
      );
    },
    [logEntry, currentStep]
  );

  /* ═══════════════════════════════════════════════════════════════
     AI CO-PILOT — COMPLIANCE-FOCUSED REAL-TIME MONITOR
     ═══════════════════════════════════════════════════════════════ */
  const requestCoaching = useCallback(async () => {
    const fullTranscript = transcriptRef.current.trim();
    if (!fullTranscript || coachingLoading) return;

    // ── Gate 1: Cooldown ──
    const now = Date.now();
    if (now - lastCoachingTime.current < COACHING_COOLDOWN_MS) return;

    // ── Gate 2: Minimum new content ──
    const newChars = fullTranscript.length - lastAnalyzedLength.current;
    if (newChars < MIN_NEW_CHARS) return;

    const previousAnalyzedLength = lastAnalyzedLength.current;
    setCoachingLoading(true);
    lastAnalyzedLength.current = fullTranscript.length;

    // ── Build section-specific compliance context ──
    const sectionKey = currentStep;
    const knowledge = COMPLIANCE_KNOWLEDGE[sectionKey] || null;
    const flowOrder = Object.values(SECTION_LABELS).join(" -> ");
    const recentInterventions = messages
      .filter((entry) =>
        entry.level === "warn" ||
        entry.level === "critical" ||
        entry.level === "remind"
      )
      .slice(-3);
    const recentInterventionText = recentInterventions
      .map(
        (entry, index) =>
          `${index + 1}. [${entry.level}] ${entry.text.replace(/\s+/g, " ").slice(0, 220)}`
      )
      .join("\n");
    const transcriptCurrentWindow = fullTranscript.slice(-1400);
    const transcriptSinceLastAnalysis = fullTranscript
      .slice(Math.max(0, previousAnalyzedLength - 800))
      .trim();
    const priorCompletedSections = buildCompletedSectionHistory(state);
    const sectionChecklistState = buildSectionChecklistState(
      state,
      activeSection,
      unlocked
    );
    const callMetadata = {
      agentName: state.agentName || null,
      snpType: state.snpType || null,
      tpmoZip: state.tpmoZip || null,
      tpmoOrgs: state.tpmoOrgs || null,
      tpmoPlans: state.tpmoPlans || null,
      partBReduction: state.partBReduction,
      planName: state.notes.planName || null,
      effectiveDate: state.notes.effectiveDate || null,
      enrollmentCode: state.notes.enrollmentCode || null,
      confirmation: state.notes.confirmation || null,
      checklistCompletion: {
        preEnrollAllDone,
        sobAllDone,
        enrollAllDone,
        enrollmentCodeOk,
      },
    };
    const derivedSignals = buildDerivedSignals(
      state,
      activeSection,
      fullTranscript,
      recentInterventions
    );
    const copilotContext = {
      currentSection: {
        number: activeSection,
        label: sectionKey,
      },
      callMetadata,
      sectionChecklistState,
      priorCompletedSections,
      recentInterventions: recentInterventions.map((entry) => ({
        level: entry.level,
        text: entry.text,
        issueTag: entry.issueTag || "",
        time: entry.ts,
      })),
      transcriptWindows: {
        currentWindow: transcriptCurrentWindow,
        sinceLastAnalysis: transcriptSinceLastAnalysis || transcriptCurrentWindow,
        fullTranscriptTail: fullTranscript.slice(-2500),
      },
      derivedSignals,
    };
    const cmsKnowledge = getCmsKnowledgeForSection(sectionKey, copilotContext);
    const transcriptReferenceQuery = [
      `Section: ${sectionKey}`,
      transcriptSinceLastAnalysis || transcriptCurrentWindow,
    ]
      .filter(Boolean)
      .join("\n\n");
    const transcriptReferenceResult = await fetchTranscriptReferences({
      getToken,
      query: transcriptReferenceQuery,
      productLine: "MA",
      matchCount: 5,
      similarityThreshold: 0.7,
    });
    const retrievalTrace = {
      topics: cmsKnowledge.topics.map((topic) => topic.id),
      scenarios: cmsKnowledge.scenarios.map((scenario) => scenario.id),
      sources: [
        ...cmsKnowledge.sources.map((source) => `cms:${source.id}`),
        ...transcriptReferenceResult.sources.map((source) => `call:${source}`),
      ],
      transcriptReferenceCount: transcriptReferenceResult.results.length,
      transcriptReferenceError: transcriptReferenceResult.error || null,
    };

    let complianceContext = "";
    if (knowledge) {
      complianceContext = `
════════════════════════════════════════════════════════
SECTION-SPECIFIC COMPLIANCE INTELLIGENCE: "${sectionKey}"
════════════════════════════════════════════════════════

VERBATIM SCRIPT LINES THE AGENT SHOULD BE SAYING (or close paraphrases — speech recognition may garble words slightly):
${knowledge.verbatimScript.map((line, i) => `  ${i + 1}. "${line}"`).join("\n")}

KEY PHRASES TO LISTEN FOR (if you hear these or close synonyms/paraphrases in the transcript, the agent IS covering the requirement — give them credit):
${knowledge.keyPhrasesToListenFor.map((p) => `  • "${p}"`).join("\n")}

REQUIRED COMPLIANCE ELEMENTS — every one of these MUST be covered in this section:
${knowledge.requiredElements.map((r, i) => `  ${i + 1}. ${r}`).join("\n")}

COMMON AGENT MISTAKES IN THIS SECTION (watch for these):
${knowledge.commonMistakes.map((m) => `  ⚠ ${m}`).join("\n")}

RED FLAGS — IF YOU DETECT ANY OF THESE, INTERVENE IMMEDIATELY (warn or critical):
${knowledge.redFlags.map((f) => `  🚨 ${f}`).join("\n")}
`;
    }

    const systemPrompt = `You are an expert CMS Medicare enrollment compliance monitor embedded in a live call at New Gen Health Solutions. You analyze the agent's speech in real time and ONLY intervene when there is a genuine compliance issue, a missed required disclosure, or something the agent needs to correct RIGHT NOW.

════════════════════════════════════════════════════════
CRITICAL AUDIO CONSTRAINT — THIS IS NON-NEGOTIABLE
════════════════════════════════════════════════════════
You can ONLY hear the AGENT speaking. The transcript contains ONLY the agent's words captured through their microphone. You have ZERO access to what the client/beneficiary says, asks, confirms, or agrees to.

IMPLICATIONS — read carefully:
- Evaluate compliance ONLY based on what the AGENT said or failed to say
- When the agent repeats/confirms information ("So your Part B started March 2010..."), that tells you what the client likely said — grade the AGENT's handling, not the client's responses
- NEVER say "the client didn't give consent" or "the client didn't confirm" — YOU CANNOT HEAR THE CLIENT
- DO say "I didn't hear you ask for their verbal consent" or "Make sure you read the disclosure"
- When the agent reads back information, confirms details, or paraphrases — that's GOOD compliance behavior. Acknowledge it by referencing their specific words.
- Speech recognition is imperfect. Words may be garbled, truncated, or slightly wrong. If something SOUNDS CLOSE ENOUGH to a required phrase, GIVE THE AGENT CREDIT. Don't flag something as missing just because a word or two was garbled. Use semantic matching, not exact text matching.
- The agent may have started speaking with the beneficiary BEFORE pressing record or before this transcript segment began. That means earlier required lines may have happened off-transcript. Absence in the visible transcript is NOT proof they were skipped.
- Because the transcript may begin mid-call or mid-section, do NOT assume the first visible line is the true start of the section. Only warn when the agent is clearly moving forward without covering something, not merely because you did not hear the opening.

════════════════════════════════════════════════════════
CURRENT SECTION: "${sectionKey}"
════════════════════════════════════════════════════════
FULL FLOW REFERENCE:
${flowOrder}

${complianceContext}
${cmsKnowledge.promptBlock}
${transcriptReferenceResult.contextBlock}
${
  recentInterventionText
    ? `════════════════════════════════════════════════════════
RECENT PRIOR INTERVENTIONS — DO NOT REPEAT THESE UNLESS THERE IS SUBSTANTIAL NEW CONTENT AND THE ISSUE STILL CLEARLY REMAINS:
════════════════════════════════════════════════════════
${recentInterventionText}
`
    : ""
}
════════════════════════════════════════════════════════
STRUCTURED CALL CONTEXT — TREAT THIS AS RELIABLE APP STATE
════════════════════════════════════════════════════════
${JSON.stringify(copilotContext, null, 2)}

════════════════════════════════════════════════════════
YOUR ROLE: SILENT COMPLIANCE SAFETY NET
════════════════════════════════════════════════════════

DEFAULT STATE: SILENT. You are monitoring, not commentating. You do NOT need to respond to every transcript update. Silence means everything is fine.

ONLY break silence for:

1. **COMPLIANCE VIOLATION (critical)**: Agent said something non-compliant, made an illegal claim, or violated CMS rules. Quote what they said and provide the exact correction.

2. **MISSED REQUIRED DISCLOSURE (warn)**: Use this ONLY with high confidence. Agent must be clearly moving forward, the element must be materially missing, and the transcript must not contain a close paraphrase. Name the specific element missed and give the exact script language to say now.

3. **IMPORTANT REMINDER (remind)**: Use sparingly. Agent is clearly near transition and a key element is still likely uncovered. If uncertain, choose silent.

4. **POSITIVE REINFORCEMENT (tip)**: Agent nailed a critical compliance element exceptionally well. ONLY use this occasionally (once every few minutes at most). MUST reference the SPECIFIC words or disclosure the agent said well and WHY it matters for compliance.

5. **SILENCE (silent)**: Agent is doing fine, covering requirements correctly, or there's nothing actionable to say. THIS IS YOUR DEFAULT. Use this 70-80% of the time. When in doubt, choose silent.

PRIORITY WEIGHTING:
- Prioritize risky language and compliance-danger behaviors over missing-word disclosure checks.
- Do not escalate on technical wording misses if the semantic intent appears covered.

════════════════════════════════════════════════════════
RESPONSE QUALITY REQUIREMENTS
════════════════════════════════════════════════════════

Every non-silent response MUST:
- QUOTE or PARAPHRASE the agent's actual words from the transcript (e.g., "When you said '...'", "You mentioned '...'", "I heard you say '...'")
- Be SPECIFIC to this exact moment in the call — never generic
- For warn/critical: State WHAT was missed or wrong, WHY it's a compliance issue (reference CMS if relevant), and provide the EXACT SCRIPT LANGUAGE to say right now to fix it (2-4 sentences)
- For remind: State what hasn't been covered yet and give the exact words to say (1-2 sentences)
- For tip: Name the specific disclosure or phrase that was handled well and why CMS cares about it (1-2 sentences)
- If you use transcript references, include bracket citations like [R1] or [R2] at the end of the message

CRITICAL NUANCE — AVOIDING FALSE POSITIVES:
- Do NOT claim the agent "skipped an entire section" just because the transcript is limited. Speech recognition only captures what it picks up. If the agent IS in the right section and IS talking about relevant topics, they are likely covering the requirements.
- Do NOT flag individual words as missing if the agent's overall message semantically covers the requirement. "We don't represent every plan out there" covers "We do not offer every plan available in your area."
- Do NOT repeatedly flag the same issue. If you already warned about something, don't warn again unless the agent has said significant new content and still hasn't addressed it.
- ALWAYS look at the full context of the transcript before deciding something was missed. The agent may have covered it earlier in the transcript.
- Before issuing a warn/remind, ask yourself: "Could this have happened before recording started or before this transcript chunk began?" If yes, bias toward silence unless the agent is clearly advancing past the requirement right now.
- Prefer one high-quality intervention over multiple repetitive ones. Rewording the same warning is still repetition and should be avoided.
- Use the structured checklist state to identify the exact unresolved item when possible. If app state says an item is already complete, do not warn that it is missing unless the transcript shows a clear contradiction.
- Use prior completed sections and call metadata to understand progression. If a later section is already completed in app state, do not accuse the agent of still being stuck on an earlier section.
- When you intervene, target the smallest missing piece, not a whole section, unless the whole section is clearly absent.
- Anchor interventions to the CURRENT call moment: reference what the agent is saying now and the current section's state instead of generic section reminders.

════════════════════════════════════════════════════════
RESPONSE FORMAT
════════════════════════════════════════════════════════
Respond with ONLY a valid JSON object — no markdown, no backticks, no extra text:
{
  "level": "silent | tip | remind | warn | critical",
  "issue_tag": "short_snake_case_issue_tag_or_empty_if_silent_or_tip",
  "confidence": 0,
  "message": "Your message here. Empty string if silent."
}`;

    try {
      const response = await fetchWithClerk(getToken, "/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 350,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `AGENT-ONLY TRANSCRIPT (you CANNOT hear the client — only the agent's words appear below. Speech recognition may have minor transcription errors.)

TRANSCRIPT WINDOW — MOST RECENT:
"${transcriptCurrentWindow}"

TRANSCRIPT WINDOW — SINCE LAST ANALYSIS:
"${transcriptSinceLastAnalysis || transcriptCurrentWindow}"

FULL TRANSCRIPT TAIL:
"${fullTranscript.slice(-2500)}"`,
            },
          ],
        }),
      });
      const data = await response.json();
      const raw = data.content
        ?.map((b) => (b.type === "text" ? b.text : ""))
        .filter(Boolean)
        .join("")
        .trim();

      let level = "info",
        message = "",
        issueTag = "",
        confidence = null;
      try {
        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
        level = parsed.level || "info";
        message = parsed.message || "";
        const parsedConfidence = Number(parsed.confidence);
        confidence = Number.isFinite(parsedConfidence) ? parsedConfidence : null;
        issueTag =
          normalizeIssueTag(parsed.issue_tag) ||
          normalizeIssueTag(message.split(/[.:!?]/)[0]);
      } catch {
        message = raw || "";
        issueTag = normalizeIssueTag(message.split(/[.:!?]/)[0]);
      }

      // ── Silent or empty = no intervention needed ──
      if (level === "silent" || !message || !message.trim()) {
        lastCoachingTime.current = Date.now();
        setCoachingLoading(false);
        return;
      }

      if (
        (level === "warn" || level === "critical" || level === "remind") &&
        shouldSuppressDuplicateIssue(messages, currentStep, issueTag)
      ) {
        lastCoachingTime.current = Date.now();
        setCoachingLoading(false);
        return;
      }

      if (
        (level === "warn" || level === "remind") &&
        shouldSuppressForNuance({
          level,
          issueTag,
          message,
          derivedSignals,
        })
      ) {
        lastCoachingTime.current = Date.now();
        setCoachingLoading(false);
        return;
      }

      if (
        level === "warn" &&
        confidence !== null &&
        confidence < WARN_CONFIDENCE_FLOOR
      ) {
        lastCoachingTime.current = Date.now();
        setCoachingLoading(false);
        return;
      }

      if (
        level === "remind" &&
        confidence !== null &&
        confidence < REMIND_CONFIDENCE_FLOOR
      ) {
        lastCoachingTime.current = Date.now();
        setCoachingLoading(false);
        return;
      }

      lastCoachingTime.current = Date.now();

      const entry = {
        id: Date.now(),
        level,
        text: message,
        issueTag,
        section: currentStep,
        contextSnapshot: copilotContext,
        retrievalTrace,
        ts: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev.slice(-19), entry]);
      showFloat(level, message);
      logEntry(LOG_TYPES.COPILOT_MSG, level, message, {
        section: currentStep,
        issueTag,
        contextSnapshot: copilotContext,
        retrievalTrace,
      });
    } catch (err) {
      console.error("Coaching API error:", err);
    } finally {
      setCoachingLoading(false);
    }
  }, [
    activeSection,
    currentStep,
    coachingLoading,
    showFloat,
    logEntry,
    getToken,
    messages,
    state,
    unlocked,
    preEnrollAllDone,
    sobAllDone,
    enrollAllDone,
    enrollmentCodeOk,
  ]);

  /* ═══════════════════════════════════════════════════════════════
     ASK CO-PILOT — Agent types a question mid-call
     ═══════════════════════════════════════════════════════════════ */
  const askCopilot = useCallback(async () => {
    const question = askQuestion.trim();
    if (!question || askLoading) return;

    setAskLoading(true);

    const sectionKey = currentStep;
    const knowledge = COMPLIANCE_KNOWLEDGE[sectionKey] || null;
    const recentTranscript = transcriptRef.current.trim().slice(-1500);
    const recentInterventions = messages
      .filter((entry) =>
        entry.level === "warn" ||
        entry.level === "critical" ||
        entry.level === "remind"
      )
      .slice(-4);
    const copilotContext = {
      currentSection: {
        number: activeSection,
        label: sectionKey,
      },
      callMetadata: {
        agentName: state.agentName || null,
        snpType: state.snpType || null,
        tpmoZip: state.tpmoZip || null,
        tpmoOrgs: state.tpmoOrgs || null,
        tpmoPlans: state.tpmoPlans || null,
        partBReduction: state.partBReduction,
        planName: state.notes.planName || null,
        effectiveDate: state.notes.effectiveDate || null,
        enrollmentCode: state.notes.enrollmentCode || null,
        confirmation: state.notes.confirmation || null,
      },
      sectionChecklistState: buildSectionChecklistState(
        state,
        activeSection,
        unlocked
      ),
      priorCompletedSections: buildCompletedSectionHistory(state),
      recentInterventions: recentInterventions.map((entry) => ({
        level: entry.level,
        text: entry.text,
        issueTag: entry.issueTag || "",
        time: entry.ts,
      })),
      transcriptWindows: {
        currentWindow: recentTranscript,
        fullTranscriptTail: transcriptRef.current.trim().slice(-2500),
      },
      derivedSignals: buildDerivedSignals(
        state,
        activeSection,
        transcriptRef.current.trim(),
        recentInterventions
      ),
    };
    const cmsKnowledge = getCmsKnowledgeForQuestion(
      sectionKey,
      question,
      copilotContext
    );
    const transcriptReferenceResult = await fetchTranscriptReferences({
      getToken,
      query: [question, recentTranscript].filter(Boolean).join("\n\n"),
      productLine: "MA",
      matchCount: 5,
      similarityThreshold: 0.7,
    });
    const retrievalTrace = {
      topics: cmsKnowledge.topics.map((topic) => topic.id),
      scenarios: cmsKnowledge.scenarios.map((scenario) => scenario.id),
      sources: [
        ...cmsKnowledge.sources.map((source) => `cms:${source.id}`),
        ...transcriptReferenceResult.sources.map((source) => `call:${source}`),
      ],
      transcriptReferenceCount: transcriptReferenceResult.results.length,
      transcriptReferenceError: transcriptReferenceResult.error || null,
    };

    let sectionContext = "";
    if (knowledge) {
      sectionContext = `\nCurrent section: "${sectionKey}"\nRequired elements for this section:\n${knowledge.requiredElements
        .map((r, i) => `${i + 1}. ${r}`)
        .join("\n")}\n`;
    }

    const systemPrompt = `You are a knowledgeable Medicare compliance assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer to their question.

CRITICAL CONTEXT:
- You can ONLY hear the AGENT speaking (not the client)
- The agent is currently in the "${sectionKey}" section of the enrollment flow
- They need a fast, practical answer they can use RIGHT NOW on this call
${sectionContext}
${cmsKnowledge.promptBlock}
${transcriptReferenceResult.contextBlock}
${
  recentTranscript
    ? `\nRecent agent transcript for context:\n"${recentTranscript}"\n`
    : ""
}
Structured app context:
${JSON.stringify(copilotContext, null, 2)}

YOUR CAPABILITIES — you can answer questions about:
- CMS compliance rules and requirements for Medicare enrollment calls
- Medicare Advantage plan details, benefits, and eligibility
- Medication coverage, formulary questions, drug tiers
- Provider network status and how to verify
- Enrollment periods (AEP, OEP, SEP) and eligibility rules
- Dual-eligible (DSNP), chronic condition (CSNP) requirements
- Part B premium reduction / giveback rules
- Scope of Appointment and TPMO requirements
- What to say in specific situations (objection handling, compliance language)
- Disqualifying coverage types (TRICARE for Life, CHAMPVA, employer coverage)
- How to handle specific client scenarios

RESPONSE RULES:
- Keep answers concise and actionable — the agent is on a live call
- If providing script language, put it in quotes so the agent can read it directly
- If you don't know something specific (like a particular plan's formulary), say so and suggest where to check (Sunfire, carrier website, etc.)
- Always prioritize CMS compliance in your answers
- If transcript references are provided, cite them inline as [R1], [R2], etc.
- No markdown formatting — plain text only`;

    try {
      const response = await fetchWithClerk(getToken, "/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 400,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: question,
            },
          ],
        }),
      });
      const data = await response.json();
      const raw = data.content
        ?.map((b) => (b.type === "text" ? b.text : ""))
        .filter(Boolean)
        .join("")
        .trim();

      if (raw) {
        const entry = {
          id: Date.now(),
          level: "info",
          text: `❓ ${question}\n\n${raw}`,
          retrievalTrace,
          ts: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        setMessages((prev) => [...prev.slice(-19), entry]);
        logEntry(LOG_TYPES.COPILOT_MSG, "info", `Q&A: ${question} → ${raw}`, {
          section: currentStep,
          contextSnapshot: copilotContext,
          retrievalTrace,
        });
      }
      setAskQuestion("");
    } catch (err) {
      console.error("Ask Co-Pilot error:", err);
    } finally {
      setAskLoading(false);
    }
  }, [
    askQuestion,
    askLoading,
    currentStep,
    logEntry,
    getToken,
    activeSection,
    messages,
    state,
    unlocked,
  ]);

  const clearTranscript = () => {
    setTranscript("");
    setInterimText("");
    setHighlightIdx(-1);
    setMessages([]);
    setFloatingAlert(null);
    lastCoachingTime.current = 0;
    lastAnalyzedLength.current = 0;
  };

  const exportReplayScenario = useCallback(() => {
    const copilotEntries = messages.map((message) => ({
      id: message.id,
      level: message.level,
      section: message.section || currentStep,
      issueTag: message.issueTag || "",
      text: message.text,
      ts: message.ts,
      retrievalSummary: summarizeRetrievalTrace(message.retrievalTrace),
    }));
    const retrievalOverview = {
      topics: Array.from(
        new Set(
          messages.flatMap((message) =>
            message.retrievalTrace?.topics?.slice(0, 2) || []
          )
        )
      ).slice(0, 8),
      scenarios: Array.from(
        new Set(
          messages.flatMap((message) =>
            message.retrievalTrace?.scenarios?.slice(0, 1) || []
          )
        )
      ).slice(0, 6),
      totalSourcesReferenced: messages.reduce(
        (sum, message) => sum + (message.retrievalTrace?.sources?.length || 0),
        0
      ),
    };

    downloadJson(`copilot-replay-${Date.now()}.json`, {
      exportedAt: new Date().toISOString(),
      currentSection: {
        number: activeSection,
        label: currentStep,
      },
      transcript,
      appState: state,
      unlocked,
      retrievalOverview,
      messages: copilotEntries,
      feedbackDataset: exportFeedbackDataset(),
    });
  }, [
    activeSection,
    currentStep,
    transcript,
    state,
    unlocked,
    messages,
    exportFeedbackDataset,
  ]);

  const exportFeedbackBundle = useCallback(() => {
    downloadJson(`copilot-feedback-${Date.now()}.json`, {
      exportedAt: new Date().toISOString(),
      currentSection: currentStep,
      transcriptTail: transcript.slice(-2500),
      feedback: exportFeedbackDataset(),
    });
  }, [currentStep, transcript, exportFeedbackDataset]);

  /* ═══════ RENDER ═══════ */
  return (
    <>
      {/* ── Floating Alert ── */}
      {floatingAlert &&
        (() => {
          const s = LEVEL_STYLE[floatingAlert.level] || LEVEL_STYLE.info;
          return (
            <div
              onClick={() => setFloatingAlert(null)}
              style={{
                position: "fixed",
                top: 80,
                right: 20,
                zIndex: 9999,
                maxWidth: 380,
                width: "auto",
                background: s.bg,
                border: `2px solid ${s.border}`,
                borderRadius: 10,
                padding: "12px 16px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                cursor: "pointer",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                animation: "slideDown 0.25s ease",
              }}
            >
              <span style={{ fontSize: "1.3em", lineHeight: 1 }}>{s.icon}</span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: "0.7em",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: s.color,
                    marginBottom: 3,
                  }}
                >
                  {floatingAlert.level.toUpperCase()} — tap to dismiss
                </div>
                <div
                  style={{
                    fontSize: "0.9em",
                    color: "#e8edf5",
                    lineHeight: 1.4,
                  }}
                >
                  {floatingAlert.text}
                </div>
              </div>
            </div>
          );
        })()}

      <section className="card prompter-card">
        {/* Header */}
        <div className="prompter-header" onClick={() => setExpanded((p) => !p)}>
          <div className="prompter-header-left">
            <span className="prompter-mic-icon">{listening ? "🔴" : "⎇"}</span>
            <div>
              <h2 style={{ margin: 0 }}>AI Co-Pilot</h2>
              <span className="muted" style={{ fontSize: 12 }}>
                {currentStep} · Real-time assistant
              </span>
            </div>
          </div>
          <span className="prompter-toggle">{expanded ? "▲" : "▼"}</span>
        </div>

        {expanded && (
          <div className="prompter-body">
            {/* Controls */}
            <div className="prompter-controls">
              <button
                className="primary prompter-listen-btn"
                onClick={listening ? stopListening : startListening}
                disabled={!supportsRecognition}
                style={{
                  background: listening ? "#e74c3c" : "#2ecc71",
                  color: "#fff",
                  borderColor: listening ? "#c0392b" : "#27ae60",
                }}
              >
                {!supportsRecognition
                  ? "Browser Not Supported"
                  : listening
                  ? "■  Stop Listening"
                  : "●  Start Listening"}
              </button>
              <button className="primary" onClick={clearTranscript}>
                Clear
              </button>
              <button
                className="primary"
                disabled={!transcript.trim() || coachingLoading}
                onClick={requestCoaching}
              >
                {coachingLoading ? "Thinking…" : "Ask Co-Pilot"}
              </button>
            </div>

            {/* Quick Ask — compliance / meds / plans / eligibility */}
            <div
              style={{
                display: "flex",
                gap: 6,
                margin: "8px 0 4px",
              }}
            >
              <input
                value={askQuestion}
                onChange={(e) => setAskQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    askCopilot();
                  }
                }}
                placeholder="Ask about compliance, meds, plans, eligibility…"
                disabled={askLoading}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: "0.85em",
                  color: "#e8edf5",
                  outline: "none",
                }}
              />
              <button
                className="primary"
                onClick={askCopilot}
                disabled={!askQuestion.trim() || askLoading}
                style={{
                  padding: "8px 14px",
                  fontSize: "0.8em",
                  whiteSpace: "nowrap",
                }}
              >
                {askLoading ? "…" : "Ask"}
              </button>
            </div>

            {/* Live Transcript */}
            <div className="prompter-transcript">
              <div className="prompter-section-label">Live Transcript</div>
              <div className="prompter-transcript-text">
                {transcript || (
                  <span style={{ opacity: 0.4 }}>
                    {listening
                      ? "Listening… start speaking"
                      : "Press Start Listening to begin"}
                  </span>
                )}
                {interimText && (
                  <span className="prompter-interim"> {interimText}</span>
                )}
              </div>
            </div>

            {/* AI Co-Pilot Feed */}
            <div className="prompter-coaching">
              <div
                className="prompter-section-label"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  AI Co-Pilot
                  {coachingLoading && (
                    <span
                      className="prompter-pulse"
                      style={{ fontSize: "0.7em" }}
                    >
                      ● thinking…
                    </span>
                  )}
                </span>
                <span style={{ display: "inline-flex", gap: 6 }}>
                  <button
                    type="button"
                    className="objection-copy-btn"
                    onClick={exportReplayScenario}
                  >
                    Export Replay
                  </button>
                  <button
                    type="button"
                    className="objection-copy-btn"
                    onClick={exportFeedbackBundle}
                  >
                    Export Feedback
                  </button>
                </span>
              </div>
              <div
                ref={feedRef}
                style={{
                  maxHeight: 220,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  paddingTop: 4,
                }}
              >
                {messages.length === 0 && (
                  <span style={{ opacity: 0.4, fontSize: "0.85em" }}>
                    Co-pilot will give reminders and suggestions as you speak…
                  </span>
                )}
                {messages.map((msg) => {
                  const s = LEVEL_STYLE[msg.level] || LEVEL_STYLE.info;
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "flex-start",
                        background: s.bg,
                        border: `1px solid ${s.border}`,
                        borderRadius: 6,
                        padding: "7px 10px",
                        animation: "fadeIn 0.2s ease",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "1em",
                          lineHeight: 1.4,
                          flexShrink: 0,
                        }}
                      >
                        {s.icon}
                      </span>
                      <div style={{ flex: 1 }}>
                        <span
                          style={{
                            fontSize: "0.85em",
                            color: "#e8edf5",
                            lineHeight: 1.4,
                            display: "block",
                          }}
                        >
                          {msg.text}
                        </span>
                        {msg.issueTag && (
                          <span
                            style={{
                              display: "inline-block",
                              marginTop: 6,
                              fontSize: "0.62em",
                              color: "#8fa4bc",
                              border: "1px solid rgba(255,255,255,0.08)",
                              borderRadius: 999,
                              padding: "2px 7px",
                            }}
                          >
                            {msg.issueTag}
                          </span>
                        )}
                        {msg.retrievalTrace &&
                          (msg.retrievalTrace.topics?.length ||
                            msg.retrievalTrace.scenarios?.length ||
                            msg.retrievalTrace.sources?.length) && (
                            <div
                              style={{
                                display: "flex",
                                gap: 6,
                                flexWrap: "wrap",
                                marginTop: 6,
                              }}
                            >
                              {msg.retrievalTrace.topics?.slice(0, 3).map((topicId) => (
                                <span
                                  key={topicId}
                                  style={{
                                    fontSize: "0.58em",
                                    color: "#a5b4c7",
                                    border: "1px solid rgba(255,255,255,0.06)",
                                    borderRadius: 999,
                                    padding: "2px 6px",
                                    background: "rgba(255,255,255,0.03)",
                                  }}
                                >
                                  topic:{topicId}
                                </span>
                              ))}
                              {msg.retrievalTrace.scenarios?.slice(0, 2).map((scenarioId) => (
                                <span
                                  key={scenarioId}
                                  style={{
                                    fontSize: "0.58em",
                                    color: "#93c5fd",
                                    border: "1px solid rgba(147,197,253,0.12)",
                                    borderRadius: 999,
                                    padding: "2px 6px",
                                    background: "rgba(59,130,246,0.08)",
                                  }}
                                >
                                  sep:{scenarioId}
                                </span>
                              ))}
                              {msg.retrievalTrace.sources?.length > 0 && (
                                <span
                                  style={{
                                    fontSize: "0.58em",
                                    color: "#8fa4bc",
                                  }}
                                >
                                  {msg.retrievalTrace.sources.length} source
                                  {msg.retrievalTrace.sources.length === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>
                          )}
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                            marginTop: 8,
                          }}
                        >
                          {[
                            ["correct", "Correct"],
                            ["too_aggressive", "Too Aggressive"],
                            ["missed_issue", "Missed Issue"],
                            ["duplicate", "Duplicate"],
                            ["wrong_section", "Wrong Section"],
                          ].map(([verdict, label]) => (
                            <button
                              key={verdict}
                              type="button"
                              onClick={() => setEntryFeedback(msg.id, verdict)}
                              style={{
                                fontSize: "0.62em",
                                borderRadius: 999,
                                border:
                                  msg.feedback?.verdict === verdict
                                    ? "1px solid rgba(56,189,248,0.35)"
                                    : "1px solid rgba(255,255,255,0.08)",
                                background:
                                  msg.feedback?.verdict === verdict
                                    ? "rgba(56,189,248,0.1)"
                                    : "rgba(255,255,255,0.03)",
                                color:
                                  msg.feedback?.verdict === verdict
                                    ? "#7dd3fc"
                                    : "#8fa4bc",
                                padding: "3px 8px",
                                cursor: "pointer",
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: "0.65em",
                          color: "#5a6a80",
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        {msg.ts}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
});

export default ScriptPrompter;
