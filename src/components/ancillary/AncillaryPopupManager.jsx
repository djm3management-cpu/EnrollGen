import { memo, useEffect, useMemo } from "react";
import {
  ArrowUpRight,
  Banknote,
  CircleAlert,
  ClipboardCheck,
  PhoneCall,
  Send,
  Target,
} from "lucide-react";
import { useScript } from "../../context/ScriptContext";
import AncillaryPopup from "./AncillaryPopup";
import useAncillaryPrompts from "./useAncillaryPrompts";
import {
  ANCILLARY_POPUP_COPY,
  ANCILLARY_TRIGGER_OPTIONS,
  buildRecapItems,
  calculateSupplementalTotal,
} from "./ancillaryPopupData";
import { useLeftRailManager } from "../leftRail/LeftRailManager";

const POPUP_ICON_MAP = {
  target: <Target size={16} strokeWidth={2.2} />,
  banknote: <Banknote size={16} strokeWidth={2.2} />,
  send: <Send size={16} strokeWidth={2.2} />,
  "clipboard-check": <ClipboardCheck size={16} strokeWidth={2.2} />,
  "circle-alert": <CircleAlert size={16} strokeWidth={2.2} />,
  "phone-call": <PhoneCall size={16} strokeWidth={2.2} />,
};

const LEGACY_ANCILLARY_RAIL_IDS = [
  "ancillary-A",
  "ancillary-B",
  "ancillary-C",
  "ancillary-D-recap",
  "ancillary-D-lastchance",
  "ancillary-E",
];

