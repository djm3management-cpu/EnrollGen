import { debugLog } from "./debugLog.js";
import { evidenceRequest } from "./evidenceApi.js";
let hasRun = false;

export async function runSessionTrackingDiagnostic(getToken) {
  if (hasRun || typeof getToken !== "function") return;
  try {
    await evidenceRequest(getToken, "evidence-session?diagnostic=1");
    hasRun = true;
  } catch {
    debugLog("Session tracking is unavailable. Check sign-in and the evidence service configuration.");
  }
}
