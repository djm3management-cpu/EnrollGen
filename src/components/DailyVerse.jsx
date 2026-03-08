import { useEffect, useState, useCallback } from "react";
import { RefreshCw, BookOpen } from "lucide-react";

const FALLBACK_VERSE = {
  text: "I can do all things through Christ who strengthens me.",
  reference: "Philippians 4:13",
};

export default function DailyVerse() {
  const [verse, setVerse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchVerse = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        "https://bible-api.com/?random=verse&translation=kjv"
      );
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setVerse(data);
    } catch (err) {
      console.error("Verse fetch failed", err);
      setError(true);
      setVerse(FALLBACK_VERSE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVerse();
  }, [fetchVerse]);

  return (
    <div className="daily-verse-card">
      <div className="daily-verse-header">
        <span className="daily-verse-label">
          <BookOpen size={12} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Daily Scripture
        </span>
        <button
          className="daily-verse-refresh"
          onClick={fetchVerse}
          disabled={loading}
          title="Load new verse"
          aria-label="Refresh verse"
        >
          <RefreshCw size={13} className={loading ? "verse-spin" : ""} />
        </button>
      </div>

      {loading ? (
        <div className="daily-verse-skeleton">
          <div className="daily-verse-skeleton-line long" />
          <div className="daily-verse-skeleton-line medium" />
          <div className="daily-verse-skeleton-line short" />
        </div>
      ) : (
        <>
          <p className="daily-verse-text">"{verse.text.trim()}"</p>
          <div className="daily-verse-ref">
            — {verse.reference} (KJV)
            {error && (
              <span className="daily-verse-fallback-badge">offline</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
