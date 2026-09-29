import { MEDSUP_SECTIONS } from "../context/MedSupScript";
import { ACA_GATES } from "../flows/aca/ACAData";
import { STATE_ACA_GATES } from "../flows/aca/StateACAData";
import { U65_GATES } from "../flows/u65/U65Data";

import { MA_SCRIPT_SECTIONS } from "./maScript2027.js";
export { MA_SCRIPT_SECTIONS };

function bodyLinesForRow(row) {
  const lines = [...(row.script || [])];

  if (row.subsidyNote) {
    lines.push(`Compliance note: ${row.subsidyNote}`);
  }
  if (row.exchangeNote) {
    lines.push(`Exchange note: ${row.exchangeNote}`);
  }
  if (row.subsidyEligibleScript) {
    lines.push(row.subsidyEligibleScript);
  }
  if (row.noSubsidyScript) {
    lines.push(row.noSubsidyScript);
  }
  if (row.metalGuidance?.length) {
    lines.push("Metal guidance:");
    lines.push(...row.metalGuidance.map((item) => `- ${item}`));
  }
  if (row.sepTable?.length) {
    lines.push("SEP type reference:");
    lines.push(...row.sepTable.map((item) => `- ${item.type}: ${item.docs}; ${item.window}`));
  }
  if (row.fplTable?.length) {
    lines.push("FPL / subsidy reference:");
    lines.push(
      ...row.fplTable.map(
        (item) => `- ${item.range}: ${item.subsidy}; ${item.csr}; ${item.action}`
      )
    );
  }
  if (row.notes?.length) {
    lines.push(...row.notes.map((note) => `Agent note: ${note}`));
  }
  if (row.directions?.length) {
    lines.push(...row.directions.map((note) => `Direction: ${note}`));
  }
  if (row.signals?.length) {
    lines.push(...row.signals.map((signal) => `Signal: ${signal}`));
  }
  if (row.checklist?.length) {
    lines.push(...row.checklist.map((item) => `Checklist: ${item}`));
  }

  return lines;
}

function rowsToSections(rows, titleKey = "label", options = {}) {
  const { keyPrefix = "", sortOffset = 0 } = options;

  return rows.map((row, index) => ({
    key: `${keyPrefix}${row.key || row.id || `section_${index + 1}`}`,
    section_number: sortOffset + index + 1,
    title: row[titleKey] || row.label || row.title || `Section ${index + 1}`,
    gate_field: row.key || null,
    compliance_locked: Boolean(row.compliance),
    sort_order: sortOffset + index + 1,
    verbatim: true,
    lock_message: row.gate || "",
    body: bodyLinesForRow(row).join("\n"),
  }));
}

export const DEFAULT_SCRIPT_TEMPLATES = {
  ma: MA_SCRIPT_SECTIONS,
  medsup: rowsToSections(MEDSUP_SECTIONS),
  aca: [
    ...rowsToSections(STATE_ACA_GATES, "title", { keyPrefix: "state_" }),
    ...rowsToSections(ACA_GATES, "label", {
      keyPrefix: "ffm_",
      sortOffset: STATE_ACA_GATES.length,
    }).map((section) => ({
      ...section,
      title: `FFM: ${section.title}`,
    })),
  ],
  u65: rowsToSections(U65_GATES),
  ancillary: [],
};

export function getDefaultScriptSections(flowType) {
  return DEFAULT_SCRIPT_TEMPLATES[flowType] || [];
}
