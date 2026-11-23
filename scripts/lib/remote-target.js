// Remote-target guard shared by the bootstrap CLI, the live-to-fresh migration tool
// and its application check. Local targets behave exactly as before. A non-local
// target is accepted only through an explicit opt-in naming exactly one host and one
// Supabase project ref, and only when every rule below holds. The retired production
// project is refused in every position, before any connection is attempted.
// Nothing here reads environment files or prints connection values.
import {existsSync} from 'node:fs';

export const PRODUCTION_REF='qzjtagnpklaxefwurorc';
export const LOCAL_HOSTS=new Set(['localhost','127.0.0.1','[::1]','::1']);
const REF=/^[a-z0-9]{20}$/;
const FORBIDDEN_PARAMS=['host','hostaddr','service','options','passfile'];

export function refuseProduction(...values){
 for(const value of values)if(value!=null&&String(value).toLowerCase().includes(PRODUCTION_REF))throw Error('Refusing the production project: this tool never targets it');
}

// Extract --remote-host/--remote-ref from argv. Returns {remote, rest}.
export function takeRemoteFlags(argv){
 const rest=[];let host=null,ref=null;
 for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a==='--remote-host'||a==='--remote-ref'){
   if(i+1>=argv.length)throw Error(`${a} needs a value`);
   const v=argv[++i];if(a==='--remote-host')host=v;else ref=v;
  }else rest.push(a);
 }
 refuseProduction(host,ref);
 if(!host&&!ref)return {remote:null,rest};
 if(!host||!ref)throw Error('--remote-host and --remote-ref must be given together');
 if(!REF.test(ref))throw Error('--remote-ref must be a 20-character Supabase project ref');
 if(LOCAL_HOSTS.has(host)||!/^[a-z0-9.-]+$/.test(host))throw Error('--remote-host must be a single DNS host name');
 return {remote:{host,ref},rest};
}

// A database URL. Local: unchanged rules. Remote: the exact opted-in host, the
// project ref in the pooler user (postgres.<ref>) or direct host (db.<ref>.supabase.co),
// no password in the URL (PGPASSWORD only), and verify-full TLS with a CA file.
export function assertDatabaseTarget(value,label,remote=null){
 let url;
 try{url=new URL(value);}catch{throw Error(`--${label} must be a postgresql:// URL`);}
 refuseProduction(value,decodeURIComponent(url.username),url.hostname);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw Error(`--${label} must be a postgresql:// URL`);
 const local=LOCAL_HOSTS.has(url.hostname);
 for(const key of [...FORBIDDEN_PARAMS,...(local?['sslrootcert']:[])])
  if(url.searchParams.has(key))throw Error(`--${label} may not override the host or service via query parameters`);
 if(local)return value;
 if(!remote)throw Error(`--${label} must point at localhost or 127.0.0.1; refusing to run`);
 if(url.hostname!==remote.host)throw Error(`--${label} host does not match --remote-host`);
 const user=decodeURIComponent(url.username);
 if(user!==`postgres.${remote.ref}`&&!(user==='postgres'&&url.hostname===`db.${remote.ref}.supabase.co`))throw Error(`--${label} user/host does not name --remote-ref`);
 if(url.password)throw Error(`--${label} must not contain a password; supply it through PGPASSWORD`);
 if(url.searchParams.get('sslmode')!=='verify-full')throw Error(`--${label} requires sslmode=verify-full`);
 const ca=url.searchParams.get('sslrootcert');
 if(!ca||!existsSync(ca))throw Error(`--${label} requires sslrootcert pointing at the project CA certificate`);
 return value;
}

// The Supabase API base URL. Local stack as before; remote only https://<ref>.supabase.co.
export function assertSupabaseApiTarget(value,remote=null){
 let url;
 try{url=new URL(value||'');}catch{throw Error('SUPABASE_URL must be a URL');}
 refuseProduction(value);
 if(LOCAL_HOSTS.has(url.hostname))return value;
 if(!remote)throw Error('SUPABASE_URL must be the local stack');
 if(url.origin!==`https://${remote.ref}.supabase.co`||url.pathname.replace(/\/$/,'')!==''||url.search)throw Error('SUPABASE_URL must be exactly the --remote-ref project API');
 return value;
}
