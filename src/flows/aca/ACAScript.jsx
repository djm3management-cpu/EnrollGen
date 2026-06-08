/**
 * ACAScript.jsx - ACA script workspace entry point
 * Supports both the original ACA flow and the new default State ACA flow.
 */

import { useEffect, useRef, useState } from "react";
import { ClipboardList } from "lucide-react";
import { ACAProvider, useACA } from "./ACAContext";
import ACAFlow from "./ACAFlow";
import StateACAFlow from "./StateACAFlow";
import AcaCopilot from "../../components/AcaCopilot";
import AcaClientSidebar from "../../components/aca/AcaClientSidebar";
import DevotedPopupManager from "../../components/ancillary/DevotedPopupManager";
import { useLeftRailManager } from "../../components/leftRail/LeftRailManager";

const ACA_CLIENT_INFO_RAIL_ID = "aca-client-info";

const ACA_FLOW_OPTIONS = [
  {
    id: "state",
    label: "STATE",
    title: "State ACA",
    color: "#EAB308",
    rgb: "234,179,8",
  },
  {
    id: "core",
    label: "FFM",
    title: "FFM",
    color: "#8fa4bc",
    rgb: "143,164,188",
  },
];

function ACAFlowSelector({ variant, onChange }) {
  return (
    <>
      <style>{`
        @keyframes aca-flow-pulse {
          0% { box-shadow: 0 0 6px 2px var(--pulse-color); }
          50% { box-shadow: 0 0 14px 5px var(--pulse-color); }
          100% { box-shadow: 0 0 6px 2px var(--pulse-color); }
        }
      `}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          width: "fit-content",
          margin: "0 auto 14px",
          background: "linear-gradient(180deg, var(--eg-surface-2) 0%, var(--eg-surface-1) 100%)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 8,
          padding: "8px 16px",
          userSelect: "none",
          boxShadow:
            "inset 0 2px 6px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        {ACA_FLOW_OPTIONS.map((flow) => {
          const active = variant === flow.id;
          return (
            <button
              key={flow.id}
              type="button"
              onClick={() => onChange(flow.id)}
              title={flow.title}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontFamily: "var(--font-body)",
              }}
            >
              <div
                style={{
                  "--pulse-color": `rgba(${flow.rgb},0.55)`,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: active ? flow.color : `rgba(${flow.rgb},0.18)`,
                  border: `1px solid ${
                    active ? flow.color : `rgba(${flow.rgb},0.25)`
                  }`,
                  boxShadow: active
                    ? `0 0 8px 2px rgba(${flow.rgb},0.5)`
                    : "none",
                  transition:
                    "background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
                  flexShrink: 0,
                  animation: active
                    ? "aca-flow-pulse 2.4s ease-in-out infinite"
                    : "none",
                }}
              />
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  fontFamily: "var(--font-body)",
                  color: active ? flow.color : `rgba(${flow.rgb},0.45)`,
                  transition: "color 0.2s ease",
                  textTransform: "uppercase",
                  lineHeight: 1,
                }}
              >
                {flow.label}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function ACAScriptBody({ variant, onVariantChange }) {
  const { state, dispatch } = useACA();
  const { showLeftRail, openLeftRail, dismissLeftRail } = useLeftRailManager();
  const [transcript, setTranscript] = useState("");
  const flowShellRef = useRef(null);
  const flowMainRef = useRef(null);

  useEffect(() => {
    showLeftRail({
      id: ACA_CLIENT_INFO_RAIL_ID,
      priority: 2,
      title: "ACA Client Info",
      shortLabel: "ACA Client",
      color: "#EAB308",
      icon: <ClipboardList size={13} />,
      railClassName: "left-rail--aca-client-info",
      panelClassName: "left-rail-panel-shell--aca-client-info",
      component: (
        <AcaClientSidebar state={state} dispatch={dispatch} variant={variant} />
      ),
    });
  }, [dispatch, showLeftRail, state, variant]);

  useEffect(() => {
    openLeftRail(ACA_CLIENT_INFO_RAIL_ID);
    return () => dismissLeftRail(ACA_CLIENT_INFO_RAIL_ID);
  }, [dismissLeftRail, openLeftRail]);

  return (
    <>
      <AcaCopilot onTranscriptChange={setTranscript} />
      <div className="flow-shell" ref={flowShellRef}>
        <DevotedPopupManager
          callStarted={state.callStarted}
          transcript={transcript}
          anchorRef={flowMainRef}
        />
        <div className="flow-main" ref={flowMainRef}>
          <ACAFlowSelector variant={variant} onChange={onVariantChange} />
          {variant === "state" ? <StateACAFlow /> : <ACAFlow />}
        </div>
      </div>
    </>
  );
}

export default function ACAScript() {
  const [variant, setVariant] = useState("state");

  return (
    <ACAProvider key={variant} variant={variant}>
      <ACAScriptBody variant={variant} onVariantChange={setVariant} />
    </ACAProvider>
  );
}
