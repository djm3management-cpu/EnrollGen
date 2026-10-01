import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Pill, X } from "lucide-react";

const CMS_URL = "https://www.cms.gov/medicare/coverage/prescription-drug-coverage/medicare-glp-1-bridge";
const MEDICARE_URL = "https://www.medicare.gov/coverage/weight-loss-drugs";

export default function GLP1BridgeGuide() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  return (
    <div className="glp1-bridge-guide">
      <button
        type="button"
        className="glp1-bridge-guide__trigger"
        aria-expanded={isOpen}
        aria-controls="glp1-bridge-guide-content"
        onClick={() => setIsOpen((open) => !open)}
      >
        <Pill size={13} aria-hidden="true" />
        <span>GLP-1 BRIDGE</span>
        <ChevronDown size={12} className={isOpen ? "is-open" : ""} aria-hidden="true" />
      </button>

      {isOpen ? createPortal(
        <aside className="glp1-bridge-guide__panel" id="glp1-bridge-guide-content" role="dialog" aria-label="GLP-1 Bridge guidance">
          <div className="glp1-bridge-guide__panel-header">
            <strong>GLP-1 BRIDGE</strong>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Close GLP-1 Bridge guidance" title="Close">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="glp1-bridge-guide__content">
          <p><strong>Medicare GLP-1 Bridge</strong> is a short-term CMS demonstration from July 1, 2026 through December 31, 2027 for eligible people with Part D drug coverage.</p>

          <h4>Key talking points</h4>
          <ul>
            <li>Bridge access is a separate CMS program, outside the member’s MAPD, SNP, or PDP plan benefits.</li>
            <li>Direct members to their health care provider to discuss clinical eligibility and getting started.</li>
            <li>Do not describe drugs supplied through the Bridge as a health plan benefit.</li>
          </ul>

          <h4>Impact on plans</h4>
          <ul>
            <li>Bridge drugs are outside Medicare Part D coverage and payment. CMS uses a central processor for prior authorization, claims, and pharmacy payment.</li>
            <li>Part D plans do not pay for drugs furnished through the Bridge. Plan coverage for other GLP-1 uses is a separate question.</li>
          </ul>

          <h4>How members access it</h4>
          <ol>
            <li>Consult a health care provider.</li>
            <li>The provider sends a prescription to the pharmacy and completes prior authorization when requested.</li>
            <li>If approved, the member obtains the medication through a participating pharmacy.</li>
          </ol>

          <h4>Eligibility overview</h4>
          <p>Members need Medicare Part D drug coverage and must meet CMS clinical criteria. Their provider confirms eligibility; prior authorization may be required. Existing Part D coverage for a GLP-1 can affect Bridge eligibility.</p>

          <h4>Initial medication list</h4>
          <ul>
            <li>Wegovy® — injection or tablet</li>
            <li>Zepbound® — KwikPen® only</li>
            <li>Foundayo® — tablet</li>
          </ul>

          <h4>Member cost</h4>
          <p>$50 copay for a one-month supply. The Part D deductible does not apply, and the copay does not count toward Part D out-of-pocket costs.</p>

          <div className="glp1-bridge-guide__links">
            <a href={CMS_URL} target="_blank" rel="noopener noreferrer">CMS program details</a>
            <a href={MEDICARE_URL} target="_blank" rel="noopener noreferrer">Medicare eligibility and drugs</a>
          </div>
          </div>
        </aside>,
        document.body
      ) : null}
    </div>
  );
}
