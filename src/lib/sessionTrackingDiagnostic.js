import { evidenceRequest } from "./evidenceApi.js";
let hasRun = false;

export async function runSessionTrackingDiagnostic(getToken) {
  if (hasRun || typeof getToken !== "function") return;
  try {
    await evidenceRequest(getToken, "evidence-session?diagnostic=1");
    hasRun = true;
  } catch {
    console.warn("Session tracking is unavailable. Check sign-in and the evidence service configuration.");
  }
}
