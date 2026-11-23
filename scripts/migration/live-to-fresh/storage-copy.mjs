#!/usr/bin/env node
// Storage copy step: copies the objects listed in storage-manifest.json from a source
// Supabase project's Storage to a target project's Storage, preserving bucket and path.
//
//   SOURCE_SUPABASE_SECRET_KEY=… TARGET_SUPABASE_SECRET_KEY=… node scripts/migration/live-to-fresh/storage-copy.mjs \
//     --manifest <storage-manifest.json> --ledger <private ledger.json> \
//     --source-url https://<source-ref>.supabase.co --target-url https://<target-ref>.supabase.co --target-ref <target-ref> \
//     [--concurrency 4] [--include-unreferenced]
//
// Per object: download from source; when the manifest etag is a plain MD5, the source
// bytes must match it; size must equal the manifest; upload to the target without
// overwrite; download the target copy and require identical size and SHA-256. An object
// already present in the target is accepted only if its bytes are identical. Verified
// objects are recorded in the ledger (mode 0600), so a rerun resumes where it stopped.
// The target must be the explicitly named project (never the retired production project)
// and every target bucket must exist and be private. Output is counts and manifest
// indices only: never object contents, paths or keys.
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {assertSupabaseApiTarget,refuseProduction,LOCAL_HOSTS} from '../../lib/remote-target.js';

const MD5=/^[0-9a-f]{32}$/;
const encodePath=p=>p.split('/').map(encodeURIComponent).join('/');
const digest=(alg,buf)=>createHash(alg).update(buf).digest('hex');

export function parseStorageCopyArgs(argv){
 const o={manifest:null,ledger:null,sourceUrl:null,targetUrl:null,targetRef:null,concurrency:4,includeUnreferenced:false};
 for(let i=0;i<argv.length;i++){
  const a=argv[i],next=()=>{if(i+1>=argv.length)throw Error(`${a} needs a value`);return argv[++i];};
  if(a==='--manifest')o.manifest=next();else if(a==='--ledger')o.ledger=next();
  else if(a==='--source-url')o.sourceUrl=next();else if(a==='--target-url')o.targetUrl=next();
  else if(a==='--target-ref')o.targetRef=next();else if(a==='--concurrency')o.concurrency=Number(next());
  else if(a==='--include-unreferenced')o.includeUnreferenced=true;
  else throw Error(`Unknown argument ${a}`);
 }
 for(const k of ['manifest','ledger','sourceUrl','targetUrl'])if(!o[k])throw Error('--manifest, --ledger, --source-url and --target-url are required');
 if(!Number.isInteger(o.concurrency)||o.concurrency<1||o.concurrency>16)throw Error('--concurrency must be 1..16');
 const target=new URL(o.targetUrl);
 refuseProduction(o.targetUrl,o.targetRef);
 if(!LOCAL_HOSTS.has(target.hostname)){
  if(!o.targetRef)throw Error('--target-ref is required for a remote target');
  assertSupabaseApiTarget(o.targetUrl,{ref:o.targetRef,host:target.hostname});
 }
 const source=new URL(o.sourceUrl);
 if(!LOCAL_HOSTS.has(source.hostname)&&!(source.protocol==='https:'&&/^[a-z0-9]{20}\.supabase\.co$/.test(source.hostname)&&source.pathname.replace(/\/$/,'')===''&&!source.search))
  throw Error('--source-url must be https://<ref>.supabase.co or the local stack');
 return o;
}

export function storageClient(baseUrl,key,fetchImpl=fetch){
 const base=new URL(baseUrl);
 const call=async(method,path,{body,headers={}}={})=>{
  const r=await fetchImpl(new URL('/storage/v1/'+path,base),{method,headers:{apikey:key,Authorization:'Bearer '+key,...headers},body});
  return r;
 };
 return {
  async bucket(id){const r=await call('GET','bucket/'+encodeURIComponent(id));if(r.status===404||r.status===400){await r.arrayBuffer();return null;}if(!r.ok)throw Error(`bucket lookup failed (HTTP ${r.status})`);return r.json();},
  async download(bucket,path){const r=await call('GET',`object/authenticated/${encodeURIComponent(bucket)}/${encodePath(path)}`);if(r.status===404||r.status===400){await r.arrayBuffer();return null;}if(!r.ok)throw Error(`download failed (HTTP ${r.status})`);return Buffer.from(await r.arrayBuffer());},
  async upload(bucket,path,bytes,contentType){const r=await call('POST',`object/${encodeURIComponent(bucket)}/${encodePath(path)}`,{body:bytes,headers:{'content-type':contentType||'application/octet-stream','x-upsert':'false'}});await r.arrayBuffer();if(r.ok)return 'created';if(r.status===409||r.status===400)return 'exists';throw Error(`upload failed (HTTP ${r.status})`);},
 };
}

