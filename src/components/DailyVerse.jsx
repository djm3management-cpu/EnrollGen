import { useEffect, useState, useCallback, useRef } from "react";
import {
  RefreshCw,
  BookOpen,
  ChevronDown,
  ScrollText,
  X,
  BookMarked,
  Scroll,
  MapPin,
  FileText,
  Layers,
} from "lucide-react";
import { getBookData } from "../data/bibleReference";

const TRANSLATIONS = [
  { id: "kjv", label: "KJV", full: "King James Version" },
  { id: "asv", label: "ASV", full: "American Standard Version" },
  { id: "web", label: "WEB", full: "World English Bible" },
  { id: "bbe", label: "BBE", full: "Bible in Basic English" },
  { id: "darby", label: "Darby", full: "Darby Translation" },
  { id: "ylt", label: "YLT", full: "Young's Literal Translation" },
];

const FALLBACK_VERSE = {
  text: "I can do all things through Christ who strengthens me.",
  reference: "Philippians 4:13",
};

export default function DailyVerse() {
  const [verse, setVerse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [translation, setTranslation] = useState("kjv");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [commentaryOpen, setCommentaryOpen] = useState(false);
  const [bookData, setBookData] = useState(null);
  const dropdownRef = useRef(null);

  const fetchVerse = useCallback(
    async (trans) => {
      const t = trans || translation;
      setLoading(true);
      setError(false);
      setCommentaryOpen(false);
      try {
        const res = await fetch(
          `https://bible-api.com/?random=verse&translation=${t}`
        );
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        setVerse(data);
        setBookData(getBookData(data.reference));
      } catch (err) {
        console.error("Verse fetch failed", err);
        setError(true);
        setVerse(FALLBACK_VERSE);
        setBookData(getBookData(FALLBACK_VERSE.reference));
      } finally {
        setLoading(false);
      }
    },
    [translation]
  );

  useEffect(() => {
    fetchVerse();
  }, [fetchVerse]);

  /* close dropdown on outside click */
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleTranslationChange = (id) => {
    setTranslation(id);
    setDropdownOpen(false);
    fetchVerse(id);
  };

  const currentTrans = TRANSLATIONS.find((t) => t.id === translation);
  const isOT = bookData?.testament === "OT";
  const isNT = bookData?.testament === "NT";

  return (
    <div className="dv-card">
      {/* ── header row ── */}
      <div className="dv-header">
        <span className="dv-label">
          <BookOpen size={13} />
          Daily Scripture
        </span>

        <div className="dv-header-actions">
          {/* translation picker */}
          <div className="dv-dropdown-wrap" ref={dropdownRef}>
            <button
              className="dv-translation-btn"
              onClick={() => setDropdownOpen((p) => !p)}
              title={currentTrans?.full}
            >
              {currentTrans?.label}
              <ChevronDown
                size={12}
                className={dropdownOpen ? "dv-chev-open" : ""}
              />
            </button>
            {dropdownOpen && (
              <ul className="dv-dropdown">
                {TRANSLATIONS.map((t) => (
                  <li
                    key={t.id}
                    className={`dv-dropdown-item${
                      t.id === translation ? " active" : ""
                    }`}
                    onClick={() => handleTranslationChange(t.id)}
                  >
                    <span className="dv-dropdown-abbr">{t.label}</span>
                    <span className="dv-dropdown-full">{t.full}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* refresh */}
          <button
            className="dv-refresh"
            onClick={() => fetchVerse()}
            disabled={loading}
            title="Load new verse"
            aria-label="Refresh verse"
          >
            <RefreshCw size={13} className={loading ? "verse-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── verse body ── */}
      {loading ? (
        <div className="dv-skeleton">
          <div className="dv-skel-line long" />
          <div className="dv-skel-line medium" />
          <div className="dv-skel-line short" />
        </div>
      ) : (
        <>
          <p className="dv-text">&ldquo;{verse.text.trim()}&rdquo;</p>
          <div className="dv-ref">
            — {verse.reference}{" "}
            <span className="dv-trans-tag">
              {currentTrans?.label || translation.toUpperCase()}
            </span>
            {error && <span className="dv-offline-badge">offline</span>}
          </div>

          {/* ── commentary toggle ── */}
          {bookData && (
            <button
              className={`dv-commentary-toggle${
                commentaryOpen ? " open" : ""
              }`}
              onClick={() => setCommentaryOpen((p) => !p)}
            >
              <ScrollText size={14} />
              <span>
                {commentaryOpen ? "Hide" : "Show"} Commentary &amp; Context
              </span>
              {commentaryOpen ? <X size={13} /> : <ChevronDown size={13} />}
            </button>
          )}

          {/* ── commentary panel ── */}
          {commentaryOpen && bookData && (
            <div className="dv-commentary">
              {/* book meta */}
              <div className="dv-meta-grid">
                <div className="dv-meta-item">
                  <span className="dv-meta-label">Book</span>
                  <span className="dv-meta-value">
                    {verse.reference?.replace(/\s+\d+.*$/, "") || "—"}
                  </span>
                </div>
                <div className="dv-meta-item">
                  <span className="dv-meta-label">Category</span>
                  <span className="dv-meta-value">{bookData.category}</span>
                </div>
                <div className="dv-meta-item">
                  <span className="dv-meta-label">Author</span>
                  <span className="dv-meta-value">{bookData.author}</span>
                </div>
                <div className="dv-meta-item">
                  <span className="dv-meta-label">Date</span>
                  <span className="dv-meta-value">{bookData.date}</span>
                </div>
              </div>

              {/* historical context */}
              <div className="dv-section">
                <h4 className="dv-section-head">
                  <BookMarked size={14} />
                  Historical Context
                </h4>
                <p className="dv-section-body">
                  <strong>Setting:</strong> {bookData.setting}
                </p>
                <p className="dv-section-body">{bookData.context}</p>
              </div>

              {/* OT-specific: DSS + LXX */}
              {isOT && (
                <>
                  <div className="dv-section">
                    <h4 className="dv-section-head">
                      <Scroll size={14} />
                      Dead Sea Scrolls
                    </h4>
                    <p className="dv-section-body">{bookData.dss}</p>
                  </div>
                  <div className="dv-section">
                    <h4 className="dv-section-head">
                      <Layers size={14} />
                      Septuagint (LXX) Differences
                    </h4>
                    <p className="dv-section-body">{bookData.lxx}</p>
                  </div>
                </>
              )}

              {/* NT-specific: manuscripts + papyri */}
              {isNT && (
                <>
                  <div className="dv-section">
                    <h4 className="dv-section-head">
                      <FileText size={14} />
                      Key Manuscripts
                    </h4>
                    <p className="dv-section-body">{bookData.manuscripts}</p>
                  </div>
                  <div className="dv-section">
                    <h4 className="dv-section-head">
                      <Scroll size={14} />
                      Papyri Evidence
                    </h4>
                    <p className="dv-section-body">{bookData.papyri}</p>
                  </div>
                </>
              )}

              {/* archaeology — always */}
              <div className="dv-section">
                <h4 className="dv-section-head">
                  <MapPin size={14} />
                  Archaeological Evidence
                </h4>
                <p className="dv-section-body">{bookData.archaeology}</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
