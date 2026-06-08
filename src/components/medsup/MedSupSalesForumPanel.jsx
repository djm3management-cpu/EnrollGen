import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, MapPin, SlidersHorizontal } from "lucide-react";
import CollapsibleWidget from "../CollapsibleWidget";
import CrossSellTrigger from "../copilot/CrossSellTrigger";
import { US_STATE_OPTIONS } from "../../lib/postCallPipeline";
import {
  fetchBirthdayRuleState,
  fetchStateExcessChargeRule,
} from "../../services/salesForumReferenceService";
import RateComparisonPanel from "./RateComparisonPanel";
import HDPGComboAnalysis, { calculateHDPGCombo } from "./HDPGComboAnalysis";

function toNumber(value) {
  const parsed = Number.parseFloat(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "$0";
  return `$${Math.round(amount).toLocaleString()}`;
}

function dateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDate(date) {
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function birthdayForYear(dob, year) {
  return new Date(year, dob.getMonth(), dob.getDate());
}

function parseDob(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getBirthdayWindow(rule, dobValue) {
  const dob = parseDob(dobValue);
  if (!rule?.has_birthday_rule || !dob) return null;

  const now = dateOnly(new Date());
  const horizon = addDays(now, 60);
  const before = Number(rule.window_start_days_before || 0);
  const after = Number(rule.window_end_days_after || 0);
  const birthdays = [
    birthdayForYear(dob, now.getFullYear() - 1),
    birthdayForYear(dob, now.getFullYear()),
    birthdayForYear(dob, now.getFullYear() + 1),
  ];

  const candidate = birthdays
    .map((birthday) => ({
      birthday,
      windowStart: addDays(birthday, -before),
      windowEnd: addDays(birthday, after),
    }))
    .find((window) => window.windowEnd >= now && window.windowStart <= horizon);

  if (!candidate) return null;

  return {
    ...candidate,
    isOpen: candidate.windowStart <= now && candidate.windowEnd >= now,
    startsSoon: candidate.windowStart > now && candidate.windowStart <= horizon,
  };
}

function ClientQuoteContext({ profile, quoteInputs, dispatch }) {
  const updateProfile = (field, value) =>
    dispatch({ type: "SET_CLIENT_PROFILE_FIELD", field, value });
  const updateQuote = (field, value) =>
    dispatch({ type: "SET_QUOTE_FIELD", field, value });

  return (
    <div className="sf-panel">
      <div className="sf-panel-heading">
        <span className="sf-dot sf-dot--green" />
        <span>Client / Quote Context</span>
      </div>
      <div className="sf-form-grid">
        <label>
          Client
          <input
            value={profile.name || ""}
            onChange={(event) => updateProfile("name", event.target.value)}
            placeholder="Name"
          />
        </label>
        <label>
          State
          <select
            value={profile.state || ""}
            onChange={(event) => updateProfile("state", event.target.value)}
          >
            <option value="">State</option>
            {US_STATE_OPTIONS.map((stateCode) => (
              <option key={stateCode} value={stateCode}>{stateCode}</option>
            ))}
          </select>
        </label>
        <label>
          DOB
          <input
            type="date"
            value={profile.dob || ""}
            onChange={(event) => updateProfile("dob", event.target.value)}
          />
        </label>
        <label>
          ZIP
          <input
            value={profile.zipCode || ""}
            onChange={(event) => updateProfile("zipCode", event.target.value)}
            placeholder="ZIP"
          />
        </label>
        <label>
          Age
          <input
            value={profile.age || ""}
            onChange={(event) => updateProfile("age", event.target.value)}
            placeholder="Age"
          />
        </label>
        <label>
          Gender
          <select
            value={profile.gender || ""}
            onChange={(event) => updateProfile("gender", event.target.value)}
          >
            <option value="">Select</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </label>
        <label>
          Tobacco
          <select
            value={profile.tobaccoUse || ""}
            onChange={(event) => updateProfile("tobaccoUse", event.target.value)}
          >
            <option value="">Select</option>
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </label>
        <label>
          Carrier
          <input
            value={quoteInputs.primaryCarrier || ""}
            onChange={(event) => updateQuote("primaryCarrier", event.target.value)}
            placeholder="MOH, Wellabe..."
          />
        </label>
        <label>
          Plan Type
          <select
            value={quoteInputs.selectedPlanType || "standard"}
            onChange={(event) => updateQuote("selectedPlanType", event.target.value)}
          >
            <option value="standard">Standard G/N</option>
            <option value="hdg">High Deductible G</option>
          </select>
        </label>
        <label>
          Plan Letter
          <select
            value={quoteInputs.planLetter || "G"}
            onChange={(event) => updateQuote("planLetter", event.target.value)}
          >
            {["G", "N", "HDG", "F", "HDF"].map((plan) => (
              <option key={plan} value={plan}>{plan}</option>
            ))}
          </select>
        </label>
        <label>
          Plan G
          <input
            value={quoteInputs.planGMonthly || ""}
            onChange={(event) => updateQuote("planGMonthly", event.target.value)}
            placeholder="$ / mo"
          />
        </label>
        <label>
          Plan N
          <input
            value={quoteInputs.planNMonthly || ""}
            onChange={(event) => updateQuote("planNMonthly", event.target.value)}
            placeholder="$ / mo"
          />
        </label>
      </div>
    </div>
  );
}

function ExcessChargeAdvisor({ stateCode, planGMonthly, planNMonthly }) {
  const [ruleState, setRuleState] = useState({ loading: false, rule: null, error: "" });

  useEffect(() => {
    let cancelled = false;
    if (!stateCode) {
      setRuleState({ loading: false, rule: null, error: "" });
      return undefined;
    }
    setRuleState({ loading: true, rule: null, error: "" });
    fetchStateExcessChargeRule(stateCode)
      .then((rule) => {
        if (!cancelled) setRuleState({ loading: false, rule, error: "" });
      })
      .catch((error) => {
        if (!cancelled) setRuleState({ loading: false, rule: null, error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [stateCode]);

  const planG = toNumber(planGMonthly);
  const planN = toNumber(planNMonthly);
  const delta = planG !== null && planN !== null ? planG - planN : null;
  const { rule } = ruleState;

  if (!stateCode) {
    return (
      <div className="sf-panel">
        <div className="sf-panel-heading">
          <span className="sf-dot sf-dot--amber" />
          <span>Plan G vs N</span>
        </div>
        <p className="sf-muted">Add the client state to surface Part B excess charge rules.</p>
      </div>
    );
  }

  if (ruleState.loading) {
    return <div className="sf-empty-state">Checking excess charge rule...</div>;
  }

  if (!rule) {
    return (
      <div className="sf-panel">
        <div className="sf-panel-heading">
          <span className="sf-dot sf-dot--amber" />
          <span>Plan G vs N</span>
        </div>
        <p className="sf-muted">{ruleState.error || "No rule found for this state."}</p>
      </div>
    );
  }

  const isProhibited = rule.excess_charges_status === "prohibited";
  return (
    <div className="sf-panel">
      <div className="sf-panel-heading">
        <span className={`sf-dot ${isProhibited ? "sf-dot--green" : "sf-dot--amber"}`} />
        <span>Plan G vs N</span>
      </div>
      <div className="sf-callout">
        <MapPin size={13} />
        <span>
          {isProhibited
            ? `This client is in ${rule.state_name}. Part B excess charges are prohibited by state law, so Plan N carries no excess charge risk here. The premium savings vs Plan G may make Plan N the better value.`
            : `This client is in ${rule.state_name}. Providers can charge up to ${rule.limiting_percentage || 15}% above Medicare-approved amounts. If the client's providers do not accept Medicare assignment, Plan G covers this gap and Plan N does not. Ask if their doctors accept Medicare assignment.`}
        </span>
      </div>
      <div className="sf-meta-row">
        <span>G: {planG === null ? "--" : formatMoney(planG)}/mo</span>
        <span>N: {planN === null ? "--" : formatMoney(planN)}/mo</span>
        <span>
          Delta: {delta === null ? "pending" : `${formatMoney(Math.abs(delta))}/mo ${delta >= 0 ? "savings" : "higher"}`}
        </span>
      </div>
    </div>
  );
}

// TODO: Add a nightly Supabase Edge Function to scan Med Sup clients for upcoming
// birthday-rule windows and push CRM tasks to assigned agents via webhook.
function BirthdayRuleAlert({ clientName, stateCode, dob }) {
  const [ruleState, setRuleState] = useState({ loading: false, rule: null, error: "" });

  useEffect(() => {
    let cancelled = false;
    if (!stateCode) {
      setRuleState({ loading: false, rule: null, error: "" });
      return undefined;
    }
    setRuleState({ loading: true, rule: null, error: "" });
    fetchBirthdayRuleState(stateCode)
      .then((rule) => {
        if (!cancelled) setRuleState({ loading: false, rule, error: "" });
      })
      .catch((error) => {
        if (!cancelled) setRuleState({ loading: false, rule: null, error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [stateCode]);

  const window = useMemo(() => getBirthdayWindow(ruleState.rule, dob), [dob, ruleState.rule]);

  if (!stateCode || !dob || ruleState.loading) return null;
  if (!ruleState.rule?.has_birthday_rule || !window) return null;

  const client = clientName?.trim() || "This client";
  const stateName = ruleState.rule.state_name || stateCode;
  return (
    <div className="sf-panel sf-alert-panel">
      <div className="sf-panel-heading">
        <span className="sf-dot sf-dot--amber" />
        <span>Birthday Rule Alert</span>
      </div>
      <div className="sf-callout">
        <CalendarClock size={13} />
        <span>
          {client}'s birthday is {formatDate(window.birthday)}. In {stateName},
          Med Sup policyholders have a guaranteed issue window from{" "}
          {formatDate(window.windowStart)} to {formatDate(window.windowEnd)} to
          switch under the state's birthday rule.
        </span>
      </div>
      <p className="sf-muted">
        {ruleState.rule.plan_restriction || "Equal or lesser"};{" "}
        {ruleState.rule.can_switch_carriers ? "carrier changes allowed" : "carrier changes restricted"}.
      </p>
      {ruleState.rule.notes ? <p className="sf-status-text">{ruleState.rule.notes}</p> : null}
    </div>
  );
}

export default function MedSupSalesForumPanel({ state, dispatch, activeSection }) {
  const profile = useMemo(() => state.clientProfile || {}, [state.clientProfile]);
  const quoteInputs = useMemo(() => state.quoteInputs || {}, [state.quoteInputs]);
  const comboResult = useMemo(
    () =>
      calculateHDPGCombo({
        standardGMonthly: quoteInputs.standardGMonthly || quoteInputs.planGMonthly,
        hdgMonthly: quoteInputs.hdgMonthly,
        hipMonthly: quoteInputs.hipMonthly,
        hipDailyBenefit: quoteInputs.hipDailyBenefit,
        averageStayDays: quoteInputs.averageStayDays,
      }),
    [quoteInputs]
  );
  const comboSavings = comboResult.annualSavings;
  const isHDPG = quoteInputs.selectedPlanType === "hdg" || quoteInputs.planLetter === "HDG";
  const crossSellAcknowledged = Boolean(state.crossSellAcknowledged);
  const enrolled = Boolean(state.enrollOk && state.enrollmentDisposition === "enrolled");
  const updateQuote = ({ field, value }) => dispatch({ type: "SET_QUOTE_FIELD", field, value });

  return (
    <div className="medsup-sales-forum-panel">
      <CollapsibleWidget
        title="Client Context"
        icon={<SlidersHorizontal size={11} />}
        defaultCollapsed={activeSection > 5}
      >
        <ClientQuoteContext profile={profile} quoteInputs={quoteInputs} dispatch={dispatch} />
      </CollapsibleWidget>

      {activeSection >= 5 ? (
        <CollapsibleWidget
          title="Plan G vs N"
          icon={<MapPin size={11} />}
          defaultCollapsed={false}
        >
          <ExcessChargeAdvisor
            stateCode={profile.state}
            planGMonthly={quoteInputs.planGMonthly}
            planNMonthly={quoteInputs.planNMonthly}
          />
        </CollapsibleWidget>
      ) : null}

      <BirthdayRuleAlert
        clientName={profile.name}
        stateCode={profile.state}
        dob={profile.dob}
      />

      {activeSection >= 5 ? (
        <CollapsibleWidget
          title="Rate Comparison"
          icon={<SlidersHorizontal size={11} />}
          defaultCollapsed={false}
        >
          <RateComparisonPanel
            zipCode={profile.zipCode}
            age={profile.age}
            gender={profile.gender}
            tobaccoUse={profile.tobaccoUse}
            planLetter={quoteInputs.planLetter || "G"}
            onManualRateAdded={(rate) => {
              if (rate.planLetter === "G" && !quoteInputs.planGMonthly) {
                dispatch({ type: "SET_QUOTE_FIELD", field: "planGMonthly", value: String(rate.monthlyPremium) });
              }
              if (rate.planLetter === "N" && !quoteInputs.planNMonthly) {
                dispatch({ type: "SET_QUOTE_FIELD", field: "planNMonthly", value: String(rate.monthlyPremium) });
              }
            }}
          />
        </CollapsibleWidget>
      ) : null}

      {activeSection >= 5 ? (
        <CollapsibleWidget
          title="HDPG Combo"
          icon={<AlertTriangle size={11} />}
          defaultCollapsed={comboSavings <= 0}
        >
          {comboSavings > 0 ? (
            <div className="sf-panel">
              <div className="sf-panel-heading">
                <span className="sf-dot sf-dot--green" />
                <span>Co-Pilot Offer</span>
              </div>
              <p className="sf-muted">
                Would you like to show the client the HDPG + Hospital Protection combo?
                It could save them {formatMoney(comboSavings)}/year.
              </p>
            </div>
          ) : null}
          <HDPGComboAnalysis
            standardGMonthly={quoteInputs.standardGMonthly || quoteInputs.planGMonthly}
            hdgMonthly={quoteInputs.hdgMonthly}
            hipMonthly={quoteInputs.hipMonthly}
            hipDailyBenefit={quoteInputs.hipDailyBenefit}
            averageStayDays={quoteInputs.averageStayDays}
            onChange={updateQuote}
          />
        </CollapsibleWidget>
      ) : null}

      <CrossSellTrigger
        primaryProduct="MedSup"
        primaryCarrier={quoteInputs.primaryCarrier}
        clientAge={profile.age}
        clientState={profile.state}
        enrolled={enrolled}
        acknowledged={crossSellAcknowledged}
        isHDPG={isHDPG}
        onAcknowledged={(payload) =>
          dispatch({
            type: "SET_CROSS_SELL_ACKNOWLEDGED",
            value: true,
            payload,
          })
        }
      />
    </div>
  );
}
