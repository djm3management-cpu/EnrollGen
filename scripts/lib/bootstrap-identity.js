import {readFileSync} from 'node:fs';
const terms=JSON.parse(readFileSync(new URL('../../tests/fixtures/forbidden-deployment-terms.json',import.meta.url))).map(t=>t.toLowerCase());
export function assertNoDeploymentIdentity(content,label){
 const lower=content.toLowerCase();
 if(terms.some(term=>lower.includes(term)))throw Error('Forbidden deployment identity found in '+label);
}
// A logical application dump for isolated acceptance ONLY. Raw Vault/key values
// are deliberately excluded; never export credentials, including generated keys.
export async function dumpApplicationData(db){
 const {rows}=await db.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
 const dump={};
 for(const row of rows){
  const name='"'+row.tablename.replaceAll('"','""')+'"';
  dump[row.tablename]=(await db.query(`SELECT to_jsonb(t) row FROM public.${name} t`)).rows.map(r=>r.row);
 }
 return JSON.stringify(dump);
}
