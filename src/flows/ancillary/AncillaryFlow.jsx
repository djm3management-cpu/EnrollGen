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
  Eye,
  Heart,
  Shield,
} from "lucide-react";
import CompactCopilotRail from "../../components/CompactCopilotRail";
import CenterTimerBar from "../../components/CenterTimerBar";
import DentalReferencePanel from "../../components/DentalReferencePanel";
import { useLeftRailManager } from "../../components/leftRail/LeftRailManager";
import ProgressDots from "../../components/ProgressDots";
import { LOG_TYPES, useCopilotLog } from "../../context/CopilotTranscriptLog";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import "../../AgentTools.css";
import {
  ANCILLARY_ACCENT,
  ANCILLARY_PRODUCT_META,
  FLOW_TYPE,
  SUB_PRODUCT,
  isAncillarySubProduct,
} from "./ancillaryConstants";
import { getAncillarySteps } from "./ancillarySteps";
import HIPFlow from "./HIPFlow";
import FEFlow from "./FEFlow";
import DVHFlow from "./DVHFlow";

export { FLOW_TYPE, SUB_PRODUCT } from "./ancillaryConstants";

const AncillaryFlowContext = createContext(null);

const PRODUCT_COMPONENTS = {
  [SUB_PRODUCT.HIP]: HIPFlow,
  [SUB_PRODUCT.FE]: FEFlow,
  [SUB_PRODUCT.DVH]: DVHFlow,
};

const PRODUCT_ORDER = [SUB_PRODUCT.HIP, SUB_PRODUCT.FE, SUB_PRODUCT.DVH];
const FALLBACK_PRODUCT_META = { label: "Ancillary", shortLabel: "ANC" };
const FE_CALL_WINDOW_SECONDS = 90;
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

function createProductState() {
  return {
    callStarted: false,
    callStart: null,
    completedSteps: {},
    sectionTimestamps: {},
    complianceChecklist: {
      recordingDisclosure: false,
      needsAssessment: false,
      consent: false,
    },
  };
}

