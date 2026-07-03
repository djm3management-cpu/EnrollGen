import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  Eye,
  Heart,
  Landmark,
  Shield,
} from "lucide-react";
import CompactCopilotRail from "../../components/CompactCopilotRail";
import CenterTimerBar from "../../components/CenterTimerBar";
import AncillaryClientSidebar from "../../components/ancillary/AncillaryClientSidebar";
import DentalReferencePanel from "../../components/DentalReferencePanel";
import MOHRiderBundle from "../../components/ancillary/MOHRiderBundle";
import { useLeftRailManager } from "../../components/leftRail/LeftRailManager";
import ProgressDots from "../../components/ProgressDots";
import { LOG_TYPES, useCopilotLog } from "../../context/CopilotTranscriptLog";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { useAnnuityCopilotEngine } from "../../hooks/useAnnuityCopilotEngine";
import "../../AgentTools.css";
import {
  ANCILLARY_ACCENT,
  ANCILLARY_PRODUCT_META,
  ANNUITY_MODE,
  FLOW_TYPE,
  SUB_PRODUCT,
  isAncillarySubProduct,
} from "./ancillaryConstants";
import { getAncillarySteps } from "./ancillarySteps";
import HIPFlow from "./HIPFlow";
import FEFlow from "./FEFlow";
import DVHFlow from "./DVHFlow";
import AnnuityScriptFlow from "./AnnuityScriptFlow";

export { FLOW_TYPE, SUB_PRODUCT } from "./ancillaryConstants";

const AncillaryFlowContext = createContext(null);

const PRODUCT_COMPONENTS = {
  [SUB_PRODUCT.HIP]: HIPFlow,
  [SUB_PRODUCT.FE]: FEFlow,
  [SUB_PRODUCT.DVH]: DVHFlow,
  [SUB_PRODUCT.ANNUITY]: AnnuityScriptFlow,
};

const PRODUCT_ORDER = [SUB_PRODUCT.HIP, SUB_PRODUCT.FE, SUB_PRODUCT.DVH, SUB_PRODUCT.ANNUITY];
const FALLBACK_PRODUCT_META = { label: "Ancillary", shortLabel: "ANC" };
const FE_CALL_WINDOW_SECONDS = 80;
const ANCILLARY_CUSTOMER_RAIL_ID = "ancillary-customer-info";
const DENTAL_REFERENCE_RAIL_ID = "ancillary-dental-reference";

function productFromPath() {
  if (typeof window === "undefined") return null;
  const parts = window.location.pathname.split("/").filter(Boolean);
  const maybeProduct = parts[2];
  return isAncillarySubProduct(maybeProduct) ? maybeProduct : null;
}

function setAncillaryPath(product) {
  if (typeof window === "undefined") return;
  const nextPath = product
    ? ANCILLARY_PRODUCT_META[product]?.route
    : "/script/ancillary";
  if (!nextPath || window.location.pathname === nextPath) return;
  window.history.pushState(null, "", nextPath);
}

function createAnnuitySuitabilityState() {
  return {
    clientAge: "",
    income: "",
    netWorth: "",
    liquidAssetsPercent: "",
    guaranteedIncome: "",
    riskTolerance: "",
    timeHorizon: "",
    objective: "",
    existingAnnuity: "",
    replacementFunding: "",
    notes: "",
  };
}

function createProductState() {
  return {
    callStarted: false,
    callStart: null,
    completedSteps: {},
    stepChecks: {},
    sectionTimestamps: {},
    complianceChecklist: {
      recordingDisclosure: false,
      needsAssessment: false,
      consent: false,
    },
    annuityMode: ANNUITY_MODE.INBOUND,
    annuitySuitability: createAnnuitySuitabilityState(),
    callMetadata: {},
  };
}

function createInitialState(initialProduct = null) {
  return {
    flowType: FLOW_TYPE,
    activeSubProduct: initialProduct,
    customerInfo: {
      name: "",
      phone: "",
      age: "",
      state: "",
      productInterest: initialProduct || "",
      primaryCoverage: "",
      carrier: "",
      budget: "",
    },
    agentNotes: "",
    products: {
      [SUB_PRODUCT.HIP]: createProductState(),
      [SUB_PRODUCT.FE]: createProductState(),
      [SUB_PRODUCT.DVH]: createProductState(),
      [SUB_PRODUCT.ANNUITY]: createProductState(),
    },
  };
}

function updateProductState(state, product, updater) {
  if (!isAncillarySubProduct(product)) return state;
  const currentProductState = state.products[product] || createProductState();
  return {
    ...state,
    products: {
      ...state.products,
      [product]: updater(currentProductState),
    },
  };
}

function reducer(state, action) {
  switch (action.type) {
    case "SELECT_PRODUCT":
      return {
        ...state,
        activeSubProduct: action.product,
        customerInfo: {
          ...state.customerInfo,
          productInterest: action.product || state.customerInfo.productInterest,
        },
      };

    case "START_CALL":
      return updateProductState(state, action.product, (productState) => ({
        ...productState,
        callStarted: true,
        callStart: productState.callStart || Date.now(),
        callMetadata:
          action.product === SUB_PRODUCT.ANNUITY
            ? {
                ...productState.callMetadata,
                annuityMode: productState.annuityMode || ANNUITY_MODE.INBOUND,
              }
            : productState.callMetadata,
      }));

    case "START_STEP":
      return updateProductState(state, action.product, (productState) => ({
        ...productState,
        sectionTimestamps: {
          ...productState.sectionTimestamps,
          [action.stepId]: {
            start: productState.sectionTimestamps[action.stepId]?.start || Date.now(),
            end: null,
          },
        },
      }));

    case "COMPLETE_STEP":
      return updateProductState(state, action.product, (productState) => {
        const now = Date.now();
        return {
          ...productState,
          completedSteps: {
            ...productState.completedSteps,
            [action.stepId]: true,
          },
          sectionTimestamps: {
            ...productState.sectionTimestamps,
            [action.stepId]: {
              start: productState.sectionTimestamps[action.stepId]?.start || now,
              end: now,
            },
          },
        };
      });

    case "UNCOMPLETE_STEP":
      return updateProductState(state, action.product, (productState) => ({
        ...productState,
        completedSteps: {
          ...productState.completedSteps,
          [action.stepId]: false,
        },
        sectionTimestamps: {
          ...productState.sectionTimestamps,
          [action.stepId]: {
            ...productState.sectionTimestamps[action.stepId],
            end: null,
          },
        },
      }));

    case "TOGGLE_COMPLIANCE":
      return updateProductState(state, action.product, (productState) => ({
        ...productState,
        complianceChecklist: {
          ...productState.complianceChecklist,
          [action.key]: !productState.complianceChecklist[action.key],
        },
      }));

    case "SET_ANNUITY_MODE":
      return updateProductState(state, SUB_PRODUCT.ANNUITY, (productState) => {
        if (productState.callStarted) return productState;
        const nextMode =
          action.mode === ANNUITY_MODE.OUTBOUND
            ? ANNUITY_MODE.OUTBOUND
            : ANNUITY_MODE.INBOUND;
        return {
          ...productState,
          annuityMode: nextMode,
          callMetadata: {
            ...productState.callMetadata,
            annuityMode: nextMode,
          },
        };
      });

    case "UPDATE_ANNUITY_SUITABILITY":
      return updateProductState(state, SUB_PRODUCT.ANNUITY, (productState) => ({
        ...productState,
        annuitySuitability: {
          ...productState.annuitySuitability,
          [action.field]: action.value,
        },
      }));

    case "TOGGLE_STEP_CHECK":
      return updateProductState(state, action.product, (productState) => {
        const currentStepChecks = productState.stepChecks[action.stepId] || {};
        return {
          ...productState,
          stepChecks: {
            ...productState.stepChecks,
            [action.stepId]: {
              ...currentStepChecks,
              [action.key]: !currentStepChecks[action.key],
            },
          },
        };
      });

    case "SET_CALL_METADATA_FIELD":
      return updateProductState(state, action.product, (productState) => ({
        ...productState,
        callMetadata: {
          ...productState.callMetadata,
          [action.field]: action.value,
        },
      }));

    case "SET_CUSTOMER_INFO_FIELD":
      return {
        ...state,
        customerInfo: {
          ...state.customerInfo,
          [action.field]: action.value,
        },
      };

    case "SET_AGENT_NOTES":
      return {
        ...state,
        agentNotes: action.value,
      };

    case "RESET_PRODUCT":
      return updateProductState(state, action.product, () => createProductState());

    default:
      return state;
  }
}

