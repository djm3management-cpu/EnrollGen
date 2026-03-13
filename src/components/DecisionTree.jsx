import { useState } from "react";

/* ─── Decision tree data ─────────────────────────────────────────────────── */
const TREE = {
  q1: {
    id: "q1",
    num: "01",
    question: "Is the client 65 or older, or currently Medicare-eligible?",
    hint: "Medicare eligibility includes disability (SSDI) and ESRD — not just age 65+",
    answers: [
      { label: "Yes — 65+ or Medicare-eligible", next: "q2" },
      { label: "No — Under 65, not Medicare-eligible", next: "q5" },
    ],
  },
  q2: {
    id: "q2",
    num: "02",
    question: "Does the client currently have Medicare Parts A & B?",
    hint: "Part A = hospital · Part B = medical — both required before enrolling in MA or Med Sup",
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
    num: "03",
    question: "What is the client primarily looking for in a Medicare plan?",
    answers: [
      {
        label: "Lower or $0 premium · bundled dental/vision/Rx · flexible on provider network",
        next: "result_ma",
      },
      {
        label: "Freedom to see any doctor · predictable costs · willing to pay a higher monthly premium",
        next: "q4",
      },
    ],
  },
  q4: {
    id: "q4",
    num: "04",
    question: "Does the client want prescription drug (Rx) coverage included?",
    answers: [
      { label: "Yes — needs drug coverage", next: "result_medsup_pdp" },
      {
        label: "No — has other creditable coverage or is declining Part D",
        next: "result_medsup",
      },
    ],
  },
  q5: {
    id: "q5",
    num: "05",
    question: "Does the client have access to employer or group health insurance?",
    answers: [
      { label: "Yes — employer coverage is available", next: "q6" },
      { label: "No — no employer coverage available", next: "q7" },
    ],
  },
  q6: {
    id: "q6",
    num: "06",
    question: "Is the employer coverage affordable per ACA standards?",
    hint: "Affordable = employee-only premium at or below 9.96% of household income for plan years beginning in 2026.",
    answers: [
      { label: "Yes — employer coverage is affordable", next: "refer_employer" },
      { label: "No — coverage is unaffordable or inadequate", next: "q7" },
    ],
  },
  refer_employer: {
    id: "refer_employer",
    type: "refer",
    message: "Client likely not eligible for marketplace premium tax credits.",
    detail:
      "Evaluate whether the employer plan meets their needs versus non-ACA alternatives. If they are considering anything off-market, start with state rules, underwriting risk, and product structure before comparing premium.",
    next: "refer_u65_rules",
    nextLabel: "Continue → Non-ACA Triage",
  },
  q7: {
    id: "q7",
    num: "07",
    question: "What is the client's estimated household income relative to the Federal Poverty Level (FPL)?",
    hint: "100–400% FPL typically qualifies for premium tax credits. Below 138% FPL may qualify for Medicaid in expansion states (NJ, PA, VA). GA has not expanded Medicaid.",
    answers: [
      { label: "At or below 400% FPL — likely subsidy-eligible", next: "result_aca" },
      { label: "Above 400% FPL — not subsidy-eligible", next: "q8" },
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
      { label: "Client is subsidy-eligible → ACA On-Exchange", next: "result_aca" },
      { label: "Client is not subsidy-eligible → Non-ACA Triage", next: "refer_u65_rules" },
    ],
  },
  refer_u65_rules: {
    id: "refer_u65_rules",
    type: "refer",
    message: "Start U65 by checking state rules and underwriting risk before quoting any off-market product.",
    detail:
      "There is no universal 'best' off-market plan. Non-ACA options can be short-term medical, fixed indemnity, reimbursement-style, or association/group-based, and the right answer changes by state, health history, and tolerance for coverage gaps.",
    branches: [
      {
        label: "Client needs guaranteed issue or has major ongoing conditions → ACA first",
        next: "result_aca",
      },
      {
        label: "State allows non-ACA options and client can handle underwriting → continue",
        next: "q8",
      },
    ],
  },
  q8: {
    id: "q8",
    num: "08",
    question: "Which non-ACA product architecture fits the client best?",
    hint: "Pick the lane first: temporary underwritten network plan, fixed indemnity, or association/group-style coverage.",
    answers: [
      {
        label: "Healthy case · temporary bridge or broader-network underwritten option",
        next: "result_enrollprime",
      },
      {
        label: "Budget-first · accepts fixed cash benefits and non-ACA gaps",
        next: "result_palic",
      },
      {
        label: "Self-employed / family / 2+ lives · association or group-style option",
        next: "result_lifex",
      },
      {
        label: "State-specific Farm Bureau-style option may exist",
        next: "result_farm_bureau",
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
    label: "Medicare Advantage",
    sublabel: "MA",
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
    label: "Medicare Supplement + Part D",
    sublabel: "MED SUP + PDP",
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
    label: "Medicare Supplement",
    sublabel: "MED SUP",
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
    label: "ACA On-Exchange",
    sublabel: "ACA MARKETPLACE",
    bullets: [
      "NJ → Get Covered NJ · PA → Pennie · VA → marketplace.va.gov · GA → HealthCare.gov",
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
    label: "Underwritten Network Option",
    sublabel: "U65 — PPO / BRIDGE",
    bullets: [
      "Use this lane for healthier bridge cases that want a more familiar network story than indemnity products.",
      "Verify state legality, underwriting, pre-existing condition handling, Rx, and true benefit structure before presenting it as value.",
      "Examples in Carrier Ref include UnitedHealthcare Golden Rule, Pivot Health, and association-based PPO options such as EnrollPrime / AFI where available.",
    ],
  },
  result_palic: {
    id: "result_palic",
    type: "result",
    productLine: "U65",
    color: "#a855f7",
    rgb: "168,85,247",
    label: "PALIC HSP Gold",
    sublabel: "U65 — FIXED BENEFIT",
    bullets: [
      "Pays set dollar amounts per covered service — NOT ACA-compliant major medical",
      "Best only when the client knowingly accepts a budget-first, scheduled-benefit structure",
      "Disclose limitations clearly: client is responsible for costs above fixed benefit amounts and catastrophic exposure can remain significant",
    ],
  },
  result_lifex: {
    id: "result_lifex",
    type: "result",
    productLine: "U65",
    color: "#a855f7",
    rgb: "168,85,247",
    label: "LIFE-X / BHPI Group Health",
    sublabel: "U65 — GROUP",
    bullets: [
      "Use this lane when a group-style or association-based structure fits better than STM or indemnity.",
      "Qualification, participation, and ongoing program mechanics matter as much as premium.",
      "Designed for self-employed cases or multi-life households that can satisfy the product rules.",
    ],
  },
  result_farm_bureau: {
    id: "result_farm_bureau",
    type: "result",
    productLine: "U65",
    color: "#a855f7",
    rgb: "168,85,247",
    label: "Farm Bureau-Style State Option",
    sublabel: "U65 — STATE SPECIFIC",
    bullets: [
      "This can be a strong lane in select states when a Farm Bureau or similar membership-based option is actually available.",
      "Do not assume availability across states; verify membership rules, underwriting, network, and whether the product is true major medical or another non-ACA structure.",
      "Use Carrier Ref to check the state-specific examples before positioning this as the best fit.",
    ],
  },
};

const START_NODE = "q1";

/* ─── Step badge ─────────────────────────────────────────────────────────── */
function StepBadge({ label, color = "#4a5568", bg = "rgba(255,255,255,0.03)", border = "rgba(255,255,255,0.05)" }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        fontFamily: "'Barlow Condensed', sans-serif",
        letterSpacing: "0.08em",
        color,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 4,
        padding: "3px 8px",
        flexShrink: 0,
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

/* ─── Question card ──────────────────────────────────────────────────────── */
function QuestionCard({ node, onNavigate }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div>
      {/* Question text */}
      <p
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 14,
          fontWeight: 500,
          color: "#c0d0e4",
          lineHeight: 1.6,
          margin: "0 0 6px",
        }}
      >
        {node.question}
      </p>
      {node.hint && (
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            color: "#4A4A5A",
            lineHeight: 1.5,
            margin: "0 0 18px",
          }}
        >
          {node.hint}
        </p>
      )}
      {!node.hint && <div style={{ height: 14 }} />}

      {/* Answer options — styled like script say-blocks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {node.answers.map((ans, i) => {
          const isHov = hovered === i;
          return (
            <button
              key={i}
              onClick={() => onNavigate(ans.next, ans.label)}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                width: "100%",
                textAlign: "left",
                background: isHov ? "rgba(232,0,45,0.04)" : "rgba(255,255,255,0.015)",
                border: "1px solid transparent",
                borderLeft: isHov ? "2px solid rgba(232,0,45,0.6)" : "2px solid rgba(255,255,255,0.08)",
                borderRadius: "0 4px 4px 0",
                padding: "10px 14px",
                cursor: "pointer",
                transition: "all 0.13s ease",
              }}
            >
              <span
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 800,
                  fontSize: 13,
                  color: isHov ? "#E8002D" : "#3A3A4A",
                  flexShrink: 0,
                  letterSpacing: "0.06em",
                  lineHeight: 1.6,
                  transition: "color 0.13s",
                }}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13.5,
                  color: isHov ? "#dfe6f0" : "#8A8A9A",
                  lineHeight: 1.6,
                  transition: "color 0.13s",
                }}
              >
                {ans.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Referral card ──────────────────────────────────────────────────────── */
function ReferCard({ node, onNavigate, onReset }) {
  return (
    <div
      style={{
        background: "rgba(255,215,0,0.03)",
        border: "1px solid rgba(255,215,0,0.15)",
        borderLeft: "2px solid rgba(255,215,0,0.5)",
        borderRadius: "0 4px 4px 0",
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <StepBadge
          label="Agent Note"
          color="#b8950a"
          bg="rgba(255,215,0,0.07)"
          border="rgba(255,215,0,0.2)"
        />
      </div>

      <p
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: 15,
          color: "#dfe6f0",
          margin: "0 0 8px",
          lineHeight: 1.35,
          letterSpacing: "0.02em",
        }}
      >
        {node.message}
      </p>

      {node.detail && (
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            color: "#5A5A6A",
            lineHeight: 1.55,
            margin: node.next || node.branches ? "0 0 16px" : "0",
          }}
        >
          {node.detail}
        </p>
      )}

      {node.next && (
        <button
          onClick={() => onNavigate(node.next, node.nextLabel || "Continue")}
          className="primary"
          style={{ marginRight: 10, marginBottom: 10 }}
        >
          {node.nextLabel || "Continue →"}
        </button>
      )}

      {node.branches && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {node.branches.map((b, i) => (
            <button
              key={i}
              onClick={() => onNavigate(b.next, b.label)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "rgba(255,215,0,0.04)",
                border: "1px solid transparent",
                borderLeft: "2px solid rgba(255,215,0,0.35)",
                borderRadius: "0 4px 4px 0",
                padding: "9px 14px",
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                color: "#8A8A9A",
                textAlign: "left",
                transition: "all 0.13s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#dfe6f0";
                e.currentTarget.style.background = "rgba(255,215,0,0.07)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#8A8A9A";
                e.currentTarget.style.background = "rgba(255,215,0,0.04)";
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
          color: "#3A3A4A",
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontSize: 11,
          padding: "6px 0 0",
          display: "block",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#6A6A7A")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#3A3A4A")}
      >
        ← Start Over
      </button>
    </div>
  );
}

/* ─── Result card ────────────────────────────────────────────────────────── */
function ResultCard({ node, onReset }) {
  return (
    <div>
      <div
        style={{
          background: `rgba(${node.rgb},0.04)`,
          border: `1px solid rgba(${node.rgb},0.18)`,
          borderLeft: `2px solid rgba(${node.rgb},0.7)`,
          borderRadius: "0 4px 4px 0",
          padding: "16px 18px",
          marginBottom: 16,
        }}
      >
        {/* Result badge row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <StepBadge
            label="Recommended"
            color={node.color}
            bg={`rgba(${node.rgb},0.08)`}
            border={`rgba(${node.rgb},0.25)`}
          />
          <span
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: `rgba(${node.rgb},0.5)`,
            }}
          >
            {node.sublabel}
          </span>
        </div>

        {/* Product name */}
        <p
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            color: node.color,
            lineHeight: 1.1,
            margin: "0 0 16px",
          }}
        >
          {node.label}
        </p>

        {/* Bullets */}
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {node.bullets.map((b, i) => (
            <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ color: node.color, flexShrink: 0, fontSize: 10, marginTop: 4, opacity: 0.7 }}>▸</span>
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  color: "#8A8A9A",
                  lineHeight: 1.55,
                }}
              >
                {b}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="section-next-action" style={{ justifyContent: "flex-start" }}>
        <button
          className="primary"
          onClick={onReset}
          style={{
            background: "linear-gradient(180deg,#0e0e10 0%,#08080a 100%)",
            color: "#6A6A7A",
            borderColor: "rgba(255,255,255,0.1)",
            borderTopColor: "rgba(255,255,255,0.15)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#dfe6f0";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#6A6A7A";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
          }}
        >
          ↺ Start Over
        </button>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function DecisionTree() {
  const [current, setCurrent] = useState(START_NODE);
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
    }, 150);
  };

  const goBack = (idx) => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      setCurrent(path[idx].nodeId);
      setPath((p) => p.slice(0, idx));
      setAnimating(false);
    }, 150);
  };

  const reset = () => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      setCurrent(START_NODE);
      setPath([]);
      setAnimating(false);
    }, 150);
  };

  const currentNode = TREE[current];
  const stepNum = path.length + 1;

  return (
    <div className="card" style={{ maxWidth: 760, margin: "0 auto", background: "linear-gradient(180deg,#181818 0%,#111111 50%,#0e0e0e 100%)" }}>

      {/* ── Card header ── */}
      <h2 style={{ marginBottom: 16 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {currentNode?.num && !currentNode?.type && (
            <StepBadge
              label={currentNode.num}
              color="#8A8A9A"
              bg="rgba(255,255,255,0.03)"
              border="rgba(255,255,255,0.07)"
            />
          )}
          {currentNode?.type === "result" && (
            <StepBadge
              label="Result"
              color={currentNode.color}
              bg={`rgba(${currentNode.rgb},0.08)`}
              border={`rgba(${currentNode.rgb},0.2)`}
            />
          )}
          {currentNode?.type === "refer" && (
            <StepBadge
              label="Note"
              color="#b8950a"
              bg="rgba(255,215,0,0.07)"
              border="rgba(255,215,0,0.2)"
            />
          )}
          Product Decision Tree
        </span>
        <span
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: "0.1em",
            color: "#2A2A3A",
            textTransform: "uppercase",
          }}
        >
          Step {stepNum}
        </span>
      </h2>

      {/* ── Breadcrumb ── */}
      {path.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 4,
            marginBottom: 16,
            paddingBottom: 14,
            borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          <button
            onClick={reset}
            style={crumbBtn(false)}
          >
            Start
          </button>
          {path.map((step, idx) => {
            const n = TREE[step.nodeId];
            return (
              <span key={idx} style={{ display: "contents" }}>
                <span style={{ color: "#1E1E28", fontSize: 10, userSelect: "none" }}>›</span>
                <button onClick={() => goBack(idx)} style={crumbBtn(idx === path.length - 1)}>
                  {n?.num ?? "—"}
                </button>
              </span>
            );
          })}
          <span style={{ color: "#1E1E28", fontSize: 10, userSelect: "none" }}>›</span>
          <span
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#2A2A3A",
            }}
          >
            {currentNode?.type === "result" ? "Result" : currentNode?.type === "refer" ? "Note" : currentNode?.num}
          </span>
        </div>
      )}

      {/* ── Animated content ── */}
      <div
        style={{
          opacity: animating ? 0 : 1,
          transform: animating ? "translateY(6px)" : "translateY(0)",
          transition: "opacity 0.15s ease, transform 0.15s ease",
        }}
      >
        {currentNode?.type === "result" ? (
          <ResultCard node={currentNode} onReset={reset} />
        ) : currentNode?.type === "refer" ? (
          <ReferCard node={currentNode} onNavigate={navigate} onReset={reset} />
        ) : (
          <QuestionCard node={currentNode} onNavigate={navigate} />
        )}
      </div>
    </div>
  );
}

function crumbBtn(isCurrent) {
  return {
    background: "none",
    border: "none",
    cursor: isCurrent ? "default" : "pointer",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: isCurrent ? "#3A3A4A" : "#E8002D",
    padding: "2px 6px",
    borderRadius: 3,
    opacity: isCurrent ? 1 : 0.8,
    transition: "opacity 0.13s",
  };
}
