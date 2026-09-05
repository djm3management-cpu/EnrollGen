import assert from "node:assert/strict";
import test from "node:test";
import {
  contractStatusForMatrix,
  formatStateAppointments,
  mergeChunkResults,
  normalizeChunkResult,
  parseAnthropicJson,
  parseRtsFile,
} from "../netlify/functions/_rtsIngestion.js";

test("parseRtsFile parses a header-based CSV", async () => {
  const file = new File(
    ["Producer,NPN,Carrier,Status\nJane Doe,123456,Aetna,Active\n"],
    "appointments.csv",
    { type: "text/csv" }
  );
  const parsed = await parseRtsFile(file);
  assert.deepEqual(parsed.headers, ["Producer", "NPN", "Carrier", "Status"]);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].Carrier, "Aetna");
});

test("normalizeChunkResult constrains normalized enums and dates", () => {
  const normalized = normalizeChunkResult(
    {
      source_format: { source_type: "Ritter", confidence: 1 },
      agents_matched: [],
      carrier_mappings: [],
      rts_records: [
        {
          agent_raw_name: "Jane Doe",
          carrier_raw_name: "Example Carrier",
          product_line: "unexpected",
          contract_status: "not-a-status",
          states: [
            { state: "fl", sub_status: "apt" },
            { state: "Florida", sub_status: "APT" },
          ],
          certifications: [{ name: "AHIP", status: "complete", date: "2026-08-01" }],
          termination_date: "August 1",
        },
      ],
      warnings: [{ type: "MISSING_NPN", message: "No NPN", row_index: 1 }],
    },
    30,
    1
  );
  assert.equal(normalized.rts_records[0].product_line, "other");
  assert.equal(normalized.rts_records[0].contract_status, "INACTIVE");
  assert.deepEqual(normalized.rts_records[0].states, [{ state: "FL", sub_status: "APT" }]);
  assert.equal(normalized.rts_records[0].termination_date, null);
  assert.equal(normalized.warnings[0].row_index, 31);
});

test("mergeChunkResults deduplicates mappings and preserves records", () => {
  const base = {
    source_format: {
      detected_columns: { Carrier: "carrier" },
      row_count: 1,
      source_type: "Savoy",
      confidence: 0.8,
    },
    agents_matched: [],
    carrier_mappings: [
      {
        raw_carrier_name: "Aetna",
        matched_carrier_id: "1",
        matched_carrier_name: "Aetna",
        match_status: "MATCHED",
        suggested_name: "Aetna",
        confidence: 0.8,
      },
    ],
    rts_records: [{ _review_id: "0:0" }],
    warnings: [],
  };
  const merged = mergeChunkResults(
    [
      base,
      {
        ...base,
        carrier_mappings: [{ ...base.carrier_mappings[0], confidence: 0.95 }],
        rts_records: [{ _review_id: "30:0" }],
      },
    ],
    2
  );
  assert.equal(merged.carrier_mappings.length, 1);
  assert.equal(merged.carrier_mappings[0].confidence, 0.95);
  assert.equal(merged.rts_records.length, 2);
});

test("JSON and matrix formatting helpers are resilient", () => {
  assert.deepEqual(parseAnthropicJson("```json\n{\"ok\":true}\n```"), { ok: true });
  assert.equal(contractStatusForMatrix("BLACKOUT"), "Blackout");
  assert.equal(
    formatStateAppointments([
      { state: "FL", sub_status: "APT" },
      { state: "tx", sub_status: null },
    ]),
    "FL (APT), TX"
  );
});
