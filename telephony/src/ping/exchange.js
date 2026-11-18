// Pure mirror of the exchange selection in SQL exchange_ping (migration 176).
// No I/O. Spec section 9: priority_waterfall, weighted_rotation (smooth
// weighted round robin) and highest_price; ties go to the least recently won.

export const STRATEGIES = Object.freeze(['priority_waterfall', 'weighted_rotation', 'highest_price']);

const time = value => (value == null ? -Infinity : new Date(value).getTime());
// Byte order, as the SQL tie break on campaign_id::text.
const byText = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
const num = value => (value == null || value === '' ? null : Number(value));

/**
 * candidates: accepting candidates [{campaign_id, priority, weight, price, last_won}].
 * rotationState: {campaign_id: current weight} for weighted_rotation.
 * committed: a campaign that already holds this call inside the 30 second
 * commitment; it ranks first and leaves the rotation untouched.
 * failed: campaign ids whose real decision lost a race; the winner is the
 * best ranked candidate not in this list.
 * Returns {winner, ranking, rotationState}.
 */
export function selectWinner({ strategy, candidates = [], rotationState = {}, committed = null, failed = [] }) {
  if (!STRATEGIES.includes(strategy)) throw new Error(`Unknown exchange strategy ${strategy}`);
  const state = { ...rotationState };
  const total = candidates.reduce((sum, candidate) => sum + Number(candidate.weight), 0);
  const scored = candidates.map(candidate => ({
    ...candidate,
    current: (num(state[candidate.campaign_id]) ?? 0) + Number(candidate.weight),
  }));
  const primary = (a, b) => {
    if (strategy === 'priority_waterfall') return a.priority - b.priority;
    if (strategy === 'highest_price') {
      const [pa, pb] = [num(a.price), num(b.price)];
      if (pa === pb) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return pb - pa;
    }
    return b.current - a.current;
  };
  const ranking = scored.sort((a, b) =>
    (b.campaign_id === committed) - (a.campaign_id === committed) || primary(a, b) ||
    time(a.last_won) - time(b.last_won) || byText(a.campaign_id, b.campaign_id))
    .map(candidate => candidate.campaign_id);
  // The real decision is tried for the best candidate, then the next best once.
  const winner = ranking.slice(0, 2).find(id => !failed.includes(id)) ?? null;
  if (strategy === 'weighted_rotation' && winner && winner !== committed) {
    for (const candidate of scored) {
      state[candidate.campaign_id] = candidate.current - (candidate.campaign_id === winner ? total : 0);
    }
  }
  return { winner, ranking, rotationState: state };
}

/**
 * Mirror of the cap check: accepted, non-replayed exchange decisions in the
 * buyer's own day and hour. Daily is checked first. Returns null when under
 * both caps, else {reason: 'buyer_cap_reached', scope}.
 */
export function capCheck({ dailyCap = null, hourlyCap = null, dailyCount = 0, hourlyCount = 0 }) {
  if (dailyCap != null && dailyCount >= dailyCap) return { reason: 'buyer_cap_reached', scope: 'daily' };
  if (hourlyCap != null && hourlyCount >= hourlyCap) return { reason: 'buyer_cap_reached', scope: 'hourly' };
  return null;
}

/** Mirror of platform_record_usage for pings: free inside the monthly allowance. */
export function pingUnitPrice({ plan, usedThisMonth }) {
  if (!plan) return 0;
  return usedThisMonth + 1 <= plan.included_pings ? 0 : Number(plan.overage_per_ping);
}
