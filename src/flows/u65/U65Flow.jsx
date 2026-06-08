/**
 * U65Flow.jsx - U65 Off-Exchange Script Flow
 * G00-G09 talk track with G01a employer coverage branch.
 */

import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useU65 } from "./U65Context";
import { U65_GATES } from "./U65Data";
import { useScriptTemplate } from "../../hooks/useScriptTemplate";
import CenterTimerBar from "../../components/CenterTimerBar";
import ProgressDots from "../../components/ProgressDots";

const ACCENT = "#a855f7";

function fmt(ms) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function TalkTrack({ text }) {
  return (
    <div
      className="flow-script-line"
      style={{
        borderLeft: "2px solid rgba(168,85,247,0.28)",
        padding: "11px 16px",
        marginBottom: 8,
        borderRadius: "0 6px 6px 0",
        background: "rgba(255,255,255,0.012)",
      }}
    >
      <div className="flow-script-text" style={{ color: "#dfe6f0", fontSize: 14, lineHeight: 1.7 }}>{text}</div>
    </div>
  );
}

function StageDirection({ text }) {
  return (
    <div
      className="flow-stage-direction"
      style={{
        borderLeft: "2px solid rgba(255,255,255,0.1)",
        padding: "8px 14px",
        marginBottom: 8,
        borderRadius: "0 6px 6px 0",
        background: "rgba(255,255,255,0.015)",
      }}
    >
      <div
        className="flow-stage-text"
        style={{
          color: "#8fa4bc",
          fontSize: 12,
          lineHeight: 1.55,
          fontStyle: "italic",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function GateToggle({ label, done, onDo, onUndo }) {
  return (
    <div
      className="flow-gate-action"
      style={{
        marginTop: 16,
        paddingTop: 14,
        borderTop: "1px solid rgba(255,255,255,0.04)",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <button
        type="button"
        className="check flow-gate-check"
        onClick={done ? onUndo : onDo}
        aria-label={label}
        aria-pressed={done}
        title={label}
        style={{
          justifyContent: "center",
          width: "fit-content",
          minWidth: 240,
          padding: "10px 14px",
          border: `1px solid ${
            done ? "rgba(52,211,153,0.2)" : "rgba(168,85,247,0.15)"
          }`,
          background: done ? "rgba(52,211,153,0.05)" : "rgba(255,255,255,0.015)",
          color: done ? "#34d399" : "#dfe6f0",
        }}
      >
        <Check className="flow-gate-icon" size={14} strokeWidth={2.8} aria-hidden="true" />
      </button>
    </div>
  );
}

function FlowCard({ code, title, active, done, dur, children }) {
  if (done && !active) {
    return (
      <details style={{ marginBottom: 10 }}>
        <summary
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            background: "rgba(52,211,153,0.03)",
            border: "1px solid rgba(52,211,153,0.1)",
            borderRadius: 10,
            cursor: "pointer",
            listStyle: "none",
            fontSize: 13,
            color: "#6b7a8d",
          }}
        >
          <span style={{ color: "#34d399" }}>+</span>
          <span style={{ flex: 1 }}>
            <span
              style={{
                fontWeight: 700,
                color: "#4a5568",
                marginRight: 8,
                fontSize: 11,
              }}
            >
              {code}
            </span>
            {title}
          </span>
          {dur ? (
            <span
              style={{
                fontSize: 11,
                color: "#4a5568",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmt(dur)}
            </span>
          ) : null}
        </summary>
        <div style={{ paddingTop: 6 }}>{children}</div>
      </details>
    );
  }

  if (!done && !active) {
    return null;
  }

  return (
    <motion.section
      className={`flow-script-card${active ? " active-card" : ""}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        background: active ? "rgba(168,85,247,0.04)" : "rgba(255,255,255,0.018)",
        border: `1px solid ${
          active ? "rgba(168,85,247,0.3)" : "rgba(255,255,255,0.05)"
        }`,
        borderRadius: 10,
        padding: "20px 18px",
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: active ? ACCENT : "#4a5568",
            background: active
              ? "rgba(168,85,247,0.08)"
              : "rgba(255,255,255,0.03)",
            border: `1px solid ${
              active ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.05)"
            }`,
            borderRadius: 5,
            padding: "3px 8px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {code}
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#dfe6f0" }}>{title}</span>
      </div>
      {children}
    </motion.section>
  );
}

function U65GateSection({ gate }) {
  const { state, dispatch, activeGate } = useU65();
  const done = Boolean(state[gate.key]);
  const timestamps = state.sectionTimestamps[gate.num];
  const duration =
    timestamps?.start && timestamps?.end ? timestamps.end - timestamps.start : null;

  return (
    <FlowCard
      code={gate.code || `G${String(gate.num).padStart(2, "0")}`}
      title={gate.label}
      active={activeGate === gate.num}
      done={done}
      dur={duration}
    >
      {gate.script.map((line, index) => (
        <TalkTrack key={`${gate.id}-line-${index}`} text={line} />
      ))}
      {gate.directions?.map((line, index) => (
        <StageDirection key={`${gate.id}-dir-${index}`} text={line} />
      ))}
      <GateToggle
        label={gate.gate}
        done={done}
        onDo={() => {
          dispatch({ type: "START_SECTION", sectionNum: gate.num });
          dispatch({ type: "COMPLETE_SECTION", key: gate.key, sectionNum: gate.num });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: gate.key })}
      />
    </FlowCard>
  );
}

function scriptBodyToParts(body, fallbackScript = [], fallbackDirections = []) {
  const lines = String(body || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return { script: fallbackScript, directions: fallbackDirections };
  }

  const script = [];
  const directions = [];

  lines.forEach((line) => {
    if (line.startsWith("Direction:")) {
      directions.push(line.replace(/^Direction:\s*/, ""));
      return;
    }
    script.push(line);
  });

  return {
    script: script.length ? script : fallbackScript,
    directions: directions.length ? directions : fallbackDirections,
  };
}

function useU65TemplateGates() {
  const { sections } = useScriptTemplate("u65");

  return useMemo(() => {
    if (!sections.length || sections.length < U65_GATES.length) {
      return U65_GATES;
    }

    return U65_GATES.map((gate, index) => {
      const section =
        sections.find((item) => item.gate_field === gate.key || item.key === gate.key) ||
        sections[index];

      if (!section) {
        return gate;
      }

      const bodyParts = scriptBodyToParts(section.body, gate.script, gate.directions);

      return {
        ...gate,
        label: section.title || gate.label,
        script: bodyParts.script,
        directions: bodyParts.directions,
        gate: section.lock_message || gate.gate,
      };
    });
  }, [sections]);
}


export default function U65Flow() {
  const { state, dispatch, activeGate } = useU65();
  const u65Gates = useU65TemplateGates();
  const isComplete = u65Gates.every((gate) => Boolean(state[gate.key]));
  const previousGateRef = useRef(activeGate);

  useEffect(() => {
    if (activeGate !== previousGateRef.current) {
      previousGateRef.current = activeGate;
      requestAnimationFrame(() =>
        setTimeout(() => {
          const element = document.querySelector(".active-card");
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 80)
      );
    }
  }, [activeGate]);

  return (
    <motion.div
      className="flow"
      style={{ fontFamily: "var(--font-body)" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <CenterTimerBar />

      {!state.callStarted ? (
        <section
          className="script-start-call-gate"
          style={{
            background: "rgba(168,85,247,0.04)",
            border: "1px solid rgba(168,85,247,0.2)",
            borderRadius: 10,
            padding: "28px 20px",
            textAlign: "center",
            marginBottom: 10,
          }}
        >
          <button
            className="primary script-start-call-button"
            onClick={() => dispatch({ type: "START_CALL" })}
            style={{
              fontSize: 15,
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "10px 36px",
              background:
                "linear-gradient(145deg, rgba(168,85,247,0.15), rgba(168,85,247,0.05))",
              border: "1px solid rgba(168,85,247,0.3)",
              color: ACCENT,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            START
          </button>
        </section>
      ) : (
        <>
          {u65Gates.map((gate) => (
            <U65GateSection key={gate.id} gate={gate} />
          ))}

          <ProgressDots
            sections={u65Gates.map((gate) => {
              const isDone = Boolean(state[gate.key]);
              const isActive = !isDone && gate.num === activeGate;
              return {
                key: gate.key,
                label: gate.shortLabel || gate.label,
                status: isDone ? "done" : isActive ? "active" : "pending",
              };
            })}
          />

          {isComplete && !state.crossSellAcknowledged ? (
            <div className="sf-inline-lock">
              Acknowledge the mandatory cross-sell prompt in Co-Pilot before closing this U65 workflow.
            </div>
          ) : null}

          {isComplete && state.crossSellAcknowledged ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                marginTop: 18,
                textAlign: "center",
                padding: "20px",
                background: "rgba(52,211,153,0.04)",
                border: "1px solid rgba(52,211,153,0.12)",
                borderRadius: 10,
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>+</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#34d399" }}>
                U65 Flow Complete
              </div>
              <button
                onClick={() => dispatch({ type: "RESET" })}
                style={{
                  marginTop: 12,
                  background: "rgba(52,211,153,0.08)",
                  border: "1px solid rgba(52,211,153,0.2)",
                  borderRadius: 6,
                  color: "#34d399",
                  padding: "8px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                New Call
              </button>
            </motion.div>
          ) : null}
        </>
      )}
    </motion.div>
  );
}
