// Exact reviewed exceptions: synthetic fixtures and the owner-authorized active
// migration occurrence below. Active does NOT mean revoked; expiry fails verify. Each exception binds path, rule and
// SHA-256; a changed value or a copy to another path fails. Never paste secrets.
export const secretAllowlist = [
  // Owner confirmed live production use; rotation scheduled after 2026-12-07.
  // One path, line, column, type and fingerprint only; no value is stored.
  {
    "path": "supabase/migrations/007_multi_tenant_foundation.sql",
    "line": 67,
    "column": 4,
    "type": "webhook-capability",
    "sha256": "0f55e8e37a674947e1f2a741fdc03110fd07a66aa93b7c4b9fb666d00b96c3ef",
    "status": "active, rotation pending",
    "reason": "historical migration cannot be edited; live production webhook",
    "reviewBy": "2026-12-15",
    "initialReviewBy": "2026-12-15"
  },
  {
    "path": "scripts/pilot/local-load.mjs",
    "type": "twilio-secret",
    "sha256": "37c983e93fdf7026ade9eed6c255e974550a7adf028e605a2680a83746a5389b",
    "reason": "Synthetic fakeVars used only behind the local-load external-network fence."
  },
  {
    "path": "scripts/pilot/local-load.mjs",
    "type": "twilio-secret",
    "sha256": "146595bc4987d0ebdc59e315d172095b28165c5a6338e80288352a06367fb276",
    "reason": "Synthetic fakeVars used only behind the local-load external-network fence."
  },
  {
    "path": "scripts/pilot/local-load.mjs",
    "type": "deepgram-key",
    "sha256": "37c983e93fdf7026ade9eed6c255e974550a7adf028e605a2680a83746a5389b",
    "reason": "Synthetic fakeVars used only behind the local-load external-network fence."
  },
  {
    "path": "scripts/pilot/local-load.mjs",
    "type": "provider-credential",
    "sha256": "9fb894fe62c590c908697bb6b67370be33dd36cb286d5375cd2f3f80436558d3",
    "reason": "Synthetic fakeVars used only behind the local-load external-network fence."
  },
  {
    "path": "scripts/pilot/local-load.mjs",
    "type": "signing-secret",
    "sha256": "8830979c0653e67763e7eb53e046eb29bf4a921830da284076b87a041c405606",
    "reason": "Synthetic fakeVars used only behind the local-load external-network fence."
  },
  {
    "path": "telephony/tests/fixtures/deployment-profile.json",
    "type": "signing-secret",
    "sha256": "49914f9201f5f0fa38dcb274250c16658983ad6771ee65bace7ae49b21a6fcbf",
    "reason": "Synthetic negative-test credential, fake signature secret or rejected connection URL; external-network fence active."
  },
  {
    "path": "telephony/tests/fixtures/deployment-profile.json",
    "type": "signing-secret",
    "sha256": "9d74f3ba52ba5adcb907a264a544a7991d67509d4b923709d9956b5c5f636954",
    "reason": "Synthetic negative-test credential, fake signature secret or rejected connection URL; external-network fence active."
  },
  {
    "path": "telephony/tests/vendorIntegrations.test.js",
    "type": "password-connection-string",
    "sha256": "d88f84291a4085c5aa7a5c1aab71a7baf64065e805c8c2c60c51aabf7ec55af9",
    "reason": "Synthetic negative-test credential, fake signature secret or rejected connection URL; external-network fence active."
  },
  {
    "path": "telephony/tests/wsToken.test.js",
    "type": "signing-secret",
    "sha256": "ff06494b0714b59cb2cd7bdb2412fd33f4e4360ec4118763fe24926b1545ad78",
    "reason": "Synthetic negative-test credential, fake signature secret or rejected connection URL; external-network fence active."
  },
  {
    "path": "tests/deployment-profile.test.js",
    "type": "password-connection-string",
    "sha256": "d840eab7e36b8a53b80815e0399dffa17cb444c158c807a263348dce7c45923c",
    "reason": "Synthetic negative-test credential, fake signature secret or rejected connection URL; external-network fence active."
  },
  {
    "path": "tests/evidence-access.test.js",
    "type": "signing-secret",
    "sha256": "cef3f6d62473ba1a9cc3ac16873b3977234b5997d3d89ec144f3ea1cf4bb5c22",
    "reason": "Synthetic negative-test credential, fake signature secret or rejected connection URL; external-network fence active."
  },
  {
    "path": "tests/fixtures/deployment-profile.json",
    "type": "signing-secret",
    "sha256": "49914f9201f5f0fa38dcb274250c16658983ad6771ee65bace7ae49b21a6fcbf",
    "reason": "Synthetic negative-test credential, fake signature secret or rejected connection URL; external-network fence active."
  },
  {
    "path": "tests/fixtures/deployment-profile.json",
    "type": "signing-secret",
    "sha256": "9d74f3ba52ba5adcb907a264a544a7991d67509d4b923709d9956b5c5f636954",
    "reason": "Synthetic negative-test credential, fake signature secret or rejected connection URL; external-network fence active."
  },
  {
    "path": "tests/integrations-diagnostics.test.js",
    "type": "password-connection-string",
    "sha256": "9bc5178425296b9515fb7fc6ef2b295d8406a2075be864763d53758fa706aa77",
    "reason": "Synthetic negative-test credential, fake signature secret or rejected connection URL; external-network fence active."
  },
  {
    "path": "tests/pilot-limits.test.js",
    "type": "password-connection-string",
    "sha256": "b4e04f234db382b6578a92614785a5ba06cf98be9df62a868daf641282e50a3b",
    "reason": "Synthetic negative-test credential, fake signature secret or rejected connection URL; external-network fence active."
  },
  {
    "path": "tests/scoring-integrity.test.js",
    "type": "signing-secret",
    "sha256": "639bc3dfbd0e648365d033aa453b410a6e107a270a45a60d70e777d89319155f",
    "reason": "Synthetic negative-test credential, fake signature secret or rejected connection URL; external-network fence active."
  },
  {
    "path": "tests/scoring-integrity.test.js",
    "type": "signing-secret",
    "sha256": "12fec37cb209eedc4a4f5bc4af09f8d05ad40064101c186e77935ffc4a582e92",
    "reason": "Synthetic negative-test credential, fake signature secret or rejected connection URL; external-network fence active."
  },
  {
    "path": "tests/supabase-api-keys.test.js",
    "type": "supabase-service-key",
    "sha256": "65cd0abe321c15b7d530251afe7dc8fc14f743e814b9b4cfe1c80d7712b0a341",
    "reason": "Synthetic negative-test credential, fake signature secret or rejected connection URL; external-network fence active."
  },
  {
    "path": "tests/supabase-api-keys.test.js",
    "type": "provider-credential",
    "sha256": "bdcddf3a6990849de193942c744ad4dadba72d9aadca661bb04d31f7d2b2b4c7",
    "reason": "Synthetic negative-test credential, fake signature secret or rejected connection URL; external-network fence active."
  }
];
