// Shared plumbing for the exchange portal functions (ping-buyer and
// ping-operator; session S8b): JSON responses, action and input parsing, and
// the admin_action_log writer every portal write goes through first.
import { randomUUID } from 'node:crypto';
import { securityEvent } from '../../telephony/src/lib/logger.js';
import { JSON_HEADERS } from './_tenantSettings.js';
import { deploymentProfile } from '../../telephony/src/lib/deploymentProfile.js';

export const json = (body, status = 200) => new Response(JSON.stringify(body),
  { status, headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' } });

export class PortalInputError extends Error {}
export class PortalAuditError extends Error {}

const ACTION = /^[a-z][a-z_]{1,39}$/;
const MAX_BODY = 65536;

/** { action, input } from a GET query string or a POST JSON body. */
export async function readRequest(request) {
  if (request.method === 'GET') {
    const params = new URL(request.url).searchParams;
    const input = {};
    for (const [key, value] of params) {
      if (Object.hasOwn(input, key)) throw new PortalInputError(`${key.slice(0, 64)} must be given once`);
      input[key] = value;
    }
    const { action, ...rest } = input;
    if (typeof action !== 'string' || !ACTION.test(action)) throw new PortalInputError('unknown action');
    return { action, input: rest };
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new PortalInputError('body too large');
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { throw new PortalInputError('body must be JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PortalInputError('body must be an object');
  const { action, ...rest } = body;
  if (typeof action !== 'string' || !ACTION.test(action)) throw new PortalInputError('unknown action');
  return { action, input: rest };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An audit function bound to one request: one admin_action_log row per call,
 * written before the change it describes. A failed write throws, so the
 * change never runs unaudited. Detail holds field names and configuration
 * values, never keys, hashes or caller data.
 */
export function portalAudit(db, identity, action) {
  return async ({ op, target_type: targetType, target_id: targetId, result, detail = {} }) => {
    const row = { request_id: randomUUID(), actor_id: identity.auth.userId, tenant_id: identity.tenant.id, action,
      target_type: targetType, target_id: UUID.test(targetId || '') ? targetId : 'collection',
      result: result === 'denied' ? 'denied' : 'authorized', before_summary: {}, after_summary: { op, ...detail } };
    let error = null;
    try { ({ error } = await db.from('admin_action_log').insert(row)); } catch (caught) { error = caught; }
    if (error) { securityEvent('admin_log_write_failed', { subject: identity.auth.userId }); throw new PortalAuditError(); }
  };
}

export function portalFailure(error) {
  if (error instanceof PortalInputError) return json({ error: 'invalid_request', detail: error.message }, 400);
  if (error instanceof PortalAuditError) return json({ error: 'Administrator action log unavailable' }, 503);
  return json({ error: 'Exchange request failed. Please retry.' }, 503);
}

/** The operator is an administrator of the deployment's own tenant, with the exchange on. */
export const isOperator = (identity, enabled, profile = deploymentProfile()) => Boolean(identity?.admin
  && enabled('PING_EXCHANGE_ENABLED') && identity.tenant?.id && identity.tenant.id === profile.tenantId);
