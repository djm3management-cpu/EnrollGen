import {securityEvent} from '../telephony/src/lib/logger.js';
import process from "node:process";

// Retired auth switches are rejected even when empty or set to "false".
// Keep this module self-contained: Railway packages telephony independently.
export function assertSafeAuthEnvironment(env = process.env, { build = false } = {}) {
  const retired = ["DISABLE_CLERK_AUTH", "VITE_DISABLE_CLERK_AUTH"];
  const hosted = ["NETLIFY", "CONTEXT", "DEPLOY_ID", "RAILWAY_ENVIRONMENT", "RAILWAY_ENVIRONMENT_ID", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "AWS_LAMBDA_FUNCTION_NAME", "VERCEL", "CI"]
    .some(name => Object.hasOwn(env, name));
  const local = !build && env.NODE_ENV === "development" && !hosted;
  const forbidden = [...retired, ...(!local ? ["ALLOW_INSECURE_WEBHOOK_TESTS"] : [])]
    .filter(name => Object.hasOwn(env, name));
  if (forbidden.length) {
    securityEvent("configuration_failed");
    throw new Error(`Unsafe authentication configuration: remove ${forbidden.join(", ")}. Auth bypass switches are retired; insecure webhook tests require local development.`);
  }
}

assertSafeAuthEnvironment();
