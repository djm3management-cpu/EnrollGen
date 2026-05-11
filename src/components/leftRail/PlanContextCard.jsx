import { memo, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useScript } from "../../context/ScriptContext";
import {
  buildPlanNotesFromLookup,
  formatPlanNumber,
  getPlanCarrierDisplay,
  searchManualPlans,
} from "../../lib/manualPlanLookup";

const LOOKUP_LIMIT = 7;

function tokenize(value) {
  if (!value || typeof value !== "string") return [];
  return value
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getPlanResultKey(plan, index) {
  return [
    plan.cid || "",
    plan.pbp || "",
    plan.name || "",
    Array.isArray(plan.states) ? plan.states[0] : "",
    plan.countyName || "",
    index,
  ].join("|");
}

const PlanContextCard = memo(function PlanContextCard() {
  const { state, dispatch } = useScript();
  const notes = state.notes || {};
  const [lookupMode, setLookupMode] = useState("name");
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState([]);
  const [lookupMessage, setLookupMessage] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const lookupRunRef = useRef(0);

  const carrier = String(notes.carrierName || "").trim();
  const planName = String(notes.planName || "").trim();
  const planId = String(notes.planId || "").trim();
  const planType = String(notes.planType || "").trim() || (planId.includes("HMO") ? "HMO-POS" : "");
  const premium = String(notes.premium || "").trim();
  const effectiveDate = String(notes.effectiveDate || "").trim();
  const manualOverride = Boolean(notes.planManualOverride);
  const benefits = useMemo(() => {
    const tokens = tokenize(notes.benefitPills || notes.benefits);
    if (tokens.length) return tokens;
    return [
      premium ? `${premium} premium` : "",
      effectiveDate ? `Eff. ${effectiveDate}` : "",
    ].filter(Boolean);
  }, [notes.benefitPills, notes.benefits, effectiveDate, premium]);

  const planMeta = [planId, planType].filter(Boolean).join(" - ");
  const lookupPlaceholder = lookupMode === "name" ? "Plan name" : "H1234-001";

  const handleLookupMode = (nextMode) => {
    setLookupMode(nextMode);
    setLookupResults([]);
    setLookupMessage("");
  };

  const handleLookupSubmit = async (event) => {
    event.preventDefault();
    const term = lookupQuery.trim();
    if (term.length < 2) {
      setLookupResults([]);
      setLookupMessage("Enter at least 2 characters.");
      return;
    }

    const runId = lookupRunRef.current + 1;
    lookupRunRef.current = runId;
    setLookupLoading(true);
    setLookupMessage("");

    try {
      const { plans } = await searchManualPlans({
        term,
        mode: lookupMode,
        zipOrState: state.tpmoZip || notes.customerState || "",
        limit: LOOKUP_LIMIT,
      });

      if (lookupRunRef.current !== runId) return;
      setLookupResults(plans);
      setLookupMessage(plans.length ? "" : "No matching PY2026 plans.");
    } catch (error) {
      if (lookupRunRef.current !== runId) return;
      console.error("Manual plan lookup error:", error);
      setLookupResults([]);
      setLookupMessage("Plan lookup unavailable.");
    } finally {
      if (lookupRunRef.current === runId) {
        setLookupLoading(false);
      }
    }
  };

  const handleSelectPlan = (plan) => {
    dispatch({
      type: "SET_PLAN_CONTEXT",
      source: "manual",
      value: buildPlanNotesFromLookup(plan),
    });
    setLookupResults([]);
    setLookupMessage("");
  };

  const handleClearPlan = () => {
    dispatch({ type: "CLEAR_PLAN_CONTEXT" });
    setLookupResults([]);
    setLookupMessage("");
  };

  return (
    <div className="eg-rail-card">
      <div className="eg-plan-context-head">
        <div className="eg-rail-card__label">PRESENTING</div>
        {manualOverride ? (
          <button
            type="button"
            className="eg-plan-lookup__clear"
            onClick={handleClearPlan}
            aria-label="Clear selected plan"
            title="Clear selected plan"
          >
            <X size={11} />
            Clear
          </button>
        ) : null}
      </div>

      {(carrier || planName) ? (
        <>
          <div className="eg-rail-card__plan">
            {planName || carrier}
          </div>
          {planMeta ? (
            <div className="eg-rail-card__plan-meta">{planMeta}</div>
          ) : null}
        </>
      ) : (
        <>
          <div className="eg-rail-card__plan" style={{ color: "var(--eg-text-faint)" }}>
            No plan selected yet
          </div>
          <div className="eg-rail-card__plan-meta">
            Plan info populates when you reach Plan Selection.
          </div>
        </>
      )}
      {benefits.length ? (
        <div className="eg-rail-card__pills">
          {benefits.map((pill) => (
            <span key={pill} className="benefit-pill eg-benefit-pill">
              {pill}
            </span>
          ))}
        </div>
      ) : null}

      <div className="eg-plan-lookup">
        <div className="eg-plan-lookup__label">PY2026 PLAN LOOKUP</div>
        <div className="eg-plan-lookup__mode" role="tablist" aria-label="Plan lookup mode">
          <button
            type="button"
            className={`eg-plan-lookup__mode-btn${lookupMode === "name" ? " is-active" : ""}`}
            onClick={() => handleLookupMode("name")}
            aria-pressed={lookupMode === "name"}
          >
            Name
          </button>
          <button
            type="button"
            className={`eg-plan-lookup__mode-btn${lookupMode === "number" ? " is-active" : ""}`}
            onClick={() => handleLookupMode("number")}
            aria-pressed={lookupMode === "number"}
          >
            Plan #
          </button>
        </div>

        <form className="eg-plan-lookup__form" onSubmit={handleLookupSubmit}>
          <input
            className="eg-plan-lookup__input"
            value={lookupQuery}
            onChange={(event) => setLookupQuery(event.target.value)}
            placeholder={lookupPlaceholder}
            aria-label="Manual plan lookup"
          />
          <button
            type="submit"
            className="eg-plan-lookup__submit"
            disabled={lookupLoading}
            aria-label="Search plans"
          >
            <Search size={12} />
            {lookupLoading ? "..." : "Find"}
          </button>
        </form>

        {lookupMessage ? (
          <div className="eg-plan-lookup__message">{lookupMessage}</div>
        ) : null}

        {lookupResults.length ? (
          <div className="eg-plan-lookup__results">
            {lookupResults.map((plan, index) => {
              const planNumber = formatPlanNumber(plan);
              const stateCode = Array.isArray(plan.states) ? plan.states[0] : "";
              const meta = [
                planNumber,
                getPlanCarrierDisplay(plan),
                [plan.type, plan.snp].filter(Boolean).join(" "),
                stateCode,
              ].filter(Boolean).join(" - ");

              return (
                <button
                  key={getPlanResultKey(plan, index)}
                  type="button"
                  className="eg-plan-lookup__result"
                  onClick={() => handleSelectPlan(plan)}
                >
                  <span className="eg-plan-lookup__result-name">{plan.name}</span>
                  <span className="eg-plan-lookup__result-meta">{meta}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default PlanContextCard;
