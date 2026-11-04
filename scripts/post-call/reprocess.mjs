// node --env-file=.env.local scripts/post-call/reprocess.mjs --call-id UUID [--execute]
// Or --from 2026-11-04T00:00:00Z --to 2026-11-05T00:00:00Z
// CLERK_ADMIN_TOKEN must be a fresh administrator bearer token. Preview is default.
import {createSupabaseAdminClient} from '../sep-data/common.js';
const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
const db=await createSupabaseAdminClient();let query=db.from('call_records').select('id,session_id,post_call_status,call_start');
if(args.includes('--call-id'))query=query.eq('id',value('--call-id'));
else {
 const from=value('--from'),to=value('--to');
 if(!args.includes('--from')||!args.includes('--to')||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||Date.parse(to)<=Date.parse(from))throw new Error('Provide --call-id or a valid --from/--to range.');
 query=query.eq('post_call_status','failed').gte('call_start',from).lt('call_start',to);
}
const {data,error}=await query.order('id').limit(1000);if(error)throw error;
if(data.length===1000)throw new Error('Narrow the date range to fewer than 1000 calls.');
for(const record of data){
 if(!args.includes('--execute')){console.log(JSON.stringify(record));continue;}
 if(!process.env.CLERK_ADMIN_TOKEN)throw new Error('CLERK_ADMIN_TOKEN is required for execution.');
 const response=await fetch(`${process.env.POST_CALL_APP_URL || 'https://enrollgen.com'}/api/post-call-admin?call_record_id=${record.id}`,{method:'POST',headers:{Authorization:`Bearer ${process.env.CLERK_ADMIN_TOKEN}`},signal:AbortSignal.timeout(30000)});
 const result=await response.json();console.log(JSON.stringify({call_id:record.id,http_status:response.status,...result}));
 if(!response.ok)process.exitCode=1;
}
