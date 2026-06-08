import { useMemo, useState } from "react";
import { ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import EnrollGenLogo from "./EnrollGenLogo";
import { useAppAuth } from "../context/AuthContext";
import { fetchWithClerk } from "../lib/clerkFetch";
import { US_STATE_OPTIONS } from "../lib/postCallPipeline";

const STEPS = ["Welcome", "Agents", "CRM", "Plan", "Ready"];

function defaultAgent(user) {
  return {
    name: user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "",
    npn: "",
    ghl_user_id: "",
  };
}

export default function Onboarding({ currentUser = null, onComplete }) {
  const { getToken } = useAppAuth();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({
    agency_name: "",
    agency_npn: "",
    licensed_states: [],
    agency_display_name: "",
    ghl_webhook_url: "",
    ghl_location_id: "",
  });
  const [agents, setAgents] = useState(() => [defaultAgent(currentUser)]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const seats = Math.max(1, agents.filter((agent) => agent.name.trim()).length);
  const canContinue = useMemo(() => {
    if (step === 0) return profile.agency_name.trim().length > 1;
    if (step === 1) return agents.some((agent) => agent.name.trim().length > 1);
    return true;
  }, [agents, profile.agency_name, step]);

  const updateProfile = (field, value) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const toggleState = (stateCode) => {
    setProfile((current) => {
      const exists = current.licensed_states.includes(stateCode);
      return {
        ...current,
        licensed_states: exists
          ? current.licensed_states.filter((item) => item !== stateCode)
          : [...current.licensed_states, stateCode].sort(),
      };
    });
  };

  const seedTenant = async () => {
    const response = await fetchWithClerk(getToken, "/api/seed-new-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant: {
          name: profile.agency_name,
          agency_display_name: profile.agency_display_name || profile.agency_name,
          agency_npn: profile.agency_npn,
          licensed_states: profile.licensed_states,
          ghl_webhook_url: profile.ghl_webhook_url,
          ghl_location_id: profile.ghl_location_id,
        },
        agents: agents.filter((agent) => agent.name.trim()),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || data.error || "Unable to create tenant.");
    return data;
  };

  const choosePlan = async (plan) => {
    setSaving(true);
    setMessage("");
    try {
      await seedTenant();
      const checkout = await fetchWithClerk(getToken, "/api/stripe-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, seats }),
      });
      const data = await checkout.json().catch(() => ({}));
      if (!checkout.ok) throw new Error(data.detail || data.error || "Unable to start checkout.");
      window.location.assign(data.url);
    } catch (error) {
      setMessage(error?.message || "Onboarding failed.");
    } finally {
      setSaving(false);
    }
  };

  const finishWithoutCheckout = async () => {
    setSaving(true);
    setMessage("");
    try {
      await seedTenant();
      setStep(4);
      await onComplete?.();
    } catch (error) {
      setMessage(error?.message || "Unable to finish onboarding.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="onboarding-shell">
      <div className="onboarding-card">
        <div className="onboarding-brand">
          <EnrollGenLogo width={138} />
          <span>Agency Onboarding</span>
        </div>

        <div className="onboarding-progress">
          {STEPS.map((label, index) => (
            <span key={label} className={index <= step ? "is-active" : ""}>
              {label}
            </span>
          ))}
        </div>

        {message ? <div className="billing-alert is-error">{message}</div> : null}

        {step === 0 ? (
          <section className="onboarding-step">
            <span className="billing-eyebrow">WELCOME TO ENROLLGEN</span>
            <h1>Set up your agency workspace</h1>
            <div className="tenant-settings-two-col">
              <label className="tenant-settings-field">
                <span>Agency name</span>
                <input
                  value={profile.agency_name}
                  onChange={(event) => updateProfile("agency_name", event.target.value)}
                  placeholder="Agency LLC"
                />
              </label>
              <label className="tenant-settings-field">
                <span>Agency NPN</span>
                <input
                  value={profile.agency_npn}
                  onChange={(event) => updateProfile("agency_npn", event.target.value)}
                  placeholder="National producer number"
                />
              </label>
              <label className="tenant-settings-field">
                <span>Display name</span>
                <input
                  value={profile.agency_display_name}
                  onChange={(event) => updateProfile("agency_display_name", event.target.value)}
                  placeholder="Operations dashboard name"
                />
              </label>
            </div>
            <div className="tenant-settings-state-grid">
              {US_STATE_OPTIONS.map((stateCode) => (
                <label key={stateCode} className="tenant-settings-state">
                  <input
                    type="checkbox"
                    checked={profile.licensed_states.includes(stateCode)}
                    onChange={() => toggleState(stateCode)}
                  />
                  {stateCode}
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="onboarding-step">
            <span className="billing-eyebrow">ADD YOUR AGENTS</span>
            <h1>Seat count starts with active agents</h1>
            <div className="onboarding-agent-list">
              {agents.map((agent, index) => (
                <div className="tenant-settings-add-row" key={index}>
                  <input
                    placeholder="Agent name"
                    value={agent.name}
                    onChange={(event) =>
                      setAgents((current) =>
                        current.map((item, idx) =>
                          idx === index ? { ...item, name: event.target.value } : item
                        )
                      )
                    }
                  />
                  <input
                    placeholder="NPN"
                    value={agent.npn}
                    onChange={(event) =>
                      setAgents((current) =>
                        current.map((item, idx) =>
                          idx === index ? { ...item, npn: event.target.value } : item
                        )
                      )
                    }
                  />
                  <button
                    type="button"
                    className="billing-icon-button"
                    onClick={() => setAgents((current) => current.filter((_, idx) => idx !== index))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="billing-button"
              onClick={() => setAgents((current) => [...current, { name: "", npn: "", ghl_user_id: "" }])}
            >
              <Plus size={14} />
              Add Agent
            </button>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="onboarding-step">
            <span className="billing-eyebrow">CONNECT YOUR CRM</span>
            <h1>CRM sync can be added now or later</h1>
            <label className="tenant-settings-field">
              <span>CRM webhook URL</span>
              <input
                value={profile.ghl_webhook_url}
                onChange={(event) => updateProfile("ghl_webhook_url", event.target.value)}
                placeholder="https://services.leadconnectorhq.com/hooks/..."
              />
            </label>
            <label className="tenant-settings-field">
              <span>CRM location ID</span>
              <input
                value={profile.ghl_location_id}
                onChange={(event) => updateProfile("ghl_location_id", event.target.value)}
              />
            </label>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="onboarding-step">
            <span className="billing-eyebrow">CHOOSE YOUR PLAN</span>
            <h1>{seats} seat{seats === 1 ? "" : "s"} selected</h1>
            <div className="billing-plan-grid">
              <article className="billing-plan-card">
                <div className="billing-plan-topline">
                  <span>Starter</span>
                  <strong>$49</strong>
                </div>
                <p>Script flows, compliance scoring, call records, and basic analytics.</p>
                <button type="button" className="billing-button" disabled={saving} onClick={() => choosePlan("starter")}>
                  Start Starter
                </button>
              </article>
              <article className="billing-plan-card is-selected">
                <div className="billing-plan-topline">
                  <span>Pro</span>
                  <strong>$99</strong>
                </div>
                <p>Live Co-Pilot, transcription, CRM integration, and advanced analytics.</p>
                <button type="button" className="billing-button is-primary" disabled={saving} onClick={() => choosePlan("pro")}>
                  Start Pro
                </button>
              </article>
            </div>
            <button type="button" className="onboarding-skip" onClick={finishWithoutCheckout} disabled={saving}>
              Save setup and choose billing later
            </button>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="onboarding-step">
            <span className="billing-eyebrow">READY</span>
            <h1>Your agency workspace is ready</h1>
            <p>Settings, agents, CRM configuration, and default content have been created.</p>
            <button type="button" className="billing-button is-primary" onClick={onComplete}>
              <Check size={15} />
              Enter EnrollGen
            </button>
          </section>
        ) : null}

        {step < 3 ? (
          <div className="onboarding-footer">
            <button
              type="button"
              className="billing-button"
              disabled={step === 0}
              onClick={() => setStep((current) => Math.max(0, current - 1))}
            >
              Back
            </button>
            <button
              type="button"
              className="billing-button is-primary"
              disabled={!canContinue}
              onClick={() => setStep((current) => current + 1)}
            >
              Continue
              <ArrowRight size={14} />
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
