import { supabase } from "./supabase";

export const DSNP_INTEGRATION_PENDING = "2027 D-SNP integration status pending CMS list";

export async function hasCurrentDsnpList() {
  try {
    const { data, error } = await supabase.from("dsnp_eae_lookup")
      .select("id").eq("plan_year", 2027).limit(1);
    return !error && Boolean(data?.length);
  } catch {
    return false;
  }
}
