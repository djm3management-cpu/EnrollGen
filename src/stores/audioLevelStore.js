import { useSyncExternalStore } from "react";
import { WAVEFORM_PEAK_COUNT } from "../audio/audioPeaks";

const listeners = new Set();
const EMPTY_PEAKS = Object.freeze(new Array(WAVEFORM_PEAK_COUNT).fill(0));
const pendingLevels = {
  agentLevel: 0,
  customerLevel: 0,
  agentPeaks: EMPTY_PEAKS,
  customerPeaks: EMPTY_PEAKS,
};
let snapshot = { ...pendingLevels };
let publishTimer = null;
let lastPublishedAt = 0;

function normalizePeaks(peaks) {
  if (!peaks?.length) return EMPTY_PEAKS;
  const normalized = new Array(WAVEFORM_PEAK_COUNT);
  for (let i = 0; i < WAVEFORM_PEAK_COUNT; i += 1) {
    const value = peaks[i] || 0;
    normalized[i] = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  }
  return normalized;
}

function samePeaks(a = EMPTY_PEAKS, b = EMPTY_PEAKS) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < WAVEFORM_PEAK_COUNT; i += 1) {
    if (Math.abs((a[i] || 0) - (b[i] || 0)) >= 0.01) return false;
  }
  return true;
}

function emit() {
  publishTimer = null;
  lastPublishedAt = performance.now();
  const next = {
    ...pendingLevels,
    agentPeaks: pendingLevels.agentPeaks === EMPTY_PEAKS ? EMPTY_PEAKS : [...pendingLevels.agentPeaks],
    customerPeaks:
      pendingLevels.customerPeaks === EMPTY_PEAKS ? EMPTY_PEAKS : [...pendingLevels.customerPeaks],
  };
  if (
    Math.abs(next.agentLevel - snapshot.agentLevel) < 0.002 &&
    Math.abs(next.customerLevel - snapshot.customerLevel) < 0.002 &&
    samePeaks(next.agentPeaks, snapshot.agentPeaks) &&
    samePeaks(next.customerPeaks, snapshot.customerPeaks)
  ) {
    return;
  }
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

export function publishAudioLevel(channel, value, { immediate = false, peaks = null } = {}) {
  const key = channel === "customer" ? "customerLevel" : "agentLevel";
  const peaksKey = channel === "customer" ? "customerPeaks" : "agentPeaks";
  pendingLevels[key] = Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
  pendingLevels[peaksKey] =
    peaks?.length || pendingLevels[key] > 0
      ? normalizePeaks(peaks)
      : EMPTY_PEAKS;

  const elapsed = performance.now() - lastPublishedAt;
  if (immediate || elapsed >= 66) {
    if (publishTimer) window.clearTimeout(publishTimer);
    emit();
    return;
  }

  if (!publishTimer) {
    publishTimer = window.setTimeout(emit, Math.max(0, 66 - elapsed));
  }
}

export function useAudioLevels() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
