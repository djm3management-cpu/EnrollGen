const REQUIRED_VARS = [
  "PUBLIC_BASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_TWIML_APP_SID",
  "DEEPGRAM_API_KEY",
  "INBOUND_VENDOR_API_KEY",
  "CLERK_SECRET_KEY",
  "AGENT_WS_SIGNING_SECRET",
];

const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

function stripTrailingSlash(url) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export const config = {
  port: Number(process.env.PORT || 8080),
  publicBaseUrl: stripTrailingSlash(process.env.PUBLIC_BASE_URL),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioApiKeySid: process.env.TWILIO_API_KEY_SID,
  twilioApiKeySecret: process.env.TWILIO_API_KEY_SECRET,
  twilioTwimlAppSid: process.env.TWILIO_TWIML_APP_SID,
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || null,
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  inboundVendorApiKey: process.env.INBOUND_VENDOR_API_KEY,
  clerkSecretKey: process.env.CLERK_SECRET_KEY,
  agentWsSigningSecret: process.env.AGENT_WS_SIGNING_SECRET,
  // Inbound routing is single tenant (NGHS) in v1. Multi-tenant
  // number-to-tenant mapping is a follow-up; see README.
  defaultTenantId:
    process.env.DEFAULT_TENANT_ID || "00000000-0000-4000-8000-000000000001",
  dialTimeoutSeconds: Number(process.env.DIAL_TIMEOUT_SECONDS || 20),
};

export function publicUrl(path) {
  return `${config.publicBaseUrl}${path}`;
}

export function mediaStreamUrl() {
  return `${config.publicBaseUrl.replace(/^http/, "ws")}/media`;
}
