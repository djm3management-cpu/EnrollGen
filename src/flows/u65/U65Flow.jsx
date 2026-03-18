/**
 * U65Flow.jsx — U65 Off-Exchange Script Flow
 * Gates 0–7 — Two products: EnrollPrime + PALIC
 * F1 pit wall dark theme, purple accent
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useU65 } from "./U65Context";
import { U65_GATES } from "./U65Data";
import U65ProductMatrix from "./U65ProductMatrix";

const ACCENT = "#a855f7";

function fmt(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Say({ text }) {
  return (
    <div style={{ borderLeft: "2px solid rgba(168,85,247,0.3)", padding: "10px 16px", marginBottom: 8, borderRadius: "0 6px 6px 0" }}>
      <div style={{ color: "#c0d0e4", fontSize: 14, lineHeight: 1.65 }}>{text}</div>
    </div>
  );
}

function Note({ text }) {
  return (
    <div style={{ borderLeft: "2px solid rgba(168,85,247,0.2)", padding: "7px 12px", marginBottom: 6, borderRadius: "0 5px 5px 0", background: "rgba(168,85,247,0.03)" }}>
      <div style={{ color: "#7b6e8d", fontSize: 12, lineHeight: 1.5, fontStyle: "italic" }}>{text}</div>
    </div>
  );
}

function ComplianceBanner({ text }) {
  return (
    <div style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 6, padding: "9px 13px", marginBottom: 10, fontSize: 12, color: "#f87171", lineHeight: 1.5 }}>
      {text}
    </div>
  );
}

function SignalBadge({ text }) {
  return (
    <div style={{ display: "inline-block", fontSize: 10, fontWeight: 600, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.18)", color: ACCENT, borderRadius: 4, padding: "2px 8px", marginRight: 4, marginBottom: 4, letterSpacing: "0.04em" }}>
      {text}
    </div>
  );
}

function Gate({ label, done, onDo, onUndo }) {
  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", justifyContent: "center" }}>
      <label className="check" style={{ justifyContent: "center", width: "fit-content", minWidth: 260, padding: "10px 14px", border: `1px solid ${done ? "rgba(52,211,153,0.2)" : "rgba(168,85,247,0.15)"}`, background: done ? "rgba(52,211,153,0.05)" : "rgba(255,255,255,0.015)", color: done ? "#34d399" : "#dfe6f0" }}>
        <input type="checkbox" checked={done} onChange={(e) => (e.target.checked ? onDo() : onUndo())} style={{ margin: 0 }} />
        {label}
      </label>
    </div>
  );
}

function Card({ num, title, red, active, done, dur, children }) {
  if (done && !active) {
    return (
      <details style={{ marginBottom: 10 }}>
        <summary style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(52,211,153,0.03)", border: "1px solid rgba(52,211,153,0.1)", borderRadius: 10, cursor: "pointer", listStyle: "none", fontSize: 13, color: "#6b7a8d" }}>
          <span style={{ color: "#34d399" }}>✓</span>
          <span style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, color: "#4a5568", marginRight: 8, fontSize: 11 }}>G{String(num).padStart(2, "0")}</span>
            {title}
          </span>
          {dur && <span style={{ fontSize: 11, color: "#4a5568", fontVariantNumeric: "tabular-nums" }}>{fmt(dur)}</span>}
        </summary>
        <div style={{ paddingTop: 6 }}>{children}</div>
      </details>
    );
  }

  return (
    <motion.section
      className={active ? "active-card" : ""}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        background: active ? "rgba(168,85,247,0.04)" : "rgba(255,255,255,0.018)",
        border: `1px solid ${active ? "rgba(168,85,247,0.3)" : "rgba(255,255,255,0.05)"}`,
        borderRadius: 10, padding: "20px 18px", marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: red ? "#f87171" : active ? ACCENT : "#4a5568", background: red ? "rgba(248,113,113,0.08)" : active ? "rgba(168,85,247,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${red ? "rgba(248,113,113,0.2)" : active ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.05)"}`, borderRadius: 5, padding: "3px 8px", fontVariantNumeric: "tabular-nums" }}>
          G{String(num).padStart(2, "0")}
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#dfe6f0" }}>{title}</span>
        {red && (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171", borderRadius: 4, padding: "2px 7px", marginLeft: "auto", textTransform: "uppercase" }}>
            Compliance
          </span>
        )}
      </div>
      {children}
    </motion.section>
  );
}

// ─── SUBSIDY CLIFF CALCULATOR ──────────────────────────────────────────────
function SubsidyCliffCalc() {
  const { state, dispatch } = useU65();
  const { subsidyCalc } = state;

  const set = (field, val) => {
    const num = val === "" ? null : Number(val);
    dispatch({ type: "SET_SUBSIDY_CALC", [field]: num });
  };

  const inputStyle = {
    width: "100%", padding: "7px 10px", borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)",
    color: "#c0d0e4", fontSize: 13, fontFamily: "var(--font-body)",
    outline: "none", boxSizing: "border-box",
  };

  const { fplPercent, aboveCliff, acaEstimate, fplThreshold } = subsidyCalc;
  const hasResult = fplPercent !== null;

  return (
    <div style={{ background: "rgba(168,85,247,0.03)", border: "1px solid rgba(168,85,247,0.15)", borderRadius: 8, padding: "14px 16px", marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
        2026 Subsidy Cliff Calculator
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 10, color: "#6b7a8d", display: "block", marginBottom: 3 }}>Household Size</label>
          <input type="number" min="1" max="10" value={subsidyCalc.householdSize || ""} onChange={(e) => set("householdSize", e.target.value)} style={inputStyle} placeholder="1" />
        </div>
        <div>
          <label style={{ fontSize: 10, color: "#6b7a8d", display: "block", marginBottom: 3 }}>Annual Income ($)</label>
          <input type="number" min="0" value={subsidyCalc.annualIncome || ""} onChange={(e) => set("annualIncome", e.target.value)} style={inputStyle} placeholder="65,000" />
        </div>
        <div>
          <label style={{ fontSize: 10, color: "#6b7a8d", display: "block", marginBottom: 3 }}>Client Age</label>
          <input type="number" min="18" max="64" value={subsidyCalc.clientAge || ""} onChange={(e) => set("clientAge", e.target.value)} style={inputStyle} placeholder="45" />
        </div>
      </div>

      {hasResult && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          {/* Cliff gradient bar */}
          <div style={{ position: "relative", height: 28, borderRadius: 6, overflow: "hidden", marginBottom: 10, background: "linear-gradient(90deg, rgba(52,211,153,0.15) 0%, rgba(52,211,153,0.25) 60%, rgba(234,179,8,0.3) 75%, rgba(248,113,113,0.35) 100%)" }}>
            <div style={{ position: "absolute", left: "75%", top: 0, bottom: 0, width: 2, background: "#f87171", zIndex: 2 }} />
            <div style={{ position: "absolute", left: "75%", top: -2, fontSize: 8, color: "#f87171", fontWeight: 700, transform: "translateX(-50%)", whiteSpace: "nowrap" }}>400% FPL</div>
            <div style={{
              position: "absolute", left: `${Math.min(Math.max((fplPercent / 600) * 100, 2), 98)}%`, top: 8,
              width: 12, height: 12, borderRadius: "50%",
              background: aboveCliff ? "#f87171" : "#34d399",
              border: "2px solid #0c1017",
              boxShadow: `0 0 8px ${aboveCliff ? "rgba(248,113,113,0.6)" : "rgba(52,211,153,0.6)"}`,
              transform: "translateX(-50%)", zIndex: 3,
            }} />
          </div>

          <div style={{
            padding: "10px 14px", borderRadius: 7, marginBottom: 8,
            background: aboveCliff ? "rgba(248,113,113,0.06)" : "rgba(52,211,153,0.06)",
            border: `1px solid ${aboveCliff ? "rgba(248,113,113,0.2)" : "rgba(52,211,153,0.2)"}`,
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: aboveCliff ? "#f87171" : "#34d399", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}>
              {fplPercent}% FPL
            </div>
            <div style={{ fontSize: 12, color: aboveCliff ? "#f87171" : "#34d399", marginTop: 2, fontWeight: 600 }}>
              {aboveCliff
                ? "SUBSIDY CLIFF — No premium tax credits at this income level"
                : "Has subsidy — ACA marketplace may be competitive"
              }
            </div>
            <div style={{ fontSize: 11, color: "#6b7a8d", marginTop: 4 }}>
              400% FPL threshold: ${(fplThreshold * 4).toLocaleString()}/year for household of {subsidyCalc.householdSize}
            </div>
          </div>

          {aboveCliff && acaEstimate && (
            <div style={{ padding: "10px 14px", borderRadius: 7, background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.12)" }}>
              <div style={{ fontSize: 11, color: "#f87171", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                Unsubsidized ACA Estimate (age {subsidyCalc.clientAge})
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#f87171", fontFamily: "'Barlow Condensed', sans-serif" }}>
                ${acaEstimate.low}–${acaEstimate.high}/month
              </div>
              <div style={{ fontSize: 11, color: "#8fa4bc", marginTop: 4 }}>
                Off-exchange plans typically $150–$400/month — potential savings of ${acaEstimate.low - 400}–${acaEstimate.high - 150}/month
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ─── PRODUCT RECOMMENDATION PANEL ─────────────────────────────────────────
function ProductRecommendation() {
  const { state } = useU65();
  const { productRecommendation, uwRisk } = state;
  if (!productRecommendation) return null;

  const riskColors = { low: "#34d399", moderate: "#fbbf24", high: "#f87171" };
  const riskColor = riskColors[uwRisk] || "#4a5568";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ marginBottom: 10, padding: "14px 16px", background: "rgba(168,85,247,0.03)", border: "1px solid rgba(168,85,247,0.15)", borderRadius: 10 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: ACCENT, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Smart Product Routing
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          padding: "2px 8px", borderRadius: 4,
          background: `${riskColor}15`, border: `1px solid ${riskColor}30`, color: riskColor,
          boxShadow: `0 0 6px ${riskColor}20`,
        }}>
          {uwRisk} risk
        </span>
      </div>

      {productRecommendation.map((rec) => {
        const isAcaPivot = rec.id === "aca_pivot";
        return (
          <div key={rec.id} style={{
            display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px", marginBottom: 4,
            borderRadius: 6, borderLeft: `3px solid ${isAcaPivot ? "#EAB308" : rec.priority === 1 ? ACCENT : "rgba(255,255,255,0.08)"}`,
            background: isAcaPivot ? "rgba(234,179,8,0.05)" : rec.priority === 1 ? "rgba(168,85,247,0.04)" : "rgba(255,255,255,0.01)",
          }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: rec.priority === 1 ? ACCENT : "#4a5568", fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0, width: 18, textAlign: "center" }}>
              {rec.priority}
            </span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: isAcaPivot ? "#EAB308" : "#c0d0e4", marginBottom: 2 }}>
                {rec.id === "enrollprime" ? "EnrollPrime / AFI PPO" : rec.id === "palic" ? "PALIC HSP Gold" : "ACA Pivot"}
              </div>
              <div style={{ fontSize: 11, color: "#8fa4bc", lineHeight: 1.45 }}>{rec.reason}</div>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}

// ─── GATE 0 — Opening ────────────────────────────────────────────────────
function G0() {
  const { state, dispatch, activeGate } = useU65();
  const gate = U65_GATES[0];
  const d = state.sectionTimestamps[0];
  const isTransition = state.entrySource === "aca_transition";

  return (
    <Card num={0} title="Opening & Verification" active={activeGate === 0} done={state.gate0Ok} dur={d ? d.end - d.start : null}>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {["direct", "aca_transition"].map((src) => (
          <button key={src} onClick={() => dispatch({ type: "SET_ENTRY_SOURCE", source: src })} style={{
            flex: 1, padding: "7px 10px", borderRadius: 6,
            border: `1px solid ${state.entrySource === src ? "rgba(168,85,247,0.4)" : "rgba(255,255,255,0.06)"}`,
            background: state.entrySource === src ? "rgba(168,85,247,0.08)" : "rgba(255,255,255,0.02)",
            color: state.entrySource === src ? ACCENT : "#4a5568", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)",
          }}>
            {src === "direct" ? "Direct Call" : "ACA Transition"}
          </button>
        ))}
      </div>
      {isTransition ? <Say text={gate.script.transition} /> : gate.script.direct.map((l, i) => <Say key={i} text={l} />)}
      {gate.notes.map((n, i) => <Note key={i} text={n} />)}
      <Gate label="Identity verified — consent obtained" done={state.gate0Ok}
        onDo={() => { dispatch({ type: "START_SECTION", sectionNum: 0 }); dispatch({ type: "COMPLETE_SECTION", key: "gate0Ok", sectionNum: 0 }); }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "gate0Ok" })}
      />
    </Card>
  );
}

// ─── GATE 1 — Situation Assessment + Subsidy Cliff Calculator ─────────────
function G1() {
  const { state, dispatch, activeGate } = useU65();
  const gate = U65_GATES[1];
  const d = state.sectionTimestamps[1];

  return (
    <Card num={1} title="Situation Assessment" active={activeGate === 1} done={state.gate1Ok} dur={d ? d.end - d.start : null}>
      {gate.script.map((l, i) => <Say key={i} text={l} />)}
      <SubsidyCliffCalc />
      <Note text={gate.situationNote} />
      <Note text={gate.employmentNote} />
      <Note text={gate.anchorNote} />
      <div style={{ marginTop: 8 }}>
        {gate.signals.map((s, i) => <SignalBadge key={i} text={s} />)}
      </div>
      <Gate label="Situation assessed — coverage gap reason clear" done={state.gate1Ok}
        onDo={() => { dispatch({ type: "START_SECTION", sectionNum: 1 }); dispatch({ type: "COMPLETE_SECTION", key: "gate1Ok", sectionNum: 1 }); }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "gate1Ok" })}
      />
    </Card>
  );
}

