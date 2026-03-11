import { useState } from "react";

/* ─── Decision tree data ─────────────────────────────────────────────────── */
const TREE = {
  q1: {
    id: "q1",
    question: "Is the client 65 or older, or currently Medicare-eligible?",
    hint: "Medicare eligibility includes disability (SSDI) and ESRD, not just age 65+",
    answers: [
      { label: "Yes — 65+ or Medicare-eligible", next: "q2" },
      { label: "No — Under 65, not Medicare-eligible", next: "q5" },
    ],
  },
  q2: {
    id: "q2",
    question: "Does the client currently have Medicare Parts A & B?",
    hint: "Part A = hospital, Part B = medical — both are required before enrolling in MA or Med Sup",
    answers: [
      { label: "Yes — enrolled in both Part A & B", next: "q3" },
      { label: "No — not yet enrolled in Medicare", next: "refer_medicare" },
    ],
  },
  refer_medicare: {
    id: "refer_medicare",
    type: "refer",
    message: "Client needs to enroll in Original Medicare first.",
    detail:
      "Refer to medicare.gov or the Social Security Administration (1-800-772-1213). Once Parts A & B are active, restart this flow.",
    next: null,
  },
  q3: {
    id: "q3",
    question: "What is the client primarily looking for in a Medicare plan?",
    answers: [
      {
        label:
          "Lower or $0 premium · bundled dental/vision/Rx · flexible on provider network",
        next: "result_ma",
      },
      {
        label:
          "Freedom to see any doctor · predictable costs · willing to pay a higher monthly premium",
        next: "q4",
      },
    ],
  },
  q4: {
    id: "q4",
    question: "Does the client want prescription drug (Rx) coverage included?",
    answers: [
      { label: "Yes — needs drug coverage", next: "result_medsup_pdp" },
      {
        label:
          "No — has other creditable coverage or is declining Part D",
        next: "result_medsup",
      },
    ],
  },
  q5: {
    id: "q5",
    question:
      "Does the client have access to employer or group health insurance?",
    answers: [
      { label: "Yes — employer coverage is available", next: "q6" },
      { label: "No — no employer coverage available", next: "q7" },
    ],
  },
  q6: {
    id: "q6",
    question:
      "Is the employer coverage affordable per ACA standards?",
    hint:
      "Affordable = employee-only premium < 8.39% of household income (2024 IRS threshold)",
    answers: [
      {
        label: "Yes — employer coverage is affordable",
        next: "refer_employer",
      },
      { label: "No — coverage is unaffordable or inadequate", next: "q7" },
    ],
  },
  refer_employer: {
    id: "refer_employer",
    type: "refer",
    message:
      "Client likely not eligible for marketplace premium tax credits.",
    detail:
      "Evaluate whether the employer plan meets their needs vs. off-exchange options. Client may still benefit from supplemental U65 products if the employer plan has high cost-sharing.",
    next: "q8",
    nextLabel: "Continue → Explore U65 Off-Exchange",
  },
  q7: {
    id: "q7",
    question:
      "What is the client's estimated household income relative to the Federal Poverty Level (FPL)?",
    hint:
      "100–400% FPL typically qualifies for premium tax credits. Below 138% FPL may qualify for Medicaid in expansion states (NJ, PA, VA). GA has not expanded Medicaid.",
    answers: [
      {
        label: "At or below 400% FPL — likely subsidy-eligible",
        next: "result_aca",
      },
      {
        label: "Above 400% FPL — not subsidy-eligible",
        next: "q8",
      },
      { label: "Unknown / Not sure", next: "refer_income" },
    ],
  },
  refer_income: {
    id: "refer_income",
    type: "refer",
    message: "Verify income eligibility before recommending a product.",
    detail:
      "Use healthcare.gov or the state marketplace income estimator to check subsidy eligibility. Do not assume — incorrect guidance can harm the client's coverage or tax situation.",
    branches: [
      {
        label: "Client is subsidy-eligible → ACA On-Exchange",
        next: "result_aca",
      },
      {
        label: "Client is not subsidy-eligible → U65 Off-Exchange",
        next: "q8",
      },
    ],
  },
  q8: {
    id: "q8",
    question: "Which U65 product structure fits the client best?",
    hint:
      "Client is under 65 and either above 400% FPL or has affordable employer coverage they want to supplement",
    answers: [
      {
        label:
          "PPO network · comprehensive major medical · broad access to specialists",
        next: "result_enrollprime",
      },
      {
        label:
          "Fixed-benefit indemnity · set dollar payout per service · lower premium",
        next: "result_palic",
      },
      {
        label:
          "Self-employed or small group (2+ members) · wants group health plan",
        next: "result_lifex",
      },
    ],
  },

  /* ─── Results ─────────────────────────────────────────────────────────── */
  result_ma: {
    id: "result_ma",
    type: "result",
    productLine: "MA",
    color: "#E8002D",
    rgb: "232,0,45",
    label: "Medicare Advantage (MA)",
    bullets: [
      "Bundled coverage — medical, Rx, dental, and vision often in one plan",
      "Low or $0 monthly premium; cost-sharing through copays and coinsurance",
      "Ideal for clients who want simplicity and are comfortable with a network",
    ],
  },
  result_medsup_pdp: {
    id: "result_medsup_pdp",
    type: "result",
    productLine: "MedSup",
    color: "#00D166",
    rgb: "0,209,102",
    label: "Medicare Supplement + Standalone Part D (PDP)",
    bullets: [
      "Freedom to see any Medicare-accepting provider nationwide — no referrals needed",
      "Supplement covers Original Medicare gaps (deductibles, coinsurance, copays)",
      "Pair with a standalone Part D plan to add prescription drug coverage",
    ],
  },
  result_medsup: {
    id: "result_medsup",
    type: "result",
    productLine: "MedSup",
    color: "#00D166",
    rgb: "0,209,102",
    label: "Medicare Supplement (no standalone Part D needed)",
    bullets: [
      "Total provider freedom — any Medicare-accepting physician or hospital, nationwide",
      "Predictable out-of-pocket costs with no network restrictions",
      "Client has separate creditable drug coverage or is knowingly declining Part D",
    ],
  },
  result_aca: {
    id: "result_aca",
    type: "result",
    productLine: "ACA",
    color: "#EAB308",
    rgb: "234,179,8",
    label: "ACA On-Exchange (State Marketplace)",
    bullets: [
      "NJ → Get Covered NJ · PA → Pennie · VA → marketplace.va.gov · GA → HealthCare.gov (FFM)",
      "Premium tax credits and cost-sharing reductions available based on household income",
      "All plans include Essential Health Benefits — comprehensive major medical coverage",
    ],
  },
  result_enrollprime: {
    id: "result_enrollprime",
    type: "result",
    productLine: "U65",
    color: "#a855f7",
    rgb: "168,85,247",
    label: "EnrollPrime / AFI PPO (Cigna)",
    bullets: [
      "Broad Cigna Open Access PPO — access to major hospital systems and specialists",
      "Comprehensive major medical for individuals and families above the subsidy threshold",
      "Year-round enrollment; no APTC but flexibility outside ACA marketplace constraints",
    ],
  },
  result_palic: {
    id: "result_palic",
    type: "result",
    productLine: "U65",
    color: "#a855f7",
    rgb: "168,85,247",
    label: "PALIC HSP Gold (Fixed-Benefit Indemnity)",
    bullets: [
      "Pays set dollar amounts per covered service — NOT ACA-compliant major medical",
      "Significantly lower premium; ideal as a standalone budget plan or supplement",
      "Disclose limitations clearly: client is responsible for costs above fixed benefit amounts",
    ],
  },
  result_lifex: {
    id: "result_lifex",
    type: "result",
    productLine: "U65",
    color: "#a855f7",
    rgb: "168,85,247",
    label: "LIFE-X / BHPI Group Health",
    bullets: [
      "Group health plan via Research Associate employment model — minimum 2 members",
      "Association-based structure may unlock better rates than the individual market",
      "Designed for self-employed individuals and small businesses needing comprehensive group benefits",
    ],
  },
};

