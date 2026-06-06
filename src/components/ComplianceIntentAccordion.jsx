import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ALL_INTENTS, INTENT_CATEGORIES } from "../compliance/intents";

const RUNTIME_INTENTS = [
  ["ENGINE_001_DUAL_AUDIO_CHANNEL_PRESENT", "Dual audio channels captured"],
  ["ENGINE_002_SPEAKER_DIARIZATION_CONFIDENCE", "Speaker diarization confidence checked"],
  ["ENGINE_003_TIMESTAMP_COVERAGE_COMPLETE", "Transcript timestamps cover the full call"],
  ["ENGINE_004_TRANSCRIPT_REDACTION_COMPLETE", "PHI and PII redaction completed"],
  ["ENGINE_005_RAG_CONTEXT_RETRIEVED", "pgvector RAG context retrieved"],
  ["ENGINE_006_SCORECARD_TEMPLATE_APPLIED", "MA scorecard template applied"],
  ["ENGINE_007_SEQUENCE_GRAPH_VALIDATED", "Required intent sequence graph validated"],
  ["ENGINE_008_AUTO_FAIL_RULES_EVALUATED", "Auto-fail rules evaluated"],
  ["ENGINE_009_CRM_PAYLOAD_COMPLETE", "CRM payload completeness checked"],
].map(([intent_code, intent_name]) => ({
  intent_code,
  intent_name,
  category: "ENGINE_RUNTIME_CHECKS",
  failure_severity: "info",
  auto_fail: false,
}));

const ENGINE_INTENTS = [...ALL_INTENTS, ...RUNTIME_INTENTS].slice(0, 152);
const ENGINE_INTENT_CODES = new Set(ENGINE_INTENTS.map((intent) => intent.intent_code));

function formatCategoryName(category) {
  return String(category || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildIntentGroups() {
  let rowNumber = 0;
  return [
    ...Object.entries(INTENT_CATEGORIES),
    ["ENGINE_RUNTIME_CHECKS", RUNTIME_INTENTS],
  ]
    .map(([category, intents]) => [
      category,
      intents
        .filter((intent) => ENGINE_INTENT_CODES.has(intent.intent_code))
        .map((intent) => ({ ...intent, rowNumber: ++rowNumber })),
    ])
    .filter(([, intents]) => intents.length > 0)
    .map(([category, intents]) => ({ category, intents }));
}

const ENGINE_INTENT_GROUPS = buildIntentGroups();

export default function ComplianceIntentAccordion() {
  const [open, setOpen] = useState(false);

  return (
    <section
      className={`operations-tab compliance-intent-accordion${open ? " is-open" : ""}`}
      aria-label="Compliance 152 flags"
    >
      <button
        type="button"
        className="ops-intent-accordion-trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Compliance 152 Flags</span>
        <span className="ops-command-market">{ENGINE_INTENTS.length}/152 FLAGS</span>
        <span className="ops-intent-chevron" aria-hidden="true">
          <ChevronDown size={14} strokeWidth={2.2} />
        </span>
      </button>

      {open ? (
        <div className="ops-intent-accordion-body">
          <div className="ops-command-line">
            <span>MA COMPLIANCE TAXONOMY</span>
            <span className="ops-command-market">{ENGINE_INTENTS.length}/152 FLAGS</span>
          </div>
          <div className="ops-terminal-tabs">
            <span className="ops-tab-amber">CATEGORY</span>
            <span className="ops-tab-red">AUTO FAIL</span>
            <span className="ops-tab-red">SEVERITY</span>
            <span className="ops-tab-blue">SEQUENCE</span>
            <span className="ops-tab-fill">Intent classifier inventory</span>
          </div>
          {ENGINE_INTENT_GROUPS.map(({ category, intents }) => (
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
