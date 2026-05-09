import { supabase } from "./supabase";

/**
 * State-based exchange states that have their own tables (no county-level data).
 * All other states use the federal qhp_landscape_2026 table.
 */
const SBE_TABLES = {
  NJ: "sbe_plans_nj_2025",
  PA: "sbe_plans_pa_2025",
  VA: "sbe_plans_va_2025",
};

function parseDollar(val) {
  if (!val || typeof val !== "string") return null;
  const n = parseFloat(val.replace(/[$,]/g, ""));
  return isNaN(n) ? null : n;
}

function rangeStr(nums) {
  const valid = nums.filter((n) => n !== null && n > 0);
  if (!valid.length) return "N/A";
  const lo = Math.min(...valid);
  const hi = Math.max(...valid);
  if (lo === hi) return `$${lo.toLocaleString()}`;
  return `$${lo.toLocaleString()} – $${hi.toLocaleString()}`;
}

function summarizeTiers(rows, premiumCol, deductibleCol, moopCol) {
  const tiers = {};
  for (const row of rows) {
    const metal = row.metal_level || "Unknown";
    if (!tiers[metal]) tiers[metal] = { count: 0, premiums: [], deductibles: [], moops: [] };
    tiers[metal].count++;
    if (premiumCol) tiers[metal].premiums.push(parseDollar(row[premiumCol]));
    if (deductibleCol) tiers[metal].deductibles.push(parseDollar(row[deductibleCol]));
    if (moopCol) tiers[metal].moops.push(parseDollar(row[moopCol]));
  }

  const tierOrder = ["Catastrophic", "Expanded Bronze", "Bronze", "Silver", "Gold", "Platinum"];
  const sorted = Object.entries(tiers).sort(
    ([a], [b]) => (tierOrder.indexOf(a) === -1 ? 99 : tierOrder.indexOf(a)) -
                  (tierOrder.indexOf(b) === -1 ? 99 : tierOrder.indexOf(b))
  );

  return sorted.map(([metal, data]) => ({
    metal,
    planCount: data.count,
    premiumRange: data.premiums.length ? rangeStr(data.premiums) : null,
    deductibleRange: rangeStr(data.deductibles),
    moopRange: data.moops.length ? rangeStr(data.moops) : null,
  }));
}

/**
 * Fetch plan summary for a given state (and optional county for federal exchange states).
 * Returns { source, totalPlans, tiers: [{ metal, planCount, premiumRange, deductibleRange, moopRange }] }
 * or null on error / no data.
 */
export async function lookupPlanSummary(stateCode, county) {
  const st = (stateCode || "").toUpperCase().trim();
  if (!st) return null;

  try {
    if (SBE_TABLES[st]) {
      // State-based exchange, no county filter, no premium data
      const { data, error } = await supabase
        .from(SBE_TABLES[st])
        .select("metal_level, tehb_ded_inn_tier_1_individual, tehb_inn_tier_1_individual_moop")
        .eq("market_coverage", "Individual")
        .not("metal_level", "eq", "");

      if (error || !data?.length) return null;

      const tiers = summarizeTiers(
        data, null, "tehb_ded_inn_tier_1_individual", "tehb_inn_tier_1_individual_moop"
      );
      return {
        source: `SBE (${st})`,
        totalPlans: data.length,
        hasPremiums: false,
        tiers,
      };
    }

    // Federal exchange, filter by state + county
    let query = supabase
      .from("qhp_landscape_2026")
      .select("metal_level, premium_adult_individual_age_27, medical_deductible_individual_standard, medical_maximum_out_of_pocket_individual_standard")
      .eq("state_code", st);

    if (county) {
      query = query.ilike("county_name", county.trim());
    }

    const { data, error } = await query;
    if (error || !data?.length) return null;

    const tiers = summarizeTiers(
      data,
      "premium_adult_individual_age_27",
      "medical_deductible_individual_standard",
      "medical_maximum_out_of_pocket_individual_standard"
    );
    return {
      source: county ? `QHP (${st}, ${county})` : `QHP (${st})`,
      totalPlans: data.length,
      hasPremiums: true,
      tiers,
    };
  } catch (err) {
    console.error("[acaPlanLookup] Error:", err);
    return null;
  }
}

/**
 * Format the summary into a concise text block for copilot prompt injection.
 */
export function formatPlanSummaryForPrompt(summary) {
  if (!summary) return "";

  const lines = [
    `PLAN DATA (${summary.source}): ${summary.totalPlans} plans available`,
  ];

  for (const t of summary.tiers) {
    let line = `  ${t.metal}: ${t.planCount} plans`;
    if (t.premiumRange) line += ` | Premium (age 27): ${t.premiumRange}`;
    line += ` | Deductible: ${t.deductibleRange}`;
    if (t.moopRange) line += ` | MOOP: ${t.moopRange}`;
    lines.push(line);
  }

  return lines.join("\n");
}
