import { useState } from "react";
import { ChevronDown, Loader2, RefreshCcw } from "lucide-react";

export const SEP_FINDER_COMPACT_DISCLAIMER =
  "Guidance only. Verify member-level eligibility per CMS procedures.";

export const SEP_FINDER_FULL_DISCLAIMER =
  "This information is provided as a suggestion only, based on currently available data sources. It does not constitute a determination of SEP eligibility for any individual. Please follow all applicable CMS procedures and verify member-level qualifying events before confirming SEP eligibility.";

export function normalizeSepZip(zip) {
  return String(zip || "").replace(/\D/g, "").slice(0, 5);
}

export function parseSepRpcResult(data) {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatCountyList(counties) {
  const names = asArray(counties)
    .map((county) =>
      [county.county_name, county.state_code].filter(Boolean).join(", ")
    )
    .filter(Boolean);
  return names.length ? names.join(" / ") : "";
}

function buildSepDetail(sep) {
  if (!sep) return { count: 0, label: "", items: [] };

  if (Array.isArray(sep.plans) && sep.plans.length) {
    return {
      count: sep.plans.length,
      label: `${sep.plans.length} plan${sep.plans.length === 1 ? "" : "s"}`,
      items: sep.plans.map((plan, index) => ({
        key: `plan-${index}`,
        title: plan.plan_name || plan.contract_id || "Plan",
        meta: [
          plan.organization,
          plan.stars ? `${plan.stars} stars` : "",
          plan.chronic_conditions?.length
            ? `Conditions: ${plan.chronic_conditions.join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join(" - "),
      })),
    };
  }

  if (Array.isArray(sep.disasters) && sep.disasters.length) {
    return {
      count: sep.disasters.length,
      label: `${sep.disasters.length} disaster${sep.disasters.length === 1 ? "" : "s"}`,
      items: sep.disasters.map((disaster) => ({
        key: `disaster-${disaster.disaster_number}`,
        title: disaster.title || `Disaster ${disaster.disaster_number}`,
        meta: [
          disaster.type,
          disaster.declared ? `Declared ${disaster.declared}` : "",
          disaster.sep_ends ? `SEP ends ${disaster.sep_ends}` : "",
        ]
          .filter(Boolean)
          .join(" - "),
      })),
    };
  }

  if (Array.isArray(sep.terminated_plans) && sep.terminated_plans.length) {
    return {
      count: sep.terminated_plans.length,
      label: `${sep.terminated_plans.length} plan${sep.terminated_plans.length === 1 ? "" : "s"} terminated`,
      items: sep.terminated_plans.map((plan, index) => ({
        key: `term-${index}`,
        title: plan.old_plan || plan.old_org || "Terminated plan",
        meta: [
          plan.old_org,
          plan.type,
          plan.effective ? `Effective ${plan.effective}` : "",
          plan.replacement_plan ? `Replacement: ${plan.replacement_plan}` : "",
        ]
          .filter(Boolean)
          .join(" - "),
      })),
    };
  }

  const planCount = Number(sep.plan_count);
  if (Number.isFinite(planCount) && planCount > 0) {
    return {
      count: planCount,
      label: `${planCount} plan${planCount === 1 ? "" : "s"}`,
      items: [],
    };
  }

  return { count: 0, label: "", items: [] };
}

export default function SEPResultsPanel({
  zip,
  result,
  loading = false,
  error = "",
  onRefresh,
  refreshDisabled = false,
  className = "",
  disclaimer = SEP_FINDER_COMPACT_DISCLAIMER,
  emptyPrompt = "Enter a 5-digit ZIP above to scan for area-based SEPs.",
}) {
  const [expanded, setExpanded] = useState({});
  const normalizedZip = normalizeSepZip(zip);
  const seps = asArray(result?.seps);
  const hasAvailableSep = seps.some((sep) => sep?.available);

  const toggleRow = (index) => {
    setExpanded((current) => ({ ...current, [index]: !current[index] }));
  };

  if (normalizedZip.length !== 5 && !result && !loading) {
    return <div className="sep-finder-panel-empty">{emptyPrompt}</div>;
  }

  return (
    <div className={`sep-finder-panel${className ? ` ${className}` : ""}`}>
      <div className="sep-finder-panel-head">
        <div className="sep-finder-panel-head-copy">
          <div className="sep-finder-panel-kicker">Area SEP Lookup</div>
          <div className="sep-finder-panel-zip">
            ZIP {result?.zip || normalizedZip || "-----"}
          </div>
          {result?.counties ? (
            <div className="sep-finder-panel-counties">
              {formatCountyList(result.counties)}
            </div>
          ) : null}
        </div>
        {onRefresh ? (
          <button
            type="button"
            className="sep-finder-refresh"
            onClick={onRefresh}
            disabled={loading || refreshDisabled}
            aria-label="Refresh SEP lookup"
          >
            <RefreshCcw size={11} className={loading ? "is-spinning" : ""} />
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="sep-finder-panel-status">
          <Loader2 size={14} className="sep-finder-spinner" />
          <span>Checking available SEPs for ZIP {normalizedZip}...</span>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="sep-finder-panel-error">{error}</div>
      ) : null}

      {!loading && !error && result ? (
        <>
          {!hasAvailableSep ? (
            <div className="sep-finder-panel-empty">
              No area-based SEPs detected for this ZIP. The beneficiary may still
              qualify for individual-level SEPs (loss of coverage, moved, etc.).
            </div>
          ) : null}

          <div className="sep-finder-card-stack">
            {seps.map((sep, index) => {
              const detail = buildSepDetail(sep);
              const isExpanded = Boolean(expanded[index]);
              const canExpand = detail.items.length > 0;
              return (
                <div
                  key={`${sep.sep_type}-${index}`}
                  className={`sep-finder-card${sep.available ? " is-yes" : " is-no"}`}
                >
                  <div className="sep-finder-card-head">
                    <div className="sep-finder-card-name">
                      <span className="sep-finder-card-dot" aria-hidden="true" />
                      <span>{sep.sep_type}</span>
                    </div>
                    <span
                      className={`sep-finder-card-pill${sep.available ? " is-yes" : " is-no"}`}
                    >
                      {sep.available ? "Yes" : "No"}
                    </span>
                  </div>
                  {sep.cfr_reference ? (
                    <div className="sep-finder-card-cfr">{sep.cfr_reference}</div>
                  ) : null}
                  {sep.period ? (
                    <div className="sep-finder-card-period">{sep.period}</div>
                  ) : null}
                  {sep.evidence ? (
                    <div className="sep-finder-card-evidence">{sep.evidence}</div>
                  ) : null}
                  {detail.label ? (
                    canExpand ? (
                      <button
                        type="button"
                        className="sep-finder-card-detail-trigger"
                        aria-expanded={isExpanded}
                        onClick={() => toggleRow(index)}
                      >
                        <ChevronDown
                          size={11}
                          className={isExpanded ? "is-open" : ""}
                        />
                        <span>{detail.label}</span>
                      </button>
                    ) : (
                      <div className="sep-finder-card-detail-static">
                        {detail.label}
                      </div>
                    )
                  ) : null}
                  {canExpand && isExpanded ? (
                    <ul className="sep-finder-card-detail-list">
                      {detail.items.map((item) => (
                        <li key={item.key}>
                          <span className="sep-finder-card-detail-title">
                            {item.title}
                          </span>
                          {item.meta ? (
                            <span className="sep-finder-card-detail-meta">
                              {item.meta}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {disclaimer ? (
        <p className="sep-finder-panel-disclaimer">{disclaimer}</p>
      ) : null}
    </div>
  );
}
