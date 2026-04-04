import React, { useCallback, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { useScript } from "../context/ScriptContext";
import { useLiveCall } from "../context/LiveCallContext";
import { generateSessionSummary } from "../context/scriptReducer";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";
import {
  scoreCompliance,
  scoreTwoSided,
  groupByCategory,
} from "../context/ComplianceScorer";
import { getDeterministicBlockers } from "../lib/deterministicBlockers";

/* ═══════════════════════════════════════════════════
   LEVEL STYLES (matching ScriptPrompter)
   ═══════════════════════════════════════════════════ */
const LEVEL_COLORS = {
  info: { text: "#0ea5e9", bg: "#f0f9ff", border: "#bae6fd", icon: "💡" },
  remind: { text: "#8b5cf6", bg: "#f5f3ff", border: "#c4b5fd", icon: "🔔" },
  tip: { text: "#16a34a", bg: "#f0fdf4", border: "#86efac", icon: "✅" },
  warn: { text: "#d97706", bg: "#fffbeb", border: "#fcd34d", icon: "⚠️" },
  critical: { text: "#dc2626", bg: "#fef2f2", border: "#fca5a5", icon: "🚨" },
};

let pdfRuntimePromise;

function loadPdfRuntime() {
  if (!pdfRuntimePromise) {
    pdfRuntimePromise = Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]).then(([jspdfModule, autoTableModule]) => ({
      jsPDF: jspdfModule.jsPDF,
      autoTable: autoTableModule.default,
    }));
  }

  return pdfRuntimePromise;
}

/* ═══════════════════════════════════════════════════
   COMPLIANCE SCORE GAUGE (SVG)
   ═══════════════════════════════════════════════════ */
function buildScoreGaugeSVG(score, grade) {
  const color =
    score >= 90
      ? "#16a34a"
      : score >= 75
      ? "#d97706"
      : score >= 50
      ? "#ea580c"
      : "#dc2626";
  const bgColor =
    score >= 90
      ? "#f0fdf4"
      : score >= 75
      ? "#fffbeb"
      : score >= 50
      ? "#fff7ed"
      : "#fef2f2";
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  return `
    <div style="text-align:center;margin:20px 0;">
      <svg width="160" height="160" viewBox="0 0 140 140" style="display:block;margin:0 auto;">
        <circle cx="70" cy="70" r="54" fill="none" stroke="#e2e8f0" stroke-width="12"/>
        <circle cx="70" cy="70" r="54" fill="none" stroke="${color}" stroke-width="12"
          stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          transform="rotate(-90 70 70)"/>
        <text x="70" y="62" text-anchor="middle" font-size="32" font-weight="800" fill="${color}">${score}</text>
        <text x="70" y="82" text-anchor="middle" font-size="13" font-weight="600" fill="#666">${grade}</text>
      </svg>
      <div style="font-size:10px;color:#666;margin-top:4px;">Compliance Score (0–100)</div>
    </div>`;
}

/* ═══════════════════════════════════════════════════
   COMPLIANCE BREAKDOWN TABLE
   ═══════════════════════════════════════════════════ */
function buildComplianceHTML(complianceResult) {
  let html = `
    <div style="page-break-before:always;"></div>
    <div class="section-header" style="margin-top:24px;">Compliance Assessment</div>
    ${buildScoreGaugeSVG(complianceResult.score, complianceResult.grade)}
    <div style="background:${
      complianceResult.score >= 75 ? "#f0fdf4" : "#fef2f2"
    };
      border:1px solid ${complianceResult.score >= 75 ? "#86efac" : "#fca5a5"};
      border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#1a1a2e;">
      <strong>Summary:</strong> ${complianceResult.summary}
    </div>`;

  for (const category of complianceResult.categories) {
    html += `
      <div style="margin-bottom:16px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;
          color:#0ea5e9;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #e2e8f0;">
          ${category.name} — ${category.score}% (${category.pointsEarned}/${category.pointsMax})
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <tbody>`;
    for (const item of category.questions) {
      const statusColor =
        item.score >= 85 ? "#16a34a" : item.score >= 60 ? "#d97706" : "#dc2626";
      const statusIcon = item.score >= 85 ? "✔" : item.score >= 60 ? "△" : "✗";
      const transcriptMeta =
        item.hasTranscriptEvidence && item.transcriptConfidence
          ? ` • transcript ${item.transcriptConfidence}%`
          : "";
      html += `
            <tr>
              <td style="width:28px;padding:5px 6px;font-size:14px;font-weight:700;color:${statusColor};border-bottom:1px solid #f1f5f9;">${statusIcon}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;">
                <div style="font-size:12px;font-weight:600;color:#1a1a2e;">${item.question}</div>
                <div style="font-size:10px;color:#666;margin-top:1px;">${item.evidence} • source: ${item.source}${transcriptMeta}</div>
              </td>
              <td style="width:50px;padding:5px 6px;text-align:right;font-size:11px;font-weight:700;
                color:${statusColor};border-bottom:1px solid #f1f5f9;">
                ${item.score}%
              </td>
            </tr>`;
    }
    html += `</tbody></table></div>`;
  }

  // Flags section (if any)
  if (complianceResult.flags.length > 0) {
    html += `
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;margin-top:12px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;
          color:#dc2626;margin-bottom:8px;">
          🚩 Compliance Flags (${complianceResult.flags.length})
        </div>`;
    for (const flag of complianceResult.flags) {
      const sevColor =
        flag.severity === "high"
          ? "#dc2626"
          : flag.severity === "medium"
          ? "#d97706"
          : "#94a3b8";
      html += `
        <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px;">
          <span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;
            background:${sevColor};color:#fff;text-transform:uppercase;flex-shrink:0;margin-top:1px;">
            ${flag.severity}
          </span>
          <div style="font-size:11px;color:#1a1a2e;">
            <strong>${flag.question}</strong> — ${flag.evidence}
          </div>
        </div>`;
    }
    html += `</div>`;
  }

  return html;
}

