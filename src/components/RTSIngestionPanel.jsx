import { useMemo, useRef, useState } from "react";
import { useOrganization } from "@clerk/clerk-react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import { useAppAuth } from "../context/AuthContext";
import { fetchWithClerk } from "../lib/clerkFetch";

const ACCEPTED_FILE_TYPES = ".csv,.tsv,.xlsx,.xls";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const CONTRACT_STATUSES = [
  "ACTIVE",
  "SUBMITTED",
  "INACTIVE",
  "TERMINATED",
  "BLACKOUT",
  "REQUESTED",
];

async function readApiResponse(response) {
  const text = await response.text().catch(() => "");
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(data.error || `RTS ingestion failed (HTTP ${response.status}).`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function confidenceLabel(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function stateLabel(states) {
  return (states || [])
    .map((item) => (item.sub_status ? `${item.state} ${item.sub_status}` : item.state))
    .join(", ");
}

function sourceLabel(sourceType) {
  return sourceType === "unknown" ? "Unknown source" : String(sourceType || "").replace("_", " / ");
}

function mappingKey(mapping) {
  return `${String(mapping.raw_npn || "").toLowerCase()}\u0000${String(
    mapping.raw_name || ""
  ).toLowerCase()}`;
}

export default function RTSIngestionPanel({ currentAgent, tenantAgents, onCommitted }) {
  const { getToken } = useAppAuth();
  const { membership } = useOrganization();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState("upload");
  const [result, setResult] = useState(null);
  const [agentMappings, setAgentMappings] = useState([]);
  const [carrierMappings, setCarrierMappings] = useState([]);
  const [selectedRecords, setSelectedRecords] = useState(new Set());
  const [error, setError] = useState("");
  const [commitResult, setCommitResult] = useState(null);
  const isAdmin = currentAgent?.role === "admin" || membership?.role === "org:admin";

  const knownCarriers = useMemo(
    () =>
      [...(result?.known_carriers || [])].sort((a, b) =>
        String(a.name).localeCompare(String(b.name))
      ),
    [result?.known_carriers]
  );
  const reviewAgents = useMemo(
    () => (tenantAgents.length ? tenantAgents : result?.known_agents || []),
    [result?.known_agents, tenantAgents]
  );
  const resolvedAgentCount = useMemo(
    () => agentMappings.filter((mapping) => mapping.matched_agent_id).length,
    [agentMappings]
  );
  const approvedCarrierCount = useMemo(
    () =>
      carrierMappings.filter(
        (mapping) => mapping.match_status === "MATCHED" || mapping.approved === true
      ).length,
    [carrierMappings]
  );

  const reset = () => {
    setPhase("upload");
    setResult(null);
    setAgentMappings([]);
    setCarrierMappings([]);
    setSelectedRecords(new Set());
    setError("");
    setCommitResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const close = () => {
    if (phase === "analyzing" || phase === "committing") return;
    setOpen(false);
    reset();
  };

  const analyzeFile = async (file) => {
    setError("");
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "tsv", "xlsx", "xls"].includes(extension)) {
      setError("Upload a CSV, TSV, XLSX, or XLS file.");
      return;
    }
    if (!file.size || file.size > MAX_FILE_BYTES) {
      setError("The file must contain data and be smaller than 10 MB.");
      return;
    }

    setPhase("analyzing");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetchWithClerk(getToken, "/api/rts-ingest", {
        method: "POST",
        body: form,
      });
      const data = await readApiResponse(response);
      const carriersById = new Map(
        (data.known_carriers || []).map((carrier) => [carrier.id, carrier])
      );
      const carriersByName = new Map(
        (data.known_carriers || []).map((carrier) => [
          String(carrier.name || "").trim().toLowerCase(),
          carrier,
        ])
      );
      const mappings = (data.carrier_mappings || []).map((mapping) => {
        const knownCarrier =
          carriersById.get(mapping.matched_carrier_id) ||
          carriersByName.get(String(mapping.matched_carrier_name || "").trim().toLowerCase());
        return knownCarrier
          ? {
              ...mapping,
              matched_carrier_id: knownCarrier.id,
              matched_carrier_name: knownCarrier.name,
              match_status: "MATCHED",
              approved: true,
            }
          : {
              ...mapping,
              matched_carrier_id: null,
              matched_carrier_name: null,
              match_status: "NEW",
              approved: false,
            };
      });
      const agentsById = new Map((data.known_agents || []).map((agent) => [agent.id, agent]));
      const agentsByNpn = new Map(
        (data.known_agents || [])
          .filter((agent) => agent.npn)
          .map((agent) => [String(agent.npn).trim(), agent])
      );
      const resolvedAgents = (data.agents_matched || []).map((mapping) => {
        const agent =
          agentsById.get(mapping.matched_agent_id) ||
          agentsByNpn.get(String(mapping.raw_npn || "").trim());
        return agent
          ? {
              ...mapping,
              matched_agent_id: agent.id,
              matched_agent_name: agent.name,
              match_type:
                mapping.raw_npn &&
                String(agent.npn || "").trim() === String(mapping.raw_npn).trim()
                  ? "NPN"
                  : mapping.match_type,
            }
          : { ...mapping, matched_agent_id: null, matched_agent_name: null };
      });
      setResult(data);
      setAgentMappings(resolvedAgents);
      setCarrierMappings(mappings);
      setSelectedRecords(new Set((data.rts_records || []).map((record) => record._review_id)));
      setPhase("review");
    } catch (uploadError) {
      setError(uploadError.message || "Unable to analyze the RTS file.");
      setPhase("upload");
    }
  };

  const updateAgentMapping = (index, agentId) => {
    const agent = reviewAgents.find((item) => item.id === agentId);
    setAgentMappings((current) =>
      current.map((mapping, mappingIndex) =>
        mappingIndex === index
          ? {
              ...mapping,
              matched_agent_id: agent?.id || null,
              matched_agent_name: agent?.name || null,
              match_type: agent ? "NAME_FUZZY" : "UNKNOWN",
              confidence: agent ? 1 : mapping.confidence,
            }
          : mapping
      )
    );
  };

  const updateCarrierMatch = (index, carrierId) => {
    const carrier = knownCarriers.find((item) => item.id === carrierId);
    setCarrierMappings((current) =>
      current.map((mapping, mappingIndex) =>
        mappingIndex === index
          ? carrier
            ? {
                ...mapping,
                matched_carrier_id: carrier.id,
                matched_carrier_name: carrier.name,
                match_status: "MATCHED",
                approved: true,
                confidence: 1,
              }
            : {
                ...mapping,
                matched_carrier_id: null,
                matched_carrier_name: null,
                match_status: "NEW",
                approved: false,
              }
          : mapping
      )
    );
  };

  const updateRecord = (reviewId, patch) => {
    setResult((current) => ({
      ...current,
      rts_records: current.rts_records.map((record) =>
        record._review_id === reviewId ? { ...record, ...patch } : record
      ),
    }));
  };

  const toggleRecord = (reviewId) => {
    setSelectedRecords((current) => {
      const next = new Set(current);
      if (next.has(reviewId)) next.delete(reviewId);
      else next.add(reviewId);
      return next;
    });
  };

  const commit = async () => {
    setError("");
    setPhase("committing");
    try {
      const response = await fetchWithClerk(getToken, "/api/rts-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "commit",
          source_filename: result.ingestion.filename,
          file_hash: result.ingestion.file_hash,
          source_format: result.source_format,
          records_detected: result.rts_records.length,
          agents_matched: agentMappings,
          carrier_mappings: carrierMappings,
          rts_records: result.rts_records.filter((record) =>
            selectedRecords.has(record._review_id)
          ),
          warnings: result.warnings,
        }),
      });
      const data = await readApiResponse(response);
      setCommitResult(data);
      setPhase("complete");
      await onCommitted?.();
    } catch (commitError) {
      setError(commitError.message || "Unable to commit RTS records.");
      setPhase("review");
    }
  };

  return (
    <>
      <button type="button" className="rts-upload-trigger" onClick={() => setOpen(true)}>
        <Upload size={13} aria-hidden="true" />
        Import RTS
      </button>

      {open ? (
        <div className="rts-ingest-backdrop" role="presentation">
          <section
            className="rts-ingest-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rts-ingest-title"
          >
            <header className="rts-ingest-header">
              <div>
                <span className="rts-eyebrow">AI NORMALIZATION</span>
                <h3 id="rts-ingest-title">Import carrier RTS data</h3>
              </div>
              <button
                type="button"
                className="rts-ingest-close"
                onClick={close}
                disabled={phase === "analyzing" || phase === "committing"}
                aria-label="Close RTS ingestion"
              >
                <X size={16} />
              </button>
            </header>

            {error ? (
              <div className="rts-error rts-ingest-error" role="alert">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            {phase === "upload" ? (
              <div className="rts-ingest-upload">
                <div className="rts-ingest-upload-icon">
                  <FileSpreadsheet size={26} aria-hidden="true" />
                </div>
                <div>
                  <h4>Choose an appointment report</h4>
                  <p>CSV, TSV, XLSX, or XLS · maximum 10 MB · first worksheet is used</p>
                </div>
                <input
                  ref={inputRef}
                  className="rts-file-input"
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  onChange={(event) => analyzeFile(event.target.files?.[0])}
                />
                <button
                  type="button"
                  className="rts-primary-button"
                  onClick={() => inputRef.current?.click()}
                >
                  Select file
                </button>
                <small>
                  The source file is parsed on the server and is not stored. Its SHA-256 hash is retained
                  after commit to prevent duplicate uploads.
                </small>
              </div>
            ) : null}

            {phase === "analyzing" ? (
              <div className="rts-ingest-loading" aria-live="polite">
                <LoaderCircle className="is-spinning" size={24} aria-hidden="true" />
                <h4>Normalizing carrier data</h4>
                <p>Detecting columns, matching agents and carriers, and parsing appointment details.</p>
              </div>
            ) : null}

            {phase === "review" || phase === "committing" ? (
              <div className="rts-ingest-review">
                <div className="rts-ingest-stats">
                  <span><strong>{result.source_format.row_count}</strong> source rows</span>
                  <span><strong>{result.rts_records.length}</strong> records found</span>
                  <span><strong>{resolvedAgentCount}/{agentMappings.length}</strong> agents resolved</span>
                  <span><strong>{approvedCarrierCount}/{carrierMappings.length}</strong> carriers ready</span>
                  <span><strong>{result.warnings.length}</strong> warnings</span>
                  <span>{sourceLabel(result.source_format.source_type)} · {confidenceLabel(result.source_format.confidence)}</span>
                </div>

                <div className="rts-ingest-sections">
                  <section className="rts-review-section">
                    <header>
                      <div>
                        <span>01</span>
                        <h4>Agent matches</h4>
                      </div>
                      <small>NPN matches are authoritative</small>
                    </header>
                    <div className="rts-review-list">
                      {agentMappings.map((mapping, index) => (
                        <div className="rts-review-row" key={`${mappingKey(mapping)}:${index}`}>
                          <div>
                            <strong>{mapping.raw_name || "Unnamed agent"}</strong>
                            <small>{mapping.raw_npn ? `NPN ${mapping.raw_npn}` : "No NPN supplied"}</small>
                          </div>
                          <select
                            value={mapping.matched_agent_id || ""}
                            onChange={(event) => updateAgentMapping(index, event.target.value)}
                          >
                            <option value="">Skip / unresolved</option>
                            {reviewAgents.map((agent) => (
                              <option key={agent.id} value={agent.id}>
                                {agent.name}{agent.npn ? ` · ${agent.npn}` : ""}
                              </option>
                            ))}
                          </select>
                          <span className={`rts-match-badge is-${mapping.match_type.toLowerCase()}`}>
                            {mapping.match_type} · {confidenceLabel(mapping.confidence)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rts-review-section">
                    <header>
                      <div>
                        <span>02</span>
                        <h4>Carrier mappings</h4>
                      </div>
                      <small>Approve new names or map them to an existing carrier</small>
                    </header>
                    <div className="rts-review-list">
                      {carrierMappings.map((mapping, index) => (
                        <div className="rts-review-row rts-carrier-mapping-row" key={mapping.raw_carrier_name}>
                          <div>
                            <strong>{mapping.raw_carrier_name || "Unnamed carrier"}</strong>
                            {mapping.match_status === "NEW" ? (
                              <input
                                className="rts-suggested-carrier-input"
                                value={mapping.suggested_name || ""}
                                aria-label={`Normalized name for ${mapping.raw_carrier_name}`}
                                placeholder="Normalized carrier name"
                                onChange={(event) =>
                                  setCarrierMappings((current) =>
                                    current.map((item, mappingIndex) =>
                                      mappingIndex === index
                                        ? { ...item, suggested_name: event.target.value }
                                        : item
                                    )
                                  )
                                }
                              />
                            ) : (
                              <small>Matched: {mapping.matched_carrier_name || "—"}</small>
                            )}
                          </div>
                          <select
                            value={mapping.match_status === "MATCHED" ? mapping.matched_carrier_id || "" : ""}
                            onChange={(event) => updateCarrierMatch(index, event.target.value)}
                          >
                            <option value="">Treat as new</option>
                            {knownCarriers.map((carrier) => (
                              <option key={carrier.id} value={carrier.id}>{carrier.name}</option>
                            ))}
                          </select>
                          {mapping.match_status === "NEW" ? (
                            <label className="rts-approval-check">
                              <input
                                type="checkbox"
                                checked={mapping.approved === true}
                                onChange={(event) =>
                                  setCarrierMappings((current) =>
                                    current.map((item, mappingIndex) =>
                                      mappingIndex === index
                                        ? { ...item, approved: event.target.checked }
                                        : item
                                    )
                                  )
                                }
                              />
                              Approve new
                            </label>
                          ) : (
                            <span className="rts-match-badge is-matched">
                              MATCHED · {confidenceLabel(mapping.confidence)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rts-review-section rts-record-review">
                    <header>
                      <div>
                        <span>03</span>
                        <h4>Records to commit</h4>
                      </div>
                      <small>{selectedRecords.size} of {result.rts_records.length} selected</small>
                    </header>
                    <div className="rts-review-table-wrap">
                      <table className="rts-review-table">
                        <thead>
                          <tr>
                            <th aria-label="Include" />
                            <th>Agent</th>
                            <th>Carrier</th>
                            <th>Product</th>
                            <th>Status</th>
                            <th>States</th>
                            <th>Writing #</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.rts_records.map((record) => (
                            <tr key={record._review_id}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selectedRecords.has(record._review_id)}
                                  onChange={() => toggleRecord(record._review_id)}
                                  aria-label={`Include ${record.carrier_raw_name}`}
                                />
                              </td>
                              <td>{record.agent_raw_name || "—"}</td>
                              <td>{record.carrier_raw_name || "—"}</td>
                              <td>{record.product_line}</td>
                              <td>
                                <select
                                  value={record.contract_status}
                                  onChange={(event) =>
                                    updateRecord(record._review_id, { contract_status: event.target.value })
                                  }
                                >
                                  {CONTRACT_STATUSES.map((status) => (
                                    <option key={status} value={status}>{status}</option>
                                  ))}
                                </select>
                              </td>
                              <td title={stateLabel(record.states)}>{stateLabel(record.states) || "—"}</td>
                              <td>{record.writing_number || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {result.warnings.length ? (
                    <details className="rts-warning-list">
                      <summary>{result.warnings.length} ingestion warnings</summary>
                      <ul>
                        {result.warnings.map((warning, index) => (
                          <li key={`${warning.type}:${warning.row_index}:${index}`}>
                            <strong>{warning.type.replaceAll("_", " ")}</strong>
                            {warning.row_index !== null ? ` · row ${warning.row_index + 1}` : ""}
                            <span>{warning.message}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>

                <footer className="rts-ingest-actions">
                  <span>
                    {isAdmin
                      ? "Committing will upsert the selected records and write an audit log."
                      : "Review is available, but a tenant admin must commit this ingestion."}
                  </span>
                  <button type="button" className="rts-secondary-button" onClick={reset} disabled={phase === "committing"}>
                    Start over
                  </button>
                  <button
                    type="button"
                    className="rts-primary-button"
                    disabled={!isAdmin || selectedRecords.size === 0 || phase === "committing"}
                    onClick={commit}
                  >
                    {phase === "committing" ? (
                      <><LoaderCircle className="is-spinning" size={13} /> Committing</>
                    ) : (
                      <>Commit {selectedRecords.size} records</>
                    )}
                  </button>
                </footer>
              </div>
            ) : null}

            {phase === "complete" ? (
              <div className="rts-ingest-complete">
                <CheckCircle2 size={28} aria-hidden="true" />
                <h4>RTS ingestion committed</h4>
                <p>
                  {commitResult.records_created} created · {commitResult.records_updated} updated ·{" "}
                  {commitResult.records_skipped} skipped
                </p>
                <small>Audit ID {commitResult.ingestion_id}</small>
                <button type="button" className="rts-primary-button" onClick={close}>Done</button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
