/**
 * U65Script.jsx, U65 Off-Exchange entry point
 * Wraps U65Flow with U65Provider
 */

import { useEffect, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { U65Provider } from "./U65Context";
import { useU65 } from "./U65Context";
import U65Flow from "./U65Flow";
import U65Copilot from "../../components/U65Copilot";
import DevotedPopupManager from "../../components/ancillary/DevotedPopupManager";
import { useLeftRailManager } from "../../components/leftRail/LeftRailManager";
import PrivatePlanPanel from "../../components/PrivatePlanPanel";
import {
  PRIVATE_PLAN_CONTEXT_EVENT,
  PRIVATE_PLAN_RAIL_ID,
} from "../../data/privatePlans";

function U65ScriptBody() {
  const { state } = useU65();
  const { showLeftRail, openLeftRail, dismissLeftRail } = useLeftRailManager();
  const [transcript, setTranscript] = useState("");
  const [privatePlanFocus, setPrivatePlanFocus] = useState(null);
  const flowShellRef = useRef(null);
  const flowMainRef = useRef(null);
  const privatePlanFocusTimerRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handlePrivatePlanContext = (event) => {
      const nextFocus =
        event.detail?.focus === "underwriting" ? "underwriting" : "reference";
      setPrivatePlanFocus(nextFocus);

      if (privatePlanFocusTimerRef.current) {
        window.clearTimeout(privatePlanFocusTimerRef.current);
      }
      privatePlanFocusTimerRef.current = window.setTimeout(() => {
        setPrivatePlanFocus(null);
        privatePlanFocusTimerRef.current = null;
      }, 14000);
    };

    window.addEventListener(PRIVATE_PLAN_CONTEXT_EVENT, handlePrivatePlanContext);
    return () => {
      window.removeEventListener(
        PRIVATE_PLAN_CONTEXT_EVENT,
        handlePrivatePlanContext
      );
      if (privatePlanFocusTimerRef.current) {
        window.clearTimeout(privatePlanFocusTimerRef.current);
        privatePlanFocusTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    showLeftRail({
      id: PRIVATE_PLAN_RAIL_ID,
      priority: 2,
      title: "Private Plans",
      shortLabel: "Private Plans",
      color: "#6aab7d",
      icon: <BookOpen size={13} />,
      badge:
        privatePlanFocus === "underwriting"
          ? "UW"
          : privatePlanFocus
            ? "REF"
            : null,
      isAttention: Boolean(privatePlanFocus),
      railClassName: "left-rail--private-plans",
      panelClassName: "left-rail-panel-shell--private-plans",
      component: (
        <PrivatePlanPanel
          highlightUnderwriting={privatePlanFocus === "underwriting"}
          onAcknowledgeUnderwritingHighlight={() => setPrivatePlanFocus(null)}
        />
      ),
    });
  }, [privatePlanFocus, showLeftRail]);

  useEffect(() => {
    openLeftRail(PRIVATE_PLAN_RAIL_ID);
  }, [openLeftRail]);

  useEffect(() => {
    return () => dismissLeftRail(PRIVATE_PLAN_RAIL_ID);
  }, [dismissLeftRail]);

  return (
    <>
      <U65Copilot onTranscriptChange={setTranscript} />
      <div className="flow-shell" ref={flowShellRef}>
        <DevotedPopupManager
          callStarted={state.callStarted}
          transcript={transcript}
          anchorRef={flowMainRef}
        />
        <div className="flow-main" ref={flowMainRef}>
          <U65Flow />
        </div>
      </div>
    </>
  );
}

export default function U65Script() {
  return (
    <U65Provider>
      <U65ScriptBody />
    </U65Provider>
  );
}
