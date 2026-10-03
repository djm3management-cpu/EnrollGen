import { supabaseCms } from "./supabase";
import { getQueryEmbedding } from "./embeddings";
import { DSNP_INTEGRATION_PENDING, hasCurrentDsnpList } from "./dsnpIntegration";

/** Retrieve only current-year CMS plans in the selected county. */
export async function fetchCmsPlanReferences({ query, state, county, getToken, matchCount = 3 } = {}) {
  const text = String(query || "").trim();
  const stateCode = String(state || "").trim().toUpperCase();
  const countyName = String(county || "").trim();
  if (!text || !/^[A-Z]{2}$/.test(stateCode) || !countyName) {
    return { results: [], contextBlock: "", sources: [], error: null };
  }
  try {
    const embedding = await getQueryEmbedding(text, getToken);
    const { data, error } = await supabaseCms.rpc("match_cms_plans_py2027_area", {
      query_embedding: embedding,
      p_state: stateCode,
      p_county: countyName,
      match_count: Math.min(Math.max(matchCount, 1), 5),
    });
    if (error) throw error;
    const results = Array.isArray(data)
      ? data.filter((row) => Number(row.similarity) >= 0.72)
      : [];
    const hasDsnp = results.some((row) => /D-SNP|Dual-Eligible/i.test(row.content || ""));
    const dsnpPending = hasDsnp && !(await hasCurrentDsnpList());
    return {
      results,
      sources: results.map((row, index) => `PY2027 CMS plan P${index + 1} (row ${row.plan_id})`),
      contextBlock: results.length
        ? [
            `## PY2027 CMS landscape plans for ${countyName}, ${stateCode}`,
            "These CMS landscape entries are county specific. Ratings and MA medical deductibles may be unavailable. Verify benefits and enrollment details with the current Summary of Benefits.",
            ...(dsnpPending ? [DSNP_INTEGRATION_PENDING + "."] : []),
            ...(hasDsnp ? ["Do not infer affiliated Medicaid MCO or exclusive aligned enrollment from the landscape or integration level. Verify both with the carrier."] : []),
            ...results.map((row, index) => `[P${index + 1}] ${row.content}`),
            "Cite [P#] when using these plan facts.",
          ].join("\n")
        : "",
      error: null,
    };
  } catch (error) {
    return { results: [], contextBlock: "", sources: [], error: error.message || String(error) };
  }
}
