export const DEFAULT_AUDIO_PREFERENCES = Object.freeze({ enabled: true, thresholdDb: -50 });

export function normalizeAudioPreferences(value) {
  const threshold = value?.thresholdDb;
  return {
    enabled: value?.enabled !== false,
    thresholdDb: typeof threshold === 'number' && Number.isFinite(threshold)
      ? Math.max(-80, Math.min(-10, threshold)) : DEFAULT_AUDIO_PREFERENCES.thresholdDb,
  };
}

export function readAudioPreferences(user, agentId) {
  if (user?.unsafeMetadata?.audioPreferences) return normalizeAudioPreferences(user.unsafeMetadata.audioPreferences);
  try {
    return normalizeAudioPreferences(JSON.parse(localStorage.getItem(`enrollgen_audio:${user?.id || agentId}`)));
  } catch { return { ...DEFAULT_AUDIO_PREFERENCES }; }
}

export async function saveAudioPreferences(user, agentId, value) {
  const preferences = normalizeAudioPreferences(value);
  if (user) await user.update({ unsafeMetadata: { ...user.unsafeMetadata, audioPreferences: preferences } });
  // The profile is authoritative; this cache also supports local development.
  try { localStorage.setItem(`enrollgen_audio:${user?.id || agentId}`, JSON.stringify(preferences)); } catch { /* Profile is saved. */ }
  return preferences;
}

export function calibratedThreshold(speech, silence) {
  const percentile = (values, fraction) => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) throw new Error('No microphone samples received. Try calibration again.');
    return 20 * Math.log10(Math.max(1e-6, sorted[Math.floor((sorted.length - 1) * fraction)]));
  };
  const voiceDb = percentile(speech, 0.65);
  const noiseDb = percentile(silence, 0.95);
  if (voiceDb < -75 || voiceDb - noiseDb < 6) {
    throw new Error('Speech and silence were too similar. Move closer to the microphone and try again.');
  }
  return Math.round(normalizeAudioPreferences({ thresholdDb: (voiceDb + noiseDb) / 2 }).thresholdDb);
}
