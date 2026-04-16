import {
  memo,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Building2, ChevronDown, Heart } from "lucide-react";
import AncillaryPopup from "./AncillaryPopup";
import {
  CARRIER_REFERENCE_POPUPS_BY_ID,
} from "./carrierReferencePopupData";
import useCarrierReferencePopup from "./useCarrierReferencePopup";
import { useLeftRailManager } from "../leftRail/LeftRailManager";

const LEGACY_CARRIER_RAIL_IDS = Object.keys(CARRIER_REFERENCE_POPUPS_BY_ID).map(
  (carrierId) => `carrier-${carrierId}`
);

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
  mergedTranscript = [],
}) {
  const { dismissLeftRail } = useLeftRailManager();
  const { activeCarrierIds, dismissCarrier } = useCarrierReferencePopup({
    callStarted,
    transcript,
    mergedTranscript,
  });
  const [expandedSectionsByCarrier, setExpandedSectionsByCarrier] = useState({});

  useEffect(() => {
    setExpandedSectionsByCarrier((prev) => {
      const next = { ...prev };
      let changed = false;

      activeCarrierIds.forEach((carrierId) => {
        if (!next[carrierId]) {
          const carrier = CARRIER_REFERENCE_POPUPS_BY_ID[carrierId];
          next[carrierId] = buildExpandedSections(carrier?.sections);
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [activeCarrierIds]);

  useEffect(() => {
    LEGACY_CARRIER_RAIL_IDS.forEach((id) => dismissLeftRail(id));

    return () => {
      LEGACY_CARRIER_RAIL_IDS.forEach((id) => dismissLeftRail(id));
    };
  }, [dismissLeftRail]);

  const toggleSection = (carrierId, sectionId) => {
    setExpandedSectionsByCarrier((prev) => ({
      ...prev,
      [carrierId]: {
        ...prev[carrierId],
        [sectionId]: !prev[carrierId]?.[sectionId],
      },
    }));
  };

  const carrierPanels = useMemo(
    () =>
      activeCarrierIds
        .map((carrierId) => {
          const carrier = CARRIER_REFERENCE_POPUPS_BY_ID[carrierId];
          if (!carrier) {
            return null;
          }

          return (
            <AncillaryPopup
              key={carrier.id}
              popupKey={`carrier-reference-${carrier.id}`}
              icon={getPopupIcon(carrier.id)}
              title={carrier.popupTitle}
              collapsed={false}
              onExpand={() => {}}
              onDismiss={() => {
                dismissCarrier(carrier.id);
              }}
              onInteract={() => {}}
              inline
            >
              <div className="ancillary-popup-accordion-list">
                {carrier.sections.map((section) => (
                  <CarrierAccordionSection
                    key={section.id}
                    title={section.title}
                    open={Boolean(expandedSectionsByCarrier[carrier.id]?.[section.id])}
                    onToggle={() => toggleSection(carrier.id, section.id)}
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
          );
        })
        .filter(Boolean),
    [activeCarrierIds, dismissCarrier, expandedSectionsByCarrier]
  );

  if (!carrierPanels.length) {
    return null;
  }

  return <>{carrierPanels}</>;
});

export default CarrierReferencePopupManager;
