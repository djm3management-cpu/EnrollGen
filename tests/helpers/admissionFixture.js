import {securityMigrationFixture} from './securityMigrationFixture.js';
const sql=securityMigrationFixture('158_admission_limits.sql').split('CREATE FUNCTION public.admit_vendor')[0]+'COMMIT;';
const installed=new WeakMap();
export async function installAdmissionFixture(pg){
 if(!installed.has(pg))installed.set(pg,(async()=>{
  const role=(await pg.query("SELECT current_setting('role') role")).rows[0].role;
  await pg.exec('RESET ROLE');
  try{
   for(const name of ['anon','authenticated','service_role'])if(!(await pg.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[name])).rows.length)await pg.exec('CREATE ROLE '+name);
   if(!(await pg.query("SELECT to_regclass('public.admission_counters') present")).rows[0].present)await pg.exec(sql);
  }catch(error){await pg.exec('ROLLBACK');throw error;}
  finally{if(role!=='none')await pg.exec('SET ROLE '+role);}
 })());
 return installed.get(pg);
}
