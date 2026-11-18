// Ping platform load runner (S8a). Drives ping_decide and exchange_ping at a
// fixed open loop rate for a fixed duration through any executor
// (query(sql, args) -> rows) and reports client latency percentiles, error
// rate, reasons and double reservations. Used by scripts/ping_load.js (PGlite
// baseline or a staging database) and by tests/pingLoadBaseline.test.js.
// Synthetic phones only; nothing here prints a key or a connection string.

export const percentile = (values, p) => (values.length
  ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * p) - 1))]
  : null);

const round = value => (value == null ? null : Math.round(value * 10) / 10);

/** Live reservations on the same agent whose windows overlap, created since `since`. Must be zero. */
export const DOUBLE_RESERVATION_SQL = `SELECT count(*)::int AS n FROM ping_reservations a JOIN ping_reservations b
  ON a.agent_id=b.agent_id AND a.id<b.id AND a.created_at<b.expires_at AND b.created_at<a.expires_at
  WHERE a.created_at>=$1 AND b.created_at>=$1 AND a.consumed_call_sid IS NULL AND b.consumed_call_sid IS NULL`;

/**
 * options: rate (pings per second), durationSeconds, exchangeShare (0..1),
 * exchangeKeyHash, directKeyHash, directCampaign (null for the single active
 * one), states (exchange states), directStates, maxInFlight, churnMs (expire
 * reservations older than this, to emulate transfers; null to keep them),
 * runId (prefix for call ids), now.
 */
export async function runPingLoad(query, options) {
  const {
    rate, durationSeconds, exchangeShare = 0.5, exchangeKeyHash, directKeyHash, directCampaign = null,
    states = ['TX', 'FL'], directStates = ['KS', 'MO'], maxInFlight = 64, churnMs = null,
    runId = `load-${Date.now().toString(36)}`, now = () => performance.now(),
  } = options;
  if (!(rate > 0 && rate <= 200)) throw new Error('rate must be 1 to 200 pings per second');
  if (!(durationSeconds > 0 && durationSeconds <= 1800)) throw new Error('duration must be 1 to 1800 seconds');
  const [{ started_at: startedAt }] = await query('SELECT clock_timestamp() AS started_at', []);
  const total = Math.round(rate * durationSeconds);
  const latency = { exchange: [], direct: [] };
  const reasons = {}; let errors = 0; let accepted = 0; let inFlight = 0; let skipped = 0; let sent = 0;
  const pending = new Set();
  const begin = now();

  const one = async index => {
    // Exactly exchangeShare of the pings go to the exchange, spread evenly.
    const exchange = Math.floor((index + 1) * exchangeShare) > Math.floor(index * exchangeShare);
    const useExchange = Boolean(exchangeKeyHash) && (!directKeyHash || exchange);
    const phone = `+1555${String(1000000 + (index % 9000000)).padStart(7, '0')}`;
    const pool = useExchange ? states : directStates;
    const payload = { phone, state: pool[index % pool.length], call_id: `${runId}-${index}`, routing_enabled: true };
    const t0 = now();
    try {
      const rows = useExchange
        ? await query('SELECT exchange_ping($1,$2) AS r', [exchangeKeyHash, payload])
        : await query('SELECT ping_decide($1,$2,$3,$4) AS r', [directKeyHash, directCampaign, payload, 'generic']);
      const result = rows[0].r;
      latency[useExchange ? 'exchange' : 'direct'].push(now() - t0);
      if (!result || result.authorized === false || result.status === 'disabled') throw new Error('not admitted');
      reasons[result.reason] = (reasons[result.reason] || 0) + 1;
      if (result.reason === 'error_rejected') errors++;
      if (result.available) accepted++;
    } catch {
      latency[useExchange ? 'exchange' : 'direct'].push(now() - t0);
      errors++;
    }
  };

  let churnTimer = null;
  if (churnMs != null) {
    churnTimer = setInterval(() => {
      void query(`UPDATE ping_reservations SET expires_at=clock_timestamp()
        WHERE consumed_call_sid IS NULL AND expires_at>clock_timestamp()
          AND created_at<clock_timestamp()-make_interval(secs=>$1)`, [churnMs / 1000]).catch(() => {});
    }, Math.max(100, churnMs / 2));
  }
  try {
    for (let index = 0; index < total; index++) {
      const due = begin + (index * 1000) / rate;
      const wait = due - now();
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      if (inFlight >= maxInFlight) { skipped++; continue; }
      inFlight++; sent++;
      const task = one(index).finally(() => { inFlight--; pending.delete(task); });
      pending.add(task);
    }
    await Promise.all(pending);
  } finally { if (churnTimer) clearInterval(churnTimer); }
  const elapsed = (now() - begin) / 1000;
  const [{ n: doubles }] = await query(DOUBLE_RESERVATION_SQL, [startedAt]);
  const all = [...latency.exchange, ...latency.direct];
  const summary = values => ({ count: values.length, p50_ms: round(percentile(values, 0.5)),
    p95_ms: round(percentile(values, 0.95)), p99_ms: round(percentile(values, 0.99)),
    max_ms: round(values.length ? Math.max(...values) : null) });
  return {
    target_rate: rate, duration_seconds: durationSeconds, planned: total, sent, skipped_over_in_flight_cap: skipped,
    achieved_rate: round(sent / elapsed), elapsed_seconds: round(elapsed),
    latency: { all: summary(all), exchange: summary(latency.exchange), direct: summary(latency.direct) },
    error_rate: sent ? Math.round((errors / sent) * 10000) / 10000 : null, errors, accepted, reasons,
    double_reservations: doubles,
    spec_target: { p95_ms_under: 1000, rate: 50, met: Boolean(rate >= 50 && sent / elapsed >= 49
      && percentile(all, 0.95) < 1000 && doubles === 0 && errors === 0) },
  };
}
