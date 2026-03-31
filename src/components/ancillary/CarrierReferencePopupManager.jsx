import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Building2, ChevronDown, Heart } from "lucide-react";
import AncillaryPopup from "./AncillaryPopup";
import {
  CARRIER_REFERENCE_POPUPS_BY_ID,
} from "./carrierReferencePopupData";
import useCarrierReferencePopup from "./useCarrierReferencePopup";

const POPUP_WIDTH = 280;
const POPUP_GAP = 20;
const POPUP_MIN_TOP = 28;
const POPUP_VERTICAL_OFFSET = 22;
const FALLBACK_HEIGHT = 332;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildExpandedSections(sections = []) {
  return Object.fromEntries(sections.map((section) => [section.id, false]));
}

function getPopupIcon(carrierId) {
  if (carrierId === "devoted") {
    return <Heart size={16} strokeWidth={2.2} />;
  }

  return <Building2 size={16} strokeWidth={2.2} />;
}

const CarrierAccordionSection = memo(function CarrierAccordionSection({
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

const CarrierReferencePopupManager = memo(function CarrierReferencePopupManager({
  callStarted,
  transcript,
  anchorRef,
  onVisibilityChange,
  dockOffsetY = 0,
}) {
  const popupRef = useRef(null);
  const [inline, setInline] = useState(false);
  const [dockStyle, setDockStyle] = useState(null);
  const {
    activeCarrierId,
    isVisible,
    collapsed,
    noteInteraction,
    dismissPopup,
    expandPopup,
  } = useCarrierReferencePopup({
    callStarted,
    transcript,
  });

  const activeCarrier = activeCarrierId
    ? CARRIER_REFERENCE_POPUPS_BY_ID[activeCarrierId]
    : null;
  const [expandedSections, setExpandedSections] = useState(() =>
    buildExpandedSections(activeCarrier?.sections)
  );

  useEffect(() => {
    setExpandedSections(buildExpandedSections(activeCarrier?.sections));
  }, [activeCarrierId, activeCarrier]);

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
  }, [anchorRef, dockOffsetY, isVisible]);

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

  if (!isVisible || !activeCarrier) {
    return null;
  }

  const toggleSection = (sectionId) => {
    noteInteraction();
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
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
        popupKey={`carrier-reference-${activeCarrier.id}`}
        icon={getPopupIcon(activeCarrier.id)}
        title={activeCarrier.popupTitle}
        collapsed={collapsed}
        onExpand={expandPopup}
        onDismiss={dismissPopup}
        onInteract={noteInteraction}
        inline={inline}
      >
        <div className="ancillary-popup-accordion-list">
          {activeCarrier.sections.map((section) => (
            <CarrierAccordionSection
              key={section.id}
              title={section.title}
              open={Boolean(expandedSections[section.id])}
              onToggle={() => toggleSection(section.id)}
            >
              <div className="ancillary-popup-note-list ancillary-popup-note-list--compact">
                {section.notes.map((note, index) => (
                  <div
                    key={`${section.id}-${index}`}
                    className="ancillary-popup-note"
                  >
                    {note}
                  </div>
                ))}
              </div>
            </CarrierAccordionSection>
          ))}
        </div>
      </AncillaryPopup>
    </div>
  );
});

export default CarrierReferencePopupManager;
