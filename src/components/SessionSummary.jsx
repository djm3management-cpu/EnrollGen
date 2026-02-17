import React, { useCallback } from "react";
import { useScript } from "../context/ScriptContext";
import { generateSessionSummary } from "../context/scriptReducer";

function buildPrintHTML(summary) {
  const sectionRows = summary.sections
    .map(
      (s) => `
      <tr>
        <td class="${s.completed ? "ok" : "miss"}">${
        s.completed ? "✓" : "✗"
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
  .footer { text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 8px; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="brand">ENROLL<span>GEN</span></div>
    <div style="font-size:11px;color:#666;margin-top:2px;">New Gen Health Solutions</div>
  </div>
  <div class="meta">
    <strong>Session Summary</strong>
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
<div class="footer">
  EnrollGen by New Gen Health Solutions &nbsp;|&nbsp; Local session only &nbsp;|&nbsp; ${new Date().toLocaleDateString()}
</div>
</body>
</html>`;
}

export default React.memo(function SessionSummary() {
  const { state } = useScript();

  const handlePDF = useCallback(() => {
    const summary = generateSessionSummary(state);
    const html = buildPrintHTML(summary);
    const win = window.open("", "_blank", "width=820,height=950");
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 600);
  }, [state]);

  const handleCopyToClipboard = useCallback(() => {
    const summary = generateSessionSummary(state);
    const lines = [
      `Agent: ${summary.agentName}`,
      `Plan: ${summary.planName}`,
      `Effective Date: ${summary.effectiveDate}`,
      `Enrollment Code: ${summary.enrollmentCode}`,
      `Confirmation #: ${summary.confirmationNumber}`,
      `SNP: ${summary.snpType}`,
      "",
      "Sections:",
    ];
    for (const s of summary.sections) {
      lines.push(`  ${s.completed ? "✓" : "✗"} ${s.section} (${s.duration})`);
    }
    lines.push("");
    lines.push(
      `Hospital Indemnity: ${summary.optionalProducts.hospitalIndemnity}`
    );
    lines.push(`Dental & Vision: ${summary.optionalProducts.dentalVision}`);
    lines.push(`Final Expense: ${summary.optionalProducts.finalExpense}`);
    navigator.clipboard.writeText(lines.join("\n"));
  }, [state]);

  if (!state.enrollOk) return null;

  return (
    <div className="session-summary-bar">
      <span className="session-summary-label">
        📋 Enrollment complete — save your records
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
