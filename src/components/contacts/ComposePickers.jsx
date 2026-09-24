import { useEffect, useRef, useState } from "react";
import { Smile, Image } from "lucide-react";
import { useAppAuth } from "../../context/AuthContext";

const EMOJI = {
  Smileys: [["😀", "happy smile"], ["😊", "smiling blush"], ["😂", "laugh tears joy"], ["🤣", "laugh rolling"], ["😉", "wink"], ["😍", "love heart eyes"], ["🥰", "love hearts"], ["😎", "cool sunglasses"], ["🤔", "thinking"], ["😢", "sad cry"], ["😭", "crying"], ["😮", "surprised"], ["😅", "sweat smile"], ["🥳", "party celebrate"]],
  Gestures: [["👍", "thumbs up yes"], ["👎", "thumbs down no"], ["👋", "wave hello goodbye"], ["👏", "clap applause"], ["🙌", "celebrate raised hands"], ["🙏", "thanks pray please"], ["🤝", "handshake agree"], ["👌", "okay"], ["💪", "strong muscle"], ["✌️", "peace"]],
  Hearts: [["❤️", "red heart love"], ["🧡", "orange heart"], ["💛", "yellow heart"], ["💚", "green heart"], ["💙", "blue heart"], ["💜", "purple heart"], ["💕", "two hearts"], ["💖", "sparkle heart"], ["💯", "hundred perfect"]],
  Nature: [["🌞", "sun morning"], ["🌈", "rainbow"], ["🌻", "sunflower flower"], ["🌹", "rose flower"], ["🐶", "dog"], ["🐱", "cat"], ["🦋", "butterfly"], ["🌴", "palm tree"], ["🔥", "fire"], ["⭐", "star"]],
  Objects: [["🎉", "party celebration"], ["🎂", "birthday cake"], ["🎁", "gift present"], ["☕", "coffee"], ["🍌", "banana minions"], ["📞", "phone call"], ["📅", "calendar appointment"], ["✅", "check done yes"], ["❌", "cross no"], ["📍", "location pin"], ["🏠", "home house"], ["🚗", "car"], ["💬", "message chat"], ["✨", "sparkles"]],
};
const ALL = Object.values(EMOJI).flat();
const BASE = (import.meta.env.VITE_TELEPHONY_BASE_URL || "").replace(/\/$/, "");

export default function ComposePickers({ onEmoji, onGif, disabled }) {
  const [panel, setPanel] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Smileys");
  const [recent, setRecent] = useState(() => {
    try { const data = JSON.parse(localStorage.getItem("sms_recent_emoji") || "[]"); return Array.isArray(data) ? data.filter((e) => ALL.some(([emoji]) => emoji === e)).slice(0, 16) : []; } catch { return []; }
  });
  const [gifs, setGifs] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const root = useRef(null);
  const { getToken } = useAppAuth();
  useEffect(() => {
    if (!panel) return undefined;
    const close = (event) => { if (!root.current?.contains(event.target)) setPanel(null); };
    const escape = (event) => { if (event.key === "Escape") { setPanel(null); root.current?.querySelector("button")?.focus(); } };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [panel]);
  useEffect(() => {
    if (panel !== "gif") return undefined;
    const controller = new AbortController();
    setLoading(true); setError(""); setGifs([]);
    const timer = window.setTimeout(async () => {
      try {
        const token = await getToken();
        const response = await fetch(`${BASE}/api/sms/gifs?q=${encodeURIComponent(query.trim() || "minions")}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "GIF search failed.");
        if (!controller.signal.aborted) setGifs(payload.gifs || []);
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [panel, query, getToken]);
  const chooseEmoji = (emoji) => {
    onEmoji(emoji);
    const next = [emoji, ...recent.filter((entry) => entry !== emoji)].slice(0, 16);
    setRecent(next); try { localStorage.setItem("sms_recent_emoji", JSON.stringify(next)); } catch { /* optional storage */ }
  };
  const emojiButton = ([emoji, label]) => <button type="button" key={emoji} title={label} aria-label={label} onClick={() => chooseEmoji(emoji)}>{emoji}</button>;
  return <div className="compose-pickers" ref={root}>
    <button type="button" className="contacts-mini-btn" disabled={disabled} aria-label="Emoji picker" aria-expanded={panel === "emoji"} onMouseDown={(e) => e.preventDefault()} onClick={() => { setPanel(panel === "emoji" ? null : "emoji"); setQuery(""); }}><Smile size={18} /></button>
    <button type="button" className="contacts-mini-btn" disabled={disabled} aria-label="GIF picker" aria-expanded={panel === "gif"} onClick={() => { setPanel(panel === "gif" ? null : "gif"); setQuery(""); }}><Image size={18} /><span>GIF</span></button>
    {panel && <section className="compose-picker-panel" aria-label={panel === "emoji" ? "Choose an emoji" : "Choose a GIF"}>
      <div className="compose-picker-heading"><strong>{panel === "emoji" ? "EMOJI" : "GIF · MMS"}</strong><button type="button" aria-label="Close picker" onClick={() => setPanel(null)}>×</button></div>
      <input autoFocus aria-label={panel === "emoji" ? "Search emoji" : "Search GIFs"} placeholder={panel === "emoji" ? "Search emoji" : "Search GIPHY"} value={query} onChange={(e) => setQuery(e.target.value)} />
      {panel === "emoji" ? <>
        {!query && recent.length > 0 && <><small>RECENTLY USED</small><div className="compose-emoji-grid">{recent.map((emoji) => emojiButton(ALL.find(([e]) => e === emoji)))}</div></>}
        <div className="compose-picker-categories">{Object.keys(EMOJI).map((name) => <button type="button" className={category === name ? "is-active" : ""} key={name} onClick={() => { setCategory(name); setQuery(""); }}>{name}</button>)}</div>
        <div className="compose-emoji-grid">{(query ? ALL.filter(([, label]) => label.includes(query.toLowerCase())) : EMOJI[category]).map(emojiButton)}</div>
        {query && !ALL.some(([, label]) => label.includes(query.toLowerCase())) && <p>No emoji found.</p>}
      </> : <>
        <button type="button" className="contacts-mini-btn" onClick={() => setQuery("minions")}>🍌 FEATURED: MINIONS</button>
        <small>Preview before sending · Under 600 KB</small>
        {loading && <p role="status">Finding GIFs…</p>}{error && <p role="alert">{error}</p>}
        {!loading && !error && !gifs.length && <p>No GIFs under 600 KB found. Try another search.</p>}
        <div className="compose-gif-grid">{gifs.map((gif) => <button type="button" key={gif.id} onClick={() => { onGif(gif); setPanel(null); }}><img src={gif.url} alt={gif.title} loading="lazy" /></button>)}</div>
        <a href="https://giphy.com" target="_blank" rel="noreferrer">Powered by GIPHY</a>
      </>}
    </section>}
  </div>;
}
