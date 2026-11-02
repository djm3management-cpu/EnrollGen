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
    useMemo: (fn) => fn(),
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

test('manual sharing, automatic outbound capture and START respect the feature flag and server ownership', async () => {
  for (const [enabled, reserved, active, expected] of [[true,false,false,3],[false,false,false,0],[true,true,false,0],[true,false,true,0]]) {
    const effects=[], controls={current:null}; let starts=0;
    const inbound={activeCall:{params:{direction:'outbound',twilioCallSid:'CA'+'1'.repeat(32)}},remoteStream:{},serverTranscriptionReserved:reserved,serverTranscriptionActive:active};
    const customer={customerTranscript:[],isCapturing:false,startCapture:async()=>{starts++;},stopCapture(){}};
    const context=vm.createContext({memo:fn=>fn,useRef:value=>({current:value}),useEffect:fn=>effects.push(fn),useCallback:fn=>fn,useMemo:fn=>fn(),
      useScript:()=>({}),useCustomerAudio:()=>customer,useSpeechRecognition:()=>({listening:true,transcriptRows:[],startListening(){},stopListening(){}}),
      useInboundCall:()=>inbound,useMergedTranscript:()=>({}),useCopilotEngine:()=>({})});
    vm.runInContext(source.replace("'true'",JSON.stringify(String(enabled))),context);
    context.render({controlsRef:controls});effects.forEach(fn=>fn());
    await new Promise(resolve=>setImmediate(resolve));
    await controls.current.shareCustomerAudio();await controls.current.handleStart();
    assert.equal(starts,expected,JSON.stringify({enabled,reserved,active}));
  }
});
