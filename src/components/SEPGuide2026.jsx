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
  DST:  { bg: "color-mix(in srgb, var(--text-muted) 15%, transparent)", border: "color-mix(in srgb, var(--text-muted) 30%, transparent)", text: "var(--text-muted)" },
  INT:  { bg: "var(--status-live-bg)",   border: "var(--status-live-border)",   text: "var(--status-live)" },
  PAP:  { bg: "var(--info-bg)",  border: "var(--info-border)",  text: "var(--info)" },
  CSNP: { bg: "color-mix(in srgb, var(--chart-4) 12%, transparent)",  border: "color-mix(in srgb, var(--chart-4) 30%, transparent)",  text: "var(--chart-4)" },
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
        <p key={`em-${i}`} style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", margin: "4px 0" }}>
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
      return <strong key={idx} style={{ color: "var(--text-primary)" }}>{seg.value}</strong>;
    }
    if (seg.type === "phone") {
      return (
        <a
          key={idx}
          href={phoneToTel(seg.value)}
          style={{
            color: "var(--info)",
            textDecoration: "none",
            borderBottom: "1px dashed var(--info-border)",
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
        background: "linear-gradient(135deg, var(--info-bg) 0%, var(--info-bg) 100%)",
        border: "1px solid var(--info-border)",
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
          background: "var(--info-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          color: "var(--info)",
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
          color: "var(--info)",
          marginBottom: 6,
        }}
      >
        Mandatory Disclosure
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.65,
          color: "var(--text-primary)",
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
          background: "color-mix(in srgb, var(--text-primary) 5%, transparent)",
          border: "1px solid var(--border-default)",
          borderRadius: 4,
          padding: "3px 6px",
          cursor: "pointer",
          color: copied ? "var(--status-live)" : "var(--text-muted)",
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
        background: "var(--status-pending-bg)",
        border: "1px solid var(--status-pending-border)",
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
          color: "var(--status-pending)",
        }}
      />
      <div style={{ fontSize: 12, color: "var(--status-pending)", lineHeight: 1.5 }}>
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
              background: "color-mix(in srgb, var(--text-primary) 2%, transparent)",
              border: "1px solid var(--border-default)",
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
                  ? "var(--status-offline-bg)"
                  : isEnsure
                    ? "var(--status-pending-bg)"
                    : "var(--status-live-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 1,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, fontFamily: "var(--font-body)", color: isFail ? "var(--status-offline)" : isEnsure ? "var(--status-pending)" : "var(--status-live)" }}>
                {idx + 1}
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>
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
                    color: isFail ? "var(--status-offline)" : isEnsure ? "var(--status-pending)" : "var(--status-live)",
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
                  color: "var(--text-muted)",
                  borderBottom: "1px solid var(--border-default)",
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
                    color: "var(--text-primary)",
                    borderBottom: "1px solid var(--border-default)",
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
              color: "var(--status-offline)",
              padding: "2px 8px",
              borderRadius: 999,
              background: "var(--status-offline-bg)",
              border: "1px solid var(--status-offline-border)",
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
              color: "var(--text-muted)",
              padding: "2px 8px",
              borderRadius: 999,
              background: "var(--border-default)",
              border: "1px solid var(--border-default)",
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
              color: "var(--text-muted)",
              padding: "2px 6px",
              borderRadius: 4,
              background: "var(--border-default)",
              border: "1px solid var(--border-default)",
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
                      ? "1px solid var(--info-border)"
                      : "1px solid var(--border-default)",
                    background: active
                      ? "linear-gradient(135deg, var(--info-bg) 0%, var(--info-bg) 100%)"
                      : "color-mix(in srgb, var(--text-primary) 2%, transparent)",
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
                      color: active ? "var(--info)" : "var(--text-primary)",
                      minWidth: 24,
                    }}
                  >
                    {state.abbrev}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: active ? "var(--eg-blue-text)" : "var(--text-muted)",
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
                      color: active ? "var(--info)" : "var(--text-muted)",
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
                background: "color-mix(in srgb, var(--text-primary) 2%, transparent)",
                border: "1px solid var(--border-default)",
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
                        color: "var(--text-primary)",
                        marginBottom: 12,
                        paddingBottom: 10,
                        borderBottom: "1px solid var(--border-default)",
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
                      color: "var(--text-muted)",
                      borderBottom: "1px solid var(--border-default)",
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
                      color: "var(--text-muted)",
                      borderBottom: "1px solid var(--border-default)",
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
                        color: "var(--text-primary)",
                        borderBottom: "1px solid var(--border-default)",
                      }}
                    >
                      {row.resource}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        borderBottom: "1px solid var(--border-default)",
                      }}
                    >
                      <a
                        href={phoneToTel(row.number)}
                        style={{
                          color: "var(--info)",
                          textDecoration: "none",
                          borderBottom: "1px dashed var(--info-border)",
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
