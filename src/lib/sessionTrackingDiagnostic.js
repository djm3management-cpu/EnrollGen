import { supabase } from "./supabase";

const SESSION_TRACKING_TABLES = [
  "enrolled_agents",
  "sessions",
  "compliance_flags",
  "section_scores",
];

let hasRun = false;

export async function runSessionTrackingDiagnostic() {
  if (hasRun) return;
  hasRun = true;

  let missingTables = false;

  for (const table of SESSION_TRACKING_TABLES) {
    try {
      const { error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .limit(1);

      if (error) {
        const message = (error.message || "").toLowerCase();
        if (
          error.code === "42P01" ||
          message.includes("does not exist") ||
          message.includes("not found") ||
          message.includes("relation")
        ) {
          missingTables = true;
          break;
        }
      }
    } catch {
      missingTables = true;
      break;
    }
  }

  if (missingTables) {
    console.warn(
      "[EnrollGen] Session tracking tables not found in Supabase. Run supabase/migrations/001_session_tracking.sql in the SQL Editor."
    );
    return;
  }

  try {
    const { data, error } = await supabase
      .from("enrolled_agents")
      .select("clerk_user_id")
      .limit(50);

    if (!error && Array.isArray(data) && data.length > 0) {
      const allPlaceholder = data.every(
        (row) => !row.clerk_user_id || row.clerk_user_id === "self"
      );
      if (allPlaceholder) {
        console.warn(
          "[EnrollGen] enrolled_agents contains placeholder clerk_user_id values. Configure Clerk JWT template for Supabase to enable per-agent session tracking."
        );
      }
    }
  } catch {
    // Diagnostic only, never block the app on these checks.
  }
}