function createInitialState(initialProduct = null) {
  return {
    flowType: FLOW_TYPE,
    activeSubProduct: initialProduct,
    products: {
      [SUB_PRODUCT.HIP]: createProductState(),
      [SUB_PRODUCT.FE]: createProductState(),
      [SUB_PRODUCT.DVH]: createProductState(),
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
      };

    case "START_CALL":
      return updateProductState(state, action.product, (productState) => ({
        ...productState,
        callStarted: true,
        callStart: productState.callStart || Date.now(),
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

function calculateAncillaryCompliance({ productState, steps, transcript }) {
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
      aria-label={`Final Expense 90 second timer, ${remainingSeconds} seconds remaining`}
    >
      <span className="ancillary-fe-countdown__label">90 SEC</span>
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
          borderLeft: "2px solid currentColor",
          borderRight: "2px solid currentColor",
          borderBottom: "2px solid currentColor",
          borderRadius: "0 0 6px 6px",
          background: "rgba(17,17,17,0.92)",
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
        .ancillary-product-card {
          min-height: 74px;
        }
        .ancillary-product-card:hover {
          border-color: rgba(59,130,246,0.48);
          background: linear-gradient(145deg, rgba(59,130,246,0.08), rgba(17,17,17,0.98));
        }
        .ancillary-product-card:hover .at-tool-title {
          color: #93c5fd;
        }
      `}</style>
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        style={{
          background: "rgba(59,130,246,0.04)",
          border: "1px solid rgba(59,130,246,0.2)",
          borderRadius: 10,
          padding: "20px 18px",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            color: ANCILLARY_ACCENT.color,
            fontFamily: "var(--font-body)",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          Ancillary
        </div>
        <div className="at-card-list">
          {PRODUCT_ORDER.map((product) => {
            const meta = ANCILLARY_PRODUCT_META[product];
            return (
              <button
                key={product}
                type="button"
                className="at-tool-card ancillary-product-card"
                onClick={() => handleSelect(product)}
              >
                <span className="at-tool-main">
                  <span
                    className="at-tool-icon-badge"
                    style={{
                      color: ANCILLARY_ACCENT.color,
                      background: "rgba(59,130,246,0.14)",
                    }}
                  >
                    <ProductIcon product={product} />
                  </span>
                  <span className="at-tool-copy">
                    <span className="at-tool-title-row">
                      <span className="at-tool-title">{meta.label}</span>
                    </span>
                    <span className="at-tool-desc">{meta.description}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </motion.section>
    </>
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
        borderLeft: "2px solid rgba(59,130,246,0.3)",
        padding: "11px 16px",
        marginBottom: 8,
        borderRadius: "0 6px 6px 0",
        background: "rgba(255,255,255,0.012)",
      }}
    >
      <div
        className="flow-script-text"
        style={{ color: "#dfe6f0", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-line" }}
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
        borderLeft: "2px solid rgba(255,255,255,0.1)",
        padding: "8px 14px",
        marginBottom: 8,
        borderRadius: "0 6px 6px 0",
        background: "rgba(255,255,255,0.015)",
      }}
    >
      <div className="flow-stage-text" style={{ color: "#8fa4bc", fontSize: 12, lineHeight: 1.55 }}>{text}</div>
    </div>
  );
}

function GateToggle({ label, done, onDo, onUndo }) {
  return (
    <div
      className="flow-gate-action"
      style={{
        marginTop: 16,
        paddingTop: 14,
        borderTop: "1px solid rgba(255,255,255,0.04)",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <button
        type="button"
        className="check flow-gate-check"
        onClick={done ? onUndo : onDo}
        aria-label={label}
        aria-pressed={done}
        title={label}
        style={{
          justifyContent: "center",
          width: "fit-content",
          minWidth: 240,
          padding: "10px 14px",
          border: `1px solid ${done ? "rgba(52,211,153,0.2)" : "rgba(59,130,246,0.15)"}`,
          background: done ? "rgba(52,211,153,0.05)" : "rgba(255,255,255,0.015)",
          color: done ? "#34d399" : "#dfe6f0",
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
            background: "rgba(52,211,153,0.03)",
            border: "1px solid rgba(52,211,153,0.1)",
            borderRadius: 10,
            cursor: "pointer",
            listStyle: "none",
            fontSize: 13,
            color: "#6b7a8d",
          }}
        >
          <CheckCircle2 size={13} color="#34d399" />
          <span style={{ flex: 1 }}>
            <span
              style={{
                fontWeight: 700,
                color: "#4a5568",
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
            <span style={{ fontSize: 11, color: "#4a5568", fontVariantNumeric: "tabular-nums" }}>
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
        background: active ? "rgba(59,130,246,0.04)" : "rgba(255,255,255,0.018)",
        border: `1px solid ${active ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.05)"}`,
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
            color: active ? ANCILLARY_ACCENT.color : "#4a5568",
            background: active ? "rgba(59,130,246,0.08)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${active ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)"}`,
            borderRadius: 5,
            padding: "3px 8px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          G{String(num).padStart(2, "0")}
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#dfe6f0" }}>{title}</span>
      </div>
      {children}
    </motion.section>
  );
}


function AncillaryScriptStep({ product, step, index, active, done, productState }) {
  const { dispatch } = useScriptFlow();
  const timestamps = productState.sectionTimestamps[step.id];
  const duration = timestamps?.start && timestamps?.end ? timestamps.end - timestamps.start : null;

  return (
    <FlowCard
      num={index + 1}
      title={step.title}
      active={active}
      done={done}
      duration={duration}
    >
      <TalkTrack
        text={step.content}
        highlightParentheticals={product === SUB_PRODUCT.FE}
      />
      {step.substeps?.map((substep) => (
        <Substep key={substep} text={substep} />
      ))}
      <GateToggle
        label={`${step.title} complete`}
        done={done}
        onDo={() => {
          dispatch({ type: "START_STEP", product, stepId: step.id });
          dispatch({ type: "COMPLETE_STEP", product, stepId: step.id });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_STEP", product, stepId: step.id })}
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
        background: "rgba(52,211,153,0.04)",
        border: "1px solid rgba(52,211,153,0.12)",
        borderRadius: 10,
      }}
    >
      <CheckCircle2 size={24} color="#34d399" style={{ marginBottom: 6 }} />
      <div style={{ fontSize: 16, fontWeight: 700, color: "#34d399" }}>
        {productMeta.label} Flow Complete
      </div>
      <button
        type="button"
        onClick={() => dispatch({ type: "RESET_PRODUCT", product })}
        style={{
          marginTop: 12,
          background: "rgba(52,211,153,0.08)",
          border: "1px solid rgba(52,211,153,0.2)",
          borderRadius: 6,
          color: "#34d399",
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
          border: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(255,255,255,0.025)",
          color: "#8fa4bc",
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
          background: "rgba(59,130,246,0.14)",
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
            color: "#dfe6f0",
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
        background: "rgba(59,130,246,0.04)",
        border: "1px solid rgba(59,130,246,0.2)",
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
            "linear-gradient(145deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))",
          border: "1px solid rgba(59,130,246,0.3)",
          color: ANCILLARY_ACCENT.color,
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        Start Call
      </button>
      <p style={{ marginTop: 10, fontSize: 11, color: "#4a5568" }}>
        Timer begins when you click Start Call
      </p>
    </section>
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

    logEntry(
      LOG_TYPES.COPILOT_MSG,
      "info",
      `${activeProductMeta.shortLabel}: ${activeStep.title}. Keep recording disclosure, needs assessment, and client consent covered before close.`,
      { flowType: FLOW_TYPE, subProduct: state.activeSubProduct, section: activeStep.title }
    );
  }, [
    activeStep,
    activeProductMeta?.shortLabel,
    activeStep?.id,
    activeStep?.title,
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
    const message = state.activeSubProduct
      ? `${activeProductMeta.label}: score is ${complianceScore.score}%. Required checks are recording disclosure, needs assessment, and client consent.`
      : "Select an ancillary product to start the script flow.";
    logEntry(LOG_TYPES.COPILOT_MSG, "info", message, {
      flowType: FLOW_TYPE,
      subProduct: state.activeSubProduct,
    });
  }, [activeProductMeta?.label, complianceScore.score, logEntry, state.activeSubProduct]);

  const toggleLabel = state.activeSubProduct
    ? `${activeProductMeta.shortLabel} ${Math.min(activeStepIndex + 1, getAncillarySteps(state.activeSubProduct).length)}. ${
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
        productState: currentProductState,
        steps,
        transcript: transcriptForScore,
      }),
    [currentProductState, steps, transcriptForScore]
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
