// Pure mapping functions of the live-to-fresh migration. Synthetic values only.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../scripts/migration/live-to-fresh/lib/transforms.js';
import { parseLossless, stringifyLossless } from '../../scripts/migration/live-to-fresh/lib/json.js';
import { assertLocalConnection, parseArgs } from '../../scripts/migration/live-to-fresh/lib/args.js';
import { ghlAllowlistFrom } from '../../scripts/migration/live-to-fresh/lib/plan.js';
import { topoOrder } from '../../scripts/migration/live-to-fresh/lib/catalog.js';

test('sms activities map to note and record the original type; unknown types reject', () => {
  const sms = T.mapContactActivity({ id: 'x', type: 'sms' });
  assert.equal(sms.row.type, 'note');
  assert.deepEqual(sms.transform, [{ kind: 'type_mapped', detail: { from: 'sms', to: 'note' } }]);
  assert.equal(T.mapContactActivity({ type: 'call' }).row.type, 'call');
  assert.equal(T.mapContactActivity({ type: 'fax' }).reject, 'invalid_enum:contact_activities.type');
});

test('section_scores notes JSON becomes NEW columns; score fields are dropped', () => {
  const out = T.mapSectionScore({ id: 'a', section_label: 'Intro', score: null, max_score: null, notes: '{"section_number":2.5,"completed":true,"duration_seconds":41}' });
  assert.equal(out.row.section_number, 2.5);
  assert.equal(out.row.completed, true);
  assert.equal(out.row.duration_seconds, 41);
  assert.ok(!('notes' in out.row) && !('score' in out.row) && !('max_score' in out.row));
  assert.equal(T.mapSectionScore({ notes: 'not json' }).reject, 'missing_required:section_scores.section_number');
  assert.equal(T.mapSectionScore({ notes: '{"completed":true}' }).reject, 'missing_required:section_scores.section_number');
});

test('Google Drive key parameter is stripped without returning the key', () => {
  const url = 'https://www.googleapis.com/drive/v3/files/FILEID?alt=media&key=SYNTHETICKEY123';
  const out = T.mapCallRecord({ recording_url: url });
  assert.equal(out.row.recording_url, 'https://www.googleapis.com/drive/v3/files/FILEID?alt=media');
  assert.ok(!JSON.stringify(out).includes('SYNTHETICKEY123'));
  assert.deepEqual(out.transform[0], { kind: 'credential_param_stripped', detail: { column: 'recording_url', param: 'key' } });
  assert.deepEqual(T.mapCallRecord({ recording_url: 'https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1' }).transform, []);
  assert.equal(T.mapCallRecord({ recording_url: null }).row.recording_url, null);
});

test('signed storage URLs are removed; other media URLs are kept', () => {
  assert.equal(T.mapMessageMedia({ media_url: 'https://proj.supabase.co/storage/v1/object/sign/message-media/a.gif?token=abc' }).row.media_url, null);
  assert.equal(T.mapMessageMedia({ media_url: 'https://api.twilio.com/media/ME1' }).row.media_url, 'https://api.twilio.com/media/ME1');
});

test('tenant webhook URL is never carried; stale leases are cleared; messages get a body', () => {
  const t = T.mapTenant({ id: 't', ghl_webhook_url: 'https://hooks.example/capability' });
  assert.equal(t.row.ghl_webhook_url, null);
  assert.ok(!JSON.stringify(t).includes('capability'));
  const d = T.mapIntegrationDelivery({ id: 'd', lease_token: 'tok', lease_until: '2026-01-01T00:00:00Z' });
  assert.equal(d.row.lease_token, null); assert.equal(d.row.lease_until, null);
  assert.equal(T.mapMessage({ body: null }).row.body, '');
});

test('non-roster enrolled agents are deactivated', () => {
  const ctx = { rosterClerkIds: new Set(['user_roster']) };
  assert.equal(T.mapEnrolledAgent({ clerk_user_id: 'user_roster', is_active: true }, ctx).row.is_active, true);
  assert.equal(T.mapEnrolledAgent({ clerk_user_id: 'user_former', is_active: true }, ctx).row.is_active, false);
});

