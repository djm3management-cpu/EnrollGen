import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ChevronDown, Heart } from "lucide-react";
import AncillaryPopup from "./AncillaryPopup";
import useDevotedReferencePopup from "./useDevotedReferencePopup";

const POPUP_WIDTH = 280;
const POPUP_GAP = 20;
const POPUP_MIN_TOP = 28;
const POPUP_VERTICAL_OFFSET = 22;
const FALLBACK_HEIGHT = 332;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const DevotedAccordionSection = memo(function DevotedAccordionSection({
  title,
  open,
  onToggle,
  children,
}) {
  return (
    <div
      className={`ancillary-popup-accordion${
        open ? " ancillary-popup-accordion--open" : ""
      }`}
    >
      <button
        type="button"
        className="ancillary-popup-accordion-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="ancillary-popup-accordion-title">{title}</span>
        <span className="ancillary-popup-accordion-arrow" aria-hidden="true">
          <ChevronDown size={14} />
        </span>
      </button>

      {open ? (
        <div className="ancillary-popup-accordion-body">{children}</div>
      ) : null}
    </div>
  );
});

const DevotedPopupManager = memo(function DevotedPopupManager({
  callStarted,
  transcript,
  anchorRef,
  onVisibilityChange,
}) {
  const popupRef = useRef(null);
  const [inline, setInline] = useState(false);
  const [dockStyle, setDockStyle] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    app: false,
    food: false,
  });
  const {
    isVisible,
    collapsed,
    noteInteraction,
    dismissPopup,
    expandPopup,
  } = useDevotedReferencePopup({
    callStarted,
    transcript,
  });

  useEffect(() => {
    onVisibilityChange?.(isVisible);
  }, [isVisible, onVisibilityChange]);

  const updateDock = useCallback(() => {
    if (!anchorRef?.current || !isVisible) {
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

    const popupHeight = popupRef.current?.offsetHeight || FALLBACK_HEIGHT;
    const cardRect = activeCard.getBoundingClientRect();
    const rawTop =
      cardRect.top -
      anchorRect.top +
      cardRect.height / 2 -
      popupHeight / 2 +
      POPUP_VERTICAL_OFFSET;
    const maxTop = Math.max(POPUP_MIN_TOP, anchor.offsetHeight - popupHeight);
    const nextTop = clamp(rawTop, POPUP_MIN_TOP, maxTop);

    setInline(false);
    setDockStyle({
      top: `${Math.round(nextTop)}px`,
      left: `${-(POPUP_WIDTH + POPUP_GAP)}px`,
      width: `${POPUP_WIDTH}px`,
    });
  }, [anchorRef, isVisible]);

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
  }, [anchorRef, collapsed, isVisible, updateDock]);

  if (!isVisible) {
    return null;
  }

  const toggleSection = (sectionKey) => {
    noteInteraction();
    setExpandedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  return (
    <div
      className={`ancillary-popup-dock${
        inline ? " ancillary-popup-dock--inline" : ""
      }`}
      style={inline ? undefined : dockStyle || undefined}
    >
      <AncillaryPopup
        ref={popupRef}
        popupKey="devoted-reference"
        icon={<Heart size={16} strokeWidth={2.2} />}
        title="DEVOTED HEALTH QUICK REFERENCE"
        collapsed={collapsed}
        onExpand={expandPopup}
        onDismiss={dismissPopup}
        onInteract={noteInteraction}
        inline={inline}
      >
        <div className="ancillary-popup-accordion-list">
          <DevotedAccordionSection
            title="📱 MyDevoted App & Portal"
            open={expandedSections.app}
            onToggle={() => toggleSection("app")}
          >
            <div className="ancillary-popup-note-list ancillary-popup-note-list--compact">
              <div className="ancillary-popup-note">
                Members manage their plan at <strong>my.devoted.com</strong> or
                via the <strong>MyDevoted</strong> app (App Store / Google Play).
              </div>
              <div className="ancillary-popup-note">
                Features: view benefits, check allowances, find providers,
                digital ID cards, track claims and spending.
              </div>
              <div className="ancillary-popup-note">
                <strong>
                  Remind members to download the app during enrollment for
                  immediate access to their plan details.
                </strong>
              </div>
            </div>
          </DevotedAccordionSection>

          <DevotedAccordionSection
            title="🛒 Food Card | Monthly Allowance (SSBCI)"
            open={expandedSections.food}
            onToggle={() => toggleSection("food")}
          >
            <div className="ancillary-popup-note-list ancillary-popup-note-list--compact">
              <div className="ancillary-popup-note">
                Monthly funds load onto a <strong>prepaid Visa card</strong> on
                the <strong>1st of each month</strong>.
              </div>
              <div className="ancillary-popup-note">
                Covers: healthy food, utilities, rent, and mortgage.
              </div>
              <div className="ancillary-popup-note">
                Available on <strong>50%+ of Devoted plans</strong> in 2026; the
                amount varies by plan.
              </div>
              <div className="ancillary-popup-note">
                Eligibility follows CMS SSBCI guidelines; members check status
                in the app or on the website.
              </div>
              <div className="ancillary-popup-note">
                <strong>
                  Funds do not roll over
                </strong>{" "}
                (exception: Month 1 to Month 2 only).
              </div>
              <div className="ancillary-popup-note">
                Members keep the same prepaid card year to year.
              </div>
            </div>
          </DevotedAccordionSection>
        </div>
      </AncillaryPopup>
    </div>
  );
});

export default DevotedPopupManager;