function getActiveStepIndex(steps, productState) {
  if (!steps.length) return 0;
  const index = steps.findIndex((step) => !productState.completedSteps[step.id]);
  return index === -1 ? steps.length : index;
}

function transcriptMatches(transcript, pattern) {
  return pattern.test((transcript || "").toLowerCase());
}

function parseNumberFromInput(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseFloat(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function getAnnuityMode(productState) {
  return productState?.annuityMode === ANNUITY_MODE.OUTBOUND
    ? ANNUITY_MODE.OUTBOUND
    : ANNUITY_MODE.INBOUND;
}

function getAnnuitySuitability(productState) {
  return productState?.annuitySuitability || createAnnuitySuitabilityState();
}

function isReplacementFlagged(productState) {
  const suitability = getAnnuitySuitability(productState);
  return ["yes", "exchange_1035", "replace_existing"].includes(
    String(suitability.replacementFunding || "").toLowerCase()
  );
}

function isAnnuitySuitabilityComplete(productState) {
  const suitability = getAnnuitySuitability(productState);
  return [
    "income",
    "netWorth",
    "liquidAssetsPercent",
    "guaranteedIncome",
    "riskTolerance",
    "timeHorizon",
    "objective",
    "existingAnnuity",
    "replacementFunding",
  ].every((field) => String(suitability[field] || "").trim());
}

function getVisibleChecklistItems(step, productState) {
  const mode = getAnnuityMode(productState);
  return (step?.checklist || []).filter((item) => {
    if (item.mode && item.mode !== mode) return false;
    if (item.replacementOnly && !isReplacementFlagged(productState)) return false;
    return true;
  });
}

function isChecklistItemDone(productState, step, item) {
  if (item.field) {
    return Boolean(String(getAnnuitySuitability(productState)[item.field] || "").trim());
  }

  return Boolean(productState?.stepChecks?.[step.id]?.[item.key]);
}

function getMissingRequiredChecklistItems(productState, step) {
  return getVisibleChecklistItems(step, productState).filter(
    (item) => item.required && !isChecklistItemDone(productState, step, item)
  );
}

function getAnnuityStepBlockReason(step, productState) {
  if (!step) return "";
  if (step.form === "annuitySuitability" && !isAnnuitySuitabilityComplete(productState)) {
    return "Complete every required suitability field before moving on.";
  }

  const missing = getMissingRequiredChecklistItems(productState, step);
  if (missing.length) {
    return `Required before moving on: ${missing[0].label}`;
  }

  return "";
}

function getAnnuityRecommendation(productState) {
  const riskTolerance = getAnnuitySuitability(productState).riskTolerance;
  if (riskTolerance === "moderate_growth") {
    return {
      type: "Fixed Indexed Annuity",
      rationale:
        "Client wants protected principal with some index-based growth potential.",
    };
  }

  if (riskTolerance === "conservative") {
    return {
      type: "MYGA",
      rationale: "Client prioritized principal protection and a guaranteed rate.",
    };
  }

  return {
    type: "Recommendation pending",
    rationale: "Complete risk tolerance and time horizon before recommending.",
  };
}

function getAnnuityRiskFlags(productState) {
  const suitability = getAnnuitySuitability(productState);
  const liquidPercent = parseNumberFromInput(suitability.liquidAssetsPercent);
  const age = parseNumberFromInput(suitability.clientAge);
  const flags = [];

  if (liquidPercent !== null && liquidPercent > 50) {
    flags.push("Liquidity concentration risk: client is placing more than 50% of liquid assets into one annuity.");
  }

  if (age !== null && age < 59.5) {
    flags.push("Age flag: disclose possible 10% IRS penalty on withdrawals before age 59 and a half.");
  }

  if (age !== null && age > 85) {
    flags.push("Issue-age flag: verify carrier limits before quoting or applying.");
  }

  if (isReplacementFlagged(productState)) {
    flags.push("Replacement flag: review surrender charges, lost benefits, and 1035 exchange paperwork.");
  }

  return flags;
}

function calculateAnnuityCompliance({ productState, steps, transcript }) {
  const completedStepCount = steps.filter((step) => productState.completedSteps[step.id]).length;
  const flowProgressScore = steps.length ? (completedStepCount / steps.length) * 40 : 0;
  const check = (stepId, key) => Boolean(productState.stepChecks?.[stepId]?.[key]);
  const replacementFlag = isReplacementFlagged(productState);

  const checks = [
    {
      name: "Recording Consent",
      passed:
        check("annuity-opening", "recordingConsent") ||
        transcriptMatches(transcript, /\b(recorded|recording).{0,40}(quality|compliance|purposes|okay|alright)\b/),
    },
    {
      name: "Permission To Discuss",
      passed:
        check("annuity-purpose-permission", "permissionToDiscuss") ||
        transcriptMatches(transcript, /\b(walk you through|open to me|permission|would it be okay)\b/),
    },
    {
      name: "Suitability Complete",
      passed: isAnnuitySuitabilityComplete(productState),
    },
    {
      name: "Recommendation Tied To Needs",
      passed: check("annuity-product-recommendation", "recommendationTied"),
    },
    {
      name: "Surrender Period Disclosed",
      passed:
        check("annuity-product-recommendation", "surrenderPeriod") ||
        transcriptMatches(transcript, /\bsurrender (period|charge)\b/),
    },
    {
      name: "Compensation Disclosed",
      passed:
        check("annuity-disclosures-best-interest", "compensationDisclosed") ||
        transcriptMatches(transcript, /\bcompensated by the insurance company\b/),
    },
    {
      name: "Best Interest Stated",
      passed:
        check("annuity-disclosures-best-interest", "bestInterest") ||
        transcriptMatches(transcript, /\bbest interest\b/),
    },
    {
      name: "Free-Look Disclosed",
      passed:
        check("annuity-disclosures-best-interest", "freeLook") ||
        transcriptMatches(transcript, /\bfree[- ]look\b/),
    },
    {
      name: "Replacement Disclosure",
      passed:
        !replacementFlag ||
        check("annuity-disclosures-best-interest", "replacementDisclosure") ||
        transcriptMatches(transcript, /\b(replacing|replacement).{0,80}(surrender|benefits|charges)\b/),
    },
  ];

  const completedCompliance = checks.filter((item) => item.passed).length;
  const complianceScore = checks.length ? (completedCompliance / checks.length) * 60 : 0;

  return {
    score: Math.round(Math.min(100, flowProgressScore + complianceScore)),
    completedStepCount,
    totalSteps: steps.length,
    categoriesPassed: completedCompliance,
    totalCategories: checks.length,
    categories: checks.map((item) => ({
      name: item.name,
      score: item.passed ? 100 : 0,
      passed: item.passed,
    })),
  };
}

function calculateAncillaryCompliance({ product, productState, steps, transcript }) {
  if (product === SUB_PRODUCT.ANNUITY) {
    return calculateAnnuityCompliance({ productState, steps, transcript });
  }

  const completedStepCount = steps.filter((step) => productState.completedSteps[step.id]).length;
  const flowProgressScore = steps.length ? (completedStepCount / steps.length) * 70 : 0;
  const needsStepDone = steps.some(
    (step) =>
      productState.completedSteps[step.id] &&
      /(need|fact|health|pre-qual|present)/i.test(`${step.title} ${step.content}`)
  );
  const closeStepDone = steps.some(
    (step) =>
      productState.completedSteps[step.id] &&
      /(close|present|option|enrollment|add this coverage)/i.test(`${step.title} ${step.content}`)
  );

  const checks = [
    {
      key: "recordingDisclosure",
      name: "Recording Disclosure",
      passed:
        productState.complianceChecklist.recordingDisclosure ||
        transcriptMatches(transcript, /\b(recorded|recording|quality)\b/),
    },
    {
      key: "needsAssessment",
      name: "Needs Assessment",
      passed:
        productState.complianceChecklist.needsAssessment ||
        needsStepDone ||
        transcriptMatches(transcript, /\b(needs|budget|health questions|dentist|hospital stay|family)\b/),
    },
    {
      key: "consent",
      name: "Client Consent",
      passed:
        productState.complianceChecklist.consent ||
        closeStepDone ||
        transcriptMatches(transcript, /\b(want to add|sound okay|which works best|which fits|complete the enrollment)\b/),
    },
  ];

  const completedCompliance = checks.filter((check) => check.passed).length;
  const complianceScore = (completedCompliance / checks.length) * 30;
  const score = Math.round(Math.min(100, flowProgressScore + complianceScore));

  return {
    score,
    completedStepCount,
    totalSteps: steps.length,
    categoriesPassed: completedCompliance,
    totalCategories: checks.length,
    categories: checks.map((check) => ({
      name: check.name,
      score: check.passed ? 100 : 0,
      passed: check.passed,
    })),
  };
}

function fmt(ms) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatCountdown(seconds) {
  return String(seconds);
}

function FinalExpenseCountdown({ callStart }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!callStart) return undefined;
    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [callStart]);

  const elapsedSeconds = callStart
    ? Math.max(0, Math.floor((now - callStart) / 1000))
    : 0;
  const remainingSeconds = Math.max(0, FE_CALL_WINDOW_SECONDS - elapsedSeconds);
  const progress = Math.max(
    0,
    Math.min(100, (remainingSeconds / FE_CALL_WINDOW_SECONDS) * 100)
  );
  const tone =
    remainingSeconds <= 0
      ? "expired"
      : remainingSeconds <= 15
        ? "danger"
        : remainingSeconds <= 30
          ? "warning"
          : "active";

  return (
    <aside
      className={`ancillary-fe-countdown ancillary-fe-countdown--${tone}`}
      aria-label={`Final Expense ${FE_CALL_WINDOW_SECONDS} second timer, ${remainingSeconds} seconds remaining`}
    >
      <span className="ancillary-fe-countdown__label">
        {FE_CALL_WINDOW_SECONDS} SEC
      </span>
      <strong className="ancillary-fe-countdown__time">
        {formatCountdown(remainingSeconds)}
      </strong>
      <span className="ancillary-fe-countdown__caption">
        {remainingSeconds > 0 ? "TIME LEFT" : "TIME UP"}
      </span>
      <span className="ancillary-fe-countdown__track" aria-hidden="true">
        <span
          className="ancillary-fe-countdown__fill"
          style={{ width: `${progress}%` }}
        />
      </span>
    </aside>
  );
}

