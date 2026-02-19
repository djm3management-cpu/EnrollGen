import React, { useCallback } from "react";
import { useScript } from "../context/ScriptContext";
import { generateSessionSummary } from "../context/scriptReducer";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";
import { scoreCompliance, groupByCategory } from "../context/ComplianceScorer";

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
  const grouped = groupByCategory(complianceResult.breakdown);

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

  for (const [category, items] of Object.entries(grouped)) {
    html += `
      <div style="margin-bottom:16px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;
          color:#0ea5e9;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #e2e8f0;">
          ${category}
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <tbody>`;
    for (const item of items) {
      const statusColor = item.passed ? "#16a34a" : "#dc2626";
      const statusIcon = item.passed ? "✔" : "✗";
      html += `
            <tr>
              <td style="width:28px;padding:5px 6px;font-size:14px;font-weight:700;color:${statusColor};border-bottom:1px solid #f1f5f9;">${statusIcon}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;">
                <div style="font-size:12px;font-weight:600;color:#1a1a2e;">${item.label}</div>
                <div style="font-size:10px;color:#666;margin-top:1px;">${item.detail}</div>
              </td>
              <td style="width:50px;padding:5px 6px;text-align:right;font-size:11px;font-weight:700;
                color:${statusColor};border-bottom:1px solid #f1f5f9;">
                ${item.earned}/${item.weight}
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
            <strong>${flag.label}</strong> — ${flag.detail}
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
  <thead><tr><th style="width:40px"></th><th>Section</th><th style="width:100px">Duration</th></tr></thead>
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
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ═══════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════ */
export default React.memo(function SessionSummary() {
  const { state } = useScript();
  const { getTranscript, getWarnings } = useCopilotLog();

  const handlePDF = useCallback(() => {
    const summary = generateSessionSummary(state);
    const copilotEntries = getTranscript();
    const warnings = getWarnings();
    const complianceResult = scoreCompliance(state, copilotEntries);

    const html = buildPrintHTML(
      summary,
      complianceResult,
      copilotEntries,
      warnings
    );
    const win = window.open("", "_blank", "width=820,height=950");
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 600);
  }, [state, getTranscript, getWarnings]);

  const handleCopyToClipboard = useCallback(() => {
    const summary = generateSessionSummary(state);
    const copilotEntries = getTranscript();
    const complianceResult = scoreCompliance(state, copilotEntries);

    const lines = [
      `Agent: ${summary.agentName}`,
      `Plan: ${summary.planName}`,
      `Effective Date: ${summary.effectiveDate}`,
      `Enrollment Code: ${summary.enrollmentCode}`,
      `Confirmation #: ${summary.confirmationNumber}`,
      `SNP: ${summary.snpType}`,
      `Compliance Score: ${complianceResult.score}/100 (${complianceResult.grade})`,
      "",
      "Sections:",
    ];
    for (const s of summary.sections) {
      lines.push(`  ${s.completed ? "✔" : "✗"} ${s.section} (${s.duration})`);
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
        lines.push(`  [${f.severity.toUpperCase()}] ${f.label} — ${f.detail}`);
      }
    }

    navigator.clipboard.writeText(lines.join("\n"));
  }, [state, getTranscript]);

  if (!state.enrollOk) return null;

  // Quick compliance preview
  const copilotEntries = getTranscript();
  const complianceResult = scoreCompliance(state, copilotEntries);
  const scoreColor =
    complianceResult.score >= 90
      ? "#16a34a"
      : complianceResult.score >= 75
      ? "#d97706"
      : "#dc2626";

  return (
    <div className="session-summary-bar">
      <span className="session-summary-label">
        📋 Enrollment complete — save your records
        <span
          style={{
            marginLeft: 12,
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
      <div className="session-summary-actions">
        <button className="primary" onClick={handleCopyToClipboard}>
          📄 Copy Summary
        </button>
        <button className="primary session-summary-pdf-btn" onClick={handlePDF}>
          ⬇️ Download PDF
        </button>
      </div>
    </div>
  );
});
