import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ingestTranscript } from "../lib/transcriptIngestion";

const DIRECTION_OPTIONS = [
  { label: "Inbound", value: "inbound" },
  { label: "Outbound", value: "outbound" },
];

const PRODUCT_LINE_OPTIONS = ["MA", "MedSup", "ACA", "Ancillary"];
const ENROLLMENT_PERIOD_OPTIONS = ["AEP", "OEP", "SEP", "IEP", "OE"];
const DISPOSITION_OPTIONS = [
  { label: "Enrolled", value: "enrolled" },
  { label: "Not Enrolled", value: "not_enrolled" },
  { label: "Callback", value: "callback" },
  { label: "Transferred", value: "transferred" },
  { label: "Dropped", value: "dropped" },
  { label: "Complaint", value: "complaint" },
];
const SOURCE_SYSTEM_OPTIONS = [
  { label: "EnrollHere", value: "enrollhere" },
  { label: "Conversely", value: "conversely" },
  { label: "Manual", value: "manual" },
];

const INITIAL_FORM = {
  agentName: "",
  callDate: "",
  duration: "",
  direction: "inbound",
  productLine: "MA",
  carrier: "",
  planName: "",
  enrollmentPeriod: "AEP",
  disposition: "enrolled",
  compliancePassed: true,
  sourceSystem: "enrollhere",
  sourceId: "",
  transcriptText: "",
};

function asFriendlyError(error) {
  if (!error) return "Upload failed.";
  if (typeof error === "string") return error;
  if (error.message) return error.message;
  return "Upload failed.";
}

