// PGlite load target for the ping load runner (S8a): the S8 harness database
// (migrations through 184) with the S3 exchange buyers, the S2 direct
// publisher and extra synthetic agents so accepts keep happening. One
// connection: a decision cost baseline, never a concurrency proof.
/** In-process baseline: the S8 harness plus extra agents so accepts keep happening. */
export async function pgliteLoadTarget({ extraAgents = 9 } = {}) {
  const { createS8Db, S8_FEATURES } = await import('./pingS8Db.js');
  const { setFeatures } = await import('./pingDb.js');
  const { seedExchange, OP, BUYERS } = await import('./exchangeDb.js');
  const { seedPublisherB, B } = await import('./pingS2Db.js');
  const db = await createS8Db();
  await setFeatures(db, S8_FEATURES);
  const exchange = await seedExchange(db);
  const direct = await seedPublisherB(db);
  let npn = 0;
  const addAgents = async (tenant, campaigns, states, carriers, prefix, count) => {
    for (let i = 0; i < count; i++) {
      const slug = `${prefix}_${i}`;
      await db.query('INSERT INTO tenant_agents(tenant_id,name,npn,agent_slug,is_active) VALUES($1,$2,$3,$4,true)',
        [tenant, `Synthetic ${slug}`, String(97000000 + (npn += 1)), slug]);
      await db.query(`INSERT INTO agent_availability(agent_id,agent_name,status,available) VALUES($1,$1,'available',true)`, [slug]);
      for (const campaign of campaigns) {
        await db.query(`INSERT INTO agent_campaign_carriers(tenant_id,campaign_id,plan_year,agent_id,state,carrier,updated_by)
          SELECT $1,$2,2027,a.id,s.state,c.carrier,'load' FROM tenant_agents a CROSS JOIN unnest($3::text[]) s(state)
          CROSS JOIN unnest($4::text[]) c(carrier) WHERE a.agent_slug=$5`, [tenant, campaign, states, carriers, slug]);
      }
    }
  };
  for (const [key, buyer] of Object.entries(BUYERS)) {
    await addAgents(buyer.tenant, [exchange[key]], ['TX', 'FL'], ['aetna'], `load_${key}`, extraAgents);
  }
  await addAgents(B.tenant, Object.values(direct), ['KS', 'MO'], B.carriers, 'load_direct', extraAgents - 1);
  return {
    kind: 'pglite-single-connection',
    query: async (sql, args) => (await db.query(sql, args)).rows,
    exchangeKeyHash: OP.hash, directKeyHash: B.hash, directCampaign: 'ma-central',
    states: ['TX', 'FL'], directStates: ['KS', 'MO'], maxInFlight: 1, churnMs: 2000,
    close: () => db.close(),
  };
}