// ─── GATE 2 — Health Profile & UW Pre-Screen ──────────────────────────────
function G2() {
  const { state, dispatch, activeGate } = useU65();
  const gate = U65_GATES[2];
  const d = state.sectionTimestamps[2];
  const riskColors = { low: "#34d399", moderate: "#fbbf24", high: "#f87171" };

  return (
    <Card num={2} title="Health Profile & Underwriting Pre-Screen" active={activeGate === 2} done={state.gate2Ok} dur={d ? d.end - d.start : null}>
      <ComplianceBanner text={gate.complianceNote} />
      {gate.script.map((l, i) => <Say key={i} text={l} />)}

      <div style={{ marginTop: 14, marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>UW Risk Matrix</div>
        {gate.uwRiskMatrix.map((row) => (
          <div key={row.level} style={{ border: `1px solid ${row.color}20`, borderLeft: `3px solid ${row.color}`, borderRadius: 7, padding: "10px 13px", marginBottom: 6, background: `${row.color}04` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: row.color, marginBottom: 3 }}>{row.level}</div>
            <div style={{ fontSize: 11, color: "#8fa4bc", marginBottom: 4 }}>{row.profile}</div>
            <div style={{ fontSize: 11, color: "#c0d0e4", fontStyle: "italic" }}>{row.path}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Set UW Risk Level</div>
        <div style={{ display: "flex", gap: 6 }}>
          {["low", "moderate", "high"].map((r) => (
            <button key={r} onClick={() => dispatch({ type: "SET_UW_RISK", risk: r })} style={{
              flex: 1, padding: "8px 6px", borderRadius: 6,
              border: `1px solid ${state.uwRisk === r ? `${riskColors[r]}60` : "rgba(255,255,255,0.06)"}`,
              background: state.uwRisk === r ? `${riskColors[r]}10` : "rgba(255,255,255,0.02)",
              color: state.uwRisk === r ? riskColors[r] : "#4a5568", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.08em",
            }}>
              {r}
            </button>
          ))}
        </div>
        {state.uwRisk && (
          <div style={{ marginTop: 8, fontSize: 11, color: riskColors[state.uwRisk], opacity: 0.8 }}>
            → {gate.uwRiskMatrix.find((r) => r.level.toLowerCase() === state.uwRisk)?.path}
          </div>
        )}
      </div>

      <Gate label="Health profile complete — UW risk assessed" done={state.gate2Ok}
        onDo={() => { dispatch({ type: "START_SECTION", sectionNum: 2 }); dispatch({ type: "COMPLETE_SECTION", key: "gate2Ok", sectionNum: 2 }); }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "gate2Ok" })}
      />
    </Card>
  );
}

// ─── GATE 3 — Product Presentation (with MEC lockgate) ────────────────────
function ProductSection({ productKey, product }) {
  const [open, setOpen] = useState(false);
  const { state, dispatch } = useU65();
  const isSelected = state.selectedProducts.includes(productKey);
  const isRecommended = state.productRecommendation?.find((r) => r.id === productKey && r.priority === 1);

  return (
    <div style={{
      border: `1px solid ${isRecommended ? "rgba(168,85,247,0.35)" : isSelected ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.05)"}`,
      borderRadius: 8, marginBottom: 8, overflow: "hidden",
      boxShadow: isRecommended ? `0 0 12px rgba(168,85,247,0.08)` : "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: isSelected ? "rgba(168,85,247,0.05)" : "rgba(255,255,255,0.015)", cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <input type="checkbox" checked={isSelected} onChange={(e) => { e.stopPropagation(); dispatch({ type: "TOGGLE_PRODUCT", product: productKey }); }} style={{ margin: 0, cursor: "pointer" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? "#c0d0e4" : "#6b7a8d", flex: 1 }}>
          {product.label}
          {isRecommended && <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, color: ACCENT, background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 3, padding: "1px 6px", letterSpacing: "0.06em" }}>RECOMMENDED</span>}
        </span>
        <span style={{ fontSize: 11, color: "#4a5568" }}>{open ? "−" : "+"}</span>
      </div>
      {open && (
        <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize: 11, color: "#8fa4bc", marginBottom: 10, fontStyle: "italic" }}>Present when: {product.when}</div>
          {product.script.map((l, i) => <Say key={i} text={l} />)}
          {product.tiers && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>PALIC Tier Comparison</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr>{["Feature", "Value (1 Unit)", "Plus (2 Units)", "Preferred (3 Units)"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#4a5568", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 11 }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>{product.tiers.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                      <td style={{ padding: "7px 10px", color: "#c0d0e4" }}>{row.feature}</td>
                      <td style={{ padding: "7px 10px", color: "#8fa4bc" }}>{row.value}</td>
                      <td style={{ padding: "7px 10px", color: "#8fa4bc" }}>{row.plus}</td>
                      <td style={{ padding: "7px 10px", color: "#8fa4bc" }}>{row.preferred}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
          {product.keyPoints && (
            <div style={{ marginTop: 8 }}>
              {product.keyPoints.map((p, i) => (
                <div key={i} style={{ fontSize: 11, color: "#8fa4bc", padding: "3px 0", paddingLeft: 10, borderLeft: "2px solid rgba(168,85,247,0.2)", marginBottom: 3 }}>{p}</div>
              ))}
            </div>
          )}
          <ComplianceBanner text={product.compliance} />
          {product.checklist && product.checklist.map((item, i) => (
            <div key={i} style={{ fontSize: 12, color: "#8fa4bc", padding: "3px 0" }}>☐ {item}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function G3() {
  const { state, dispatch, activeGate } = useU65();
  const gate = U65_GATES[3];
  const d = state.sectionTimestamps[3];
  const { mecDisclosureAcknowledged } = state;

  return (
    <Card num={3} title="Product Presentation" red active={activeGate === 3} done={state.gate3Ok} dur={d ? d.end - d.start : null}>
      {/* MEC Disclosure Lockgate */}
      <div style={{
        background: mecDisclosureAcknowledged ? "rgba(52,211,153,0.04)" : "rgba(248,113,113,0.08)",
        border: `2px solid ${mecDisclosureAcknowledged ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.3)"}`,
        borderRadius: 8, padding: "14px 16px", marginBottom: 14,
      }}>
        <div style={{ fontSize: 13, color: mecDisclosureAcknowledged ? "#34d399" : "#f87171", lineHeight: 1.6, fontWeight: 600, marginBottom: 10 }}>
          MANDATORY DISCLOSURE — Must be given BEFORE presenting any product details
        </div>
        <div style={{ fontSize: 12, color: mecDisclosureAcknowledged ? "#8fa4bc" : "#c0d0e4", lineHeight: 1.6, marginBottom: 10 }}>
          {gate.mandatoryDisclosure}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: mecDisclosureAcknowledged ? "#34d399" : "#f87171" }}>
          <input type="checkbox" checked={mecDisclosureAcknowledged} onChange={() => dispatch({ type: "ACK_MEC_DISCLOSURE" })} style={{ margin: 0 }} />
          I have read the NOT-MEC / NOT-ACA-substitute disclosure to the client
        </label>
      </div>

      {mecDisclosureAcknowledged && (
        <div style={{ fontSize: 10, fontWeight: 700, color: "#34d399", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10, padding: "4px 10px", background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.12)", borderRadius: 4, display: "inline-block" }}>
          Disclosure acknowledged
        </div>
      )}

      {/* Product routing recommendation */}
      {state.productRecommendation && <ProductRecommendation />}

      {/* Products — only visible after MEC disclosure */}
      {mecDisclosureAcknowledged ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Select Products to Present</div>
          <ProductSection productKey="enrollprime" product={gate.products.enrollprime} />
          <ProductSection productKey="palic" product={gate.products.palic} />
        </div>
      ) : (
        <div style={{ padding: "20px", textAlign: "center", fontSize: 12, color: "#4a5568", background: "rgba(255,255,255,0.01)", borderRadius: 8, border: "1px dashed rgba(255,255,255,0.06)" }}>
          Acknowledge the mandatory disclosure above to view products
        </div>
      )}

      <Gate label="Products presented — disclosures given" done={state.gate3Ok}
        onDo={() => { dispatch({ type: "START_SECTION", sectionNum: 3 }); dispatch({ type: "COMPLETE_SECTION", key: "gate3Ok", sectionNum: 3 }); }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "gate3Ok" })}
      />
    </Card>
  );
}

// ─── GATE 4 — Comparison & Selection ──────────────────────────────────────
function G4() {
  const { state, dispatch, activeGate } = useU65();
  const gate = U65_GATES[4];
  const d = state.sectionTimestamps[4];

  return (
    <Card num={4} title="Comparison & Selection" active={activeGate === 4} done={state.gate4Ok} dur={d ? d.end - d.start : null}>
      {state.selectedProducts.length > 0 && <U65ProductMatrix selectedProducts={state.selectedProducts} recommended={state.productRecommendation?.[0]?.id} />}
      {gate.script.map((l, i) => <Say key={i} text={l} />)}

      <div style={{ marginTop: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Common Client Questions</div>
        {gate.commonQA.map((qa, i) => (
          <div key={i} style={{ border: "1px solid rgba(255,255,255,0.04)", borderRadius: 7, padding: "10px 13px", marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: ACCENT, marginBottom: 4 }}>Q: {qa.q}</div>
            <div style={{ fontSize: 12, color: "#8fa4bc", lineHeight: 1.5 }}>A: {qa.a}</div>
          </div>
        ))}
      </div>

      <Gate label="Product selected" done={state.gate4Ok}
        onDo={() => { dispatch({ type: "START_SECTION", sectionNum: 4 }); dispatch({ type: "COMPLETE_SECTION", key: "gate4Ok", sectionNum: 4 }); }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "gate4Ok" })}
      />
    </Card>
  );
}

// ─── GATE 5 — Ancillary Stack ─────────────────────────────────────────────
function G5() {
  const { state, dispatch, activeGate } = useU65();
  const gate = U65_GATES[5];
  const d = state.sectionTimestamps[5];

  return (
    <Card num={5} title="Ancillary / Supplemental Stack" active={activeGate === 5} done={state.gate5Ok} dur={d ? d.end - d.start : null}>
      {gate.script.map((l, i) => <Say key={i} text={l} />)}
      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr>{["Product", "Why Recommend", "Carriers"].map((h) => (
            <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#4a5568", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 11 }}>{h}</th>
          ))}</tr></thead>
          <tbody>{gate.ancillaryTable.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <td style={{ padding: "7px 10px", color: ACCENT, fontWeight: 600, whiteSpace: "nowrap" }}>{row.product}</td>
              <td style={{ padding: "7px 10px", color: "#c0d0e4" }}>{row.why}</td>
              <td style={{ padding: "7px 10px", color: "#8fa4bc", fontSize: 11 }}>{row.carriers}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {gate.notes.map((n, i) => <ComplianceBanner key={i} text={n} />)}
      <Gate label="Ancillary discussion complete" done={state.gate5Ok}
        onDo={() => { dispatch({ type: "START_SECTION", sectionNum: 5 }); dispatch({ type: "COMPLETE_SECTION", key: "gate5Ok", sectionNum: 5 }); }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "gate5Ok" })}
      />
    </Card>
  );
}

// ─── GATE 6 — Application & Enrollment (with platform links) ──────────────
function G6() {
  const { state, dispatch, activeGate } = useU65();
  const gate = U65_GATES[6];
  const d = state.sectionTimestamps[6];

  const selectedPlatforms = state.selectedProducts
    .filter((p) => gate.platforms[p])
    .map((p) => ({ key: p, ...gate.platforms[p] }));

  return (
    <Card num={6} title="Application & Enrollment" active={activeGate === 6} done={state.gate6Ok} dur={d ? d.end - d.start : null}>
      {/* Platform quick links */}
      {selectedPlatforms.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: ACCENT, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Quick Links</div>
          {selectedPlatforms.map((plat) => (
            <div key={plat.key} style={{ marginBottom: 8, padding: "10px 14px", background: "rgba(168,85,247,0.04)", border: "1px solid rgba(168,85,247,0.12)", borderRadius: 7 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#c0d0e4", marginBottom: 6 }}>{plat.label}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {plat.links.map((link) => (
                  <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" style={{
                    fontSize: 11, fontWeight: 600, color: ACCENT, padding: "4px 10px", borderRadius: 5,
                    background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)",
                    textDecoration: "none", cursor: "pointer",
                  }}>
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Say text={gate.script.general} />

      {state.selectedProducts.includes("palic") && (
        <div style={{ margin: "10px 0" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#f87171", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>PALIC — Medical Underwriting Script</div>
          <Say text={gate.script.palic} />
        </div>
      )}

      <Say text={gate.script.submitted} />
      <Say text={gate.script.confirm} />
      {gate.notes.map((n, i) => <ComplianceBanner key={i} text={n} />)}

      <Gate label="Application submitted — confirmation number recorded" done={state.gate6Ok}
        onDo={() => { dispatch({ type: "START_SECTION", sectionNum: 6 }); dispatch({ type: "COMPLETE_SECTION", key: "gate6Ok", sectionNum: 6 }); }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "gate6Ok" })}
      />
    </Card>
  );
}

// ─── GATE 7 — Closing & Follow-Up ─────────────────────────────────────────
function G7() {
  const { state, dispatch, activeGate } = useU65();
  const gate = U65_GATES[7];
  const d = state.sectionTimestamps[7];
  const { followUp } = state;

  const copyToClipboard = useCallback(() => {
    const lines = [
      "U65 Off-Exchange Enrollment Summary",
      "─".repeat(40),
      `Products: ${state.selectedProducts.map((p) => p === "enrollprime" ? "EnrollPrime / AFI PPO" : "PALIC HSP Gold").join(", ")}`,
      `UW Risk: ${state.uwRisk || "Not assessed"}`,
      `Follow-up: ${followUp.date || "Not scheduled"} via ${followUp.method}`,
      followUp.notes ? `Notes: ${followUp.notes}` : "",
      "",
      "Next Steps:",
      ...state.selectedProducts.map((p) => `  - ${gate.nextStepsByProduct[p] || ""}`),
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(lines);
  }, [state.selectedProducts, state.uwRisk, followUp, gate.nextStepsByProduct]);

  return (
    <Card num={7} title="Closing & Follow-Up" active={activeGate === 7} done={state.gate7Ok} dur={d ? d.end - d.start : null}>
      {gate.script.map((l, i) => <Say key={i} text={l} />)}

      {/* Next steps — product-specific */}
      <div style={{ marginTop: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Next Steps by Product</div>
        {state.selectedProducts.map((p) => gate.nextStepsByProduct[p] && (
          <div key={p} style={{ fontSize: 12, color: "#8fa4bc", padding: "6px 12px", borderLeft: `2px solid ${ACCENT}30`, marginBottom: 4, lineHeight: 1.5, background: "rgba(168,85,247,0.02)", borderRadius: "0 6px 6px 0" }}>
            <span style={{ fontWeight: 700, color: "#c0d0e4" }}>{p === "enrollprime" ? "EnrollPrime" : "PALIC"}:</span> {gate.nextStepsByProduct[p]}
          </div>
        ))}
      </div>

      {/* Follow-up tracker */}
      <div style={{ padding: "12px 14px", background: "rgba(168,85,247,0.03)", border: "1px solid rgba(168,85,247,0.12)", borderRadius: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>Follow-Up Tracker</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 10, color: "#6b7a8d", display: "block", marginBottom: 3 }}>Follow-up Date</label>
            <input type="date" value={followUp.date} onChange={(e) => dispatch({ type: "SET_FOLLOW_UP", payload: { date: e.target.value } })} style={{
              width: "100%", padding: "6px 8px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)", color: "#c0d0e4", fontSize: 12, fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box",
            }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: "#6b7a8d", display: "block", marginBottom: 3 }}>Method</label>
            <div style={{ display: "flex", gap: 4 }}>
              {["call", "text", "email"].map((m) => (
                <button key={m} onClick={() => dispatch({ type: "SET_FOLLOW_UP", payload: { method: m } })} style={{
                  flex: 1, padding: "5px 4px", borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.06em",
                  border: `1px solid ${followUp.method === m ? "rgba(168,85,247,0.4)" : "rgba(255,255,255,0.06)"}`,
                  background: followUp.method === m ? "rgba(168,85,247,0.1)" : "rgba(255,255,255,0.02)",
                  color: followUp.method === m ? ACCENT : "#4a5568",
                }}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 10, color: "#6b7a8d", display: "block", marginBottom: 3 }}>Notes</label>
          <textarea value={followUp.notes} onChange={(e) => dispatch({ type: "SET_FOLLOW_UP", payload: { notes: e.target.value } })} rows={2} style={{
            width: "100%", padding: "6px 8px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)", color: "#c0d0e4", fontSize: 12, fontFamily: "var(--font-body)",
            outline: "none", resize: "vertical", boxSizing: "border-box",
          }} />
        </div>
        <button onClick={copyToClipboard} style={{
          marginTop: 8, padding: "6px 16px", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", letterSpacing: "0.06em",
          background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)", color: ACCENT,
        }}>
          Copy Summary
        </button>
      </div>

      <Gate label="Call closed — follow-up scheduled" done={state.gate7Ok}
        onDo={() => { dispatch({ type: "START_SECTION", sectionNum: 7 }); dispatch({ type: "COMPLETE_SECTION", key: "gate7Ok", sectionNum: 7 }); }}
        onUndo={() => dispatch({ type: "UNCOMPLETE_SECTION", key: "gate7Ok" })}
      />

      {state.gate7Ok && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 18, textAlign: "center", padding: "20px", background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.12)", borderRadius: 10 }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#34d399" }}>U65 Enrollment Complete</div>
          <button onClick={() => dispatch({ type: "RESET" })} style={{ marginTop: 12, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 6, color: "#34d399", padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
            New Call
          </button>
        </motion.div>
      )}
    </Card>
  );
}

// ─── Progress Bar (dot-based) ─────────────────────────────────────────────
function Progress() {
  const { state, activeGate } = useU65();
  const steps = [
    { k: "gate0Ok", l: "Open" },
    { k: "gate1Ok", l: "Assess" },
    { k: "gate2Ok", l: "Health" },
    { k: "gate3Ok", l: "Products" },
    { k: "gate4Ok", l: "Select" },
    { k: "gate5Ok", l: "Ancillary" },
    { k: "gate6Ok", l: "Apply" },
    { k: "gate7Ok", l: "Close" },
  ];
  const done = steps.filter((s) => state[s.k]).length;
  const pct = Math.round((done / steps.length) * 100);

  return (
    <div style={{ marginBottom: 14, padding: "12px 16px", background: "rgba(255,255,255,0.018)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase" }}>U65 Off-Exchange</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
      </div>

      {/* Dot progress bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 6 }}>
        {steps.map((s, i) => {
          const isDone = state[s.k];
          const isActive = i === activeGate;
          return (
            <div key={s.k} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{
                  width: 12, height: 12, borderRadius: "50%",
                  background: isDone ? "#34d399" : isActive ? ACCENT : "rgba(255,255,255,0.06)",
                  border: `2px solid ${isDone ? "#34d399" : isActive ? ACCENT : "rgba(255,255,255,0.1)"}`,
                  boxShadow: isActive ? `0 0 8px rgba(168,85,247,0.5)` : isDone ? "0 0 6px rgba(52,211,153,0.3)" : "none",
                  transition: "all 0.3s",
                  animation: isActive ? "flow-pulse 2.4s ease-in-out infinite" : "none",
                }} />
                <span style={{ fontSize: 8, fontWeight: 600, color: isDone ? "#34d399" : isActive ? ACCENT : "#4a5568", marginTop: 4, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                  {s.l}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: 2, background: isDone ? "rgba(52,211,153,0.2)" : "rgba(255,255,255,0.04)", margin: "0 2px", marginBottom: 14 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── U65Flow (main export) ────────────────────────────────────────────────
export default function U65Flow() {
  const { state, dispatch, activeGate } = useU65();
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
    <motion.div className="flow" style={{ fontFamily: "var(--font-body)" }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <style>{`
        @keyframes flow-pulse {
          0%   { box-shadow: 0 0 6px 2px rgba(168,85,247,0.3); }
          50%  { box-shadow: 0 0 14px 5px rgba(168,85,247,0.5); }
          100% { box-shadow: 0 0 6px 2px rgba(168,85,247,0.3); }
        }
      `}</style>

      <Progress />

      {/* Start Call gate */}
      {!state.callStarted ? (
        <section style={{ background: "rgba(168,85,247,0.04)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 10, padding: "28px 20px", textAlign: "center", marginBottom: 10 }}>
          <button className="primary" onClick={() => dispatch({ type: "START_CALL" })} style={{
            fontSize: 15, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 36px",
            background: `linear-gradient(145deg, rgba(168,85,247,0.15), rgba(168,85,247,0.05))`, border: `1px solid rgba(168,85,247,0.3)`, color: ACCENT, borderRadius: 8, cursor: "pointer",
          }}>
            Start Call
          </button>
          <p style={{ marginTop: 10, fontSize: 11, color: "#4a5568" }}>Timer begins when you click Start Call</p>
        </section>
      ) : (
        <>
          <G0 />
          <G1 />
          <G2 />
          {/* Product recommendation panel between G2 and G3 */}
          {state.gate2Ok && state.productRecommendation && activeGate >= 3 && <ProductRecommendation />}
          <G3 />
          <G4 />
          <G5 />
          <G6 />
          <G7 />
        </>
      )}
    </motion.div>
  );
}
