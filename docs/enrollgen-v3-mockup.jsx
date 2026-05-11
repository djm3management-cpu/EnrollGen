import { useState, useEffect, useRef, useCallback } from "react";

const C = {
  base: "#171411",
  s1: "#1e1a16",
  s2: "#262119",
  s3: "#2e2820",
  s4: "#382f25",
  border: "#3d352b",
  borderHover: "#564a3c",
  borderActive: "#7a6a56",
  text: "#e4dace",
  textMid: "#b5a898",
  textDim: "#7d7060",
  textFaint: "#524838",
  accent: "#c08b55",
  accentBright: "#daa76d",
  accentDim: "#8a6338",
  green: "#6aab7d",
  greenDim: "#2d4a35",
  greenText: "#a0d4ac",
  red: "#b85c5c",
  redDim: "#4a2828",
  redText: "#e09898",
  blue: "#5c88b8",
  blueDim: "#283a4a",
  blueText: "#98bce0",
  amber: "#c49940",
  amberDim: "#4a3818",
  amberText: "#e0c080",
  purple: "#8b6eb8",
  purpleDim: "#352a4a",
  purpleText: "#bca8e0",
};

const SYSTEM_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SYSTEM_MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace";

const FLOWS = [
  { id: "ma", label: "MA", color: C.red, glow: C.redText },
  { id: "medsup", label: "MS", color: C.green, glow: C.greenText },
  { id: "aca", label: "ACA", color: C.blue, glow: C.blueText },
  { id: "u65", label: "U65", color: C.purple, glow: C.purpleText },
];

const SECTIONS = [
  { label: "Recording disclosure", status: "done", score: 100 },
  { label: "Call opening", status: "done", score: 92 },
  { label: "Scope of appointment", status: "active", score: null },
  { label: "Required disclosures", status: "pending", score: null },
  { label: "Eligibility verification", status: "pending", score: null },
  { label: "Needs assessment", status: "pending", score: null },
  { label: "Presentation / SOB", status: "pending", score: null },
  { label: "Consent for enrollment", status: "pending", score: null },
];

const CHECKLIST = [
  { text: "Confirm beneficiary understands scope", done: true },
  { text: "Read SOA disclosure verbatim", done: false },
  { text: "Document products to be discussed", done: false },
  { text: "Obtain verbal agreement", done: false },
];

const TRANSCRIPT = [
  { speaker: "agent", time: "03:41", text: "I'd like to go over the scope of what we'll be discussing today. We can look at Medicare Advantage plans, and if you'd like, also prescription drug coverage." },
  { speaker: "client", time: "03:52", text: "Sure, that sounds good. I mainly want to understand my options." },
  { speaker: "agent", time: "04:01", text: "Absolutely. So just to confirm, we'll be reviewing Medicare Advantage plans available in your area. I won't be discussing anything outside of what you agree to." },
  { speaker: "client", time: "04:12", text: "That works for me." },
];

const COPILOT = [
  { type: "coaching", text: "SOA verbal consent obtained. Document products discussed." },
  { type: "remind", text: "Read the scope limitation disclosure next." },
  { type: "coaching", text: "Beneficiary is engaged. Good pacing." },
];

const TABS = ["Script", "Agent tools", "Intelligence", "Compliance hub", "Calls", "Daily verse"];

const Strata = () => (
  <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.035, pointerEvents: "none" }} preserveAspectRatio="none" viewBox="0 0 1200 800">
    {[80, 160, 240, 340, 440, 540, 620, 700].map((y, i) => (
      <path key={i} d={`M0,${y} Q${150 + i * 30},${y - 15 + (i % 3) * 8} ${300 + i * 20},${y + 5} T${600 + i * 15},${y - 8} T${900 - i * 10},${y + 10} T1200,${y - 3}`} fill="none" stroke={C.accent} strokeWidth={i % 2 === 0 ? "0.6" : "0.3"} strokeDasharray={i % 3 === 0 ? "6 10" : "none"} />
    ))}
  </svg>
);

const GrainOverlay = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.width = 200; cv.height = 200;
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(200, 200);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i+1] = img.data[i+2] = v;
      img.data[i+3] = 8;
    }
    ctx.putImageData(img, 0, 0);
  }, []);
  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.5 }} />;
};

