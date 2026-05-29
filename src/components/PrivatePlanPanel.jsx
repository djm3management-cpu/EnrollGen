import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  PRIVATE_PLAN_DECISION_ROWS,
  PRIVATE_PLAN_PLAYBOOK_URL,
  PRIVATE_PLAN_PRODUCTS,
} from "../data/privatePlans";
import {
  DEFAULT_PRIVATE_PLAN_RATE_OPTIONS,
  PRIVATE_PLAN_RATE_OPTIONS,
  formatPrivatePlanCurrency,
  getCustomerAgeFromDob,
  getPrivatePlanAgeBand,
  getPrivatePlanRates,
} from "../data/privatePlanRates";
import { DentalOptionsSection } from "./DentalReferencePanel";
import PrivatePlanCard from "./PrivatePlanCard";
import PlaybookModal from "./PlaybookModal";
import UnderwritingChecker from "./UnderwritingChecker";

const COVERAGE_TIERS = [
  { key: "employee", label: "Employee" },
  { key: "spouse", label: "Employee & Spouse" },
  { key: "children", label: "Employee & Child(ren)" },
  { key: "family", label: "Family" },
];

function DetailRow({ label, value }) {
  return (
    <div className="private-plan-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProductDetail({
  product,
  customerDob,
  customerAge,
  activeRateOption,
  onCustomerDobChange,
  onCustomerDobClear,
  onRateOptionChange,
}) {
  const rateOptions = PRIVATE_PLAN_RATE_OPTIONS[product.id] || [];
  const selectedRateOption =
    rateOptions.find((option) => String(option.key) === String(activeRateOption)) ||
    rateOptions[0];
  const ageBand = getPrivatePlanAgeBand(product.id, customerAge);
  const hasDob = customerDob.trim().length > 0;
  const rates =
    hasDob && ageBand && selectedRateOption
      ? getPrivatePlanRates(product.id, selectedRateOption.key, ageBand)
      : null;
  const optionLabel = selectedRateOption?.rateLabel || selectedRateOption?.label || "";
  const childTierLabel =
    product.id === "medperformance" ? "Employee & Children" : "Employee & Child(ren)";
  const coverageTiers = COVERAGE_TIERS.map((tier) =>
    tier.key === "children" ? { ...tier, label: childTierLabel } : tier
  );
  const ageStatus = hasDob
    ? customerAge == null
      ? "Enter a valid DOB."
      : ageBand
        ? `Age: ${customerAge} | Band: ${ageBand}`
        : "Not eligible - age must be 18-64."
    : "";

  return (
    <article className="private-plan-detail">
      <div className="private-plan-detail__header">
        <div>
          <span className="private-plan-kicker">Selected Product</span>
          <h3>{product.name}</h3>
        </div>
        <span className="private-plan-premium">{product.startingPremium}</span>
      </div>

      <div className="private-plan-dob-control">
        <label className="private-plan-dob-field">
          <span>Customer DOB</span>
          <input
            type="date"
            value={customerDob}
            onChange={(event) => onCustomerDobChange(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="private-plan-dob-clear"
          onClick={onCustomerDobClear}
          disabled={!customerDob}
        >
          Clear
        </button>
      </div>

      {hasDob ? (
        <div className={`private-plan-age-status${ageBand ? "" : " is-warning"}`}>
          {ageStatus}
        </div>
      ) : null}

      {rateOptions.length ? (
        <div className="private-plan-chip-row" aria-label={`${product.name} rate options`}>
          {rateOptions.map((option) => {
            const selected = String(option.key) === String(selectedRateOption?.key);
            return (
              <button
                type="button"
                key={option.key}
                className={`private-plan-chip${selected ? " is-active" : ""}`}
                onClick={() => onRateOptionChange(product.id, option.key)}
                aria-pressed={selected}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="private-plan-detail-grid">
        <DetailRow label="Plan Type" value={product.planType} />
        <DetailRow label="Network" value={product.network} />
        <DetailRow label="TPA" value={product.tpa} />
        <DetailRow label="PBM" value={product.pbm} />
        <DetailRow label="Stop-Loss" value={product.stopLoss} />
      </div>

      {rates ? (
        <div className="private-plan-rates">
          <div className="private-plan-rates__header">
            <span className="private-plan-mini-block__label">Monthly Rates</span>
            <strong>
              Age Band: {ageBand}, {optionLabel}
            </strong>
          </div>
          <table className="private-plan-rates-table">
            <tbody>
              {coverageTiers.map((tier) => (
                <tr key={tier.key}>
                  <th scope="row">{tier.label}</th>
                  <td>
                    {formatPrivatePlanCurrency(rates[tier.key], product.id === "medmax")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {product.variants?.length ? (
        <div className="private-plan-variant-grid">
          {product.variants.map((variant) => (
            <div key={variant.name} className="private-plan-variant">
              <div className="private-plan-variant__name">{variant.name}</div>
              <span>{variant.underwriting}</span>
              <span>{variant.oopMax}</span>
              <strong>{variant.startingPremium}</strong>
            </div>
          ))}
        </div>
      ) : null}

      <div className="private-plan-mini-block">
        <span className="private-plan-mini-block__label">Highlights</span>
        <ul>
          {product.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      </div>

      <div className="private-plan-mini-block">
        <span className="private-plan-mini-block__label">Underwriting Summary</span>
        <p>{product.underwritingSummary}</p>
      </div>
    </article>
  );
}

function DecisionGuide({ product }) {
  return (
    <section className="private-plan-section">
      <div className="private-plan-section-head">
        <div>
          <span className="private-plan-kicker">Compare</span>
          <h3>{product.shortName} Decision Guide</h3>
        </div>
      </div>
      <div className="private-plan-detail-grid">
        {PRIVATE_PLAN_DECISION_ROWS.map((row) => (
          <DetailRow
            key={row.label}
            label={row.label}
            value={row.values[product.id]}
          />
        ))}
      </div>
    </section>
  );
}

export default function PrivatePlanPanel({
  highlightUnderwriting = false,
  onAcknowledgeUnderwritingHighlight,
}) {
  const [selectedProductId, setSelectedProductId] = useState(PRIVATE_PLAN_PRODUCTS[0].id);
  const [modalOpen, setModalOpen] = useState(false);
  const [customerDob, setCustomerDob] = useState("");
  const [rateOptionByProduct, setRateOptionByProduct] = useState(
    DEFAULT_PRIVATE_PLAN_RATE_OPTIONS
  );
  const selectedProduct = useMemo(
    () =>
      PRIVATE_PLAN_PRODUCTS.find((product) => product.id === selectedProductId) ||
      PRIVATE_PLAN_PRODUCTS[0],
    [selectedProductId]
  );
  const customerAge = useMemo(() => getCustomerAgeFromDob(customerDob), [customerDob]);
  const activeRateOption =
    rateOptionByProduct[selectedProduct.id] ||
    DEFAULT_PRIVATE_PLAN_RATE_OPTIONS[selectedProduct.id];

  const handleRateOptionChange = (productId, optionKey) => {
    setRateOptionByProduct((current) => ({
      ...current,
      [productId]: optionKey,
    }));
  };

  return (
    <section className="private-plan-panel">
      <section className="private-plan-section">
        <div className="private-plan-section-head">
          <div>
            <span className="private-plan-kicker">Product Selector</span>
            <h3>Choose a Product</h3>
          </div>
        </div>
        <div className="private-plan-card-list">
          {PRIVATE_PLAN_PRODUCTS.map((product) => (
            <PrivatePlanCard
              key={product.id}
              product={product}
              selected={product.id === selectedProductId}
              onSelect={setSelectedProductId}
            />
          ))}
        </div>
        <ProductDetail
          product={selectedProduct}
          customerDob={customerDob}
          customerAge={customerAge}
          activeRateOption={activeRateOption}
          onCustomerDobChange={setCustomerDob}
          onCustomerDobClear={() => setCustomerDob("")}
          onRateOptionChange={handleRateOptionChange}
        />
      </section>

      <DecisionGuide product={selectedProduct} />

      <UnderwritingChecker
        selectedProductId={selectedProductId}
        highlighted={highlightUnderwriting}
        onAcknowledgeHighlight={onAcknowledgeUnderwritingHighlight}
      />

      <DentalOptionsSection />

      <button
        type="button"
        className="private-plan-open-btn private-plan-open-btn--bottom"
        onClick={() => setModalOpen(true)}
      >
        <ExternalLink size={13} />
        Open Full Playbook
      </button>

      <PlaybookModal
        open={modalOpen}
        src={PRIVATE_PLAN_PLAYBOOK_URL}
        onClose={() => setModalOpen(false)}
      />
    </section>
  );
}
