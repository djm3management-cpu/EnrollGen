/**
 * MedSupFlow.jsx
 * Drop into: src/components/MedSupFlow.jsx
 *
 * The Med Sup script flow — rendered when mode === "medsup" in App.jsx.
 * Uses its own MedSupContext for state. ScriptContext/ScriptFlow are untouched.
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMedSup } from "../context/MedSupContext";
import { MEDSUP_SECTIONS } from "../context/MedSupScript";

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function formatDuration(ms) {
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function useElapsed(start) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(id);
  }, [start]);
  return elapsed;
}

/* ─── ComplianceBadge ──────────────────────────────────────────────────────── */
function ComplianceBadge() {
  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        background: "rgba(248,113,113,0.12)",
        border: "1px solid rgba(248,113,113,0.35)",
        color: "#f87171",
        borderRadius: 4,
        padding: "2px 7px",
        marginLeft: 8,
      }}
    >
      COMPLIANCE
    </span>
  );
}

/* ─── ScriptLine ───────────────────────────────────────────────────────────── */
function ScriptLine({ text }) {
  return (
    <div
      style={{
        position: "relative",
        background: "rgba(56,189,248,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderLeft: "3px solid rgba(56,189,248,0.4)",
        borderRadius: "0 10px 10px 0",
        padding: "13px 16px 13px 18px",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "rgba(56,189,248,0.6)",
          letterSpacing: "0.1em",
          marginBottom: 5,
        }}
      >
        AGENT SAYS
      </div>
      <div
        style={{
          color: "#c8d8f0",
          fontSize: 14,
          lineHeight: 1.65,
          fontStyle: "italic",
        }}
      >
        &ldquo;{text}&rdquo;
      </div>
    </div>
  );
}

/* ─── AgentNote ────────────────────────────────────────────────────────────── */
function AgentNote({ text }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        background: "rgba(255,255,255,0.015)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 8,
        padding: "9px 13px",
        marginBottom: 6,
      }}
    >
      <span style={{ fontSize: 12, opacity: 0.5, flexShrink: 0 }}>⚑</span>
      <span
        style={{
          fontSize: 12.5,
          color: "var(--text-muted)",
          lineHeight: 1.5,
          fontStyle: "italic",
        }}
      >
        {text}
      </span>
    </div>
  );
}

/* ─── SectionGate ──────────────────────────────────────────────────────────── */
function SectionGate({ label, completed, onComplete, onUndo }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginTop: 16,
        paddingTop: 14,
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {completed ? (
        <>
          <span style={{ color: "var(--text-success)", fontSize: 13 }}>
            ✅ {label}
          </span>
          <button
            onClick={onUndo}
            style={{
              marginLeft: "auto",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              color: "var(--text-muted)",
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            ↩ Undo
          </button>
        </>
      ) : (
        <button
          onClick={onComplete}
          style={{
            background: "rgba(56,189,248,0.1)",
            border: "1px solid rgba(56,189,248,0.3)",
            borderRadius: 8,
            color: "var(--accent-cyan)",
            padding: "9px 20px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            width: "100%",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.target.style.background = "rgba(56,189,248,0.18)";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = "rgba(56,189,248,0.1)";
          }}
        >
          ✓ {label}
        </button>
      )}
    </div>
  );
}

/* ─── CollapsibleMedSupSection ─────────────────────────────────────────────── */
function CollapsibleMedSupSection({
  sectionNum,
  label,
  isCompleted,
  isActive,
  duration,
  children,
}) {
  if (!isCompleted || isActive) return children;

  return (
    <details className="completed-section">
      <summary className="completed-section-summary">
        <span className="completed-check">✅</span>
        <span className="completed-label">{label}</span>
        {duration && (
          <span className="completed-time">{formatDuration(duration)}</span>
        )}
      </summary>
      <div className="completed-section-body">{children}</div>
    </details>
  );
}

/* ─── Section 1 — Recording ────────────────────────────────────────────────── */
function MedSupSectionRecording() {
  const { state, dispatch, activeSection } = useMedSup();
  const isActive = activeSection === 1;
  const sec = MEDSUP_SECTIONS[0];

  return (
    <CollapsibleMedSupSection
      sectionNum={1}
      label="Recording Disclosure"
      isCompleted={state.recordingOk}
      isActive={isActive}
      duration={
        state.sectionTimestamps[1]
          ? state.sectionTimestamps[1].end - state.sectionTimestamps[1].start
          : null
      }
    >
      <section
        className={`card ${isActive ? "active-card" : ""}`}
        style={isActive ? { borderColor: "var(--border-active)" } : {}}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--accent-cyan)",
              background: "rgba(56,189,248,0.08)",
              border: "1px solid rgba(56,189,248,0.2)",
              borderRadius: 4,
              padding: "3px 8px",
            }}
          >
            01
          </span>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            Recording Disclosure
          </h3>
        </div>

        {sec.script.map((line, i) => (
          <ScriptLine key={i} text={line} />
        ))}
        {sec.notes.map((note, i) => (
          <AgentNote key={i} text={note} />
        ))}

        <SectionGate
          label="Recording consent confirmed"
          completed={state.recordingOk}
          onComplete={() => {
            dispatch({ type: "START_SECTION", sectionNum: 1 });
            dispatch({
              type: "COMPLETE_SECTION",
              key: "recordingOk",
              sectionNum: 1,
            });
          }}
          onUndo={() =>
            dispatch({ type: "UNCOMPLETE_SECTION", key: "recordingOk" })
          }
        />
      </section>
    </CollapsibleMedSupSection>
  );
}

