import { useMemo } from "react";
import { Calculator } from "lucide-react";

export const HDPG_DEDUCTIBLE_2026 = 2950;
const DEFAULT_AVERAGE_HOSPITAL_STAY_DAYS = 4.5;

function toNumber(value) {
  const parsed = Number.parseFloat(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function currency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "$0";
  return `$${Math.round(amount).toLocaleString()}`;
}

function decimal(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0.0";
  return amount.toFixed(1);
}

export function calculateHDPGCombo({
  standardGMonthly,
  hdgMonthly,
  hipMonthly,
  hipDailyBenefit,
  averageStayDays = DEFAULT_AVERAGE_HOSPITAL_STAY_DAYS,
}) {
  const standardMonthly = toNumber(standardGMonthly);
  const hdg = toNumber(hdgMonthly);
  const hip = toNumber(hipMonthly);
  const daily = toNumber(hipDailyBenefit);
  const stayDays = toNumber(averageStayDays) || DEFAULT_AVERAGE_HOSPITAL_STAY_DAYS;
  const standardAnnual = standardMonthly * 12;
  const comboAnnual = (hdg + hip) * 12;
  const hdgAnnual = hdg * 12;
  const annualSavings = standardAnnual - comboAnnual;
  const breakevenAdmissions =
    HDPG_DEDUCTIBLE_2026 > 0
      ? (standardAnnual - hdgAnnual) / HDPG_DEDUCTIBLE_2026
      : 0;
  const hipPayout = daily * stayDays;
  const hipOffsetPct =
    HDPG_DEDUCTIBLE_2026 > 0 ? (hipPayout / HDPG_DEDUCTIBLE_2026) * 100 : 0;

  return {
    standardMonthly,
    hdg,
    hip,
    daily,
    stayDays,
    standardAnnual,
    comboAnnual,
    annualSavings,
    breakevenAdmissions,
    hipPayout,
    hipOffsetPct,
  };
}

export default function HDPGComboAnalysis({
  standardGMonthly = "",
  hdgMonthly = "",
  hipMonthly = "",
  hipDailyBenefit = "",
  averageStayDays = DEFAULT_AVERAGE_HOSPITAL_STAY_DAYS,
  onChange,
}) {
  const result = useMemo(
    () =>
      calculateHDPGCombo({
        standardGMonthly,
        hdgMonthly,
        hipMonthly,
        hipDailyBenefit,
        averageStayDays,
      }),
    [averageStayDays, hdgMonthly, hipDailyBenefit, hipMonthly, standardGMonthly]
  );

  const update = (field, value) => onChange?.({ field, value });

  return (
    <div className="sf-panel">
      <div className="sf-panel-heading">
        <span className="sf-dot sf-dot--green" />
        <span>HDPG + HIP Strategy</span>
      </div>
      <div className="sf-form-grid">
        <label>
          Standard G
          <input
            value={standardGMonthly}
            onChange={(event) => update("standardGMonthly", event.target.value)}
            placeholder="$ / mo"
          />
        </label>
        <label>
          HDG
          <input
            value={hdgMonthly}
            onChange={(event) => update("hdgMonthly", event.target.value)}
            placeholder="$ / mo"
          />
        </label>
        <label>
          HIP Premium
          <input
            value={hipMonthly}
            onChange={(event) => update("hipMonthly", event.target.value)}
            placeholder="$ / mo"
          />
        </label>
        <label>
          HIP Daily
          <input
            value={hipDailyBenefit}
            onChange={(event) => update("hipDailyBenefit", event.target.value)}
            placeholder="$ / day"
          />
        </label>
      </div>

      <div className="sf-comparison-grid">
        <article className="sf-mini-card">
          <strong>Standard Plan G</strong>
          <span className="sf-big-number">{currency(result.standardAnnual)}</span>
          <p>Annual premium before any carrier discounts.</p>
        </article>
        <article className="sf-mini-card">
          <strong>HDG + Hospital Protection</strong>
          <span className="sf-big-number">{currency(result.comboAnnual)}</span>
          <p>Annual HDG premium plus Hospital Protection premium.</p>
        </article>
      </div>

      <div className={`sf-savings-callout${result.annualSavings >= 0 ? " is-positive" : " is-negative"}`}>
        <Calculator size={14} />
        <span>
          {result.annualSavings >= 0
            ? `${currency(result.annualSavings)} estimated annual savings`
            : `${currency(Math.abs(result.annualSavings))} higher annual premium`}
        </span>
      </div>

      <div className="sf-script-box">
        <p>
          Your client would need {decimal(result.breakevenAdmissions)} full
          HDG deductible events per year before Standard G becomes cheaper.
        </p>
        <p>
          If hospitalized for {decimal(result.stayDays)} days at {currency(result.daily)}
          /day, Hospital Protection pays {currency(result.hipPayout)}, covering{" "}
          {Math.round(result.hipOffsetPct)}% of the {currency(HDPG_DEDUCTIBLE_2026)}
          HDG deductible.
        </p>
      </div>

      {result.annualSavings > 0 ? (
        <div className="sf-script-box">
          <div className="sf-script-label">Agent script</div>
          <p>
            There is actually a strategy that could save you about{" "}
            {currency(result.annualSavings)}/year while keeping the same coverage.
            Instead of standard Plan G at {currency(result.standardMonthly)}, we use
            the high deductible version at {currency(result.hdg)} and pair it with a
            Hospital Protection plan at {currency(result.hip)}. The hospital plan
            kicks in cash if you are ever admitted, which offsets that deductible.
            Most of our clients who are in good health find this saves them real money.
          </p>
        </div>
      ) : null}
    </div>
  );
}
