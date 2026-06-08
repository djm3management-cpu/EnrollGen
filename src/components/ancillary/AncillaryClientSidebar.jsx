import QuickNotes from "../QuickNotes";
import { US_STATE_OPTIONS } from "../../lib/postCallPipeline";
import {
  ANCILLARY_PRODUCT_META,
  SUB_PRODUCT,
} from "../../flows/ancillary/ancillaryConstants";

function valueOrEmpty(value) {
  return value ?? "";
}

function Field({ label, children }) {
  return (
    <label className="ancillary-client-sidebar__field">
      <span>{label}</span>
      {children}
    </label>
  );
}

const PRODUCT_OPTIONS = [
  ["", "Select"],
  [SUB_PRODUCT.HIP, ANCILLARY_PRODUCT_META[SUB_PRODUCT.HIP].label],
  [SUB_PRODUCT.FE, ANCILLARY_PRODUCT_META[SUB_PRODUCT.FE].label],
  [SUB_PRODUCT.DVH, ANCILLARY_PRODUCT_META[SUB_PRODUCT.DVH].label],
  [SUB_PRODUCT.ANNUITY, ANCILLARY_PRODUCT_META[SUB_PRODUCT.ANNUITY].label],
];

export default function AncillaryClientSidebar({ state, dispatch, activeProduct }) {
  const customer = state.customerInfo || {};
  const activeMeta = activeProduct ? ANCILLARY_PRODUCT_META[activeProduct] : null;
  const updateCustomer = (field, value) =>
    dispatch({ type: "SET_CUSTOMER_INFO_FIELD", field, value });

  return (
    <div className="ancillary-client-sidebar">
      <div className="sf-panel ancillary-client-sidebar__panel">
        <div className="sf-panel-heading">
          <span className="sf-dot sf-dot--amber" />
          <span>Customer Info</span>
        </div>

        <div className="ancillary-client-sidebar__summary">
          <strong>{customer.name || "New Ancillary Customer"}</strong>
          <span>{activeMeta?.label || "No ancillary product selected"}</span>
        </div>

        <div className="sf-form-grid ancillary-client-sidebar__grid">
          <Field label="Customer">
            <input
              value={valueOrEmpty(customer.name)}
              onChange={(event) => updateCustomer("name", event.target.value)}
              placeholder="Name"
            />
          </Field>

          <Field label="Phone">
            <input
              value={valueOrEmpty(customer.phone)}
              onChange={(event) => updateCustomer("phone", event.target.value)}
              placeholder="Phone"
            />
          </Field>

          <Field label="Age">
            <input
              value={valueOrEmpty(customer.age)}
              onChange={(event) => updateCustomer("age", event.target.value)}
              placeholder="Age"
            />
          </Field>

          <Field label="State">
            <select
              value={valueOrEmpty(customer.state)}
              onChange={(event) => updateCustomer("state", event.target.value)}
            >
              <option value="">State</option>
              {US_STATE_OPTIONS.map((stateCode) => (
                <option key={stateCode} value={stateCode}>
                  {stateCode}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Product">
            <select
              value={valueOrEmpty(customer.productInterest || activeProduct)}
              onChange={(event) => updateCustomer("productInterest", event.target.value)}
            >
              {PRODUCT_OPTIONS.map(([value, label]) => (
                <option key={value || "blank"} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Primary">
            <select
              value={valueOrEmpty(customer.primaryCoverage)}
              onChange={(event) => updateCustomer("primaryCoverage", event.target.value)}
            >
              <option value="">Select</option>
              <option value="MA">MA</option>
              <option value="MedSup">Med Sup</option>
              <option value="ACA">ACA</option>
              <option value="U65">U65</option>
              <option value="None">None</option>
            </select>
          </Field>

          <Field label="Carrier">
            <input
              value={valueOrEmpty(customer.carrier)}
              onChange={(event) => updateCustomer("carrier", event.target.value)}
              placeholder="Carrier"
            />
          </Field>

          <Field label="Budget">
            <input
              value={valueOrEmpty(customer.budget)}
              onChange={(event) => updateCustomer("budget", event.target.value)}
              placeholder="$ / mo"
            />
          </Field>
        </div>
      </div>

      <QuickNotes
        value={state.agentNotes || ""}
        onChange={(value) => dispatch({ type: "SET_AGENT_NOTES", value })}
        title="Ancillary Notes"
        placeholder="Needs, objections, quote details, riders, follow-up..."
      />
    </div>
  );
}
