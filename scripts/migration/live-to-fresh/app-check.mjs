#!/usr/bin/env node
// Post-migration application check against a local NEW stack, using the app's
// own server code paths (no browser sign-in). Prints counts, ids and booleans.
//
//   DEPLOYMENT_PROFILE_JSON=... SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=... \
//   node scripts/migration/live-to-fresh/app-check.mjs --old <url> --new <url>
import pg from 'pg';
import { parseArgs } from './lib/args.js';

const opts = parseArgs(process.argv.slice(2));
const apiUrl = new URL(process.env.SUPABASE_URL || '');
if (!['127.0.0.1', 'localhost'].includes(apiUrl.hostname)) throw Error('SUPABASE_URL must be the local stack');
const { createSupabaseClient, supabaseSecretKey } = await import('../../../integrations/supabase.js');
const { verifyDeploymentConfiguration, rosterIdentity } = await import('../../../telephony/src/lib/deploymentRoster.js');

const oldDb = new pg.Client({ connectionString: opts.old }); await oldDb.connect();
const newDb = new pg.Client({ connectionString: opts.new, options: '-c default_transaction_read_only=on' }); await newDb.connect();
const api = createSupabaseClient(process.env.SUPABASE_URL, supabaseSecretKey());
const results = {};
const count = async (db, sql, params = []) => Number((await db.query(sql, params)).rows[0].count);
const apiCount = async (table) => { const { count: n, error } = await api.from(table).select('*', { count: 'exact', head: true }); if (error) throw Error(`API count failed for ${table}`); return n; };

// 1. Telephony/worker startup check: profile mirror equals service profile, roster valid.
const roster = await verifyDeploymentConfiguration(api);
results.startupCheck = { ok: true, activeRoster: roster.length };

// 2. Each OLD active agent resolves by Clerk ID to the same roster entry (app and SQL resolver).
const org = (await oldDb.query(`SELECT clerk_org_id FROM public.tenants`)).rows[0].clerk_org_id;
results.agents = [];
for (const a of (await oldDb.query(`SELECT id::text, clerk_user_id FROM public.tenant_agents WHERE is_active AND clerk_user_id IS NOT NULL ORDER BY created_at`)).rows) {
  const app = rosterIdentity({ id: a.clerk_user_id }, roster);
  const sql = (await newDb.query(`SELECT roster_id::text, agent_id::text FROM public.resolve_deployment_subject($1, $2)`, [a.clerk_user_id, org])).rows;
  const enrolled = (await oldDb.query(`SELECT id::text FROM public.enrolled_agents WHERE clerk_user_id=$1`, [a.clerk_user_id])).rows[0]?.id;
  results.agents.push({ rosterId: a.id, appResolves: app?.id === a.id, sqlResolves: sql.length === 1 && sql[0].roster_id === a.id, enrolledIdPreserved: sql[0]?.agent_id === enrolled });
}

// 3. CRM contacts and Calls: NEW (through the API) equals OLD.
results.counts = {
  contacts: { old: await count(oldDb, 'SELECT count(*) FROM public.contacts'), new: await apiCount('contacts') },
  call_records: { old: await count(oldDb, 'SELECT count(*) FROM public.call_records'), new: await apiCount('call_records') },
  v_call_log: { old: await count(oldDb, 'SELECT count(*) FROM public.v_call_log'), new: await count(newDb, 'SELECT count(*) FROM public.v_call_log') },
};

// 4. One migrated call opens with its transcript and score.
const pick = (await oldDb.query(`SELECT c.id::text FROM public.call_records c JOIN public.call_transcripts t ON t.id=c.transcript_id
  JOIN public.compliance_scorecards s ON s.id=c.compliance_scorecard_id ORDER BY c.id LIMIT 1`)).rows[0];
if (pick) {
  const { data: call, error } = await api.from('call_records').select('id,transcript_id,compliance_scorecard_id,twilio_call_sid').eq('id', pick.id).single();
  if (error) throw Error('API call read failed');
  const { data: tr } = await api.from('call_transcripts').select('id,transcript_text').eq('id', call.transcript_id).single();
  const { data: sc } = await api.from('compliance_scorecards').select('id,template_id').eq('id', call.compliance_scorecard_id).single();
  const { count: items } = await api.from('scorecard_items').select('id', { count: 'exact', head: true }).eq('scorecard_id', sc.id);
  const oldItems = await count(oldDb, `SELECT count(*) FROM public.scorecard_items WHERE scorecard_id=$1::uuid`, [sc.id]);
  const tpl = await count(newDb, `SELECT count(*) FROM public.scoring_templates WHERE id=$1::uuid`, [sc.template_id]);
  results.call = { callId: call.id, hasTwilioSid: !!call.twilio_call_sid, transcriptChars: tr?.transcript_text?.length ?? 0, scorecardId: sc.id, scorecardItems: items, oldScorecardItems: oldItems, templateExists: tpl === 1 };
}
console.log(JSON.stringify(results, null, 2));
await oldDb.end(); await newDb.end();
