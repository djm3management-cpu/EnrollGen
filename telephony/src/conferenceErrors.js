export class ConferenceError extends Error {
  constructor(status, message, code = 'CONFERENCE_CONTROL_REJECTED') {
    super(message); this.status = status; this.code = code;
  }
}

export class ConferenceDependencyError extends Error {
  constructor(source, operation, cause) {
    super(cause?.message || `${source} request failed`, { cause });
    this.source = source; this.operation = operation;
    this.code = cause?.code; this.status = cause?.status;
  }
}

export async function conferenceRequest(source, operation, request) {
  try { return await request(); }
  catch (error) { throw new ConferenceDependencyError(source, operation, error); }
}

export function conferenceFailure(error) {
  if (error instanceof ConferenceError) return { status: error.status, code: error.code, error: error.message };
  if (error instanceof ConferenceDependencyError && !(error.cause instanceof TypeError)) return error.source === 'twilio'
    ? { status: 502, code: 'CONFERENCE_TWILIO_FAILURE', error: `Twilio could not complete call control (${error.operation}). Please retry.` }
    : { status: 503, code: 'CONFERENCE_DATABASE_FAILURE', error: `Call control database request failed (${error.operation}). Please retry.` };
  return { status: 500, code: 'CONFERENCE_INTERNAL_FAILURE', error: 'Call control failed because of an internal service error. Contact support with the request ID.' };
}

// No request body, phone, auth header, stream URL or raw provider/SQL message.
export function conferenceFailureLog(error, context = {}) {
  const failure = conferenceFailure(error);
  return { event: 'conference_control_failed', ...context, status: failure.status, code: failure.code,
    source: error.source || 'service', operation: error.operation || null,
    cause_name: error.cause?.name || error.name || null, cause_code: error.cause?.code || null,
    cleanup_source: error.cleanupError?.source || null, cleanup_code: error.cleanupError?.code || null,
    frames: (error.cause?.stack || error.stack)?.split('\n').filter(s => /^\s+at /.test(s)).slice(0, 4).map(s => s.trim()) || [] };
}