const Waveform = ({ active, color }) => {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const phaseRef = useRef(0);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const W = 240, H = 32;
    cv.width = W; cv.height = H;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      phaseRef.current += 0.04;
      const bars = 48;
      const bw = W / bars;
      for (let i = 0; i < bars; i++) {
        const amp = active
          ? (Math.sin(phaseRef.current + i * 0.3) * 0.4 + 0.5) * (Math.sin(phaseRef.current * 0.7 + i * 0.15) * 0.3 + 0.7)
          : 0.05 + Math.sin(phaseRef.current * 0.5 + i * 0.2) * 0.03;
        const h = amp * H * 0.8;
        const y = (H - h) / 2;
        ctx.fillStyle = active ? color + "aa" : C.textFaint + "44";
        ctx.fillRect(i * bw + 1, y, bw - 2, h);
      }
      frameRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frameRef.current);
  }, [active, color]);

  return <canvas ref={canvasRef} style={{ width: 240, height: 32, borderRadius: 4 }} />;
};

const Beacon = ({ color, glow, active, size = 10 }) => (
  <div style={{ position: "relative", width: size, height: size }}>
    {active && <div style={{ position: "absolute", inset: -3, borderRadius: "50%", background: glow, opacity: 0.2, animation: "pulse 2.5s ease-in-out infinite" }} />}
    <div style={{ width: size, height: size, borderRadius: "50%", background: active ? color : C.textFaint, transition: "all 0.3s ease", boxShadow: active ? `0 0 8px ${color}66` : "none" }} />
  </div>
);

const StatusDot = ({ status, size = 6 }) => {
  const colors = { done: C.green, active: C.amber, pending: C.textFaint };
  return <div style={{ width: size, height: size, borderRadius: "50%", background: colors[status] || C.textFaint, flexShrink: 0 }} />;
};

const timerColor = (s) => s < 900 ? C.green : s < 1200 ? C.amber : s < 1800 ? C.accent : C.red;

