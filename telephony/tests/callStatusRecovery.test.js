import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { startCallStatusRecoveryWorker, verifiedTerminalCallStatuses } from '../src/callStatusRecovery.js';

const migrationUrl = new URL('../../supabase/migrations/069_call_status_recovery.sql', import.meta.url);
const terminal = [...verifiedTerminalCallStatuses];

async function database() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE inbound_calls (
      twilio_call_sid text PRIMARY KEY, status text NOT NULL
        CHECK (status IN ('ringing','accepted','declined','voicemail','completed','failed','rejected')),
      answered_at timestamptz, ended_at timestamptz, duration_seconds integer
    );
    CREATE TABLE agent_availability (
      agent_id text PRIMARY KEY, status text NOT NULL, available boolean NOT NULL,
      active_call_sid text, resume_status text, last_assigned_at timestamptz,
      toggled_at timestamptz
    );`);
  await db.exec(await readFile(migrationUrl, 'utf8'));
  return db;
}

test('finish_inbound_call persists every provider terminal outcome under the live constraint', async () => {
  const db = await database();
  try {
    for (const status of terminal) {
      await db.query('INSERT INTO inbound_calls(twilio_call_sid,status) VALUES($1,$2)', [`CA_${status}`, 'ringing']);
      await db.query('SELECT finish_inbound_call($1,$2,now(),12)', [`CA_${status}`, status]);
      const result = await db.query('SELECT status FROM inbound_calls WHERE twilio_call_sid=$1', [`CA_${status}`]);
      assert.equal(result.rows[0].status, status === 'completed' ? 'no-answer' : status);
    }
    await db.query("INSERT INTO inbound_calls(twilio_call_sid,status) VALUES('CA_voicemail','voicemail')");
    await db.query("SELECT finish_inbound_call('CA_voicemail','completed',now(),12)");
    assert.equal((await db.query("SELECT status FROM inbound_calls WHERE twilio_call_sid='CA_voicemail'")).rows[0].status, 'voicemail');
    await assert.rejects(db.query("SELECT finish_inbound_call('CA_bad','mystery',now(),12)"), /Unsupported terminal call status/);
  } finally { await db.close(); }
});

test('verified stale release restores availability, enforces two-minute age, and will not free a newer SID', async () => {
  const db = await database();
  try {
    for (const status of terminal) {
      await db.query(`INSERT INTO agent_availability(agent_id,status,available,active_call_sid,resume_status,last_assigned_at)
        VALUES($1,'busy',false,$2,'available',now()-interval '3 minutes')`, [`agent_${status}`, `CA_${status}`]);
      const { rows } = await db.query(`SELECT release_verified_stale_call_agent($1,$2,$3,'AC_verified',$2) AS released`,
        [`agent_${status}`, `CA_${status}`, status]);
      assert.equal(rows[0].released, true);
    }
    await db.query(`INSERT INTO agent_availability(agent_id,status,available,active_call_sid,resume_status,last_assigned_at)
      VALUES('newer','busy',false,'CA_new','available',now())`);
    const recent = await db.query(`SELECT release_verified_stale_call_agent('newer','CA_new','completed','AC_verified','CA_new') AS released`);
    assert.equal(recent.rows[0].released, false);
    await db.query(`UPDATE agent_availability SET active_call_sid='CA_newer',last_assigned_at=now()-interval '3 minutes'
      WHERE agent_id='newer'`);
    const stale = await db.query(`SELECT release_verified_stale_call_agent('newer','CA_old','completed','AC_verified','CA_old') AS released`);
    assert.equal(stale.rows[0].released, false);
    const row = await db.query("SELECT active_call_sid,status FROM agent_availability WHERE agent_id='newer'");
    assert.deepEqual(row.rows[0], { active_call_sid: 'CA_newer', status: 'busy' });
    await assert.rejects(db.query(`SELECT release_verified_stale_call_agent('newer','CA_newer','in-progress','AC_verified','CA_newer')`), /Invalid verified call recovery evidence/);
  } finally { await db.close(); }
});

test('watchdog releases only exact-account, exact-SID Twilio terminal results', async () => {
  const config = { twilioAccountSid: 'AC_expected', twilioAuthToken: 'unused' };
  const reservations = [
    { agent_id: 'done', active_call_sid: 'CA_done', last_assigned_at: '2026-10-03T10:00:00Z' },
    { agent_id: 'active', active_call_sid: 'CA_active', last_assigned_at: '2026-10-03T10:00:00Z' },
    { agent_id: 'bad-account', active_call_sid: 'CA_bad', last_assigned_at: '2026-10-03T10:00:00Z' },
    { agent_id: 'unavailable', active_call_sid: 'CA_unavailable', last_assigned_at: '2026-10-03T10:00:00Z' },
  ];
  const releases = [];
  const db = {
    from(table) {
      assert.equal(table, 'agent_availability');
    const query = { select() { return this; }, not() { return this; }, lt() { return this; },
        limit() { return Promise.resolve({ data: reservations, error: null }); } };
      return query;
    },
    async rpc(name, args) { releases.push({ name, args }); return { error: null }; },
  };
  let scheduledMs;
  const worker = startCallStatusRecoveryWorker({
    db, config, now: () => Date.parse('2026-10-03T10:03:00Z'), interval: (_fn, ms) => { scheduledMs = ms; return { unref() {} }; },
    fetchCall: async sid => {
      if (sid === 'CA_active') return { sid, accountSid: config.twilioAccountSid, status: 'in-progress' };
      if (sid === 'CA_bad') return { sid, accountSid: 'AC_other', status: 'completed' };
      if (sid === 'CA_unavailable') throw new Error('Twilio unavailable');
      return { sid, accountSid: config.twilioAccountSid, status: 'completed' };
    },
  });
  await worker.tick();
  assert.equal(scheduledMs, 60_000);
  assert.equal(releases.length, 1);
  assert.deepEqual(releases[0], { name: 'release_verified_stale_call_agent', args: {
    p_agent_id: 'done', p_call_sid: 'CA_done', p_twilio_status: 'completed',
    p_verified_account_sid: 'AC_expected', p_verified_call_sid: 'CA_done',
  } });
  worker.stop();
});
