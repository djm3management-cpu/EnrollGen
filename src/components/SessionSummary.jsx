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
let pdfRuntimePromise = null;

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

function loadPdfRuntime() {
  if (!pdfRuntimePromise) {
    pdfRuntimePromise = Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]).then(([jspdfModule, autoTableModule]) => ({
      jsPDF: jspdfModule.jsPDF || jspdfModule.default?.jsPDF || jspdfModule.default,
      autoTable:
        autoTableModule.default || autoTableModule.autoTable || autoTableModule,
    }));
  }

  return pdfRuntimePromise;
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
        complianceResult.scoringMode === "two_sided"
          ? "Two-Sided (Agent + Customer)"
          : complianceResult.scoringMode === "strict_two_sided"
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
          fontSize: 0,
        }}
      >
        <ClipboardCheck size={16} style={{ color: "#94a3b8", flexShrink: 0 }} />
        <span style={{ fontSize: "1rem" }}>Enrollment complete</span>
        <span>Enrollment complete — save your records</span>
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
