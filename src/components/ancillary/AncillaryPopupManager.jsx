import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const POPUP_WIDTH = 280;
const POPUP_GAP = 20;
const POPUP_MIN_TOP = 28;
const POPUP_VERTICAL_OFFSET = 22;
const FALLBACK_HEIGHTS = {
  A: 322,
  B: 292,
  C: 322,
  "D-recap": 308,
  "D-lastchance": 258,
  E: 336,
};

const POPUP_ICON_MAP = {
  target: <Target size={16} strokeWidth={2.2} />,
  banknote: <Banknote size={16} strokeWidth={2.2} />,
  send: <Send size={16} strokeWidth={2.2} />,
  "clipboard-check": <ClipboardCheck size={16} strokeWidth={2.2} />,
  "circle-alert": <CircleAlert size={16} strokeWidth={2.2} />,
  "phone-call": <PhoneCall size={16} strokeWidth={2.2} />,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

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
  anchorRef,
  containerRef,
  followUpContext = null,
  dockOffsetY = 0,
  onVisibilityChange,
}) {
  const { state } = useScript();
  const popupRef = useRef(null);
  const [inline, setInline] = useState(false);
  const [dockStyle, setDockStyle] = useState(null);
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

  useEffect(() => {
    onVisibilityChange?.(Boolean(isVisible));
  }, [isVisible, onVisibilityChange]);

  const recapItems = useMemo(
    () => buildRecapItems(state, ancillaryState),
    [state, ancillaryState]
  );
  const supplementalTotal = useMemo(
    () => calculateSupplementalTotal(ancillaryState.ancillaryEnrolled),
    [ancillaryState.ancillaryEnrolled]
  );

  const updateDock = useCallback(() => {
    if (!anchorRef?.current || !popupKey) {
      return;
    }

    const anchor = anchorRef.current;
    const anchorRect = anchor.getBoundingClientRect();
    const spaceToViewportLeft = anchorRect.left - 24;
    const shouldInline =
      window.innerWidth <= 1320 ||
      spaceToViewportLeft < POPUP_WIDTH + POPUP_GAP;

    if (shouldInline) {
      setInline(true);
      setDockStyle(null);
      return;
    }

    const activeCard = anchor.querySelector(".active-card");
    if (!activeCard) {
      setInline(true);
      setDockStyle(null);
      return;
    }

    const popupHeight =
      popupRef.current?.offsetHeight || FALLBACK_HEIGHTS[popupKey] || 280;
    const cardRect = activeCard.getBoundingClientRect();
    const rawTop =
      cardRect.top -
      anchorRect.top +
      cardRect.height / 2 -
      popupHeight / 2 +
      POPUP_VERTICAL_OFFSET +
      dockOffsetY;
    const maxTop = Math.max(POPUP_MIN_TOP, anchor.offsetHeight - popupHeight);
    const nextTop = clamp(rawTop, POPUP_MIN_TOP, maxTop);

    setInline(false);
    setDockStyle({
      top: `${Math.round(nextTop)}px`,
      left: `${-(POPUP_WIDTH + POPUP_GAP)}px`,
      width: `${POPUP_WIDTH}px`,
    });
  }, [anchorRef, dockOffsetY, popupKey]);

  useEffect(() => {
    if (!isVisible || typeof window === "undefined") {
      return undefined;
    }

    let rafId = 0;
    const schedule = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(updateDock);
    };

    schedule();

    const resizeObserver = new ResizeObserver(schedule);
    const anchor = anchorRef?.current;
    const popup = popupRef.current;
    const activeCard = anchor?.querySelector(".active-card");

    if (anchor) resizeObserver.observe(anchor);
    if (popup) resizeObserver.observe(popup);
    if (activeCard) resizeObserver.observe(activeCard);

    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
    };
  }, [
    isVisible,
    anchorRef,
    updateDock,
    popupKey,
    activeCollapsed,
  ]);

  if (!isVisible || !popupCopy) {
    return null;
  }

  const followUpName = followUpContext?.clientName || "Client";
  const followUpPlan =
    followUpContext?.planName || state.notes?.planName || "Plan pending";
  const followUpEnrollmentDate =
    followUpContext?.enrollmentDate || state.sectionTimestamps?.[7]?.end || null;

  return (
    <div
      className={`ancillary-popup-dock${
        inline ? " ancillary-popup-dock--inline" : ""
      }`}
      style={inline ? undefined : dockStyle || undefined}
    >
      <AncillaryPopup
        ref={popupRef}
        popupKey={popupKey}
        icon={popupIcon}
        title={popupCopy.title}
        collapsed={activeCollapsed}
        onExpand={expandPopup}
        onDismiss={dismissPopup}
        onInteract={noteInteraction}
        inline={inline}
      >
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
      </AncillaryPopup>
    </div>
  );
});

export default AncillaryPopupManager;
