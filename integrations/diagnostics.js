// Never persist stack traces, request/response bodies, headers, or arbitrary error text.
// Known local exceptions retain their exact message; unknown exceptions retain only
// safe machine codes. This prevents vendor errors from echoing credentials or PII.
const messages = new Set([
  'Report mail not configured', 'Config unavailable', 'DNS timeout', 'Delivery timeout',
  'Non-public destination', 'HTTPS public endpoint required', 'Invalid URL',
  'Invalid time value', 'Invalid field map', 'Unsafe or duplicate field mapping',
  'Unknown mapped field', 'Forbidden vendor field',
]);
const codes = new Set(['ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT',
  'EPIPE','ERR_INVALID_URL','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT','ERR_TLS_CERT_ALTNAME_INVALID']);
const providerNames = new Set(['validation_error','missing_api_key','invalid_api_key',
  'restricted_api_key','rate_limit_exceeded','daily_quota_exceeded','monthly_quota_exceeded',
  'invalid_from_address','invalid_to_address','not_found','application_error','internal_server_error',
  'invalid_access','validation_error','invalid_parameter','missing_required_field',
  'invalid_idempotency_key','invalid_attachment','invalid_region','concurrent_idempotent_requests',
  'suspended_api_key','invalid_permission','invalid_idempotent_request','missing_required_parameter','idempotency_key_in_use']);
export function deliveryDiagnostic(error, { env = {}, provider = false } = {}) {
  const diagnostic = {
    name: ['Error','TypeError','RangeError','SyntaxError'].includes(error?.name) ? error.name : 'Error',
    message: messages.has(error?.message) ? error.message : 'Error text withheld (may contain secrets or personal data)',
  };
  if (codes.has(error?.code) || /^[0-9A-Z]{5}$/.test(error?.code ?? '')) diagnostic.code = error.code;
  if (provider && providerNames.has(error?.name)) {
    diagnostic.code = error.name;
    if (/domain.*not verified/i.test(error?.message ?? '')) diagnostic.message = 'Resend sender domain is not verified';
    else if (/only send testing emails/i.test(error?.message ?? '')) diagnostic.message = 'Resend test sender restricts recipients';
    else if (/API key is invalid/i.test(error?.message ?? '')) diagnostic.message = 'Resend API key is invalid';
  }
  if (error?.message === 'Report mail not configured') {
    diagnostic.missing_env = ['RESEND_API_KEY','INTEGRATIONS_REPORT_FROM'].filter(key => !env[key]);
  }
  return diagnostic;
}
