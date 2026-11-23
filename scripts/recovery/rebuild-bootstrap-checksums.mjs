// Explicitly in-process only. Never reads credentials or opens a socket.
// Same process as the other rebuild-*-catalog scripts, for reviewed edits to
// existing bootstrap files (no new migration copy): recompute every manifest
// SHA-256, then regenerate catalog.expected.json and the operator routine
// inventory from a fresh in-process build. The Netlify module list is not
// bootstrap SQL and is left to its own rebuild.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {freshDatabase} from '../../tests/helpers/freshInstall.js';
import {snapshotCatalog} from '../lib/database-catalog.js';
const base=new URL('../../supabase/bootstrap/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',base)));
for(const entry of manifest.entries)entry.sha256=createHash('sha256').update(readFileSync(new URL(entry.file,base))).digest('hex');
writeFileSync(new URL('manifest.json',base),JSON.stringify(manifest,null,2)+'\n');
const db=await freshDatabase();
try{
 const catalog=await snapshotCatalog(db);
 writeFileSync(new URL('catalog.expected.json',base),JSON.stringify(catalog,null,2)+'\n');
 const inventory=JSON.parse(readFileSync(new URL('operator-objects.json',base)));
 inventory.sql_routines=catalog.routines.map(({schema,name,arguments:args})=>({schema,name,arguments:args}));
 writeFileSync(new URL('operator-objects.json',base),JSON.stringify(inventory,null,2)+'\n');
 console.log('Bootstrap manifest checksums and expected catalog rebuilt');
}finally{await db.close();}
