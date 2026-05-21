import { ChevronRight } from "lucide-react";

export default function PrivatePlanCard({ product, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`private-plan-card${selected ? " is-selected" : ""}`}
      onClick={() => onSelect?.(product.id)}
      aria-pressed={selected}
    >
      <span className="private-plan-card__top">
        <span className="private-plan-card__name">{product.name}</span>
        <ChevronRight size={14} aria-hidden="true" />
      </span>
      <span className="private-plan-card__type">{product.planType}</span>
      <span className="private-plan-card__meta">{product.network}</span>
      <span className="private-plan-card__premium">{product.startingPremium}</span>
    </button>
  );
}
