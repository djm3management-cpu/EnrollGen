/**
 * U65Script.jsx, U65 Off-Exchange entry point
 * Wraps U65Flow with U65Provider
 */

import { useEffect, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { selectU65Product } from "../../lib/u65ProductSelection.js";
import { U65Provider } from "./U65Context";
import { useU65 } from "./U65Context";
import U65Flow from "./U65Flow";
import {
  U65_SMALL_BUSINESS_GATES,
  U65_SMALL_BUSINESS_OBJECTIONS,
} from "./U65Data";
import U65Copilot from "../../components/U65Copilot";
import DevotedPopupManager from "../../components/ancillary/DevotedPopupManager";
import { useLeftRailManager } from "../../components/leftRail/LeftRailManager";
import PrivatePlanPanel from "../../components/PrivatePlanPanel";
import {
  PRIVATE_PLAN_CONTEXT_EVENT,
  PRIVATE_PLAN_RAIL_ID,
} from "../../data/privatePlans";

const U65_FLOW_OPTIONS = [
  {
    id: "individual",
    label: "INDIVIDUAL",
    title: "Individual U65",
    color: "var(--eg-flow-u65)",
    soft: "var(--flow-u65-bg)",
    border: "var(--flow-u65-border)",
  },
  {
    id: "small-business",
    label: "SMALL BUSINESS",
    title: "Small Business",
    color: "var(--eg-flow-u65)",
    soft: "var(--flow-u65-bg)",
    border: "var(--flow-u65-border)",
  },
];

function U65FlowSelector({ variant, onChange }) {
  return (
    <div className="flow-variant-selector" role="group" aria-label="U65 coverage type">
      {U65_FLOW_OPTIONS.map((flow) => (
        <div
          key={flow.id}
          className="flow-variant-choice"
          style={{"--flow-option-color":flow.color,"--flow-option-soft":flow.soft,"--flow-option-border":flow.border}}
        >
          <button
            type="button"
            className="flow-variant-option"
            aria-label={flow.label}
            aria-pressed={variant === flow.id}
            onClick={() => onChange(flow.id)}
            title={flow.title}
          >
            <span className="flow-variant-option__dot" aria-hidden="true" />
          </button>
          <span className="flow-variant-option__label">{flow.label}</span>
        </div>
      ))}
    </div>
  );
}

function U65ScriptBody({ variant, onVariantChange }) {
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
      color: "var(--eg-flow-ms)",
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
          <U65FlowSelector variant={variant} onChange={onVariantChange} />
          {variant === "small-business" ? (
            <U65Flow
              providedScreens={U65_SMALL_BUSINESS_GATES}
              flowTitle="Small Business"
              objections={U65_SMALL_BUSINESS_OBJECTIONS}
            />
          ) : (
            <U65Flow />
          )}
        </div>
      </div>
    </>
  );
}

export default function U65Script() {
  const [variant, setVariant] = useState("individual");
  useEffect(() => () => selectU65Product(null), []);

  return (
    <U65Provider key={variant}>
      <U65ScriptBody variant={variant} onVariantChange={setVariant} />
    </U65Provider>
  );
}
