import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { fetchCarrierProfileByCode } from "../../services/salesForumReferenceService";

const BUNDLES = [
  {
    id: "essential",
    label: "Essential Bundle",
    riders: [
      "Ambulance and Emergency Care",
      "Skilled Nursing Facility",
      "Home Health Care",
    ],
  },
  {
    id: "comprehensive",
    label: "Comprehensive Bundle",
    riders: [
      "Ambulance and Emergency Care",
      "Skilled Nursing Facility",
      "Home Health Care",
      "Outpatient Surgical",
      "Outpatient Therapy",
      "Major Diagnostic Tests",
    ],
  },
  {
    id: "full",
    label: "Full Protection",
    riders: [
      "Guaranteed Purchase Option",
      "Lump Sum Cancer Benefit",
      "Prescription Drug",
      "Skilled Nursing Facility",
      "Home Health Care",
      "Ambulance and Emergency Care",
      "Outpatient Surgical",
      "Outpatient Therapy",
      "Major Diagnostic Tests",
    ],
  },
];

export default function MOHRiderBundle({
  selectedRiders = [],
  onChange,
  clientAge = "",
}) {
  const [profileState, setProfileState] = useState({ loading: true, profile: null, error: "" });
  const selectedSet = useMemo(() => new Set(selectedRiders), [selectedRiders]);
  const riders = useMemo(() => {
    const raw = profileState.profile?.hip_riders;
    return Array.isArray(raw) ? raw : [];
  }, [profileState.profile]);
  const age = Number(clientAge);
  const giEligible = Number.isFinite(age) && age >= 64 && age <= 74;

  useEffect(() => {
    let cancelled = false;
    fetchCarrierProfileByCode("MOH")
      .then((profile) => {
        if (!cancelled) setProfileState({ loading: false, profile, error: "" });
      })
      .catch((error) => {
        if (!cancelled) setProfileState({ loading: false, profile: null, error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSelection = (nextRiders) => onChange?.(Array.from(new Set(nextRiders)));
  const toggleRider = (riderName) => {
    if (selectedSet.has(riderName)) {
      setSelection(selectedRiders.filter((name) => name !== riderName));
      return;
    }
    setSelection([...selectedRiders, riderName]);
  };
  const applyBundle = (bundle) => setSelection(bundle.riders);

  if (profileState.loading) {
    return <div className="sf-empty-state">Loading MOH rider bundle...</div>;
  }

  if (!riders.length) {
    return (
      <div className="sf-panel">
        <div className="sf-panel-heading">
          <span className="sf-dot sf-dot--amber" />
          <span>MOH Riders</span>
        </div>
        <p className="sf-muted">
          {profileState.error || "No rider data found. Run the carrier profile seed."}
        </p>
      </div>
    );
  }

  return (
    <div className="sf-panel sf-moh-rider-panel">
      <div className="sf-panel-heading">
        <span className="sf-dot sf-dot--amber" />
        <span>MOH Rider Bundle</span>
      </div>

      <div className="sf-warning-banner">
        <AlertTriangle size={14} />
        <span>All riders must be selected at time of enrollment. They cannot be added later.</span>
      </div>

      {giEligible ? (
        <div className="sf-callout">
          <CheckCircle2 size={13} />
          <span>
            This client is age {clientAge} and may qualify for Guaranteed Issue
            Hospital Protection. Present all available riders now.
          </span>
        </div>
      ) : null}

      <div className="sf-card-list">
        {BUNDLES.map((bundle) => (
          <article key={bundle.id} className="sf-mini-card">
            <strong>{bundle.label}</strong>
            <p>{bundle.riders.join(", ")}</p>
            <div className="sf-meta-row">
              <span>Pricing varies by age</span>
              <span>{bundle.riders.length} riders</span>
            </div>
            <button
              type="button"
              className="sf-action-button"
              onClick={() => applyBundle(bundle)}
            >
              Select Bundle
            </button>
          </article>
        ))}
      </div>

      <div className="sf-checkbox-list">
        {riders.map((rider) => (
          <label key={rider.name} className="sf-checkbox-row">
            <input
              type="checkbox"
              checked={selectedSet.has(rider.name)}
              onChange={() => toggleRider(rider.name)}
            />
            <span>
              <strong>{rider.name}</strong>
              {rider.at_issue_only ? <small>At issue only</small> : null}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