function loadLedger(file){
 if(!existsSync(file))return {version:1,verified:{}};
 const l=JSON.parse(readFileSync(file,'utf8'));if(l.version!==1||typeof l.verified!=='object')throw Error('Ledger is malformed');return l;
}
function saveLedger(file,ledger){const tmp=file+'.tmp';writeFileSync(tmp,JSON.stringify(ledger),{mode:0o600});renameSync(tmp,file);}

export async function copyStorage({manifest,ledgerFile,source,target,concurrency=4,includeUnreferenced=false,log=()=>{}}){
 const entries=manifest.objects.map((o,index)=>({...o,index})).filter(o=>o.copy!==false&&(includeUnreferenced||!o.unreferenced));
 for(const bucket of new Set(entries.map(o=>o.new_bucket))){
  const b=await target.bucket(bucket);
  if(!b)throw Error(`target bucket ${entries.find(o=>o.new_bucket===bucket).index} is missing`);
  if(b.public!==false)throw Error('target bucket is not private; refusing to copy');
 }
 const ledger=loadLedger(ledgerFile);
 const totals={planned:entries.length,verified:0,copied:0,alreadyPresent:0,skippedFromLedger:0,bytes:0,failed:[]};
 const key=o=>`${o.new_bucket}/${o.new_path}`;
 let next=0,dirty=0;
 const one=async o=>{
  if(ledger.verified[key(o)]){totals.skippedFromLedger++;totals.verified++;return;}
  const src=await source.download(o.old_bucket,o.old_path);
  if(!src)throw Error('source object missing');
  if(src.length!==o.bytes)throw Error('source size differs from manifest');
  if(o.etag&&MD5.test(String(o.etag).replace(/"/g,''))&&digest('md5',src)!==String(o.etag).replace(/"/g,''))throw Error('source bytes differ from manifest etag');
  const sha=digest('sha256',src);
  const outcome=await target.upload(o.new_bucket,o.new_path,src,o.mimetype);
  const copy=await target.download(o.new_bucket,o.new_path);
  if(!copy)throw Error('target object missing after upload');
  if(copy.length!==src.length||digest('sha256',copy)!==sha)throw Error(outcome==='exists'?'target already holds different bytes at this path':'target bytes differ after upload');
  ledger.verified[key(o)]={bytes:src.length,sha256:sha,at:new Date().toISOString()};
  if(outcome==='created')totals.copied++;else totals.alreadyPresent++;
  totals.verified++;totals.bytes+=src.length;
  if(++dirty>=10){saveLedger(ledgerFile,ledger);dirty=0;}
 };
 const worker=async()=>{for(;;){const i=next++;if(i>=entries.length)return;const o=entries[i];
  try{await one(o);}catch(e){totals.failed.push({index:o.index,reason:e.message});}
  if((totals.verified+totals.failed.length)%25===0)log(`progress ${totals.verified+totals.failed.length}/${entries.length}`);}};
 try{await Promise.all(Array.from({length:Math.min(concurrency,entries.length||1)},worker));}
 finally{saveLedger(ledgerFile,ledger);}
 return totals;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const say=m=>console.log(`[storage-copy] ${m}`);
 try{
  const o=parseStorageCopyArgs(process.argv.slice(2));
  const sourceKey=process.env.SOURCE_SUPABASE_SECRET_KEY,targetKey=process.env.TARGET_SUPABASE_SECRET_KEY;
  if(!sourceKey||!targetKey)throw Error('SOURCE_SUPABASE_SECRET_KEY and TARGET_SUPABASE_SECRET_KEY are required');
  const manifest=JSON.parse(readFileSync(o.manifest,'utf8'));
  const t=await copyStorage({manifest,ledgerFile:o.ledger,source:storageClient(o.sourceUrl,sourceKey),target:storageClient(o.targetUrl,targetKey),concurrency:o.concurrency,includeUnreferenced:o.includeUnreferenced,log:say});
  say(`planned ${t.planned}, verified ${t.verified} (copied ${t.copied}, already present ${t.alreadyPresent}, from ledger ${t.skippedFromLedger}), bytes copied ${t.bytes}, failed ${t.failed.length}`);
  for(const f of t.failed)say(`failed: manifest index ${f.index}: ${f.reason}`);
  process.exitCode=t.failed.length?1:0;
 }catch(e){say(`refused or failed: ${e.message}`);process.exitCode=2;}
}
