import { memo, useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import AncillaryPopup from "./AncillaryPopup";

const DESKTOP_BREAKPOINT = 1400;
const POPUP_WIDTH = 196;
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
          ? "copilot-setup-popup-shell ancillary-popup-dock ancillary-popup-dock--inline"
          : "copilot-setup-popup-shell copilot-setup-popup-dock"
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
        icon={<MessageSquare size={14} strokeWidth={2.25} />}
        title="START CHECK"
        collapsed={false}
        onExpand={() => {}}
        onDismiss={() => setVisible(false)}
        onInteract={() => {}}
        inline={inline}
      >
        <p className="ancillary-popup-copy">
          Set Copilot before the call.
        </p>
        <div className="copilot-setup-popup-note-list ancillary-popup-note-list ancillary-popup-note-list--compact">
          <div className="ancillary-popup-note copilot-setup-popup-note">
            Open <strong>Copilot Start</strong>.
          </div>
          <div className="ancillary-popup-note copilot-setup-popup-note">
            Pick <strong>NGHS GOHIGHLEVEL</strong>.
          </div>
          <div className="ancillary-popup-note copilot-setup-popup-note">
            Hit the orange <strong>START</strong>.
          </div>
        </div>
      </AncillaryPopup>
    </div>
  );
});

export default CopilotStartPopupManager;
