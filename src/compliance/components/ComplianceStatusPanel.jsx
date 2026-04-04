import { memo } from "react";
import { getCategoryDefinitions } from "../../context/ComplianceScorer";
import { useLiveCall } from "../../context/LiveCallContext";

const CATEGORY_LABELS = {
  "Call Opening": "OPEN",
  "Required Disclosures": "DISC",
  "Scope of Appointment": "SOA",
  "Eligibility Verification": "ELIG",
  "Needs Assessment": "NEEDS",
  "Presentation / SOB": "SOB",
  "Consent for Enrollment": "CONS",
  "Call Closing": "CLOSE",
  "Consumer Experience": "CX",
};

const CATEGORY_DEFINITIONS = getCategoryDefinitions();

function getCategoryStatus(score) {
  if (score >= 75) return "pass";
  if (score > 0) return "partial";
  return "fail";
}

function getStatusColor(status) {
  if (status === "pass") return "#00D166";
  if (status === "partial") return "#FFD700";
  return "#FF4455";
}

const ComplianceStatusPanel = memo(function ComplianceStatusPanel() {
  const { liveCall } = useLiveCall();
  const result = liveCall.complianceResult;

  if (!liveCall.callStarted) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#555",
            }}
          />
          <span>Compliance</span>
        </div>
        <div style={emptyStateStyle}>No active call</div>
      </div>
    );
  }

  const categories = CATEGORY_DEFINITIONS.map((definition) => {
    const liveCategory =
      result?.categories?.find((category) => category.name === definition.name) ||
      null;
    const score = liveCategory?.score || 0;
    const status = getCategoryStatus(score);

    return {
      name: definition.name,
      short: CATEGORY_LABELS[definition.name] || definition.name.slice(0, 4),
      score,
      status,
      color: getStatusColor(status),
    };
  });

  const passCount = categories.filter((category) => category.status === "pass").length;
  const partialCount = categories.filter((category) => category.status === "partial").length;
  const failCount = categories.length - passCount - partialCount;
  const score = result?.score || 0;
  const scoreColor =
    score >= 75 ? "#00D166" : score > 0 ? "#FFD700" : "#FF4455";

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#E8002D",
            boxShadow: "0 0 6px rgba(232,0,45,0.5)",
            animation: liveCall.isListening
              ? "pulse 2s ease-in-out infinite"
              : "none",
          }}
        />
        <span>Compliance</span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            color: scoreColor,
          }}
        >
          {score}%
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 6,
        }}
      >
        {categories.map((category) => (
          <div
            key={category.name}
            title={`${category.name}: ${category.score}%`}
            style={{
              textAlign: "center",
              padding: "6px 3px",
              borderRadius: 4,
              background:
                category.status === "pass"
                  ? "rgba(0,209,102,0.08)"
                  : category.status === "partial"
                  ? "rgba(255,215,0,0.08)"
                  : "rgba(255,68,85,0.08)",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: category.color,
                margin: "0 auto 4px",
                boxShadow: `0 0 4px ${category.color}`,
              }}
            />
            <div
              style={{
                fontSize: "0.52rem",
                fontFamily: "var(--font-display)",
                color: category.color,
                letterSpacing: "0.04em",
                fontWeight: 600,
              }}
            >
              {category.short}
            </div>
          </div>
        ))}
      </div>

      <div style={metaRowStyle}>
        <span>{passCount} pass</span>
        <span>{partialCount} partial</span>
        <span>{failCount} fail</span>
      </div>

      <div
        style={{
          marginTop: 6,
          fontSize: "0.58rem",
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {liveCall.callDirection}
      </div>
    </div>
  );
});

const panelStyle = {
  background: "var(--bg-card)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 8,
  padding: "10px 12px",
  fontFamily: "var(--font-body)",
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: "0.68rem",
  fontFamily: "var(--font-display)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
  marginBottom: 8,
};

const metaRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: 7,
  fontSize: "0.6rem",
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
};

const emptyStateStyle = {
  fontSize: "0.72rem",
  color: "var(--text-muted)",
  padding: "6px 0",
  textAlign: "center",
};

export default ComplianceStatusPanel;
