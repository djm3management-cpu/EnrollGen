import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ACTIVE_RULE_CATALOG, ruleMatchesProduct } from "../compliance/rules/catalog.js";

function formatCategoryName(category) {
  return String(category || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function ComplianceIntentAccordion({ product = 'MA' }) {
  const [open, setOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(product);
  const rules = ACTIVE_RULE_CATALOG.filter(rule => ruleMatchesProduct(rule, selectedProduct));
  const groups = Object.entries(rules.reduce((groups, rule, index) => {
    (groups[rule.category] ??= []).push({ ...rule, rowNumber: index + 1 });
    return groups;
  }, {})).map(([category, intents]) => ({ category, intents }));

  return (
    <section
      className={`operations-tab compliance-intent-accordion${open ? " is-open" : ""}`}
      aria-label={`Compliance ${rules.length} flags`}
    >
      <button data-key-role="secondary"
        type="button"
        className="ops-intent-accordion-trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Compliance {rules.length} Flags</span>
        <span className="ops-command-market">{rules.length} FLAGS</span>
        <span className="ops-intent-chevron" aria-hidden="true">
          <ChevronDown size={14} strokeWidth={2.2} />
        </span>
      </button>

      {open ? (
        <div className="ops-intent-accordion-body">
          <div className="ops-command-line">
            <span>{selectedProduct} COMPLIANCE TAXONOMY</span>
            <span className="ops-command-market">{rules.length} FLAGS</span>
          </div>
          <label>Product <select aria-label="Compliance product" value={selectedProduct} onChange={event=>setSelectedProduct(event.target.value)}><option value="MA">Medicare Advantage</option><option value="ANNUITY">Annuity</option></select></label>
          {groups.map(({ category, intents }) => (
            <div key={category} className="ops-calls-panel">
              <div className="ops-section-head">
                <span>{formatCategoryName(category)}</span>
                <span className="ops-section-meta">{intents.length} FLAGS</span>
              </div>
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th className="row-n">#</th>
                      <th>Flag Code</th>
                      <th>Name</th>
                      <th>Severity</th>
                      <th>Required</th>
                      <th>Auto Fail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intents.map((intent) => (
                      <tr key={intent.intent_code}>
                        <td className="row-n">{intent.rowNumber}</td>
                        <td>{intent.intent_code}</td>
                        <td>{intent.intent_name}</td>
                        <td>{String(intent.failure_severity || "info").toUpperCase()}</td>
                        <td className={intent.is_required ? "ops-out-enrolled" : "ops-out-pending"}>
                          {intent.is_required ? "YES" : "NO"}
                        </td>
                        <td className={intent.auto_fail ? "ops-out-incomplete" : "ops-out-pending"}>
                          {intent.auto_fail ? "YES" : "NO"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
