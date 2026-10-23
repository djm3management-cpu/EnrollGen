import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createSupabaseAdminClient } from '../sep-data/common.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HELP = `Inspect a failed call without changing it (default):
  node --env-file=.env.local scripts/post-call/retry-failed-scoring.mjs --call-id <uuid> --tenant-id <uuid>

Queue one audited batch of at most three deliveries after fixing the cause:
  Add --execute --request-id <new-uuid> --operator <name> --reason <explanation>
  Reuse the same request ID when repeating a command after a transport error.

Requires migrations 113 and 114. Does not send sales/webhooks or change evidence.
Active workers, completed calls and exhausted input-token budgets are not reset.`;

export async function retryFailedScoring(argv, { getDb = createSupabaseAdminClient, log = console.log } = {}) {
  const { values } = parseArgs({ args: argv, options: {
    'call-id': { type: 'string' }, 'tenant-id': { type: 'string' },
    'request-id': { type: 'string' }, operator: { type: 'string' }, reason: { type: 'string' },
    execute: { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
  }});
  if (values.help) { log(HELP); return; }
  for (const name of ['call-id', 'tenant-id']) {
    if (!UUID.test(values[name] || '')) throw new Error(`--${name} must be a UUID`);
  }
  if (values['request-id'] && !UUID.test(values['request-id'])) throw new Error('--request-id must be a UUID');
  if (values.execute && (!UUID.test(values['request-id'] || '') || !values.operator?.trim() || !values.reason?.trim())) {
    throw new Error('--execute requires --request-id, --operator and --reason');
  }
  if ((values.operator?.length || 0) > 200 || (values.reason?.length || 0) > 500) {
    throw new Error('Operator/reason exceed 200/500 characters');
  }
  const db = await getDb();
  const { data, error } = await db.rpc('retry_failed_scoring', {
    p_call_id: values['call-id'], p_tenant_id: values['tenant-id'],
    p_request_id: values['request-id'] || null, p_requested_by: values.operator || '',
    p_reason: values.reason || '', p_execute: values.execute,
  });
  if (error) throw new Error(`Scoring retry refused: ${error.message || error.code || 'database error'}`);
  const result = { dry_run: !values.execute, ...data };
  log(JSON.stringify(result));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  retryFailedScoring(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
