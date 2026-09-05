import { memo, useRef, useState } from "react";
import { Loader2, Search, Send, X } from "lucide-react";
import { useScript } from "../../context/ScriptContext";
import {
  buildPlanNotesFromLookup,
  formatPlanNumber,
  getPlanCarrierDisplay,
  searchManualPlans,
} from "../../lib/manualPlanLookup";

const LOOKUP_LIMIT = 7;

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

  const manualOverride = Boolean(notes.planManualOverride);
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
      <div className="eg-plan-lookup">
        {manualOverride ? (
          <div className="eg-plan-lookup__clear-row">
            <button
              type="button"
              className="eg-plan-lookup__clear"
              onClick={handleClearPlan}
              aria-label="Clear selected plan"
              title="Clear selected plan"
            >
              <X size={11} />
              Clear selected plan
            </button>
          </div>
        ) : null}
        <div className="eg-plan-lookup__mode" role="tablist" aria-label="Plan lookup mode">
          <button
            type="button"
            className={`eg-plan-lookup__mode-btn${lookupMode === "name" ? " is-active" : ""}`}
            onClick={() => handleLookupMode("name")}
            aria-pressed={lookupMode === "name"}
          >
            <Search size={10} strokeWidth={2.2} aria-hidden="true" />
            Name
          </button>
          <button
            type="button"
            className={`eg-plan-lookup__mode-btn${lookupMode === "number" ? " is-active" : ""}`}
            onClick={() => handleLookupMode("number")}
            aria-pressed={lookupMode === "number"}
          >
            <Search size={10} strokeWidth={2.2} aria-hidden="true" />
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
            {lookupLoading ? (
              <Loader2 size={11} style={{ animation: "eg-spin 1s linear infinite" }} />
            ) : (
              <Send size={11} strokeWidth={2.2} />
            )}
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
