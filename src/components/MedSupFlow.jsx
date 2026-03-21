/**
 * MedSupFlow.jsx — Clean Med Sup Script Flow
 * No objections. No agent instructions. Just script + gates.
 * Drop into: src/components/MedSupFlow.jsx
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMedSup } from "../context/MedSupContext";
import { MEDSUP_SECTIONS } from "../context/MedSupScript";

function fmt(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Say({ text }) {
  return (
    <div
      style={{
        borderLeft: "2px solid rgba(74,222,128,0.3)",
        padding: "10px 16px",
        marginBottom: 8,
        borderRadius: "0 6px 6px 0",
      }}
    >
      <div
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
      style={{
        marginTop: 16,
        paddingTop: 14,
        borderTop: "1px solid rgba(255,255,255,0.04)",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <label
        className="check"
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
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => (e.target.checked ? onDo() : onUndo())}
          style={{
            margin: 0,
          }}
        />
        {label}
      </label>
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
  return (
    <section
      className={active ? "active-card" : ""}
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

function S1() {
  const { state, dispatch, activeSection } = useMedSup();
  const sec = MEDSUP_SECTIONS[0];
  const d = state.sectionTimestamps[1];
  return (
    <Card
      num={1}
      title="Recording Disclosure"
      active={activeSection === 1}
      done={state.recordingOk}
      dur={d ? d.end - d.start : null}
    >
      {sec.script.map((l, i) => (
        <Say key={i} text={l} />
      ))}
      <Gate
        label="Consent confirmed"
        done={state.recordingOk}
        onDo={() => {
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
    </Card>
  );
}

function S2() {
  const { state, dispatch, activeSection } = useMedSup();
  const d = state.sectionTimestamps[2];
  return (
    <Card
      num={2}
      title="TPMO Disclosure"
      red
      active={activeSection === 2}
      done={state.tpmoOk}
      dur={d ? d.end - d.start : null}
    >
      <div
        style={{
          background: "rgba(248,113,113,0.06)",
          border: "1px solid rgba(248,113,113,0.15)",
          borderRadius: 6,
          padding: "8px 12px",
          marginBottom: 12,
          fontSize: 12,
          color: "#f87171",
        }}
      >
        Read verbatim — do not paraphrase
      </div>
      <Say text="We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options." />
      <Gate
        label="TPMO delivered"
        done={state.tpmoOk}
        onDo={() => {
          dispatch({ type: "START_SECTION", sectionNum: 2 });
          dispatch({ type: "COMPLETE_SECTION", key: "tpmoOk", sectionNum: 2 });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "tpmoOk" })}
      />
    </Card>
  );
}

function S3() {
  const { state, dispatch, activeSection } = useMedSup();
  const sec = MEDSUP_SECTIONS[2];
  const d = state.sectionTimestamps[3];
  return (
    <Card
      num={3}
      title="Qualification"
      active={activeSection === 3}
      done={state.qualOk}
      dur={d ? d.end - d.start : null}
    >
      {[1, 2, 3].map((idx) => (
        <div key={idx} style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#4ade80",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 4,
              opacity: 0.6,
            }}
          >
            Q{idx}
          </div>
          <Say text={sec.script[idx]} />
        </div>
      ))}
      <Say text={sec.script[4]} />
      <Gate
        label="Caller qualified"
        done={state.qualOk}
        onDo={() => {
          dispatch({ type: "START_SECTION", sectionNum: 3 });
          dispatch({ type: "COMPLETE_SECTION", key: "qualOk", sectionNum: 3 });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "qualOk" })}
      />
    </Card>
  );
}

function S4() {
  const { state, dispatch, activeSection } = useMedSup();
  const sec = MEDSUP_SECTIONS[3];
  const [bid, setBid] = useState(state.selectedBranch || null);
  const branch = sec.branches.find((b) => b.id === bid);
  const d = state.sectionTimestamps[4];
  return (
    <Card
      num={4}
      title={branch ? branch.label : "Needs Discovery"}
      active={activeSection === 4}
      done={state.branchOk}
      dur={d ? d.end - d.start : null}
      red={branch?.compliance}
    >
      {!branch && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sec.branches.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                setBid(b.id);
                dispatch({ type: "SELECT_BRANCH", branch: b.id });
              }}
              style={{
                background: `${b.color}06`,
                border: `1px solid ${b.color}20`,
                borderLeft: `3px solid ${b.color}`,
                borderRadius: 8,
                padding: "12px 14px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: b.color }}>
                {b.label}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#6b7a8d",
                  fontStyle: "normal",
                  marginTop: 2,
                }}
              >
                {b.trigger}
              </div>
            </button>
          ))}
        </div>
      )}
      {branch && (
        <AnimatePresence mode="wait">
          <motion.div
            key={branch.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
                padding: "8px 12px",
                background: `${branch.color}08`,
                border: `1px solid ${branch.color}18`,
                borderRadius: 6,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: branch.color,
                }}
              />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: branch.color,
                  flex: 1,
                }}
              >
                {branch.label}
              </span>
              <button
                onClick={() => {
                  setBid(null);
                  dispatch({ type: "SELECT_BRANCH", branch: null });
                }}
                style={{
                  fontSize: 11,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 5,
                  color: "#4a5568",
                  padding: "3px 8px",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                Change
              </button>
            </div>
            {branch.script.map((l, i) => (
              <Say key={i} text={l} />
            ))}
          </motion.div>
        </AnimatePresence>
      )}
      <Gate
        label="Branch completed"
        done={state.branchOk}
        onDo={() => {
          dispatch({ type: "START_SECTION", sectionNum: 4 });
          dispatch({
            type: "COMPLETE_SECTION",
            key: "branchOk",
            sectionNum: 4,
          });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "branchOk" })}
      />
    </Card>
  );
}

function S6() {
  const { state, dispatch, activeSection } = useMedSup();
  const sec = MEDSUP_SECTIONS[5];
  const [mode, setMode] = useState("enroll");
  const d = state.sectionTimestamps[6];
  return (
    <Card
      num={5}
      title="Close & Enrollment"
      active={activeSection === 6}
      done={state.enrollOk}
      dur={d ? d.end - d.start : null}
    >
      <div
        style={{
          display: "flex",
          gap: 3,
          marginBottom: 14,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.04)",
          borderRadius: 6,
          padding: 3,
        }}
      >
        {[
          { id: "enroll", label: "Enrolling", c: "#34d399" },
          { id: "followup", label: "Follow-Up", c: "#fbbf24" },
        ].map(({ id, label, c }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            style={{
              flex: 1,
              padding: "7px 12px",
              borderRadius: 5,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--font-body)",
              background: mode === id ? `${c}12` : "transparent",
              color: mode === id ? c : "#4a5568",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {(mode === "enroll" ? sec.script : sec.followUpScript).map((l, i) => (
        <Say key={i} text={l} />
      ))}
      <Gate
        label="Enrolled or follow-up logged"
        done={state.enrollOk}
        onDo={() => {
          dispatch({ type: "START_SECTION", sectionNum: 6 });
          dispatch({
            type: "COMPLETE_SECTION",
            key: "enrollOk",
            sectionNum: 6,
          });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "enrollOk" })}
      />
    </Card>
  );
}

function S7() {
  const { state, dispatch, activeSection } = useMedSup();
  const sec = MEDSUP_SECTIONS[6];
  return (
    <Card
      num={6}
      title="Compliance Wrap-Up"
      red
      active={activeSection === 7}
      done={state.wrapOk}
    >
      <div
        style={{
          background: "rgba(248,113,113,0.06)",
          border: "1px solid rgba(248,113,113,0.15)",
          borderRadius: 6,
          padding: "8px 12px",
          marginBottom: 12,
          fontSize: 12,
          color: "#f87171",
        }}
      >
        Re-deliver TPMO verbatim before ending call
      </div>
      {sec.script.map((l, i) => (
        <Say key={i} text={l} />
      ))}
      <Gate
        label="Wrap-up complete"
        done={state.wrapOk}
        onDo={() => {
          dispatch({ type: "START_SECTION", sectionNum: 7 });
          dispatch({ type: "COMPLETE_SECTION", key: "wrapOk", sectionNum: 7 });
        }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "wrapOk" })}
      />
      {state.wrapOk && (
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

function Progress() {
  const { state, activeSection } = useMedSup();
  const steps = [
    { k: "recordingOk", l: "Record" },
    { k: "tpmoOk", l: "TPMO" },
    { k: "qualOk", l: "Qualify" },
    { k: "branchOk", l: "Discovery" },
    { k: "enrollOk", l: "Enroll" },
    { k: "wrapOk", l: "Wrap-Up" },
  ];
  const done = steps.filter((s) => state[s.k]).length;
  const pct = Math.round((done / steps.length) * 100);
  const activeIdx =
    activeSection <= 4
      ? activeSection - 1
      : activeSection <= 5
      ? 3
      : activeSection - 2;
  return (
    <div
      style={{
        marginBottom: 14,
        padding: "12px 16px",
        background: "rgba(255,255,255,0.018)",
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "#4a5568",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Med Sup Call
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#4ade80",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {pct}%
        </span>
      </div>
      <div
        style={{
          height: 3,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 2,
          overflow: "hidden",
          marginBottom: 8,
        }}
      >
        <motion.div
          style={{ height: "100%", background: "#4ade80", borderRadius: 2 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {steps.map((s, i) => {
          const d = state[s.k];
          const a = i === activeIdx;
          return (
            <span
              key={s.k}
              style={{
                fontSize: 10,
                fontWeight: 500,
                padding: "2px 7px",
                borderRadius: 4,
                background: d
                  ? "rgba(52,211,153,0.06)"
                  : a
                  ? "rgba(74,222,128,0.06)"
                  : "rgba(255,255,255,0.015)",
                color: d ? "#34d399" : a ? "#4ade80" : "#4a5568",
                border: `1px solid ${
                  d
                    ? "rgba(52,211,153,0.12)"
                    : a
                    ? "rgba(74,222,128,0.12)"
                    : "rgba(255,255,255,0.03)"
                }`,
              }}
            >
              {d ? "✓ " : a ? "● " : ""}
              {s.l}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function MedSupFlow() {
  const { state, dispatch, activeSection } = useMedSup();
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
      <Progress />

      {!state.callStarted ? (
        <section style={{ background: "rgba(74,222,128,0.04)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 10, padding: "28px 20px", textAlign: "center", marginBottom: 10 }}>
          <button className="primary" onClick={() => dispatch({ type: "START_CALL" })} style={{
            fontSize: 15, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 36px",
            background: "linear-gradient(145deg, rgba(74,222,128,0.15), rgba(74,222,128,0.05))", border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80", borderRadius: 8, cursor: "pointer",
          }}>
            Start Call
          </button>
          <p style={{ marginTop: 10, fontSize: 11, color: "#4a5568" }}>Timer begins when you click Start Call</p>
        </section>
      ) : (
        <>
          <S1 />
          <S2 />
          <S3 />
          <S4 />
          <S6 />
          <S7 />
        </>
      )}
    </motion.div>
  );
}
