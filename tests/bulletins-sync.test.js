import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { ALL_FEEDS, parseFeed, syncBulletins } from '../netlify/functions/sync-bulletins.js';
const now = new Date('2026-10-03T18:00:00Z');
const feed = { label: 'Fixture', carrier: 'CMS', url: 'https://example.org/rss' };
const rss = (date = '2026-10-01') => `<rss><channel><item><title>Medicare fixture</title><link>https://example.org/article</link><guid>one</guid><description>CMS Medicare update</description><pubDate>${date}</pubDate></item></channel></rss>`;
const response = content => ({ ok: true, text: async () => content });
async function database() {
  const pg = new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE bulletins(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, carrier text, title text, body text, states text[], link text, published_at date, source_id text, created_at timestamptz DEFAULT now(), updated_at timestamptz);`);
  return pg;
}
function client(pg) {
  return { from: table => ({ upsert: async (row, options) => {
    const fields = Object.keys(row);
    const sql = `INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map((_,i)=>`$${i+1}`).join(',')}) ON CONFLICT (${options.onConflict}) DO UPDATE SET ${fields.filter(f=>f!==options.onConflict).map(f=>`${f}=EXCLUDED.${f}`).join(',')}`;
    try { await pg.query(sql, Object.values(row)); return { error: null }; } catch (error) { return { error }; }
  } }) };
}
const migration = readFileSync(new URL('../supabase/migrations/079_bulletins_sync.sql', import.meta.url),'utf8');
test('079 archives duplicate versions, keeps newest deterministically and preserves unkeyed rows', async () => {
  const pg = await database();
  try {
    await pg.exec(`INSERT INTO bulletins(source_id,title,updated_at) VALUES ('same','old','2026-01-01'),('same','new','2026-02-01'),(NULL,'unkeyed',NULL),(NULL,'also unkeyed',NULL);`);
    await pg.exec(migration);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM bulletins')).rows[0].n,3);
    assert.equal((await pg.query("SELECT title FROM bulletins WHERE source_id='same'")).rows[0].title,'new');
    assert.equal((await pg.query("SELECT row_data->>'title' AS title FROM bulletins_duplicate_archive")).rows[0].title,'old');
    assert.equal((await pg.query("SELECT has_table_privilege('anon','bulletins_duplicate_archive','SELECT') AS allowed")).rows[0].allowed,false);
  } finally { await pg.close(); }
});
test('real PostgreSQL upsert dedupes on rerun and failure preserves last success while other feeds continue', async () => {
  const pg = await database();
  try {
    await pg.exec(migration);
    const db = client(pg);
    for (let i=0;i<2;i++) {
      const result=await syncBulletins(db,{now,feeds:[feed],fetchImpl:async()=>response(rss())});
      assert.equal(result.upserted,1);assert.equal(result.feedErrors,0);
    }
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM bulletins')).rows[0].n,1);
    const next = new Date('2026-10-04T18:00:00Z');
    const result=await syncBulletins(db,{now:next,feeds:[feed,{...feed,label:'Good',url:'https://example.org/good'}],fetchImpl:async url=>{if(url===feed.url)throw Error('offline');return response(rss());}});
    assert.equal(result.feedErrors,1);assert.equal(result.upserted,1);
    const status=(await pg.query("SELECT * FROM bulletin_feed_status WHERE feed_id='Fixture'")).rows[0];
    assert.equal(status.status,'error');assert.equal(status.error,'offline');assert.equal(new Date(status.last_success_at).toISOString(),now.toISOString());
  } finally { await pg.close(); }
});
test('malformed HTML/XML and HTTP failures are recorded; undated, invalid, old, future items are skipped', async () => {
  for (const failure of [()=>response('<html>blocked</html>'),()=>({ok:false,status:404})]) {
    const writes=[];const db={from:table=>({upsert:async row=>{writes.push({table,row});return {error:null};}})};
    const result=await syncBulletins(db,{now,feeds:[feed],fetchImpl:async()=>failure()});
    assert.equal(result.feedErrors,1);assert.equal(writes[0].row.status,'error');
  }
  for(const date of ['', 'invalid', '2025-06-01', '2026-10-05']) {
    const writes=[];const db={from:table=>({upsert:async row=>{writes.push({table,row});return {error:null};}})};
    const result=await syncBulletins(db,{now,feeds:[feed],fetchImpl:async()=>response(rss(date))});
    assert.equal(result.upserted,0);assert.equal(result.skipped,1);assert.equal(writes.length,1);
  }
});
test('upsert and status storage failures are reported and do not block following feeds',async()=>{
  let attempts=0;
  const db={from:table=>({upsert:async()=>{if(table==='bulletin_feed_status')throw Error('status unavailable'); attempts++;return {error:Error('constraint missing')};}})};
  const result=await syncBulletins(db,{now,feeds:[feed,{...feed,label:'Second'}],fetchImpl:async()=>response(rss())});
  assert.equal(attempts,2);assert.equal(result.feedErrors,2);assert.equal(result.statusErrors,2);
});
test('official HTML listing fixtures parse dates, links and titles; changed markup fails visibly',()=>{
  for (const [label,file] of [['CMS Newsroom','cms'],['BCBS Press Releases','bcbs']]) {
    const config=ALL_FEEDS.find(f=>f.label===label);
    const items=parseFeed(readFileSync(new URL(`./fixtures/bulletins/${file}.html`,import.meta.url),'utf8'),config);
    assert.equal(items.length,1);assert.match(items[0].title,/Medicare/);assert.match(items[0].link,/^https:/);assert.match(items[0].pubDate,/2026-10-01/);
    assert.throws(()=>parseFeed('<html>changed</html>',config),/could not be parsed/);
  }
});
test('empty/error database fallbacks have historical labels with original dates; UI displays status',async()=>{
  const source=readFileSync(new URL('../src/lib/sepBulletins.js',import.meta.url),'utf8').replace('import { supabase } from "./supabase.js";','const supabase = {};');
  const mod=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  for (const error of [null,Error('offline')]) {
    const db={from:()=>({select:()=>({order:()=>({limit:async()=>({data:[],error})})})})};
    const items=await mod.fetchBulletins(db);
    assert.equal(items.length,5);
    for(const item of items){assert.equal(item.historicalSample,true);assert.equal(item.kindLabel,`Historical sample · ${item.date}`);assert.match(item.date,/^2025-/);}
  }
  const ui=readFileSync(new URL('../src/components/sep/FemaFeed.jsx',import.meta.url),'utf8');
  for(const text of ['Last successful feed sync:', 'Per-feed sync status', 'Historical samples from 2025', 'feed.error', 'feed.last_success_at'])assert.ok(ui.includes(text));
});
