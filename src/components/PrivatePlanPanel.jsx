import { useMemo, useState } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import {
  PRIVATE_PLAN_DECISION_ROWS,
  PRIVATE_PLAN_PLAYBOOK_URL,
  PRIVATE_PLAN_PRODUCTS,
} from "../data/privatePlans";
import { DentalOptionsSection } from "./DentalReferencePanel";
import PrivatePlanCard from "./PrivatePlanCard";
import PlaybookModal from "./PlaybookModal";
import UnderwritingChecker from "./UnderwritingChecker";

function DetailRow({ label, value }) {
  return (
    <div className="private-plan-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProductDetail({ product }) {
  return (
    <article className="private-plan-detail">
      <div className="private-plan-detail__header">
        <div>
          <span className="private-plan-kicker">Selected Product</span>
          <h3>{product.name}</h3>
        </div>
        <span className="private-plan-premium">{product.startingPremium}</span>
      </div>

      <div className="private-plan-chip-row">
        {product.deductibleTiers.map((tier) => (
          <span key={tier} className="private-plan-chip">
            {tier}
          </span>
        ))}
      </div>

      <div className="private-plan-detail-grid">
        <DetailRow label="Plan Type" value={product.planType} />
        <DetailRow label="Network" value={product.network} />
        <DetailRow label="TPA" value={product.tpa} />
        <DetailRow label="PBM" value={product.pbm} />
        <DetailRow label="Stop-Loss" value={product.stopLoss} />
      </div>

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
  const selectedProduct = useMemo(
    () =>
      PRIVATE_PLAN_PRODUCTS.find((product) => product.id === selectedProductId) ||
      PRIVATE_PLAN_PRODUCTS[0],
    [selectedProductId]
  );

  return (
    <section className="private-plan-panel">
      <div className="private-plan-panel__header">
        <div className="private-plan-panel__title-row">
          <span className="private-plan-panel__icon" aria-hidden="true">
            <BookOpen size={16} />
          </span>
          <div>
            <span className="private-plan-kicker">U65 Reference</span>
            <h2>Private Plans</h2>
          </div>
        </div>
        <button
          type="button"
          className="private-plan-open-btn"
          onClick={() => setModalOpen(true)}
        >
          <ExternalLink size={13} />
          Open Full Playbook
        </button>
      </div>

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
        <ProductDetail product={selectedProduct} />
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
