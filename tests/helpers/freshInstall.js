import {PGlite} from '@electric-sql/pglite';
import {vector} from '../vendor/pglite-pgvector/runtime/index.js';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {bootstrapEntries} from '../../scripts/bootstrap-database.mjs';
import {statements} from '../../scripts/lib/bootstrap-sql.js';
export const bootstrapRoot=new URL('../../supabase/bootstrap/',import.meta.url);
export async function emptyLocalDatabase(){
 const pg=new PGlite({extensions:{pgcrypto,vector}});
 await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticator NOINHERIT; GRANT anon,authenticated,service_role TO authenticator;
 CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA vault;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT auth.jwt()->>'role'$$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(auth.jwt()->>'sub','')::uuid$$;
 CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$SELECT (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text NOT NULL,public boolean NOT NULL DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text NOT NULL,owner_id text,metadata jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE TABLE vault.decrypted_secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),decrypted_secret text);
 CREATE FUNCTION vault.create_secret(secret text,name text,description text) RETURNS uuid LANGUAGE plpgsql AS $$DECLARE i uuid; BEGIN INSERT INTO vault.decrypted_secrets(decrypted_secret) VALUES(secret) RETURNING id INTO i; RETURN i; END$$;
 GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
 CREATE PUBLICATION supabase_realtime;
 ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon,authenticated,service_role;
 ALTER DEFAULT PRIVILEGES GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;`);
 return pg;
}
export async function freshDatabase({hostile=false}={}){
 const pg=await emptyLocalDatabase();
 const entries=bootstrapEntries();
 try{
 for(const entry of entries){
  if(hostile&&entry.file==='sql/m150.sql'){
   await pg.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated; GRANT UPDATE(role),INSERT(clerk_user_id) ON tenant_agents TO authenticated; GRANT UPDATE(tenant_id) ON contacts TO authenticated;');
   for(const {tablename} of (await pg.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows)await pg.exec(`ALTER TABLE public.${tablename} ENABLE ROW LEVEL SECURITY; CREATE POLICY legacy_open ON public.${tablename} TO authenticated USING(true) WITH CHECK(true)`);
  }
  const sql=entry.sql;let i=0;
  for(const statement of statements(sql)){i++;
   if(/^CREATE EXTENSION IF NOT EXISTS supabase_vault/i.test(statement))continue;
   try{await pg.exec(statement);}catch(e){throw Error(`${entry.file} statement ${i}: ${e.message}`,{cause:e});}
  }
 }
 return pg;
 }catch(e){await pg.close();throw e;}
}
