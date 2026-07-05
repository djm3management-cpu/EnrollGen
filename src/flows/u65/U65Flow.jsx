/**
 * U65Flow.jsx - U65 Off-Exchange Script Flow
 * G00-G09 talk track with G01a employer coverage branch.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { useU65 } from "./U65Context";
import { U65_GATES } from "./U65Data";
import { useScriptTemplate } from "../../hooks/useScriptTemplate";
import CenterTimerBar from "../../components/CenterTimerBar";
import ProgressDots from "../../components/ProgressDots";

const ACCENT = "var(--eg-flow-u65)";
const U65_VOICEMAIL_SCRIPT =
  "\"Hi, this is [Agent Name] with New Gen Health Solutions. I'm calling back regarding your request for health insurance information. Give me a call back when you get a chance. We have options that are generally 20 to 40 % less expensive than traditional marketplace plans, as well as private products with full coverage through the Aetna and Cigna networks, zero-dollar generic drugs, and much more. Looking forward to hearing from you. Have a great day.\"";

function fmt(ms) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function TalkTrack({ text }) {
  return (
    <div
      className="flow-script-line"
      style={{
        outline: "1px solid var(--flow-u65-border)",
        padding: "11px 16px",
        marginBottom: 8,
        borderRadius: "0 6px 6px 0",
        background: "var(--bg-elevated)",
      }}
    >
      <div className="flow-script-text" style={{ color: "var(--text-primary)", fontSize: 14, lineHeight: 1.7 }}>{text}</div>
    </div>
  );
}

function StageDirection({ text }) {
  return (
    <div
      className="flow-stage-direction"
      style={{
        outline: "1px solid var(--border-default)",
        padding: "8px 14px",
        marginBottom: 8,
        borderRadius: "0 6px 6px 0",
        background: "var(--bg-elevated)",
      }}
    >
      <div
        className="flow-stage-text"
        style={{
          color: "var(--text-muted)",
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
        borderTop: "1px solid var(--border-default)",
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
            done ? "var(--status-live-border)" : "var(--flow-u65-border)"
          }`,
          background: done ? "var(--status-live-bg)" : "var(--bg-elevated)",
          color: done ? "var(--status-live)" : "var(--text-primary)",
        }}
      >
        <Check className="flow-gate-icon" size={14} strokeWidth={2.8} aria-hidden="true" />
      </button>
    </div>
  );
}

function VoicemailSection() {
  const [open, setOpen] = useState(false);

  return (
    <div className={`u65-voicemail-section${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="u65-voicemail-toggle"
        aria-expanded={open}
        aria-controls="u65-g00-voicemail-script"
        onClick={() => setOpen((current) => !current)}
      >
        <span>Leave Voicemail</span>
        <ChevronDown className="u65-voicemail-icon" size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>

      {open ? (
        <div id="u65-g00-voicemail-script" className="u65-voicemail-body">
          <TalkTrack text={U65_VOICEMAIL_SCRIPT} />
        </div>
      ) : null}
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
            background: "var(--status-live-bg)",
            border: "1px solid var(--status-live-border)",
            borderRadius: 10,
            cursor: "pointer",
            listStyle: "none",
            fontSize: 13,
            color: "var(--text-muted)",
          }}
        >
          <span style={{ color: "var(--status-live)" }}>+</span>
          <span style={{ flex: 1 }}>
            <span
              style={{
                fontWeight: 700,
                color: "var(--text-muted)",
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
                color: "var(--text-muted)",
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
        background: active ? "var(--flow-u65-bg)" : "var(--bg-surface)",
        border: `1px solid ${
          active ? "var(--flow-u65-border)" : "var(--border-default)"
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
            color: active ? ACCENT : "var(--text-muted)",
            background: active
              ? "var(--flow-u65-bg)"
              : "var(--bg-elevated)",
            border: `1px solid ${
              active ? "var(--flow-u65-border)" : "var(--border-default)"
            }`,
            borderRadius: 5,
            padding: "3px 8px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {code}
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
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
      {gate.num === 0 ? <VoicemailSection /> : null}
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
            background: "var(--flow-u65-bg)",
            border: "1px solid var(--flow-u65-border)",
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
                "var(--flow-u65-bg)",
              border: "1px solid var(--flow-u65-border)",
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
                background: "var(--status-live-bg)",
                border: "1px solid var(--status-live-border)",
                borderRadius: 10,
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>+</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--status-live)" }}>
                U65 Flow Complete
              </div>
              <button
                onClick={() => dispatch({ type: "RESET" })}
                style={{
                  marginTop: 12,
                  background: "var(--status-live-bg)",
                  border: "1px solid var(--status-live-border)",
                  borderRadius: 6,
                  color: "var(--status-live)",
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
