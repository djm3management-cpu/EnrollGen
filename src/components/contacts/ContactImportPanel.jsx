import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { useTenantConfig } from "../../hooks/useTenantConfig";
import {
  CONTACT_FIELDS,
  IMPORT_SOURCES,
  autoDetectMapping,
  normalizeRow,
  dedupeByPhone,
  isImportable,
  buildSkippedCsv,
  downloadCsv,
} from "../../lib/contactImport";

const BATCH_SIZE = 100;
const PREVIEW_ROWS = 10;

// Fields the import may fill on an existing contact, but never overwrite.
const UPDATABLE_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "dob",
  "zip",
  "county",
  "state",
  "current_carrier",
  "current_plan",
];

export default function ContactImportPanel({ onClose }) {
  const { supabaseClient, tenant } = useTenantConfig();
  const [step, setStep] = useState("upload"); // upload | mapping | preview | importing | report
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [defaultSource, setDefaultSource] = useState("ghl_import");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState(null);
  const abortRef = useRef(false);

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const parsedHeaders = result.meta?.fields || [];
        if (!parsedHeaders.length || !result.data?.length) {
          setError("No rows found in the CSV.");
          return;
        }
        setHeaders(parsedHeaders);
        setRawRows(result.data);
        setMapping(autoDetectMapping(parsedHeaders));
        setStep("mapping");
      },
      error: (parseError) => setError(parseError.message || "CSV parse failed."),
    });
  };

  const normalized = useMemo(() => {
    if (step !== "preview" && step !== "importing" && step !== "report") return [];
    return dedupeByPhone(
      rawRows.map((row) => {
        const entry = normalizeRow(row, mapping, { defaultSource });
        return { ...entry, raw: row };
      })
    );
  }, [step, rawRows, mapping, defaultSource]);

  const importable = useMemo(() => normalized.filter(isImportable), [normalized]);
  const skipped = useMemo(() => normalized.filter((entry) => !isImportable(entry)), [normalized]);

  const mappedFieldCount = Object.values(mapping).filter(Boolean).length;
  const phoneMapped = Object.values(mapping).includes("phone");

  const runImport = async () => {
    setStep("importing");
    abortRef.current = false;
    setProgress({ done: 0, total: importable.length });
    let created = 0;
    let updated = 0;
    let failed = 0;

    try {
      for (let offset = 0; offset < importable.length; offset += BATCH_SIZE) {
        if (abortRef.current) break;
        const batch = importable.slice(offset, offset + BATCH_SIZE);
        const phones = batch.map((entry) => entry.fields.phone);

        const { data: existingRows, error: findError } = await supabaseClient
          .from("contacts")
          .select("*")
          .in("phone", phones);
        if (findError) throw findError;
        const existingByPhone = new Map((existingRows || []).map((row) => [row.phone, row]));

        const inserts = [];
        for (const entry of batch) {
          const existing = existingByPhone.get(entry.fields.phone);
          if (existing) {
            // Fill blanks only; imports never overwrite CRM data.
            const updates = {};
            for (const field of UPDATABLE_FIELDS) {
              if (entry.fields[field] && !existing[field]) updates[field] = entry.fields[field];
            }
            if (Object.keys(updates).length) {
              const { error: updateError } = await supabaseClient
                .from("contacts")
                .update(updates)
                .eq("id", existing.id);
              if (updateError) failed += 1;
              else updated += 1;
            } else {
              updated += 1;
            }
          } else {
            inserts.push({
              tenant_id: tenant?.id,
              status: entry.fields.status || "lead",
              ...entry.fields,
            });
          }
        }

        if (inserts.length) {
          const { data: insertedRows, error: insertError } = await supabaseClient
            .from("contacts")
            .insert(inserts)
            .select("id");
          if (insertError) {
            failed += inserts.length;
          } else {
            created += insertedRows.length;
            const activityRows = insertedRows.map((row) => ({
              tenant_id: tenant?.id,
              contact_id: row.id,
              type: "status_change",
              summary: "Imported",
            }));
            const { error: activityError } = await supabaseClient
              .from("contact_activities")
              .insert(activityRows);
            if (activityError) {
              console.error("[ContactImport] activity insert failed:", activityError.message);
            }
          }
        }

        setProgress({ done: Math.min(offset + batch.length, importable.length), total: importable.length });
      }

      setReport({ created, updated, failed, skipped: skipped.length, aborted: abortRef.current });
      setStep("report");
    } catch (err) {
      console.error("[ContactImport] import failed:", err);
      setError(err.message || "Import failed.");
      setReport({ created, updated, failed, skipped: skipped.length, aborted: true });
      setStep("report");
    }
  };

  const progressPct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="contacts-import">
      <div className="ops-command-line">
        <span>CONTACT IMPORT</span>
        <span className="ops-section-meta">{fileName || "CSV"}</span>
      </div>

      {error ? <div className="ops-error">⚠ {error}</div> : null}

      {step === "upload" ? (
        <div className="contacts-section contacts-import-upload">
          <div className="contacts-section-head">UPLOAD CSV</div>
          <p className="contacts-muted">
            Export the book of business from GHL as CSV. Headers are mapped in the next step;
            phone is required per row.
          </p>
          <input type="file" accept=".csv,text/csv" onChange={handleFile} />
          <div className="contacts-import-actions">
            <button type="button" className="contacts-mini-btn" onClick={onClose}>
              CANCEL
            </button>
          </div>
        </div>
      ) : null}

      {step === "mapping" ? (
        <div className="contacts-section">
          <div className="contacts-section-head">
            MAP COLUMNS ({rawRows.length} ROWS, {mappedFieldCount} MAPPED)
          </div>
          <div className="contacts-import-mapping">
            {headers.map((header) => (
              <div key={header} className="contacts-import-mapping-row">
                <span className="mono">{header}</span>
                <select
                  value={mapping[header] || ""}
                  onChange={(event) =>
                    setMapping((prev) => ({ ...prev, [header]: event.target.value || null }))
                  }
                >
                  <option value="">(ignore)</option>
                  {CONTACT_FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="contacts-import-mapping-row">
            <span>DEFAULT SOURCE</span>
            <select value={defaultSource} onChange={(event) => setDefaultSource(event.target.value)}>
              {IMPORT_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>
          {!phoneMapped ? (
            <div className="contacts-muted">Map a column to phone to continue.</div>
          ) : null}
          <div className="contacts-import-actions">
            <button type="button" className="contacts-mini-btn" onClick={() => setStep("upload")}>
              BACK
            </button>
            <button
              type="button"
              className="contacts-mini-btn"
              disabled={!phoneMapped}
              onClick={() => setStep("preview")}
            >
              PREVIEW
            </button>
            <button type="button" className="contacts-mini-btn" onClick={onClose}>
              CANCEL
            </button>
          </div>
        </div>
      ) : null}

      {step === "preview" ? (
        <div className="contacts-section">
          <div className="contacts-section-head">
            PREVIEW: {importable.length} IMPORTABLE, {skipped.length} SKIPPED
          </div>
          <div className="contacts-table-wrap">
            <table className="contacts-table">
              <thead>
                <tr>
                  <th>NAME</th>
                  <th>PHONE</th>
                  <th>EMAIL</th>
                  <th>DOB</th>
                  <th>LOCATION</th>
                  <th>FLAGS</th>
                </tr>
              </thead>
              <tbody>
                {normalized.slice(0, PREVIEW_ROWS).map((entry, index) => (
                  <tr key={index} className={entry.flags.length ? "contacts-import-flagged" : ""}>
                    <td>{[entry.fields.first_name, entry.fields.last_name].filter(Boolean).join(" ") || "--"}</td>
                    <td className="mono">{entry.fields.phone || "--"}</td>
                    <td>{entry.fields.email || "--"}</td>
                    <td className="mono">{entry.fields.dob || "--"}</td>
                    <td>{[entry.fields.county, entry.fields.state].filter(Boolean).join(", ") || "--"}</td>
                    <td className={entry.flags.length ? "status-offline" : "contacts-muted"}>
                      {entry.flags.join("; ") || "ok"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="contacts-import-actions">
            <button type="button" className="contacts-mini-btn" onClick={() => setStep("mapping")}>
              BACK
            </button>
            <button
              type="button"
              className="contacts-mini-btn contacts-start-call"
              disabled={!importable.length}
              onClick={runImport}
            >
              IMPORT {importable.length} ROWS
            </button>
            <button type="button" className="contacts-mini-btn" onClick={onClose}>
              CANCEL
            </button>
          </div>
        </div>
      ) : null}

      {step === "importing" ? (
        <div className="contacts-section">
          <div className="contacts-section-head">IMPORTING</div>
          <div className="contacts-import-progress">
            <div className="contacts-import-progress-track">
              <span style={{ width: `${progressPct}%` }} />
            </div>
            <span className="mono">
              {progress.done} / {progress.total} ({progressPct}%)
            </span>
          </div>
          <div className="contacts-import-actions">
            <button
              type="button"
              className="contacts-mini-btn"
              onClick={() => {
                abortRef.current = true;
              }}
            >
              ABORT
            </button>
          </div>
        </div>
      ) : null}

      {step === "report" ? (
        <div className="contacts-section">
          <div className="contacts-section-head">
            IMPORT {report?.aborted ? "ABORTED" : "COMPLETE"}
          </div>
          <dl className="contacts-profile">
            <div><dt>CREATED</dt><dd className="mono">{report?.created ?? 0}</dd></div>
            <div><dt>UPDATED</dt><dd className="mono">{report?.updated ?? 0}</dd></div>
            <div><dt>SKIPPED</dt><dd className="mono">{report?.skipped ?? 0}</dd></div>
            {report?.failed ? (
              <div><dt>FAILED</dt><dd className="mono status-offline">{report.failed}</dd></div>
            ) : null}
          </dl>
          <div className="contacts-import-actions">
            {skipped.length ? (
              <button
                type="button"
                className="contacts-mini-btn"
                onClick={() => downloadCsv("skipped-contacts.csv", buildSkippedCsv(skipped, headers))}
              >
                DOWNLOAD SKIPPED CSV
              </button>
            ) : null}
            <button type="button" className="contacts-mini-btn contacts-start-call" onClick={onClose}>
              DONE
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
