// Lossless JSON for rows carried between databases. Rows are read with
// to_jsonb(t)::text and written with jsonb_populate_recordset, so numeric,
// bigint and float values must survive a JavaScript round trip unchanged.
// JSON.parse source-text access keeps every number as its original text.

export function parseLossless(text) {
  return JSON.parse(text, (_key, value, context) =>
    typeof value === 'number' ? JSON.rawJSON(context.source) : value);
}

export function stringifyLossless(value) {
  return JSON.stringify(value);
}

export function isRawJSON(value) {
  return typeof JSON.isRawJSON === 'function' && JSON.isRawJSON(value);
}

// Returns a plain JS scalar for a value that may be a raw JSON number.
export function scalar(value) {
  return isRawJSON(value) ? JSON.parse(JSON.stringify(value)) : value;
}
