import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const repair = await readFile(new URL('../../scripts/repair-transcription-schema.sql', import.meta.url), 'utf8');
for (const variant of ['live', 'original']) {
  test(`schema repair supports ${variant} tables, keeps data and policies, and is repeatable`, async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS
          $$ SELECT jsonb_build_object('sub', current_setting('app.user_id', true)) $$;
        CREATE TABLE enrolled_agents(id uuid PRIMARY KEY, clerk_user_id text, role text);
        INSERT INTO enrolled_agents VALUES ('00000000-0000-4000-8000-000000000001','user_a','agent');
        CREATE TABLE sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_id uuid,
          created_at timestamptz DEFAULT now(), tenant_id uuid);
      `);
      if (variant === 'live') {
        await db.exec(`
          ALTER TABLE sessions ADD COLUMN product_line text NOT NULL;
          CREATE TABLE user_preferences(user_id text PRIMARY KEY, theme text NOT NULL DEFAULT 'system',
            preferences jsonb NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
          INSERT INTO user_preferences(user_id,theme,preferences) VALUES ('user_a','dark','{"keep":true}');
          INSERT INTO sessions(product_line) VALUES ('MA');
          ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
          CREATE POLICY self ON user_preferences TO authenticated
            USING(user_id=auth.jwt()->>'sub') WITH CHECK(user_id=auth.jwt()->>'sub');
        `);
      } else {
        await db.exec(`
          ALTER TABLE sessions ADD COLUMN flow text NOT NULL CHECK(flow IN ('ma','medsup','aca','u65'));
          CREATE TABLE user_preferences(clerk_user_id text PRIMARY KEY,
            theme_preference text NOT NULL DEFAULT 'light' CHECK(theme_preference IN ('light','dark')),
            created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
          INSERT INTO user_preferences(clerk_user_id,theme_preference) VALUES ('user_a','dark');
          INSERT INTO sessions(flow) VALUES ('ma');
          ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
          CREATE POLICY self ON user_preferences TO authenticated
            USING(clerk_user_id=auth.jwt()->>'sub') WITH CHECK(clerk_user_id=auth.jwt()->>'sub');
        `);
      }
      await db.exec(repair);
      await db.exec(repair);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n, 1);
      assert.deepEqual((await db.query('SELECT flow,product_line FROM sessions')).rows[0], {flow:'ma',product_line:'MA'});
      const pref = (await db.query('SELECT * FROM user_preferences')).rows[0];
      assert.equal(pref.clerk_user_id, 'user_a');
      assert.equal(pref.theme_preference, 'dark');
      if (variant === 'live') assert.deepEqual(pref.preferences, {keep:true});
      await db.exec(`INSERT INTO sessions(flow) VALUES ('medsup');
        UPDATE sessions SET ended_at=now(),completed=true,duration_seconds=45,final_section=2 WHERE flow='medsup';`);
      assert.equal((await db.query("SELECT product_line FROM sessions WHERE flow='medsup'")).rows[0].product_line, 'MedSup');
      await db.exec(`GRANT SELECT,INSERT,UPDATE ON user_preferences TO authenticated;
        GRANT USAGE ON SCHEMA auth TO authenticated;
        SET ROLE authenticated; SET app.user_id='user_a';
        INSERT INTO user_preferences(clerk_user_id,theme_preference) VALUES ('user_a','light')
          ON CONFLICT(clerk_user_id) DO UPDATE SET theme_preference=excluded.theme_preference;`);
      assert.equal((await db.query('SELECT theme FROM user_preferences')).rows[0].theme, 'light');
      await assert.rejects(db.exec("INSERT INTO user_preferences(clerk_user_id,theme_preference) VALUES ('other','dark')"), /row-level security/);
      await db.exec(`RESET ROLE;
        INSERT INTO user_preferences(user_id,theme) VALUES ('user_b','dark');
        INSERT INTO call_logs(call_id,agent_id,started_at,ended_at,duration_seconds)
          VALUES ('call-test','00000000-0000-4000-8000-000000000001',now(),now(),1);`);
      assert.equal((await db.query("SELECT theme_preference FROM user_preferences WHERE user_id='user_b'")).rows[0].theme_preference, 'dark');
      assert.equal((await db.query('SELECT count(*)::int AS n FROM call_logs')).rows[0].n, 1);
    } finally { await db.close(); }
  });
}
