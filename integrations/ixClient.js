export function ixConfiguration(env = process.env) {
  const environment=env.IX_ENV || 'sandbox';
  if(!['sandbox','production'].includes(environment))throw Error('invalid_ix_environment');
  const prefix=environment==='production'?'IX_PRODUCTION':'IX_SANDBOX';
  return {environment,baseUrl:env[`${prefix}_BASE_URL`] || null,apiKey:env[`${prefix}_API_KEY`] || null};
}

/** IX Customer Post API boundary. Implement after SunFire supplies its contract.
 * createUpload({confirmationCode, idempotencyKey}) -> {url, headers?}
 * confirmUpload({confirmationCode, idempotencyKey}) -> {receiptId}
 * No receipt is ever fabricated by the stub.
 */
export class StubIxClient {
  constructor(env = process.env) {
    this.environment = ixConfiguration(env).environment;
    this.available = false;
  }
  async createUpload() { throw Error('ix_client_not_configured'); }
  async confirmUpload() { throw Error('ix_client_not_configured'); }
}
