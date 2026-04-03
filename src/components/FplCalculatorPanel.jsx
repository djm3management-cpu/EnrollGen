import { motion } from "framer-motion";
import {
  calcFplPercent,
  getAcaEstimate,
  getFplThreshold,
} from "../flows/u65/U65Data";

const BASE_INPUT_STYLE = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
  color: "#c0d0e4",
  fontSize: 13,
  fontFamily: "var(--font-body)",
  outline: "none",
  boxSizing: "border-box",
};

export default function FplCalculatorPanel({
  title = "FPL Chart Reference",
  accentColor = "#a855f7",
  accentRgb = "168,85,247",
  fields,
  onFieldChange,
}) {
  const householdSize = fields?.householdSize ?? null;
  const annualIncome = fields?.annualIncome ?? null;
  const clientAge = fields?.clientAge ?? null;

  const hasHousehold = householdSize !== null;
  const hasResult = householdSize !== null && annualIncome !== null;

  const baseThreshold = hasHousehold ? getFplThreshold(householdSize) : null;
  const fplThreshold = fields?.fplThreshold ?? baseThreshold;
  const fplPercent =
    fields?.fplPercent ??
    (hasResult ? calcFplPercent(householdSize, annualIncome) : null);
  const aboveCliff =
    fields?.aboveCliff ?? (fplPercent !== null ? fplPercent > 400 : null);
  const acaEstimate =
    fields?.acaEstimate ?? (clientAge ? getAcaEstimate(clientAge) : null);

  const setField = (field, nextValue) => {
    const parsed =
      nextValue === "" || Number.isNaN(Number(nextValue))
        ? null
        : Number(nextValue);
    onFieldChange?.(field, parsed);
  };

  return (
    <div
      style={{
        background: `rgba(${accentRgb},0.03)`,
        border: `1px solid rgba(${accentRgb},0.15)`,
        borderRadius: 8,
        padding: "14px 16px",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: accentColor,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {title}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
          marginBottom: hasHousehold ? 10 : 12,
        }}
      >
        <div>
          <label
            style={{
              fontSize: 10,
              color: "#6b7a8d",
              display: "block",
              marginBottom: 3,
            }}
          >
            Household Size
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={householdSize ?? ""}
            onChange={(e) => setField("householdSize", e.target.value)}
            style={BASE_INPUT_STYLE}
            placeholder="1"
          />
        </div>
        <div>
          <label
            style={{
              fontSize: 10,
              color: "#6b7a8d",
              display: "block",
              marginBottom: 3,
            }}
          >
            Annual Income ($)
          </label>
          <input
            type="number"
            min="0"
            value={annualIncome ?? ""}
            onChange={(e) => setField("annualIncome", e.target.value)}
            style={BASE_INPUT_STYLE}
            placeholder="65000"
          />
        </div>
        <div>
          <label
            style={{
              fontSize: 10,
              color: "#6b7a8d",
              display: "block",
              marginBottom: 3,
            }}
          >
            Client Age
          </label>
          <input
            type="number"
            min="18"
            max="64"
            value={clientAge ?? ""}
            onChange={(e) => setField("clientAge", e.target.value)}
            style={BASE_INPUT_STYLE}
            placeholder="45"
          />
        </div>
      </div>

      {hasHousehold && baseThreshold !== null && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 7,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "#6b7a8d",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 3,
              }}
            >
              Base FPL
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "#dfe6f0",
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              ${baseThreshold.toLocaleString()}/year
            </div>
          </div>
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 7,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "#6b7a8d",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 3,
              }}
            >
              400% FPL
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: accentColor,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              ${(baseThreshold * 4).toLocaleString()}/year
            </div>
          </div>
        </div>
      )}

      {hasResult && fplPercent !== null && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            style={{
              position: "relative",
              height: 28,
              borderRadius: 6,
              overflow: "hidden",
              marginBottom: 10,
              background:
                "linear-gradient(90deg, rgba(52,211,153,0.15) 0%, rgba(52,211,153,0.25) 60%, rgba(234,179,8,0.3) 75%, rgba(248,113,113,0.35) 100%)",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "75%",
                top: 0,
                bottom: 0,
                width: 2,
                background: "#f87171",
                zIndex: 2,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "75%",
                top: -2,
                fontSize: 8,
                color: "#f87171",
                fontWeight: 700,
                transform: "translateX(-50%)",
                whiteSpace: "nowrap",
              }}
            >
              400% FPL
            </div>
            <div
              style={{
                position: "absolute",
                left: `${Math.min(
                  Math.max((fplPercent / 600) * 100, 2),
                  98
                )}%`,
                top: 8,
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: aboveCliff ? "#f87171" : "#34d399",
                border: "2px solid #0c1017",
                boxShadow: aboveCliff
                  ? "0 0 8px rgba(248,113,113,0.6)"
                  : "0 0 8px rgba(52,211,153,0.6)",
                transform: "translateX(-50%)",
                zIndex: 3,
              }}
            />
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderRadius: 7,
              marginBottom: 8,
              background: aboveCliff
                ? "rgba(248,113,113,0.06)"
                : "rgba(52,211,153,0.06)",
              border: `1px solid ${
                aboveCliff
                  ? "rgba(248,113,113,0.2)"
                  : "rgba(52,211,153,0.2)"
              }`,
            }}
          >
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: aboveCliff ? "#f87171" : "#34d399",
                fontFamily: "'Barlow Condensed', sans-serif",
                letterSpacing: "0.04em",
              }}
            >
              {fplPercent}% FPL
            </div>
            <div
              style={{
                fontSize: 12,
                color: aboveCliff ? "#f87171" : "#34d399",
                marginTop: 2,
                fontWeight: 600,
              }}
            >
              {aboveCliff
                ? "Subsidy cliff. No premium tax credits at this income level."
                : "Within subsidy range. Marketplace pricing may stay competitive."}
            </div>
            <div style={{ fontSize: 11, color: "#6b7a8d", marginTop: 4 }}>
              400% FPL threshold: ${(fplThreshold * 4).toLocaleString()}/year
              for household of {householdSize}
            </div>
          </div>

          {aboveCliff && acaEstimate && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 7,
                background: "rgba(248,113,113,0.04)",
                border: "1px solid rgba(248,113,113,0.12)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "#f87171",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                ACA Estimate (Age {clientAge})
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#f87171",
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}
              >
                ${acaEstimate.low} to ${acaEstimate.high}/month
              </div>
              <div style={{ fontSize: 11, color: "#8fa4bc", marginTop: 4 }}>
                Use this as a reference point before pivoting away from ACA.
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
