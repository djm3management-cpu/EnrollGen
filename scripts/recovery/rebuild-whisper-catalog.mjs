// In-process only; no environment files, credentials or sockets.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {freshDatabase} from '../../tests/helpers/freshInstall.js';
import {snapshotCatalog} from '../lib/database-catalog.js';
import {statements} from '../lib/bootstrap-sql.js';
const base=new URL('../../supabase/bootstrap/',import.meta.url),file=process.argv[2]||'168_supervisor_whisper.sql',number=file.match(/^(\d+)_/)?.[1];
const migration=readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8');
writeFileSync(new URL(`sql/m${number}.sql`,base),migration);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',base)));
if(!manifest.entries.some(e=>e.file===`sql/m${number}.sql`))manifest.entries.splice(manifest.entries.findIndex(e=>e.file==='sql/seal.sql'),0,{file:`sql/m${number}.sql`});
for(const entry of manifest.entries)entry.sha256=createHash('sha256').update(readFileSync(new URL(entry.file,base))).digest('hex');
writeFileSync(new URL('manifest.json',base),JSON.stringify(manifest,null,2)+'\n');
const db=await freshDatabase();
try{
 const catalog=await snapshotCatalog(db);writeFileSync(new URL('catalog.expected.json',base),JSON.stringify(catalog,null,2)+'\n');
 const inventory=JSON.parse(readFileSync(new URL('operator-objects.json',base)));
 inventory.netlify_function_source_modules=readdirSync(new URL('../../netlify/functions/',import.meta.url)).filter(n=>n.endsWith('.js')).sort();
 inventory.sql_routines=catalog.routines.map(({schema,name,arguments:args})=>({schema,name,arguments:args}));
 writeFileSync(new URL('operator-objects.json',base),JSON.stringify(inventory,null,2)+'\n');
 const url=new URL('../../tests/fixtures/clean-export/migration-statement-hashes.json',import.meta.url),hashes=JSON.parse(readFileSync(url));
 hashes[file]=createHash('sha256').update(JSON.stringify(statements(migration))).digest('hex');writeFileSync(url,JSON.stringify(hashes,null,2)+'\n');
}finally{await db.close();}
