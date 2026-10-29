// Deepgram revises an audio segment in place. Arrival time and array position
// cannot identify it: the two tracks finalize independently, including late finals.
export function updateLiveTranscript(entries, entry) {
  const sameStream = candidate => candidate.speaker === entry.speaker && candidate.streamId === entry.streamId;
  const sameSegment = candidate => sameStream(candidate) && (
    entry.segmentId ? candidate.segmentId === entry.segmentId : !candidate.isFinal
  );
  const existing = entries.find(sameSegment);
  if (existing?.isFinal) return entries; // finalized audio cannot become interim again
  if (!entry.isFinal && entries.some(candidate => candidate.speaker === entry.speaker && (
    sameStream(candidate)
      ? Number.isFinite(candidate.startMs) && candidate.startMs > entry.startMs
      : candidate.timestamp > entry.timestamp
  ))) return entries;

  const next = entries.filter(candidate => {
    if (sameSegment(candidate)) return false;
    // A newer segment supersedes older partials, but a late final must leave
    // the newer segment alone. Keep finals as immutable evidence.
    return candidate.isFinal || candidate.speaker !== entry.speaker
      || (sameStream(candidate) ? !(candidate.startMs <= entry.startMs) : candidate.timestamp > entry.timestamp);
  });
  if (entry.text?.trim()) next.push(entry);
  return next.sort((a, b) => a.timestamp - b.timestamp
    || a.speaker.localeCompare(b.speaker)
    || (a.segmentId || '').localeCompare(b.segmentId || ''));
}
