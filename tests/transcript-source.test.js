import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = (await readFile(new URL("../src/components/ScriptPrompter.jsx", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "")
  .replace("export default ScriptPrompter;", "globalThis.render = ScriptPrompter;")
  .replace("import.meta.env.VITE_ENABLE_CUSTOMER_AUDIO", "'true'");

test("inbound speaker sources exclude mic bleed and survive disconnect; outbound uses remote capture", () => {
  const refs = [];
  let index = 0;
  let merged;
  const inbound = {
    activeCall: { params: {} },
    agentRows: [{ text: "Agent on Twilio track" }],
    customerTranscript: [{ text: "Customer on Twilio track" }],
  };
  const speech = { transcriptRows: [{ text: "Customer leaking into microphone" }] };
  const customer = { customerTranscript: [{ text: "Outbound customer" }] };
  const context = vm.createContext({
    memo: (fn) => fn,
    useRef: (value) => refs[index++] ||= { current: value },
    useEffect: () => {},
    useCallback: (fn) => fn,
    useScript: () => ({}),
    useCustomerAudio: () => customer,
    useSpeechRecognition: () => speech,
    useInboundCall: () => inbound,
    useMergedTranscript: (args) => { merged = args; return {}; },
    useCopilotEngine: () => ({}),
  });
  vm.runInContext(source, context);
  const render = () => { index = 0; context.render({}); };
  render();
  assert.equal(merged.agentTranscriptRows, inbound.agentRows);
  assert.equal(merged.customerTranscript, inbound.customerTranscript);
  inbound.activeCall = null;
  render();
  assert.equal(merged.agentTranscriptRows, inbound.agentRows);
  assert.equal(merged.customerTranscript, inbound.customerTranscript);
  inbound.activeCall = { params: { direction: "outbound" } };
  render();
  assert.equal(merged.agentTranscriptRows, speech.transcriptRows);
  assert.equal(merged.customerTranscript, customer.customerTranscript);
});
