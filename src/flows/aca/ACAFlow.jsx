/**
 * ACAFlow.jsx, ACA On-Exchange Script Flow
 * Gates 0–6 per u65-aca-spec.md Section 2.2
 * Follows MedSupFlow.jsx architecture patterns
 */

import { useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { useACA } from "./ACAContext";
import { ACA_GATES } from "./ACAData";
import { useScriptTemplate } from "../../hooks/useScriptTemplate";
import CenterTimerBar from "../../components/CenterTimerBar";
import ProgressDots from "../../components/ProgressDots";

// ACA accent color
const ACCENT = "#EAB308"; // amber/yellow to match tab circle
const SHOW_REFERENCE_DETAILS = import.meta.env.VITE_SHOW_ACA_REFERENCE_DETAILS === "true";

function fmt(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Say({ text }) {
  return (
    <div
      className="flow-script-line"
      style={{
        borderLeft: `2px solid rgba(234,179,8,0.3)`,
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

function Note() {
  return null;
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
        marginBottom: 12,
        fontSize: 12,
        color: "#f87171",
        lineHeight: 1.5,
      }}
    >
      ⚠ {text}
    </div>
  );
}

function SignalBadge({ text }) {
  return (
    <div
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 600,
        background: "rgba(234,179,8,0.06)",
        border: "1px solid rgba(234,179,8,0.18)",
        color: "#EAB308",
        borderRadius: 4,
        padding: "2px 8px",
        marginRight: 4,
        marginBottom: 4,
        letterSpacing: "0.04em",
      }}
    >
      ◆ {text}
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
          border: `1px solid ${done ? "rgba(52,211,153,0.2)" : "rgba(234,179,8,0.15)"}`,
          background: done ? "rgba(52,211,153,0.05)" : "rgba(255,255,255,0.015)",
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
            <span style={{ fontSize: 11, color: "#4a5568", fontVariantNumeric: "tabular-nums" }}>
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
        border: `1px solid ${active ? "rgba(234,179,8,0.3)" : "rgba(255,255,255,0.05)"}`,
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
            color: red ? "#f87171" : active ? ACCENT : "#4a5568",
            background: red
              ? "rgba(248,113,113,0.08)"
              : active
              ? "rgba(234,179,8,0.08)"
              : "rgba(255,255,255,0.03)",
            border: `1px solid ${
              red
                ? "rgba(248,113,113,0.2)"
                : active
                ? "rgba(234,179,8,0.2)"
                : "rgba(255,255,255,0.05)"
            }`,
            borderRadius: 5,
            padding: "3px 8px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          G{String(num).padStart(2, "0")}
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#dfe6f0" }}>{title}</span>
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

function scriptBodyToLines(body, fallback = []) {
  const lines = String(body || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines : fallback;
}

function useAcaTemplateGates() {
  const { sections } = useScriptTemplate("aca");

  return useMemo(() => {
    const ffmSections = sections.filter((section) => String(section.key || "").startsWith("ffm_"));
    if (!ffmSections.length) {
      return ACA_GATES;
    }

    return ACA_GATES.map((gate, index) => {
      const section =
        ffmSections.find((item) => item.key === `ffm_${gate.key}`) ||
        ffmSections[index];

      if (!section) {
        return gate;
      }

      return {
        ...gate,
        label: section.title?.replace(/^FFM:\s*/i, "") || gate.label,
        script: scriptBodyToLines(section.body, gate.script),
        gate: section.lock_message || gate.gate,
      };
    });
  }, [sections]);
}

// ─── GATE 0, Opening & Identity ────────────────────────────────────────────
function G0({ gate }) {
  const { state, dispatch, activeGate } = useACA();
  const d = state.sectionTimestamps[0];

  return (
    <Card num={0} title="Opening & Identity Verification" active={activeGate === 0} done={state.gate0Ok} dur={d ? d.end - d.start : null}>
      {gate.script.map((l, i) => <Say key={i} text={l} />)}

      <div style={{ marginTop: 12, marginBottom: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
          Set Enrollment Period
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["OEP", "SEP"].map((period) => (
            <button
              key={period}
              onClick={() => dispatch({ type: "SET_ENROLLMENT_PERIOD", period })}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 6,
                border: `1px solid ${state.enrollmentPeriod === period ? "rgba(234,179,8,0.4)" : "rgba(255,255,255,0.06)"}`,
                background: state.enrollmentPeriod === period ? "rgba(234,179,8,0.08)" : "rgba(255,255,255,0.02)",
                color: state.enrollmentPeriod === period ? ACCENT : "#4a5568",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                letterSpacing: "0.06em",
              }}
            >
              {period === "OEP" ? "Open Enrollment" : "Special Enrollment (SEP)"}
            </button>
          ))}
        </div>
        {SHOW_REFERENCE_DETAILS && state.enrollmentPeriod === "SEP" && (
          <div style={{ marginTop: 6, fontSize: 11, color: "#EAB308", opacity: 0.7 }}>
            → Gate 1 (SEP Qualification) will be required before proceeding
          </div>
        )}
        {SHOW_REFERENCE_DETAILS && state.enrollmentPeriod === "OEP" && (
          <div style={{ marginTop: 6, fontSize: 11, color: "#34d399", opacity: 0.7 }}>
            → SEP Gate will be skipped, proceed directly to Income Assessment
          </div>
        )}
      </div>

      {SHOW_REFERENCE_DETAILS && gate.notes.map((n, i) => <Note key={i} text={n} />)}

      <Gate
        label="Identity verified, consent obtained"
        done={state.gate0Ok}
        onDo={() => {
          dispatch({ type: "START_SECTION", sectionNum: 0 });
          dispatch({ type: "COMPLETE_SECTION", key: "gate0Ok", sectionNum: 0 });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "gate0Ok" })}
      />
    </Card>
  );
}

// ─── GATE 1, SEP Qualification (Conditional) ───────────────────────────────
function G1({ gate }) {
  const { state, dispatch, activeGate } = useACA();
  const d = state.sectionTimestamps[1];

  // Only render if SEP
  if (state.enrollmentPeriod !== "SEP") return null;

  return (
    <AnimatePresence>
      <motion.div
        key="sep-gate"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
      >
        <Card num={1} title="SEP Qualification" active={activeGate === 1} done={state.gate1Ok} dur={d ? d.end - d.start : null}>
          {SHOW_REFERENCE_DETAILS && <div style={{ fontSize: 11, color: ACCENT, background: "rgba(234,179,8,0.05)", border: "1px solid rgba(234,179,8,0.15)", borderRadius: 6, padding: "6px 10px", marginBottom: 12 }}>
            Conditional Gate, shown because enrollment period is SEP
          </div>}

          {gate.script.map((l, i) => <Say key={i} text={l} />)}

          <div style={{ marginTop: 14, marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              SEP Type Reference
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["SEP Type", "Documentation Needed", "Window"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#4a5568", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 11 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gate.sepTable.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                      <td style={{ padding: "7px 10px", color: "#c0d0e4", verticalAlign: "top" }}>{row.type}</td>
                      <td style={{ padding: "7px 10px", color: "#8fa4bc", verticalAlign: "top" }}>{row.docs}</td>
                      <td style={{ padding: "7px 10px", color: ACCENT, verticalAlign: "top", whiteSpace: "nowrap" }}>{row.window}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {SHOW_REFERENCE_DETAILS && gate.notes.map((n, i) => <ComplianceBanner key={i} text={n} />)}
          {SHOW_REFERENCE_DETAILS && gate.signals.map((s, i) => <SignalBadge key={i} text={s} />)}

          <Gate
            label="SEP event verified, within 60-day window"
            done={state.gate1Ok}
            onDo={() => {
              dispatch({ type: "START_SECTION", sectionNum: 1 });
              dispatch({ type: "COMPLETE_SECTION", key: "gate1Ok", sectionNum: 1 });
            }}
            onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "gate1Ok" })}
          />
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── GATE 2, Household & Income ─────────────────────────────────────────────
function G2({ gate }) {
  const { state, dispatch, activeGate } = useACA();
  const d = state.sectionTimestamps[2];

  return (
    <Card num={2} title="Household & Income Assessment" active={activeGate === 2} done={state.gate2Ok} dur={d ? d.end - d.start : null}>
      {gate.script.map((l, i) => <Say key={i} text={l} />)}

      {SHOW_REFERENCE_DETAILS && <ComplianceBanner text={gate.subsidyNote} />}

      <div style={{ marginTop: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
          FPL / Subsidy Reference
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["FPL Range", "Subsidy", "CSR Tier", "Agent Action"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#4a5568", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 11 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gate.fplTable.map((row, i) => {
                return (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <td style={{ padding: "7px 10px", color: ACCENT, fontWeight: 400, whiteSpace: "nowrap" }}>{row.range}</td>
                    <td style={{ padding: "7px 10px", color: "#c0d0e4" }}>{row.subsidy}</td>
                    <td style={{ padding: "7px 10px", color: "#8fa4bc" }}>{row.csr}</td>
                    <td style={{ padding: "7px 10px", color: "#8fa4bc", fontSize: 11 }}>{row.action}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Say text={gate.subsidyEligibleScript} />
      <Say text={gate.noSubsidyScript} />

      {SHOW_REFERENCE_DETAILS && gate.notes.map((n, i) => <Note key={i} text={n} />)}
      <div style={{ marginTop: 8 }}>
        {SHOW_REFERENCE_DETAILS && gate.signals.map((s, i) => <SignalBadge key={i} text={s} />)}
      </div>

      <Gate
        label="Household + income documented, subsidy eligibility determined"
        done={state.gate2Ok}
        onDo={() => {
          dispatch({ type: "START_SECTION", sectionNum: 2 });
          dispatch({ type: "COMPLETE_SECTION", key: "gate2Ok", sectionNum: 2 });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "gate2Ok" })}
      />
    </Card>
  );
}

// ─── GATE 3, Needs Analysis ──────────────────────────────────────────────────
function G3({ gate }) {
  const { state, dispatch, activeGate } = useACA();
  const d = state.sectionTimestamps[3];

  return (
    <Card num={3} title="Needs Analysis & Plan Preferences" active={activeGate === 3} done={state.gate3Ok} dur={d ? d.end - d.start : null}>
      {gate.script.map((l, i) => <Say key={i} text={l} />)}

      <div style={{ marginTop: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
          Metal Level Guidance
        </div>
        {gate.metalGuidance.map((g, i) => (
          <div key={i} style={{ fontSize: 12, color: "#8fa4bc", padding: "4px 10px", borderLeft: "2px solid rgba(234,179,8,0.2)", marginBottom: 4, lineHeight: 1.5 }}>
            {g}
          </div>
        ))}
      </div>

      {SHOW_REFERENCE_DETAILS && gate.notes.map((n, i) => <Note key={i} text={n} />)}
      <div style={{ marginTop: 8 }}>
        {SHOW_REFERENCE_DETAILS && gate.signals.map((s, i) => <SignalBadge key={i} text={s} />)}
      </div>

      <Gate
        label="Needs documented, metal level direction determined"
        done={state.gate3Ok}
        onDo={() => {
          dispatch({ type: "START_SECTION", sectionNum: 3 });
          dispatch({ type: "COMPLETE_SECTION", key: "gate3Ok", sectionNum: 3 });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "gate3Ok" })}
      />
    </Card>
  );
}

// ─── GATE 4, Plan Presentation ──────────────────────────────────────────────
function G4({ gate }) {
  const { state, dispatch, activeGate } = useACA();
  const d = state.sectionTimestamps[4];

  return (
    <Card num={4} title="Plan Presentation & Selection" active={activeGate === 4} done={state.gate4Ok} dur={d ? d.end - d.start : null}>
      {gate.script.map((l, i) => <Say key={i} text={l} />)}
      {SHOW_REFERENCE_DETAILS && gate.notes.map((n, i) => (
        n.startsWith("COMPLIANCE:") ? <ComplianceBanner key={i} text={n} /> : <Note key={i} text={n} />
      ))}

      <Gate
        label="Plan presented, network/formulary verified, plan selected"
        done={state.gate4Ok}
        onDo={() => {
          dispatch({ type: "START_SECTION", sectionNum: 4 });
          dispatch({ type: "COMPLETE_SECTION", key: "gate4Ok", sectionNum: 4 });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "gate4Ok" })}
      />
    </Card>
  );
}

// ─── GATE 5, Enrollment ─────────────────────────────────────────────────────
function G5({ gate }) {
  const { state, dispatch, activeGate } = useACA();
  const d = state.sectionTimestamps[5];

  return (
    <Card num={5} title="Enrollment & Submission" active={activeGate === 5} done={state.gate5Ok} dur={d ? d.end - d.start : null}>
      {SHOW_REFERENCE_DETAILS && <div style={{ fontSize: 11, background: "rgba(234,179,8,0.05)", border: "1px solid rgba(234,179,8,0.15)", borderRadius: 6, padding: "6px 10px", marginBottom: 12, color: ACCENT }}>
        {gate.exchangeNote}
      </div>}

      {gate.script.map((l, i) => <Say key={i} text={l} />)}
      {SHOW_REFERENCE_DETAILS && gate.notes.map((n, i) => <ComplianceBanner key={i} text={n} />)}
      <div style={{ marginTop: 8 }}>
        {SHOW_REFERENCE_DETAILS && gate.signals.map((s, i) => <SignalBadge key={i} text={s} />)}
      </div>

      <Gate
        label="Enrollment submitted, confirmation number recorded"
        done={state.gate5Ok}
        onDo={() => {
          dispatch({ type: "START_SECTION", sectionNum: 5 });
          dispatch({ type: "COMPLETE_SECTION", key: "gate5Ok", sectionNum: 5 });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "gate5Ok" })}
      />
    </Card>
  );
}

// ─── GATE 6, Closing ────────────────────────────────────────────────────────
function G6({ gate }) {
  const { state, dispatch, activeGate } = useACA();
  const d = state.sectionTimestamps[6];

  return (
    <Card num={6} title="Closing & Follow-Up" active={activeGate === 6} done={state.gate6Ok} dur={d ? d.end - d.start : null}>
      {gate.script.map((l, i) => <Say key={i} text={l} />)}

      <Gate
        label="Call closed, follow-up scheduled"
        done={state.gate6Ok}
        onDo={() => {
          dispatch({ type: "START_SECTION", sectionNum: 6 });
          dispatch({ type: "COMPLETE_SECTION", key: "gate6Ok", sectionNum: 6 });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "gate6Ok" })}
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
          <div style={{ fontSize: 16, fontWeight: 700, color: "#34d399" }}>ACA Enrollment Complete</div>
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

// ─── ACAFlow (main export) ────────────────────────────────────────────────────
const ACA_STEP_LABELS = [
  { k: "gate0Ok", l: "Open" },
  { k: "gate1Ok", l: "SEP", conditional: true },
  { k: "gate2Ok", l: "Income" },
  { k: "gate3Ok", l: "Needs" },
  { k: "gate4Ok", l: "Plans" },
  { k: "gate5Ok", l: "Enroll" },
  { k: "gate6Ok", l: "Close" },
];

export default function ACAFlow() {
  const { state, dispatch, activeGate } = useACA();
  const gates = useAcaTemplateGates();
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
        <section className="script-start-call-gate" style={{ background: `rgba(234,179,8,0.04)`, border: `1px solid rgba(234,179,8,0.2)`, borderRadius: 10, padding: "28px 20px", textAlign: "center", marginBottom: 10 }}>
          <button className="primary script-start-call-button" onClick={() => dispatch({ type: "START_CALL" })} style={{
            fontSize: 15, fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 36px",
            background: `linear-gradient(145deg, rgba(234,179,8,0.15), rgba(234,179,8,0.05))`, border: `1px solid rgba(234,179,8,0.3)`, color: ACCENT, borderRadius: 8, cursor: "pointer",
          }}>
            Start Call
          </button>
          <p style={{ marginTop: 10, fontSize: 11, color: "#4a5568" }}>Timer begins when you click Start Call</p>
        </section>
      ) : (
        <>
          <G0 gate={gates[0]} />
          <G1 gate={gates[1]} />
          <G2 gate={gates[2]} />
          <G3 gate={gates[3]} />
          <G4 gate={gates[4]} />
          <G5 gate={gates[5]} />
          <G6 gate={gates[6]} />

          <ProgressDots
            sections={ACA_STEP_LABELS.filter(
              (s) => !s.conditional || state.enrollmentPeriod === "SEP"
            ).map((s, idx) => {
              const isDone = Boolean(state[s.k]);
              const visibleSteps = ACA_STEP_LABELS.filter(
                (x) => !x.conditional || state.enrollmentPeriod === "SEP"
              );
              const realIndex = visibleSteps.findIndex((x) => x.k === s.k);
              const isActive = !isDone && realIndex === activeGate;
              return {
                key: s.k,
                label: s.l,
                status: isDone ? "done" : isActive ? "active" : "pending",
              };
            })}
          />
        </>
      )}
    </motion.div>
  );
}
