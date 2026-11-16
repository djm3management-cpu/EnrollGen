import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {recoveryArguments} from './native.js';
import {createLogger} from '../../telephony/src/lib/logger.js';
export function storageConsistency(rows,objects){
 if(!Array.isArray(objects)||objects.some(o=>typeof o!=='string'))throw Error('Object inventory must be an array of paths');
 const known=new Set(objects),referenced=new Set(rows.map(r=>r.storage_path).filter(Boolean));
 return {missing:rows.filter(r=>r.storage_path&&!known.has(r.storage_path)).map(r=>r.id),orphans:[...known].filter(path=>!referenced.has(path))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const logger=createLogger();let db;
 try{
  const args=process.argv.slice(2),at=args.indexOf('--objects');if(at<0||!args[at+1])throw Error('Explicit inventory required');
  const objects=JSON.parse(readFileSync(args[at+1],'utf8'));args.splice(at,2);
  const {connection,file}=recoveryArguments(args,'check');db=new pg.Client({connectionString:connection,connectionTimeoutMillis:5000});await db.connect();
  await db.query('BEGIN READ ONLY');
  const rows=(await db.query("SELECT id::text,storage_path FROM recording_ingestion WHERE storage_path IS NOT NULL UNION ALL SELECT id::text,recording_storage_path FROM call_records WHERE recording_storage_path IS NOT NULL UNION ALL SELECT id::text,recording_storage_path FROM inbound_calls WHERE recording_storage_path IS NOT NULL")).rows;
  const report=storageConsistency(rows,objects);await db.query('ROLLBACK');
  writeFileSync(file,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
  logger.info('storage_consistency_completed',{count:report.missing.length,depth:report.orphans.length});
 }catch{logger.error('storage_consistency_failed',{code:'invalid_input'});process.exitCode=1;}finally{if(db)try{await db.end();}catch{logger.error('storage_consistency_failed',{code:'database_unavailable'});process.exitCode=1;}}
}
