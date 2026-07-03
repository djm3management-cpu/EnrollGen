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
  border: "1px solid var(--border-default)",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "var(--font-body)",
  outline: "none",
  boxSizing: "border-box",
};

export default function FplCalculatorPanel({
  title = "FPL Chart Reference",
  accentColor = "var(--chart-4)",
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
        background: `color-mix(in srgb, ${accentColor} 3%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accentColor} 15%, transparent)`,
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
              color: "var(--text-muted)",
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
              color: "var(--text-muted)",
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
              color: "var(--text-muted)",
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
              background: "color-mix(in srgb, var(--text-primary) 2%, transparent)",
              border: "1px solid var(--border-default)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
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
                color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
              }}
            >
              ${baseThreshold.toLocaleString()}/year
            </div>
          </div>
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 7,
              background: "color-mix(in srgb, var(--text-primary) 2%, transparent)",
              border: "1px solid var(--border-default)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
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
                fontFamily: "var(--font-body)",
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
                "linear-gradient(90deg, var(--status-live-bg) 0%, var(--status-live-border) 60%, var(--status-pending-border) 75%, var(--status-offline-border) 100%)",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "75%",
                top: 0,
                bottom: 0,
                width: 2,
                background: "var(--status-offline)",
                zIndex: 2,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "75%",
                top: -2,
                fontSize: 8,
                color: "var(--status-offline)",
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
                background: aboveCliff ? "var(--status-offline)" : "var(--status-live)",
                border: "2px solid var(--bg-primary)",
                boxShadow: "none",
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
                ? "var(--status-offline-bg)"
                : "var(--status-live-bg)",
              border: `1px solid ${
                aboveCliff
                  ? "var(--status-offline-border)"
                  : "var(--status-live-border)"
              }`,
            }}
          >
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: aboveCliff ? "var(--status-offline)" : "var(--status-live)",
                fontFamily: "var(--font-body)",
                letterSpacing: "0.04em",
              }}
            >
              {fplPercent}% FPL
            </div>
            <div
              style={{
                fontSize: 12,
                color: aboveCliff ? "var(--status-offline)" : "var(--status-live)",
                marginTop: 2,
                fontWeight: 600,
              }}
            >
              {aboveCliff
                ? "Subsidy cliff. No premium tax credits at this income level."
                : "Within subsidy range. Marketplace pricing may stay competitive."}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              400% FPL threshold: ${(fplThreshold * 4).toLocaleString()}/year
              for household of {householdSize}
            </div>
          </div>

          {aboveCliff && acaEstimate && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 7,
                background: "var(--status-offline-bg)",
                border: "1px solid var(--status-offline-border)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--status-offline)",
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
                  color: "var(--status-offline)",
                  fontFamily: "var(--font-body)",
                }}
              >
                ${acaEstimate.low} to ${acaEstimate.high}/month
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                Use this as a reference point before pivoting away from ACA.
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
