import { useEffect } from "react";
import { createPortal } from "react-dom";
import SEPResultsPanel, { SEP_FINDER_FULL_DISCLAIMER } from "./SEPResultsPanel";
import "./SEPResultsModal.css";

export default function SEPResultsModal({
  isOpen,
  onClose,
  zip,
  result,
  loading = false,
  error = "",
  onRefresh,
  refreshDisabled = false,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handler = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const displayZip = result?.zip || zip || "-----";

  const modal = (
    <div className="sep-modal-backdrop" onClick={onClose}>
      <div
        className="sep-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sep-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sep-modal-header">
          <h2 id="sep-modal-title" className="sep-modal-title">
            Available SEPs - ZIP {displayZip}
          </h2>
          <button
            type="button"
            className="sep-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="sep-modal-body">
          <SEPResultsPanel
            zip={zip}
            result={result}
            loading={loading}
            error={error}
            onRefresh={onRefresh}
            refreshDisabled={refreshDisabled}
            disclaimer={SEP_FINDER_FULL_DISCLAIMER}
            className="in-modal"
          />
        </div>
        <div className="sep-modal-footer">
          <button
            type="button"
            className="sep-modal-close-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
