// Standard DTMF (dual-tone multi-frequency) keypad tones, played
// locally for audible feedback while dialing. Not sent over any call,
// purely a UI cue, same tone table used by real telephone keypads.
const DTMF_FREQUENCIES = {
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  "*": [941, 1209],
  "0": [941, 1336],
  "#": [941, 1477],
};

const TONE_DURATION_S = 0.12;
const FADE_S = 0.015;

let sharedContext = null;

function getContext() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext || sharedContext.state === "closed") {
    sharedContext = new Ctor();
  }
  return sharedContext;
}

export function playDtmfTone(digit) {
  const frequencies = DTMF_FREQUENCIES[digit];
  if (!frequencies) return;

  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + FADE_S);
  gain.gain.setValueAtTime(0.18, now + TONE_DURATION_S - FADE_S);
  gain.gain.linearRampToValueAtTime(0, now + TONE_DURATION_S);
  gain.connect(ctx.destination);

  frequencies.forEach((frequency) => {
    const oscillator = ctx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.connect(gain);
    oscillator.start(now);
    oscillator.stop(now + TONE_DURATION_S);
  });
}
