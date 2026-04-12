import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Building2, ChevronDown, Heart } from "lucide-react";
import AncillaryPopup from "./AncillaryPopup";
import {
  CARRIER_REFERENCE_POPUPS_BY_ID,
} from "./carrierReferencePopupData";
import useCarrierReferencePopup from "./useCarrierReferencePopup";
import { useLeftRailManager } from "../leftRail/LeftRailManager";

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
  const { showLeftRail, dismissLeftRail } = useLeftRailManager();
  const { activeCarrierIds, dismissCarrier } = useCarrierReferencePopup({
    callStarted,
    transcript,
    mergedTranscript,
  });
  const [expandedSectionsByCarrier, setExpandedSectionsByCarrier] = useState({});
  const previousCarrierIdsRef = useRef([]);

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
      Object.fromEntries(
        activeCarrierIds
          .map((carrierId) => {
            const carrier = CARRIER_REFERENCE_POPUPS_BY_ID[carrierId];
            if (!carrier) {
              return null;
            }

            return [
              carrierId,
              (
                <AncillaryPopup
                  popupKey={`carrier-reference-${carrier.id}`}
                  icon={getPopupIcon(carrier.id)}
                  title={carrier.popupTitle}
                  collapsed={false}
                  onExpand={() => {}}
                  onDismiss={() => {
                    dismissCarrier(carrier.id);
                    dismissLeftRail(`carrier-${carrier.id}`);
                  }}
                  onInteract={() => {}}
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
              ),
            ];
          })
          .filter(Boolean)
      ),
    [activeCarrierIds, dismissCarrier, dismissLeftRail, expandedSectionsByCarrier]
  );

  useEffect(() => {
    const nextCarrierIds = new Set(activeCarrierIds);

    previousCarrierIdsRef.current.forEach((carrierId) => {
      if (!nextCarrierIds.has(carrierId)) {
        dismissLeftRail(`carrier-${carrierId}`);
      }
    });

    activeCarrierIds.forEach((carrierId) => {
      const carrier = CARRIER_REFERENCE_POPUPS_BY_ID[carrierId];
      if (!carrier) {
        return;
      }

      showLeftRail({
        id: `carrier-${carrier.id}`,
        priority: 2,
        title: carrier.popupTitle,
        shortLabel: carrier.handleLabel || carrier.label || carrier.id,
        icon: getPopupIcon(carrier.id),
        color: "#58a6ff",
        component: carrierPanels[carrier.id],
      });
    });

    previousCarrierIdsRef.current = activeCarrierIds;
  }, [activeCarrierIds, carrierPanels, dismissLeftRail, showLeftRail]);

  useEffect(
    () => () => {
      previousCarrierIdsRef.current.forEach((carrierId) => {
        dismissLeftRail(`carrier-${carrierId}`);
      });
    },
    [dismissLeftRail]
  );

  return null;
});

export default CarrierReferencePopupManager;
