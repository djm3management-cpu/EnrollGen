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
    // Twilio uses -1 for an absent recording: no audio duration exists. The
    // same parser handles signed callbacks and REST reconciliation metadata.
    // Preserve strict nonnegative validation for every completed recording.
    RecordingDuration: body.RecordingStatus === 'absent' && String(body.RecordingDuration) === '-1'
      ? null : number(body.RecordingDuration), RecordingStartTime: start || null };
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
      log(JSON.stringify({ event: 'recording_callback_failed', code: invalid ? 'invalid_callback' : 'database_error',
        call_sid: SID.call.test(req.body?.CallSid || '') ? req.body.CallSid : null,
        recording_sid: SID.recording.test(req.body?.RecordingSid || '') ? req.body.RecordingSid : null }));
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
    if (length > 0 && bytes !== length) throw new RecordingError('source_size_mismatch');
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

export async function verifyStoredRecording({ db, storagePath, bytes, sha256 }) {
  const result = await db.storage.from('call-recordings').download(storagePath);
  if (result.error || !result.data || result.data.size !== Number(bytes)) throw new RecordingError('storage_verification_failed');
  const hash = createHash('sha256').update(Buffer.from(await result.data.arrayBuffer())).digest('hex');
  if (hash !== sha256) throw new RecordingError('storage_checksum_mismatch');
}

