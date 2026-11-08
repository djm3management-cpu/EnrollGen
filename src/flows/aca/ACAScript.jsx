/**
 * ACAScript.jsx - ACA script workspace entry point
 * Supports both the original ACA flow and the new default State ACA flow.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList, Search } from "lucide-react";
import { ACAProvider, useACA } from "./ACAContext";
import ACAFlow from "./ACAFlow";
import StateACAFlow from "./StateACAFlow";
import AcaCopilot from "../../components/AcaCopilot";
import AcaClientSidebar from "../../components/aca/AcaClientSidebar";
import AcaFfmSepFinder from "../../components/aca/AcaFfmSepFinder";
import DevotedPopupManager from "../../components/ancillary/DevotedPopupManager";
import { useLeftRailManager } from "../../components/leftRail/LeftRailManager";

const ACA_STATE_CLIENT_INFO_RAIL_ID = "aca-client-info";
const ACA_FFM_CLIENT_INFO_RAIL_ID = "aca-ffm-client-info";
const ACA_FFM_SEP_FINDER_RAIL_ID = "aca-ffm-sep-finder";

const ACA_FLOW_OPTIONS = [
  {
    id: "state",
    label: "STATE",
    title: "State ACA",
    color: "var(--eg-flow-aca)",
    soft: "var(--flow-aca-bg)",
    border: "var(--flow-aca-border)",
  },
  {
    id: "core",
    label: "FFM",
    title: "FFM",
    color: "var(--text-muted)",
    soft: "var(--bg-elevated)",
    border: "var(--border-default)",
  },
];

function ACAFlowSelector({ variant, onChange }) {
  return (
    <div className="flow-variant-selector" role="group" aria-label="ACA marketplace">
      {ACA_FLOW_OPTIONS.map((flow) => (
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

function ACAScriptBody({ variant, onVariantChange }) {
  const { state, dispatch } = useACA();
  const {
    showLeftRail,
    openLeftRail,
    minimizeLeftRail,
    dismissLeftRail,
  } = useLeftRailManager();
  const [transcript, setTranscript] = useState("");
  const flowShellRef = useRef(null);
  const flowMainRef = useRef(null);
  const clientInfoRailId =
    variant === "core"
      ? ACA_FFM_CLIENT_INFO_RAIL_ID
      : ACA_STATE_CLIENT_INFO_RAIL_ID;

  const handleSepProceed = useCallback(
    (category) => {
      dispatch({ type: "SET_ENROLLMENT_PERIOD", period: "SEP" });
      dispatch({
        type: "SET_CLIENT_PROFILE_FIELD",
        field: "sepType",
        value: category.title,
      });
      minimizeLeftRail(ACA_FFM_SEP_FINDER_RAIL_ID);
    },
    [dispatch, minimizeLeftRail]
  );

  useEffect(() => {
    showLeftRail({
      id: clientInfoRailId,
      priority: 2,
      title: "ACA Client Info",
      shortLabel: "ACA Client",
      color: "var(--eg-flow-aca)",
      icon: <ClipboardList size={13} />,
      railClassName: "left-rail--aca-client-info",
      panelClassName: "left-rail-panel-shell--aca-client-info",
      component: (
        <AcaClientSidebar state={state} dispatch={dispatch} variant={variant} />
      ),
    });
  }, [clientInfoRailId, dispatch, showLeftRail, state, variant]);

  useEffect(() => {
    openLeftRail(clientInfoRailId);

    return () => dismissLeftRail(clientInfoRailId);
  }, [clientInfoRailId, dismissLeftRail, openLeftRail]);

  useEffect(() => {
    if (variant !== "core") {
      dismissLeftRail(ACA_FFM_SEP_FINDER_RAIL_ID);
      return undefined;
    }

    showLeftRail({
      id: ACA_FFM_SEP_FINDER_RAIL_ID,
      priority: 3,
      title: "FFM SEP Finder",
      shortLabel: "SEP Finder",
      color: "var(--danger)",
      defaultMinimized: true,
      icon: <Search size={13} />,
      railClassName: "left-rail--sep-qualifier left-rail--aca-sep-finder",
      panelClassName:
        "left-rail-panel-shell--sep-qualifier left-rail-panel-shell--aca-sep-finder",
      component: <AcaFfmSepFinder onProceed={handleSepProceed} />,
    });

    return () => dismissLeftRail(ACA_FFM_SEP_FINDER_RAIL_ID);
  }, [dismissLeftRail, handleSepProceed, showLeftRail, variant]);

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