export function useScriptFlow() {
  const ctx = useContext(AncillaryFlowContext);
  if (!ctx) {
    throw new Error("useScriptFlow must be used inside AncillaryFlow");
  }
  return ctx;
}

function ProductIcon({ product, size = 18 }) {
  if (product === SUB_PRODUCT.HIP) {
    return <Building2 size={size} />;
  }

  if (product === SUB_PRODUCT.ANNUITY) {
    return <Landmark size={size} />;
  }

  if (product === SUB_PRODUCT.FE) {
    return (
      <span style={{ position: "relative", display: "inline-flex" }}>
        <Shield size={size} />
        <Heart
          size={Math.max(9, Math.round(size * 0.48))}
          fill="currentColor"
          style={{ position: "absolute", right: -2, bottom: -1 }}
        />
      </span>
    );
  }

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <ToothGlyph size={size} />
      <Eye
        size={Math.max(10, Math.round(size * 0.54))}
        style={{ position: "absolute", right: -5, bottom: -2 }}
      />
    </span>
  );
}

function ToothGlyph({ size }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "relative",
        display: "inline-block",
        width: size,
        height: size,
        border: "2px solid currentColor",
        borderRadius: "48% 48% 42% 42%",
        boxSizing: "border-box",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: "25%",
          right: "25%",
          bottom: -3,
          height: Math.max(5, Math.round(size * 0.34)),
          borderInlineStart: "2px solid currentColor",
          borderRight: "2px solid currentColor",
          borderBottom: "2px solid currentColor",
          borderRadius: "0 0 6px 6px",
          background: "var(--bg-primary)",
        }}
      />
    </span>
  );
}

