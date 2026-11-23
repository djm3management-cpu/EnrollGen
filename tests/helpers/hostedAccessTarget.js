// Opt-in hosted target for the P0-2 database access matrix (hosted rehearsal).
// Selected only by ACCESS_MATRIX_TARGET=hosted. The connection is validated by the
// same single-project remote guard as the migration tools: verify-full TLS with the
// project CA, password only through PGPASSWORD, production always refused.
// Everything a test does runs inside ONE transaction that is rolled back on close;
// each statement runs in its own savepoint so expected permission errors behave as
// they do in PGlite. Transaction control from a test is refused, so nothing can commit.
import pg from 'pg';
import {assertDatabaseTarget} from '../../scripts/lib/remote-target.js';
import {statements} from '../../scripts/lib/bootstrap-sql.js';

const CONTROL=/^(BEGIN|COMMIT|END|ROLLBACK|ABORT|START\s+TRANSACTION|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION)\b/i;

export function hostedTargetFromEnv(env=process.env){
 const {ACCESS_MATRIX_DB_URL:url,ACCESS_MATRIX_REMOTE_HOST:host,ACCESS_MATRIX_REMOTE_REF:ref}=env;
 if(!url||!host||!ref)throw Error('Hosted access matrix needs ACCESS_MATRIX_DB_URL, ACCESS_MATRIX_REMOTE_HOST and ACCESS_MATRIX_REMOTE_REF');
 return assertDatabaseTarget(url,'access-matrix',{host,ref});
}

export async function hostedAccessDatabase(env=process.env){
 const client=new pg.Client({connectionString:hostedTargetFromEnv(env),application_name:'enrollgen-access-matrix',connectionTimeoutMillis:15000});
 await client.connect();
 await client.query('SET log_min_error_statement = panic');
 await client.query('BEGIN');
 let n=0,closed=false,queue=Promise.resolve();
 // One connection: serialize calls (PGlite does) so concurrent callers such as
 // Promise.all in a handler cannot interleave savepoints.
 const guarded=(sql,run)=>{const next=queue.then(()=>step(sql,run));queue=next.catch(()=>{});return next;};
 const step=async(sql,run)=>{
  if(closed)throw Error('Hosted access target is closed');
  for(const s of statements(sql))if(CONTROL.test(s.trim()))throw Error('Transaction control is not allowed against the hosted access target');
  const sp='access_'+(++n);
  await client.query('SAVEPOINT '+sp);
  try{const r=await run();await client.query('RELEASE SAVEPOINT '+sp);return r;}
  catch(e){await client.query('ROLLBACK TO SAVEPOINT '+sp);await client.query('RELEASE SAVEPOINT '+sp);throw e;}
 };
 const shape=r=>({rows:r.rows||[],fields:r.fields||[],affectedRows:r.rowCount??0});
 return {
  hosted:true,
  query:(sql,params=[])=>guarded(sql,async()=>shape(await client.query(sql,params))),
  exec:sql=>guarded(sql,async()=>{const r=await client.query(sql);return (Array.isArray(r)?r:[r]).map(shape);}),
  async close(){if(closed)return;closed=true;try{await client.query('ROLLBACK');}finally{await client.end();}},
 };
}
