import { memo, useMemo } from "react";
import { useScript } from "../../context/ScriptContext";

function tokenize(value) {
  if (!value || typeof value !== "string") return [];
  return value
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const PlanContextCard = memo(function PlanContextCard() {
  const { state } = useScript();
  const notes = state.notes || {};

  const carrier = notes.carrierName?.trim() || "";
  const planName = notes.planName?.trim() || "";
  const planId = notes.planId?.trim() || "";
  const planType = notes.planType?.trim() || (planId.includes("HMO") ? "HMO-POS" : "");
  const premium = notes.premium?.trim() || "";
  const effectiveDate = notes.effectiveDate?.trim() || "";
  const benefits = useMemo(() => {
    const tokens = tokenize(notes.benefitPills || notes.benefits);
    if (tokens.length) return tokens;
    return [
      premium ? `${premium} premium` : "",
      effectiveDate ? `Eff. ${effectiveDate}` : "",
    ].filter(Boolean);
  }, [notes.benefitPills, notes.benefits, effectiveDate, premium]);

  const planMeta = [planId, planType].filter(Boolean).join(" - ");

  return (
    <div className="eg-rail-card">
      <div className="eg-rail-card__label">PRESENTING</div>
      {(carrier || planName) ? (
        <>
          <div className="eg-rail-card__plan">
            {planName || carrier}
          </div>
          {planMeta ? (
            <div className="eg-rail-card__plan-meta">{planMeta}</div>
          ) : null}
        </>
      ) : (
        <>
          <div className="eg-rail-card__plan" style={{ color: "var(--eg-text-faint)" }}>
            No plan selected yet
          </div>
          <div className="eg-rail-card__plan-meta">
            Plan info populates when you reach Plan Selection.
          </div>
        </>
      )}
      {benefits.length ? (
        <div className="eg-rail-card__pills">
          {benefits.map((pill) => (
            <span key={pill} className="benefit-pill eg-benefit-pill">
              {pill}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
});

export default PlanContextCard;
