// All statements here are read-only. Stable names replace installation OIDs.
const schemas="('public','pii_vault','oct_slim_086_rollback','oct_slim_088_rollback')";
export const catalogQueries={
 tables:`SELECT n.nspname schema,c.relname name,c.relkind kind,pg_get_userbyid(c.relowner) owner,c.relrowsecurity rls,c.relforcerowsecurity force_rls,c.reloptions options
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${schemas} AND c.relkind IN ('r','p','v','m','S') ORDER BY 1,2`,
 columns:`SELECT n.nspname schema,c.relname relation,a.attname name,a.attnum position,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null,a.attidentity identity,a.attgenerated generated,pg_get_expr(d.adbin,d.adrelid) default_expression
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE n.nspname IN ${schemas} AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,4`,
 policies:`SELECT schemaname schema,tablename relation,policyname name,permissive,roles::text[] roles,cmd,qual,with_check FROM pg_policies WHERE schemaname IN ${schemas} OR schemaname='storage' ORDER BY 1,2,3`,
 tableGrants:`SELECT table_schema schema,table_name relation,grantor,grantee,privilege_type privilege,is_grantable grantable FROM information_schema.table_privileges WHERE table_schema IN ${schemas} OR (table_schema='storage' AND table_name IN ('objects','buckets')) ORDER BY 1,2,3,4,5`,
 columnGrants:`SELECT n.nspname schema,c.relname relation,a.attname name,pg_get_userbyid(g.grantor) grantor,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END grantee,g.privilege_type privilege,g.is_grantable grantable
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(a.attacl) g
 WHERE a.attnum>0 AND NOT a.attisdropped AND (n.nspname IN ${schemas} OR (n.nspname='storage' AND c.relname IN ('objects','buckets'))) ORDER BY 1,2,3,4,5,6`,
 routines:`SELECT n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) arguments,pg_get_function_result(p.oid) result,pg_get_userbyid(p.proowner) owner,p.prosecdef security_definer,p.proconfig settings,p.proacl::text acl,pg_get_functiondef(p.oid) definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace LEFT JOIN pg_depend dep ON dep.objid=p.oid AND dep.deptype='e'
 WHERE n.nspname IN ${schemas} AND dep.objid IS NULL AND p.prokind IN ('f','p') ORDER BY 1,2,3`,
 views:`SELECT n.nspname schema,c.relname name,pg_get_userbyid(c.relowner) owner,c.reloptions options,pg_get_viewdef(c.oid,false) definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${schemas} AND c.relkind IN ('v','m') ORDER BY 1,2`,
 constraints:`SELECT n.nspname schema,c.relname relation,k.conname name,pg_get_constraintdef(k.oid,false) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${schemas} AND k.contype<>'n' ORDER BY 1,2,3`,
 indexes:`SELECT schemaname schema,tablename relation,indexname name,indexdef definition FROM pg_indexes WHERE schemaname IN ${schemas} ORDER BY 1,2,3`,
 triggers:`SELECT n.nspname schema,c.relname relation,t.tgname name,t.tgenabled enabled,pg_get_triggerdef(t.oid,false) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${schemas} AND NOT t.tgisinternal ORDER BY 1,2,3`,
 defaults:`SELECT pg_get_userbyid(d.defaclrole) owner,n.nspname schema,d.defaclobjtype type,d.defaclacl::text acl FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname IN ${schemas} OR d.defaclnamespace=0 ORDER BY 1,2,3`,
 schemaGrants:`SELECT nspname schema,pg_get_userbyid(nspowner) owner,nspacl::text acl FROM pg_namespace WHERE nspname IN ${schemas} ORDER BY 1`,
 buckets:`SELECT id,name,public,file_size_limit,allowed_mime_types FROM storage.buckets ORDER BY id`,
 publication:`SELECT pubname,schemaname,tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' ORDER BY 1,2,3`,
 extensions:`SELECT e.extname name,n.nspname schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname IN ('pgcrypto','vector') ORDER BY 1`,
};
export async function snapshotCatalog(db){
 await db.query('BEGIN READ ONLY');
 try {
  await db.query('SET LOCAL search_path=pg_catalog,public,extensions');
  const result={};for(const [name,sql] of Object.entries(catalogQueries))result[name]=(await db.query(sql)).rows;
  return result;
 } finally {await db.query('ROLLBACK');}
}
export function catalogDifferences(expected,actual){
 const differences=[];
 for(const name of new Set([...Object.keys(expected),...Object.keys(actual)])){
  const before=new Set((expected[name]||[]).map(r=>JSON.stringify(r))),after=new Set((actual[name]||[]).map(r=>JSON.stringify(r)));
  for(const row of before)if(!after.has(row))differences.push({section:name,change:'missing_or_changed',object:JSON.parse(row)});
  for(const row of after)if(!before.has(row))differences.push({section:name,change:'extra_or_changed',object:JSON.parse(row)});
 }
 return differences;
}
