// Manual intent is independent of connectivity. Only an explicit selection can
// create a pending write; registration/reconnection can only release that write.
export function createAvailabilityIntent({ write, onChange }) {
  let state = { status: "offline", statusSince: null, pendingStatus: null, isSaving: false, error: "" };
  let ready = false;
  let revision = 0;
  let pending = null;
  let running = false;
  let disposed = false;
  const emit = (patch) => {
    state = { ...state, ...patch };
    if (!disposed) onChange(state);
  };

  async function drain() {
    if (disposed || running || !pending || (pending.status === "available" && !ready)) return;
    running = true;
    const request = pending;
    emit({ isSaving: true });
    try {
      const result = await write(request.status);
      if (disposed) return;
      if (pending === request) {
        if (request.status === "available" && result.status === "offline") {
          // The lease may have disappeared between acknowledgment and write.
          // Keep this explicit request, but wait for another server acknowledgment.
          ready = false;
          emit({ ...result, error: "Waiting for phone connection" });
        } else {
          pending = null;
          emit({ ...result, pendingStatus: null, error: "" });
        }
      }
    } catch (error) {
      if (!disposed && pending === request) {
        pending = null;
        emit({ pendingStatus: null, error: error?.message || "Availability update failed" });
      }
    } finally {
      running = false;
      if (!disposed) {
        emit({ isSaving: false });
        void drain();
      }
    }
  }

  return {
    hydrate(result) {
      if (!revision && !disposed) emit(result);
    },
    select(status) {
      if (disposed || !["available", "busy", "offline"].includes(status)) return;
      pending = { status, revision: ++revision };
      emit({ pendingStatus: status, error: "" });
      void drain();
    },
    setPhoneReady(value) {
      if (disposed) return;
      ready = value;
      void drain();
    },
    dispose() { disposed = true; pending = null; },
  };
}
