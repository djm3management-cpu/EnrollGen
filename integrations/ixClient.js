import {providerJson} from '../telephony/src/recordings.js';

export function ixConfiguration(env = process.env) {
  const environment = env.IX_ENV || 'test';
  if (!['test', 'production'].includes(environment)) throw Error('invalid_ix_environment');
  const origin = environment === 'production' ? 'https://api.sunfirematrix.com' : 'https://test-api.sunfirematrix.com';
  return {environment, authUrl: `${origin}/v2/authenticate`, baseUrl: `${origin}/api`,
    username: env.IX_USERNAME || '', password: env.IX_PASSWORD || ''};
}

export class IxError extends Error {
  constructor(code, {outcome = 'retry', providerMessage = ''} = {}) {
    super(code);
    this.outcome = outcome;
    this.providerMessage = providerMessage;
  }
}

// Vendor messages are stored separately from machine error codes and never logged.
export function safeIxMessage(message, secrets = []) {
  let text = typeof message === 'string' ? message : '';
  for (const secret of secrets.filter(Boolean)) text = text.split(secret).join('[redacted]');
  return text.replace(/https?:\/\/\S+/gi, '[url]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    // eslint-disable-next-line no-control-regex
    .replace(/[\r\n\x00-\x1f]/g, ' ').slice(0, 500);
}

export class SunfireIxClient {
  constructor(env = process.env, {fetchImpl = fetch, now = () => Date.now()} = {}) {
    this.config = ixConfiguration(env);
    this.environment = this.config.environment;
    this.available = !!(this.config.username && this.config.password);
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.token = null;
    this.refreshAt = 0;
    this.authentication = null;
  }
  async response(url, options, stage) {
    let response;
    try { response = await this.fetchImpl(url, {...options, redirect: 'error', signal: AbortSignal.timeout(30_000)}); }
    catch { throw new IxError('ix_network_error'); }
    let body;
    try { body = await providerJson(response, 262144); }
    catch { if (response.ok) throw new IxError('ix_invalid_response'); }
    if (!response.ok) {
      const status = response.status;
      const outcome = stage === 'register' && status === 404 ? 'needs_attention'
        : stage === 'register' && status === 409 ? 'duplicate_on_sunfire'
          : status >= 500 || status === 429 ? 'retry' : 'failed';
      const code = stage === 'register' && status === 404 ? 'invalid_sunfire_code'
        : stage === 'register' && status === 409 ? 'duplicate_on_sunfire' : `ix_http_${status}`;
      throw new IxError(code, {outcome, providerMessage: safeIxMessage(body?.message,
        [this.config.username, this.config.password, this.token])});
    }
    return body;
  }
  async authenticate() {
    if (!this.available) throw new IxError('ix_client_not_configured', {outcome: 'failed'});
    if (this.authentication) return this.authentication;
    this.authentication = (async () => {
      const started = this.now();
      const body = await this.response(this.config.authUrl, {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({username: this.config.username, password: this.config.password})}, 'auth');
      if (typeof body?.token !== 'string' || !body.token || !Number.isFinite(body.expiresIn) || body.expiresIn <= 0)
        throw new IxError('ix_invalid_auth_response');
      this.token = body.token;
      this.refreshAt = started + body.expiresIn * 1000 - Math.min(60_000, body.expiresIn * 100);
      return this.token;
    })();
    try { return await this.authentication; } finally { this.authentication = null; }
  }
  async request(path, body, stage) {
    if (!this.token || this.now() >= this.refreshAt) await this.authenticate();
    const send = () => this.response(`${this.config.baseUrl}${path}`, {method: 'POST',
      headers: {Authorization: `Bearer ${this.token}`, ...(body ? {'Content-Type': 'application/json'} : {})},
      ...(body ? {body: JSON.stringify(body)} : {})}, stage);
    try { return await send(); }
    catch (error) {
      if (error.message !== 'ix_http_401') throw error;
      this.token = null;
      await this.authenticate();
      return send(); // A second 401 is terminal, never an authentication loop.
    }
  }
  register(body) { return this.request('/ix/callrecordings/internalenrollment', body, 'register'); }
  async finalize(id) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new IxError('ix_invalid_registration', {outcome: 'failed'});
    const receipt = await this.request(`/ix/callrecordings/${id}/finalize`, null, 'finalize');
    if (!['finalized', 'already_finalized'].includes(receipt?.status)) throw new IxError('ix_receipt_missing');
    return {status: receipt.status};
  }
}
