export const isFiveStarRating = (rating) => Number(rating) === 5;

export function applyCountyStarRatings(plans, ratings) {
  const byContractCounty = new Map(ratings.map((row) =>
    [`${row.contract_id}:${row.county_fips}`, row.overall_star_rating]));
  return plans.map((plan) => {
    const key = `${plan['Contract ID']}:${plan['County FIPS']}`;
    return byContractCounty.has(key)
      ? { ...plan, 'Overall Star Rating': byContractCounty.get(key) }
      : plan;
  });
}

// Treat the individual ratings as evidence, even if an older RPC says available.
export function normalizeFiveStarSepResult(result) {
  if (!result || !Array.isArray(result.seps)) return result;
  return {
    ...result,
    seps: result.seps.map((sep) => {
      if (!/5.star/i.test(sep?.sep_type || "")) return sep;
      const plans = (Array.isArray(sep.plans) ? sep.plans : [])
        .filter((plan) => isFiveStarRating(plan.stars));
      return { ...sep, plans, available: plans.length > 0,
        evidence: plans.length ? `${plans.length} five-star rated contract(s) available` : "No five-star plans in this area" };
    }),
  };
}
