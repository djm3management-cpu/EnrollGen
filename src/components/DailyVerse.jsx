import { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
  Volume2,
  VolumeX,
  Copy,
  Check,
  Heart,
  Columns2,
  Flame,
  ArrowLeftRight,
  Link2,
  Sparkles,
  Image as ImageIcon,
  PenLine,
  Save as SaveIcon,
  Trash2,
} from "lucide-react";
import { getBookData } from "../data/bibleReference";
import {
  getDailyReference,
  getDailyDateLabel,
} from "../data/dailyVerseSelections";
import { VERSE_THEMES, pickRandomVerseForTheme } from "../data/verseThemes";
import { fetchBibliaContent } from "../lib/bibliaApi";
import { getCrossReferences } from "../data/verseCrossReferences";

const TRANSLATIONS = [
  { id: "kjv", label: "KJV", full: "King James Version", source: "bible-api" },
  { id: "leb", label: "LEB", full: "Lexham English Bible", source: "biblia" },
  { id: "web", label: "WEB", full: "World English Bible", source: "bible-api" },
  { id: "ylt", label: "YLT", full: "Young's Literal Translation", source: "bible-api" },
];

function getTranslationSource(id) {
  return TRANSLATIONS.find((t) => t.id === id)?.source || "bible-api";
}

const FALLBACK_VERSE = {
  text: "I can do all things through Christ who strengthens me.",
  reference: "Philippians 4:13",
};

const ORIGINAL_SOURCE = {
  OT: {
    module: "wlc",
    label: "Westminster Leningrad Codex",
    shortLabel: "WLC Hebrew",
    blbVersion: "WLC",
  },
  NT: {
    module: "tr",
    label: "Textus Receptus",
    shortLabel: "TR Greek",
    blbVersion: "MGNT",
  },
};

const STORAGE_STREAK = "enrollgen.dv.streak";
const STORAGE_FAVS = "enrollgen.dv.favorites";

function normalizeOriginalText(text = "") {
  return text.replace(/\s+/g, " ").trim();
}

function todayKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readStreak() {
  try {
    const raw = localStorage.getItem(STORAGE_STREAK);
    if (!raw) return { lastDate: null, count: 0 };
    return JSON.parse(raw);
  } catch {
    return { lastDate: null, count: 0 };
  }
}

function writeStreak(next) {
  try {
    localStorage.setItem(STORAGE_STREAK, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

function bumpStreak() {
  const today = todayKey();
  const prev = readStreak();
  if (prev.lastDate === today) return prev;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = todayKey(yesterday);
  const nextCount = prev.lastDate === yKey ? prev.count + 1 : 1;
  const next = { lastDate: today, count: nextCount };
  writeStreak(next);
  return next;
}

function readFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_FAVS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) || [];
    return parsed.map((f) => ({ note: "", ...f }));
  } catch {
    return [];
  }
}

function writeFavorites(list) {
  try {
    localStorage.setItem(STORAGE_FAVS, JSON.stringify(list));
  } catch {
    /* noop */
  }
}

function parseReference(ref) {
  const match = ref?.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!match) return null;
  return {
    book: match[1].trim(),
    chapter: parseInt(match[2], 10),
    startVerse: parseInt(match[3], 10),
    endVerse: match[4] ? parseInt(match[4], 10) : parseInt(match[3], 10),
  };
}

function buildContextReference(ref, pad = 2) {
  const parsed = parseReference(ref);
  if (!parsed) return null;
  const start = Math.max(1, parsed.startVerse - pad);
  const end = parsed.endVerse + pad;
  return `${parsed.book} ${parsed.chapter}:${start}-${end}`;
}

function blbUrl(word, version) {
  return `https://www.blueletterbible.org/search/preSearch.cfm?Criteria=${encodeURIComponent(
    word
  )}&t=${version}`;
}

