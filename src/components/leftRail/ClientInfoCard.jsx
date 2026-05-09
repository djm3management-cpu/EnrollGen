import { memo, useMemo } from "react";
import { useScript } from "../../context/ScriptContext";

function calcAge(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const monthDelta = today.getMonth() - d.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < d.getDate())) {
    age -= 1;
  }
  return age;
}

function formatDob(dob) {
  if (!dob) return "";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return dob;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}/${d.getFullYear()}`;
}

const ClientInfoCard = memo(function ClientInfoCard({ countyLabel = "" }) {
  const { state, dispatch } = useScript();
  const notes = state.notes || {};

  const setNote = (field, value) =>
    dispatch({ type: "SET_NOTE", field, value });

  const fullName = useMemo(() => {
    const first = (notes.customerFirstName || "").trim();
    const last = (notes.customerLastName || "").trim();
    return [first, last].filter(Boolean).join(" ");
  }, [notes.customerFirstName, notes.customerLastName]);

  const age = calcAge(notes.customerDob);
  const dobDisplay = formatDob(notes.customerDob);
  const subline = [dobDisplay && `DOB ${dobDisplay}`, age != null && `${age} yrs`]
    .filter(Boolean)
    .join("  ·  ");

  const partsAB = notes.partsABStatus || (notes.customerMbi ? "Active" : "");
  const currentCoverage = notes.currentCoverage || notes.previousCarrier || "";
  const county = countyLabel || notes.customerCounty || notes.customerState || "";

  return (
    <div className="eg-rail-card">
      <div className="eg-rail-card__label">CLIENT</div>

      <input
        className="eg-rail-card__name"
        style={{ background: "transparent", border: "none", outline: "none", width: "100%", padding: 0 }}
        value={fullName}
        placeholder="Client name"
        onChange={(e) => {
          const parts = e.target.value.trim().split(/\s+/);
          setNote("customerFirstName", parts[0] || "");
          setNote("customerLastName", parts.slice(1).join(" ") || "");
        }}
        aria-label="Client name"
      />

      <div className="eg-rail-card__sub">{subline || "DOB not entered"}</div>

      <div className="eg-rail-card__grid">
        <div className="eg-rail-card__field">
          <div className="eg-rail-card__field-key">MBI</div>
          <input
            className={`eg-rail-card__field-value${notes.customerMbi ? "" : " is-empty"}`}
            value={notes.customerMbi || ""}
            placeholder="1EG4-TE5-MK72"
            onChange={(e) => setNote("customerMbi", e.target.value)}
            aria-label="MBI"
          />
        </div>
        <div className="eg-rail-card__field">
          <div className="eg-rail-card__field-key">COUNTY</div>
          <input
            className={`eg-rail-card__field-value${county ? "" : " is-empty"}`}
            value={county}
            placeholder="County, ST"
            onChange={(e) => setNote("customerCounty", e.target.value)}
            aria-label="County"
          />
        </div>
        <div className="eg-rail-card__field">
          <div className="eg-rail-card__field-key">PARTS A/B</div>
          <input
            className={`eg-rail-card__field-value${partsAB === "Active" ? " is-good" : partsAB ? "" : " is-empty"}`}
            value={partsAB}
            placeholder="Active"
            onChange={(e) => setNote("partsABStatus", e.target.value)}
            aria-label="Parts A and B status"
          />
        </div>
        <div className="eg-rail-card__field">
          <div className="eg-rail-card__field-key">CURRENT</div>
          <input
            className={`eg-rail-card__field-value${currentCoverage ? "" : " is-empty"}`}
            value={currentCoverage}
            placeholder="Orig. Medicare"
            onChange={(e) => setNote("currentCoverage", e.target.value)}
            aria-label="Current coverage"
          />
        </div>
      </div>
    </div>
  );
});

export default ClientInfoCard;
