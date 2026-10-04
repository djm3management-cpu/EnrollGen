/** CMS-published rates. Never turn absent/suppressed enrollment into zero. */
export function countyKey(value) {
  return String(value || '').toLowerCase().replace(/\bst[. ]/g, 'saint ').replace(/\s+county$/i, '').replace(/[^a-z0-9]/g, '');
}
export function countyPenetration(rows, county, fips) {
  if (fips) return rows.find(row => row.fips === fips) || null;
  const matches = rows.filter(row => countyKey(row.county) === countyKey(county));
  return matches.length === 1 ? matches[0] : null;
}
export function penetrationLabel(row) {
  return row?.penetration_pct != null ? `${Number(row.penetration_pct).toFixed(2)}%` : 'No data';
}
export function penetrationColor(row) {
  if (row?.penetration_pct == null) return 'var(--bg-elevated)';
  const rate = Number(row.penetration_pct);
  return `color-mix(in srgb, var(--danger) ${15 + Math.min(100, Math.max(0, rate)) * 0.7}%, var(--bg-surface))`;
}
export async function fetchCountyPenetration(client, state) {
  const latest = await client.from('cms_county_penetration').select('file_month').order('file_month', { ascending: false }).limit(1);
  if (latest.error) throw new Error('CMS penetration data is unavailable.');
  const month = latest.data?.[0]?.file_month || null;
  if (!month) return { rows: [], month };
  const result = await client.from('cms_county_penetration')
    .select('state,county,fips,eligibles,ma_enrollees,penetration_pct,file_month').eq('state', state).eq('file_month', month);
  if (result.error) throw new Error('CMS penetration data is unavailable.');
  return { rows: result.data || [], month };
}