export default function DailyVerse() {
  const [verse, setVerse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [translation, setTranslation] = useState("kjv");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [commentaryOpen, setCommentaryOpen] = useState(false);
  const [bookData, setBookData] = useState(null);
  const [originalVerse, setOriginalVerse] = useState(null);
  const [originalLoading, setOriginalLoading] = useState(false);
  const [fadeKey, setFadeKey] = useState(0);

  const [parallelMode, setParallelMode] = useState(true);
  const [parallelTranslation, setParallelTranslation] = useState("ylt");
  const [parallelVerse, setParallelVerse] = useState(null);
  const [parallelLoading, setParallelLoading] = useState(false);
  const [parallelFallbackTrans, setParallelFallbackTrans] = useState(null);

  const [contextOpen, setContextOpen] = useState(false);
  const [contextVerses, setContextVerses] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);

  const [crossRefsOpen, setCrossRefsOpen] = useState(true);
  const [crossRefs, setCrossRefs] = useState(null);
  const [crossRefsLoading, setCrossRefsLoading] = useState(false);

  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imageStatus, setImageStatus] = useState(""); // "" | "copied" | "downloaded" | "error"

  const [streak, setStreak] = useState(() => readStreak());
  const [favorites, setFavorites] = useState(() => readFavorites());
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [editingNoteRef, setEditingNoteRef] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");

  const dropdownRef = useRef(null);
  const parallelDropdownRef = useRef(null);
  const themeMenuRef = useRef(null);
  const shareCardRef = useRef(null);
  const [parallelDropdownOpen, setParallelDropdownOpen] = useState(false);

  const dateLabel = useMemo(() => getDailyDateLabel(), []);

  const fetchVerseByReference = useCallback(async (reference, trans) => {
    if (getTranslationSource(trans) === "biblia") {
      return fetchBibliaContent(reference, trans);
    }
    const url = `https://bible-api.com/${encodeURIComponent(reference)}?translation=${trans}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[DailyVerse] ${trans} fetch failed: ${res.status} ${url}`);
      throw new Error(`bible-api ${trans} ${res.status}`);
    }
    return res.json();
  }, []);

  const loadReference = useCallback(
    async (reference, trans) => {
      const t = trans || translation;
      setLoading(true);
      setError(false);
      setCommentaryOpen(false);
      setContextOpen(false);
      setContextVerses(null);
      setCrossRefs(null);
      setOriginalVerse(null);
      try {
        const data = await fetchVerseByReference(reference, t);
        setVerse(data);
        setBookData(getBookData(data.reference));
        setFadeKey((k) => k + 1);
      } catch (err) {
        console.error("Verse fetch failed", err);
        setError(true);
        setVerse(FALLBACK_VERSE);
        setBookData(getBookData(FALLBACK_VERSE.reference));
      } finally {
        setLoading(false);
      }
    },
    [translation, fetchVerseByReference]
  );

  const fetchVerse = useCallback(
    async ({ useDaily = false, trans } = {}) => {
      const t = trans || translation;
      if (useDaily) {
        await loadReference(getDailyReference(), t);
        return;
      }
      setLoading(true);
      setError(false);
      setCommentaryOpen(false);
      setContextOpen(false);
      setContextVerses(null);
      setCrossRefs(null);
      setOriginalVerse(null);
      try {
        const res = await fetch(
          `https://bible-api.com/?random=verse&translation=${t}`
        );
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        setVerse(data);
        setBookData(getBookData(data.reference));
        setFadeKey((k) => k + 1);
      } catch (err) {
        console.error("Verse fetch failed", err);
        setError(true);
        setVerse(FALLBACK_VERSE);
        setBookData(getBookData(FALLBACK_VERSE.reference));
      } finally {
        setLoading(false);
      }
    },
    [translation, loadReference]
  );

  /* initial load: daily-anchored + streak bump */
  useEffect(() => {
    fetchVerse({ useDaily: true });
    setStreak(bumpStreak());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* original-language fetch */
  useEffect(() => {
    const testament = bookData?.testament;
    const reference = verse?.reference;

    if (!testament || !reference || !ORIGINAL_SOURCE[testament]) {
      setOriginalVerse(null);
      setOriginalLoading(false);
      return;
    }

    const controller = new AbortController();
    const source = ORIGINAL_SOURCE[testament];

    async function fetchOriginalVerse() {
      setOriginalLoading(true);
      setOriginalVerse(null);
      try {
        const params = new URLSearchParams({
          bible: source.module,
          reference,
          data_format: "minimal",
          markup: "none",
        });
        const res = await fetch(
          `https://puredove.ca/path/to/biblesupersearch_api/public/api?${params.toString()}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error("Original language API error");
        const data = await res.json();
        const text = data?.results?.[source.module]?.[0]?.text;
        setOriginalVerse(text ? normalizeOriginalText(text) : null);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Original verse fetch failed", err);
          setOriginalVerse(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setOriginalLoading(false);
        }
      }
    }

    fetchOriginalVerse();

    return () => controller.abort();
  }, [bookData?.testament, verse?.reference]);

  /* parallel translation fetch with WEB fallback for gaps */
  useEffect(() => {
    if (!parallelMode || !verse?.reference || parallelTranslation === translation) {
      setParallelVerse(null);
      setParallelFallbackTrans(null);
      return;
    }
    const controller = new AbortController();
    setParallelLoading(true);
    setParallelFallbackTrans(null);

    const fetchOne = (trans) => {
      if (getTranslationSource(trans) === "biblia") {
        return fetchBibliaContent(verse.reference, trans, {
          signal: controller.signal,
        });
      }
      return fetch(
        `https://bible-api.com/${encodeURIComponent(verse.reference)}?translation=${trans}`,
        { signal: controller.signal }
      ).then((res) => (res.ok ? res.json() : Promise.reject(new Error(`${trans} ${res.status}`))));
    };

    fetchOne(parallelTranslation)
      .then((data) => {
        setParallelVerse(data);
        setParallelFallbackTrans(null);
      })
      .catch(async (err) => {
        if (err?.name === "AbortError") return;
        // fallback: pick an alternate that's not the main translation
        const fallback = translation === "web" ? "kjv" : "web";
        try {
          const data = await fetchOne(fallback);
          setParallelVerse(data);
          setParallelFallbackTrans(fallback);
        } catch (err2) {
          if (err2?.name !== "AbortError") setParallelVerse(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setParallelLoading(false);
      });
    return () => controller.abort();
  }, [parallelMode, parallelTranslation, verse?.reference, translation]);

  /* context verses fetch */
  useEffect(() => {
    if (!contextOpen || !verse?.reference) {
      setContextVerses(null);
      return;
    }
    const contextRef = buildContextReference(verse.reference, 2);
    if (!contextRef) return;
    const controller = new AbortController();
    setContextLoading(true);
    const contextTrans =
      getTranslationSource(translation) === "bible-api" ? translation : "kjv";
    fetch(
      `https://bible-api.com/${encodeURIComponent(contextRef)}?translation=${contextTrans}`,
      { signal: controller.signal }
    )
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setContextVerses(data?.verses || null))
      .catch((err) => {
        if (err?.name !== "AbortError") setContextVerses(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setContextLoading(false);
      });
    return () => controller.abort();
  }, [contextOpen, verse?.reference, translation]);

  /* cross-references (local curated set) */
  useEffect(() => {
    if (!crossRefsOpen || !verse?.reference) {
      return;
    }
    setCrossRefsLoading(false);
    setCrossRefs(getCrossReferences(verse.reference));
  }, [crossRefsOpen, verse?.reference]);

  /* close dropdowns on outside click */
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
      if (
        parallelDropdownRef.current &&
        !parallelDropdownRef.current.contains(e.target)
      ) {
        setParallelDropdownOpen(false);
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target)) {
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* stop speech on unmount */
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleTranslationChange = (id) => {
    setTranslation(id);
    setDropdownOpen(false);
    if (verse?.reference) {
      loadReference(verse.reference, id);
    } else {
      fetchVerse({ trans: id });
    }
  };

  const handleParallelTranslationChange = (id) => {
    setParallelTranslation(id);
    setParallelDropdownOpen(false);
  };

  const handleThemePick = (themeId) => {
    const ref = pickRandomVerseForTheme(themeId);
    setThemeMenuOpen(false);
    if (ref) loadReference(ref);
  };

  const handleSpeak = () => {
    if (!verse?.text || typeof window === "undefined" || !window.speechSynthesis) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utter = new SpeechSynthesisUtterance(
      `${verse.text.trim()}. ${verse.reference}.`
    );
    utter.rate = 0.92;
    utter.pitch = 1;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  };

  const handleCopy = async () => {
    if (!verse?.text) return;
    const formatted = `"${verse.text.trim()}"\n- ${verse.reference} (${(currentTrans?.label || translation).toUpperCase()})`;
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  };

  const handleShareImage = async () => {
    if (!shareCardRef.current || imageGenerating) return;
    setImageGenerating(true);
    setImageStatus("");
    try {
      const mod = await import("html2canvas");
      const html2canvas = mod.default || mod;
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: "var(--bg-surface)",
        scale: 2,
        useCORS: true,
      });
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("Blob failed");
      // Prefer clipboard image write (Chromium-based browsers)
      if (
        navigator.clipboard &&
        window.ClipboardItem &&
        typeof navigator.clipboard.write === "function"
      ) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          setImageStatus("copied");
          setTimeout(() => setImageStatus(""), 2200);
          return;
        } catch {
          /* fall through to download */
        }
      }
      // Fallback: trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(verse?.reference || "verse").replace(/[^\w]+/g, "_")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setImageStatus("downloaded");
      setTimeout(() => setImageStatus(""), 2200);
    } catch (err) {
      console.error("Share image failed", err);
      setImageStatus("error");
      setTimeout(() => setImageStatus(""), 2200);
    } finally {
      setImageGenerating(false);
    }
  };

  const isFavorited = useMemo(
    () => favorites.some((f) => f.reference === verse?.reference),
    [favorites, verse?.reference]
  );

  const handleFavoriteToggle = () => {
    if (!verse?.reference) return;
    let next;
    if (isFavorited) {
      next = favorites.filter((f) => f.reference !== verse.reference);
    } else {
      next = [
        {
          reference: verse.reference,
          text: verse.text.trim(),
          translation: (currentTrans?.label || translation).toUpperCase(),
          note: "",
          savedAt: Date.now(),
        },
        ...favorites,
      ].slice(0, 30);
    }
    setFavorites(next);
    writeFavorites(next);
  };

  const loadFavorite = (fav) => {
    setFavoritesOpen(false);
    loadReference(fav.reference, translation);
  };

  const startEditingNote = (fav) => {
    setEditingNoteRef(fav.reference + fav.savedAt);
    setNoteDraft(fav.note || "");
  };

  const cancelEditingNote = () => {
    setEditingNoteRef(null);
    setNoteDraft("");
  };

  const saveNote = (fav) => {
    const next = favorites.map((f) =>
      f.reference === fav.reference && f.savedAt === fav.savedAt
        ? { ...f, note: noteDraft.trim() }
        : f
    );
    setFavorites(next);
    writeFavorites(next);
    setEditingNoteRef(null);
    setNoteDraft("");
  };

  const removeFavorite = (fav) => {
    const next = favorites.filter(
      (f) => !(f.reference === fav.reference && f.savedAt === fav.savedAt)
    );
    setFavorites(next);
    writeFavorites(next);
  };

  const currentTrans = TRANSLATIONS.find((t) => t.id === translation);
  const currentParallelTrans = TRANSLATIONS.find(
    (t) => t.id === parallelTranslation
  );
  const isOT = bookData?.testament === "OT";
  const isNT = bookData?.testament === "NT";
  const originalSource = bookData?.testament
    ? ORIGINAL_SOURCE[bookData.testament]
    : null;

  const testamentClass = isOT ? "is-ot" : isNT ? "is-nt" : "";
  const verseText = verse?.text?.trim() || "";

  const focusedVerseNumber = useMemo(() => {
    const parsed = parseReference(verse?.reference);
    return parsed?.startVerse ?? null;
  }, [verse?.reference]);

  const originalWords = useMemo(() => {
    if (!originalVerse) return [];
    return originalVerse.split(/\s+/).filter(Boolean);
  }, [originalVerse]);

  return (
    <div className={`dv-card ${testamentClass}`}>

      {/* ── header row ── */}
      <div className="dv-header">
        <span className="dv-label">
          <BookOpen size={13} />
          Daily Scripture
        </span>

        <div className="dv-header-actions">
          <span className="dv-date-chip" title="Today">
            {dateLabel}
          </span>

          {streak.count > 1 && (
            <span
              className="dv-streak-chip"
              title={`${streak.count}-day reading streak`}
            >
              <Flame size={11} />
              {streak.count}
            </span>
          )}

          {/* theme filter */}
          <div className="dv-dropdown-wrap" ref={themeMenuRef}>
            <button
              className={`dv-icon-btn${themeMenuOpen ? " is-active" : ""}`}
              onClick={() => setThemeMenuOpen((p) => !p)}
              title="Pick a verse by theme"
              aria-label="Pick by theme"
            >
              <Sparkles size={13} />
            </button>
            {themeMenuOpen && (
              <ul className="dv-dropdown dv-theme-dropdown">
                {VERSE_THEMES.map((theme) => (
                  <li
                    key={theme.id}
                    className="dv-dropdown-item"
                    onClick={() => handleThemePick(theme.id)}
                  >
                    <span className="dv-dropdown-abbr">{theme.label}</span>
                    <span className="dv-dropdown-full">
                      {theme.verses.length} verses
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* parallel toggle */}
          <button
            className={`dv-icon-btn${parallelMode ? " is-active" : ""}`}
            onClick={() => setParallelMode((p) => !p)}
            title="Parallel translation"
            aria-pressed={parallelMode}
          >
            <Columns2 size={13} />
          </button>

          {/* favorites toggle */}
          <button
            className={`dv-icon-btn${favoritesOpen ? " is-active" : ""}`}
            onClick={() => setFavoritesOpen((p) => !p)}
            title="Saved verses"
          >
            <Heart size={13} />
          </button>

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
            title="Load a different verse"
            aria-label="Refresh verse"
          >
            <RefreshCw size={13} className={loading ? "verse-spin" : ""} />
          </button>
        </div>
      </div>

      {/* saved verses drawer */}
      {favoritesOpen && (
        <div className="dv-favorites">
          <div className="dv-favorites-head">
            <Heart size={12} />
            <span>Saved Verses</span>
            <span className="dv-favorites-count">{favorites.length}</span>
          </div>
          {favorites.length === 0 ? (
            <p className="dv-favorites-empty">
              No saved verses yet. Tap the heart on a verse to save it.
            </p>
          ) : (
            <ul className="dv-favorites-list">
              {favorites.map((fav) => {
                const isEditing = editingNoteRef === fav.reference + fav.savedAt;
                return (
                  <li key={fav.reference + fav.savedAt} className="dv-favorites-item">
                    <div className="dv-favorites-main">
                      <button
                        type="button"
                        className="dv-favorites-load"
                        onClick={() => loadFavorite(fav)}
                      >
                        <span className="dv-favorites-ref">{fav.reference}</span>
                        <span className="dv-favorites-preview">{fav.text}</span>
                      </button>

                      {isEditing ? (
                        <div className="dv-favorites-note-edit">
                          <textarea
                            className="dv-favorites-note-input"
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            placeholder="Write a reflection…"
                            rows={3}
                            autoFocus
                          />
                          <div className="dv-favorites-note-actions">
                            <button
                              type="button"
                              className="dv-favorites-note-btn is-save"
                              onClick={() => saveNote(fav)}
                            >
                              <SaveIcon size={11} /> Save
                            </button>
                            <button
                              type="button"
                              className="dv-favorites-note-btn"
                              onClick={cancelEditingNote}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : fav.note ? (
                        <p className="dv-favorites-note">{fav.note}</p>
                      ) : null}
                    </div>

                    <div className="dv-favorites-item-actions">
                      <button
                        type="button"
                        className="dv-favorites-mini"
                        onClick={() => startEditingNote(fav)}
                        aria-label={fav.note ? "Edit reflection" : "Add reflection"}
                        title={fav.note ? "Edit reflection" : "Add reflection"}
                      >
                        <PenLine size={11} />
                      </button>
                      <button
                        type="button"
                        className="dv-favorites-mini is-danger"
                        onClick={() => removeFavorite(fav)}
                        aria-label="Remove"
                        title="Remove"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ── verse body ── */}
      {loading ? (
        <div className="dv-skeleton">
          <div className="dv-skel-line long" />
          <div className="dv-skel-line medium" />
          <div className="dv-skel-line short" />
        </div>
      ) : (
        <>
          <div ref={shareCardRef} className="dv-share-surface">
            <div className="dv-verse-block" key={fadeKey}>
              <span className="dv-quote-glyph" aria-hidden="true">
                &ldquo;
              </span>
              <p className="dv-text">
                {verseText}
                <span className="dv-text-close">&rdquo;</span>
              </p>
            </div>

            {parallelMode && (
              <div className="dv-parallel">
                <div className="dv-parallel-head">
                  <ArrowLeftRight size={11} />
                  <span>Parallel</span>
                  <div className="dv-dropdown-wrap" ref={parallelDropdownRef}>
                    <button
                      className="dv-translation-btn dv-translation-btn--mini"
                      onClick={() => setParallelDropdownOpen((p) => !p)}
                      title={currentParallelTrans?.full}
                    >
                      {currentParallelTrans?.label}
                      <ChevronDown
                        size={11}
                        className={parallelDropdownOpen ? "dv-chev-open" : ""}
                      />
                    </button>
                    {parallelDropdownOpen && (
                      <ul className="dv-dropdown">
                        {TRANSLATIONS.filter((t) => t.id !== translation).map((t) => (
                          <li
                            key={t.id}
                            className={`dv-dropdown-item${
                              t.id === parallelTranslation ? " active" : ""
                            }`}
                            onClick={() => handleParallelTranslationChange(t.id)}
                          >
                            <span className="dv-dropdown-abbr">{t.label}</span>
                            <span className="dv-dropdown-full">{t.full}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <p className="dv-parallel-text">
                  {parallelLoading
                    ? "Loading…"
                    : parallelVerse?.text?.trim() || "Unavailable in this translation."}
                </p>
                {parallelFallbackTrans && !parallelLoading && (
                  <span className="dv-parallel-fallback-note">
                    {currentParallelTrans?.label} missing this verse, showing{" "}
                    {parallelFallbackTrans.toUpperCase()}
                  </span>
                )}
              </div>
            )}

            {originalSource && (
              <div className={`dv-original-block dv-original-block--scroll ${isOT ? "is-ot" : "is-nt"}`}>
                <div className="dv-original-head">
                  <span>{originalSource.label}</span>
                  <span className="dv-original-tag">{originalSource.shortLabel}</span>
                </div>
                <p className={`dv-original-text${isOT ? " is-hebrew" : ""}`}>
                  {originalLoading ? (
                    "Loading original text..."
                  ) : originalWords.length > 0 ? (
                    originalWords.map((word, i) => (
                      <span key={`${word}-${i}`}>
                        <a
                          className="dv-original-word"
                          href={blbUrl(word, originalSource.blbVersion)}
                          target="_blank"
                          rel="noreferrer"
                          title={`Study "${word}" on Blue Letter Bible`}
                        >
                          {word}
                        </a>
                        {i < originalWords.length - 1 ? " " : ""}
                      </span>
                    ))
                  ) : (
                    "Original text unavailable for this verse."
                  )}
                </p>
                <span className="dv-original-hint">
                  Tap any word to study it on Blue Letter Bible
                </span>
              </div>
            )}

            <div className="dv-ref">
             , {verse.reference}{" "}
              <span className="dv-trans-tag">
                {currentTrans?.label || translation.toUpperCase()}
              </span>
              {error && <span className="dv-offline-badge">offline</span>}
            </div>
          </div>

          {/* action row */}
          <div className="dv-actions">
            <button
              type="button"
              className={`dv-action${speaking ? " is-active" : ""}`}
              onClick={handleSpeak}
              title={speaking ? "Stop reading" : "Read aloud"}
            >
              {speaking ? <VolumeX size={12} /> : <Volume2 size={12} />}
              <span>{speaking ? "Stop" : "Listen"}</span>
            </button>
            <button
              type="button"
              className={`dv-action${copied ? " is-done" : ""}`}
              onClick={handleCopy}
              title="Copy verse text"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            <button
              type="button"
              className={`dv-action${
                imageStatus === "copied" || imageStatus === "downloaded" ? " is-done" : ""
              }${imageGenerating ? " is-loading" : ""}`}
              onClick={handleShareImage}
              title="Copy as image"
              disabled={imageGenerating}
            >
              {imageStatus === "copied" ? (
                <Check size={12} />
              ) : (
                <ImageIcon size={12} />
              )}
              <span>
                {imageGenerating
                  ? "Rendering…"
                  : imageStatus === "copied"
                  ? "Image copied"
                  : imageStatus === "downloaded"
                  ? "Downloaded"
                  : imageStatus === "error"
                  ? "Failed"
                  : "Card"}
              </span>
            </button>
            <button
              type="button"
              className={`dv-action${isFavorited ? " is-active" : ""}`}
              onClick={handleFavoriteToggle}
              title={isFavorited ? "Remove from saved" : "Save verse"}
            >
              <Heart
                size={12}
                fill={isFavorited ? "currentColor" : "none"}
              />
              <span>{isFavorited ? "Saved" : "Save"}</span>
            </button>
            <button
              type="button"
              className={`dv-action${contextOpen ? " is-active" : ""}`}
              onClick={() => setContextOpen((p) => !p)}
              title="Show surrounding verses"
            >
              <Layers size={12} />
              <span>Context</span>
            </button>
            <button
              type="button"
              className={`dv-action${crossRefsOpen ? " is-active" : ""}`}
              onClick={() => setCrossRefsOpen((p) => !p)}
              title="Cross-references"
            >
              <Link2 size={12} />
              <span>Related</span>
            </button>
          </div>

          {/* surrounding verses */}
          {contextOpen && (
            <div className="dv-context">
              {contextLoading ? (
                <p className="dv-context-loading">Loading passage…</p>
              ) : contextVerses && contextVerses.length > 0 ? (
                <ol className="dv-context-list">
                  {contextVerses.map((cv) => {
                    const isFocus = cv.verse === focusedVerseNumber;
                    return (
                      <li
                        key={`${cv.book_id}-${cv.chapter}-${cv.verse}`}
                        className={`dv-context-verse${isFocus ? " is-focus" : ""}`}
                      >
                        <span className="dv-context-num">{cv.verse}</span>
                        <span className="dv-context-text">{cv.text.trim()}</span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="dv-context-loading">Context unavailable.</p>
              )}
            </div>
          )}

          {/* cross-references */}
          {crossRefsOpen && (
            <div className="dv-crossrefs">
              {crossRefsLoading ? (
                <p className="dv-context-loading">Finding related passages…</p>
              ) : crossRefs && crossRefs.length > 0 ? (
                <ul className="dv-crossrefs-list">
                  {crossRefs.map((ref) => (
                    <li key={ref}>
                      <button
                        type="button"
                        className="dv-crossrefs-item"
                        onClick={() => loadReference(ref)}
                      >
                        <Link2 size={10} />
                        <span>{ref}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="dv-crossrefs-fallback">
                  <p className="dv-context-loading">
                    No curated references for this verse yet.
                  </p>
                  <a
                    className="dv-crossrefs-item"
                    href={`https://www.blueletterbible.org/search/preSearch.cfm?Criteria=${encodeURIComponent(
                      verse?.reference || ""
                    )}&t=KJV`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Link2 size={10} />
                    <span>Explore on Blue Letter Bible</span>
                  </a>
                </div>
              )}
            </div>
          )}

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
              <div className="dv-meta-pills">
                <span className="dv-meta-pill">
                  <span className="dv-meta-label">Book</span>
                  <span className="dv-meta-value">
                    {verse.reference?.replace(/\s+\d+.*$/, "") || "-"}
                  </span>
                </span>
                <span className="dv-meta-pill">
                  <span className="dv-meta-label">Category</span>
                  <span className="dv-meta-value">{bookData.category}</span>
                </span>
                <span className="dv-meta-pill">
                  <span className="dv-meta-label">Author</span>
                  <span className="dv-meta-value">{bookData.author}</span>
                </span>
                <span className="dv-meta-pill">
                  <span className="dv-meta-label">Date</span>
                  <span className="dv-meta-value">{bookData.date}</span>
                </span>
              </div>

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
