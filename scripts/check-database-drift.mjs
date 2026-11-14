import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {snapshotCatalog,catalogDifferences} from './lib/database-catalog.js';
export function explicitConnection(args){
 if(args.length!==2||args[0]!=='--connection'||!args[1])throw Error('Usage: node scripts/check-database-drift.mjs --connection <explicit-postgresql-URL>');
 let url;try{url=new URL(args[1]);}catch{throw Error('Explicit PostgreSQL URL required');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||['host','hostaddr','options','service'].some(key=>url.searchParams.has(key)))throw Error('Explicit PostgreSQL URL with host required');
 return args[1];
}
export async function checkDrift(client){
 const expected=JSON.parse(readFileSync(new URL('../supabase/bootstrap/catalog.expected.json',import.meta.url)));
 const differences=catalogDifferences(expected,await snapshotCatalog(client));
 // Do not print definitions/default values: a drifted DB could contain secrets.
 return differences.map(d=>({section:d.section,change:d.change,schema:d.object.schema,relation:d.object.relation,name:d.object.name}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let client;
 try{
  const connectionString=explicitConnection(process.argv.slice(2));
  client=new pg.Client({connectionString,application_name:'enrollgen-read-only-catalog',options:'-c default_transaction_read_only=on -c statement_timeout=30000',connectionTimeoutMillis:10000});
  await client.connect();const changes=await checkDrift(client);
  console.log(JSON.stringify({matches:changes.length===0,differences:changes},null,2));
  if(changes.length)process.exitCode=1;
 }catch{console.error('Catalog check failed. Supply --connection explicitly; credentials and database errors are never printed.');process.exitCode=2;}
 finally{if(client)await client.end();}
}
