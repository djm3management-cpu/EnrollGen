import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

export const DEFAULT_COUNTY_REFERENCE_URL =
  "https://www2.census.gov/geo/docs/reference/codes2020/national_county2020.txt";

const STATE_BY_FIPS = {
  "01": ["AL", "Alabama"],
  "02": ["AK", "Alaska"],
  "04": ["AZ", "Arizona"],
  "05": ["AR", "Arkansas"],
  "06": ["CA", "California"],
  "08": ["CO", "Colorado"],
  "09": ["CT", "Connecticut"],
  10: ["DE", "Delaware"],
  11: ["DC", "District of Columbia"],
  12: ["FL", "Florida"],
  13: ["GA", "Georgia"],
  15: ["HI", "Hawaii"],
  16: ["ID", "Idaho"],
  17: ["IL", "Illinois"],
  18: ["IN", "Indiana"],
  19: ["IA", "Iowa"],
  20: ["KS", "Kansas"],
  21: ["KY", "Kentucky"],
  22: ["LA", "Louisiana"],
  23: ["ME", "Maine"],
  24: ["MD", "Maryland"],
  25: ["MA", "Massachusetts"],
  26: ["MI", "Michigan"],
  27: ["MN", "Minnesota"],
  28: ["MS", "Mississippi"],
  29: ["MO", "Missouri"],
  30: ["MT", "Montana"],
  31: ["NE", "Nebraska"],
  32: ["NV", "Nevada"],
  33: ["NH", "New Hampshire"],
  34: ["NJ", "New Jersey"],
  35: ["NM", "New Mexico"],
  36: ["NY", "New York"],
  37: ["NC", "North Carolina"],
  38: ["ND", "North Dakota"],
  39: ["OH", "Ohio"],
  40: ["OK", "Oklahoma"],
  41: ["OR", "Oregon"],
  42: ["PA", "Pennsylvania"],
  44: ["RI", "Rhode Island"],
  45: ["SC", "South Carolina"],
  46: ["SD", "South Dakota"],
  47: ["TN", "Tennessee"],
  48: ["TX", "Texas"],
  49: ["UT", "Utah"],
  50: ["VT", "Vermont"],
  51: ["VA", "Virginia"],
  53: ["WA", "Washington"],
  54: ["WV", "West Virginia"],
  55: ["WI", "Wisconsin"],
  56: ["WY", "Wyoming"],
  60: ["AS", "American Samoa"],
  66: ["GU", "Guam"],
  69: ["MP", "Northern Mariana Islands"],
  72: ["PR", "Puerto Rico"],
  78: ["VI", "U.S. Virgin Islands"],
};

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [rawKey, inlineValue] = arg.slice(2).split("=");
    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
    } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
      args[rawKey] = argv[i + 1];
      i += 1;
    } else {
      args[rawKey] = true;
    }
  }
  return args;
}

export async function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const content = await fs.readFile(path.resolve(process.cwd(), file), "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match =
          trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/) ||
          trimmed.match(/^\$env:([A-Za-z_][A-Za-z0-9_]*)=(.*)$/i);
        if (!match) continue;
        const [, key, rawValue] = match;
        if (process.env[key]) continue;
        process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
      }
    } catch {
      // Env files are optional for cron environments.
    }
  }
}

export async function createSupabaseAdminClient() {
  await loadLocalEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function getField(row, candidates) {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])
  );
  for (const candidate of candidates) {
    const value = normalized.get(normalizeHeader(candidate));
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

export function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function normalizeZip(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 5).padStart(5, "0");
}

export function normalizeCountyFips(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(5, "0").slice(-5);
}

export function stateFromCountyFips(countyFips) {
  const state = STATE_BY_FIPS[String(countyFips).slice(0, 2)];
  return {
    state_code: state?.[0] || null,
    state_name: state?.[1] || null,
  };
}

export function toNumber(value) {
  const number = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : null;
}

export function toInteger(value) {
  const number = toNumber(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

export function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).toISOString().slice(0, 10);
    }
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function addMonths(isoDate, months) {
  if (!isoDate) return null;
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function detectDelimiter(row) {
  const candidates = [",", "\t", "|"];
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: String(row || "").split(delimiter).length - 1,
    }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || ",";
}

function parseDelimitedRows(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);

  return rows;
}

function findHeaderRow(rows, headerIncludes, explicitHeaderRow) {
  if (Number.isInteger(explicitHeaderRow)) return explicitHeaderRow;
  const required = Array.isArray(headerIncludes)
    ? headerIncludes.map(normalizeHeader).filter(Boolean)
    : [normalizeHeader(headerIncludes)].filter(Boolean);
  if (!required.length) return 0;

  return Math.max(
    0,
    rows.findIndex((row) => {
      const headers = new Set(row.map(normalizeHeader));
      return required.every((candidate) => headers.has(candidate));
    })
  );
}

