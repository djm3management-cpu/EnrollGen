import { useState } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import sepCategories from "../../data/acaFfmSepCategories.json";

export default function AcaFfmSepFinder({ onProceed }) {
  const [expandedCategoryId, setExpandedCategoryId] = useState(null);

  const toggleCategory = (categoryId) => {
    setExpandedCategoryId((current) =>
      current === categoryId ? null : categoryId
    );
  };

  return (
    <section className="aca-ffm-sep-finder">
      <header className="aca-ffm-sep-finder__header">
        <span className="aca-ffm-sep-finder__kicker">FFM Routing Tool</span>
        <h2>SEP Finder</h2>
        <p>
          Select the life change that best matches the client, then ask the
          questions shown. The Marketplace application makes the final SEP
          determination.
        </p>
      </header>

      <div className="aca-ffm-sep-finder__categories">
        {sepCategories.map((category, index) => {
          const expanded = expandedCategoryId === category.id;
          const panelId = `aca-ffm-sep-${category.id}`;

          return (
            <article
              key={category.id}
              className={`aca-ffm-sep-category${expanded ? " is-expanded" : ""}`}
            >
              <button
                type="button"
                className="aca-ffm-sep-category__trigger"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggleCategory(category.id)}
              >
                <span className="aca-ffm-sep-category__index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="aca-ffm-sep-category__trigger-copy">
                  <strong>{category.title}</strong>
                  <span>{category.summary}</span>
                </span>
                <ChevronDown
                  size={15}
                  className="aca-ffm-sep-category__chevron"
                  aria-hidden="true"
                />
              </button>

              {expanded ? (
                <div id={panelId} className="aca-ffm-sep-category__panel">
                  <div className="aca-ffm-sep-category__question-label">
                    Ask the client
                  </div>
                  <ol className="aca-ffm-sep-category__questions">
                    {category.questions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ol>

                  <dl className="aca-ffm-sep-category__notes">
                    <div>
                      <dt>Window</dt>
                      <dd>{category.windowNote}</dd>
                    </div>
                    <div>
                      <dt>Prior coverage</dt>
                      <dd>{category.priorCoverageNote}</dd>
                    </div>
                  </dl>

                  <button
                    type="button"
                    className="aca-ffm-sep-category__proceed"
                    onClick={() => onProceed?.(category)}
                  >
                    <CheckCircle2 size={14} aria-hidden="true" />
                    <span>{category.cta}</span>
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <footer className="aca-ffm-sep-finder__footer">
        CMS FFM Special Enrollment Periods Job Aid · March 2026
      </footer>
    </section>
  );
}
