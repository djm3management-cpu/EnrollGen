import { memo, useState } from "react";
import { useScript } from "../../context/ScriptContext";
import ClientInfoCard from "./ClientInfoCard";
import PlanContextCard from "./PlanContextCard";

/**
 * V3LeftRail
 * 210px earth-tone left rail per docs/enrollgen-v3-mockup.jsx + Section 4.
 * ZIP input, tool selector pills, client info card, plan context card, notes.
 *
 * The script-context-aware bits (client info, plan context, notes) only render
 * when a ScriptProvider is present. For flows without one, set requireScript=false.
 */
function V3LeftRailInner({ tools = ["SEP finder", "Qualifier", "SNP"], onToolSelect }) {
  const { state, dispatch } = useScript();
  const [activeTool, setActiveTool] = useState(tools[0] || null);
  const [zip, setZip] = useState(state.tpmoZip || "");

  const setNote = (field, value) =>
    dispatch({ type: "SET_NOTE", field, value });

  const handleToolClick = (tool) => {
    setActiveTool(tool);
    onToolSelect?.(tool);
  };

  const handleZipChange = (event) => {
    const next = event.target.value.replace(/[^0-9]/g, "").slice(0, 5);
    setZip(next);
    dispatch({ type: "SET_FIELD", field: "tpmoZip", value: next });
  };

  return (
    <aside
      className="eg-left-rail"
      style={{
        borderRight: "1px solid var(--eg-border)",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "rgba(30, 26, 22, 0.53)",
        overflow: "auto",
      }}
    >
      <input
        className="left-rail-zip-input"
        type="text"
        inputMode="numeric"
        placeholder="Enter ZIP"
        value={zip}
        onChange={handleZipChange}
        aria-label="Enter ZIP"
      />

      {tools.length ? (
        <div className="left-rail-tool-row">
          {tools.map((tool) => (
            <button
              key={tool}
              type="button"
              className={`left-rail-tool-btn${activeTool === tool ? " is-active" : ""}`}
              onClick={() => handleToolClick(tool)}
            >
              {tool}
            </button>
          ))}
        </div>
      ) : null}

      <ClientInfoCard />
      <PlanContextCard />

      <div style={{ marginTop: "auto" }}>
        <div className="eg-rail-card__label">NOTES</div>
        <textarea
          rows={4}
          placeholder="Type notes here..."
          value={state.notes?.agentNotes || ""}
          onChange={(e) => setNote("agentNotes", e.target.value)}
          style={{
            width: "100%",
            fontFamily: "var(--eg-font-body)",
            fontSize: 11,
            padding: 8,
            background: "var(--eg-surface-2)",
            border: "1px solid var(--eg-border)",
            borderRadius: "var(--eg-radius-md)",
            color: "var(--eg-text)",
            outline: "none",
            resize: "vertical",
            lineHeight: 1.5,
          }}
        />
      </div>
    </aside>
  );
}

const V3LeftRail = memo(V3LeftRailInner);
export default V3LeftRail;