function ProductSelector() {
  const { dispatch } = useScriptFlow();

  const handleSelect = (product) => {
    setAncillaryPath(product);
    dispatch({ type: "SELECT_PRODUCT", product });
  };

  return (
    <>
      <style>{`
        .ancillary-product-button:hover {
          border-color: var(--info-border);
          background: var(--info-bg);
          color: var(--info);
        }
      `}</style>
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        style={{
          width: "fit-content",
          maxWidth: "100%",
          background: "transparent",
          border: 0,
          padding: 0,
          margin: "0 auto 10px",
        }}
      >
        <div className="ancillary-product-grid">
          {PRODUCT_ORDER.map((product) => {
            const meta = ANCILLARY_PRODUCT_META[product];
            return (
              <button
                key={product}
                type="button"
                className="ancillary-product-button"
                title={meta.label}
                onClick={() => handleSelect(product)}
              >
                <span
                  className="ancillary-product-button__icon"
                  style={{ color: ANCILLARY_ACCENT.color }}
                >
                  <ProductIcon product={product} size={16} />
                </span>
                <span className="ancillary-product-button__label">
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>
      </motion.section>
    </>
  );
}

function AnnuityModeSelector({ productState }) {
  const { dispatch } = useScriptFlow();
  const mode = getAnnuityMode(productState);
  const locked = Boolean(productState.callStarted);

  return (
    <section
      style={{
        marginBottom: 10,
        border: "1px solid var(--script-term-border)",
        background: "var(--script-term-bg)",
        padding: "10px 12px",
        fontFamily: "var(--font-mono)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            color: "var(--script-term-cyan)",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "1.4px",
            textTransform: "uppercase",
          }}
        >
          Annuity Mode
        </span>
        <span style={{ color: "var(--script-term-muted)", fontSize: 10 }}>
          {locked ? "Locked for this call" : "Select before Start Call"}
        </span>
      </div>

      <div className="at-tab-row" role="tablist" aria-label="Annuity call mode">
        {[
          [ANNUITY_MODE.INBOUND, "INBOUND"],
          [ANNUITY_MODE.OUTBOUND, "OUTBOUND"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`at-filter-tab${mode === value ? " is-active" : ""}`}
            aria-selected={mode === value}
            disabled={locked}
            onClick={() => dispatch({ type: "SET_ANNUITY_MODE", mode: value })}
            style={{
              opacity: locked && mode !== value ? 0.42 : 1,
              cursor: locked ? "not-allowed" : "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

const SUITABILITY_FIELDS = [
  {
    field: "clientAge",
    label: "Client age",
    type: "input",
    placeholder: "Optional, flags 59.5 / 85+",
    optional: true,
  },
  {
    field: "income",
    label: "Approx annual household income",
    type: "input",
    placeholder: "$",
  },
  {
    field: "netWorth",
    label: "Total net worth excluding primary residence",
    type: "input",
    placeholder: "$",
  },
  {
    field: "liquidAssetsPercent",
    label: "Percent of liquid assets into annuity",
    type: "input",
    placeholder: "%",
  },
  {
    field: "guaranteedIncome",
    label: "Other guaranteed income",
    type: "input",
    placeholder: "Social Security, pension, annuity",
  },
  {
    field: "riskTolerance",
    label: "Risk tolerance",
    type: "select",
    options: [
      ["", "Select"],
      ["conservative", "Principal protection / guaranteed rate"],
      ["moderate_growth", "Protected principal with growth potential"],
    ],
  },
  {
    field: "timeHorizon",
    label: "Access timeline",
    type: "select",
    options: [
      ["", "Select"],
      ["under_3", "Under 3 years"],
      ["3_years", "3 years"],
      ["5_years", "5 years"],
      ["7_years", "7 years"],
      ["10_plus", "10+ years"],
    ],
  },
  {
    field: "objective",
    label: "Primary financial objective",
    type: "select",
    options: [
      ["", "Select"],
      ["income", "Supplement retirement income"],
      ["legacy", "Leave money to beneficiaries"],
      ["safe_growth", "Grow savings safely"],
      ["tax_deferral", "Tax-deferred accumulation"],
    ],
  },
  {
    field: "existingAnnuity",
    label: "Currently owns an annuity",
    type: "select",
    options: [
      ["", "Select"],
      ["yes", "Yes"],
      ["no", "No"],
      ["unknown", "Unknown"],
    ],
  },
  {
    field: "replacementFunding",
    label: "Replacing or exchanging existing product",
    type: "select",
    options: [
      ["", "Select"],
      ["no", "No"],
      ["yes", "Yes"],
      ["exchange_1035", "Yes, potential 1035 exchange"],
      ["replace_existing", "Yes, replacing annuity/CD/life product"],
      ["unknown", "Unknown"],
    ],
  },
  {
    field: "notes",
    label: "Carrier submission notes",
    type: "textarea",
    placeholder: "Optional documentation notes",
    optional: true,
  },
];

const FIELD_STYLE = {
  width: "100%",
  minHeight: 34,
  border: "1px solid var(--script-term-border)",
  borderRadius: 0,
  background: "var(--script-term-bg)",
  color: "var(--script-term-amber)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  padding: "8px 9px",
  outline: "none",
};

function AnnuityRiskFlags({ productState }) {
  const flags = getAnnuityRiskFlags(productState);
  if (!flags.length) return null;

  return (
    <div
      style={{
        border: "1px solid var(--status-offline-border)",
        background: "var(--status-offline-bg)",
        padding: "9px 11px",
        marginTop: 10,
        color: "var(--script-term-red)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        lineHeight: 1.45,
      }}
    >
      {flags.map((flag) => (
        <div key={flag}>{flag}</div>
      ))}
    </div>
  );
}

function AnnuitySuitabilityForm({ productState }) {
  const { dispatch } = useScriptFlow();
  const suitability = getAnnuitySuitability(productState);

  const updateField = (field, value) => {
    dispatch({ type: "UPDATE_ANNUITY_SUITABILITY", field, value });
  };

  return (
    <section
      style={{
        margin: "12px 0",
        border: "1px solid var(--script-term-border)",
        background: "var(--script-term-bg-soft)",
        padding: "12px",
        fontFamily: "var(--font-mono)",
      }}
      aria-label="Annuity suitability intake"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            color: "var(--script-term-cyan)",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "1.4px",
            textTransform: "uppercase",
          }}
        >
          Agent Tools: Suitability Intake
        </span>
        <span
          style={{
            color: isAnnuitySuitabilityComplete(productState)
              ? "var(--script-term-green)"
              : "var(--script-term-red)",
            fontSize: 10,
            fontWeight: 800,
          }}
        >
          {isAnnuitySuitabilityComplete(productState) ? "COMPLETE" : "HARD GATE"}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 10,
        }}
      >
        {SUITABILITY_FIELDS.map((item) => (
          <label
            key={item.field}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 5,
              color: "var(--script-term-cyan)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.6px",
              textTransform: "uppercase",
            }}
          >
            {item.label}
            {item.optional ? null : (
              <span style={{ color: "var(--script-term-red)", marginLeft: 4 }}>*</span>
            )}
            {item.type === "select" ? (
              <select
                value={suitability[item.field] || ""}
                onChange={(event) => updateField(item.field, event.target.value)}
                style={FIELD_STYLE}
              >
                {item.options.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : item.type === "textarea" ? (
              <textarea
                value={suitability[item.field] || ""}
                onChange={(event) => updateField(item.field, event.target.value)}
                placeholder={item.placeholder}
                rows={3}
                style={{ ...FIELD_STYLE, resize: "vertical" }}
              />
            ) : (
              <input
                value={suitability[item.field] || ""}
                onChange={(event) => updateField(item.field, event.target.value)}
                placeholder={item.placeholder}
                style={FIELD_STYLE}
              />
            )}
          </label>
        ))}
      </div>

      <AnnuityRiskFlags productState={productState} />
    </section>
  );
}

function AnnuityRecommendationPanel({ productState }) {
  const recommendation = getAnnuityRecommendation(productState);

  return (
    <section
      style={{
        margin: "10px 0",
        border: "1px solid var(--script-term-border)",
        background: "var(--script-term-bg-soft)",
        padding: "10px 12px",
        fontFamily: "var(--font-mono)",
      }}
    >
      <div
        style={{
          color: "var(--script-term-cyan)",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "1.4px",
          marginBottom: 6,
          textTransform: "uppercase",
        }}
      >
        Recommendation Anchor
      </div>
      <div style={{ color: "var(--script-term-amber)", fontSize: 13, lineHeight: 1.45 }}>
        {recommendation.type}: {recommendation.rationale}
      </div>
    </section>
  );
}

function StepChecklist({ product, step, productState }) {
  const { dispatch } = useScriptFlow();
  if (product !== SUB_PRODUCT.ANNUITY || !step?.checklist?.length) return null;

  const items = getVisibleChecklistItems(step, productState);
  if (!items.length) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 7,
        marginTop: 10,
      }}
    >
      {items.map((item) => {
        const done = isChecklistItemDone(productState, step, item);
        const fieldDriven = Boolean(item.field);
        return (
          <label
            key={item.key}
            className="ancillary-check"
            style={{
              border: "1px solid var(--script-term-border)",
              background: done ? "var(--status-live-bg)" : "var(--script-term-bg-soft)",
              color: done ? "var(--script-term-green)" : "var(--script-term-cyan)",
              padding: "7px 8px",
              fontFamily: "var(--font-mono)",
            }}
          >
            <input
              type="checkbox"
              checked={done}
              disabled={fieldDriven}
              onChange={() =>
                dispatch({
                  type: "TOGGLE_STEP_CHECK",
                  product,
                  stepId: step.id,
                  key: item.key,
                })
              }
            />
            <span>{item.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function isParentheticalScriptLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("(") && trimmed.endsWith(")");
}

function TalkTrack({ text, highlightParentheticals = false }) {
  const lines = String(text || "").split("\n");

  return (
    <div
      className="flow-script-line"
      style={{
        outline: "1px solid var(--info-border)",
        padding: "11px 16px",
        marginBottom: 8,
        borderRadius: "0 6px 6px 0",
        background: "var(--bg-elevated)",
      }}
    >
      <div
        className="flow-script-text"
        style={{ color: "var(--text-primary)", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-line" }}
      >
        {lines.map((line, index) => (
          <span
            key={`${index}-${line}`}
            className={
              highlightParentheticals && isParentheticalScriptLine(line)
                ? "flow-script-text-line flow-script-text-line--parenthetical"
                : "flow-script-text-line"
            }
          >
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}

function Substep({ text }) {
  return (
    <div
      className="flow-stage-direction"
      style={{
        outline: "1px solid var(--border-default)",
        padding: "8px 14px",
        marginBottom: 8,
        borderRadius: "0 6px 6px 0",
        background: "var(--bg-elevated)",
      }}
    >
      <div className="flow-stage-text" style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.55 }}>{text}</div>
    </div>
  );
}

function ComplianceBanner({ text }) {
  if (!text) return null;
  return (
    <div
      className="flow-compliance-banner"
      style={{
        background: "var(--status-offline-bg)",
        border: "1px solid var(--status-offline-border)",
        borderRadius: 6,
        padding: "9px 13px",
        marginBottom: 10,
        fontSize: 12,
        color: "var(--eg-red-text)",
        lineHeight: 1.5,
      }}
    >
      COMPLIANCE: {text}
    </div>
  );
}

function StepPurpose({ text }) {
  if (!text) return null;
  return (
    <div
      className="flow-stage-direction"
      style={{
        outline: "1px solid var(--border-default)",
        padding: "8px 14px",
        marginBottom: 8,
        borderRadius: "0 6px 6px 0",
        background: "var(--bg-elevated)",
      }}
    >
      <div className="flow-stage-text" style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.55 }}>
        Purpose: {text}
      </div>
    </div>
  );
}

function getStepScriptText(step, productState) {
  if (step?.scripts) {
    const mode = getAnnuityMode(productState);
    return step.scripts[mode] || step.scripts[ANNUITY_MODE.INBOUND] || "";
  }

  return step?.content || "";
}

function GateToggle({ label, done, onDo, onUndo, disabled = false, disabledReason = "" }) {
  return (
    <div
      className="flow-gate-action"
      style={{
        marginTop: 16,
        paddingTop: 14,
        borderTop: "1px solid var(--border-default)",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <button
        type="button"
        className="check flow-gate-check"
        onClick={done ? onUndo : onDo}
        disabled={!done && disabled}
        aria-label={label}
        aria-pressed={done}
        title={!done && disabled ? disabledReason : label}
        style={{
          justifyContent: "center",
          width: "fit-content",
          minWidth: 240,
          padding: "10px 14px",
          border: `1px solid ${done ? "var(--status-live-border)" : "var(--info-border)"}`,
          background: done ? "var(--status-live-bg)" : "var(--bg-elevated)",
          color: done ? "var(--status-live)" : "var(--text-primary)",
          cursor: !done && disabled ? "not-allowed" : "pointer",
          opacity: !done && disabled ? 0.45 : 1,
        }}
      >
        <Check className="flow-gate-icon" size={14} strokeWidth={2.8} aria-hidden="true" />
      </button>
    </div>
  );
}

function FlowCard({ num, title, active, done, duration, children }) {
  if (done && !active) {
    return (
      <details style={{ marginBottom: 10 }}>
        <summary
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            background: "var(--status-live-bg)",
            border: "1px solid var(--status-live-border)",
            borderRadius: 10,
            cursor: "pointer",
            listStyle: "none",
            fontSize: 13,
            color: "var(--text-muted)",
          }}
        >
          <CheckCircle2 size={13} color="var(--status-live)" />
          <span style={{ flex: 1 }}>
            <span
              style={{
                fontWeight: 700,
                color: "var(--text-muted)",
                marginRight: 8,
                fontSize: 11,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              G{String(num).padStart(2, "0")}
            </span>
            {title}
          </span>
          {duration ? (
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
              {fmt(duration)}
            </span>
          ) : null}
        </summary>
        <div style={{ paddingTop: 6 }}>{children}</div>
      </details>
    );
  }

  if (!done && !active) {
    return null;
  }

  return (
    <motion.section
      className={`flow-script-card${active ? " active-card" : ""}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        background: active ? "var(--info-bg)" : "var(--bg-surface)",
        border: `1px solid ${active ? "var(--info-border)" : "var(--border-default)"}`,
        borderRadius: 10,
        padding: "20px 18px",
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: active ? ANCILLARY_ACCENT.color : "var(--text-muted)",
            background: active ? "var(--info-bg)" : "var(--bg-elevated)",
            border: `1px solid ${active ? "var(--info-border)" : "var(--border-default)"}`,
            borderRadius: 5,
            padding: "3px 8px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          G{String(num).padStart(2, "0")}
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
      </div>
      {children}
    </motion.section>
  );
}


function AncillaryScriptStep({ product, step, index, active, done, productState }) {
  const { dispatch } = useScriptFlow();
  const timestamps = productState.sectionTimestamps[step.id];
  const duration = timestamps?.start && timestamps?.end ? timestamps.end - timestamps.start : null;
  const blockReason =
    product === SUB_PRODUCT.ANNUITY ? getAnnuityStepBlockReason(step, productState) : "";

  return (
    <FlowCard
      num={index + 1}
      title={step.title}
      active={active}
      done={done}
      duration={duration}
    >
      <StepPurpose text={step.purpose} />
      <ComplianceBanner text={step.compliance} />
      <TalkTrack
        text={getStepScriptText(step, productState)}
        highlightParentheticals={product === SUB_PRODUCT.FE}
      />
      {step.substeps?.map((substep) => (
        <Substep key={substep} text={substep} />
      ))}
      {step.form === "annuitySuitability" ? (
        <AnnuitySuitabilityForm productState={productState} />
      ) : null}
      {product === SUB_PRODUCT.ANNUITY && step.id === "annuity-product-recommendation" ? (
        <AnnuityRecommendationPanel productState={productState} />
      ) : null}
      <StepChecklist product={product} step={step} productState={productState} />
      {blockReason ? (
        <div
          className="flow-compliance-banner"
          style={{
            marginTop: 10,
            color: "var(--script-term-red)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
          }}
        >
          {blockReason}
        </div>
      ) : null}
      <GateToggle
        label={`${step.title} complete`}
        done={done}
        onDo={() => {
          dispatch({ type: "START_STEP", product, stepId: step.id });
          dispatch({ type: "COMPLETE_STEP", product, stepId: step.id });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_STEP", product, stepId: step.id })}
        disabled={Boolean(blockReason)}
        disabledReason={blockReason}
      />
    </FlowCard>
  );
}

function CompletionPanel({ product, productMeta }) {
  const { dispatch } = useScriptFlow();

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        marginTop: 18,
        textAlign: "center",
        padding: "20px",
        background: "var(--status-live-bg)",
        border: "1px solid var(--status-live-border)",
        borderRadius: 10,
      }}
    >
      <CheckCircle2 size={24} color="var(--status-live)" style={{ marginBottom: 6 }} />
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--status-live)" }}>
        {productMeta.label} Flow Complete
      </div>
      <button
        type="button"
        onClick={() => dispatch({ type: "RESET_PRODUCT", product })}
        style={{
          marginTop: 12,
          background: "var(--status-live-bg)",
          border: "1px solid var(--status-live-border)",
          borderRadius: 6,
          color: "var(--status-live)",
          padding: "8px 20px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "var(--font-body)",
        }}
      >
        New Call
      </button>
    </motion.div>
  );
}

function AncillaryHeader({ product, productMeta }) {
  const { dispatch } = useScriptFlow();
  const handleBack = () => {
    setAncillaryPath(null);
    dispatch({ type: "SELECT_PRODUCT", product: null });
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 14,
      }}
    >
      <button
        type="button"
        onClick={handleBack}
        title="Select ancillary product"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 30,
          height: 30,
          borderRadius: 8,
          border: "1px solid var(--border-default)",
          background: "var(--bg-elevated)",
          color: "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        <ArrowLeft size={15} />
      </button>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 30,
          height: 30,
          borderRadius: 8,
          color: ANCILLARY_ACCENT.color,
          background: "var(--info-bg)",
        }}
      >
        <ProductIcon product={product} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: ANCILLARY_ACCENT.color,
            fontFamily: "var(--font-body)",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          ANC
        </div>
        <div
          style={{
            color: "var(--text-primary)",
            fontSize: 15,
            fontWeight: 700,
            overflowWrap: "anywhere",
          }}
        >
          {productMeta.label}
        </div>
      </div>
    </div>
  );
}

function StartCallGate({ product }) {
  const { dispatch } = useScriptFlow();

  return (
    <section
      className="script-start-call-gate"
      style={{
        background: "var(--info-bg)",
        border: "1px solid var(--info-border)",
        borderRadius: 10,
        padding: "28px 20px",
        textAlign: "center",
        marginBottom: 10,
      }}
    >
      <button
        className="primary script-start-call-button"
        type="button"
        onClick={() => dispatch({ type: "START_CALL", product })}
        style={{
          fontSize: 15,
          fontFamily: "var(--font-body)",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          padding: "10px 36px",
          background:
            "var(--info-bg)",
          border: "1px solid var(--info-border)",
          color: ANCILLARY_ACCENT.color,
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        START
      </button>
    </section>
  );
}

function HIPCarrierContext({ productState }) {
  const { dispatch } = useScriptFlow();
  const metadata = productState.callMetadata || {};
  const carrierCode = metadata.carrierCode || "";
  const clientAge = metadata.clientAge || "";
  const primaryCoverage = metadata.primaryCoverage || "";
  const selectedRiders = Array.isArray(metadata.selectedMohRiders)
    ? metadata.selectedMohRiders
    : [];
  const isMOH = carrierCode === "MOH";
  const age = Number(clientAge);
  const giEligible = isMOH && Number.isFinite(age) && age >= 64 && age <= 74;
  const maObservationCallout = isMOH && primaryCoverage === "MA";

  const update = (field, value) =>
    dispatch({ type: "SET_CALL_METADATA_FIELD", product: SUB_PRODUCT.HIP, field, value });

  return (
    <div className="sf-panel sf-ancillary-context">
      <div className="sf-panel-heading">
        <span className="sf-dot sf-dot--amber" />
        <span>HIP Carrier Context</span>
      </div>
      <div className="sf-form-grid">
        <label>
          Carrier
          <select value={carrierCode} onChange={(event) => update("carrierCode", event.target.value)}>
            <option value="">Select</option>
            <option value="MOH">Mutual of Omaha</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label>
          Client Age
          <input
            value={clientAge}
            onChange={(event) => update("clientAge", event.target.value)}
            placeholder="Age"
          />
        </label>
        <label>
          Primary Coverage
          <select value={primaryCoverage} onChange={(event) => update("primaryCoverage", event.target.value)}>
            <option value="">Select</option>
            <option value="MA">Medicare Advantage</option>
            <option value="MedSup">Med Supp</option>
            <option value="Other">Other</option>
          </select>
        </label>
      </div>

      {giEligible ? (
        <div className="sf-callout">
          <CheckCircle2 size={13} />
          <span>
            This client qualifies for Guaranteed Issue Hospital Protection. No
            health questions required. Present all available riders now.
          </span>
        </div>
      ) : null}

      {maObservationCallout ? (
        <div className="sf-script-box">
          <div className="sf-script-label">Observation stay talking point</div>
          <p>
            One thing most people do not realize is that hospitals sometimes
            classify your stay as observation instead of a regular admission. It
            looks the same to you because you are in a hospital bed, but
            Medicare treats it differently, and your out-of-pocket costs can be
            much higher. A Hospital Protection plan pays the same daily benefit
            whether you are admitted or on observation status, so you are covered
            either way.
          </p>
        </div>
      ) : null}

      {isMOH ? (
        <MOHRiderBundle
          clientAge={clientAge}
          selectedRiders={selectedRiders}
          onChange={(nextRiders) => update("selectedMohRiders", nextRiders)}
        />
      ) : null}
    </div>
  );
}

function AncillaryScriptRenderer({ product, productMeta, steps }) {
  const { state, activeStepIndex } = useScriptFlow();
  const productState = state.products[product] || createProductState();
  const showFinalExpenseTimer = product === SUB_PRODUCT.FE && productState.callStarted;

  const scriptContent = (
    <div className="ancillary-fe-card-column">
      {steps.map((step, index) => {
        const done = Boolean(productState.completedSteps[step.id]);
        return (
          <AncillaryScriptStep
            key={step.id}
            product={product}
            step={step}
            index={index}
            active={activeStepIndex === index}
            done={done}
            productState={productState}
          />
        );
      })}

      <ProgressDots
        sections={steps.map((step, idx) => {
          const isDone = Boolean(productState.completedSteps[step.id]);
          const isActive = !isDone && idx === activeStepIndex;
          return {
            key: step.id,
            label: step.title,
            status: isDone ? "done" : isActive ? "active" : "pending",
          };
        })}
      />

      {activeStepIndex >= steps.length ? (
        <CompletionPanel product={product} productMeta={productMeta} />
      ) : null}
    </div>
  );

  useEffect(() => {
    requestAnimationFrame(() =>
      setTimeout(() => {
        const element = document.querySelector(".active-card");
        if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80)
    );
  }, [activeStepIndex]);

  return (
    <motion.div
      className="flow"
      style={{ fontFamily: "var(--font-body)" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <AncillaryHeader product={product} productMeta={productMeta} />
      <CenterTimerBar />
      {product === SUB_PRODUCT.ANNUITY ? (
        <AnnuityModeSelector productState={productState} />
      ) : null}
      {product === SUB_PRODUCT.HIP ? (
        <HIPCarrierContext productState={productState} />
      ) : null}

      {!productState.callStarted ? (
        <StartCallGate product={product} />
      ) : (
        <div className={showFinalExpenseTimer ? "ancillary-fe-script-layout" : ""}>
          {showFinalExpenseTimer ? (
            <FinalExpenseCountdown callStart={productState.callStart} />
          ) : null}
          {scriptContent}
        </div>
      )}
    </motion.div>
  );
}

function AncillaryCopilot({ onTranscriptChange }) {
  const { state, activeProductMeta, activeStep, activeStepIndex, currentProductState, complianceScore } =
    useScriptFlow();
  const transcriptRef = useRef("");
  const { logEntry, clearLog } = useCopilotLog();
  const annuityCopilot = useAnnuityCopilotEngine({
    activeStep,
    productState: currentProductState,
    complianceScore,
  });
  const speech = useSpeechRecognition({
    externalTranscriptRef: transcriptRef,
    onNewFinal: null,
    onSpokenQuestion: null,
  });

  useEffect(() => {
    onTranscriptChange?.(speech.transcript);
  }, [onTranscriptChange, speech.transcript]);

  useEffect(() => {
    if (!state.activeSubProduct || !currentProductState.callStarted || !activeStep) {
      return;
    }

    let message =
      state.activeSubProduct === SUB_PRODUCT.ANNUITY
        ? annuityCopilot.sectionMessage
        : `${activeProductMeta.shortLabel}: ${activeStep.title}. Keep recording disclosure, needs assessment, and client consent covered before close.`;

    if (state.activeSubProduct === SUB_PRODUCT.HIP) {
      const metadata = currentProductState.callMetadata || {};
      const age = Number(metadata.clientAge);
      const isMOH = metadata.carrierCode === "MOH";
      if (isMOH && Number.isFinite(age) && age >= 64 && age <= 74) {
        message = `${message} MOH GI alert: no health questions required. Present all riders now because they cannot be added later.`;
      }
      if (isMOH && metadata.primaryCoverage === "MA") {
        message = `${message} Observation stay coverage is the key MA talking point. Explain that observation can look like an admission but bill differently.`;
      }
    }

    logEntry(
      LOG_TYPES.COPILOT_MSG,
      "info",
      message,
      { flowType: FLOW_TYPE, subProduct: state.activeSubProduct, section: activeStep.title }
    );
  }, [
    activeStep,
    activeProductMeta?.shortLabel,
    activeStep?.id,
    activeStep?.title,
    annuityCopilot.sectionMessage,
    currentProductState.callMetadata,
    currentProductState.callStarted,
    logEntry,
    state.activeSubProduct,
  ]);

  const mergedEntries = useMemo(
    () =>
      speech.transcriptRows.map((row) => ({
        speaker: "agent",
        isFinal: true,
        text: row.text,
        timestamp: row.timestamp || new Date().toISOString(),
      })),
    [speech.transcriptRows]
  );

  const clearAll = useCallback(() => {
    speech.clearTranscript();
    clearLog();
  }, [clearLog, speech]);

  const analyze = useCallback(() => {
    let message = state.activeSubProduct
      ? state.activeSubProduct === SUB_PRODUCT.ANNUITY
        ? annuityCopilot.analyzeMessage
        : `${activeProductMeta.label}: score is ${complianceScore.score}%. Required checks are recording disclosure, needs assessment, and client consent.`
      : "Select an ancillary product to start the script flow.";
    if (state.activeSubProduct === SUB_PRODUCT.HIP) {
      const metadata = currentProductState.callMetadata || {};
      if (metadata.carrierCode === "MOH") {
        message = `${message} MOH rider review required at issue.`;
      }
      if (metadata.carrierCode === "MOH" && metadata.primaryCoverage === "MA") {
        message = `${message} Use the observation stay script when presenting Hospital Protection to this MA client.`;
      }
    }
    logEntry(LOG_TYPES.COPILOT_MSG, "info", message, {
      flowType: FLOW_TYPE,
      subProduct: state.activeSubProduct,
    });
  }, [
    activeProductMeta?.label,
    annuityCopilot.analyzeMessage,
    complianceScore.score,
    currentProductState.callMetadata,
    logEntry,
    state.activeSubProduct,
  ]);

  const toggleLabel = state.activeSubProduct
    ? `${activeProductMeta.shortLabel}${
        state.activeSubProduct === SUB_PRODUCT.ANNUITY ? ` ${annuityCopilot.mode.toUpperCase()}` : ""
      } ${Math.min(activeStepIndex + 1, getAncillarySteps(state.activeSubProduct).length)}. ${
        activeStep?.title || "Complete"
      }`
    : "Ancillary";

  return (
    <CompactCopilotRail
      transcript={speech.transcript}
      mergedEntries={mergedEntries}
      listening={speech.listening}
      supportsRecognition={speech.supportsRecognition}
      analyzing={false}
      score={complianceScore.score}
      toggleLabel={toggleLabel}
      startTime={currentProductState.callStart}
      sessionActive={currentProductState.callStarted}
      onToggleListening={speech.listening ? speech.stop : speech.start}
      onClear={clearAll}
      onAnalyze={analyze}
    />
  );
}

const AncillaryWorkspace = memo(function AncillaryWorkspace() {
  const { state, setTranscriptForScore } = useScriptFlow();
  const [transcript, setTranscript] = useState("");
  const activeProduct = state.activeSubProduct;
  const ActiveFlow = activeProduct ? PRODUCT_COMPONENTS[activeProduct] : null;
  const handleTranscriptChange = useCallback(
    (nextTranscript) => {
      setTranscript(nextTranscript);
      setTranscriptForScore(nextTranscript);
    },
    [setTranscriptForScore]
  );

  return (
    <>
      <AncillaryCopilot onTranscriptChange={handleTranscriptChange} />
      <div className="flow-shell" data-transcript-length={transcript.length}>
        <div className="flow-main">
          {ActiveFlow ? (
            <ActiveFlow FlowRenderer={AncillaryScriptRenderer} />
          ) : (
            <ProductSelector />
          )}
        </div>
      </div>
    </>
  );
});

export default function AncillaryFlow() {
  const { showLeftRail, openLeftRail, dismissLeftRail } = useLeftRailManager();
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    createInitialState(productFromPath())
  );
  const activeProduct = state.activeSubProduct;
  const steps = useMemo(() => getAncillarySteps(activeProduct), [activeProduct]);
  const currentProductState = activeProduct
    ? state.products[activeProduct] || createProductState()
    : createProductState();
  const activeStepIndex = useMemo(
    () => getActiveStepIndex(steps, currentProductState),
    [steps, currentProductState]
  );
  const activeStep = steps[activeStepIndex] || null;
  const activeProductMeta = useMemo(
    () => (activeProduct ? ANCILLARY_PRODUCT_META[activeProduct] : FALLBACK_PRODUCT_META),
    [activeProduct]
  );
  const [transcriptForScore, setTranscriptForScore] = useState("");
  const complianceScore = useMemo(
    () =>
      calculateAncillaryCompliance({
        product: activeProduct,
        productState: currentProductState,
        steps,
        transcript: transcriptForScore,
      }),
    [activeProduct, currentProductState, steps, transcriptForScore]
  );

  useEffect(() => {
    const handlePopState = () => {
      dispatch({ type: "SELECT_PRODUCT", product: productFromPath() });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (activeProduct !== SUB_PRODUCT.DVH) {
      dismissLeftRail(DENTAL_REFERENCE_RAIL_ID);
      return undefined;
    }

    showLeftRail({
      id: DENTAL_REFERENCE_RAIL_ID,
      priority: 2,
      title: "Dental Plans",
      shortLabel: "Dental",
      color: ANCILLARY_ACCENT.color,
      forceOpen: true,
      icon: <ProductIcon product={SUB_PRODUCT.DVH} size={13} />,
      railClassName: "left-rail--private-plans",
      panelClassName: "left-rail-panel-shell--private-plans",
      component: <DentalReferencePanel />,
    });
    openLeftRail(DENTAL_REFERENCE_RAIL_ID);

    return () => dismissLeftRail(DENTAL_REFERENCE_RAIL_ID);
  }, [activeProduct, dismissLeftRail, openLeftRail, showLeftRail]);

  useEffect(() => {
    showLeftRail({
      id: ANCILLARY_CUSTOMER_RAIL_ID,
      priority: 3,
      title: "Customer Info",
      shortLabel: "Customer",
      color: ANCILLARY_ACCENT.color,
      icon: <ClipboardList size={13} />,
      railClassName: "left-rail--ancillary-customer-info",
      panelClassName: "left-rail-panel-shell--ancillary-customer-info",
      component: (
        <AncillaryClientSidebar
          state={state}
          dispatch={dispatch}
          activeProduct={activeProduct}
        />
      ),
    });
  }, [activeProduct, showLeftRail, state]);

  useEffect(() => {
    openLeftRail(ANCILLARY_CUSTOMER_RAIL_ID);
    return () => dismissLeftRail(ANCILLARY_CUSTOMER_RAIL_ID);
  }, [dismissLeftRail, openLeftRail]);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      steps,
      activeStep,
      activeStepIndex,
      activeProductMeta,
      currentProductState,
      complianceScore,
      setTranscriptForScore,
    }),
    [
      state,
      steps,
      activeStep,
      activeStepIndex,
      activeProductMeta,
      currentProductState,
      complianceScore,
    ]
  );

  return (
    <AncillaryFlowContext.Provider value={value}>
      <AncillaryWorkspace />
    </AncillaryFlowContext.Provider>
  );
}
