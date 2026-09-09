import test from "node:test";
import assert from "node:assert/strict";
import { persistBeforeReset } from "../src/lib/persistBeforeReset.js";

test("short call without enrollment persists before reset", async () => {
  const events = [];
  const result = await persistBeforeReset({
    persist: async () => {
      events.push("persist-start");
      await Promise.resolve();
      events.push("persist-complete");
      return { transcript_id: "t-short" };
    },
    reset: () => events.push("reset"),
  });

  assert.deepEqual(events, ["persist-start", "persist-complete", "reset"]);
  assert.equal(result.transcript_id, "t-short");
});

test("persistence failure retains state and reports the error", async () => {
  const events = [];
  let reported = null;
  const result = await persistBeforeReset({
    persist: async () => {
      events.push("persist");
      throw new Error("database unavailable");
    },
    reset: () => events.push("reset"),
    onError: (error) => {
      reported = error;
      events.push("error");
    },
  });

  assert.equal(result, null);
  assert.deepEqual(events, ["persist", "error"]);
  assert.equal(reported.message, "database unavailable");
});