/* ─── Section 2 — TPMO ─────────────────────────────────────────────────────── */
function MedSupSectionTPMO() {
  const { state, dispatch, activeSection } = useMedSup();
  const isActive = activeSection === 2;

  return (
    <CollapsibleMedSupSection
      sectionNum={2}
      label="TPMO Disclosure"
      isCompleted={state.tpmoOk}
      isActive={isActive}
      duration={
        state.sectionTimestamps[2]
          ? state.sectionTimestamps[2].end - state.sectionTimestamps[2].start
          : null
      }
    >
      <section
        className={`card ${isActive ? "active-card" : ""}`}
        style={isActive ? { borderColor: "rgba(248,113,113,0.4)" } : {}}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "#f87171",
              background: "rgba(248,113,113,0.08)",
              border: "1px solid rgba(248,113,113,0.25)",
              borderRadius: 4,
              padding: "3px 8px",
            }}
          >
            02
          </span>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            TPMO Disclosure
          </h3>
          <ComplianceBadge />
        </div>

        <div
          style={{
            background: "rgba(248,113,113,0.06)",
            border: "1px solid rgba(248,113,113,0.2)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 12,
            fontSize: 12,
            color: "#f87171",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.05em",
          }}
        >
          🔴 READ VERBATIM — Do not paraphrase, summarize, or skip
        </div>

        <ScriptLine text="We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options." />
        <AgentNote text="Log 'TPMO delivered' in CRM immediately after reading." />

        <SectionGate
          label="TPMO delivered verbatim"
          completed={state.tpmoOk}
          onComplete={() => {
            dispatch({ type: "START_SECTION", sectionNum: 2 });
            dispatch({
              type: "COMPLETE_SECTION",
              key: "tpmoOk",
              sectionNum: 2,
            });
          }}
          onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "tpmoOk" })}
        />
      </section>
    </CollapsibleMedSupSection>
  );
}