/* ═══════════════════════════════════════════════════
   AI COPILOT TRANSCRIPT
   ═══════════════════════════════════════════════════ */
function buildTranscriptHTML(entries) {
  if (!entries || entries.length === 0) {
    return `
      <div class="section-header" style="margin-top:24px;">AI Co-Pilot Transcript</div>
      <div style="font-size:12px;color:#94a3b8;padding:12px;text-align:center;">
        No AI Co-Pilot activity was recorded during this session.
      </div>`;
  }

  // Group by type for cleaner display
  const copilotMsgs = entries.filter(
    (e) => e.logType === LOG_TYPES.COPILOT_MSG
  );
  const coachTips = entries.filter(
    (e) => e.logType === LOG_TYPES.SECTION_COACH
  );
  const objections = entries.filter((e) => e.logType === LOG_TYPES.OBJECTION);
  const alerts = entries.filter((e) => e.logType === LOG_TYPES.FLOATING_ALERT);
  const systemEvents = entries.filter(
    (e) => e.logType === LOG_TYPES.SYSTEM_EVENT
  );

  let html = `
    <div style="page-break-before:always;"></div>
    <div class="section-header" style="margin-top:24px;">AI Co-Pilot Transcript</div>
    <div style="font-size:11px;color:#666;margin-bottom:12px;">
      Total entries: ${entries.length} &nbsp;|&nbsp;
      Co-Pilot messages: ${copilotMsgs.length} &nbsp;|&nbsp;
      Coach tips: ${coachTips.length} &nbsp;|&nbsp;
      Objections handled: ${objections.length} &nbsp;|&nbsp;
      Alerts: ${alerts.length}
    </div>`;

  // Full chronological transcript
  html += `<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <thead>
      <tr style="background:#f0f9ff;">
        <th style="width:65px;text-align:left;font-size:9px;font-weight:700;letter-spacing:0.06em;
          text-transform:uppercase;color:#0ea5e9;padding:6px 8px;border-bottom:2px solid #0ea5e9;">Time</th>
        <th style="width:28px;padding:6px 4px;border-bottom:2px solid #0ea5e9;"></th>
        <th style="width:100px;text-align:left;font-size:9px;font-weight:700;letter-spacing:0.06em;
          text-transform:uppercase;color:#0ea5e9;padding:6px 8px;border-bottom:2px solid #0ea5e9;">Source</th>
        <th style="text-align:left;font-size:9px;font-weight:700;letter-spacing:0.06em;
          text-transform:uppercase;color:#0ea5e9;padding:6px 8px;border-bottom:2px solid #0ea5e9;">Message</th>
      </tr>
    </thead>
    <tbody>`;

  for (const entry of entries) {
    const style = LEVEL_COLORS[entry.level] || LEVEL_COLORS.info;
    const sourceLabel =
      {
        [LOG_TYPES.COPILOT_MSG]: "Co-Pilot",
        [LOG_TYPES.FLOATING_ALERT]: "Alert",
        [LOG_TYPES.SECTION_COACH]: "Coach",
        [LOG_TYPES.OBJECTION]: "Objection",
        [LOG_TYPES.SYSTEM_EVENT]: "System",
      }[entry.logType] || "Unknown";

    html += `
      <tr style="background:${
        entry.level === "warn" || entry.level === "critical"
          ? style.bg
          : "transparent"
      };">
        <td style="padding:5px 8px;font-size:10px;color:#666;border-bottom:1px solid #f1f5f9;
          vertical-align:top;white-space:nowrap;">${entry.timeDisplay}</td>
        <td style="padding:5px 4px;font-size:13px;border-bottom:1px solid #f1f5f9;
          vertical-align:top;">${style.icon}</td>
        <td style="padding:5px 8px;font-size:10px;font-weight:600;color:${
          style.text
        };
          border-bottom:1px solid #f1f5f9;vertical-align:top;">${sourceLabel}
          <span style="font-size:9px;opacity:0.7;display:block;">${
            entry.level
          }</span></td>
        <td style="padding:5px 8px;font-size:11px;color:#1a1a2e;border-bottom:1px solid #f1f5f9;
          vertical-align:top;line-height:1.4;">${escapeHtml(entry.message)}
          ${
            entry.meta?.section
              ? `<span style="font-size:9px;color:#94a3b8;"> (${entry.meta.section})</span>`
              : ""
          }
          ${
            entry.meta?.objection
              ? `<div style="font-size:10px;color:#666;margin-top:2px;">Client: "${escapeHtml(
                  entry.meta.objection
                )}"</div>`
              : ""
          }
        </td>
      </tr>`;
  }

  html += `</tbody></table>`;

  return html;
}

/* ═══════════════════════════════════════════════════
   WARNINGS SUMMARY (separate prominent section)
   ═══════════════════════════════════════════════════ */
function buildWarningsHTML(warnings) {
  if (!warnings || warnings.length === 0) {
    return `
      <div class="section-header" style="margin-top:20px;">Warnings & Alerts</div>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;
        padding:12px 16px;font-size:12px;color:#16a34a;text-align:center;">
        ✔ No warnings or critical alerts were triggered during this session.
      </div>`;
  }

  let html = `
    <div class="section-header" style="margin-top:20px;">⚠️ Warnings & Alerts (${warnings.length})</div>
    <div style="border:2px solid #fcd34d;border-radius:8px;overflow:hidden;margin-bottom:16px;">`;

  for (let i = 0; i < warnings.length; i++) {
    const w = warnings[i];
    const style = LEVEL_COLORS[w.level] || LEVEL_COLORS.warn;
    html += `
      <div style="display:flex;gap:8px;align-items:flex-start;padding:10px 14px;
        background:${style.bg};border-bottom:${
      i < warnings.length - 1 ? "1px solid " + style.border : "none"
    };">
        <span style="font-size:14px;flex-shrink:0;">${style.icon}</span>
        <div style="flex:1;">
          <div style="font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;
            color:${style.text};margin-bottom:2px;">
            ${w.level.toUpperCase()} — ${w.timeDisplay}
            ${w.meta?.section ? ` — ${w.meta.section}` : ""}
          </div>
          <div style="font-size:11px;color:#1a1a2e;line-height:1.4;">${escapeHtml(
            w.message
          )}</div>
        </div>
      </div>`;
  }

  html += `</div>`;
  return html;
}

/* ═══════════════════════════════════════════════════
   FULL PDF HTML BUILDER
   ═══════════════════════════════════════════════════ */
function buildPrintHTML(summary, complianceResult, copilotEntries, warnings) {
  const sectionRows = summary.sections
    .map(
      (s) => `
      <tr>
        <td class="${s.completed ? "ok" : "miss"}">${
        s.completed ? "✔" : "✗"
      }</td>
        <td>${s.section}</td>
        <td>${s.detail || "—"}</td>
        <td>${s.duration}</td>
      </tr>`
    )
    .join("");

  const products = summary.optionalProducts;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>EnrollGen Session Summary</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a2e; background: #fff; padding: 32px; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #0ea5e9; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 22px; font-weight: 800; color: #0ea5e9; letter-spacing: 2px; }
  .brand span { color: #1a1a2e; }
  .meta { text-align: right; font-size: 11px; color: #666; }
  .meta strong { display: block; font-size: 13px; color: #1a1a2e; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
  .card-title { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #0ea5e9; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
  .field { display: flex; justify-content: space-between; margin-bottom: 6px; }
  .field label { color: #666; font-size: 12px; }
  .field value { font-weight: 600; font-size: 12px; color: #1a1a2e; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead tr { background: #f0f9ff; }
  th { text-align: left; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #0ea5e9; padding: 8px 10px; border-bottom: 2px solid #0ea5e9; }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
  tr:last-child td { border-bottom: none; }
  .ok { color: #16a34a; font-weight: 700; font-size: 14px; }
  .miss { color: #dc2626; font-weight: 700; font-size: 14px; }
  .products { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .product-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; text-align: center; }
  .product-name { font-size: 11px; color: #666; margin-bottom: 4px; }
  .product-status { font-size: 13px; font-weight: 700; color: #1a1a2e; }
  .product-status.discussed { color: #16a34a; }
  .product-status.opened { color: #d97706; }
  .product-status.skipped { color: #94a3b8; }
  .section-header { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #0ea5e9; margin-bottom: 10px; margin-top: 20px; }
  .footer { text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 24px; }
  .score-badge { display: inline-block; font-size: 18px; font-weight: 800; padding: 4px 14px;
    border-radius: 6px; margin-left: 12px; }
  @media print {
    body { padding: 20px; }
    .page-break { page-break-before: always; }
  }
</style>
</head>
<body>

<!-- ═══ PAGE 1: Session Summary ═══ -->
<div class="header">
  <div>
    <div class="brand">ENROLL<span>GEN</span></div>
    <div style="font-size:11px;color:#666;margin-top:2px;">New Gen Health Solutions</div>
  </div>
  <div class="meta">
    <strong>Session Summary
      <span class="score-badge" style="background:${
        complianceResult.score >= 90
          ? "#f0fdf4;color:#16a34a;border:2px solid #86efac"
          : complianceResult.score >= 75
          ? "#fffbeb;color:#d97706;border:2px solid #fcd34d"
          : "#fef2f2;color:#dc2626;border:2px solid #fca5a5"
      }">
        ${complianceResult.score}/100
      </span>
    </strong>
    Generated: ${new Date().toLocaleString()}
  </div>
</div>

<div class="grid">
  <div class="card">
    <div class="card-title">Agent Information</div>
    <div class="field"><label>Agent Name</label><value>${
      summary.agentName
    }</value></div>
    <div class="field"><label>Session Start</label><value>${
      summary.sessionStart
    }</value></div>
    <div class="field"><label>Session End</label><value>${
      summary.sessionEnd
    }</value></div>
  </div>
  <div class="card">
    <div class="card-title">Enrollment Details</div>
    <div class="field"><label>Plan Name</label><value>${
      summary.planName
    }</value></div>
    <div class="field"><label>Effective Date</label><value>${
      summary.effectiveDate
    }</value></div>
    <div class="field"><label>Enrollment Code</label><value>${
      summary.enrollmentCode
    }</value></div>
    <div class="field"><label>Confirmation #</label><value>${
      summary.confirmationNumber
    }</value></div>
    <div class="field"><label>SNP Type</label><value>${
      summary.snpType
    }</value></div>
  </div>
</div>

<div class="section-header">Sections Completed</div>
<table>
  <thead><tr><th style="width:40px"></th><th>Section</th><th>Detail</th><th style="width:100px">Duration</th></tr></thead>
  <tbody>${sectionRows}</tbody>
</table>

<div class="section-header">Optional Products</div>
<div class="products">
  <div class="product-card">
    <div class="product-name">Hospital Indemnity</div>
    <div class="product-status ${products.hospitalIndemnity.toLowerCase()}">${
    products.hospitalIndemnity
  }</div>
  </div>
  <div class="product-card">
    <div class="product-name">Dental &amp; Vision</div>
    <div class="product-status ${products.dentalVision.toLowerCase()}">${
    products.dentalVision
  }</div>
  </div>
  <div class="product-card">
    <div class="product-name">Final Expense</div>
    <div class="product-status ${products.finalExpense.toLowerCase()}">${
    products.finalExpense
  }</div>
  </div>
</div>

<!-- ═══ Warnings Summary ═══ -->
${buildWarningsHTML(warnings)}

<!-- ═══ PAGE 2: Compliance Assessment ═══ -->
${buildComplianceHTML(complianceResult)}

<!-- ═══ PAGE 3: AI Co-Pilot Transcript ═══ -->
${buildTranscriptHTML(copilotEntries)}

<div class="footer">
  EnrollGen by New Gen Health Solutions &nbsp;|&nbsp; Local session only &nbsp;|&nbsp;
  Compliance Score: ${complianceResult.score}/100 (${
    complianceResult.grade
  }) &nbsp;|&nbsp;
  ${new Date().toLocaleDateString()}
</div>
</body>
</html>`;
}