function rowsToObjects(rows, options = {}) {
  const headerRow = findHeaderRow(rows, options.headerIncludes, options.headerRow);
  const headers = (rows[headerRow] || []).map((header) =>
    String(header ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
  );
  const dataRows = rows.slice(headerRow + 1);
  return dataRows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), cells[index] ?? ""]))
  );
}

export function parseCsv(text, options = {}) {
  const normalizedText = String(text || "").replace(/^\uFEFF/, "");
  const firstLine = normalizedText.split(/\r?\n/, 1)[0] || "";
  const delimiter = options.delimiter || detectDelimiter(firstLine);
  return rowsToObjects(parseDelimitedRows(normalizedText, delimiter), options);
}

async function readSource(source) {
  if (!source) throw new Error("Provide --file or --url.");
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Download failed ${response.status}: ${source}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  return fs.readFile(path.resolve(process.cwd(), source));
}

export async function readTabularFile({ file, url, sheet, headerRow, headerIncludes, delimiter }) {
  const source = file || url;
  const buffer = await readSource(source);
  const sourceName = String(source || "").toLowerCase();

  if (sourceName.endsWith(".xlsx") || sourceName.endsWith(".xls")) {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = sheet || workbook.SheetNames[0];
    if (!workbook.Sheets[sheetName]) {
      throw new Error(`Sheet not found: ${sheetName}`);
    }
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    return rowsToObjects(rows, { headerRow, headerIncludes });
  }

  return parseCsv(buffer.toString("utf8").replace(/^\uFEFF/, ""), {
    headerRow,
    headerIncludes,
    delimiter,
  });
}

function normalizeCountyLookupName(value) {
  const base = String(value || "")
    .toLowerCase()
    .replace(/\bst[. ]/g, "saint ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return base.replace(
    /\s+(county|parish|borough|census area|municipality|city and borough|city|municipio)$/i,
    ""
  );
}

function countyAliases(countyName) {
  const normalized = normalizeCountyLookupName(countyName);
  const aliases = new Set([normalized]);
  if (normalized.startsWith("saint ")) {
    aliases.add(normalized.replace(/^saint /, "st "));
  }
  if (normalized.startsWith("st ")) {
    aliases.add(normalized.replace(/^st /, "saint "));
  }
  return [...aliases].filter(Boolean);
}

export async function loadCountyLookup({ file, url } = {}) {
  const rows = await readTabularFile({
    file,
    url: url || DEFAULT_COUNTY_REFERENCE_URL,
    delimiter: "|",
    headerIncludes: ["STATE", "STATEFP", "COUNTYFP", "COUNTYNAME"],
  });
  const byName = new Map();
  const byState = new Map();

  for (const row of rows) {
    const stateCode = cleanText(getField(row, ["STATE", "state_code"]))?.toUpperCase();
    const stateFips = String(getField(row, ["STATEFP", "state_fips"])).padStart(2, "0");
    const countyFipsPart = String(getField(row, ["COUNTYFP", "county_fips"])).padStart(3, "0");
    const countyName = cleanText(getField(row, ["COUNTYNAME", "County Name", "county_name"]));
    if (!stateCode || !stateFips || !countyFipsPart || !countyName) continue;
    const county = {
      county_fips: `${stateFips}${countyFipsPart}`,
      county_name: countyName.replace(/\s+County$/i, ""),
      state_code: stateCode,
    };

    for (const alias of countyAliases(countyName)) {
      byName.set(`${stateCode}:${alias}`, county);
    }
    const stateList = byState.get(stateCode) || [];
    stateList.push(county);
    byState.set(stateCode, stateList);
  }

  return { byName, byState };
}

export function resolveCountyEntries(countyLookup, { stateCode, countyName }) {
  const state = cleanText(stateCode)?.toUpperCase();
  const county = cleanText(countyName);
  if (!countyLookup || !state || !county) return [];
  if (/^all counties$/i.test(county)) return countyLookup.byState.get(state) || [];

  for (const alias of countyAliases(county)) {
    const match = countyLookup.byName.get(`${state}:${alias}`);
    if (match) return [match];
  }

  return [];
}

export function chunkArray(items, size = 500) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function upsertRows({
  supabase,
  table,
  rows,
  onConflict,
  batchSize = 500,
}) {
  let written = 0;
  for (const batch of chunkArray(rows, batchSize)) {
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict, ignoreDuplicates: false });
    if (error) throw error;
    written += batch.length;
    console.log(`${table}: ${written}/${rows.length}`);
  }
  return written;
}

export function uniqueRows(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (key) map.set(key, row);
  }
  return [...map.values()];
}

export function splitList(value) {
  return String(value ?? "")
    .split(/[;|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
