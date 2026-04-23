import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import { useScript } from "../../context/ScriptContext";
import {
  DEFAULT_CSNP_CARRIER_VERIFICATION,
  getSnpMedicaidBucket,
  getSnpMedicaidHeaderLabel,
  SNP_CHRONIC_OPTIONS,
  SNP_CURRENT_CARRIER_OPTIONS,
  SNP_MEDICAID_OPTIONS,
  SNP_PRIORITY_OPTIONS,
} from "../../data/snpRoutingData";
import {
  buildSnpRoutingRecommendation,
  loadSnpRoutingContext,
} from "../../lib/snpRouting";

const EMPTY_LOOKUP = {
  zip: "",
  state: "",
  county: "",
  countyResolved: false,
  planInventoryChecked: false,
  planInventorySource: "none",
  plans: [],
  dsnpAlignmentRows: [],
  carrierVerificationMap: DEFAULT_CSNP_CARRIER_VERIFICATION.reduce((acc, row) => {
    acc[row.carrier] = row;
    return acc;
  }, {}),
  routingRules: [],
};

function CollapsibleSubsection({
  title,
  open,
  onToggle,
  children,
}) {
  return (
    <div className="snp-routing-subsection">
      <button
        type="button"
        className="snp-routing-subsection-trigger"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>{title}</span>
        <ChevronDown
          size={14}
          className={`snp-routing-subsection-chevron${open ? " is-open" : ""}`}
        />
      </button>
      {open ? <div className="snp-routing-subsection-body">{children}</div> : null}
    </div>
  );
}