export default function EnrollGenV3() {
  const [activeFlow, setActiveFlow] = useState("ma");
  const [activeTab, setActiveTab] = useState("Script");
  const [callTime, setCallTime] = useState(247);
  const [agentStatus, setAgentStatus] = useState("available");
  const [callActive, setCallActive] = useState(true);
  const [checks, setChecks] = useState([true, false, false, false]);

  useEffect(() => {
    if (!callActive) return;
    const t = setInterval(() => setCallTime(p => p + 1), 1000);
    return () => clearInterval(t);
  }, [callActive]);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const allDone = SECTIONS.every(s => s.status === "done");
  const activeIdx = SECTIONS.findIndex(s => s.status === "active");

  return (
    <div style={{ fontFamily: SYSTEM_FONT, background: C.base, color: C.text, height: "100vh", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <style>{`
        @keyframes pulse { 0%,100% { transform: scale(1); opacity: 0.15; } 50% { transform: scale(1.6); opacity: 0.35; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes breathe { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        input:focus, textarea:focus { border-color: ${C.borderActive} !important; }
      `}</style>
      <Strata />
      <GrainOverlay />

      {/* ═══ TOP BAR ═══ */}
      <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", height: 48, padding: "0 20px", borderBottom: `1px solid ${C.border}`, background: `${C.s1}ee`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginRight: 28 }}>
          <span style={{ fontFamily: SYSTEM_FONT, fontSize: 19, color: C.accent, letterSpacing: "-0.02em" }}>Enroll</span>
          <span style={{ fontFamily: SYSTEM_MONO, fontSize: 12, fontWeight: 500, color: C.textMid, letterSpacing: "0.08em" }}>GEN</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 24 }}>
          {FLOWS.map(f => (
            <button key={f.id} onClick={() => setActiveFlow(f.id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 5, border: `1px solid ${activeFlow === f.id ? f.color + "55" : "transparent"}`, background: activeFlow === f.id ? f.color + "12" : "transparent", cursor: "pointer", transition: "all 0.2s" }}>
              <Beacon color={f.color} glow={f.glow} active={activeFlow === f.id} size={7} />
              <span style={{ fontFamily: SYSTEM_MONO, fontSize: 10, letterSpacing: "0.06em", color: activeFlow === f.id ? C.text : C.textDim }}>{f.label}</span>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 1, position: "relative" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{ fontFamily: SYSTEM_FONT, fontSize: 11.5, fontWeight: activeTab === t ? 500 : 400, padding: "5px 13px", borderRadius: 4, border: "none", background: activeTab === t ? C.s3 : "transparent", color: activeTab === t ? C.accent : C.textDim, cursor: "pointer", transition: "all 0.15s", letterSpacing: "0.01em", position: "relative" }}>
              {t}
              {activeTab === t && <div style={{ position: "absolute", bottom: -1, left: "20%", right: "20%", height: 2, background: C.accent, borderRadius: 1 }} />}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontFamily: SYSTEM_MONO, fontSize: 10, color: C.textFaint }}>DEFAULT</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: `linear-gradient(135deg, ${C.accent}44, ${C.accent}22)`, border: `1px solid ${C.accent}33`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SYSTEM_MONO, fontSize: 9, fontWeight: 500, color: C.accent }}>MS</div>
            <span style={{ fontFamily: SYSTEM_FONT, fontSize: 11, color: C.textDim }}>Sign out</span>
          </div>
        </div>
      </div>

      {/* ═══ MAIN LAYOUT ═══ */}
      <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "210px 1fr 310px", flex: 1, overflow: "hidden" }}>

        {/* ─── LEFT RAIL ─── */}
        <div style={{ borderRight: `1px solid ${C.border}`, padding: 14, display: "flex", flexDirection: "column", gap: 10, background: `${C.s1}88`, overflow: "auto" }}>
          <input placeholder="Member ZIP" style={{ fontFamily: SYSTEM_MONO, fontSize: 11, padding: "7px 10px", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, outline: "none", width: "100%" }} />

          <div style={{ display: "flex", gap: 4 }}>
            {["SEP finder", "Qualifier", "SNP"].map((b, i) => (
              <button key={b} style={{ flex: 1, fontFamily: SYSTEM_MONO, fontSize: 9, letterSpacing: "0.04em", padding: "5px 2px", borderRadius: 4, border: `1px solid ${i === 0 ? C.accent + "55" : C.border}`, background: i === 0 ? C.accent + "15" : "transparent", color: i === 0 ? C.accent : C.textDim, cursor: "pointer" }}>{b}</button>
            ))}
          </div>

          {/* client info card */}
          <div style={{ background: C.s2, borderRadius: 6, border: `1px solid ${C.border}`, padding: 12 }}>
            <div style={{ fontFamily: SYSTEM_MONO, fontSize: 9, color: C.textFaint, letterSpacing: "0.06em", marginBottom: 8 }}>CLIENT</div>
            <div style={{ fontFamily: SYSTEM_FONT, fontSize: 13, color: C.text, fontWeight: 500, marginBottom: 2 }}>Margaret Chen</div>
            <div style={{ fontFamily: SYSTEM_MONO, fontSize: 10, color: C.textDim, marginBottom: 8 }}>DOB 03/15/1958 &middot; 66 yrs</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
              {[["MBI", "1EG4-TE5-MK72"], ["County", "Camden, NJ"], ["Parts A/B", "Active"], ["Current", "Orig. Medicare"]].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontFamily: SYSTEM_MONO, fontSize: 8, color: C.textFaint, letterSpacing: "0.06em" }}>{k.toUpperCase()}</div>
                  <div style={{ fontFamily: SYSTEM_MONO, fontSize: 10, color: k === "Parts A/B" ? C.greenText : C.textMid }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* plan context */}
          <div style={{ background: C.s2, borderRadius: 6, border: `1px solid ${C.border}`, padding: 12 }}>
            <div style={{ fontFamily: SYSTEM_MONO, fontSize: 9, color: C.textFaint, letterSpacing: "0.06em", marginBottom: 8 }}>PRESENTING</div>
            <div style={{ fontFamily: SYSTEM_FONT, fontSize: 12, color: C.accent, fontWeight: 500 }}>Devoted Health Plan</div>
            <div style={{ fontFamily: SYSTEM_MONO, fontSize: 10, color: C.textDim, marginBottom: 6 }}>H5765-003 &middot; HMO-POS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {["$0 premium", "$0 PCP", "$250 MOOP", "OTC $100/qtr"].map(b => (
                <span key={b} style={{ fontFamily: SYSTEM_MONO, fontSize: 9, padding: "2px 6px", borderRadius: 3, background: C.accent + "15", color: C.accentBright }}>{b}</span>
              ))}
            </div>
          </div>

          {/* notes */}
          <div style={{ marginTop: "auto" }}>
            <div style={{ fontFamily: SYSTEM_MONO, fontSize: 9, color: C.textFaint, letterSpacing: "0.06em", marginBottom: 6 }}>NOTES</div>
            <textarea placeholder="Type notes here..." rows={4} style={{ width: "100%", fontFamily: SYSTEM_FONT, fontSize: 11, padding: 8, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, outline: "none", resize: "vertical", lineHeight: 1.5 }} />
          </div>
        </div>

        {/* ─── CENTER ─── */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "auto", position: "relative" }}>
          {/* timer + waveform bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, padding: "16px 40px", borderBottom: `1px solid ${C.border}`, background: `${C.s1}44`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: callActive ? C.green : C.textFaint, boxShadow: callActive ? `0 0 6px ${C.green}88` : "none", animation: callActive ? "breathe 2s ease-in-out infinite" : "none" }} />
              <span style={{ fontFamily: SYSTEM_MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.06em" }}>{callActive ? "LIVE" : "IDLE"}</span>
            </div>
            <div style={{ fontFamily: SYSTEM_MONO, fontSize: 28, fontWeight: 500, color: timerColor(callTime), letterSpacing: "0.08em", transition: "color 1s ease" }}>{fmt(callTime)}</div>
            <Waveform active={callActive} color={C.accent} />
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setCallActive(!callActive)} style={{ fontFamily: SYSTEM_MONO, fontSize: 10, letterSpacing: "0.06em", padding: "7px 18px", borderRadius: 5, border: "none", background: callActive ? C.redDim : C.green, color: callActive ? C.redText : "#fff", cursor: "pointer", fontWeight: 500 }}>{callActive ? "END" : "START"}</button>
              <button style={{ fontFamily: SYSTEM_MONO, fontSize: 10, letterSpacing: "0.06em", padding: "7px 14px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.textDim, cursor: "pointer" }}>ANALYZE</button>
            </div>
          </div>

          {/* script content */}
          <div style={{ flex: 1, padding: "24px 40px", overflow: "auto" }}>
            <div style={{ maxWidth: 580, margin: "0 auto" }}>
              {/* section header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <StatusDot status="active" size={8} />
                <span style={{ fontFamily: SYSTEM_FONT, fontSize: 17, color: C.text }}>Scope of appointment</span>
                <span style={{ fontFamily: SYSTEM_MONO, fontSize: 9, color: C.textFaint, marginLeft: "auto" }}>3 OF 8</span>
              </div>

              {/* script prompt */}
              <div style={{ background: C.s2, borderRadius: 7, border: `1px solid ${C.border}`, padding: 18, marginBottom: 14 }}>
                <div style={{ fontFamily: SYSTEM_FONT, fontSize: 13.5, color: C.text, lineHeight: 1.75 }}>
                  "Before we continue, I want to make sure we're on the same page about what we'll be reviewing today. We'll be looking at <span style={{ color: C.accent, fontWeight: 500 }}>Medicare Advantage plans</span> available in your area. I'm not going to discuss anything outside of what you agree to. Does that sound good?"
                </div>
              </div>

              {/* compliance note */}
              <div style={{ background: C.amberDim, borderRadius: 5, padding: "9px 13px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.amber }} />
                  <span style={{ fontFamily: SYSTEM_MONO, fontSize: 9, color: C.amber, letterSpacing: "0.06em" }}>COMPLIANCE</span>
                </div>
                <div style={{ fontFamily: SYSTEM_FONT, fontSize: 11.5, color: C.amberText, lineHeight: 1.5 }}>SOA must document all product types discussed. Cannot discuss products not included in the scope.</div>
              </div>

              {/* inline checklist */}
              <div style={{ background: C.s2, borderRadius: 7, border: `1px solid ${C.border}`, padding: 14, marginBottom: 16 }}>
                <div style={{ fontFamily: SYSTEM_MONO, fontSize: 9, color: C.textFaint, letterSpacing: "0.06em", marginBottom: 10 }}>SECTION CHECKLIST</div>
                {CHECKLIST.map((item, i) => (
                  <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", cursor: "pointer", borderBottom: i < CHECKLIST.length - 1 ? `1px solid ${C.border}44` : "none" }}>
                    <div onClick={() => { const n = [...checks]; n[i] = !n[i]; setChecks(n); }} style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${checks[i] ? C.green : C.border}`, background: checks[i] ? C.green + "25" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", transition: "all 0.15s" }}>
                      {checks[i] && <div style={{ width: 8, height: 8, borderRadius: 1, background: C.green }} />}
                    </div>
                    <span style={{ fontFamily: SYSTEM_FONT, fontSize: 12, color: checks[i] ? C.textMid : C.text, textDecoration: checks[i] ? "line-through" : "none", transition: "all 0.15s" }}>{item.text}</span>
                  </label>
                ))}
              </div>

              {/* actions */}
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ flex: 1, fontFamily: SYSTEM_MONO, fontSize: 11, letterSpacing: "0.04em", padding: "10px 16px", borderRadius: 5, border: `1px solid ${C.green}44`, background: C.green + "15", color: C.greenText, cursor: "pointer" }}>COMPLETE SECTION</button>
                <button style={{ fontFamily: SYSTEM_MONO, fontSize: 11, letterSpacing: "0.04em", padding: "10px 16px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.textDim, cursor: "pointer" }}>SKIP</button>
              </div>

              {/* progress dots */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 24 }}>
                {SECTIONS.map((s, i) => (
                  <div key={i} title={s.label} style={{ width: i === activeIdx ? 20 : 8, height: 8, borderRadius: 4, background: s.status === "done" ? C.green : s.status === "active" ? C.amber : C.textFaint, cursor: "pointer", transition: "all 0.3s ease" }} />
                ))}
              </div>

              {/* enrollment CTA */}
              <div style={{ marginTop: 32, padding: 16, background: C.s2, borderRadius: 7, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: SYSTEM_MONO, fontSize: 9, color: C.textFaint, letterSpacing: "0.06em", marginBottom: 3 }}>ENROLLMENT</div>
                  <div style={{ fontFamily: SYSTEM_FONT, fontSize: 12, color: C.textDim }}>Complete all 8 sections to submit</div>
                </div>
                <button disabled style={{ fontFamily: SYSTEM_MONO, fontSize: 11, letterSpacing: "0.04em", padding: "10px 24px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.s3, color: C.textFaint, cursor: "not-allowed", opacity: 0.5 }}>SUBMIT ENROLLMENT</button>
              </div>
            </div>
          </div>
        </div>

        {/* ─── RIGHT RAIL ─── */}
        <div style={{ borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", background: `${C.s1}88`, overflow: "hidden" }}>
          {/* status */}
          <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: agentStatus === "available" ? C.green : agentStatus === "busy" ? C.amber : C.textFaint }} />
              <span style={{ fontFamily: SYSTEM_MONO, fontSize: 9, letterSpacing: "0.06em", color: C.textDim, textTransform: "uppercase" }}>{agentStatus}</span>
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              {["available", "busy", "offline"].map(s => (
                <button key={s} onClick={() => setAgentStatus(s)} style={{ fontFamily: SYSTEM_MONO, fontSize: 8, letterSpacing: "0.04em", padding: "3px 8px", borderRadius: 3, border: `1px solid ${agentStatus === s ? (s === "available" ? C.green : s === "busy" ? C.amber : C.textDim) + "55" : C.border}`, background: agentStatus === s ? (s === "available" ? C.green : s === "busy" ? C.amber : C.textDim) + "18" : "transparent", color: agentStatus === s ? C.text : C.textFaint, cursor: "pointer", textTransform: "uppercase" }}>{s}</button>
              ))}
            </div>
          </div>

          {/* copilot ask */}
          <div style={{ padding: "8px 14px", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 5 }}>
              <input placeholder="Ask Co-Pilot..." style={{ flex: 1, fontFamily: SYSTEM_FONT, fontSize: 11, padding: "7px 10px", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, outline: "none" }} />
              <button style={{ padding: "7px 9px", background: C.accent + "20", border: `1px solid ${C.accent}33`, borderRadius: 5, color: C.accent, cursor: "pointer", fontSize: 13, lineHeight: 1 }}>&#x2191;</button>
            </div>
          </div>

          {/* transcript */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
            <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: SYSTEM_MONO, fontSize: 9, letterSpacing: "0.08em", color: C.textDim }}>LIVE TRANSCRIPT</span>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: callActive ? C.green : C.textFaint, animation: callActive ? "breathe 1.5s ease-in-out infinite" : "none" }} />
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              {TRANSCRIPT.map((t, i) => (
                <div key={i} style={{ animation: `slideIn 0.3s ease ${i * 0.08}s both` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontFamily: SYSTEM_MONO, fontSize: 8, color: t.speaker === "agent" ? C.accent : C.blue, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.speaker}</span>
                    <span style={{ fontFamily: SYSTEM_MONO, fontSize: 8, color: C.textFaint }}>{t.time}</span>
                  </div>
                  <div style={{ fontFamily: SYSTEM_FONT, fontSize: 11.5, color: C.textMid, lineHeight: 1.55 }}>{t.text}</div>
                </div>
              ))}
            </div>
          </div>

          {/* copilot feed */}
          <div style={{ borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: SYSTEM_MONO, fontSize: 9, letterSpacing: "0.08em", color: C.textDim }}>CO-PILOT</span>
            </div>
            <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6, maxHeight: 120, overflow: "auto" }}>
              {COPILOT.map((c, i) => (
                <div key={i} style={{ padding: "7px 10px", borderRadius: 5, background: c.type === "coaching" ? C.greenDim : C.amberDim, position: "relative" }}>
                  <div style={{ position: "absolute", top: 7, right: 8, width: 4, height: 4, borderRadius: "50%", background: c.type === "coaching" ? C.green : C.amber }} />
                  <div style={{ fontFamily: SYSTEM_FONT, fontSize: 11, color: c.type === "coaching" ? C.greenText : C.amberText, lineHeight: 1.45, paddingRight: 14 }}>{c.text}</div>
                </div>
              ))}
            </div>
          </div>

          {/* compliance panel */}
          <div style={{ borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: SYSTEM_MONO, fontSize: 9, letterSpacing: "0.08em", color: C.textDim }}>COMPLIANCE</span>
              <span style={{ fontFamily: SYSTEM_MONO, fontSize: 10, color: C.greenText, fontWeight: 500 }}>96%</span>
            </div>
            {/* overall bar */}
            <div style={{ margin: "0 14px 8px", height: 4, borderRadius: 2, background: C.s3, overflow: "hidden" }}>
              <div style={{ width: "96%", height: "100%", background: `linear-gradient(90deg, ${C.green}, ${C.greenText})`, borderRadius: 2 }} />
            </div>
            <div style={{ padding: "0 14px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
              {SECTIONS.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <StatusDot status={s.status} size={5} />
                  <span style={{ fontFamily: SYSTEM_FONT, fontSize: 10.5, color: s.status === "active" ? C.text : C.textDim, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>
                  <div style={{ width: 32, height: 3, borderRadius: 2, background: C.s3, overflow: "hidden", flexShrink: 0 }}>
                    <div style={{ width: s.score ? `${s.score}%` : "0%", height: "100%", background: s.status === "done" ? C.green : C.textFaint, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontFamily: SYSTEM_MONO, fontSize: 8, color: s.score ? C.greenText : C.textFaint, minWidth: 18, textAlign: "right" }}>{s.score || "--"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ BOTTOM BAR ═══ */}
      <div style={{ position: "relative", zIndex: 2, height: 30, background: `${C.s1}ee`, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", flexShrink: 0 }}>
        <div style={{ fontFamily: SYSTEM_MONO, fontSize: 9, color: C.textFaint, letterSpacing: "0.04em" }}>NGHS &middot; NPN 21313049 &middot; 22 STATES</div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <span style={{ fontFamily: SYSTEM_MONO, fontSize: 9, color: C.textFaint }}>DEEPGRAM <span style={{ color: C.greenText }}>&#x2022;</span></span>
          <span style={{ fontFamily: SYSTEM_MONO, fontSize: 9, color: C.textFaint }}>SUPABASE <span style={{ color: C.greenText }}>&#x2022;</span></span>
          <span style={{ fontFamily: SYSTEM_MONO, fontSize: 9, color: C.textFaint }}>CLERK <span style={{ color: C.greenText }}>&#x2022;</span></span>
        </div>
      </div>
    </div>
  );
}