// Only reads Supabase audio. A failed deletion is retried independently of copying,
// so a provider deletion can never force an upload or overwrite on retry.
export async function deleteVerifiedTwilioRecording({ db, job, config, fetchImpl = fetch, log = console.error }) {
  if (!config.deleteTwilioRecordingsAfterCopy || job.twilio_deleted_at) return false;
  try {
    if (job.account_sid !== config.twilioAccountSid || !SID.recording.test(job.recording_sid || '') ||
      job.copy_status !== 'stored' || !job.storage_path || !job.sha256 || !(Number(job.stored_bytes) > 0)) throw new RecordingError('unverified_copy');
    await verifyStoredRecording({ db, storagePath: job.storage_path, bytes: job.stored_bytes, sha256: job.sha256 });
    const verifiedAt = new Date().toISOString();
    const verified = checked(await db.from('recording_ingestion').update({ copy_verified_at: verifiedAt, twilio_delete_attempted_at: verifiedAt })
      .eq('id', job.id).eq('copy_status', 'stored').select('id'));
    if (!verified?.length) throw new RecordingError('verification_status_not_saved');
    const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${job.account_sid}/Recordings/${job.recording_sid}.json`,
      { method: 'DELETE', headers: twilioHeaders(config), redirect: 'error', signal: AbortSignal.timeout(15000) });
    // A retry after a successful DELETE / lost DB response sees an absent provider copy.
    if (!response.ok && response.status !== 404) throw new RecordingError(`twilio_delete_http_${response.status}`);
    checked(await db.from('recording_ingestion').update({ twilio_deleted_at: new Date().toISOString(), twilio_delete_error: null })
      .eq('id', job.id).eq('copy_status', 'stored'));
    return true;
  } catch (error) {
    const code = error instanceof RecordingError ? error.code : 'recording_delete_error';
    log(JSON.stringify({ event: 'recording_delete_failed', recording_sid: job.recording_sid, code }));
    try {
      checked(await db.from('recording_ingestion').update({ twilio_delete_error: code,
        twilio_delete_next_attempt_at: new Date(Date.now() + 60000).toISOString() }).eq('id', job.id));
    } catch { log(JSON.stringify({ event: 'recording_delete_status_failed', recording_sid: job.recording_sid })); }
    return false;
  }
}

export async function processRecording({ db, job, config, fetchImpl, maxBytes, timeoutMs, log = console.error }) {
  let audio;
  try {
    if (job.account_sid !== config.twilioAccountSid) throw new RecordingError('account_mismatch');
    // The storage project limit may be lower than the download safety cap.
    // Reject from provider Content-Length (or while downloading) before sending
    // an oversized WAV repeatedly to storage. Keep the provider original.
    const storageLimit = config.recordingStorageMaxBytes || 50 * 1024 * 1024;
    audio = await downloadRecording({ job, config, fetchImpl, maxBytes: Math.min(maxBytes ?? 256 * 1024 * 1024, storageLimit), timeoutMs });
    const storagePath = `${job.tenant_id}/${job.parent_call_sid}/${job.recording_sid}.wav`;
    // Immutable identity per RecordingSid; replay after a crash safely restores
    // the same bytes, without overwriting a different recording on the call.
    const stream = createReadStream(audio.path);
    try {
      const upload = await db.storage.from('call-recordings').upload(storagePath, stream, {
        contentType: 'audio/wav', upsert: false, duplex: 'half', headers: { 'Content-Length': String(audio.bytes) },
      });
      if (String(upload.error?.statusCode || upload.error?.status) === '413') throw new RecordingError('storage_object_too_large');
      if (upload.error && !['409', 'Duplicate', '409 Conflict'].includes(String(upload.error.statusCode || upload.error.code))) throw new RecordingError('storage_upload_failed');
    } finally { stream.destroy(); }
    await verifyStoredRecording({ db, storagePath, bytes: audio.bytes, sha256: audio.sha256 });
    const updated = checked(await db.from('recording_ingestion').update({ copy_status: 'stored', storage_path: storagePath,
      copy_verified_at: new Date().toISOString(), retention_until: new Date(new Date().setUTCFullYear(new Date().getUTCFullYear() + 10)).toISOString(),
      stored_bytes: audio.bytes, sha256: audio.sha256, stored_at: new Date().toISOString(),
      lease_token: null, lease_until: null, last_error_code: null, updated_at: new Date().toISOString(),
    }).eq('id', job.id).eq('lease_token', job.lease_token).select('id'));
    if (!updated?.length) return 'lease_lost';
    await deleteVerifiedTwilioRecording({ db, job: { ...job, copy_status: 'stored', storage_path: storagePath, stored_bytes: audio.bytes, sha256: audio.sha256 }, config, fetchImpl, log });
    return 'stored';
  } catch (error) {
    const code = error instanceof RecordingError ? error.code :
      ['AbortError', 'TimeoutError'].includes(error.name) ? 'download_timeout' : 'copy_error';
    log(JSON.stringify({ event: 'recording_copy_failed', recording_sid: job.recording_sid, code }));
    const permanent = ['recording_too_large', 'storage_object_too_large', 'invalid_wav', 'channel_mismatch', 'account_mismatch'].includes(code);
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
        // Compliance-table rollout or cleanup failures must not stop recording
        // ingestion/reconciliation or affect existing playback capabilities.
        try {
          checked(await db.from('recording_compliance_tickets').delete().lt('expires_at', new Date().toISOString()));
        } catch { log(JSON.stringify({ event: 'recording_compliance_cleanup_failed', code: 'database_error' })); }
      }
      const jobs = checked(await db.rpc('claim_recording_ingestion', { p_limit: 2 })) || [];
      const checks = checked(await db.rpc('claim_recording_reconciliation', { p_limit: 2 })) || [];
      const deletions = config.deleteTwilioRecordingsAfterCopy ? checked(await db.from('recording_ingestion').select('*')
        .eq('copy_status', 'stored').is('twilio_deleted_at', null).lte('twilio_delete_next_attempt_at', new Date().toISOString()).limit(2)) || [] : [];
      const results = await Promise.allSettled([...jobs.map(job => processRecording({ db, job, config,
        maxBytes: config.recordingMaxBytes, timeoutMs: config.recordingTimeoutMs })),
      ...checks.map(job => reconcileCall({ db, job, config })),
      ...deletions.map(job => deleteVerifiedTwilioRecording({ db, job, config, log }))]);
      if (results.some(result => result.status === 'rejected')) throw new RecordingError('worker_job_failed');
    } catch { log(JSON.stringify({ event: 'recording_worker_failed', code: 'database_or_worker_error' })); }
    finally { running = false; }
  };
  const timer = setInterval(() => void tick(), 15_000); timer.unref(); void tick();
  return () => clearInterval(timer);
}
