import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const SID = { account: /^AC[0-9a-f]{32}$/i, call: /^CA[0-9a-f]{32}$/i, recording: /^RE[0-9a-f]{32}$/i };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class RecordingError extends Error { constructor(code) { super(code); this.code = code; } }
export function checked(result) { if (result.error) throw new RecordingError('database_error'); return result.data; }
export function mediaUrl(account, recording, channels) {
  if (!SID.account.test(account) || !SID.recording.test(recording) || ![1, 2].includes(channels)) {
    throw new RecordingError('invalid_recording');
  }
  return `https://api.twilio.com/2010-04-01/Accounts/${account}/Recordings/${recording}.wav?RequestedChannels=${channels}`;
}
export function twilioHeaders(config) {
  return { Authorization: 'Basic ' + Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64') };
}
export function callbackPayload(body, account) {
  if (body.AccountSid !== account || !SID.account.test(account) || !SID.call.test(body.CallSid || '') ||
      !['completed', 'absent'].includes(body.RecordingStatus) ||
      (body.RecordingStatus === 'completed' && !SID.recording.test(body.RecordingSid || '')) ||
      (body.RecordingSid && !SID.recording.test(body.RecordingSid))) throw new RecordingError('invalid_callback');
  const number = (value, allowed) => {
    if (value == null || value === '') return null;
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0 || (allowed && !allowed.includes(n))) throw new RecordingError('invalid_callback');
    return String(n);
  };
  const start = body.RecordingStartTime;
  if (start && !Number.isFinite(Date.parse(start))) throw new RecordingError('invalid_callback');
  return { AccountSid: account, CallSid: body.CallSid, RecordingSid: body.RecordingSid || null,
    RecordingStatus: body.RecordingStatus, RecordingSource: typeof body.RecordingSource === 'string' ? body.RecordingSource.slice(0, 64) : null, RecordingChannels: number(body.RecordingChannels, [1, 2]),
    RecordingDuration: number(body.RecordingDuration), RecordingStartTime: start || null };
}
export function createRecordingCallback({ db, config, log = console.error }) {
  return async (req, res) => {
    try {
      const payload = callbackPayload(req.body, config.twilioAccountSid);
      const hint = req.query?.attemptId;
      if (hint && !UUID.test(hint)) throw new RecordingError('invalid_callback');
      checked(await db.rpc('enqueue_recording', { p_callback: payload, p_attempt_id: hint || null })
        .abortSignal(AbortSignal.timeout(10_000)));
      // No download, upload, or fire-and-forget work before/after ACK.
      return res.status(204).end();
    } catch (error) {
      const invalid = error.code === 'invalid_callback';
      log(JSON.stringify({ event: 'recording_callback_failed', code: invalid ? 'invalid_callback' : 'database_error' }));
      return res.status(invalid ? 400 : 503).end();
    }
  };
}

export async function providerJson(response, maxBytes = 1024 * 1024) {
  if (!response.body) throw new RecordingError('empty_metadata');
  const reader = response.body.getReader(); const chunks = []; let bytes = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break;
      bytes += value.length; if (bytes > maxBytes) throw new RecordingError('metadata_too_large'); chunks.push(value); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); }
}