test('remapColumns maps ids and rejects unmapped references', () => {
  const maps = { intent_id: new Map([['old-1', 'new-1']]) };
  assert.equal(T.remapColumns({ intent_id: 'old-1' }, maps).row.intent_id, 'new-1');
  assert.equal(T.remapColumns({ intent_id: null }, maps).row.intent_id, null);
  assert.equal(T.remapColumns({ intent_id: 'old-2' }, maps).reject, 'unmapped_reference:intent_id');
});

test('lossless JSON keeps numeric text exactly', () => {
  const s = '{"big":12345678901234567890,"dec":0.30000000000000004,"n":-1.5e-7}';
  assert.equal(stringifyLossless(parseLossless(s)), s);
});

test('CSV export escapes and serializes values', () => {
  assert.equal(T.toCsv(['a', 'b'], [{ a: 'x,y', b: { k: 1 } }, { a: null, b: 'q"r' }]), 'a,b\n"x,y","{""k"":1}"\n,"q""r"\n');
});

test('staffed hours fill disabled days with valid times', () => {
  const h = T.profileStaffedHours({ timezone: 'America/New_York', days: { mon: { enabled: true, start: '08:00', end: '18:00' }, sat: { enabled: false } } });
  assert.deepEqual(h.mon, { enabled: true, start: '08:00', end: '18:00' });
  assert.deepEqual(h.sat, { enabled: false, start: '09:00', end: '17:00' });
  assert.equal(Object.keys(h).length, 7);
});

test('connection guard refuses anything but localhost', () => {
  assert.doesNotThrow(() => assertLocalConnection('postgresql://u:p@127.0.0.1:5432/db', 'old'));
  assert.doesNotThrow(() => assertLocalConnection('postgres://u@localhost/db', 'old'));
  assert.throws(() => assertLocalConnection('postgresql://u:p@db.remote.example:5432/db', 'old'), /localhost/);
  assert.throws(() => assertLocalConnection('postgresql://u@127.0.0.1/db?host=remote.example', 'old'), /override/);
  assert.throws(() => assertLocalConnection('https://127.0.0.1/db', 'old'), /postgresql/);
  assert.throws(() => parseArgs(['--old', 'postgresql://u@127.0.0.1/a', '--new', 'postgresql://u@10.0.0.5/b']), /localhost/);
  assert.throws(() => parseArgs(['--old', 'postgresql://u@127.0.0.1/a', '--new', 'postgresql://u@127.0.0.1/b', '--dry-run', '--verify']), /exclusive/);
  assert.equal(parseArgs(['--old', 'postgresql://u@127.0.0.1/a', '--new', 'postgresql://u@127.0.0.1/b', '--table', 'contacts']).table, 'contacts');
});

test('GHL allowlist is read from the NEW routine source', () => {
  const src = `SELECT x FROM jsonb_each(payload) WHERE key = ANY(ARRAY[\n'planType','zip',\n 'firstName']::text[]);`;
  assert.deepEqual(ghlAllowlistFrom(src), ['planType', 'zip', 'firstName']);
  assert.throws(() => ghlAllowlistFrom('nothing'), /allowlist/);
});

test('topological order puts parents first and tolerates cycles', () => {
  const fks = [{ child: 'b', parent: 'a', parentSchema: 'public' }, { child: 'c', parent: 'b', parentSchema: 'public' }, { child: 'a', parent: 'c', parentSchema: 'public' }, { child: 'b', parent: 'b', parentSchema: 'public' }];
  const order = topoOrder(['c', 'b', 'a', 'd'], fks.slice(0, 2));
  assert.ok(order.indexOf('a') < order.indexOf('b') && order.indexOf('b') < order.indexOf('c'));
  assert.equal(topoOrder(['a', 'b', 'c'], fks).length, 3);
});
