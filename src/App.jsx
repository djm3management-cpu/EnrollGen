import { useState } from "react";
import EnrollGenLogo from "./components/EnrollGenLogo";
import ScriptFlow from "./components/ScriptFlow";
import MedSupFlow from "./components/MedSupFlow";
import AgentTools from "./components/AgentTools";
import SessionSummary from "./components/SessionSummary";
import { ScriptProvider } from "./context/ScriptContext";
import { MedSupProvider } from "./context/MedSupContext";
import "./styles.css";

const LOGIN_DISABLED = import.meta.env.DEV;

/* ─── ModeToggle ─────────────────────────────────────────────────────────── */
function ModeToggle({ mode, onChange }) {
  const isMS = mode === "medsup";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12,
        padding: "6px 12px",
        userSelect: "none",
      }}
    >
      {/* MA label */}
      <span
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: !isMS ? "#38bdf8" : "var(--text-muted)",
          transition: "color 0.25s ease",
          cursor: "pointer",
        }}
        onClick={() => onChange("ma")}
      >
        MA
      </span>

      {/* Toggle pill */}
      <div
        onClick={() => onChange(isMS ? "ma" : "medsup")}
        role="switch"
        aria-checked={isMS}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onChange(isMS ? "ma" : "medsup");
          }
        }}
        style={{
          position: "relative",
          width: 44,
          height: 24,
          background: isMS ? "rgba(251,191,36,0.15)" : "rgba(56,189,248,0.12)",
          border: `1px solid ${
            isMS ? "rgba(251,191,36,0.35)" : "rgba(56,189,248,0.3)"
          }`,
          borderRadius: 12,
          cursor: "pointer",
          transition: "all 0.25s ease",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 3,
            left: isMS ? 22 : 3,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: isMS ? "#fbbf24" : "#38bdf8",
            boxShadow: `0 0 8px ${
              isMS ? "rgba(251,191,36,0.5)" : "rgba(56,189,248,0.5)"
            }`,
            transition:
              "left 0.25s cubic-bezier(.34,1.56,.64,1), background 0.25s ease, box-shadow 0.25s ease",
          }}
        />
      </div>

      {/* MedSup label */}
      <span
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: isMS ? "#fbbf24" : "var(--text-muted)",
          transition: "color 0.25s ease",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        onClick={() => onChange("medsup")}
      >
        MED SUP
      </span>
    </div>
  );
}

/* ─── App ────────────────────────────────────────────────────────────────── */
export default function App() {
  const [tab, setTab] = useState("script");
  const [mode, setMode] = useState("ma"); // "ma" | "medsup"

  return (
    <>
      <div className="viewport-bg" />
      <div className="app-shell">
        <div className="app">
          {/* Header: true-centered logo + right-pinned mode toggle */}
          <div
            style={{
              position: "relative",
              width: "100%",
              height: 86, // tweak if you want
              marginBottom: 4,
            }}
          >
            {/* Centered logo (always dead center) */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                display: "flex",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <EnrollGenLogo
                width={400}
                className="app-logo"
                style={{ margin: 0 }}
              />
            </div>

            {/* Right-pinned toggle */}
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 10,
                display: "flex",
                alignItems: "center",
              }}
            >
              <ModeToggle mode={mode} onChange={setMode} />
            </div>
          </div>

          {/* Mode badge */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "3px 10px",
                borderRadius: 4,
                background:
                  mode === "medsup"
                    ? "rgba(251,191,36,0.08)"
                    : "rgba(56,189,248,0.08)",
                border: `1px solid ${
                  mode === "medsup"
                    ? "rgba(251,191,36,0.25)"
                    : "rgba(56,189,248,0.25)"
                }`,
                color: mode === "medsup" ? "#fbbf24" : "#38bdf8",
                transition: "all 0.25s ease",
              }}
            >
              INBOUND —{" "}
              {mode === "medsup" ? "MEDICARE SUPPLEMENT" : "MEDICARE ADVANTAGE"}
            </span>
          </div>

          {/* Tabs */}
          <div className="tabs">
            <button
              className={tab === "script" ? "tab active" : "tab"}
              onClick={() => setTab("script")}
            >
              Script
            </button>
            <button
              className={tab === "tools" ? "tab active" : "tab"}
              onClick={() => setTab("tools")}
            >
              Agent Tools
            </button>
          </div>

          {/* ── MA Mode ── */}
          {mode === "ma" && (
            <ScriptProvider>
              {tab === "script" && (
                <>
                  <ScriptFlow />
                  <SessionSummary />
                </>
              )}
              <div style={{ display: tab === "tools" ? "block" : "none" }}>
                <AgentTools />
              </div>
            </ScriptProvider>
          )}

          {/* ── Med Sup Mode ── */}
          {mode === "medsup" && (
            <MedSupProvider>
              {tab === "script" && <MedSupFlow />}
              <div style={{ display: tab === "tools" ? "block" : "none" }}>
                <AgentTools />
              </div>
            </MedSupProvider>
          )}
        </div>
      </div>
    </>
  );
}