/* ─── Section 3 — Qualification ────────────────────────────────────────────── */
function MedSupSectionQual() {
  const { state, dispatch, activeSection } = useMedSup();
  const isActive = activeSection === 3;
  const sec = MEDSUP_SECTIONS[2];

  return (
    <CollapsibleMedSupSection
      sectionNum={3}
      label="Qualification"
      isCompleted={state.qualOk}
      isActive={isActive}
      duration={
        state.sectionTimestamps[3]
          ? state.sectionTimestamps[3].end - state.sectionTimestamps[3].start
          : null
      }
    >
      <section
        className={`card ${isActive ? "active-card" : ""}`}
        style={isActive ? { borderColor: "var(--border-active)" } : {}}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--accent-cyan)",
              background: "rgba(56,189,248,0.08)",
              border: "1px solid rgba(56,189,248,0.2)",
              borderRadius: 4,
              padding: "3px 8px",
            }}
          >
            03
          </span>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            Qualification
          </h3>
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
              marginLeft: "auto",
            }}
          >
            3 questions · ~90 sec
          </span>
        </div>

        <div
          style={{
            background: "rgba(251,191,36,0.06)",
            border: "1px solid rgba(251,191,36,0.2)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: 12.5,
            color: "#fbbf24",
          }}
        >
          ⚠ Do not skip — qualifies enrollment eligibility for every caller
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { label: "Q1 — Age / Medicare Status", idx: 1 },
            { label: "Q2 — State of Residence", idx: 2 },
            { label: "Q3 — Current Coverage Type", idx: 3 },
          ].map(({ label, idx }) => (
            <div key={idx}>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--accent-cyan)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                {label}
              </div>
              <ScriptLine text={sec.script[idx]} />
              <AgentNote text={sec.notes[idx - 1]} />
            </div>
          ))}
        </div>

        <ScriptLine text={sec.script[4]} />

        <SectionGate
          label="Caller qualified — Part A+B confirmed, state confirmed, coverage type known"
          completed={state.qualOk}
          onComplete={() => {
            dispatch({ type: "START_SECTION", sectionNum: 3 });
            dispatch({
              type: "COMPLETE_SECTION",
              key: "qualOk",
              sectionNum: 3,
            });
          }}
          onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "qualOk" })}
        />
      </section>
    </CollapsibleMedSupSection>
  );
}

/* ─── Section 4 — Branch ────────────────────────────────────────────────────── */
function MedSupSectionBranch() {
  const { state, dispatch, activeSection } = useMedSup();
  const isActive = activeSection === 4;
  const sec = MEDSUP_SECTIONS[3];
  const [activeBranchId, setActiveBranchId] = useState(
    state.selectedBranch || null
  );

  const activeBranch = sec.branches.find((b) => b.id === activeBranchId);

  const selectBranch = (id) => {
    setActiveBranchId(id);
    dispatch({ type: "SELECT_BRANCH", branch: id });
  };

  return (
    <CollapsibleMedSupSection
      sectionNum={4}
      label={
        activeBranch
          ? `Branch: ${activeBranch.label}`
          : "Branch: Needs Discovery"
      }
      isCompleted={state.branchOk}
      isActive={isActive}
      duration={
        state.sectionTimestamps[4]
          ? state.sectionTimestamps[4].end - state.sectionTimestamps[4].start
          : null
      }
    >
      <section
        className={`card ${isActive ? "active-card" : ""}`}
        style={
          isActive
            ? {
                borderColor: activeBranch
                  ? `${activeBranch.color}55`
                  : "var(--border-active)",
              }
            : {}
        }
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: activeBranch ? activeBranch.color : "var(--accent-cyan)",
              background: activeBranch
                ? `${activeBranch.color}14`
                : "rgba(56,189,248,0.08)",
              border: `1px solid ${
                activeBranch
                  ? activeBranch.color + "33"
                  : "rgba(56,189,248,0.2)"
              }`,
              borderRadius: 4,
              padding: "3px 8px",
              transition: "all 0.25s ease",
            }}
          >
            04
          </span>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            Needs Discovery
          </h3>
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
              marginLeft: "auto",
            }}
          >
            Select caller&apos;s branch
          </span>
        </div>

        {/* Branch selector */}
        {!activeBranch && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 8,
              marginBottom: 16,
            }}
          >
            {sec.branches.map((branch) => (
              <button
                key={branch.id}
                onClick={() => selectBranch(branch.id)}
                style={{
                  background: `${branch.color}0a`,
                  border: `1px solid ${branch.color}33`,
                  borderLeft: `4px solid ${branch.color}`,
                  borderRadius: 10,
                  padding: "14px 16px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${branch.color}18`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = `${branch.color}0a`;
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: branch.color,
                    marginBottom: 4,
                  }}
                >
                  {branch.label}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                  }}
                >
                  {branch.trigger}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Active branch content */}
        {activeBranch && (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeBranch.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* Branch header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 14,
                  padding: "10px 14px",
                  background: `${activeBranch.color}0a`,
                  border: `1px solid ${activeBranch.color}33`,
                  borderRadius: 8,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: activeBranch.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: activeBranch.color,
                  }}
                >
                  {activeBranch.label}
                </span>
                {activeBranch.compliance && <ComplianceBadge />}
                <button
                  onClick={() => {
                    setActiveBranchId(null);
                    dispatch({ type: "SELECT_BRANCH", branch: null });
                  }}
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 6,
                    color: "var(--text-muted)",
                    padding: "3px 9px",
                    cursor: "pointer",
                  }}
                >
                  ← Change
                </button>
              </div>

              {activeBranch.script.map((line, i) => (
                <ScriptLine key={i} text={line} />
              ))}

              {activeBranch.notes.map((note, i) => (
                <AgentNote key={i} text={note} />
              ))}
            </motion.div>
          </AnimatePresence>
        )}

        <SectionGate
          label="Branch completed — plan identified, quote given"
          completed={state.branchOk}
          onComplete={() => {
            dispatch({ type: "START_SECTION", sectionNum: 4 });
            dispatch({
              type: "COMPLETE_SECTION",
              key: "branchOk",
              sectionNum: 4,
            });
          }}
          onUndo={() =>
            dispatch({ type: "UNCOMPLETE_SECTION", key: "branchOk" })
          }
        />
      </section>
    </CollapsibleMedSupSection>
  );
}

