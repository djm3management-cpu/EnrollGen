import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Copy, Search, X } from "lucide-react";
import maGuideMarkdown from "../../docs/training/MA_compliance_guide.md?raw";
import acaGuideMarkdown from "../../docs/training/ACA_compliance_guide.md?raw";

const GUIDE_TABS = [
  { id: "ma", label: "MA", markdown: maGuideMarkdown },
  { id: "aca", label: "ACA", markdown: acaGuideMarkdown },
];

const TABLE_DIVIDER_PATTERN = /^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanMarkdownText(value) {
  return (value || "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function normalizeQuoteText(value) {
  const trimmed = cleanMarkdownText(value);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("“") && trimmed.endsWith("”"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cleanMarkdownText(cell));
}

function isAlertLine(line) {
  return /^\*\*(RULE|NOTE|DO NOT):\*\*/i.test(line);
}

function isLabelLine(line) {
  return /^\*\*[^*]+:\*\*/.test(line);
}

function isSubheadingLine(line) {
  return /^(#{3,4})\s+/.test(line);
}

function isListLine(line) {
  return /^[-*]\s+/.test(line);
}

function isEmphasisLine(line) {
  return /^\*[^*].*\*$/.test(line);
}

function isTableStart(line, nextLine) {
  return line.startsWith("|") && TABLE_DIVIDER_PATTERN.test(nextLine || "");
}

function isSpecialStart(line, nextLine) {
  return (
    line === "---" ||
    line.startsWith(">") ||
    isSubheadingLine(line) ||
    isAlertLine(line) ||
    isLabelLine(line) ||
    isListLine(line) ||
    isEmphasisLine(line) ||
    isTableStart(line, nextLine)
  );
}

function collectTokenText(token) {
  switch (token.type) {
    case "paragraph":
    case "emphasis":
    case "quote":
      return token.text;
    case "label":
      return `${token.label} ${token.text || ""}`.trim();
    case "alert":
      return `${token.label} ${token.text}`.trim();
    case "subheading":
      return token.text;
    case "list":
      return token.items.join(" ");
    case "table":
      return [...token.headers, ...token.rows.flat()].join(" ");
    default:
      return "";
  }
}

function buildSearchText(title, tokens) {
  return [title, ...tokens.map(collectTokenText)].join(" ").toLowerCase();
}

function parseTokens(lines) {
  const tokens = [];

  for (let index = 0; index < lines.length; ) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    const nextLine = lines[index + 1]?.trim() || "";

    if (!line || line === "---") {
      index += 1;
      continue;
    }

    const subheadingMatch = line.match(/^(#{3,4})\s+(.+)$/);
    if (subheadingMatch) {
      tokens.push({
        type: "subheading",
        level: subheadingMatch[1].length,
        text: cleanMarkdownText(subheadingMatch[2]),
      });
      index += 1;
      continue;
    }

    if (isTableStart(line, nextLine)) {
      const headers = parseTableRow(line);
      const rows = [];
      index += 2;

      while (index < lines.length) {
        const rowLine = lines[index].trim();
        if (!rowLine.startsWith("|")) break;
        rows.push(parseTableRow(rowLine));
        index += 1;
      }

      tokens.push({ type: "table", headers, rows });
      continue;
    }

    if (line.startsWith(">")) {
      const quoteLines = [];

      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }

      tokens.push({
        type: "quote",
        text: normalizeQuoteText(quoteLines.join("\n")),
      });
      continue;
    }

    const doNotMatch = line.match(/^\*\*DO NOT:\*\*\s*(.+)$/i);
    if (doNotMatch) {
      tokens.push({ type: "alert", variant: "do-not", label: "DO NOT", text: cleanMarkdownText(doNotMatch[1]) });
      index += 1;
      continue;
    }

    const ruleMatch = line.match(/^\*\*RULE:\*\*\s*(.+)$/i);
    if (ruleMatch) {
      tokens.push({ type: "alert", variant: "rule", label: "RULE", text: cleanMarkdownText(ruleMatch[1]) });
      index += 1;
      continue;
    }

    const noteMatch = line.match(/^\*\*NOTE:\*\*\s*(.+)$/i);
    if (noteMatch) {
      tokens.push({ type: "alert", variant: "note", label: "NOTE", text: cleanMarkdownText(noteMatch[1]) });
      index += 1;
      continue;
    }

    const labelMatch = line.match(/^\*\*([^*]+):\*\*(?:\s*(.*))?$/);
    if (labelMatch) {
      tokens.push({
        type: "label",
        label: cleanMarkdownText(labelMatch[1]),
        text: cleanMarkdownText(labelMatch[2] || ""),
      });
      index += 1;
      continue;
    }

    if (isEmphasisLine(line)) {
      tokens.push({ type: "emphasis", text: cleanMarkdownText(line) });
      index += 1;
      continue;
    }

    if (isListLine(line)) {
      const items = [];

      while (index < lines.length && isListLine(lines[index].trim())) {
        items.push(cleanMarkdownText(lines[index].trim().replace(/^[-*]\s+/, "")));
        index += 1;
      }

      tokens.push({ type: "list", items });
      continue;
    }

    const paragraphLines = [];

    while (index < lines.length) {
      const currentLine = lines[index].trim();
      const currentNextLine = lines[index + 1]?.trim() || "";

      if (!currentLine || isSpecialStart(currentLine, currentNextLine)) {
        break;
      }

      paragraphLines.push(cleanMarkdownText(currentLine));
      index += 1;
    }

    if (paragraphLines.length) {
      tokens.push({ type: "paragraph", text: paragraphLines.join(" ") });
      continue;
    }

    index += 1;
  }

  return tokens;
}

function parseGuide(markdown, guideId) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const introLines = [];
  const rawSections = [];
  let title = "";
  let currentSection = null;

  lines.forEach((line) => {
    if (!title && line.startsWith("# ")) {
      title = cleanMarkdownText(line.slice(2));
      return;
    }

    if (line.startsWith("## ")) {
      currentSection = {
        id: `${guideId}-${rawSections.length + 1}`,
        title: cleanMarkdownText(line.slice(3)),
        lines: [],
      };
      rawSections.push(currentSection);
      return;
    }

    if (currentSection) {
      currentSection.lines.push(line);
      return;
    }

    introLines.push(line);
  });

  const sections = rawSections.map((section) => {
    const tokens = parseTokens(section.lines);
    return {
      ...section,
      tokens,
      searchText: buildSearchText(section.title, tokens),
    };
  });

  const quickReferenceIndex = sections.findIndex((section) =>
    section.title.toLowerCase().startsWith("quick reference")
  );

  const quickReference =
    quickReferenceIndex >= 0
      ? sections[quickReferenceIndex]
      : { id: `${guideId}-quick-reference`, title: "Quick Reference", tokens: [], searchText: "" };

  return {
    id: guideId,
    title,
    introTokens: parseTokens(introLines),
    sections: sections.filter((_, index) => index !== quickReferenceIndex),
    quickReference,
  };
}

function HighlightedText({ text, query }) {
  if (!query) return text;

  const matcher = new RegExp(`(${escapeRegex(query)})`, "ig");
  const parts = text.split(matcher);

  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={`${part}-${index}`} className="at-training-highlight">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    )
  );
}

