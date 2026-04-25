import { supabase } from "./supabase";

export async function logTrainingCompletion({
  agentId = null,
  agentName = null,
  productType = "MA",
  durationSeconds = null,
  sectionsCompleted = null,
  notes = null,
} = {}) {
  try {
    const payload = {
      agent_id: agentId,
      agent_name: agentName,
      product_type: productType,
      duration_seconds: durationSeconds,
      sections_completed: sectionsCompleted,
      notes,
    };

    const { error } = await supabase
      .from("training_completions")
      .insert(payload);

    if (error) {
      console.warn(
        "[EnrollGen] Failed to log training completion:",
        error.message || error
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      "[EnrollGen] Failed to log training completion:",
      err?.message || err
    );
    return false;
  }
}
