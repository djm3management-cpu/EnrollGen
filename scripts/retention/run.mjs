import pg from 'pg';
import {pathToFileURL} from 'node:url';
import {runRetention} from './job.js';
export function retentionArguments(args) {
  const result={deleteRequested:false,batchSize:100,maxBatches:10};
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--delete')result.deleteRequested=true;
    else if(['--connection','--batch-size','--max-batches'].includes(arg)) {
      const value=args[++i];if(!value)throw Error('Missing retention argument');
      if(arg==='--connection')result.connectionString=value;
      else result[arg==='--batch-size'?'batchSize':'maxBatches']=Number(value);
    }else throw Error('Unknown retention argument');
  }
  const url=new URL(result.connectionString);
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.search||url.hash)throw Error('Explicit localhost connection required');
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  let db;
  try {
    const options=retentionArguments(process.argv.slice(2));
    db=new pg.Client({connectionString:options.connectionString,connectionTimeoutMillis:5000});await db.connect();
    await db.query('SET ROLE service_role');
    console.log(JSON.stringify(await runRetention({db,...options})));
  } catch {console.error('Retention refused or failed; inspect count-only retention_runs locally');process.exitCode=1;}
  finally{if(db)await db.end();}
}