/* ─── Section 5 — Objections (collapsible reference) ───────────────────────── */
function MedSupSectionObjections() {
  const sec = MEDSUP_SECTIONS[4];
  const [open, setOpen] = useState(null);

  return (
    <section className="card" style={{ opacity: 0.9 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "#fbbf24",
            background: "rgba(251,191,36,0.08)",
            border: "1px solid rgba(251,191,36,0.2)",
            borderRadius: 4,
            padding: "3px 8px",
          }}
        >
          05
        </span>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          Objection Handling
        </h3>
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
            marginLeft: "auto",
          }}
        >
          Optional — use as needed
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sec.objections.map((obj, i) => (
          <div
            key={i}
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => setOpen(open === i ? null : i)}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                padding: "11px 14px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
                textAlign: "left",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "#f87171",
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.2)",
                  borderRadius: 3,
                  padding: "2px 6px",
                  flexShrink: 0,
                }}
              >
                OBJECTION
              </span>
              <span
                style={{
                  fontSize: 13.5,
                  color: "var(--text-primary)",
                  fontWeight: 500,
                  flex: 1,
                }}
              >
                &ldquo;{obj.trigger}&rdquo;
              </span>
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: 12,
                  transform: open === i ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s",
                }}
              >
                ▾
              </span>
            </button>

            {open === i && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ padding: "0 14px 14px" }}
              >
                <ScriptLine text={obj.response} />
                {obj.tip && <AgentNote text={obj.tip} />}
              </motion.div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Section 6 — Close & Enrollment ───────────────────────────────────────── */
