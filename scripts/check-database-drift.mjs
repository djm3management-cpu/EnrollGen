import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {snapshotCatalog,catalogDifferences} from './lib/database-catalog.js';
import {refuseProduction} from './lib/remote-target.js';
export function explicitConnection(args){
 if(args.length!==2||args[0]!=='--connection'||!args[1])throw Error('Usage: node scripts/check-database-drift.mjs --connection <explicit-postgresql-URL> [--platform supabase-hosted]');
 let url;try{url=new URL(args[1]);}catch{throw Error('Explicit PostgreSQL URL required');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||['host','hostaddr','options','service'].some(key=>url.searchParams.has(key)))throw Error('Explicit PostgreSQL URL with host required');
 return args[1];
}
const safe=d=>({section:d.section,change:d.change,schema:d.object.schema,relation:d.object.relation,name:d.object.name});
async function rawDifferences(client){
 const expected=JSON.parse(readFileSync(new URL('../supabase/bootstrap/catalog.expected.json',import.meta.url)));
 return catalogDifferences(expected,await snapshotCatalog(client));
}
export async function checkDrift(client){
 // Do not print definitions/default values: a drifted DB could contain secrets.
 return (await rawDifferences(client)).map(safe);
}

// Reviewed platform exceptions (docs/migration/hosted-rehearsal-diagnosis.md).
// Only these categories exist, and each is confined to the rows it may describe,
// so the file can never hide application drift. Matching is on the exact row.
export const PLATFORMS={'supabase-hosted':'platform-supabase-hosted.json'};
const STORAGE_TABLES=new Set(['objects','buckets']);
export const PLATFORM_CATEGORIES={
 'B4-storage-grant':d=>['tableGrants','columnGrants'].includes(d.section)&&d.object.schema==='storage'&&STORAGE_TABLES.has(d.object.relation),
 'B6-default-acl':d=>d.section==='defaults',
 'B6-schema-usage':d=>d.section==='schemaGrants'&&d.object.schema==='public',
};
const key=d=>JSON.stringify([d.section,d.change,d.object]);
export function loadPlatformExceptions(platform,read=file=>readFileSync(new URL('../supabase/bootstrap/'+file,import.meta.url),'utf8')){
 if(!Object.hasOwn(PLATFORMS,platform))throw Error('Unknown --platform');
 const file=JSON.parse(read(PLATFORMS[platform]));
 if(file.platform!==platform||!Array.isArray(file.accepted))throw Error('Platform exception file is malformed');
 const seen=new Set();
 for(const entry of file.accepted){
  const rule=PLATFORM_CATEGORIES[entry.category];
  if(!rule||!entry.reason||!['missing_or_changed','extra_or_changed'].includes(entry.change)||!entry.object||!rule(entry))throw Error('Platform exception outside its approved category');
  if(seen.has(key(entry)))throw Error('Duplicate platform exception');seen.add(key(entry));
 }
 return file.accepted;
}
export function applyPlatformExceptions(differences,accepted){
 const allowed=new Map(accepted.map(e=>[key(e),e.category]));
 const remaining=[],matched=[];
 for(const d of differences){const category=allowed.get(key(d));if(category)matched.push({...safe(d),category});else remaining.push(safe(d));}
 const used=new Set(differences.map(key));
 const unused=accepted.filter(e=>!used.has(key(e))).map(e=>({...safe(e),category:e.category}));
 return {remaining,accepted:matched,unused};
}
export async function checkDriftOnPlatform(client,platform){
 return applyPlatformExceptions(await rawDifferences(client),loadPlatformExceptions(platform));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let client;
 try{
  const args=process.argv.slice(2);let platform=null;
  const at=args.indexOf('--platform');if(at!==-1){platform=args[at+1];args.splice(at,2);}
  const connectionString=explicitConnection(args);refuseProduction(connectionString);
  if(platform!==null)loadPlatformExceptions(platform);
  client=new pg.Client({connectionString,application_name:'enrollgen-read-only-catalog',options:'-c default_transaction_read_only=on -c statement_timeout=30000',connectionTimeoutMillis:10000});
  await client.connect();
  if(platform===null){
   const changes=await checkDrift(client);
   console.log(JSON.stringify({matches:changes.length===0,differences:changes},null,2));
   if(changes.length)process.exitCode=1;
  }else{
   const {remaining,accepted,unused}=await checkDriftOnPlatform(client,platform);
   // Accepted rows are reported separately so the exception is always visible.
   console.log(JSON.stringify({matches:remaining.length===0,platform,differences:remaining,acceptedPlatformDifferences:accepted,unusedPlatformExceptions:unused},null,2));
   if(remaining.length)process.exitCode=1;
  }
 }catch{console.error('Catalog check failed. Supply --connection explicitly; credentials and database errors are never printed.');process.exitCode=2;}
 finally{if(client)await client.end();}
}
