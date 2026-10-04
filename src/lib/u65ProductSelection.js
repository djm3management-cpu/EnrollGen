import { getU65Plan } from '../data/u65Guidance.js';

// Shared by the left rail, script, Agent Tools and both Co-Pilot paths.
// Session memory only: no previous customer selection is restored from storage.
let selectedId = null;
const listeners = new Set();
export function getU65SelectedProduct() { return selectedId; }
export function subscribeU65Product(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function selectU65Product(id) {
  const next = getU65Plan(id)?.id || null;
  if (next === selectedId) return;
  selectedId = next;
  listeners.forEach((listener) => listener());
}
