import { BookOpen } from "lucide-react";
import {
  PRIVATE_PLAN_DENTAL,
  PRIVATE_PLAN_DENTAL_FACTS,
} from "../data/privatePlans";

function DentalOptionsSection() {
  return (
    <section className="private-plan-section">
      <div className="private-plan-section-head">
        <div>
          <span className="private-plan-kicker">Ancillary</span>
          <h3>Dental Add-On</h3>
        </div>
      </div>
      <div className="private-plan-dental-grid">
        {PRIVATE_PLAN_DENTAL.map((option) => (
          <article key={option.name} className="private-plan-dental-card">
            <div className="private-plan-dental-card__top">
              <h4>{option.name}</h4>
              <strong>{option.price}</strong>
            </div>
            <span>{option.network}</span>
            <ul>
              {option.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <div className="private-plan-fact-row">
        {PRIVATE_PLAN_DENTAL_FACTS.map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
      </div>
    </section>
  );
}

export { DentalOptionsSection };

export default function DentalReferencePanel() {
  return (
    <section className="private-plan-panel dental-reference-panel">
      <div className="private-plan-panel__header">
        <div className="private-plan-panel__title-row">
          <span className="private-plan-panel__icon" aria-hidden="true">
            <BookOpen size={16} />
          </span>
          <div>
            <span className="private-plan-kicker">DVH Reference</span>
            <h2>Dental Plans</h2>
          </div>
        </div>
      </div>

      <DentalOptionsSection />
    </section>
  );
}
