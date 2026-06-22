import { useSyncExternalStore } from "react";

const listeners = new Set();
const pendingLevels = {
  agentLevel: 0,
  customerLevel: 0,
};
let snapshot = { ...pendingLevels };
let publishTimer = null;
let lastPublishedAt = 0;

function emit() {
  publishTimer = null;
  lastPublishedAt = performance.now();
  const next = { ...pendingLevels };
  if (
    Math.abs(next.agentLevel - snapshot.agentLevel) < 0.002 &&
    Math.abs(next.customerLevel - snapshot.customerLevel) < 0.002
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

export function publishAudioLevel(channel, value, { immediate = false } = {}) {
  const key = channel === "customer" ? "customerLevel" : "agentLevel";
  pendingLevels[key] = Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;

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
