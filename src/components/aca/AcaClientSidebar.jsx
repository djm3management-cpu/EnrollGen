import QuickNotes from "../QuickNotes";
import { US_STATE_OPTIONS } from "../../lib/postCallPipeline";

function valueOrEmpty(value) {
  return value ?? "";
}

function Field({ label, children }) {
  return (
    <label className="aca-client-sidebar__field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function AcaClientSidebar({ state, dispatch, variant }) {
  const profile = state.clientProfile || {};
  const updateProfile = (field, value) =>
    dispatch({ type: "SET_CLIENT_PROFILE_FIELD", field, value });
  const updateEnrollmentPeriod = (period) =>
    dispatch({ type: "SET_ENROLLMENT_PERIOD", period: period || null });

  return (
    <div className="aca-client-sidebar">
      <div className="sf-panel aca-client-sidebar__panel">
        <div className="sf-panel-heading">
          <span className="sf-dot sf-dot--amber" />
          <span>ACA Client Info</span>
        </div>

        <div className="aca-client-sidebar__summary">
          <strong>{profile.name || "New ACA Client"}</strong>
          <span>{variant === "state" ? "State ACA" : "FFM"} workflow</span>
        </div>

        <div className="sf-form-grid aca-client-sidebar__grid">
          <Field label="Client">
            <input
              value={valueOrEmpty(profile.name)}
              onChange={(event) => updateProfile("name", event.target.value)}
              placeholder="Name"
            />
          </Field>

          <Field label="DOB">
            <input
              type="date"
              value={valueOrEmpty(profile.dob)}
              onChange={(event) => updateProfile("dob", event.target.value)}
            />
          </Field>

          <Field label="Age">
            <input
              value={valueOrEmpty(profile.age)}
              onChange={(event) => updateProfile("age", event.target.value)}
              placeholder="Age"
            />
          </Field>

          <Field label="State">
            <select
              value={valueOrEmpty(profile.state)}
              onChange={(event) => updateProfile("state", event.target.value)}
            >
              <option value="">State</option>
              {US_STATE_OPTIONS.map((stateCode) => (
                <option key={stateCode} value={stateCode}>
                  {stateCode}
                </option>
              ))}
            </select>
          </Field>

          <Field label="County">
            <input
              value={valueOrEmpty(profile.county)}
              onChange={(event) => updateProfile("county", event.target.value)}
              placeholder="County"
            />
          </Field>

          <Field label="Period">
            <select
              value={valueOrEmpty(state.enrollmentPeriod || profile.enrollmentPeriod)}
              onChange={(event) => updateEnrollmentPeriod(event.target.value)}
            >
              <option value="">Select</option>
              <option value="OEP">OEP</option>
              <option value="SEP">SEP</option>
            </select>
          </Field>

          <Field label="SEP Type">
            <input
              value={valueOrEmpty(profile.sepType)}
              onChange={(event) => updateProfile("sepType", event.target.value)}
              placeholder="Move, loss, etc."
            />
          </Field>

          <Field label="Coverage">
            <input
              value={valueOrEmpty(profile.currentCoverage)}
              onChange={(event) => updateProfile("currentCoverage", event.target.value)}
              placeholder="None, employer, Medicaid"
            />
          </Field>

          <Field label="HH Size">
            <input
              value={valueOrEmpty(profile.householdSize)}
              onChange={(event) => updateProfile("householdSize", event.target.value)}
              placeholder="Household"
            />
          </Field>

          <Field label="Income">
            <input
              value={valueOrEmpty(profile.householdIncome)}
              onChange={(event) => updateProfile("householdIncome", event.target.value)}
              placeholder="$ / year"
            />
          </Field>

          <Field label="Est. APTC">
            <input
              value={valueOrEmpty(profile.estimatedAPTC)}
              onChange={(event) => updateProfile("estimatedAPTC", event.target.value)}
              placeholder="$ / mo"
            />
          </Field>

          <Field label="CSR">
            <select
              value={valueOrEmpty(profile.csr)}
              onChange={(event) => updateProfile("csr", event.target.value)}
            >
              <option value="">Unknown</option>
              <option value="94">CSR 94</option>
              <option value="87">CSR 87</option>
              <option value="73">CSR 73</option>
              <option value="none">None</option>
            </select>
          </Field>

          <Field label="Preference">
            <input
              value={valueOrEmpty(profile.planPreference)}
              onChange={(event) => updateProfile("planPreference", event.target.value)}
              placeholder="Silver, low deductible"
            />
          </Field>

          <Field label="Plan">
            <input
              value={valueOrEmpty(profile.selectedPlan)}
              onChange={(event) => updateProfile("selectedPlan", event.target.value)}
              placeholder="Selected plan"
            />
          </Field>
        </div>
      </div>

      <QuickNotes
        value={state.agentNotes || ""}
        onChange={(value) => dispatch({ type: "SET_AGENT_NOTES", value })}
        title="ACA Agent Notes"
        placeholder="Income docs, SEP proof, providers, Rx, follow-up..."
      />
    </div>
  );
}
