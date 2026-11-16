import {recoveryAdminAction} from '../../telephony/src/lib/adminActions.js';
import pg from 'pg';
import {spawnSync} from 'node:child_process';
import {openSync,closeSync,unlinkSync,statSync} from 'node:fs';
import {createLogger} from '../../telephony/src/lib/logger.js';
const logger=createLogger();
export function recoveryArguments(args,mode){
 const result={};
 for(let i=0;i<args.length;i+=2){const key=args[i];if(!['--connection','--file'].includes(key)||!args[i+1]||result[key.slice(2)])throw Error('Explicit recovery arguments required');result[key.slice(2)]=args[i+1];}
 if(!result.connection||!result.file)throw Error('Explicit recovery arguments required');
 const url=new URL(result.connection);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.search||url.hash||url.pathname.length<2)throw Error('Explicit local connection required');
 if(!/^[a-z0-9_][a-z0-9_$-]{0,62}$/i.test(decodeURIComponent(url.pathname.slice(1)))||result.file.startsWith('-'))throw Error('Explicit local database and archive required');
 return {...result,mode,url};
}
export async function requireEmptyDatabase(db,{applicationOnly=true}={}){
 const scope=applicationOnly?"s.nspname IN ('public','pii_vault','oct_slim_086_rollback','oct_slim_088_rollback')":"s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema'";
 const {rows:[{n}]}=await db.query(`SELECT count(*)::int n FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace WHERE ${scope} AND c.relkind IN ('r','p','v','m','S')`);
 if(n)throw Error('Restore target must be empty');
}
export async function nativeRecovery(mode,args,{Client=pg.Client,spawn=spawnSync}={}){
 let db,created=false,options;
 try{
  options=recoveryArguments(args,mode);const {url,file}=options;
  db=new Client({connectionString:options.connection,connectionTimeoutMillis:5000});await db.connect();
  if(mode==='restore')await requireEmptyDatabase(db,{applicationOnly:false});
  if(mode==='backup'){const fd=openSync(file,'wx',0o600);closeSync(fd);created=true;}
  // No inherited real credentials/config. Never forward child stdout/stderr.
  const env={PATH:process.env.PATH,PGHOST:url.hostname.replace(/^\[|\]$/g,''),PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGCONNECT_TIMEOUT:'5'};
  const result=spawn(mode==='backup'?'pg_dump':'pg_restore',mode==='backup'?['--format=custom','--file',file]:['--exit-on-error','--single-transaction','--dbname',env.PGDATABASE,file],{env,stdio:'pipe',timeout:300000,maxBuffer:1024*1024});
  if(result.status!==0)throw Error('Recovery command failed');
  await db.query('SET ROLE service_role');
  await recoveryAdminAction({rpc:async(_name,input)=>{try{const r=await db.query('SELECT record_recovery_action($1,$2,$3,$4,$5,$6) id',Object.values(input));return {data:r.rows[0].id};}catch(error){return {error};}}},{action:mode==='backup'?'recovery_backup':'recovery_restore'});
  logger.info('recovery_completed',{success:true,count:statSync(file).size});return true;
 }catch{if(created)try{unlinkSync(options.file);}catch{/* No path or filesystem diagnostic escapes the logger. */}logger.error('recovery_failed',{code:'recovery_failed'});return false;}
 finally{if(db)try{await db.end();}catch{logger.error('recovery_failed',{code:'database_unavailable'});}}
}
