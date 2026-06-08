import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useACA } from "./ACAContext";
import { STATE_ACA_GATES } from "./StateACAData";
import FplCalculatorPanel from "../../components/FplCalculatorPanel";
import { useScriptTemplate } from "../../hooks/useScriptTemplate";
import CenterTimerBar from "../../components/CenterTimerBar";
import ProgressDots from "../../components/ProgressDots";

const ACCENT = "#EAB308";

const STATE_ACA_STEP_LABELS = [
  { k: "gate0Ok", l: "Open" },
  { k: "gate1Ok", l: "Profile" },
  { k: "gate2Ok", l: "Income" },
  { k: "gate3Ok", l: "Needs" },
  { k: "gate4Ok", l: "Plans" },
  { k: "gate5Ok", l: "Login" },
  { k: "gate6Ok", l: "Close" },
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
        borderLeft: "2px solid rgba(234,179,8,0.3)",
        padding: "10px 16px",
        marginBottom: 8,
        borderRadius: "0 6px 6px 0",
      }}
    >
      <div className="flow-script-text" style={{ color: "#c0d0e4", fontSize: 14, lineHeight: 1.65 }}>
        {text}
      </div>
    </div>
  );
}

function Note({ text }) {
  return (
    <div
      className="flow-stage-direction"
      style={{
        borderLeft: "2px solid rgba(234,179,8,0.2)",
        padding: "7px 12px",
        marginBottom: 6,
        borderRadius: "0 5px 5px 0",
        background: "rgba(234,179,8,0.03)",
      }}
    >
      <div
        className="flow-stage-text"
        style={{
          color: "#8fa4bc",
          fontSize: 12,
          lineHeight: 1.5,
          fontStyle: "italic",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function ComplianceBanner({ text }) {
  return (
    <div
      className="flow-compliance-banner"
      style={{
        background: "rgba(248,113,113,0.06)",
        border: "1px solid rgba(248,113,113,0.2)",
        borderRadius: 6,
        padding: "9px 13px",
        marginBottom: 10,
        fontSize: 12,
        color: "#f87171",
        lineHeight: 1.5,
      }}
    >
      {text}
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
            done ? "rgba(52,211,153,0.2)" : "rgba(234,179,8,0.15)"
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

function Card({ num, title, active, done, dur, children }) {
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
          <span style={{ flex: 1 }}>
            <span
              style={{
                fontWeight: 700,
                color: "#4a5568",
                marginRight: 8,
                fontSize: 11,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              G{String(num).padStart(2, "0")}
            </span>
            {title}
          </span>
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
        background: active ? "rgba(234,179,8,0.04)" : "rgba(255,255,255,0.018)",
        border: `1px solid ${
          active ? "rgba(234,179,8,0.3)" : "rgba(255,255,255,0.05)"
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
              ? "rgba(234,179,8,0.08)"
              : "rgba(255,255,255,0.03)",
            border: `1px solid ${
              active ? "rgba(234,179,8,0.2)" : "rgba(255,255,255,0.05)"
            }`,
            borderRadius: 5,
            padding: "3px 8px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          G{String(num).padStart(2, "0")}
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#dfe6f0" }}>
          {title}
        </span>
      </div>
      {children}
    </section>
  );
}

function ReviewPoints({ points }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 12 }}>
      {points.map((point) => (
        <div
          key={point}
          style={{
            padding: "8px 10px",
            borderRadius: 7,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.05)",
            fontSize: 11,
            color: "#c0d0e4",
          }}
        >
          {point}
        </div>
      ))}
    </div>
  );
}

function StateGate({ gate, active, done, children }) {
  const { dispatch, state } = useACA();
  const duration = state.sectionTimestamps[gate.num];

  return (
    <Card
      num={gate.num}
      title={gate.title}
      active={active}
      done={done}
      dur={duration?.end ? duration.end - duration.start : null}
    >
      {gate.script.map((line) => (
        <Say key={line} text={line} />
      ))}
      {children}
      {gate.notes.map((note) => (
        <Note key={note} text={note} />
      ))}
      <Gate
        label={gate.gate}
        done={done}
        onDo={() => {
          dispatch({ type: "START_SECTION", sectionNum: gate.num });
          dispatch({ type: "COMPLETE_SECTION", key: gate.key, sectionNum: gate.num });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: gate.key })}
      />
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

function useStateAcaTemplateGates() {
  const { sections } = useScriptTemplate("aca");

  return useMemo(() => {
    if (!sections.length) {
      return STATE_ACA_GATES;
    }

    return STATE_ACA_GATES.map((gate, index) => {
      const section =
        sections.find((item) => item.key === `state_${gate.key}`) ||
        sections.find((item) => item.key === gate.key || item.gate_field === gate.key) ||
        sections[index];

      if (!section) {
        return gate;
      }

      return {
        ...gate,
        title: section.title || gate.title,
        script: scriptBodyToLines(section.body, gate.script),
        gate: section.lock_message || gate.gate,
      };
    });
  }, [sections]);
}

function G2Extra() {
  const [fplTool, setFplTool] = useState({
    householdSize: null,
    annualIncome: null,
    clientAge: null,
  });

  return (
    <>
      <ComplianceBanner text="Client consent is required before you enter any minimum working income on the quote." />
      <FplCalculatorPanel
        title="FPL Chart Reference"
        accentColor={ACCENT}
        accentRgb="234,179,8"
        fields={fplTool}
        onFieldChange={(field, value) =>
          setFplTool((prev) => ({ ...prev, [field]: value }))
        }
      />
    </>
  );
}


export default function StateACAFlow() {
  const { state, dispatch, activeGate } = useACA();
  const gates = useStateAcaTemplateGates();
  const prev = useRef(activeGate);

  useEffect(() => {
    if (activeGate !== prev.current) {
      prev.current = activeGate;
      requestAnimationFrame(() =>
        setTimeout(() => {
          const el = document.querySelector(".active-card");
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
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
            background: "rgba(234,179,8,0.04)",
            border: "1px solid rgba(234,179,8,0.2)",
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
                "linear-gradient(145deg, rgba(234,179,8,0.15), rgba(234,179,8,0.05))",
              border: "1px solid rgba(234,179,8,0.3)",
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
          <StateGate
            gate={gates[0]}
            active={activeGate === 0}
            done={state.gate0Ok}
          >
            <ComplianceBanner text="If the client confirms employer coverage, Medicaid, or similar active coverage, do not continue this state ACA quoting flow." />
          </StateGate>

          <StateGate
            gate={gates[1]}
            active={activeGate === 1}
            done={state.gate1Ok}
          />

          <StateGate
            gate={gates[2]}
            active={activeGate === 2}
            done={state.gate2Ok}
          >
            <G2Extra />
          </StateGate>

          <StateGate
            gate={gates[3]}
            active={activeGate === 3}
            done={state.gate3Ok}
          />

          <StateGate
            gate={gates[4]}
            active={activeGate === 4}
            done={state.gate4Ok}
          >
            <ReviewPoints
              points={[
                "Monthly premium",
                "Deductible",
                "PCP copay",
                "Specialist copay",
                "Rx copays",
              ]}
            />
          </StateGate>

          <StateGate
            gate={gates[5]}
            active={activeGate === 5}
            done={state.gate5Ok}
          />

          <StateGate
            gate={gates[6]}
            active={activeGate === 6}
            done={state.gate6Ok}
          >
            <ReviewPoints
              points={[
                "Selected plan confirmed",
                "Pricing reviewed again",
                "Login is the next action",
                "Application details ready",
              ]}
            />
            {state.gate6Ok && (
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
                <div
                  style={{ fontSize: 16, fontWeight: 700, color: "#34d399" }}
                >
                  State ACA Flow Complete
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
          </StateGate>

          <ProgressDots
            sections={STATE_ACA_STEP_LABELS.map((step, idx) => {
              const isDone = Boolean(state[step.k]);
              const isActive = !isDone && idx === activeGate;
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
