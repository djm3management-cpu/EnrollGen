// Files written outside the repository: storage manifest, excluded-table CSV
// exports (Q8) and provisioning inputs. All are created with mode 0600 in a
// 0700 directory. Nothing here prints values.

import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { quoteIdent } from './catalog.js';
import { toCsv, profileStaffedHours } from './transforms.js';
import { parseLossless } from './json.js';

export function writePrivate(path, content) {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}
export function privateDir(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  return dir;
}

// Every text column named *storage_path in OLD public tables references an object.
export async function storageManifest(oldDb) {
  const refCols = (await oldDb.query(`SELECT c.table_name AS t, c.column_name AS n FROM information_schema.columns c
     JOIN information_schema.tables x ON x.table_schema=c.table_schema AND x.table_name=c.table_name AND x.table_type='BASE TABLE'
     WHERE c.table_schema='public' AND c.column_name ~ 'storage_path$' AND c.data_type='text' ORDER BY 1,2`)).rows;
  const refs = new Map();
  for (const { t, n } of refCols) {
    const r = await oldDb.query(`SELECT ${quoteIdent(n)} AS p, count(*)::int AS c FROM public.${quoteIdent(t)} WHERE ${quoteIdent(n)} IS NOT NULL GROUP BY 1`);
    for (const { p, c } of r.rows) { if (!refs.has(p)) refs.set(p, []); refs.get(p).push({ column: `${t}.${n}`, rows: c }); }
  }
  const objs = await oldDb.query(`SELECT bucket_id, name, coalesce((metadata->>'size')::bigint,0) AS size, metadata->>'mimetype' AS mimetype, metadata->>'eTag' AS etag, created_at FROM storage.objects ORDER BY bucket_id, name`);
  const objects = objs.rows.map(o => {
    const referencedBy = refs.get(o.name) || [];
    return {
      old_bucket: o.bucket_id, old_path: o.name, new_bucket: o.bucket_id, new_path: o.name,
      bytes: Number(o.size), mimetype: o.mimetype, etag: o.etag,
      referenced_by: referencedBy, unreferenced: referencedBy.length === 0, copy: true,
    };
  });
  const objectPaths = new Set(objs.rows.map(o => o.name));
  const missing = [...refs.entries()].filter(([p]) => !objectPaths.has(p)).map(([, r]) => r).flat();
  return {
    generated_at: new Date().toISOString(),
    note: 'Bucket and path are unchanged in NEW (tenant id preserved; NEW path builder is <tenant>/<parent call sid>/<recording sid>.wav). This manifest lists objects to copy; this task copies no files.',
    totals: { objects: objects.length, bytes: objects.reduce((a, o) => a + o.bytes, 0), unreferenced: objects.filter(o => o.unreferenced).length, row_references_without_object: missing.reduce((a, r) => a + r.rows, 0) },
    by_bucket: Object.values(objects.reduce((m, o) => { (m[o.old_bucket] ||= { bucket: o.old_bucket, objects: 0, bytes: 0 }); m[o.old_bucket].objects++; m[o.old_bucket].bytes += o.bytes; return m; }, {})),
    objects,
  };
}

export async function exportExcluded(oldDb, tables, dir) {
  privateDir(dir);
  const out = [];
  for (const t of tables) {
    const cols = (await oldDb.query(`SELECT column_name AS n FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t])).rows.map(r => r.n);
    if (!cols.length) { out.push({ table: t, rows: 0, file: null }); continue; }
    const rows = (await oldDb.query(`SELECT to_jsonb(x)::text AS j FROM public.${quoteIdent(t)} x ORDER BY 1`)).rows.map(r => parseLossless(r.j));
    const file = join(dir, `${t}.csv`);
    writePrivate(file, toCsv(cols, rows));
    out.push({ table: t, rows: rows.length, columns: cols.length, file });
  }
  return out;
}

// Q10: profile and roster derived from OLD at runtime. No identity is stored
// in the repository. Origins are synthetic unless the operator supplies them.
export async function provisioningInputs(oldDb, { appOrigin = 'https://app.example', telephonyOrigin = 'https://phone.example' } = {}) {
  const tenant = (await oldDb.query(`SELECT id::text, name, clerk_org_id, agency_display_name FROM public.tenants`)).rows;
  if (tenant.length !== 1) throw Error('Expected exactly one tenant in OLD');
  const t = tenant[0];
  const line = (await oldDb.query(`SELECT to_number AS n, count(*) c FROM public.inbound_calls WHERE to_number IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1`)).rows[0]?.n;
  const sender = (await oldDb.query(`SELECT from_number AS n, count(*) c FROM public.messages WHERE direction='outbound' AND from_number IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1`)).rows[0]?.n || line;
  const vc = (await oldDb.query(`SELECT staffed_hours::text AS s FROM public.vendor_controls WHERE tenant_id=$1::uuid`, [t.id])).rows[0];
  const staffed = vc ? JSON.parse(vc.s) : null;
  const hosts = [new URL(appOrigin).hostname, new URL(telephonyOrigin).hostname];
  const names = [...new Set([t.agency_display_name, t.name].filter(Boolean))];
  const profile = {
    tenantId: t.id, organizationId: t.clerk_org_id, agencyName: t.agency_display_name || t.name, agencyAliases: names,
    documentName: t.agency_display_name || t.name, agencyLine: line, agencyLineLabel: 'Agency main line', phoneDisplay: 'national',
    textSender: sender, timezone: staffed?.timezone, staffedHours: profileStaffedHours(staffed),
    allowedHosts: [...new Set(hosts)], appOrigin, telephonyOrigin,
    supervisorListen: { maxSeconds: 1800, perCall: 2, perAgency: 6 },
  };
  const agents = (await oldDb.query(`SELECT id::text, tenant_id::text, name, npn, clerk_user_id, agent_slug, ghl_user_id, is_active FROM public.tenant_agents WHERE is_active AND clerk_user_id IS NOT NULL ORDER BY created_at`)).rows;
  const elig = (await oldDb.query(`SELECT agent_id::text AS a, array_agg(DISTINCT state ORDER BY state) AS s FROM public.vendor_agent_state_eligibility GROUP BY 1`)).rows;
  const states = new Map(elig.map(r => [r.a, Array.isArray(r.s) ? r.s : String(r.s).replace(/[{}]/g, '').split(',').filter(Boolean)]));
  const roster = agents.map(a => ({
    id: a.id, tenant_id: a.tenant_id, name: a.name, npn: a.npn, clerk_user_id: a.clerk_user_id, agent_slug: a.agent_slug,
    ghl_user_id: a.ghl_user_id, is_active: true, identity_aliases: [a.name],
    licensed_states: states.get(a.id) || states.get(a.agent_slug) || [], team: null, sunfire_agent_id: null, ams_producer_id: null,
  }));
  return { profile, roster, missingGhl: roster.filter(r => !r.ghl_user_id).map(r => r.name) };
}