function MedSupSectionEnroll() {
  const { state, dispatch, activeSection } = useMedSup();
  const isActive = activeSection === 6;
  const sec = MEDSUP_SECTIONS[5];
  const [closeMode, setCloseMode] = useState("enroll"); // "enroll" | "followup"

  return (
    <CollapsibleMedSupSection
      sectionNum={6}
      label="Close & Enrollment"
      isCompleted={state.enrollOk}
      isActive={isActive}
      duration={
        state.sectionTimestamps[6]
          ? state.sectionTimestamps[6].end - state.sectionTimestamps[6].start
          : null
      }
    >
      <section
        className={`card ${isActive ? "active-card" : ""}`}
        style={isActive ? { borderColor: "rgba(52,211,153,0.3)" } : {}}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "#34d399",
              background: "rgba(52,211,153,0.08)",
              border: "1px solid rgba(52,211,153,0.2)",
              borderRadius: 4,
              padding: "3px 8px",
            }}
          >
            06
          </span>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            Close &amp; Enrollment
          </h3>
        </div>

        {/* Close mode toggle */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 16,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            padding: 4,
          }}
        >
          {[
            { id: "enroll", label: "Enrolling Now" },
            { id: "followup", label: "Follow-Up Needed" },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setCloseMode(id)}
              style={{
                flex: 1,
                padding: "7px 12px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: 600,
                transition: "all 0.15s ease",
                background:
                  closeMode === id
                    ? id === "enroll"
                      ? "rgba(52,211,153,0.15)"
                      : "rgba(251,191,36,0.12)"
                    : "transparent",
                color:
                  closeMode === id
                    ? id === "enroll"
                      ? "#34d399"
                      : "#fbbf24"
                    : "var(--text-muted)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {closeMode === "enroll"
          ? sec.script.map((line, i) => <ScriptLine key={i} text={line} />)
          : sec.followUpScript.map((line, i) => (
              <ScriptLine key={i} text={line} />
            ))}

        {sec.notes.map((note, i) => (
          <AgentNote key={i} text={note} />
        ))}

        {/* CRM Checklist */}
        <div
          style={{
            marginTop: 16,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10,
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            CRM Log Checklist — complete within 5 min
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {sec.crmChecklist.map((item) => {
              const checked = state.crmChecked.includes(item);
              return (
                <label
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    cursor: "pointer",
                    fontSize: 13,
                    color: checked
                      ? "var(--text-muted)"
                      : "var(--text-secondary)",
                    textDecoration: checked ? "line-through" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => dispatch({ type: "TOGGLE_CRM_ITEM", item })}
                    style={{ marginTop: 2, accentColor: "var(--accent-cyan)" }}
                  />
                  {item}
                </label>
              );
            })}
          </div>
        </div>

        <SectionGate
          label="Enrolled or follow-up scheduled and logged"
          completed={state.enrollOk}
          onComplete={() => {
            dispatch({ type: "START_SECTION", sectionNum: 6 });
            dispatch({
              type: "COMPLETE_SECTION",
              key: "enrollOk",
              sectionNum: 6,
            });
          }}
          onUndo={() =>
            dispatch({ type: "UNCOMPLETE_SECTION", key: "enrollOk" })
          }
        />
      </section>
    </CollapsibleMedSupSection>
  );
}

/* ─── Section 7 — Wrap-Up ───────────────────────────────────────────────────── */
function MedSupSectionWrapUp() {
  const { state, dispatch, activeSection } = useMedSup();
  const isActive = activeSection === 7;
  const sec = MEDSUP_SECTIONS[6];

  return (
    <section
      className={`card ${isActive ? "active-card" : ""}`}
      style={
        isActive
          ? { borderColor: "rgba(248,113,113,0.4)" }
          : { opacity: state.wrapOk ? 0.7 : 1 }
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "#f87171",
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.25)",
            borderRadius: 4,
            padding: "3px 8px",
          }}
        >
          07
        </span>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          Compliance Wrap-Up
        </h3>
        <ComplianceBadge />
      </div>

      <div
        style={{
          background: "rgba(248,113,113,0.06)",
          border: "1px solid rgba(248,113,113,0.2)",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 12,
          fontSize: 12,
          color: "#f87171",
          fontFamily: "var(--font-mono)",
        }}
      >
        🔴 MANDATORY on every call — TPMO must be re-delivered verbatim
      </div>

      {sec.script.map((line, i) => (
        <ScriptLine key={i} text={line} />
      ))}
      {sec.notes.map((note, i) => (
        <AgentNote key={i} text={note} />
      ))}

      <SectionGate
        label="Wrap-up complete, TPMO re-delivered"
        completed={state.wrapOk}
        onComplete={() => {
          dispatch({ type: "START_SECTION", sectionNum: 7 });
          dispatch({ type: "COMPLETE_SECTION", key: "wrapOk", sectionNum: 7 });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "wrapOk" })}
      />

      {state.wrapOk && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginTop: 16,
            textAlign: "center",
            padding: "20px",
            background: "rgba(52,211,153,0.06)",
            border: "1px solid rgba(52,211,153,0.2)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#34d399" }}>
            Call Complete
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 4,
            }}
          >
            All sections completed for this Med Sup call.
          </div>
          <button
            onClick={() => dispatch({ type: "RESET" })}
            style={{
              marginTop: 14,
              background: "rgba(52,211,153,0.1)",
              border: "1px solid rgba(52,211,153,0.25)",
              borderRadius: 8,
              color: "#34d399",
              padding: "8px 20px",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Start New Call
          </button>
        </motion.div>
      )}
    </section>
  );
}