export default function TranscriptUpload() {
  const [agents, setAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [agentSelect, setAgentSelect] = useState("");
  const [form, setForm] = useState(INITIAL_FORM);

  const [progress, setProgress] = useState({
    stage: "idle",
    label: "",
    percent: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [agents]
  );

  useEffect(() => {
    let alive = true;

    async function loadAgents() {
      setLoadingAgents(true);
      const { data, error: fetchError } = await supabase
        .from("agents")
        .select("id, name")
        .order("name", { ascending: true })
        .limit(500);

      if (!alive) return;

      if (fetchError) {
        setError(asFriendlyError(fetchError));
      } else {
        setAgents(data || []);
      }
      setLoadingAgents(false);
    }

    loadAgents();
    return () => {
      alive = false;
    };
  }, []);

  function onFieldChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function onSelectAgent(value) {
    setAgentSelect(value);
    if (value === "__new__") {
      onFieldChange("agentName", "");
      return;
    }

    const selected = agents.find((agent) => agent.id === value);
    if (selected) {
      onFieldChange("agentName", selected.name || "");
    }
  }

  function validate() {
    if (!form.agentName.trim()) return "Agent name is required.";
    if (!form.callDate) return "Call date is required.";
    if (!form.carrier.trim()) return "Carrier is required.";
    if (!form.transcriptText.trim()) return "Transcript text is required.";
    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setProgress({ stage: "starting", label: "Starting upload", percent: 1 });

    try {
      const result = await ingestTranscript(form, setProgress);
      setSuccess(result);
      setForm(INITIAL_FORM);
      setAgentSelect("");
      setProgress({ stage: "done", label: "Upload complete", percent: 100 });
    } catch (submitError) {
      setError(asFriendlyError(submitError));
      setProgress((prev) => ({
        ...prev,
        label: prev.label || "Upload failed",
      }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="transcript-upload card">
      <h2>Upload Transcript</h2>
      <p className="muted">
        Paste an EnrollHere transcript and EnrollGen will scrub PHI, chunk it, embed it,
        and insert it into Supabase for immediate copilot retrieval.
      </p>

      <form className="transcript-upload-form" onSubmit={handleSubmit}>
        <div className="transcript-upload-grid">
          <label>
            Agent Name
            <select
              value={agentSelect}
              onChange={(e) => onSelectAgent(e.target.value)}
              disabled={submitting || loadingAgents}
            >
              <option value="">Select an agent</option>
              {sortedAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
              <option value="__new__">+ Add New Agent</option>
            </select>
          </label>

          {(agentSelect === "__new__" || !agentSelect) && (
            <label>
              New Agent Name
              <input
                type="text"
                value={form.agentName}
                onChange={(e) => onFieldChange("agentName", e.target.value)}
                placeholder="Enter full agent name"
                disabled={submitting}
              />
            </label>
          )}

          {agentSelect && agentSelect !== "__new__" && (
            <label>
              Selected Agent
              <input type="text" value={form.agentName} readOnly disabled />
            </label>
          )}

          <label>
            Call Date
            <input
              type="date"
              value={form.callDate}
              onChange={(e) => onFieldChange("callDate", e.target.value)}
              disabled={submitting}
            />
          </label>

          <label>
            Duration (MM:SS)
            <input
              type="text"
              value={form.duration}
              onChange={(e) => onFieldChange("duration", e.target.value)}
              placeholder="e.g. 27:30"
              disabled={submitting}
            />
          </label>

          <label>
            Direction
            <select
              value={form.direction}
              onChange={(e) => onFieldChange("direction", e.target.value)}
              disabled={submitting}
            >
              {DIRECTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Product Line
            <select
              value={form.productLine}
              onChange={(e) => onFieldChange("productLine", e.target.value)}
              disabled={submitting}
            >
              {PRODUCT_LINE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Carrier
            <input
              type="text"
              value={form.carrier}
              onChange={(e) => onFieldChange("carrier", e.target.value)}
              placeholder="Devoted, UHC, Aetna..."
              disabled={submitting}
            />
          </label>

          <label>
            Plan Name (Optional)
            <input
              type="text"
              value={form.planName}
              onChange={(e) => onFieldChange("planName", e.target.value)}
              placeholder="Plan marketing name"
              disabled={submitting}
            />
          </label>

          <label>
            Enrollment Period
            <select
              value={form.enrollmentPeriod}
              onChange={(e) => onFieldChange("enrollmentPeriod", e.target.value)}
              disabled={submitting}
            >
              {ENROLLMENT_PERIOD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Disposition
            <select
              value={form.disposition}
              onChange={(e) => onFieldChange("disposition", e.target.value)}
              disabled={submitting}
            >
              {DISPOSITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Source System
            <select
              value={form.sourceSystem}
              onChange={(e) => onFieldChange("sourceSystem", e.target.value)}
              disabled={submitting}
            >
              {SOURCE_SYSTEM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Source ID (Optional)
            <input
              type="text"
              value={form.sourceId}
              onChange={(e) => onFieldChange("sourceId", e.target.value)}
              placeholder="Enrollment code"
              disabled={submitting}
            />
          </label>
        </div>

        <label>
          Transcript Text
          <textarea
            className="transcript-upload-textarea"
            value={form.transcriptText}
            onChange={(e) => onFieldChange("transcriptText", e.target.value)}
            placeholder="Paste full transcript here"
            disabled={submitting}
          />
        </label>

        <label className="transcript-upload-toggle">
          <input
            type="checkbox"
            checked={form.compliancePassed}
            onChange={(e) => onFieldChange("compliancePassed", e.target.checked)}
            disabled={submitting}
          />
          <span>Compliance Passed</span>
        </label>

        {progress.percent > 0 && (
          <div className="transcript-upload-progress">
            <div className="transcript-upload-progress-row">
              <span>{progress.label || "Processing"}</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="transcript-upload-progress-track">
              <div
                className="transcript-upload-progress-fill"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {error && <div className="transcript-upload-error">{error}</div>}

        {success && (
          <div className="transcript-upload-success">
            <strong>Upload complete.</strong>
            <div>Transcript ID: {success.transcriptId}</div>
            <div>Chunks created: {success.chunksCreated}</div>
            <div>
              Topics detected: {success.topicsDetected.length ? success.topicsDetected.join(", ") : "None"}
            </div>
          </div>
        )}

        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? "Processing..." : "Upload Transcript"}
        </button>
      </form>
    </div>
  );
}
