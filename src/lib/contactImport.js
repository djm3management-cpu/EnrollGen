import { normalizePhoneE164 } from "./phone";

// Pure logic for the CSV contact import: header auto-detection,
// row normalization/validation, in-file dedupe, and the skipped-rows
// report CSV. UI and Supabase batching live in ContactImportPanel.

export const CONTACT_FIELDS = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "dob",
  "zip",
  "county",
  "state",
  "current_carrier",
  "current_plan",
  "status",
  "source",
];

export const IMPORT_SOURCES = ["ghl_import", "tms", "manual", "fmo_transfer"];
const VALID_STATUSES = ["lead", "client", "former"];

// Common header spellings, GHL exports included. Keys are normalized
// (lowercase, alphanumeric only).
const HEADER_ALIASES = {
  first_name: ["firstname", "first", "fname", "contactfirstname"],
  last_name: ["lastname", "last", "lname", "surname", "contactlastname"],
  phone: ["phone", "phonenumber", "mobile", "mobilephone", "cell", "cellphone", "primaryphone", "contactphone"],
  email: ["email", "emailaddress", "contactemail"],
  dob: ["dob", "dateofbirth", "birthdate", "birthday"],
  zip: ["zip", "zipcode", "postalcode", "postal"],
  county: ["county"],
  state: ["state", "stateregion", "province"],
  current_carrier: ["currentcarrier", "carrier", "insurancecarrier", "company"],
  current_plan: ["currentplan", "plan", "planname"],
  status: ["status", "contactstatus", "stage"],
  source: ["source", "leadsource", "contactsource"],
};

function normalizeHeader(header) {
  return String(header || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function autoDetectMapping(headers) {
  const mapping = {};
  const claimed = new Set();
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (!normalized) continue;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (claimed.has(field)) continue;
      if (normalized === normalizeHeader(field) || aliases.includes(normalized)) {
        mapping[header] = field;
        claimed.add(field);
        break;
      }
    }
  }
  return mapping;
}

function normalizeDob(raw) {
  const value = String(raw || "").trim();
  if (!value) return { value: null, valid: true };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { value, valid: !Number.isNaN(new Date(value).getTime()) };
  }
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(value);
  if (match) {
    let [, month, day, year] = match;
    if (year.length === 2) {
      year = Number(year) > 25 ? `19${year}` : `20${year}`;
    }
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    return { value: iso, valid: !Number.isNaN(new Date(iso).getTime()) };
  }
  return { value: null, valid: false };
}

// mapping: { csvHeader: contactField }. Returns { fields, flags } where
// flags is a list of human-readable validation problems.
export function normalizeRow(row, mapping, { defaultSource = "ghl_import" } = {}) {
  const fields = {};
  const flags = [];

  for (const [header, field] of Object.entries(mapping)) {
    if (!field || !CONTACT_FIELDS.includes(field)) continue;
    const raw = String(row[header] ?? "").trim();
    if (!raw) continue;
    fields[field] = raw;
  }

  const phone = normalizePhoneE164(fields.phone || "");
  if (!phone) {
    flags.push(fields.phone ? "invalid phone" : "missing phone");
  }
  fields.phone = phone;

  if (fields.dob !== undefined) {
    const dob = normalizeDob(fields.dob);
    if (!dob.valid) flags.push("unparseable dob (dropped)");
    if (dob.value) fields.dob = dob.value;
    else delete fields.dob;
  }

  if (fields.status) {
    const status = fields.status.toLowerCase();
    if (VALID_STATUSES.includes(status)) fields.status = status;
    else delete fields.status;
  }

  const source = (fields.source || "").toLowerCase();
  fields.source = IMPORT_SOURCES.includes(source) ? source : defaultSource;

  if (fields.state) fields.state = fields.state.toUpperCase().slice(0, 2);
  if (fields.zip) fields.zip = fields.zip.replace(/[^0-9-]/g, "").slice(0, 10);
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    flags.push("invalid email (dropped)");
    delete fields.email;
  }

  return { fields, flags };
}

// First occurrence of a phone wins; later rows are marked duplicates.
export function dedupeByPhone(normalizedRows) {
  const seen = new Set();
  return normalizedRows.map((entry) => {
    if (!entry.fields.phone) return entry;
    if (seen.has(entry.fields.phone)) {
      return { ...entry, flags: [...entry.flags, "duplicate phone in file"] };
    }
    seen.add(entry.fields.phone);
    return entry;
  });
}

export function isImportable(entry) {
  return Boolean(entry.fields.phone) && !entry.flags.includes("duplicate phone in file");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildSkippedCsv(skippedEntries, headers) {
  const headerRow = [...headers, "skip_reason"].map(csvEscape).join(",");
  const rows = skippedEntries.map((entry) =>
    [...headers.map((header) => csvEscape(entry.raw?.[header])), csvEscape(entry.flags.join("; "))].join(",")
  );
  return [headerRow, ...rows].join("\n");
}

export function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
