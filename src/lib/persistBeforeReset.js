// Await a final persistence operation before resetting in-memory state.
// A failed write intentionally skips reset so callers can retain the data.
export async function persistBeforeReset({ persist, reset, onError } = {}) {
  try {
    const result = await persist();
    if (result == null) {
      throw new Error("Post-call transcript could not be persisted.");
    }
    reset?.();
    return result;
  } catch (error) {
    onError?.(error);
    return null;
  }
}
