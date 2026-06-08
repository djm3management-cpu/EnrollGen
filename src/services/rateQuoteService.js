// Rate quote service - CSG Actuarial integration
// API credentials pending from SMS partnership.
// Set VITE_CSG_API_KEY and VITE_CSG_API_URL in .env to activate.

export const CSG_ENABLED = Boolean(import.meta.env.VITE_CSG_API_KEY);

function normalizeRate(rate = {}) {
  const monthlyPremium = Number(rate.monthlyPremium ?? rate.monthly_premium);
  return {
    carrier: rate.carrier || rate.carrier_name || "Unknown carrier",
    carrierCode: rate.carrierCode || rate.carrier_code || null,
    planLetter: rate.planLetter || rate.plan_letter || "",
    monthlyPremium: Number.isFinite(monthlyPremium) ? monthlyPremium : null,
    annualPremium: Number.isFinite(monthlyPremium)
      ? monthlyPremium * 12
      : Number(rate.annualPremium ?? rate.annual_premium) || null,
    ratingType: rate.ratingType || rate.rating_type || "",
    discountsAvailable: rate.discountsAvailable || rate.discounts_available || null,
  };
}

export async function fetchMedSupRates({
  zipCode,
  age,
  gender,
  tobaccoUse,
  planLetter,
} = {}) {
  if (!CSG_ENABLED) {
    return {
      source: "manual",
      rates: [],
      message: "CSG integration pending activation",
    };
  }

  try {
    const response = await fetch(`${import.meta.env.VITE_CSG_API_URL}/rates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_CSG_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ zipCode, age, gender, tobaccoUse, planLetter }),
    });

    if (!response.ok) {
      throw new Error(`CSG rate fetch failed with HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      source: "csg",
      rates: (data.rates || []).map(normalizeRate).sort((a, b) => {
        const left = Number.isFinite(a.monthlyPremium) ? a.monthlyPremium : Infinity;
        const right = Number.isFinite(b.monthlyPremium) ? b.monthlyPremium : Infinity;
        return left - right;
      }),
    };
  } catch (error) {
    console.error("CSG rate fetch failed:", error);
    return { source: "error", rates: [], message: error.message };
  }
}

export function isCsgEnabled() {
  return CSG_ENABLED;
}
