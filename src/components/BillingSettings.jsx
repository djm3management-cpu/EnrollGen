import { useEffect, useMemo, useState } from "react";
import { CreditCard, ExternalLink, RefreshCcw, Zap } from "lucide-react";
import { useAppAuth } from "../context/AuthContext";
import { fetchWithClerk } from "../lib/clerkFetch";
import { useSubscription } from "../hooks/useSubscription";

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function planLabel(plan) {
  if (plan === "internal") return "Internal";
  if (plan === "pro") return "Pro";
  if (plan === "starter") return "Starter";
  if (plan === "trial") return "Trial";
  return "No Plan";
}

function UsageMetric({ label, value, suffix = "" }) {
  return (
    <div className="billing-usage-card">
      <span>{label}</span>
      <strong>
        {value}
        {suffix}
      </strong>
    </div>
  );
}

export default function BillingSettings() {
  const { getToken } = useAppAuth();
  const {
    subscription,
    usage,
    loading,
    error,
    isActive,
    isInternal,
    isPro,
    isStarter,
    isTrial,
    refetch,
  } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState("pro");
  const [seats, setSeats] = useState(subscription?.seat_count || 1);
  const [actionState, setActionState] = useState({ loading: "", error: "" });

  useEffect(() => {
    if (subscription?.seat_count) {
      setSeats(subscription.seat_count);
    }
  }, [subscription?.seat_count]);

  const statusClass = isActive ? "is-active" : "is-inactive";
  const trialDays = useMemo(() => {
    const end = subscription?.trial_ends_at;
    if (!end) return null;
    const diff = new Date(end).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  }, [subscription?.trial_ends_at]);

  async function openPortal() {
    setActionState({ loading: "portal", error: "" });
    try {
      const response = await fetchWithClerk(getToken, "/api/stripe-portal", {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || "Unable to open billing portal.");
      window.location.assign(data.url);
    } catch (err) {
      setActionState({ loading: "", error: err.message });
    }
  }

  async function startCheckout(plan = selectedPlan) {
    setActionState({ loading: plan, error: "" });
    try {
      const response = await fetchWithClerk(getToken, "/api/stripe-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, seats }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || "Unable to start checkout.");
      window.location.assign(data.url);
    } catch (err) {
      setActionState({ loading: "", error: err.message });
    }
  }

  return (
    <section className="billing-panel">
      <div className="billing-panel-header">
        <div>
          <span className="billing-eyebrow">SUBSCRIPTION</span>
          <h2>Billing Settings</h2>
        </div>
        <button
          type="button"
          className="billing-icon-button"
          onClick={refetch}
          title="Refresh billing status"
          disabled={loading}
        >
          <RefreshCcw size={15} />
        </button>
      </div>

      {error ? <div className="billing-alert is-error">{error}</div> : null}
      {actionState.error ? <div className="billing-alert is-error">{actionState.error}</div> : null}

      <div className="billing-status-grid">
        <div className="billing-status-card">
          <span>Current Plan</span>
          <strong>{loading ? "Loading..." : planLabel(subscription?.plan)}</strong>
          <small className={statusClass}>{subscription?.status || "inactive"}</small>
        </div>
        <div className="billing-status-card">
          <span>Seats</span>
          <strong>{subscription?.seat_count || seats}</strong>
          <small>Active agent capacity</small>
        </div>
        <div className="billing-status-card">
          <span>Billing Period</span>
          <strong>{formatDate(subscription?.current_period_start)}</strong>
          <small>Renews {formatDate(subscription?.current_period_end)}</small>
        </div>
        <div className="billing-status-card">
          <span>Trial</span>
          <strong>{isTrial ? `${trialDays ?? "--"} days` : "Not active"}</strong>
          <small>Trial ends {formatDate(subscription?.trial_ends_at)}</small>
        </div>
      </div>

      {isStarter ? (
        <div className="billing-alert">
          Starter is active. Live Co-Pilot, real-time transcription, CRM sync, and advanced analytics require Pro.
        </div>
      ) : null}

      {isInternal ? (
        <div className="billing-alert is-internal">
          Internal NGHS account. Billing gates are bypassed for this tenant.
        </div>
      ) : null}

      <div className="billing-actions-row">
        <label className="billing-seat-control">
          <span>Seats</span>
          <input
            type="number"
            min="1"
            max="250"
            value={seats}
            onChange={(event) => setSeats(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
        <button
          type="button"
          className="billing-button"
          onClick={openPortal}
          disabled={loading || isInternal || actionState.loading === "portal"}
        >
          <CreditCard size={15} />
          Manage Billing
        </button>
      </div>

      <div className="billing-plan-grid">
        <article className={`billing-plan-card${selectedPlan === "starter" ? " is-selected" : ""}`}>
          <div className="billing-plan-topline">
            <span>Starter</span>
            <strong>$49</strong>
          </div>
          <p>Script flows, compliance scoring, call records, and basic analytics.</p>
          <button
            type="button"
            className="billing-button"
            onClick={() => {
              setSelectedPlan("starter");
              startCheckout("starter");
            }}
            disabled={isInternal || actionState.loading === "starter"}
          >
            <ExternalLink size={14} />
            {subscription?.plan === "starter" ? "Update Starter" : "Choose Starter"}
          </button>
        </article>

        <article className={`billing-plan-card${selectedPlan === "pro" ? " is-selected" : ""}`}>
          <div className="billing-plan-topline">
            <span>Pro</span>
            <strong>$99</strong>
          </div>
          <p>Everything in Starter plus Co-Pilot, transcription, GHL sync, and advanced analytics.</p>
          <button
            type="button"
            className="billing-button is-primary"
            onClick={() => {
              setSelectedPlan("pro");
              startCheckout("pro");
            }}
            disabled={isInternal || actionState.loading === "pro"}
          >
            <Zap size={14} />
            {isPro ? "Update Pro" : "Upgrade Plan"}
          </button>
        </article>
      </div>

      <div className="billing-usage-section">
        <div className="billing-section-title">MONTH-TO-DATE USAGE</div>
        <div className="billing-usage-grid">
          <UsageMetric label="Calls" value={usage.call_completed || 0} />
          <UsageMetric label="Co-Pilot Tokens" value={Math.round(usage.claude_tokens || 0).toLocaleString()} />
          <UsageMetric label="Transcription" value={Math.round(usage.deepgram_minutes || 0)} suffix=" min" />
          <UsageMetric label="Compliance Scores" value={usage.compliance_score || 0} />
        </div>
      </div>
    </section>
  );
}
