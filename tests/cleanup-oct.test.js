import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
import { agentTrackActive, updateTranscriptionHealth } from '../src/lib/transcriptionHealth.js';
import { runManualReport } from '../integrations/worker.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('inbound agent dot follows server recovery and failure, independently of browser/customer health', () => {
  const inbound = { activeCall: { params: {} }, transcriptionHealth: {} };
  assert.equal(agentTrackActive(inbound, true), false);
  inbound.transcriptionHealth = updateTranscriptionHealth({}, { type: 'transcript', speaker: 'agent', text: 'Hello', inboundCallId: 'call' });
  assert.equal(inbound.transcriptionHealth.agent.inboundCallId, 'call');
  assert.equal(agentTrackActive(inbound, false), true);
  inbound.transcriptionHealth = updateTranscriptionHealth(inbound.transcriptionHealth, { type: 'transcription_error', speaker: 'customer' });
  assert.equal(agentTrackActive(inbound, false), true);
  inbound.transcriptionHealth = updateTranscriptionHealth(inbound.transcriptionHealth, { type: 'transcription_error', speaker: 'agent', status: 'reconnecting' });
  assert.equal(agentTrackActive(inbound, true), false);
  inbound.activeCall.params.direction = 'outbound';
  assert.equal(agentTrackActive(inbound, true), true);
  inbound.activeCall = null;
  assert.equal(agentTrackActive(inbound, false), false);
});

test('manual worker probe sends one synthetic CSV only to Mike, with stable idempotency and no scheduler', async () => {
  const requests = [];
  const options = { env: { RESEND_API_KEY: 'fixture', INTEGRATIONS_REPORT_FROM: 'reports@example.com' },
    send: async (url, body, headers) => { requests.push({ url, body: JSON.parse(body), headers }); return { status: 200 }; } };
  assert.equal((await runManualReport(['--test-report', '--test-id', 'oct03'], options)).result, 'sent');
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.deepEqual(request.body.to, ['mike@newgenhealthsolutions.com']);
  assert.equal(request.body.cc, undefined);
  assert.equal(request.body.bcc, undefined);
  assert.equal(request.headers['Idempotency-Key'], 'mike-report-test-oct03');
  const csv = Buffer.from(request.body.attachments[0].content, 'base64').toString();
  assert.match(csv, /sample-report-only/);
  assert.match(csv, /test_call/);
  await assert.rejects(runManualReport(['--test-report', '--to', 'dispo@example.com'], options));
  await assert.rejects(runManualReport(['--test-report'], options));
  assert.equal(requests.length, 1);
});

test('CallStore endCall returns timer metadata and resets without requesting a token or persisting', async () => {
  const source = read('../src/stores/callStore.js').replace(/^import .*;\n/gm, '').replace('export function useCallStore', 'function useCallStore').replace('import.meta.env.DEV', 'false');
  const context = vm.createContext({ Date, useSyncExternalStore() {}, process: { env: { NODE_ENV: 'test' } } });
  vm.runInContext(source + '\nglobalThis.store = useCallStore;', context);
  context.store.getState().startCall('agent', 'call');
  const result = await context.store.getState().endCall();
  assert.equal(result.call_id, 'call');
  assert.equal(result.agent_id, 'agent');
  assert.equal(result.duration_seconds, 0);
  assert.equal(context.store.getState().callActive, false);
  assert.equal(await context.store.getState().endCall(), null);
});

test('opportunity contact controls render only for new opportunities', async () => {
  const source = read('../src/components/opportunities/OpportunityEditor.jsx').replace(/^import .*;\n/gm, '').replace('export function OpportunityEditor', 'function OpportunityEditor').replace('export default function NewOpportunityModal', 'function NewOpportunityModal');
  const compiled = await transform(source, { loader: 'jsx', jsxFactory: 'h', jsxFragment: 'Fragment' });
  const context = vm.createContext({
    h: (type, props, ...children) => ({ type, props, children }), Fragment: 'fragment',
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: () => ({}), useMemo: fn => fn(), useEffect() {},
    useContactsList: () => ({ contacts: [] }), useContactMutations: () => ({}),
    contactDisplayName: row => row.name, opportunityFields: row => row, LINES_OF_BUSINESS: ['MA'],
  });
  vm.runInContext(compiled.code + '\nglobalThis.render = OpportunityEditor;', context);
  const data = { pipelines: [], stages: [], agents: [], sources: [] };
  const fresh = JSON.stringify(context.render({ data }));
  const existing = JSON.stringify(context.render({ data, existing: { id: 'opp', contact_id: 'contact', contact_name: 'Client' } }));
  assert.match(fresh, /Existing contact/);
  assert.match(fresh, /Create contact/);
  assert.match(fresh, /SEARCH CONTACTS BY NAME/);
  assert.doesNotMatch(existing, /Existing contact|Create contact|SEARCH CONTACTS BY NAME/);
  assert.match(existing, /TITLE/);
});

