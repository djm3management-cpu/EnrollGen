import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Plus, RefreshCcw, Send, Trash2 } from "lucide-react";
import BillingSettings from "./BillingSettings";
import { useAppAuth } from "../context/AuthContext";
import { fetchWithClerk } from "../lib/clerkFetch";
import { useSubscription } from "../hooks/useSubscription";
import { useTenantConfig } from "../hooks/useTenantConfig";
import { US_STATE_OPTIONS } from "../lib/postCallPipeline";

const DEFAULT_CARRIERS = [
  "Devoted Health",
  "Aetna",
  "Elevance / Anthem",
  "UnitedHealthcare",
  "Humana",
  "Cigna / HealthSpring",
  "Wellcare / Centene",
  "Zing Health",
  "HCSC / BCBS",
  "Manhattan Life",
  "Other",
];

const DEFAULT_COOP_RATES = {
  aetna: 150,
  "cigna / healthspring": 225,
  "elevance / anthem": 125,
  "zing health": 200,
};

const COMPLIANCE_CATEGORIES = [
  {
    key: "call_opening",
    name: "Call Opening",
    weight: 10,
    questions: [
      { id: "opening_agent_id", label: "Agent identification", weight: 40 },
      { id: "opening_beneficiary_name", label: "Beneficiary name", weight: 20 },
      { id: "opening_recording_consent", label: "Recording consent", weight: 40 },
    ],
  },
  {
    key: "required_disclosures",
    name: "Required Disclosures",
    weight: 15,
    questions: [
      { id: "disclosures_tpmo", label: "TPMO disclaimer", weight: 33 },
      { id: "disclosures_tpmo_timing", label: "TPMO timing", weight: 20 },
      { id: "disclosures_snp", label: "SNP disclosure", weight: 20 },
      { id: "disclosures_no_misleading", label: "No misleading claims", weight: 27 },
    ],
  },
  {
    key: "scope_of_appointment",
    name: "Scope of Appointment",
    weight: 12,
    questions: [
      { id: "soa_poa_check", label: "POA check", weight: 25 },
      { id: "soa_not_obligated", label: "No-obligation statement", weight: 33 },
      { id: "soa_products_permission", label: "Product permission", weight: 42 },
    ],
  },
  {
    key: "eligibility_verification",
    name: "Eligibility Verification",
    weight: 15,
    questions: [
      { id: "elig_decision_authority", label: "Decision authority", weight: 20 },
      { id: "elig_parts_ab", label: "Parts A/B", weight: 27 },
      { id: "elig_election_period", label: "Election period", weight: 20 },
      { id: "elig_disqualifying", label: "Coverage check", weight: 20 },
    ],
  },
  {
    key: "needs_assessment",
    name: "Needs Assessment",
    weight: 10,
    questions: [
      { id: "needs_providers", label: "Providers", weight: 36 },
      { id: "needs_medications", label: "Medications", weight: 36 },
      { id: "needs_recap", label: "Needs recap", weight: 28 },
    ],
  },
  {
    key: "presentation_sob",
    name: "Presentation / SOB",
    weight: 13,
    questions: [
      { id: "sob_review", label: "SOB review", weight: 27 },
      { id: "sob_network", label: "Network review", weight: 27 },
      { id: "sob_coverage_impact", label: "Coverage impact", weight: 20 },
      { id: "sob_disclosures", label: "Disclosures", weight: 26 },
    ],
  },
  {
    key: "consent_for_enrollment",
    name: "Consent for Enrollment",
    weight: 10,
    questions: [
      { id: "consent_plan_confirmed", label: "Plan confirmation", weight: 36 },
      { id: "consent_verbal", label: "Verbal consent", weight: 36 },
      { id: "consent_subject_to_approval", label: "Subject to Medicare approval", weight: 28 },
    ],
  },
  {
    key: "call_closing",
    name: "Call Closing",
    weight: 10,
    questions: [
      { id: "closing_confirmation", label: "Confirmation number", weight: 30 },
      { id: "closing_carrier_number", label: "Carrier phone", weight: 30 },
      { id: "closing_rights", label: "Rights", weight: 20 },
      { id: "closing_next_steps", label: "Next steps", weight: 20 },
    ],
  },
  {
    key: "consumer_experience",
    name: "Consumer Experience",
    weight: 5,
    questions: [
      { id: "cx_call_duration", label: "Call duration", weight: 38 },
      { id: "cx_section_order", label: "Section order", weight: 38 },
      { id: "cx_warnings_volume", label: "Warning volume", weight: 24 },
    ],
  },
];

