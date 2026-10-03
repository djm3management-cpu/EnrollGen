// Each speaker owns its own health. A customer transcript/recovery must never
// dismiss an agent failure (or vice versa). Keep gap markers after recovery.
export function updateTranscriptionHealth(previous, message) {
  if (message.type === 'transcript') {
    const track = previous[message.speaker];
    if (!message.text || !track || track.status === 'connected') return previous;
    return { ...previous, [message.speaker]: { ...track, status: 'connected', message: '', gapUntil: message.timestamp ?? track.gapUntil } };
  }
  if (!['transcription_error', 'transcription_health'].includes(message.type)) return previous;
  const speaker = message.speaker || 'customer'; // Older Railway messages.
  if (!['agent', 'customer'].includes(speaker)) return previous;
  return { ...previous, [speaker]: {
    status: message.status || 'unavailable',
    inboundCallId: message.inboundCallId ?? previous[speaker]?.inboundCallId ?? null,
    message: message.message || (message.status === 'connected' ? '' : `${speaker === 'agent' ? 'Agent' : 'Customer'} transcription is unavailable.`),
    coverageGap: Boolean(message.coverageGap),
    gapSince: message.gapSince ?? previous[speaker]?.gapSince ?? null,
    gapUntil: message.gapUntil ?? null,
  } };
}

export function transcriptionHealthError(health) {
  return ['customer', 'agent'].map(speaker => health[speaker])
    .filter(track => track && track.status !== 'connected').map(track => track.message).join(' ');
}

export function transcriptionHealthForCall(health, inboundCallId) {
  return Object.fromEntries(Object.entries(health).filter(([, track]) => track.inboundCallId === inboundCallId));
}
