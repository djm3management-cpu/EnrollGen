import { useState, useMemo } from "react";
import { Check, ChevronDown, Copy, Phone, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import rawMarkdown from "../../docs/MA_SEP_Guide_2026.md?raw";

/* ─── Constants ─── */

const TARGET_STATES = ["AL", "AR", "FL", "IN", "KY", "MO", "NC", "NJ", "PA", "TN", "TX"];

const FEMA_END_DATES = {
  AL: "5/31", AR: "4/30", FL: "6/30", IN: null, KY: "4/30",
  MO: "4/30", NC: "4/30", NJ: "10/31", PA: "4/30", TN: "4/30", TX: "4/30",
};

const STATE_ABBREVS = {
  Alabama: "AL", Arkansas: "AR", Florida: "FL", Indiana: "IN", Kentucky: "KY",
  Missouri: "MO", "North Carolina": "NC", "New Jersey": "NJ",
  Pennsylvania: "PA", Tennessee: "TN", Texas: "TX",
};

const SEP_PILL_COLORS = {
  DST:  { bg: "rgba(120,120,120,0.15)", border: "rgba(120,120,120,0.3)", text: "#999" },
  INT:  { bg: "rgba(0,209,102,0.12)",   border: "rgba(0,209,102,0.3)",   text: "#00D166" },
  PAP:  { bg: "rgba(33,150,243,0.12)",  border: "rgba(33,150,243,0.3)",  text: "#2196F3" },
  CSNP: { bg: "rgba(168,85,247,0.12)",  border: "rgba(168,85,247,0.3)",  text: "#a855f7" },
};

/* ─── Markdown Parser ─── */

function splitByHeading(lines, level) {
  const prefix = "#".repeat(level) + " ";
  const sections = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith(prefix) && !line.startsWith(prefix + "#")) {
      current = { title: line.slice(prefix.length).trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections;
}

function parseMarkdown(md) {
  const allLines = md.replace(/\r\n/g, "\n").split("\n");
  const h2Sections = splitByHeading(allLines, 2);

  const result = { topSections: [], states: [], phoneTable: [] };

  for (const section of h2Sections) {
    const titleLower = section.title.toLowerCase();

    if (titleLower.startsWith("state-specific")) {
      // Parse individual states at ### level
      const stateBlocks = splitByHeading(section.lines, 3);
      for (const sb of stateBlocks) {
        const abbrev = STATE_ABBREVS[sb.title];
        if (!abbrev || !TARGET_STATES.includes(abbrev)) continue;

        result.states.push({
          name: sb.title,
          abbrev,
          sepTypes: parseSEPTypes(sb.lines),
          content: sb.lines,
        });
      }
    } else if (titleLower.startsWith("quick reference")) {
      result.phoneTable = parsePhoneTable(section.lines);
    } else if (!titleLower.startsWith("footprint breakdown")) {
      // Top-level sections (skip footprint table since state guides cover it)
      result.topSections.push({
        id: slugify(section.title),
        title: section.title,
        lines: section.lines,
      });
    }
  }

  return result;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function parseSEPTypes(lines) {
  for (const line of lines) {
    const match = line.match(/\*\*SEP Types Available:\*\*\s*(.+)/);
    if (match) {
      return match[1]
        .split(/[/,]/)
        .map((t) => t.trim().toUpperCase())
        .filter((t) => SEP_PILL_COLORS[t]);
    }
  }
  return [];
}

function parsePhoneTable(lines) {
  const rows = [];
  let headerPassed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|[\s-:|]+\|$/.test(trimmed)) {
      headerPassed = true;
      continue;
    }
    if (!headerPassed) continue;

    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

    if (cells.length >= 2 && cells[1]) {
      rows.push({ resource: cells[0], number: cells[1] });
    }
  }
  return rows;
}

/* ─── Content Renderers ─── */

function phoneToTel(number) {
  return "tel:" + number.replace(/[^0-9+]/g, "");
}

function SEPPill({ type }) {
  const colors = SEP_PILL_COLORS[type];
  if (!colors) return null;

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 10,
        fontFamily: "var(--font-body)",
        fontWeight: 700,
        letterSpacing: "0.1em",
        color: colors.text,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        lineHeight: "16px",
      }}
    >
      {type}
    </span>
  );
}