/* ─── Progress Bar ──────────────────────────────────────────────────────────── */
function MedSupProgressBar() {
  const { state, activeSection } = useMedSup();
  const total = 7;
  const completed = [
    state.recordingOk,
    state.tpmoOk,
    state.qualOk,
    state.branchOk,
    true, // objections optional
    state.enrollOk,
    state.wrapOk,
  ].filter(Boolean).length;

  const pct = Math.round((completed / total) * 100);

  return (
    <div
      style={{
        marginBottom: 20,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        padding: "12px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
            letterSpacing: "0.1em",
          }}
        >
          MED SUP CALL — SECTION {activeSection} / {total}
        </span>
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--accent-cyan)",
          }}
        >
          {pct}%
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <motion.div
          style={{
            height: "100%",
            background: "var(--accent-cyan)",
            borderRadius: 2,
          }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      <div
        style={{
          display: "flex",
          gap: 4,
          marginTop: 8,
          flexWrap: "wrap",
        }}
      >
        {[
          "Recording",
          "TPMO",
          "Qual",
          "Branch",
          "Objections",
          "Enroll",
          "Wrap-Up",
        ].map((label, i) => {
          const keys = [
            "recordingOk",
            "tpmoOk",
            "qualOk",
            "branchOk",
            "objectionOk",
            "enrollOk",
            "wrapOk",
          ];
          const done = state[keys[i]];
          const active = activeSection === i + 1;
          return (
            <span
              key={label}
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                padding: "2px 7px",
                borderRadius: 4,
                background: done
                  ? "rgba(52,211,153,0.1)"
                  : active
                  ? "rgba(56,189,248,0.1)"
                  : "rgba(255,255,255,0.03)",
                color: done
                  ? "#34d399"
                  : active
                  ? "var(--accent-cyan)"
                  : "var(--text-muted)",
                border: `1px solid ${
                  done
                    ? "rgba(52,211,153,0.2)"
                    : active
                    ? "rgba(56,189,248,0.2)"
                    : "rgba(255,255,255,0.05)"
                }`,
              }}
            >
              {done ? "✓ " : active ? "● " : ""}
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ─── MedSupFlow (root export) ─────────────────────────────────────────────── */
export default function MedSupFlow() {
  const { state, activeSection } = useMedSup();

  // Auto-scroll to active section
  const prevActive = useRef(activeSection);
  useEffect(() => {
    if (activeSection !== prevActive.current) {
      prevActive.current = activeSection;
      requestAnimationFrame(() => {
        setTimeout(() => {
          const el = document.querySelector(".active-card");
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      });
    }
  }, [activeSection]);

  return (
    <motion.div
      className="flow"
      initial={{ opacity: 0, y: 30, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <MedSupProgressBar />

      <MedSupSectionRecording />
      <MedSupSectionTPMO />
      <MedSupSectionQual />
      <MedSupSectionBranch />
      <MedSupSectionObjections />
      <MedSupSectionEnroll />
      <MedSupSectionWrapUp />
    </motion.div>
  );
}