export default function SNPRoutingWidget() {
  const { state, dispatch } = useScript();
  const [collapsed, setCollapsed] = useState(false);
  const [medicaidStatus, setMedicaidStatus] = useState("");
  const [chronicCondition, setChronicCondition] = useState("");
  const [memberPriority, setMemberPriority] = useState("");
  const [zip, setZip] = useState("");
  const [medicaidMco, setMedicaidMco] = useState("");
  const [currentCarrier, setCurrentCarrier] = useState("");
  const [lookup, setLookup] = useState(EMPTY_LOOKUP);
  const [showDisclosures, setShowDisclosures] = useState(false);
  const [showCarrierReference, setShowCarrierReference] = useState(false);
  const [showSepLanes, setShowSepLanes] = useState(false);

  const routeReady = Boolean(medicaidStatus && chronicCondition && memberPriority);
  const medicaidBucket = getSnpMedicaidBucket(medicaidStatus);
  const medicaidHeaderLabel = getSnpMedicaidHeaderLabel(medicaidStatus);

  useEffect(() => {
    let cancelled = false;
    const normalizedZip = zip.replace(/\D/g, "").slice(0, 5);

    if (normalizedZip.length !== 5) {
      setLookup((current) => ({
        ...EMPTY_LOOKUP,
        zip: normalizedZip,
        routingRules: current.routingRules,
        carrierVerificationMap:
          Object.keys(current.carrierVerificationMap || {}).length > 0
            ? current.carrierVerificationMap
            : EMPTY_LOOKUP.carrierVerificationMap,
      }));
      return undefined;
    }

    loadSnpRoutingContext(normalizedZip)
      .then((nextLookup) => {
        if (!cancelled) {
          setLookup(nextLookup);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [zip]);

  const recommendation = useMemo(
    () =>
      buildSnpRoutingRecommendation({
        medicaidStatus,
        chronicCondition,
        memberPriority,
        zip,
        medicaidMco,
        currentCarrier,
        lookup,
      }),
    [
      chronicCondition,
      currentCarrier,
      lookup,
      medicaidMco,
      medicaidStatus,
      memberPriority,
      zip,
    ]
  );

  useEffect(() => {
    if (!routeReady) {
      return;
    }

    const nextSnpType = recommendation?.recommendedScriptType || null;
    if (state.snpType !== nextSnpType) {
      dispatch({ type: "SET_SNP_TYPE", value: nextSnpType });
    }
  }, [dispatch, recommendation?.recommendedScriptType, routeReady, state.snpType]);

  useEffect(() => {
    setShowDisclosures(false);
    setShowCarrierReference(false);
    setShowSepLanes(false);
  }, [recommendation?.routeLabel, recommendation?.selectedPlanLabel]);

  const headerStatus = recommendation
    ? { label: "Recommendation Ready", tone: "ready" }
    : { label: "Not Started", tone: "idle" };
  const headerTitle = medicaidHeaderLabel
    ? `SNP Routing - ${medicaidHeaderLabel}`
    : "SNP Routing";

  const carrierReference = recommendation?.carrierVerification || null;

  return (
    <div className={`agent-notes-widget snp-routing-widget${collapsed ? " is-collapsed" : ""}`}>
      <button
        type="button"
        className="agent-notes-widget-header snp-routing-widget-header"
        onClick={() => setCollapsed((current) => !current)}
        aria-expanded={!collapsed}
      >
        <div className="agent-notes-widget-title-group">
          <span className="agent-notes-widget-icon" aria-hidden="true">
            <ShieldCheck size={11} />
          </span>
          <span className="agent-notes-widget-title">{headerTitle}</span>
        </div>

        <div className="snp-routing-widget-header-meta">
          <span className={`snp-routing-widget-status is-${headerStatus.tone}`}>
            {headerStatus.label}
          </span>
          <ChevronDown
            size={14}
            className={`snp-routing-widget-chevron${collapsed ? "" : " is-open"}`}
          />
        </div>
      </button>

      {!collapsed ? (
        <div className="agent-notes-widget-body snp-routing-widget-body">
          <div className="snp-routing-fields">
            <div className="field-group snp-routing-field-group">
              <label className="field-label snp-routing-field-label">Medicaid Status</label>
              <select
                className="input-dark snp-routing-select"
                value={medicaidStatus}
                onChange={(event) => setMedicaidStatus(event.target.value)}
              >
                {SNP_MEDICAID_OPTIONS.map((option) => (
                  <option key={option.value || "empty"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-group snp-routing-field-group">
              <label className="field-label snp-routing-field-label">Chronic Condition</label>
              <select
                className="input-dark snp-routing-select"
                value={chronicCondition}
                onChange={(event) => setChronicCondition(event.target.value)}
              >
                {SNP_CHRONIC_OPTIONS.map((option) => (
                  <option key={option.value || "empty"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-group snp-routing-field-group">
              <label className="field-label snp-routing-field-label">Member Priority</label>
              <select
                className="input-dark snp-routing-select"
                value={memberPriority}
                onChange={(event) => setMemberPriority(event.target.value)}
              >
                {SNP_PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value || "empty"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="snp-routing-supporting-fields">
            <div className="field-group snp-routing-field-group">
              <label className="field-label snp-routing-field-label">Member ZIP (optional)</label>
              <input
                className="input-dark"
                inputMode="numeric"
                maxLength={5}
                placeholder="Enter 5-digit zip"
                value={zip}
                onChange={(event) =>
                  setZip(event.target.value.replace(/\D/g, "").slice(0, 5))
                }
              />
            </div>

            {medicaidBucket === "full_dual" ? (
              <div className="field-group snp-routing-field-group">
                <label className="field-label snp-routing-field-label">
                  Medicaid MCO (for D-SNP alignment)
                </label>
                <input
                  className="input-dark"
                  placeholder="Optional Medicaid MCO name"
                  value={medicaidMco}
                  onChange={(event) => setMedicaidMco(event.target.value)}
                />
              </div>
            ) : null}

            {routeReady ? (
              <div className="field-group snp-routing-field-group">
                <label className="field-label snp-routing-field-label">
                  Current MA Carrier (optional)
                </label>
                <select
                  className="input-dark snp-routing-select"
                  value={currentCarrier}
                  onChange={(event) => setCurrentCarrier(event.target.value)}
                >
                  {SNP_CURRENT_CARRIER_OPTIONS.map((option) => (
                    <option key={option.value || "empty"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {recommendation ? (
            <div
              className={`snp-routing-recommendation is-${recommendation.status}`}
              style={{ "--snp-route-color": recommendation.statusMeta.color }}
            >
              <div className="snp-routing-recommendation-head">
                <div className="snp-routing-recommendation-kicker">
                  {recommendation.statusMeta.label}
                </div>
                <div className="snp-routing-recommendation-badge">
                  {recommendation.routeLabel}
                </div>
              </div>

              <p className="snp-routing-recommendation-copy">{recommendation.summary}</p>

              {recommendation.selectedPlanLabel ? (
                <div className="snp-routing-recommendation-plan">
                  Suggested plan lane: {recommendation.selectedPlanLabel}
                </div>
              ) : null}

              {recommendation.fallbackRoutes?.length ? (
                <div className="snp-routing-recommendation-fallbacks">
                  Fallbacks: {recommendation.fallbackRoutes.join(" -> ")}
                </div>
              ) : null}

              {recommendation.alerts?.map((alert) => (
                <div
                  key={`${alert.tone}-${alert.text}`}
                  className={`snp-routing-alert is-${alert.tone}`}
                >
                  <AlertTriangle size={13} />
                  <span>{alert.text}</span>
                </div>
              ))}

              {recommendation.commissionFlag ? (
                <div className="snp-routing-muted-line">{recommendation.commissionFlag}</div>
              ) : null}

              {recommendation.disclosures?.length ? (
                <CollapsibleSubsection
                  title="Mandatory Talking Points"
                  open={showDisclosures}
                  onToggle={() => setShowDisclosures((current) => !current)}
                >
                  <ul className="snp-routing-list">
                    {recommendation.disclosures.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </CollapsibleSubsection>
              ) : null}

              {recommendation.routeLabel === "C-SNP" && carrierReference ? (
                <CollapsibleSubsection
                  title="Carrier Verification Reference"
                  open={showCarrierReference}
                  onToggle={() => setShowCarrierReference((current) => !current)}
                >
                  <div className="snp-routing-reference-grid">
                    <div className="snp-routing-reference-item">
                      <span className="snp-routing-reference-label">Method</span>
                      <span>{carrierReference.verification_method}</span>
                    </div>
                    <div className="snp-routing-reference-item">
                      <span className="snp-routing-reference-label">Timeline</span>
                      <span>{carrierReference.verification_timeline}</span>
                    </div>
                    <div className="snp-routing-reference-item">
                      <span className="snp-routing-reference-label">If Not Verified</span>
                      <span>{carrierReference.failed_verification_consequence}</span>
                    </div>
                    <div className="snp-routing-reference-item">
                      <span className="snp-routing-reference-label">Qualifying Buckets</span>
                      <span>{carrierReference.qualifying_conditions.join(", ")}</span>
                    </div>
                  </div>
                </CollapsibleSubsection>
              ) : null}

              {recommendation.sepLanes?.length ? (
                <CollapsibleSubsection
                  title="SEP Routing"
                  open={showSepLanes}
                  onToggle={() => setShowSepLanes((current) => !current)}
                >
                  <ul className="snp-routing-list">
                    {recommendation.sepLanes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </CollapsibleSubsection>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
