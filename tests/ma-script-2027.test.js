import test from "node:test";
import assert from "node:assert/strict";
import { MA_SCRIPT_SECTIONS, MA_SCRIPT_REVISION, resolveMASections } from "../src/data/maScript2027.js";
import { getMAScriptView } from "../src/lib/maScriptFlow.js";
import { initialState, scriptReducer, getActiveSection, getSectionUnlocked } from "../src/context/scriptReducer.js";

const fresh = (direction = "inbound") => ({ ...structuredClone(initialState), callDirection: direction });
const section = (key) => MA_SCRIPT_SECTIONS.find((item) => item.key === key);
const common = { otherCoverage: "no", nonRenewing: "no", callback: "received" };
function answer(state, item, value, sectionKey) {
  return scriptReducer(state, { type: "SET_MA_ANSWER", section: sectionKey, key: item.key, value });
}
function runSection(state, key, overrides = {}) {
  for (let step = 0; step < 200; step += 1) {
    const view = getMAScriptView(section(key), state);
    const pending = view.items.find((item) => item.type === "choice" && !item.selected);
    if (!pending) return { state, view };
    const value = overrides[pending.id] || common[pending.id] || pending.options[0].value;
    state = answer(state, pending, value, key);
  }
  throw new Error("Script did not converge");
}
function through(state, lastKey, overrides = {}) {
  for (const item of MA_SCRIPT_SECTIONS) {
    const result = runSection(state, item.key, overrides);
    assert.equal(result.view.complete, true, `${item.key} should complete`);
    state = scriptReducer(result.state, { type: "SET_GATE", field: item.gate_field, value: true });
    assert.equal(state[item.gate_field], true);
    if (item.key === lastKey) break;
  }
  return state;
}

test("legacy saved templates resolve to the complete approved 2027 replacement", () => {
  assert.equal(resolveMASections([{ key: "recording", body: "old SEP intro" }]), MA_SCRIPT_SECTIONS);
  assert.equal(resolveMASections(null), MA_SCRIPT_SECTIONS);
  assert.equal(resolveMASections(MA_SCRIPT_SECTIONS), MA_SCRIPT_SECTIONS);
  assert.ok(MA_SCRIPT_SECTIONS.every((item) => item.revision === MA_SCRIPT_REVISION));
});

test("inbound and outbound have distinct openings and selection locks after start", () => {
  const inbound = getMAScriptView(section("recording"), fresh()).items;
  assert.ok(inbound.some((item) => item.text?.includes("new 2027 health plan")));
  assert.ok(inbound.some((item) => item.type === "cue" && item.text === "Greet customer"));
  assert.equal(inbound.some((item) => item.type === "choice"), false);
  const outbound = getMAScriptView(section("recording"), fresh("outbound")).items;
  assert.ok(outbound.some((item) => item.type === "cue" && item.text.includes("PTC")));
  assert.equal(outbound.some((item) => item.type === "choice"), false);
  const started = { ...fresh(), tpmoStart: Date.now() };
  assert.equal(scriptReducer(started, { type: "SET_MA_DIRECTION", value: "outbound" }), started);
});

test("recording section has one static script path and the checkbox controls completion", () => {
  const { state, view } = runSection(fresh(), "recording");
  assert.equal(view.complete, true);
  assert.equal(view.items.filter((item) => item.type === "choice").length, 0);
  const blocked = scriptReducer(state, { type: "SET_GATE", field: "recordingOk", value: true });
  assert.equal(blocked.recordingOk, true);
  assert.equal(getActiveSection(blocked), 2);
});

test("happy-path inbound completes all eight stages without legacy SNP routing", () => {
  const state = through(fresh(), "enrollment");
  assert.equal(getActiveSection(state), 8);
  assert.equal(state.enrollOk, true);
  assert.equal(state.notes.callOutcome, "enrolled");
  assert.equal(state.partBReduction, true);
});

test("outbound enrollment waits for inbound callback, renewed recording consent and TPMO", () => {
  let state = through(fresh("outbound"), "sob");
  const waiting = runSection(state, "enrollment", { callback: "waiting" });
  assert.equal(waiting.view.complete, false);
  assert.equal(waiting.view.items.at(-1).outcome, "callback_scheduled");
  assert.equal(scriptReducer(waiting.state, { type: "SET_GATE", field: "enrollOk", value: true }).enrollOk, false);
  const callbackChoice = waiting.view.items.find((item) => item.id === "callback");
  state = answer(waiting.state, callbackChoice, "received", "enrollment");
  const received = getMAScriptView(section("enrollment"), state);
  assert.equal(received.items.at(-1).id, "callbackRecording");
  assert.equal(received.complete, false);
  const declined = runSection(state, "enrollment", { callbackRecording: "no" });
  assert.equal(declined.view.complete, false);
  assert.equal(declined.view.items.at(-1).type, "close");
  const complete = runSection(state, "enrollment");
  assert.ok(complete.view.items.some((item) => item.id === "callbackTpmo"));
  assert.ok(!complete.view.items.some((item) => item.text?.includes("I can enroll you today over the telephone")));
  state = scriptReducer(complete.state, { type: "SET_GATE", field: "enrollOk", value: true });
  assert.equal(state.enrollOk, true);
  assert.equal(state.callDirection, "outbound");
});