/* ═══════════════════════════════════════════════════
   HELPER
   ═══════════════════════════════════════════════════ */
/* ── PDF THEME PALETTE ── */
const PC = {
  bg:       [5,  5,  5],
  surface:  [13, 13, 13],
  surface2: [19, 19, 19],
  border:   [28, 28, 28],
  red:      [232, 0,   45],
  green:    [0,   209, 102],
  gold:     [255, 215, 0],
  orange:   [255, 140, 0],
  white:    [230, 230, 230],
  muted:    [110, 110, 110],
  dim:      [50,  50,  50],
};

function fillBg(doc) {
  doc.setFillColor(...PC.bg);
  doc.rect(0, 0, 210, 300, "F");
}

function drawPageHeader(doc, subtitle = "Session Summary") {
  doc.setFillColor(...PC.red);
  doc.rect(0, 0, 210, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text("ENROLLGEN", 6, 6);
  doc.setTextColor(255, 200, 200);
  doc.text(`· ${subtitle}`, 35, 6);
  doc.setTextColor(255, 200, 200);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 204, 6, { align: "right" });
}

function addWrappedText(doc, text, x, y, options = {}) {
  const { maxWidth = 170, lineHeight = 5 } = options;
  const lines = doc.splitTextToSize(text || "", maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function addSectionTitle(doc, title, y) {
  doc.setFillColor(...PC.red);
  doc.rect(14, y - 3.5, 2, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PC.red);
  doc.text(title.toUpperCase(), 18, y);
  doc.setDrawColor(...PC.border);
  doc.setLineWidth(0.25);
  doc.line(14, y + 2, 196, y + 2);
  return y + 7;
}

function ensurePage(doc, y, needed = 20) {
  if (y + needed <= 278) return y;
  doc.addPage();
  fillBg(doc);
  drawPageHeader(doc);
  return 16;
}

function getPdfScoreColor(score) {
  if (score >= 90) return PC.green;
  if (score >= 75) return PC.gold;
  if (score >= 50) return PC.orange;
  return PC.red;
}

function drawMetricCard(doc, x, y, width, title, value, accent) {
  doc.setFillColor(...PC.surface);
  doc.setDrawColor(...PC.border);
  doc.roundedRect(x, y, width, 20, 1, 1, "FD");
  doc.setFillColor(...accent);
  doc.rect(x, y, 2, 20, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...PC.muted);
  doc.text(title, x + 5, y + 6.5);
  doc.setFontSize(13);
  doc.setTextColor(...PC.white);
  doc.text(String(value), x + 5, y + 15);
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function exportSessionSummaryPdf(
  summary,
  complianceResult,
  copilotEntries,
  warnings,
  blockers,
  pdfRuntime
) {
  const { jsPDF, autoTable } = pdfRuntime;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const scoreColor = getPdfScoreColor(complianceResult.score);

  /* shared autoTable style defaults */
  const tBase = () => ({
    styles: {
      fillColor: PC.surface,
      textColor: PC.white,
      lineColor: PC.border,
      lineWidth: 0.2,
      fontSize: 9,
      cellPadding: 2.8,
    },
    headStyles: {
      fillColor: [20, 3, 8],
      textColor: PC.red,
      fontStyle: "bold",
      lineColor: [40, 5, 12],
      lineWidth: 0.2,
      fontSize: 8,
      letterSpacing: 0.06,
    },
    alternateRowStyles: { fillColor: PC.surface2 },
    didAddPage: () => { fillBg(doc); drawPageHeader(doc); },
  });

  /* ── PAGE 1 ── */
  fillBg(doc);
  drawPageHeader(doc);
  let y = 16;

  /* Compliance score hero row */
  const heroAccent = scoreColor;
  drawMetricCard(doc, 14,  y, 42, "Overall Score",     `${complianceResult.score}/100`,                                        heroAccent);
  drawMetricCard(doc, 60,  y, 42, "Grade",             complianceResult.grade,                                                  heroAccent);
  drawMetricCard(doc, 106, y, 44, "Categories Passed", `${complianceResult.categoriesPassed}/${complianceResult.totalCategories}`, PC.red);
  drawMetricCard(doc, 154, y, 42, "Checks Passed",     `${complianceResult.totalPassed}/${complianceResult.totalQuestions}`,     PC.red);
  y += 26;

  /* Agent info + enrollment details side-by-side */
  y = addSectionTitle(doc, "Call Details", y);
  autoTable(doc, {
    ...tBase(),
    startY: y,
    head: [["Field", "Value", "Field", "Value"]],
    body: [
      ["Agent Name",     summary.agentName || "—",           "Plan Name",        summary.planName || "—"],
      ["Session Start",  summary.sessionStart || "—",         "Effective Date",   summary.effectiveDate || "—"],
      ["Session End",    summary.sessionEnd || "—",           "Enrollment Code",  summary.enrollmentCode || "—"],
      ["SNP Type",       summary.snpType || "None",           "Confirmation #",   summary.confirmationNumber || "—"],
    ],
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 32, textColor: PC.muted },
      2: { fontStyle: "bold", cellWidth: 32, textColor: PC.muted },
    },
  });

  y = doc.lastAutoTable.finalY + 8;
  y = addSectionTitle(doc, "Sections Completed", y);
  autoTable(doc, {
    ...tBase(),
    startY: y,
    head: [["Status", "Section", "Detail", "Duration"]],
    body: summary.sections.map((s) => [
      s.completed ? "DONE" : "MISSED",
      s.section,
      s.detail || "—",
      s.duration,
    ]),
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== 0) return;
      const val = data.cell.text[0];
      data.cell.styles.textColor = val === "DONE" ? PC.green : PC.red;
      data.cell.styles.fontStyle = "bold";
    },
    columnStyles: {
      0: { cellWidth: 18 },
      3: { cellWidth: 22, halign: "right" },
    },
  });

  y = doc.lastAutoTable.finalY + 8;
  y = addSectionTitle(doc, "Deterministic Blockers", y);
  if (blockers.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...PC.green);
    doc.text("No deterministic blockers active at export time.", 14, y);
    y += 8;
  } else {
    autoTable(doc, {
      ...tBase(),
      startY: y,
      head: [["Severity", "Blocker", "Detail"]],
      body: blockers.map((b) => [b.severity.toUpperCase(), b.label, b.detail]),
      headStyles: { ...tBase().headStyles, fillColor: [20, 5, 5], textColor: PC.red },
      columnStyles: {
        0: { cellWidth: 22, fontStyle: "bold", textColor: PC.red },
        1: { cellWidth: 46, fontStyle: "bold" },
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  y = ensurePage(doc, y, 36);
  y = addSectionTitle(doc, "Optional Products", y);
  autoTable(doc, {
    ...tBase(),
    startY: y,
    head: [["Product", "Status"]],
    body: [
      ["Hospital Indemnity", summary.optionalProducts.hospitalIndemnity],
      ["Dental & Vision",    summary.optionalProducts.dentalVision],
      ["Final Expense",      summary.optionalProducts.finalExpense],
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 50, textColor: PC.muted } },
  });

  y = ensurePage(doc, doc.lastAutoTable.finalY + 10, 40);
  y = addSectionTitle(doc, "Warnings & Alerts", y);
  if (warnings.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...PC.green);
    doc.text("No warnings or critical alerts were triggered during this session.", 14, y);
    y += 8;
  } else {
    const levelColor = { critical: PC.red, warn: PC.gold, remind: [180, 120, 255], tip: PC.green, info: PC.white };
    warnings.forEach((warning) => {
      y = ensurePage(doc, y, 18);
      const lc = levelColor[warning.level] || PC.white;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...lc);
      doc.text(
        `${warning.level.toUpperCase()}  ${warning.timeDisplay}${warning.meta?.section ? `  ·  ${warning.meta.section}` : ""}`,
        14, y
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...PC.white);
      y = addWrappedText(doc, warning.message, 14, y + 5, { maxWidth: 180, lineHeight: 4.5 });
      y += 3;
    });
  }

  /* ── PAGE 2: COMPLIANCE ── */
  doc.addPage();
  fillBg(doc);
  drawPageHeader(doc, "Compliance Assessment");
  y = 16;

  y = addSectionTitle(doc, "Compliance Assessment", y);
  drawMetricCard(doc, 14,  y, 42, "Overall Score",     `${complianceResult.score}/100`,                                        scoreColor);
  drawMetricCard(doc, 60,  y, 42, "Grade",             complianceResult.grade,                                                  scoreColor);
  drawMetricCard(doc, 106, y, 44, "Categories Passed", `${complianceResult.categoriesPassed}/${complianceResult.totalCategories}`, PC.red);
  drawMetricCard(doc, 154, y, 42, "Checks Passed",     `${complianceResult.totalPassed}/${complianceResult.totalQuestions}`,     PC.red);
  y += 28;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PC.muted);
  doc.text("ASSESSMENT SUMMARY", 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...PC.white);
  y = addWrappedText(doc, complianceResult.summary, 14, y + 5, { maxWidth: 182, lineHeight: 4.5 });
  y += 4;

  if (complianceResult.transcriptStats) {
    y = ensurePage(doc, y + 2, 28);
    y = addSectionTitle(doc, "Live Transcript Summary", y);
    autoTable(doc, {
      ...tBase(),
      startY: y,
      head: [["Mode", "Coverage", "Intents Detected", "Violations"]],
      body: [[
        complianceResult.scoringMode === "strict_two_sided"
          ? "Strict Transcript + Customer"
          : complianceResult.scoringMode === "strict_transcript"
          ? "Strict Transcript"
          : complianceResult.scoringMode === "inactive"
          ? "Mic Off / No Transcript"
          : complianceResult.scoringMode === "dual"
          ? "Gate + Transcript"
          : "Gate Only",
        `${complianceResult.transcriptStats.coverage}%`,
        `${complianceResult.transcriptStats.intentsDetected}/${complianceResult.transcriptStats.intentsTotal}`,
        String(complianceResult.transcriptStats.violations.length),
      ]],
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  y = ensurePage(doc, y, 36);
  y = addSectionTitle(doc, "Category Overview", y);
  autoTable(doc, {
    ...tBase(),
    startY: y,
    head: [["Category", "Description", "Score", "Points", "Status"]],
    body: complianceResult.categories.map((cat) => [
      cat.name,
      cat.description,
      `${cat.score}%`,
      `${cat.pointsEarned}/${cat.pointsMax}`,
      cat.passed ? "Passed" : "Review",
    ]),
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const row = complianceResult.categories[data.row.index];
      if (!row) return;
      if (data.column.index === 2 || data.column.index === 4) {
        data.cell.styles.textColor = getPdfScoreColor(row.score);
        data.cell.styles.fontStyle = "bold";
      }
    },
    columnStyles: {
      0: { cellWidth: 34, fontStyle: "bold" },
      2: { cellWidth: 18, halign: "right" },
      3: { cellWidth: 18, halign: "right" },
      4: { cellWidth: 22 },
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  const grouped = groupByCategory(complianceResult.categories);
  Object.entries(grouped).forEach(([category, items]) => {
    y = ensurePage(doc, y, 26);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...PC.muted);
    doc.text(category.toUpperCase(), 14, y);
    doc.setDrawColor(...PC.border);
    doc.setLineWidth(0.2);
    doc.line(14, y + 1.5, 196, y + 1.5);
    autoTable(doc, {
      ...tBase(),
      startY: y + 4,
      head: [["Score", "Question", "Rationale"]],
      body: items.map((item) => [
        `${item.score}%`,
        item.question,
        `${item.evidence} (${item.source})`,
      ]),
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index !== 0) return;
        const item = items[data.row.index];
        if (item) {
          data.cell.styles.textColor = getPdfScoreColor(item.score);
          data.cell.styles.fontStyle = "bold";
        }
      },
      columnStyles: {
        0: { cellWidth: 20, halign: "right" },
        1: { cellWidth: 72, fontStyle: "bold" },
      },
    });
    y = doc.lastAutoTable.finalY + 6;
  });

  if (complianceResult.flags.length > 0) {
    y = ensurePage(doc, y, 24);
    y = addSectionTitle(doc, `Compliance Flags (${complianceResult.flags.length})`, y);
    autoTable(doc, {
      ...tBase(),
      startY: y,
      head: [["Severity", "Flag"]],
      body: complianceResult.flags.map((flag) => [
        flag.severity.toUpperCase(),
        `${flag.question} — ${flag.evidence}`,
      ]),
      headStyles: { ...tBase().headStyles, textColor: PC.red },
      columnStyles: {
        0: { cellWidth: 24, fontStyle: "bold", textColor: PC.red },
      },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  if (complianceResult.transcriptStats?.violations?.length > 0) {
    y = ensurePage(doc, y, 24);
    y = addSectionTitle(doc, `Transcript Violations (${complianceResult.transcriptStats.violations.length})`, y);
    autoTable(doc, {
      ...tBase(),
      startY: y,
      head: [["Section", "Evidence", "Severity"]],
      body: complianceResult.transcriptStats.violations.map((v) => [
        v.section,
        v.evidence || v.description,
        v.critical ? "Critical" : "Warning",
      ]),
      headStyles: { ...tBase().headStyles, textColor: PC.red },
      columnStyles: {
        0: { cellWidth: 28, fontStyle: "bold" },
        2: { cellWidth: 24, fontStyle: "bold", textColor: PC.red },
      },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  /* ── PAGE 3: AI CO-PILOT TRANSCRIPT ── */
  doc.addPage();
  fillBg(doc);
  drawPageHeader(doc, "AI Co-Pilot Transcript");
  y = 16;
  y = addSectionTitle(doc, "AI Co-Pilot Transcript", y);

  if (copilotEntries.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...PC.muted);
    doc.text("No AI Co-Pilot activity was recorded during this session.", 14, y);
  } else {
    const levelColor = { critical: PC.red, warn: PC.gold, remind: [180, 120, 255], tip: PC.green, info: [100, 180, 255] };
    autoTable(doc, {
      ...tBase(),
      startY: y,
      head: [["Time", "Source", "Level", "Message"]],
      body: copilotEntries.map((entry) => [
        entry.timeDisplay,
        { [LOG_TYPES.COPILOT_MSG]: "Co-Pilot", [LOG_TYPES.FLOATING_ALERT]: "Alert",
          [LOG_TYPES.SECTION_COACH]: "Coach",   [LOG_TYPES.OBJECTION]: "Objection",
          [LOG_TYPES.SYSTEM_EVENT]: "System" }[entry.logType] || "Unknown",
        entry.level,
        `${entry.message}${entry.meta?.section ? ` (${entry.meta.section})` : ""}`,
      ]),
      styles: { ...tBase().styles, fontSize: 8, overflow: "linebreak" },
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index !== 2) return;
        const entry = copilotEntries[data.row.index];
        if (entry) data.cell.styles.textColor = levelColor[entry.level] || PC.white;
        data.cell.styles.fontStyle = "bold";
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 22 },
        2: { cellWidth: 20, fontStyle: "bold" },
      },
    });
  }

  /* footer on every page */
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...PC.dim);
    doc.text("EnrollGen · New Gen Health Solutions · Local session only · Not for distribution", 14, 291);
    doc.text(`Page ${i} of ${pageCount}`, 196, 291, { align: "right" });
  }

  doc.save(`enrollgen-session-summary-${Date.now()}.pdf`);
}

/* ═══════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════ */
export default React.memo(function SessionSummary() {
  const { state } = useScript();
  const { liveCall } = useLiveCall();
  const { entries, getTranscript, getWarnings } = useCopilotLog();
  const [exportingPdf, setExportingPdf] = useState(false);

  const buildComplianceResult = useCallback(() => {
    const scoringOptions = {
      callStarted: liveCall.callStarted || state.enrollOk,
      callDirection: state.callDirection || liveCall.callDirection,
      mergedTranscript: liveCall.mergedTranscript,
      customerText: liveCall.customerTranscript,
    };

    if (liveCall.customerTranscript) {
      return scoreTwoSided(
        state,
        entries,
        liveCall.transcript,
        liveCall.customerTranscript,
        liveCall.mergedTranscript,
        scoringOptions
      );
    }

    return scoreCompliance(state, entries, liveCall.transcript, scoringOptions);
  }, [state, entries, liveCall]);

  const handlePDF = useCallback(async () => {
    if (exportingPdf) {
      return;
    }

    setExportingPdf(true);

    const summary = generateSessionSummary(state);
    const copilotEntries = getTranscript();
    const warnings = getWarnings();
    const complianceResult = buildComplianceResult();
    const blockers = getDeterministicBlockers(state);

    try {
      const pdfRuntime = await loadPdfRuntime();

      exportSessionSummaryPdf(
        summary,
        complianceResult,
        copilotEntries,
        warnings,
        blockers,
        pdfRuntime
      );
    } finally {
      setExportingPdf(false);
    }
  }, [
    state,
    getTranscript,
    getWarnings,
    exportingPdf,
    buildComplianceResult,
  ]);

  const handleCopyToClipboard = useCallback(() => {
    const summary = generateSessionSummary(state);
    const complianceResult = buildComplianceResult();
    const blockers = getDeterministicBlockers(state);

    const lines = [
      `Agent: ${summary.agentName}`,
      `Plan: ${summary.planName}`,
      `Effective Date: ${summary.effectiveDate}`,
      `Enrollment Code: ${summary.enrollmentCode}`,
      `Confirmation #: ${summary.confirmationNumber}`,
      `SNP: ${summary.snpType}`,
      `Compliance Score: ${complianceResult.score}/100 (${complianceResult.grade})`,
    ];
    if (blockers.length > 0) {
      lines.push("");
      lines.push("Deterministic Blockers:");
      for (const blocker of blockers) {
        lines.push(
          `  [${blocker.severity.toUpperCase()}] ${blocker.label} — ${blocker.detail}`
        );
      }
    }
    lines.push("");
    lines.push("Sections:");
    for (const s of summary.sections) {
      lines.push(
        `  ${s.completed ? "✔" : "✗"} ${s.section}: ${s.detail || "—"} (${s.duration})`
      );
    }
    lines.push("");
    lines.push(
      `Hospital Indemnity: ${summary.optionalProducts.hospitalIndemnity}`
    );
    lines.push(`Dental & Vision: ${summary.optionalProducts.dentalVision}`);
    lines.push(`Final Expense: ${summary.optionalProducts.finalExpense}`);

    if (complianceResult.flags.length > 0) {
      lines.push("");
      lines.push("Compliance Flags:");
      for (const f of complianceResult.flags) {
        lines.push(
          `  [${f.severity.toUpperCase()}] ${f.question} — ${f.evidence}`
        );
      }
    }

    navigator.clipboard.writeText(lines.join("\n"));
  }, [state, buildComplianceResult]);

  if (!state.enrollOk) return null;

  // Quick compliance preview
  const complianceResult = buildComplianceResult();
  const blockers = getDeterministicBlockers(state);
  const scoreColor =
    complianceResult.score >= 90
      ? "#16a34a"
      : complianceResult.score >= 75
      ? "#d97706"
      : "#dc2626";

  return (
    <div
      className="session-summary-bar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        padding: "14px 18px",
      }}
    >
      <span
        className="session-summary-label"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <ClipboardCheck size={16} style={{ color: "#94a3b8", flexShrink: 0 }} />
        <span>Enrollment complete — save your records</span>
        {blockers.length > 0 && (
          <span
            style={{
              fontWeight: 700,
              fontSize: "0.82em",
              color: "#fca5a5",
            }}
          >
            {blockers.length} blocker{blockers.length === 1 ? "" : "s"}
          </span>
        )}
        <span
          style={{
            fontWeight: 800,
            fontSize: "1.1em",
            color: scoreColor,
            background: `${scoreColor}18`,
            padding: "2px 10px",
            borderRadius: 5,
            border: `1.5px solid ${scoreColor}40`,
          }}
        >
          {complianceResult.score}/100 {complianceResult.grade}
        </span>
      </span>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn-clay" onClick={handleCopyToClipboard}>
          Copy Summary
        </button>
        <button className="btn-clay" onClick={handlePDF} disabled={exportingPdf}>
          {exportingPdf ? "Preparing PDF..." : "Download PDF"}
        </button>
      </div>
    </div>
  );
});
