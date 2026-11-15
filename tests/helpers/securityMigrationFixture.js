import {existsSync,readFileSync} from 'node:fs';
// These unchanged security migrations are also checksummed bootstrap entries.
// Repository regressions read the original; reviewer tests use the bootstrap
// capture so no second database definition has to ship in the export.
export function securityMigrationFixture(name) {
  if(!/^15[0-9]_/.test(name))throw Error('Only captured bootstrap security migrations are supported');
  const original=new URL('../../supabase/migrations/'+name,import.meta.url);
  return readFileSync(existsSync(original)?original:new URL(`../../supabase/bootstrap/sql/m${name.slice(0,3)}.sql`,import.meta.url),'utf8');
}
