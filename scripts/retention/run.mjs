import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {recordingObjectStore} from './recordingDeletion.js';
import {createLogger} from '../../telephony/src/lib/logger.js';
const logger=createLogger();
import pg from 'pg';
import {pathToFileURL} from 'node:url';
import {runRetention} from './job.js';
export function retentionArguments(args) {
  const result={deleteRequested:false,batchSize:100,maxBatches:10};
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--delete')result.deleteRequested=true;
    else if(['--connection','--batch-size','--max-batches','--storage-url','--storage-key-file'].includes(arg)) {
      const value=args[++i];if(!value)throw Error('Missing retention argument');
      if(arg==='--connection')result.connectionString=value;
      else if(arg==='--storage-url')result.storageUrl=value;
      else if(arg==='--storage-key-file')result.storageKeyFile=value;
      else result[arg==='--batch-size'?'batchSize':'maxBatches']=Number(value);
    }else throw Error('Unknown retention argument');
  }
  const url=new URL(result.connectionString);
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.search||url.hash)throw Error('Explicit localhost connection required');
  if(Boolean(result.storageUrl)!==Boolean(result.storageKeyFile))throw Error('Both storage arguments required');
  if(result.storageUrl){const storage=new URL(result.storageUrl);if(!['http:','https:'].includes(storage.protocol)||!['localhost','127.0.0.1','[::1]'].includes(storage.hostname)||storage.username||storage.password||storage.search||storage.hash||storage.pathname!=='/')throw Error('Explicit localhost storage required');}
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  let db;
  try {
    const options=retentionArguments(process.argv.slice(2));
    db=new pg.Client({connectionString:options.connectionString,connectionTimeoutMillis:5000});await db.connect();
    await db.query('SET ROLE service_role');
    const storage=options.storageUrl?recordingObjectStore(createClient(options.storageUrl,readFileSync(options.storageKeyFile,'utf8').trim(),{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(15000)})}})):undefined;
    const result=await runRetention({db,...options,storage});logger.info('retention_completed',{success:true,count:Object.values(result.deleted).reduce((a,b)=>a+b,0)});
  } catch {logger.error('retention_failed',{code:'invalid_input'});process.exitCode=1;}
  finally{if(db)try{await db.end();}catch{logger.error('retention_failed',{code:'database_unavailable'});process.exitCode=1;}}
}