const DEFAULT_COMPLIANCE_CONFIG = {
  version: 1,
  source: "Tenant settings defaults",
  categories: COMPLIANCE_CATEGORIES.map((category) => ({
    key: category.key,
    name: category.name,
    weight: category.weight,
    questions: category.questions.map((question) => ({ ...question, points: 0 })),
  })),
};

function isAdminUser(user) {
  const role =
    user?.publicMetadata?.role ||
    user?.privateMetadata?.role ||
    user?.organizationMemberships?.[0]?.role ||
    "";
  return role === "admin" || role === "org:admin" || user?.publicMetadata?.isAdmin === true;
}

function normalizeCoopRows(rates) {
  const source = rates && Object.keys(rates).length ? rates : DEFAULT_COOP_RATES;
  return Object.entries(source).map(([carrier, amount]) => ({ carrier, amount }));
}

function rowsToCoopRates(rows) {
  return Object.fromEntries(
    rows
      .filter((row) => row.carrier.trim())
      .map((row) => [row.carrier.trim().toLowerCase(), Number(row.amount) || 0])
  );
}

function cloneComplianceConfig(config = DEFAULT_COMPLIANCE_CONFIG) {
  return JSON.parse(JSON.stringify(config));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function toWeight(value, fallback = 50) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeQuestions(questions, fallbackQuestions = []) {
  if (Array.isArray(questions)) {
    return questions.map((question, index) => {
      const fallback = fallbackQuestions[index] || {};
      return {
        id: question?.id || fallback.id || `question_${index + 1}`,
        label: question?.label || fallback.label || `Question ${index + 1}`,
        points: Number(question?.points ?? fallback.points ?? 0),
        weight: toWeight(question?.weight, toWeight(fallback.weight, 50)),
      };
    });
  }

  if (questions && typeof questions === "object") {
    return fallbackQuestions.map((question) => ({
      ...question,
      weight: toWeight(questions[question.id] ?? questions[question.label], toWeight(question.weight, 50)),
    }));
  }

  return cloneJson(fallbackQuestions);
}

function normalizeComplianceConfig(config) {
  const defaults = cloneComplianceConfig(DEFAULT_COMPLIANCE_CONFIG);
  const fallbackByKey = new Map(defaults.categories.map((category) => [category.key, category]));

  if (Array.isArray(config?.categories) && config.categories.length) {
    const normalized = config.categories.map((category, index) => {
      const fallback = fallbackByKey.get(category?.key) || defaults.categories[index] || {};
      return {
        key: category?.key || fallback.key || `category_${index + 1}`,
        name: category?.name || fallback.name || `Category ${index + 1}`,
        weight: toWeight(category?.weight, toWeight(fallback.weight, 50)),
        cms_ref: category?.cms_ref || fallback.cms_ref || "",
        questions: normalizeQuestions(category?.questions, fallback.questions || []),
      };
    });
    const seen = new Set(normalized.map((category) => category.key));
    for (const fallback of defaults.categories) {
      if (!seen.has(fallback.key)) {
        normalized.push(fallback);
      }
    }
    return {
      ...defaults,
      ...config,
      categories: normalized,
    };
  }

  const legacyConfig = config && typeof config === "object" ? config : {};
  return {
    ...defaults,
    categories: defaults.categories.map((category) => {
      const legacyCategory = legacyConfig[category.key] || {};
      return {
        ...category,
        weight: toWeight(legacyCategory.weight, category.weight),
        questions: normalizeQuestions(legacyCategory.questions, category.questions),
      };
    }),
  };
}

function SettingsField({ label, children }) {
  return (
    <label className="tenant-settings-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export { isAdminUser };

export default function TenantSettings({ currentUser = null }) {
  const { getToken } = useAppAuth();
  const tenantBundle = useTenantConfig();
  const {
    tenant,
    tenantId,
    supabaseClient,
    agents: activeAgents,
    refetch: refetchTenant,
    loading,
  } = tenantBundle;
  const { subscription, isInternal } = useSubscription();
  const canAdmin = isAdminUser(currentUser);
  const [profile, setProfile] = useState({
    name: "",
    agency_npn: "",
    licensed_states: [],
    agency_display_name: "",
    ghl_webhook_url: "",
    ghl_location_id: "",
  });
  const [agents, setAgents] = useState([]);
  const [newAgent, setNewAgent] = useState({ name: "", npn: "", ghl_user_id: "" });
  const [carriers, setCarriers] = useState(DEFAULT_CARRIERS);
  const [newCarrier, setNewCarrier] = useState("");
  const [coopRows, setCoopRows] = useState(() => normalizeCoopRows(DEFAULT_COOP_RATES));
  const [complianceConfig, setComplianceConfig] = useState(() =>
    cloneComplianceConfig(DEFAULT_COMPLIANCE_CONFIG)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const seatLimit = isInternal ? Infinity : Number(subscription?.seat_count || 0);
  const activeAgentCount = agents.filter((agent) => agent.is_active !== false).length || activeAgents.length;
  const atSeatLimit = Number.isFinite(seatLimit) && activeAgentCount >= seatLimit;

  const loadAgents = useCallback(async () => {
    if (!tenantId) return;
    const { data, error } = await supabaseClient
      .from("tenant_agents")
      .select("id, name, npn, ghl_user_id, clerk_user_id, is_active")
      .eq("tenant_id", tenantId)
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw error;
    setAgents(data || []);
  }, [supabaseClient, tenantId]);

  useEffect(() => {
    if (!tenant) return;
    setProfile({
      name: tenant.name || "",
      agency_npn: tenant.agency_npn || "",
      licensed_states: tenant.licensed_states || [],
      agency_display_name: tenant.agency_display_name || tenant.name || "",
      ghl_webhook_url: tenant.ghl_webhook_url || "",
      ghl_location_id: tenant.ghl_location_id || "",
    });
    setCarriers(tenant.carrier_options?.length ? tenant.carrier_options : DEFAULT_CARRIERS);
    setCoopRows(normalizeCoopRows(tenant.coop_rates));
    setComplianceConfig(normalizeComplianceConfig(tenant.compliance_config));
  }, [tenant]);

  useEffect(() => {
    loadAgents().catch((error) => setMessage(error?.message || "Unable to load agents."));
  }, [loadAgents]);

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

  const saveTenant = async () => {
    if (!tenantId) return;
    setSaving(true);
    setMessage("");
    try {
      const { error } = await supabaseClient
        .from("tenants")
        .update({
          name: profile.name,
          agency_npn: profile.agency_npn,
          licensed_states: profile.licensed_states,
          agency_display_name: profile.agency_display_name,
          ghl_webhook_url: profile.ghl_webhook_url,
          ghl_location_id: profile.ghl_location_id,
          carrier_options: carriers.filter(Boolean),
          coop_rates: rowsToCoopRates(coopRows),
          compliance_config: complianceConfig,
        })
        .eq("id", tenantId);
      if (error) throw error;
      await refetchTenant();
      setMessage("Settings saved.");
    } catch (error) {
      setMessage(error?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const addAgent = async () => {
    if (!tenantId || !newAgent.name.trim() || atSeatLimit) return;
    const { error } = await supabaseClient.from("tenant_agents").insert({
      tenant_id: tenantId,
      name: newAgent.name.trim(),
      npn: newAgent.npn.trim() || null,
      ghl_user_id: newAgent.ghl_user_id.trim() || null,
      is_active: true,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    setNewAgent({ name: "", npn: "", ghl_user_id: "" });
    await loadAgents();
    await refetchTenant();
  };

  const updateAgent = async (agent, patch) => {
    const { error } = await supabaseClient
      .from("tenant_agents")
      .update(patch)
      .eq("id", agent.id)
      .eq("tenant_id", tenantId);
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadAgents();
    await refetchTenant();
  };

  const testWebhook = async () => {
    setMessage("");
    try {
      const response = await fetchWithClerk(getToken, "/api/test-ghl-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook_url: profile.ghl_webhook_url }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || "Webhook test failed.");
      setMessage("Webhook test sent.");
    } catch (error) {
      setMessage(error?.message || "Webhook test failed.");
    }
  };

  const setComplianceWeight = (categoryKey, value) => {
    setComplianceConfig((current) => ({
      ...current,
      categories: (current.categories || []).map((category) =>
        category.key === categoryKey ? { ...category, weight: Number(value) } : category
      ),
    }));
  };

  const setQuestionWeight = (categoryKey, questionId, value) => {
    setComplianceConfig((current) => ({
      ...current,
      categories: (current.categories || []).map((category) =>
        category.key !== categoryKey
          ? category
          : {
              ...category,
              questions: (category.questions || []).map((question) =>
                question.id === questionId ? { ...question, weight: Number(value) } : question
              ),
            }
      ),
    }));
  };

  const carrierSummary = useMemo(
    () => carriers.filter(Boolean).join(", "),
    [carriers]
  );

  if (!canAdmin) {
    return (
      <section className="tenant-settings-panel">
        <div className="tenant-settings-header">
          <span className="billing-eyebrow">SETTINGS</span>
          <h2>Tenant Settings</h2>
          <p>Admin access required.</p>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="tenant-settings-panel">
        <div className="tenant-settings-header">
          <span className="billing-eyebrow">SETTINGS</span>
          <h2>Tenant Settings</h2>
          <p>Loading agency configuration.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="tenant-settings-panel">
      <div className="tenant-settings-header">
        <div>
          <span className="billing-eyebrow">TENANT ADMIN</span>
          <h2>Agency Settings</h2>
          <p>{profile.agency_display_name || profile.name || "Agency configuration"}</p>
        </div>
        <button type="button" className="billing-button is-primary" onClick={saveTenant} disabled={saving}>
          <Check size={15} />
          {saving ? "Saving" : "Save Settings"}
        </button>
      </div>

      {message ? <div className="billing-alert">{message}</div> : null}

      <div className="tenant-settings-grid">
        <section className="tenant-settings-card">
          <div className="tenant-settings-section-title">Agency Profile</div>
          <div className="tenant-settings-two-col">
            <SettingsField label="Agency name">
              <input value={profile.name} onChange={(event) => updateProfile("name", event.target.value)} />
            </SettingsField>
            <SettingsField label="Agency NPN">
              <input value={profile.agency_npn} onChange={(event) => updateProfile("agency_npn", event.target.value)} />
            </SettingsField>
            <SettingsField label="Operations display name">
              <input
                value={profile.agency_display_name}
                onChange={(event) => updateProfile("agency_display_name", event.target.value)}
              />
            </SettingsField>
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

        <section className="tenant-settings-card">
          <div className="tenant-settings-section-title">CRM Integration</div>
          <SettingsField label="GHL webhook URL">
            <div className="tenant-settings-inline">
              <input
                value={profile.ghl_webhook_url}
                onChange={(event) => updateProfile("ghl_webhook_url", event.target.value)}
                placeholder="https://services.leadconnectorhq.com/hooks/..."
              />
              <button type="button" className="billing-icon-button" onClick={testWebhook} title="Test webhook">
                <Send size={15} />
              </button>
            </div>
          </SettingsField>
          <SettingsField label="GHL location ID">
            <input
              value={profile.ghl_location_id}
              onChange={(event) => updateProfile("ghl_location_id", event.target.value)}
            />
          </SettingsField>
          <p className="tenant-settings-muted">
            Enter your GoHighLevel inbound webhook URL. EnrollGen sends enrollment data here after each completed call.
          </p>
        </section>

        <section className="tenant-settings-card tenant-settings-card-wide">
          <div className="tenant-settings-section-title">
            Agent Management
            <span>
              {activeAgentCount} of {Number.isFinite(seatLimit) ? seatLimit : "unlimited"} seats used
            </span>
          </div>
          <div className="tenant-agent-table">
            <div className="tenant-agent-row tenant-agent-row-head">
              <span>Name</span>
              <span>NPN</span>
              <span>GHL User ID</span>
              <span>Active</span>
              <span />
            </div>
            {agents.map((agent) => (
              <div className="tenant-agent-row" key={agent.id}>
                <span>{agent.name}</span>
                <span>{agent.npn || "--"}</span>
                <span>{agent.ghl_user_id || "--"}</span>
                <label className="tenant-settings-toggle">
                  <input
                    type="checkbox"
                    checked={agent.is_active !== false}
                    onChange={(event) => updateAgent(agent, { is_active: event.target.checked })}
                  />
                </label>
                <button
                  type="button"
                  className="billing-icon-button"
                  onClick={() => updateAgent(agent, { is_active: false })}
                  title="Remove agent"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="tenant-settings-add-row">
            <input
              placeholder="Agent name"
              value={newAgent.name}
              onChange={(event) => setNewAgent((current) => ({ ...current, name: event.target.value }))}
            />
            <input
              placeholder="NPN"
              value={newAgent.npn}
              onChange={(event) => setNewAgent((current) => ({ ...current, npn: event.target.value }))}
            />
            <input
              placeholder="GHL User ID"
              value={newAgent.ghl_user_id}
              onChange={(event) => setNewAgent((current) => ({ ...current, ghl_user_id: event.target.value }))}
            />
            <button type="button" className="billing-button" onClick={addAgent} disabled={atSeatLimit}>
              <Plus size={14} />
              Add Agent
            </button>
          </div>
          {atSeatLimit ? <div className="billing-alert is-error">Upgrade your plan for more seats.</div> : null}
        </section>

        <section className="tenant-settings-card">
          <div className="tenant-settings-section-title">Carrier Configuration</div>
          <div className="tenant-settings-carrier-list">
            {carriers.map((carrier, index) => (
              <div className="tenant-settings-inline" key={`${carrier}-${index}`}>
                <input
                  value={carrier}
                  onChange={(event) =>
                    setCarriers((current) =>
                      current.map((item, idx) => (idx === index ? event.target.value : item))
                    )
                  }
                />
                <button
                  type="button"
                  className="billing-icon-button"
                  onClick={() => setCarriers((current) => current.filter((_, idx) => idx !== index))}
                  title="Remove carrier"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="tenant-settings-inline">
            <input value={newCarrier} onChange={(event) => setNewCarrier(event.target.value)} placeholder="Add carrier" />
            <button
              type="button"
              className="billing-icon-button"
              onClick={() => {
                if (!newCarrier.trim()) return;
                setCarriers((current) => [...current, newCarrier.trim()]);
                setNewCarrier("");
              }}
            >
              <Plus size={14} />
            </button>
          </div>
          <p className="tenant-settings-muted">Current wrap-up carrier list: {carrierSummary || "none"}</p>
        </section>

        <section className="tenant-settings-card">
          <div className="tenant-settings-section-title">Co-op Rates</div>
          <div className="tenant-settings-rate-list">
            {coopRows.map((row, index) => (
              <div className="tenant-settings-inline" key={`${row.carrier}-${index}`}>
                <input
                  value={row.carrier}
                  onChange={(event) =>
                    setCoopRows((current) =>
                      current.map((item, idx) => (idx === index ? { ...item, carrier: event.target.value } : item))
                    )
                  }
                />
                <input
                  type="number"
                  min="0"
                  value={row.amount}
                  onChange={(event) =>
                    setCoopRows((current) =>
                      current.map((item, idx) => (idx === index ? { ...item, amount: event.target.value } : item))
                    )
                  }
                />
                <button
                  type="button"
                  className="billing-icon-button"
                  onClick={() => setCoopRows((current) => current.filter((_, idx) => idx !== index))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="billing-button"
            onClick={() => setCoopRows((current) => [...current, { carrier: "", amount: 0 }])}
          >
            <Plus size={14} />
            Add Rate
          </button>
        </section>

        <section className="tenant-settings-card tenant-settings-card-wide">
          <div className="tenant-settings-section-title">
            Compliance Configuration
            <button
              type="button"
              className="billing-icon-button"
              onClick={() => setComplianceConfig(cloneComplianceConfig(DEFAULT_COMPLIANCE_CONFIG))}
              title="Reset to defaults"
            >
              <RefreshCcw size={14} />
            </button>
          </div>
          <div className="tenant-compliance-grid">
            {(complianceConfig.categories || []).map((category) => (
              <article className="tenant-compliance-card" key={category.key}>
                <div className="tenant-compliance-title">
                  <span>{category.name}</span>
                  <strong>{category.weight ?? 50}</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={category.weight ?? 50}
                  onChange={(event) => setComplianceWeight(category.key, event.target.value)}
                />
                {(category.questions || []).map((question) => (
                  <label key={question.id} className="tenant-compliance-question">
                    <span>{question.label}</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={question.weight ?? 50}
                      onChange={(event) => setQuestionWeight(category.key, question.id, event.target.value)}
                    />
                  </label>
                ))}
              </article>
            ))}
          </div>
        </section>

        <section className="tenant-settings-card tenant-settings-card-wide">
          <BillingSettings />
        </section>
      </div>
    </section>
  );
}
