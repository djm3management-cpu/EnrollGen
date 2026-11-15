import {readFileSync} from 'node:fs';
const installed=new WeakMap();
export function installAdminFixture(pg){
 if(installed.has(pg))return installed.get(pg);
 const work=(async()=>{
  if((await pg.query("SELECT to_regprocedure('public.execute_admin_action(text,text,text,uuid,jsonb,boolean)') r")).rows[0].r)return;
  const role=(await pg.query("SELECT current_setting('role') r")).rows[0].r;
  await pg.exec('RESET ROLE');
  try{
   await pg.exec('CREATE SCHEMA IF NOT EXISTS auth');
   if(!(await pg.query("SELECT to_regprocedure('auth.jwt()') r")).rows[0].r)await pg.exec("CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$");
   if(!(await pg.query("SELECT to_regprocedure('public.current_deployment_identity()') r")).rows[0].r){
    const identity=readFileSync(new URL('../../supabase/bootstrap/sql/m152.sql',import.meta.url),'utf8');
    await pg.exec(identity.slice(identity.indexOf('CREATE FUNCTION public.current_deployment_identity()'),identity.indexOf('CREATE OR REPLACE FUNCTION public.is_current_tenant')));
   }
   const source=readFileSync(new URL('../../supabase/bootstrap/sql/m161.sql',import.meta.url),'utf8');
   await pg.exec(source.slice(source.indexOf('CREATE TABLE public.admin_action_log'),source.indexOf('-- Independent operator')));
  }finally{if(role!=='none')await pg.exec('SET ROLE '+role);}
 })();installed.set(pg,work);work.finally(()=>installed.delete(pg)).catch(()=>{});return work;
}