test("changing an earlier answer clears dependent answers and completed later stages", () => {
  let state = through(fresh(), "sob");
  state = scriptReducer(state, { type: "SET_MA_DIRECTION", value: "outbound" });
  assert.equal(state.recordingOk, true);
  assert.equal(state.sobOk, true);
  assert.deepEqual(state.maAnswers, {});
});

test("all unanswered election alternatives lead to non-enrollment closing", () => {
  let state = fresh();
  const overrides = { aep: "no" };
  for (let index = 0; index < 26; index += 1) overrides[`applies${index}`] = "no";
  const result = runSection(state, "qualifications", overrides);
  assert.equal(result.view.complete, false);
  assert.equal(result.view.items.at(-1).type, "close");
  assert.equal(result.view.items.filter((item) => item.id?.startsWith("applies")).length, 26);
  assert.ok(result.view.items.some((item) => item.text?.includes("does not appear that you qualify")));
});

test("verified election period skips remaining questions and displays privacy disclaimer", () => {
  const result = runSection(fresh(), "qualifications", { aep: "no", applies0: "no", applies1: "yes", confirmed1: "yes" });
  assert.equal(result.view.complete, true);
  assert.equal(result.view.items.filter((item) => item.id?.startsWith("applies")).length, 2);
  assert.ok(result.view.items.some((item) => item.text?.includes("not required to give any health-related information")));
});

test("general-information caller must verify eligibility before enrollment", () => {
  let state = through(fresh(), "sob", { medicare: "unknown" });
  const view = getMAScriptView(section("enrollment"), state);
  assert.equal(view.items.at(-1).id, "eligibleNow");
  const result = runSection(state, "enrollment", { eligibleNow: "no" });
  assert.equal(result.view.complete, false);
  assert.equal(result.view.items.at(-1).type, "close");
});

test("absent POA blocks enrollment until presence and disclosures are confirmed", () => {
  let state = through(fresh(), "sob", { ownDecisions: "no", available: "later", reschedule: "general" });
  assert.equal(getMAScriptView(section("enrollment"), state).items.at(-1).id, "poaPresent");
  const result = runSection(state, "enrollment", { poaPresent: "no" });
  assert.equal(result.view.complete, false);
});

test("TRICARE may continue after disclosure; union coverage follows referral closing", () => {
  const tricare = runSection(fresh(), "qualifications", { otherCoverage: "yes", employerIndividual: "no", va: "no", tricare: "yes" });
  assert.equal(tricare.view.complete, true);
  assert.ok(tricare.view.items.some((item) => item.text?.includes("secondary insurance")));
  const union = runSection(fresh(), "qualifications", { otherCoverage: "yes", employerIndividual: "yes" });
  assert.equal(union.view.complete, false);
  assert.equal(union.view.items.at(-1).type, "close");
});

test("PDP-only presentation omits MA benefits and SNP enrollment uses revised disclosure", () => {
  const pdp = runSection(fresh(), "sob", { planKind: "pdp", mapdAvailable: "no", rxLookup: "no" });
  assert.equal(pdp.view.complete, true);
  assert.ok(!pdp.view.items.some((item) => item.id === "giveback"));
  assert.ok(pdp.view.items.some((item) => item.text?.includes("I suggest we look them up")));
  let state = through(fresh(), "sob");
  const csnp = runSection(state, "enrollment", { selectedSnp: "csnp" });
  assert.ok(csnp.view.items.some((item) => item.text?.includes("may be disenrolled according to CMS requirements")));
  assert.equal(csnp.state.snpType, "CSNP");
  assert.equal(getActiveSection(csnp.state), 7);
});

test("coaching uses selected 2027 wording instead of superseded or hidden paths", async () => {
  const { getMASelectedKnowledge, getMASelectedScriptText } = await import("../src/lib/maScriptFlow.js");
  const state = through(fresh(), "sob", { otherCoverage: "yes", employerIndividual: "no", va: "no", tricare: "yes" });
  const knowledge = getMASelectedKnowledge(state);
  assert.ok(knowledge.Qualifications.verbatimScript.some((text) => text.includes("Do you still wish to proceed")));
  assert.ok(!JSON.stringify(knowledge).includes("WILL BE VOIDED"));
  assert.ok(!JSON.stringify(knowledge).includes("disqualifying coverage"));
  const intro = getMASelectedScriptText(section("recording"), state);
  assert.ok(intro.includes("new 2027 health plan"));
  assert.ok(!intro.includes("claims"));
  assert.ok(!intro.includes("PTC"));
});

test("both supplied TPMO versions receive referral credit without requiring SHIP", async () => {
  const { analyzeTranscript } = await import("../src/context/TranscriptAnalyzer.js");
  for (const wording of [
    "We do not offer every plan available in your area. Currently we represent 5 organizations which offer 25 products in your area. Please contact Medicare.gov, 1-800-MEDICARE, to get information on all of your options.",
    "Currently we represent 5 organizations which offer 25 products in your area. You can always contact Medicare.gov, 1800–MEDICARE for help with plan choices.",
  ]) {
    const analysis = analyzeTranscript(wording);
    assert.equal(analysis.results.tpmo_not_every_plan.detected, true);
    assert.equal(analysis.results.tpmo_medicare_gov_referral.confidence, 95);
    assert.equal(analysis.results.tpmo_org_plan_counts.detected, true);
  }
});