function formatDisplayDate(value) {
  if (!value) {
    return "Date pending";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
}

function formatPremium(value) {
  if (value === null || value === undefined || value === "") {
    return "Premium pending";
  }

  const parsed = Number.parseFloat(String(value).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return `$${parsed.toFixed(2)}/month`;
}

function formatTotal(value) {
  if (!Number.isFinite(value)) {
    return "Pending";
  }

  return `$${value.toFixed(2)}/month`;
}

function fillFollowUpQuote(template, followUpContext, scriptState) {
  const clientName = followUpContext?.clientName || "Client";
  const agentName =
    followUpContext?.agentName || scriptState?.agentName || "Agent";

  return template
    .replace("[Name]", clientName)
    .replace("[Agent Name]", agentName);
}

const AncillaryPopupManager = memo(function AncillaryPopupManager({
  activeSection,
  callStarted,
  followUpContext = null,
}) {
  const { state } = useScript();
  const { dismissLeftRail } = useLeftRailManager();
  const {
    ancillaryState,
    popupKey,
    activeDismissed,
    activeCollapsed,
    portalProducts,
    seedMentions,
    noteInteraction,
    dismissPopup,
    expandPopup,
    toggleTrigger,
    openPortalProduct,
    markFollowUpComplete,
  } = useAncillaryPrompts({
    currentCard: activeSection,
    scriptState: state,
    followUpContext,
  });

  const isVisible = callStarted && popupKey && !activeDismissed;
  const popupCopy = popupKey ? ANCILLARY_POPUP_COPY[popupKey] : null;
  const popupIcon = popupCopy ? POPUP_ICON_MAP[popupCopy.icon] ?? null : null;

  const recapItems = useMemo(
    () => buildRecapItems(state, ancillaryState),
    [state, ancillaryState]
  );
  const supplementalTotal = useMemo(
    () => calculateSupplementalTotal(ancillaryState.ancillaryEnrolled),
    [ancillaryState.ancillaryEnrolled]
  );

  const followUpName = followUpContext?.clientName || "Client";
  const followUpPlan =
    followUpContext?.planName || state.notes?.planName || "Plan pending";
  const followUpEnrollmentDate =
    followUpContext?.enrollmentDate || state.sectionTimestamps?.[7]?.end || null;

  useEffect(() => {
    LEGACY_ANCILLARY_RAIL_IDS.forEach((id) => dismissLeftRail(id));

    return () => {
      LEGACY_ANCILLARY_RAIL_IDS.forEach((id) => dismissLeftRail(id));
    };
  }, [dismissLeftRail]);

  const popupBody = useMemo(() => {
    if (!popupCopy || !popupKey) {
      return null;
    }

    return (
      <>
        {popupKey === "A" ? (
          <>
            <p className="ancillary-popup-copy">{popupCopy.intro}</p>
            <div className="ancillary-popup-chip-grid">
              {ANCILLARY_TRIGGER_OPTIONS.map((option) => {
                const active = ancillaryState.triggersDetected.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`ancillary-popup-chip${
                      active ? " is-active" : ""
                    }`}
                    onClick={() => {
                      noteInteraction();
                      toggleTrigger(option.id);
                    }}
                  >
                    <span className="ancillary-popup-chip-title">
                      {option.prompt}
                    </span>
                    <span className="ancillary-popup-chip-subtitle">
                      {option.product}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="ancillary-popup-footnote">{popupCopy.footer}</p>
          </>
        ) : null}

        {popupKey === "B" ? (
          <>
            <p className="ancillary-popup-copy">{popupCopy.intro}</p>
            <div className="ancillary-popup-quote">{popupCopy.quote}</div>
            {seedMentions.length > 0 ? (
              <div className="ancillary-popup-extra">
                {seedMentions.map((line) => (
                  <div key={line} className="ancillary-popup-extra-quote">
                    {line}
                  </div>
                ))}
              </div>
            ) : null}
            <p className="ancillary-popup-footnote">{popupCopy.footer}</p>
          </>
        ) : null}

        {popupKey === "C" ? (
          <>
            <p className="ancillary-popup-copy">{popupCopy.intro}</p>
            <div className="ancillary-popup-quote">{popupCopy.quote}</div>
            <div className="ancillary-popup-note-list">
              {popupCopy.notes.map((note) => (
                <div key={note} className="ancillary-popup-note">
                  {note}
                </div>
              ))}
            </div>

            <div className="ancillary-popup-link-list">
              {portalProducts.map((product, index) => (
                <button
                  key={product.id}
                  type="button"
                  className="ancillary-popup-link"
                  onClick={() => openPortalProduct(product)}
                >
                  <span className="ancillary-popup-link-num">{index + 1}</span>
                  <span className="ancillary-popup-link-copy">
                    <span className="ancillary-popup-link-title">
                      {product.title}
                    </span>
                    <span className="ancillary-popup-link-detail">
                      {product.detail}
                    </span>
                  </span>
                  <ArrowUpRight size={13} />
                </button>
              ))}
            </div>
          </>
        ) : null}

        {popupKey === "D-recap" ? (
          <>
            <p className="ancillary-popup-copy">{popupCopy.intro}</p>
            <div className="ancillary-popup-recap-list">
              {recapItems.map((item, index) => (
                <div key={item.id} className="ancillary-popup-recap-item">
                  <div className="ancillary-popup-recap-index">{index + 1}</div>
                  <div className="ancillary-popup-recap-copy">
                    <div className="ancillary-popup-recap-title">
                      {item.title}
                    </div>
                    <div className="ancillary-popup-recap-meta">
                      {item.carrier}
                    </div>
                    <div className="ancillary-popup-recap-meta">
                      {formatPremium(item.premium)}
                    </div>
                    <div className="ancillary-popup-recap-meta">
                      Effective {formatDisplayDate(item.effectiveDate)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="ancillary-popup-total">
              Total supplemental cost: {formatTotal(supplementalTotal)}
            </div>
            <p className="ancillary-popup-footnote">{popupCopy.footer}</p>
          </>
        ) : null}

        {popupKey === "D-lastchance" ? (
          <>
            <p className="ancillary-popup-copy">{popupCopy.intro}</p>
            <div className="ancillary-popup-quote">{popupCopy.quote}</div>
            <p className="ancillary-popup-footnote">{popupCopy.footer}</p>
          </>
        ) : null}

        {popupKey === "E" ? (
          <>
            <div className="ancillary-popup-followup-summary">
              {followUpName} enrolled in {followUpPlan} on{" "}
              {formatDisplayDate(followUpEnrollmentDate)} - no ancillary.
            </div>
            <p className="ancillary-popup-copy">{popupCopy.intro}</p>
            <div className="ancillary-popup-quote">
              {fillFollowUpQuote(popupCopy.quote, followUpContext, state)}
            </div>
            <div className="ancillary-popup-note-list">
              {popupCopy.notes.map((note) => (
                <div key={note} className="ancillary-popup-note">
                  {note}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="ancillary-popup-complete-btn"
              onClick={() => {
                noteInteraction();
                markFollowUpComplete();
              }}
            >
              Mark Complete
            </button>
          </>
        ) : null}
      </>
    );
  }, [
    ancillaryState.triggersDetected,
    followUpContext,
    followUpEnrollmentDate,
    followUpName,
    followUpPlan,
    markFollowUpComplete,
    noteInteraction,
    openPortalProduct,
    popupCopy,
    popupKey,
    portalProducts,
    recapItems,
    seedMentions,
    state,
    supplementalTotal,
    toggleTrigger,
  ]);

  if (!isVisible || !popupKey || !popupCopy || !popupBody) {
    return null;
  }

  return (
    <AncillaryPopup
      popupKey={popupKey}
      icon={popupIcon}
      title={popupCopy.title}
      collapsedLabel={popupCopy.collapsedLabel}
      collapsed={activeCollapsed}
      onExpand={expandPopup}
      onDismiss={dismissPopup}
      onInteract={noteInteraction}
      inline
    >
      {popupBody}
    </AncillaryPopup>
  );
});

export default AncillaryPopupManager;