function RenderLines({ lines }) {
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    const nextLine = (lines[i + 1] || "").trim();

    // Skip empty lines and horizontal rules
    if (!line || line === "---") {
      i++;
      continue;
    }

    // #### sub-sub headings
    if (line.startsWith("#### ")) {
      elements.push(
        <div key={`h4-${i}`} className="at-training-subheading">
          {cleanBold(line.slice(5))}
        </div>
      );
      i++;
      continue;
    }

    // ### sub headings
    if (line.startsWith("### ")) {
      elements.push(
        <div key={`h3-${i}`} className="at-training-subheading">
          {cleanBold(line.slice(4))}
        </div>
      );
      i++;
      continue;
    }

    // Blockquote → Mandatory Disclosure callout
    if (line.startsWith(">")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      const text = quoteLines.join(" ").replace(/"/g, "").replace(/"/g, "").replace(/"/g, "").trim();
      elements.push(<DisclosureCallout key={`quote-${i}`} text={text} />);
      continue;
    }

    // Warning line (⚠️)
    if (line.includes("⚠️") || (line.startsWith("**⚠") )) {
      elements.push(
        <WarningCallout key={`warn-${i}`} text={cleanBold(line.replace(/⚠️?\s?/, ""))} />
      );
      i++;
      continue;
    }

    // Numbered list items, check for mandatory questions pattern
    if (/^\d+\.\s+"/.test(line)) {
      const questions = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        questions.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      elements.push(<MandatoryQuestions key={`mq-${i}`} items={questions} />);
      continue;
    }

    // Table
    if (line.startsWith("|") && /^\|[\s-:|]+\|$/.test(nextLine)) {
      const tableRows = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith("|")) {
        tableRows.push(lines[j].trim());
        j++;
      }
      elements.push(<MarkdownTable key={`table-${i}`} rawLines={tableRows} />);
      i = j;
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      elements.push(
        <ul key={`list-${i}`} className="at-training-list">
          {items.map((item, idx) => (
            <li key={idx}><InlineContent text={item} /></li>
          ))}
        </ul>
      );
      continue;
    }

    // Bold label line: **Label:** content
    const labelMatch = line.match(/^\*\*([^*]+?):\*\*\s*(.*)/);
    if (labelMatch) {
      elements.push(
        <div key={`label-${i}`} className="at-training-label-row">
          <span className="at-training-label">{labelMatch[1]}</span>
          {labelMatch[2] && (
            <span className="at-training-label-text">
              <InlineContent text={labelMatch[2]} />
            </span>
          )}
        </div>
      );
      i++;
      continue;
    }

    // Emphasis-only line: *text*
    if (/^\*[^*].*\*$/.test(line) || /^\(.*\)$/.test(line)) {
      elements.push(
        <p key={`em-${i}`} style={{ fontSize: 12, color: "#666", fontStyle: "italic", margin: "4px 0" }}>
          {cleanBold(line)}
        </p>
      );
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="at-training-paragraph">
        <InlineContent text={line} />
      </p>
    );
    i++;
  }

  return <>{elements}</>;
}

function InlineContent({ text }) {
  const processed = text;
  const segments = [];
  let lastIndex = 0;

  // Combined regex for bold and phone
  const combined = /\*\*([^*]+)\*\*|(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|1-\d{3}-\d{3}-\d{4})/g;
  let match;

  while ((match = combined.exec(processed)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: processed.slice(lastIndex, match.index) });
    }
    if (match[1]) {
      segments.push({ type: "bold", value: match[1] });
    } else if (match[2]) {
      segments.push({ type: "phone", value: match[2] });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < processed.length) {
    segments.push({ type: "text", value: processed.slice(lastIndex) });
  }

  if (!segments.length) return text;

  return segments.map((seg, idx) => {
    if (seg.type === "bold") {
      return <strong key={idx} style={{ color: "#eef2f5" }}>{seg.value}</strong>;
    }
    if (seg.type === "phone") {
      return (
        <a
          key={idx}
          href={phoneToTel(seg.value)}
          style={{
            color: "#76bfff",
            textDecoration: "none",
            borderBottom: "1px dashed rgba(118,191,255,0.3)",
          }}
        >
          <Phone size={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />
          {seg.value}
        </a>
      );
    }
    return <span key={idx}>{seg.value}</span>;
  });
}

