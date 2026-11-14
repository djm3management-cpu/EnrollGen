import {evidenceDb} from './evidenceDb.js';
// Adapter only: all SQL routines, RLS, encryption, leases and finalization execute
// unchanged in PostgreSQL. PostgREST JSON/scalar encoding is emulated here.
export function freshInstallClient(pg){
 return {...evidenceDb(pg),async rpc(name,input={}){
  if(!/^[a-z_]+$/.test(name))throw Error('Invalid fixture routine');
  const {rows:[routine]}=await pg.query(`SELECT p.proargnames names,p.proretset returns_set,t.typtype return_kind,
   (SELECT array_agg(format_type(x,NULL) ORDER BY ord) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY a(x,ord)) types
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_type t ON t.oid=p.prorettype
   WHERE n.nspname='public' AND p.proname=$1`,[name]);
  if(!routine)throw Error('Missing fixture routine');
  const values=[],args=Object.entries(input).map(([key,value],i)=>{
   const type=routine.types[routine.names.indexOf(key)];
   if(!type||!/^[a-z_]+$/.test(key))throw Error('Invalid fixture argument');
   values.push(['jsonb','json'].includes(type)?JSON.stringify(value):value);
   return `"${key}"=>$${i+1}::${type}`;
  });
  try{
   const {rows}=await pg.query(`SELECT * FROM public."${name}"(${args.join(',')})`,values);
   return {data:routine.returns_set?rows:routine.return_kind==='c'?rows[0]:rows[0]?.[name],error:null};
  }catch(error){return {data:null,error};}
 }};
}