// Follow only HTTPS provider redirects. Credentials stay on api.twilio.com;
// signed object-store redirects get no Authorization header.
export async function fetchRecordingMedia(url, config, options = {}, fetchImpl = fetch) {
  let current = new URL(url);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const credentials = current.hostname === 'api.twilio.com' ? twilioHeaders(config) : {};
    const response = await fetchImpl(current.href, { ...options,
      headers: { ...credentials, ...(options.range ? { Range: options.range } : {}) }, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location'); await response.body?.cancel();
    if (!location || redirects === 3) throw new RecordingError('invalid_media_redirect');
    current = new URL(location, current);
    if (current.protocol !== 'https:' || current.port || current.username || current.password ||
        !(current.hostname === 'api.twilio.com' || current.hostname.endsWith('.twilio.com') ||
          current.hostname.endsWith('.amazonaws.com'))) throw new RecordingError('invalid_media_redirect');
  }
  throw new RecordingError('invalid_media_redirect');
}

export function retryDelay(attempt) { return Math.min(3_600_000, 5_000 * 2 ** Math.min(20, Math.max(0, attempt - 1))); }
export async function downloadRecording({ job, config, fetchImpl = fetch, maxBytes = 256 * 1024 * 1024, timeoutMs = 60_000 }) {
  const folder = await mkdtemp(join(tmpdir(), 'enrollgen-recording-'));
  const path = join(folder, 'audio.wav');
  const cleanup = () => rm(folder, { recursive: true, force: true });
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const response = await fetchRecordingMedia(mediaUrl(job.account_sid, job.recording_sid,
      job.recording_channels || (job.direction === 'voicemail' ? 1 : 2)), config, { signal }, fetchImpl);
    if (!response.ok) throw new RecordingError(`twilio_http_${response.status}`);
    const length = Number(response.headers.get('content-length'));
    if (length > maxBytes) { await response.body?.cancel(); throw new RecordingError('recording_too_large'); }
    if (!response.body) throw new RecordingError('empty_recording');
    let bytes = 0; const hash = createHash('sha256'); let prefix = Buffer.alloc(0);
    const bound = new Transform({ transform(chunk, _encoding, done) {
      bytes += chunk.length;
      if (bytes > maxBytes) return done(new RecordingError('recording_too_large'));
      if (prefix.length < 65_536) prefix = Buffer.concat([prefix, chunk.subarray(0, 65_536 - prefix.length)]);
      hash.update(chunk); done(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), bound, createWriteStream(path, { mode: 0o600 }), { signal });
    if (bytes < 12 || prefix.toString('ascii', 0, 4) !== 'RIFF' || prefix.toString('ascii', 8, 12) !== 'WAVE') {
      throw new RecordingError('invalid_wav');
    }
    if (prefix.readUInt32LE(4) + 8 > bytes) throw new RecordingError('truncated_recording');
    let channels = null;
    for (let offset = 12; offset + 8 <= prefix.length;) {
      const length = prefix.readUInt32LE(offset + 4);
      if (prefix.toString('ascii', offset, offset + 4) === 'fmt ') {
        if (length < 16 || offset + 24 > prefix.length) throw new RecordingError('invalid_wav');
        channels = prefix.readUInt16LE(offset + 10); break;
      }
      offset += 8 + length + (length % 2);
    }
    if (![1, 2].includes(channels)) throw new RecordingError('invalid_wav');
    if (channels !== (job.recording_channels || (job.direction === 'voicemail' ? 1 : 2))) throw new RecordingError('channel_mismatch');
    return { path, bytes, sha256: hash.digest('hex'), cleanup };
  } catch (error) { await cleanup(); throw error; }
}

export async function processRecording({ db, job, config, fetchImpl, maxBytes, timeoutMs }) {
  let audio;
  try {
    if (job.account_sid !== config.twilioAccountSid) throw new RecordingError('account_mismatch');
    audio = await downloadRecording({ job, config, fetchImpl, maxBytes, timeoutMs });
    const storagePath = `${job.tenant_id}/${job.parent_call_sid}/${job.recording_sid}.wav`;
    // Immutable identity per RecordingSid; replay after a crash safely restores
    // the same bytes, without overwriting a different recording on the call.
    const stream = createReadStream(audio.path);
    try {
      const upload = await db.storage.from('call-recordings').upload(storagePath, stream, {
        contentType: 'audio/wav', upsert: true, duplex: 'half',
      });
      if (upload.error) throw new RecordingError('storage_upload_failed');
    } finally { stream.destroy(); }
    const updated = checked(await db.from('recording_ingestion').update({ copy_status: 'stored', storage_path: storagePath,
      stored_bytes: audio.bytes, sha256: audio.sha256, stored_at: new Date().toISOString(),
      lease_token: null, lease_until: null, last_error_code: null, updated_at: new Date().toISOString(),
    }).eq('id', job.id).eq('lease_token', job.lease_token).select('id'));
    return updated?.length ? 'stored' : 'lease_lost';
  } catch (error) {
    const code = error instanceof RecordingError ? error.code :
      ['AbortError', 'TimeoutError'].includes(error.name) ? 'download_timeout' : 'copy_error';
    const permanent = ['recording_too_large', 'invalid_wav', 'channel_mismatch', 'account_mismatch'].includes(code);
    checked(await db.from('recording_ingestion').update({ copy_status: permanent ? 'failed' : 'retry',
      next_attempt_at: new Date(Date.now() + retryDelay(job.attempts)).toISOString(),
      last_error_code: code, lease_token: null, lease_until: null, updated_at: new Date().toISOString(),
    }).eq('id', job.id).eq('lease_token', job.lease_token).select('id'));
    return permanent ? 'failed' : 'retry';
  } finally { if (audio) await audio.cleanup(); }
}

export async function reconcileCall({ db, job, config, fetchImpl = fetch }) {
  if (job.account_sid !== config.twilioAccountSid) throw new RecordingError('account_mismatch');
  const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${job.account_sid}/Recordings.json`);
  url.searchParams.set('CallSid', job.parent_call_sid); url.searchParams.set('PageSize', '50');
  if (job.page_token) url.searchParams.set('PageToken', job.page_token);
  try {
    const response = await fetchImpl(url, { headers: twilioHeaders(config), redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new RecordingError(`twilio_http_${response.status}`);
    const data = await providerJson(response);
    if (!Array.isArray(data.recordings)) throw new RecordingError('invalid_metadata');
    for (const r of data.recordings) {
      if (!['completed', 'absent'].includes(r.status)) continue;
      const payload = callbackPayload({ AccountSid: r.account_sid, CallSid: r.call_sid,
        RecordingSid: r.sid, RecordingStatus: r.status, RecordingSource: r.source, RecordingChannels: r.channels,
        RecordingDuration: r.duration, RecordingStartTime: r.start_time }, config.twilioAccountSid);
      if (r.call_sid !== job.parent_call_sid) throw new RecordingError('call_mismatch');
      checked(await db.rpc('enqueue_recording', { p_callback: payload, p_attempt_id: null }));
    }
    let token = null;
    if (data.next_page_uri) {
      const next = new URL(data.next_page_uri, 'https://api.twilio.com');
      if (next.origin !== url.origin || next.pathname !== url.pathname || (next.searchParams.has('CallSid') && next.searchParams.get('CallSid') !== job.parent_call_sid)) {
        throw new RecordingError('invalid_page');
      }
      token = next.searchParams.get('PageToken');
      if (!token || token.length > 2048) throw new RecordingError('invalid_page');
    }
    checked(await db.from('recording_reconciliation').update({ page_token: token,
      next_check_at: new Date(Date.now() + (token ? 15_000 : data.recordings.length ? 86_400_000 : retryDelay(job.checks))).toISOString(),
      last_checked_at: new Date().toISOString(), lease_token: null, lease_until: null, last_error_code: null,
    }).eq('account_sid', job.account_sid).eq('parent_call_sid', job.parent_call_sid).eq('lease_token', job.lease_token));
  } catch (error) {
    checked(await db.from('recording_reconciliation').update({
      next_check_at: new Date(Date.now() + retryDelay(job.checks)).toISOString(), lease_token: null, lease_until: null,
      last_error_code: error instanceof RecordingError ? error.code : 'reconciliation_error',
    }).eq('account_sid', job.account_sid).eq('parent_call_sid', job.parent_call_sid).eq('lease_token', job.lease_token));
  }
}

export function startRecordingWorker({ db, config, log = console.error }) {
  let running = false; let seededAt = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      checked(await db.rpc('reconcile_recording_links', { p_limit: 100 }));
      if (Date.now() - seededAt > 60_000) {
        checked(await db.rpc('seed_recording_reconciliation', { p_account_sid: config.twilioAccountSid }));
        seededAt = Date.now();
        // Expired capability rows have no further use; this is not audio deletion.
        checked(await db.from('recording_download_tickets').delete().lt('expires_at', new Date().toISOString()));
      }
      const jobs = checked(await db.rpc('claim_recording_ingestion', { p_limit: 2 })) || [];
      const checks = checked(await db.rpc('claim_recording_reconciliation', { p_limit: 2 })) || [];
      const results = await Promise.allSettled([...jobs.map(job => processRecording({ db, job, config,
        maxBytes: config.recordingMaxBytes, timeoutMs: config.recordingTimeoutMs })),
      ...checks.map(job => reconcileCall({ db, job, config }))]);
      if (results.some(result => result.status === 'rejected')) throw new RecordingError('worker_job_failed');
    } catch { log(JSON.stringify({ event: 'recording_worker_failed', code: 'database_or_worker_error' })); }
    finally { running = false; }
  };
  const timer = setInterval(() => void tick(), 15_000); timer.unref(); void tick();
  return () => clearInterval(timer);
}
