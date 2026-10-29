const RATE = 8000;
const MAX_BYTES = 512 * 1024 * 1024;
const MAX_OUTPUT = 256 * 1024 * 1024;
const tag = (view, offset) => String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, 4));

export function readRecordingWav(buffer) {
  const v = new DataView(buffer);
  if (v.byteLength < 12 || tag(v, 0) !== 'RIFF' || tag(v, 8) !== 'WAVE') throw Error('Recording is not a supported WAV file.');
  let format, data;
  for (let i = 12; i + 8 <= v.byteLength;) {
    const size = v.getUint32(i + 4, true), end = i + 8 + size;
    if (end > v.byteLength) throw Error('Recording WAV is truncated.');
    if (tag(v, i) === 'fmt ' && size >= 16) format = { encoding: v.getUint16(i + 8, true), channels: v.getUint16(i + 10, true), rate: v.getUint32(i + 12, true), block: v.getUint16(i + 20, true), bits: v.getUint16(i + 22, true) };
    if (tag(v, i) === 'data') data = { offset: i + 8, length: size };
    i = end + size % 2;
  }
  if (!format || !data || ![1, 2].includes(format.channels) || format.rate < 8000 || format.rate > 96000 ||
      !((format.encoding === 1 && format.bits === 16) || (format.encoding === 7 && format.bits === 8)) ||
      format.block !== format.channels * format.bits / 8 || data.length % format.block) throw Error('Recording WAV format cannot be merged. Download the source recordings.');
  const frames = data.length / format.block;
  return { duration: frames / format.rate, sample(frame, channel) {
    const position = Math.min(frames - 1, Math.max(0, frame));
    const offset = data.offset + position * format.block + Math.min(channel, format.channels - 1) * format.bits / 8;
    if (format.encoding === 1) return v.getInt16(offset, true);
    const byte = ~v.getUint8(offset) & 255, value = (((byte & 15) << 3) + 132) << ((byte >> 4) & 7);
    return byte & 128 ? 132 - value : value - 132;
  }, rate: format.rate };
}

export function planRecordingMerge(segments, events = []) {
  const spans = segments.filter(s => Number.isFinite(s.start) && s.duration > 0).map(s => ({ ...s, end: s.start + s.duration }));
  if (!spans.length) throw Error('Recording timing or audio is still unavailable. Refresh after recordings finish processing.');
  const start = Math.min(...spans.map(s => s.start)), end = Math.max(...spans.map(s => s.end));
  const changes = events.filter(e => ['customer_hold_changed', 'warm_dialed', 'warm_completed', 'warm_canceled'].includes(e.event) && Number.isFinite(Date.parse(e.at)))
    .map(e => ({ ...e, time: Date.parse(e.at) / 1000 })).sort((a, b) => a.time - b.time);
  const points = [...new Set([start, end, ...spans.flatMap(s => [s.start, s.end]), ...changes.map(e => e.time).filter(t => t > start && t < end)])].sort((a, b) => a - b);
  const clips = [], gaps = [];
  let held = false, change = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i], to = points[i + 1];
    while (change < changes.length && changes[change].time <= from) {
      const event = changes[change++];
      if (event.event === 'customer_hold_changed') held = event.payload?.held === true;
      else if (event.event === 'warm_dialed') held = true;
      else held = false;
    }
    const score = s => held
      ? s.role === 'agent' ? (s.originalAgent ? 120 : 110) : s.role === 'third_party' ? 100 : s.role === 'legacy' ? 60 : -1
      : s.role === 'customer' ? 120 : s.role === 'legacy' ? 100 : s.role === 'agent' ? 80 : 60;
    const candidates = spans.filter(s => s.start <= from && s.end >= to && score(s) >= 0)
      .sort((a, b) => score(b) - score(a) || b.start - a.start || a.id.localeCompare(b.id));
    const selected = candidates[0];
    if (!selected) { gaps.push({ start: from - start, duration: to - from }); continue; }
    const previous = clips.at(-1);
    if (previous?.id === selected.id && Math.abs(previous.start + previous.duration - (from - start)) < 1 / RATE) previous.duration += to - from;
    else clips.push({ id: selected.id, start: from - start, sourceOffset: from - selected.start, duration: to - from });
  }
  if (gaps.length) throw Error(`Merged playback unavailable: ${gaps.reduce((n, g) => n + g.duration, 0).toFixed(2)} seconds have no recording coverage. Source recordings remain available.`);
  return { start, duration: end - start, clips };
}

// Render one stereo PCM WAV. Overlapping artifacts are alternatives, never
// summed or concatenated; each instant is copied from exactly one source.
export function mergeRecordingWavs(playback, buffers) {
  const entries = playback.segments.filter(s => buffers.has(s.id));
  if (entries.reduce((n, s) => n + buffers.get(s.id).byteLength, 0) > MAX_BYTES) throw Error('Recordings are too large to merge in this browser. Download the source recordings.');
  if (entries.some(s => !Number.isFinite(Date.parse(s.startedAt)))) throw Error('A source recording is missing its provider start time. Refresh after reconciliation.');
  const decoded = new Map(entries.map(s => [s.id, readRecordingWav(buffers.get(s.id))]));
  const plan = planRecordingMerge(entries.map(s => ({ ...s, start: Date.parse(s.startedAt) / 1000, duration: decoded.get(s.id).duration })), playback.events);
  const frames = Math.round(plan.duration * RATE), bytes = frames * 4;
  if (!Number.isSafeInteger(bytes) || bytes > MAX_OUTPUT) throw Error('Merged recording exceeds the browser size limit. Download the source recordings.');
  const output = new ArrayBuffer(44 + bytes), v = new DataView(output);
  const writeTag = (offset, text) => [...text].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
  writeTag(0, 'RIFF'); v.setUint32(4, bytes + 36, true); writeTag(8, 'WAVE'); writeTag(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); writeTag(36, 'data'); v.setUint32(40, bytes, true);
  for (const clip of plan.clips) {
    const source = decoded.get(clip.id), from = Math.round(clip.start * RATE), until = Math.round((clip.start + clip.duration) * RATE);
    for (let i = from; i < until && i < frames; i++) for (let ch = 0; ch < 2; ch++) {
      const position = Math.floor((clip.sourceOffset + (i - from) / RATE) * source.rate);
      v.setInt16(44 + i * 4 + ch * 2, source.sample(position, ch), true);
    }
  }
  return { buffer: output, duration: frames / RATE,
    startOffset: Math.max(0, plan.start - Date.parse(playback.startedAt) / 1000), clips: plan.clips };
}