function cleanBold(text) {
  return text.replace(/\*\*/g, "").replace(/\*/g, "").trim();
}

/* ─── Specialized Components ─── */

function DisclosureCallout({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  return (
    <div
      style={{
        position: "relative",
        background: "linear-gradient(135deg, rgba(33,150,243,0.08) 0%, rgba(33,150,243,0.03) 100%)",
        border: "1px solid rgba(33,150,243,0.2)",
        borderRadius: 10,
        padding: "14px 16px 14px 44px",
        margin: "10px 0",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 14,
          top: 14,
          width: 20,
          height: 20,
          borderRadius: 4,
          background: "rgba(33,150,243,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          color: "#2196F3",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      </div>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#2196F3",
          marginBottom: 6,
        }}
      >
        Mandatory Disclosure
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.65,
          color: "#cfd5df",
          fontStyle: "italic",
        }}
      >
        "{text}"
      </div>
      <button
        onClick={handleCopy}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 4,
          padding: "3px 6px",
          cursor: "pointer",
          color: copied ? "#00D166" : "#666",
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 9,
          fontFamily: "var(--font-body)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
        title="Copy disclosure text"
      >
        {copied ? <Check size={10} /> : <Copy size={10} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function WarningCallout({ text }) {
  return (
    <div
      style={{
        background: "rgba(255,193,7,0.08)",
        border: "1px solid rgba(255,193,7,0.25)",
        borderRadius: 8,
        padding: "10px 14px 10px 40px",
        margin: "8px 0",
        position: "relative",
      }}
    >
      <AlertTriangle
        size={14}
        style={{
          position: "absolute",
          left: 14,
          top: 12,
          color: "#FFC107",
        }}
      />
      <div style={{ fontSize: 12, color: "#FFC107", lineHeight: 1.5 }}>
        {text}
      </div>
    </div>
  );
}

function MandatoryQuestions({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "8px 0" }}>
      {items.map((item, idx) => {
        // Parse question and outcome
        const arrowSplit = item.split("→");
        const question = cleanBold(arrowSplit[0] || "").replace(/^[""\s]+|[""\s]+$/g, "");
        const outcome = cleanBold(arrowSplit[1] || "").trim();
        const isFail = /not available/i.test(outcome);
        const isEnsure = /ensure/i.test(outcome);

        return (
          <div
            key={idx}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8,
              padding: "10px 12px",
            }}
          >
            <div
              style={{
                flexShrink: 0,
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: isFail
                  ? "rgba(255,68,85,0.12)"
                  : isEnsure
                    ? "rgba(255,193,7,0.12)"
                    : "rgba(0,209,102,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 1,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, fontFamily: "var(--font-body)", color: isFail ? "#FF4455" : isEnsure ? "#FFC107" : "#00D166" }}>
                {idx + 1}
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "#eef2f5", lineHeight: 1.5 }}>
                "{question}"
              </div>
              {outcome && (
                <div
                  style={{
                    marginTop: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11,
                    fontWeight: 600,
                    color: isFail ? "#FF4455" : isEnsure ? "#FFC107" : "#00D166",
                  }}
                >
                  {isFail ? (
                    <XCircle size={12} />
                  ) : isEnsure ? (
                    <AlertTriangle size={12} />
                  ) : (
                    <CheckCircle size={12} />
                  )}
                  {outcome}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MarkdownTable({ rawLines }) {
  if (rawLines.length < 2) return null;

  const parseRow = (line) =>
    line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  const headers = parseRow(rawLines[0]);
  const rows = rawLines.slice(2).map(parseRow); // skip divider

  return (
    <div style={{ overflowX: "auto", margin: "8px 0" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
          fontFamily: "var(--font-body)",
        }}
      >
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: "left",
                  padding: "6px 10px",
                  fontFamily: "var(--font-body)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#666",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: "6px 10px",
                    color: "#cfd5df",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <InlineContent text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Accordion ─── */

function Accordion({ title, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen || false);

  return (
    <section className={`at-training-section${open ? " is-open" : ""}`}>
      <button
        className="at-training-section-toggle"
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-expanded={open}
      >
        <span className="at-training-section-title">{title}</span>
        <ChevronDown size={16} className="at-training-chevron" />
      </button>
      {open && (
        <div className="at-training-section-body">
          {children}
        </div>
      )}
    </section>
  );
}

/* ─── State Panel ─── */

function StatePanel({ state }) {
  const { abbrev, sepTypes, content } = state;
  const femaEnd = FEMA_END_DATES[abbrev];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* SEP type pills + FEMA date */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {sepTypes.map((t) => (
          <SEPPill key={t} type={t} />
        ))}
        {femaEnd && (
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "#FF4455",
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(255,68,85,0.1)",
              border: "1px solid rgba(255,68,85,0.2)",
            }}
          >
            FEMA END {femaEnd}
          </span>
        )}
        {abbrev === "IN" && (
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "#666",
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            NO FEMA DATE
          </span>
        )}
      </div>

      {/* Render state content from markdown */}
      <RenderLines lines={content} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                            */
/* ════════════════════════════════════════════════════════════ */

export default function SEPGuide2026() {
  const parsed = useMemo(() => parseMarkdown(rawMarkdown), []);
  const [selectedState, setSelectedState] = useState(null);

  return (
    <div className="at-training-shell">
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
          <span
            style={{
              fontSize: 9,
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#666",
              padding: "2px 6px",
              borderRadius: 4,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            Internal Use Only
          </span>
        </div>
      </div>

      {/* Top-level accordions */}
      <div className="at-training-accordion">
        {parsed.topSections.map((section) => (
          <Accordion key={section.id} id={section.id} title={section.title}>
            <RenderLines lines={section.lines} />
          </Accordion>
        ))}

        {/* State Guides, special section, default open */}
        <Accordion id="state-guides" title="State Guides" defaultOpen>
          {/* State selector */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginBottom: selectedState ? 16 : 0,
            }}
          >
            {parsed.states.map((state) => {
              const active = selectedState === state.abbrev;
              return (
                <button
                  key={state.abbrev}
                  onClick={() => setSelectedState(active ? null : state.abbrev)}
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: active
                      ? "1px solid rgba(33,150,243,0.3)"
                      : "1px solid rgba(255,255,255,0.06)",
                    background: active
                      ? "linear-gradient(135deg, rgba(33,150,243,0.1) 0%, rgba(33,150,243,0.03) 100%)"
                      : "rgba(255,255,255,0.02)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 14,
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      color: active ? "#2196F3" : "#eef2f5",
                      minWidth: 24,
                    }}
                  >
                    {state.abbrev}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: active ? "#8BBEF0" : "#666",
                      flex: 1,
                    }}
                  >
                    {state.name}
                  </span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {state.sepTypes.map((t) => (
                      <SEPPill key={t} type={t} />
                    ))}
                  </div>
                  <ChevronDown
                    size={14}
                    style={{
                      color: active ? "#2196F3" : "#444",
                      transform: active ? "rotate(180deg)" : "none",
                      transition: "transform 0.18s ease",
                      flexShrink: 0,
                    }}
                  />
                </button>
              );
            })}
          </div>

          {/* Selected state detail */}
          {selectedState && (
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10,
                padding: 16,
              }}
            >
              {(() => {
                const stateData = parsed.states.find((s) => s.abbrev === selectedState);
                if (!stateData) return null;
                return (
                  <>
                    <div
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 16,
                        fontWeight: 800,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "#eef2f5",
                        marginBottom: 12,
                        paddingBottom: 10,
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {stateData.name}
                    </div>
                    <StatePanel state={stateData} />
                  </>
                );
              })()}
            </div>
          )}
        </Accordion>

        {/* Quick Reference, Phone Numbers */}
        <Accordion id="quick-ref" title="Quick Reference, Key Phone Numbers">
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "8px 12px",
                      fontFamily: "var(--font-body)",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "#666",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    Resource
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "8px 12px",
                      fontFamily: "var(--font-body)",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "#666",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    Number
                  </th>
                </tr>
              </thead>
              <tbody>
                {parsed.phoneTable.map((row, i) => (
                  <tr key={i}>
                    <td
                      style={{
                        padding: "8px 12px",
                        color: "#cfd5df",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      {row.resource}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <a
                        href={phoneToTel(row.number)}
                        style={{
                          color: "#76bfff",
                          textDecoration: "none",
                          borderBottom: "1px dashed rgba(118,191,255,0.3)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <Phone size={11} />
                        {row.number}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Accordion>
      </div>
    </div>
  );
}
