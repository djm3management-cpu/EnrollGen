import { useEffect, useState } from "react";

export default function DailyVerse() {
  const [verse, setVerse] = useState(null);

  useEffect(() => {
    async function fetchVerse() {
      try {
        const res = await fetch(
          "https://bible-api.com/?random=verse&translation=kjv"
        );
        const data = await res.json();
        setVerse(data);
      } catch (err) {
        console.error("Verse fetch failed", err);
      }
    }

    fetchVerse();
  }, []);

  if (!verse) return null;

  return (
    <div className="daily-verse-card">
      <div className="daily-verse-header">
        <span className="daily-verse-label">Daily Scripture</span>
      </div>

      <p className="daily-verse-text">“{verse.text.trim()}”</p>

      <div className="daily-verse-ref">— {verse.reference} (KJV)</div>
    </div>
  );
}
