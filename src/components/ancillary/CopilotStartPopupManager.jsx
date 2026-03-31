import { memo, useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import AncillaryPopup from "./AncillaryPopup";

const DESKTOP_BREAKPOINT = 1400;
const POPUP_WIDTH = 280;
const RIGHT_RAIL_WIDTH = 250;
const RIGHT_RAIL_MARGIN = 18;
const POPUP_RIGHT_GAP = 18;
const POPUP_TOP = 14;

function shouldInline() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.innerWidth <= DESKTOP_BREAKPOINT;
}

const CopilotStartPopupManager = memo(function CopilotStartPopupManager({
  callStarted,
}) {
  const [visible, setVisible] = useState(() => !callStarted);
  const [inline, setInline] = useState(shouldInline);

  useEffect(() => {
    if (callStarted) {
      setVisible(false);
    }
  }, [callStarted]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleResize = () => {
      setInline(shouldInline());
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!visible || callStarted) {
    return null;
  }

  return (
    <div
      className={
        inline
          ? "ancillary-popup-dock ancillary-popup-dock--inline"
          : "copilot-setup-popup-dock"
      }
      style={
        inline
          ? undefined
          : {
              top: `${POPUP_TOP}px`,
              right: `${
                RIGHT_RAIL_WIDTH + RIGHT_RAIL_MARGIN + POPUP_RIGHT_GAP
              }px`,
              width: `${POPUP_WIDTH}px`,
            }
      }
    >
      <AncillaryPopup
        popupKey="copilot-start-setup"
        icon={<MessageSquare size={16} strokeWidth={2.2} />}
        title="COPILOT START CHECK"
        collapsed={false}
        onExpand={() => {}}
        onDismiss={() => setVisible(false)}
        onInteract={() => {}}
        inline={inline}
      >
        <p className="ancillary-popup-copy">
          Before you begin the call, set Copilot first.
        </p>
        <div className="copilot-setup-popup-note-list ancillary-popup-note-list ancillary-popup-note-list--compact">
          <div className="ancillary-popup-note copilot-setup-popup-note">
            Press <strong>Start</strong> in Copilot.
          </div>
          <div className="ancillary-popup-note copilot-setup-popup-note">
            Select <strong>NGHS GOHIGHLEVEL</strong>.
          </div>
          <div className="ancillary-popup-note copilot-setup-popup-note">
            Then click the red <strong>START</strong> button.
          </div>
        </div>
      </AncillaryPopup>
    </div>
  );
});

export default CopilotStartPopupManager;
