import fs from 'node:fs/promises';
import { createSupabaseAdminClient } from './common.js';

export async function readLandscape2027(args = {}) {
  if (args['landscape-file']) {
    const rows = (await fs.readFile(args['landscape-file'], 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line));
    if (!rows.length || rows.some(row => row.plan_year !== 2027 || !row.county_fips)) throw new Error('Invalid PY2027 landscape');
    return rows;
  }
  const supabase = await createSupabaseAdminClient();
  const rows = [];
  for (let offset = 0;; offset += 1000) {
    const { data, error } = await supabase.from('cms_plans_py2027').select('*').eq('plan_year', 2027).order('id').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  if (!rows.length) throw new Error('Empty PY2027 landscape');
  return rows;
}