test('080 removes full former name in structured knowledge and RTS while preserving generic Medigap; rerun is safe', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE carrier_rts (channel text);
      CREATE TABLE knowledge_base (title text, content text, key text, category text, metadata jsonb, source_urls text[], updated_at timestamptz);
      INSERT INTO carrier_rts VALUES ('SMS/Medigap Life'), ('Savoy/RPS');
      INSERT INTO knowledge_base VALUES ('Medigap rules', 'Medigap Life and generic Medigap', 'rules', 'medsup', '{"nested":["Medigap Life", "Medigap"]}', ARRAY['https://medigaplife.example', 'https://medicare.gov/medigap'], now());`);
    const sql = read('../supabase/migrations/080_cleanup_former_upline.sql');
    await db.exec(sql);
    await db.exec(sql);
    const kb = (await db.query('SELECT * FROM knowledge_base')).rows[0];
    assert.equal(kb.title, 'Medigap rules');
    assert.equal(kb.content, ' and generic Medigap');
    assert.deepEqual(kb.metadata, { nested: ['', 'Medigap'] });
    assert.deepEqual(kb.source_urls, ['https://medicare.gov/medigap']);
    assert.deepEqual((await db.query('SELECT channel FROM carrier_rts ORDER BY channel')).rows.map(r => r.channel), ['SMS', 'Savoy/RPS']);
  } finally { await db.close(); }
});

test('RTS empty roster shows loading/unavailable and never fabricates names or NPNs', async () => {
  const source = read('../src/components/RTSTab.jsx').replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm, '').replace('export default function RTSTab', 'function RTSTab');
  const compiled = await transform(source, { loader: 'jsx', jsxFactory: 'h', jsxFragment: 'Fragment' });
  let loading = true;
  const context = vm.createContext({
    h: (type, props, ...children) => ({ type, props, children }), Fragment: 'fragment',
    useState: initial => [initial, () => {}], useEffect() {}, useMemo: fn => fn(), useCallback: fn => fn,
    useUser: () => ({}), useTenantConfig: () => ({ agents: [], loading }), supabase: {}, resolveAgentId: () => null,
    RTSIngestionPanel: 'ingestion', Search: 'search', Check: 'check', LockKeyhole: 'lock', ChevronRight: 'right', ChevronDown: 'down',
  });
  vm.runInContext(compiled.code + '\nglobalThis.render = RTSTab;', context);
  let tree = JSON.stringify(context.render());
  assert.match(tree, /Loading agent roster/);
  assert.doesNotMatch(tree, /Mike|Mark|20574678|20856361/);
  loading = false;
  tree = JSON.stringify(context.render());
  assert.match(tree, /Agent roster unavailable/);
  assert.doesNotMatch(tree, /Mike|Mark|20574678|20856361/);
});

test('agent track failure keeps the dot offline even when the browser microphone reports activity', async () => {
  const source = read('../src/components/CenterTimerBar.jsx').replace(/^import .*;\n/gm, '').replace('export default CenterTimerBar;', 'globalThis.render = CenterTimerBar;');
  const compiled = await transform(source, { loader: 'jsx', jsxFactory: 'h' });
  const context = vm.createContext({ h: (type, props, ...children) => ({ type, props, children }), memo: fn => fn,
    useAudioLevels: () => ({ agentLevel: 0.8, customerLevel: 0 }), Waveform: 'waveform', MonitorUp: 'icon' });
  vm.runInContext(compiled.code, context);
  const render = props => context.render(props).children[2].children[0].children[1].props.className;
  assert.equal(render({ agentTrackHealthy: false, agentActive: true }), 'eg-audio-meter-dot');
  assert.equal(render({ agentTrackHealthy: true }), 'eg-audio-meter-dot is-live');
  assert.equal(render({ agentActive: true }), 'eg-audio-meter-dot is-live');
});
