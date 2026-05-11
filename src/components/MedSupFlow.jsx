/**
 * MedSupFlow.jsx
 * Straight-through Medicare Supplement script flow.
 */

import { useRef, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useMedSup } from "../context/MedSupContext";
import { MEDSUP_SECTIONS } from "../context/MedSupScript";
import { useScriptTemplate } from "../hooks/useScriptTemplate";
import CenterTimerBar from "./CenterTimerBar";
import ProgressDots from "./ProgressDots";

const MEDSUP_STEP_LABELS = [
  { k: "recordingOk", l: "Record" },
  { k: "tpmoOk", l: "TPMO" },
  { k: "qualOk", l: "Qualify" },
  { k: "discoveryOk", l: "Discovery" },
  { k: "quoteOk", l: "Quote" },
  { k: "enrollOk", l: "Enroll" },
  { k: "wrapOk", l: "Wrap" },
];

function fmt(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Say({ text }) {
  return (
    <div
      className="flow-script-line"
      style={{
        borderLeft: "2px solid rgba(74,222,128,0.3)",
        padding: "10px 16px",
        marginBottom: 8,
        borderRadius: "0 6px 6px 0",
      }}
    >
      <div
        className="flow-script-text"
        style={{
          color: "#c0d0e4",
          fontSize: 14,
          lineHeight: 1.65,
          fontStyle: "normal",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function Gate({ label, done, onDo, onUndo }) {
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
          minWidth: 260,
          padding: "10px 14px",
          border: `1px solid ${
            done ? "rgba(52,211,153,0.2)" : "rgba(74,222,128,0.15)"
          }`,
          background: done
            ? "rgba(52,211,153,0.05)"
            : "rgba(255,255,255,0.015)",
          color: done ? "#34d399" : "#dfe6f0",
        }}
      >
        <Check className="flow-gate-icon" size={14} strokeWidth={2.8} aria-hidden="true" />
      </button>
    </div>
  );
}

function Card({ num, title, red, active, done, dur, children }) {
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
          <span style={{ color: "#34d399" }}>✓</span>
          <span style={{ flex: 1 }}>{title}</span>
          {dur && (
            <span
              style={{
                fontSize: 11,
                color: "#4a5568",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmt(dur)}
            </span>
          )}
        </summary>
        <div style={{ paddingTop: 6 }}>{children}</div>
      </details>
    );
  }

  if (!done && !active) {
    return null;
  }

  return (
    <section
      className={`flow-script-card${active ? " active-card" : ""}`}
      style={{
        background: active
          ? "rgba(74,222,128,0.04)"
          : "rgba(255,255,255,0.018)",
        border: `1px solid ${
          active ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.05)"
        }`,
        borderRadius: 10,
        padding: "20px 18px",
        marginBottom: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: red ? "#f87171" : active ? "#4ade80" : "#4a5568",
            background: red
              ? "rgba(248,113,113,0.08)"
              : active
              ? "rgba(74,222,128,0.08)"
              : "rgba(255,255,255,0.03)",
            border: `1px solid ${
              red
                ? "rgba(248,113,113,0.2)"
                : active
                ? "rgba(74,222,128,0.15)"
                : "rgba(255,255,255,0.05)"
            }`,
            borderRadius: 5,
            padding: "3px 8px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {String(num).padStart(2, "0")}
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#dfe6f0" }}>
          {title}
        </span>
        {red && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.1em",
              background: "rgba(248,113,113,0.1)",
              border: "1px solid rgba(248,113,113,0.25)",
              color: "#f87171",
              borderRadius: 4,
              padding: "2px 7px",
              marginLeft: "auto",
              textTransform: "uppercase",
            }}
          >
            Compliance
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function SectionCard({ section }) {
  const { state, dispatch, activeSection } = useMedSup();
  const done = state[section.key];
  const d = state.sectionTimestamps[section.num];

  return (
    <Card
      num={section.num}
      title={section.label}
      red={section.compliance}
      active={activeSection === section.num}
      done={done}
      dur={d ? d.end - d.start : null}
    >
      {section.script.map((line, idx) => (
        <Say key={`${section.id}-${idx}`} text={line} />
      ))}
      <Gate
        label={section.gate}
        done={done}
        onDo={() => {
          dispatch({ type: "START_SECTION", sectionNum: section.num });
          dispatch({
            type: "COMPLETE_SECTION",
            key: section.key,
            sectionNum: section.num,
          });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: section.key })}
      />
      {section.key === "wrapOk" && done && (
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
          <div style={{ fontSize: 24, marginBottom: 6 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#34d399" }}>
            Call Complete
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
      )}
    </Card>
  );
}

function scriptBodyToLines(body, fallback = []) {
  const lines = String(body || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines : fallback;
}

function useMedSupTemplateSections() {
  const { sections } = useScriptTemplate("medsup");

  return useMemo(() => {
    if (!sections.length) {
      return MEDSUP_SECTIONS;
    }

    return sections
      .slice()
      .sort((a, b) => (a.sort_order || a.section_number || 0) - (b.sort_order || b.section_number || 0))
      .map((section, index) => {
        const fallback =
          MEDSUP_SECTIONS.find((item) => item.key === section.gate_field) ||
          MEDSUP_SECTIONS[index] ||
          {};

        return {
          ...fallback,
          id: section.key || fallback.id || `medsup-${index + 1}`,
          num: fallback.num || index + 1,
          key: section.gate_field || fallback.key,
          label: section.title || fallback.label || `Section ${index + 1}`,
          compliance: Boolean(section.compliance_locked),
          script: scriptBodyToLines(section.body, fallback.script),
          gate: section.lock_message || fallback.gate || "Section completed",
        };
      });
  }, [sections]);
}


export default function MedSupFlow() {
  const { state, dispatch, activeSection } = useMedSup();
  const medSupSections = useMedSupTemplateSections();
  const prev = useRef(activeSection);

  useEffect(() => {
    if (activeSection !== prev.current) {
      prev.current = activeSection;
      requestAnimationFrame(() =>
        setTimeout(() => {
          const el = document.querySelector(".active-card");
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80)
      );
    }
  }, [activeSection]);

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
            background: "rgba(74,222,128,0.04)",
            border: "1px solid rgba(74,222,128,0.2)",
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
                "linear-gradient(145deg, rgba(74,222,128,0.15), rgba(74,222,128,0.05))",
              border: "1px solid rgba(74,222,128,0.3)",
              color: "#4ade80",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Start Call
          </button>
          <p style={{ marginTop: 10, fontSize: 11, color: "#4a5568" }}>
            Timer begins when you click Start Call
          </p>
        </section>
      ) : (
        <>
          {medSupSections.map((section) => (
            <SectionCard key={section.id} section={section} />
          ))}

          <ProgressDots
            sections={MEDSUP_STEP_LABELS.map((step, idx) => {
              const isDone = Boolean(state[step.k]);
              const activeIdx = Math.min(
                Math.max(activeSection - 1, 0),
                MEDSUP_STEP_LABELS.length - 1
              );
              const isActive = !isDone && idx === activeIdx;
              return {
                key: step.k,
                label: step.l,
                status: isDone ? "done" : isActive ? "active" : "pending",
              };
            })}
          />
        </>
      )}
    </motion.div>
  );
}