const START_NODE = "q1";

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function shortLabel(nodeId) {
  const n = TREE[nodeId];
  if (!n) return nodeId;
  if (n.type === "result") return n.label;
  if (n.type === "refer") return "Note";
  // First 4 words of question
  return n.question.split(" ").slice(0, 4).join(" ") + "…";
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */
function QuestionCard({ node, onNavigate }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <p
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: "1.2rem",
            letterSpacing: "0.02em",
            color: "#F0F0F0",
            lineHeight: 1.35,
            margin: 0,
          }}
        >
          {node.question}
        </p>
        {node.hint && (
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "0.75rem",
              color: "#4A4A5A",
              marginTop: 8,
              marginBottom: 0,
              lineHeight: 1.5,
            }}
          >
            {node.hint}
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {node.answers.map((ans, i) => {
          const isHov = hovered === i;
          return (
            <button
              key={i}
              onClick={() => onNavigate(ans.next, ans.label)}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                background: isHov
                  ? "rgba(232,0,45,0.07)"
                  : "rgba(255,255,255,0.02)",
                border: isHov
                  ? "1px solid rgba(232,0,45,0.35)"
                  : "1px solid rgba(255,255,255,0.09)",
                borderLeft: "3px solid #E8002D",
                borderRadius: 4,
                padding: "14px 18px",
                textAlign: "left",
                cursor: "pointer",
                color: isHov ? "#F0F0F0" : "#C0C0C0",
                fontSize: "0.9rem",
                fontFamily: "'DM Sans', sans-serif",
                lineHeight: 1.45,
                transition: "all 0.13s ease",
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
              }}
            >
              <span
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 800,
                  fontSize: "0.95rem",
                  color: "#E8002D",
                  flexShrink: 0,
                  lineHeight: 1.45,
                  minWidth: 16,
                }}
              >
                {String.fromCharCode(65 + i)}
              </span>
              {ans.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReferCard({ node, onNavigate, onReset }) {
  return (
    <div
      style={{
        background: "rgba(255,215,0,0.04)",
        border: "1px solid rgba(255,215,0,0.2)",
        borderLeft: "3px solid #FFD700",
        borderRadius: 4,
        padding: "20px 22px",
      }}
    >
      <div
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 800,
          fontSize: "0.65rem",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "#FFD700",
          marginBottom: 10,
        }}
      >
        ⚠ Agent Note
      </div>
      <p
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: "1.1rem",
          color: "#F0F0F0",
          marginBottom: 10,
          lineHeight: 1.35,
        }}
      >
        {node.message}
      </p>
      {node.detail && (
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "0.83rem",
            color: "#7A7A8A",
            lineHeight: 1.55,
            marginBottom: node.next || node.branches ? 20 : 0,
          }}
        >
          {node.detail}
        </p>
      )}

      {/* Single "continue" next */}
      {node.next && (
        <button
          onClick={() => onNavigate(node.next, node.nextLabel || "Continue")}
          style={{
            background: "rgba(255,215,0,0.1)",
            border: "1px solid rgba(255,215,0,0.35)",
            borderRadius: 3,
            padding: "8px 20px",
            cursor: "pointer",
            color: "#FFD700",
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontSize: "0.75rem",
            marginRight: 10,
            marginBottom: 10,
          }}
        >
          {node.nextLabel || "Continue →"}
        </button>
      )}

      {/* Branch options */}
      {node.branches && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {node.branches.map((b, i) => (
            <button
              key={i}
              onClick={() => onNavigate(b.next, b.label)}
              style={{
                background: "rgba(255,215,0,0.05)",
                border: "1px solid rgba(255,215,0,0.2)",
                borderLeft: "3px solid rgba(255,215,0,0.4)",
                borderRadius: 3,
                padding: "10px 16px",
                cursor: "pointer",
                color: "#FFD700",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "0.85rem",
                textAlign: "left",
                lineHeight: 1.4,
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={onReset}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#4A4A5A",
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontSize: "0.65rem",
          padding: "4px 0",
          marginTop: 4,
        }}
      >
        ← Start Over
      </button>
    </div>
  );
}

function ResultCard({ node, onReset }) {
  return (
    <div>
      <div
        style={{
          background: `rgba(${node.rgb},0.06)`,
          border: `1px solid rgba(${node.rgb},0.22)`,
          borderTop: `3px solid ${node.color}`,
          borderRadius: 4,
          padding: "24px 26px",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: "0.62rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: node.color,
            opacity: 0.75,
            marginBottom: 10,
          }}
        >
          ✓ Recommended Product
        </div>
        <h2
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: "1.75rem",
            letterSpacing: "0.03em",
            color: node.color,
            lineHeight: 1.1,
            marginBottom: 22,
            margin: "0 0 22px",
          }}
        >
          {node.label}
        </h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 11 }}>
          {node.bullets.map((b, i) => (
            <li
              key={i}
              style={{ display: "flex", alignItems: "flex-start", gap: 12 }}
            >
              <span
                style={{
                  color: node.color,
                  flexShrink: 0,
                  marginTop: 3,
                  fontSize: "0.7rem",
                }}
              >
                ▸
              </span>
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "0.88rem",
                  color: "#B8B8C8",
                  lineHeight: 1.5,
                }}
              >
                {b}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={onReset}
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 3,
          padding: "9px 22px",
          cursor: "pointer",
          color: "#6A6A7A",
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontSize: "0.7rem",
          transition: "all 0.13s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#D0D0D0";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#6A6A7A";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
        }}
      >
        ↺ Start Over
      </button>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function DecisionTree() {
  const [current, setCurrent] = useState(START_NODE);
  // path = [{ nodeId, answerLabel }, ...]
  const [path, setPath] = useState([]);
  const [animating, setAnimating] = useState(false);

  const node = TREE[current];

  const navigate = (nextId, answerLabel) => {
    if (animating || !TREE[nextId]) return;
    setAnimating(true);
    setTimeout(() => {
      setPath((p) => [...p, { nodeId: current, answerLabel }]);
      setCurrent(nextId);
      setAnimating(false);
    }, 170);
  };

  const goBack = (idx) => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      setCurrent(path[idx].nodeId);
      setPath((p) => p.slice(0, idx));
      setAnimating(false);
    }, 170);
  };

  const reset = () => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      setCurrent(START_NODE);
      setPath([]);
      setAnimating(false);
    }, 170);
  };

  return (
    <div className="card" style={{ maxWidth: 800, margin: "0 auto", background: "linear-gradient(180deg, #181818 0%, #111111 50%, #0e0e0e 100%)" }}>
      {/* ── Header ── */}
      <h2 style={{ margin: "0 0 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: "#E8002D" }}>◈</span>
        Product Decision Tree
      </h2>

      {/* ── Breadcrumb ── */}
      {path.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 4,
            marginBottom: 22,
            padding: "9px 14px",
            background: "#0a0a0a",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 4,
          }}
        >
          <button
            onClick={reset}
            style={crumbStyle(false)}
          >
            Start
          </button>
          {path.map((step, idx) => (
            <span key={idx} style={{ display: "contents" }}>
              <span
                style={{
                  color: "#2A2A3A",
                  fontSize: "0.7rem",
                  userSelect: "none",
                  padding: "0 2px",
                }}
              >
                ›
              </span>
              <button
                onClick={() => goBack(idx)}
                style={crumbStyle(idx === path.length - 1)}
                title={step.answerLabel}
              >
                {shortLabel(step.nodeId)}
              </button>
            </span>
          ))}
          <span style={{ color: "#2A2A3A", fontSize: "0.7rem", userSelect: "none", padding: "0 2px" }}>›</span>
          <span
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: "0.65rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#4A4A5A",
              padding: "3px 8px",
            }}
          >
            {node?.type === "result"
              ? "Result"
              : node?.type === "refer"
              ? "Note"
              : "Current"}
          </span>
        </div>
      )}

      {/* ── Animated content area ── */}
      <div
        style={{
          opacity: animating ? 0 : 1,
          transform: animating ? "translateY(8px)" : "translateY(0)",
          transition: "opacity 0.17s ease, transform 0.17s ease",
        }}
      >
        {node?.type === "result" ? (
          <ResultCard node={node} onReset={reset} />
        ) : node?.type === "refer" ? (
          <ReferCard node={node} onNavigate={navigate} onReset={reset} />
        ) : (
          <QuestionCard node={node} onNavigate={navigate} />
        )}
      </div>

      {/* ── Step counter ── */}
      {node?.type !== "result" && (
        <div style={{ marginTop: 22, textAlign: "right" }}>
          <span
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: "0.6rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#2A2A3A",
            }}
          >
            Step {path.length + 1}
          </span>
        </div>
      )}
    </div>
  );
}

function crumbStyle(isCurrent) {
  return {
    background: "none",
    border: "none",
    cursor: isCurrent ? "default" : "pointer",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 700,
    fontSize: "0.65rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: isCurrent ? "#5A5A6A" : "#E8002D",
    padding: "3px 8px",
    borderRadius: 3,
    transition: "color 0.13s",
    opacity: isCurrent ? 1 : 0.85,
  };
}
