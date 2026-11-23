import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {statements} from './lib/bootstrap-sql.js';
import {explicitConnection} from './check-database-drift.mjs';
import {takeRemoteFlags,assertDatabaseTarget,refuseProduction} from './lib/remote-target.js';
const root=new URL('../supabase/bootstrap/',import.meta.url);
export function bootstrapEntries(){
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',root)));
 return manifest.entries.map(entry=>{
  const sql=readFileSync(new URL(entry.file,root),'utf8');
  if(createHash('sha256').update(sql).digest('hex')!==entry.sha256)throw Error('Bootstrap checksum mismatch: '+entry.file);
  return {...entry,sql};
 });
}
export async function applyBootstrap(client,{platformStandins=false}={}){
 for(const entry of bootstrapEntries()){
  let index=0;
  for(const statement of statements(entry.sql)){
   index++;
   if(platformStandins&&/^CREATE EXTENSION IF NOT EXISTS supabase_vault\b/i.test(statement))continue;
   try{await client.query(statement);}catch{
    // Query errors may contain data, SQL or secrets. Never forward them.
    throw Error(`Bootstrap stopped: ${entry.file}, statement ${index}`);
   }
  }
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let client;
 try{
  // Localhost as before; one non-local Supabase project only via --remote-host/--remote-ref.
  const {remote,rest}=takeRemoteFlags(process.argv.slice(2));
  const connectionString=explicitConnection(rest),url=new URL(connectionString);
  refuseProduction(connectionString);
  if(remote)assertDatabaseTarget(connectionString,'connection',remote);
  else if(url.search||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Bootstrap CLI permits localhost only');
  client=new pg.Client({connectionString,connectionTimeoutMillis:10000});await client.connect();
  await applyBootstrap(client);console.log('Fresh-install bootstrap completed');
 }catch(e){console.error(e.message.startsWith('Bootstrap')||e.message.startsWith('Refusing')||e.message.startsWith('--')?e.message:'Fresh install refused or failed; explicit localhost connection and empty Supabase platform required');process.exitCode=1;}
 finally{if(client)await client.end();}
}