function TrainingTable({ headers, rows, query }) {
  return (
    <div className="at-training-table-wrap">
      <table className="at-training-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>
                <HighlightedText text={header} query={query} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`cell-${rowIndex}-${cellIndex}`}>
                  <HighlightedText text={cell} query={query} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrainingTokens({ tokens, query, copiedId, onCopy }) {
  return tokens.map((token, index) => {
    const key = `${token.type}-${index}`;

    if (token.type === "subheading") {
      return (
        <div
          key={key}
          className={`at-training-subheading${token.level === 4 ? " is-minor" : ""}`}
        >
          <HighlightedText text={token.text} query={query} />
        </div>
      );
    }

    if (token.type === "paragraph") {
      return (
        <p key={key} className="at-training-paragraph">
          <HighlightedText text={token.text} query={query} />
        </p>
      );
    }

    if (token.type === "emphasis") {
      return (
        <p key={key} className="at-training-emphasis">
          <HighlightedText text={token.text} query={query} />
        </p>
      );
    }

    if (token.type === "label") {
      return (
        <div key={key} className="at-training-label-row">
          <span className="at-training-label">{token.label}</span>
          {token.text ? (
            <span className="at-training-label-text">
              <HighlightedText text={token.text} query={query} />
            </span>
          ) : null}
        </div>
      );
    }

    if (token.type === "alert") {
      return (
        <div key={key} className={`at-training-alert is-${token.variant}`}>
          <span className="at-training-alert-label">{token.label}</span>
          <span className="at-training-alert-text">
            <HighlightedText text={token.text} query={query} />
          </span>
        </div>
      );
    }

    if (token.type === "quote") {
      const quoteId = `${key}-${token.text}`;

      return (
        <div key={quoteId} className="at-training-quote">
          <button
            className={`at-training-quote-copy${copiedId === quoteId ? " is-copied" : ""}`}
            onClick={() => onCopy(token.text, quoteId)}
            type="button"
            aria-label="Copy script text"
            title="Copy script text"
          >
            {copiedId === quoteId ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <div className="at-training-quote-text">
            <HighlightedText text={token.text} query={query} />
          </div>
        </div>
      );
    }

    if (token.type === "list") {
      return (
        <ul key={key} className="at-training-list">
          {token.items.map((item) => (
            <li key={item}>
              <HighlightedText text={item} query={query} />
            </li>
          ))}
        </ul>
      );
    }

    if (token.type === "table") {
      return <TrainingTable key={key} headers={token.headers} rows={token.rows} query={query} />;
    }

    return null;
  });
}

export default function TrainingGuides() {
  const guides = useMemo(
    () =>
      GUIDE_TABS.reduce((map, guide) => {
        map[guide.id] = parseGuide(guide.markdown, guide.id);
        return map;
      }, {}),
    []
  );
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("ma");
  const [openSections, setOpenSections] = useState({ ma: null, aca: null });
  const [copiedId, setCopiedId] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const activeGuide = guides[activeTab];

  const resultCounts = useMemo(
    () =>
      Object.fromEntries(
        GUIDE_TABS.map((guide) => [
          guide.id,
          guides[guide.id].sections.filter(
            (section) => !normalizedQuery || section.searchText.includes(normalizedQuery)
          ).length,
        ])
      ),
    [guides, normalizedQuery]
  );

  const visibleSections = useMemo(
    () =>
      activeGuide.sections.filter(
        (section) => !normalizedQuery || section.searchText.includes(normalizedQuery)
      ),
    [activeGuide, normalizedQuery]
  );

  useEffect(() => {
    setOpenSections((current) => {
      const openId = current[activeTab];
      if (!openId) return current;
      if (visibleSections.some((section) => section.id === openId)) return current;
      return { ...current, [activeTab]: null };
    });
  }, [activeTab, visibleSections]);

  const copyQuote = async (text, quoteId) => {
    if (!navigator?.clipboard?.writeText) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(quoteId);
      window.setTimeout(() => setCopiedId((current) => (current === quoteId ? "" : current)), 1800);
    } catch {
      // Clipboard access failed; leave the UI unchanged.
    }
  };

  return (
    <div className="at-training-shell">
      <div className="at-search-shell at-training-search-shell">
        <Search size={15} className="at-search-icon" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search MA and ACA training..."
          className="at-search-input"
        />
        {query ? (
          <button className="at-search-clear" onClick={() => setQuery("")} type="button">
            <X size={13} />
          </button>
        ) : null}
      </div>

      <div className="at-training-tab-row" role="tablist" aria-label="Training guides">
        {GUIDE_TABS.map((guide) => (
          <button
            key={guide.id}
            className={`at-training-tab${activeTab === guide.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(guide.id)}
            type="button"
            role="tab"
            aria-selected={activeTab === guide.id}
          >
            <span>{guide.label}</span>
            {normalizedQuery ? (
              <span className="at-training-tab-badge">{resultCounts[guide.id]}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="at-training-guide-head">
        <h4 className="at-training-guide-title">{activeGuide.title}</h4>
        {activeGuide.introTokens.length ? (
          <div className="at-training-guide-meta">
            <TrainingTokens
              tokens={activeGuide.introTokens}
              query={normalizedQuery}
              copiedId={copiedId}
              onCopy={copyQuote}
            />
          </div>
        ) : null}
      </div>

      <div className="at-training-accordion">
        {visibleSections.length ? (
          visibleSections.map((section) => {
            const isOpen = openSections[activeTab] === section.id;

            return (
              <section
                key={section.id}
                className={`at-training-section${isOpen ? " is-open" : ""}`}
              >
                <button
                  className="at-training-section-toggle"
                  onClick={() =>
                    setOpenSections((current) => ({
                      ...current,
                      [activeTab]: current[activeTab] === section.id ? null : section.id,
                    }))
                  }
                  type="button"
                  aria-expanded={isOpen}
                >
                  <span className="at-training-section-title">
                    <HighlightedText text={section.title} query={normalizedQuery} />
                  </span>
                  <ChevronDown size={16} className="at-training-chevron" />
                </button>

                {isOpen ? (
                  <div className="at-training-section-body">
                    <TrainingTokens
                      tokens={section.tokens}
                      query={normalizedQuery}
                      copiedId={copiedId}
                      onCopy={copyQuote}
                    />
                  </div>
                ) : null}
              </section>
            );
          })
        ) : (
          <div className="at-empty">
            No {activeTab.toUpperCase()} training sections match "{query}".
          </div>
        )}
      </div>

      <section className="at-training-summary">
        <div className="at-training-summary-head">
          <span className="at-training-summary-kicker">Quick Reference</span>
          <h4 className="at-training-summary-title">{activeGuide.quickReference.title}</h4>
        </div>
        <div className="at-training-summary-body">
          <TrainingTokens
            tokens={activeGuide.quickReference.tokens}
            query={normalizedQuery}
            copiedId={copiedId}
            onCopy={copyQuote}
          />
        </div>
      </section>
    </div>
  );
}
