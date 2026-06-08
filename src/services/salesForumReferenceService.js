import { supabase } from "../lib/supabase";

const CARRIER_SELECT = [
  "id",
  "carrier_name",
  "carrier_code",
  "product_lines",
  "med_sup_plans_offered",
  "rating_type",
  "rate_guarantee_months",
  "has_policy_fee",
  "policy_fee_amount",
  "household_discount_tiers",
  "dental_bundle_discount_pct",
  "direct_underwriter_access",
  "accelerated_underwriting",
  "accel_uw_description",
  "hip_issue_age_min",
  "hip_issue_age_max",
  "hip_gi_age_min",
  "hip_gi_age_max",
  "hip_daily_benefit_range",
  "hip_lump_sum_range",
  "hip_observation_stay_coverage",
  "hip_riders",
  "hip_waiting_period_days",
  "value_added_benefits",
  "enrollment_url",
  "enrollment_platform",
  "agent_portal_url",
  "marketing_materials_url",
  "states_available",
  "notes",
].join(", ");

export async function fetchCarrierProfiles({ productLine, carrierCodes } = {}) {
  let query = supabase.from("carrier_profiles").select(CARRIER_SELECT);

  if (productLine) {
    query = query.contains("product_lines", [productLine]);
  }

  if (Array.isArray(carrierCodes) && carrierCodes.length) {
    query = query.in("carrier_code", carrierCodes);
  }

  const { data, error } = await query.order("carrier_name", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchCarrierProfileByCode(carrierCode) {
  if (!carrierCode) return null;
  const { data, error } = await supabase
    .from("carrier_profiles")
    .select(CARRIER_SELECT)
    .eq("carrier_code", String(carrierCode).toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function fetchStateExcessChargeRule(stateCode) {
  const normalized = String(stateCode || "").trim().toUpperCase();
  if (normalized.length !== 2) return null;
  const { data, error } = await supabase
    .from("state_excess_charge_rules")
    .select("state_code, state_name, excess_charges_status, limiting_percentage, statute_reference, notes")
    .eq("state_code", normalized)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function fetchBirthdayRuleState(stateCode) {
  const normalized = String(stateCode || "").trim().toUpperCase();
  if (normalized.length !== 2) return null;
  const { data, error } = await supabase
    .from("birthday_rule_states")
    .select("state_code, state_name, has_birthday_rule, window_start_days_before, window_end_days_after, plan_restriction, can_switch_carriers, statute_reference, notes")
    .eq("state_code", normalized)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}
