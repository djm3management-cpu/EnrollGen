import {deploymentProfile} from './lib/deploymentProfile.js';
import { appendEvidenceAudit,auditedEvidenceAccess,evidenceCheckpoint } from './lib/evidenceAudit.js';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { checked, mediaUrl, twilioHeaders, providerJson, fetchRecordingMedia } from './recordings.js';

function byteRange(value, size) {
  if (!value) return null;
  const [, first, last] = /^bytes=(\d*)-(\d*)$/.exec(value) || [];
  if ((!first && !last) || size === 0) return false;
  const start = first ? Number(first) : Math.max(0, size - Number(last));
  const end = last && first ? Math.min(size - 1, Number(last)) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && start < size
    ? { start, end } : false;
}

async function openAudio(db, ticket, config, signal, range, fetchImpl,authorize) {
  if (ticket.storage_path && ticket.format === 'wav') {
    const parts = ticket.storage_path.split('/');
    if (parts[0] !== ticket.tenant_id || parts.some(part => !part || part === '.' || part === '..')) return null;
    await authorize();
    const { data, error } = await db.storage.from('call-recordings').createSignedUrl(ticket.storage_path, 300);
    if (!error && data?.signedUrl) {
      const stored = await fetchImpl(data.signedUrl, { signal, redirect: 'error',
        headers: { 'Accept-Encoding': 'identity', ...(range ? { Range: range } : {}) } });
      if ([200, 206, 416].includes(stored.status)) return stored;
      await stored.body?.cancel();
    }
  }
  if (!ticket.recording_sid || ticket.account_sid !== config.twilioAccountSid) return null;
  const metadata = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${ticket.account_sid}/Recordings/${ticket.recording_sid}.json`,
    { headers: twilioHeaders(config), signal, redirect: 'error' });
  if (!metadata.ok) { await metadata.body?.cancel(); return metadata; }
  const recording = await providerJson(metadata, 16_384);
  if (recording.account_sid !== ticket.account_sid || recording.sid !== ticket.recording_sid || recording.call_sid !== ticket.expected_call_sid) return null;
  const channels = [1, 2].includes(recording.channels) ? recording.channels : ticket.channels;
  const url = mediaUrl(ticket.account_sid, ticket.recording_sid, channels).replace('.wav?', `.${ticket.format}?`);
  await authorize();
  return fetchRecordingMedia(url, config, { range, signal }, (destination, options) => fetchImpl(destination,
    { ...options, headers: { ...options.headers, 'Accept-Encoding': 'identity' } }));
}

export function createRecordingComplianceHandler({ db, config, fetchImpl = fetch, log = console.error, ticketTable='recording_compliance_tickets' }) {
  return async (req, res) => {
    log(JSON.stringify({event:'conversely_recording_hit',timestamp:new Date().toISOString(),method:req.method,
      code:'request_received'}));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD'); return res.status(405).end();
    }
    const rawToken = req.params?.token;
    const mp3Path=String(rawToken || '').endsWith('.mp3');
    const token=mp3Path ? rawToken.slice(0,-4) : rawToken;
    if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) {
      try{await appendEvidenceAudit(db,{actor:'capability:unknown',tenant:deploymentProfile().tenantId,resource:'recording',action:'read',result:'denied'});}catch{return res.status(503).end();}
      return res.status(404).end();
    }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const overall = setTimeout(cancel, 2 * 60 * 60_000); overall.unref();
    let idle = setTimeout(cancel, 30_000); idle.unref();
    let folder, upstream;
    res.on('close', cancel);
    try {
      let ticket = checked(await db.from(ticketTable).select('*')
        .eq('token_hash', createHash('sha256').update(token).digest('hex')).maybeSingle());
      if(ticket && ticketTable==='recording_download_tickets')ticket={...ticket,format:'wav'};
      if(!ticket)await appendEvidenceAudit(db,{actor:'capability:unknown',tenant:deploymentProfile().tenantId,resource:'recording',action:'read',result:'denied'});
      const expires = Date.parse(ticket?.expires_at);
      const details=ticket?{actor:ticketTable==='recording_download_tickets'?(ticket.actor_id || 'capability:legacy'):'capability:compliance',tenant:ticket.tenant_id,resource:'recording',resourceId:ticket.recording_id,action:ticketTable==='recording_download_tickets'?(ticket.download?'download':'play'):'export',grantId:ticket.grant_id}:null;
      if (!ticket || !Number.isFinite(expires) || expires <= Date.now() || !['wav', 'mp3'].includes(ticket.format) || (mp3Path && ticket.format!=='mp3')) {
        if(details)await appendEvidenceAudit(db,{...details,result:'denied'});
        return res.status(404).end();
      }
      // HEAD returns full-object metadata. Each GET/HEAD/Range request has a
      // separate event, linked to the session that originally issued its grant.
      const range = req.method === 'GET' ? req.header('range') : null;
      if (range && (!/^bytes=\d*-\d*$/.test(range) || range === 'bytes=-')) {
        await appendEvidenceAudit(db,{...details,result:'denied'});return res.status(416).end();
      }
      upstream=await auditedEvidenceAccess(db,details,async()=>{
        const response=await openAudio(db,ticket,config,controller.signal,range,fetchImpl,()=>evidenceCheckpoint(db));
        if(!response)throw Object.assign(Error('Recording unavailable'),{status:404});
        return response;
      });
      if (upstream.status === 416) {
        const value = upstream.headers.get('content-range');
        if (/^bytes \*\/\d+$/.test(value || '')) res.setHeader('Content-Range', value);
        return res.status(416).end();
      }
      if (![200, 206].includes(upstream.status) || !upstream.body) return res.status(upstream.status === 404 ? 404 : 502).end();
      // Node fetch transparently decompresses; never reuse an encoded length.
      if (upstream.headers.get('content-encoding') && upstream.headers.get('content-encoding') !== 'identity') throw new Error('encoded_audio');
      res.setHeader('Content-Type', ticket.format === 'mp3' ? 'audio/mpeg' : 'audio/wav');
      const name = ticket.recording_sid || createHash('sha256').update(ticket.recording_id).digest('hex').slice(0, 16);
      res.setHeader('Content-Disposition', `${ticket.download?'attachment':'inline'}; filename="recording-${name}.${ticket.format}"`);
      res.setHeader('Accept-Ranges', 'bytes');
      const lengthHeader = upstream.headers.get('content-length');
      let length = /^\d+$/.test(lengthHeader || '') ? Number(lengthHeader) : null;
      if (length !== null && !Number.isSafeInteger(length)) throw new Error('invalid_length');
      const contentRange = upstream.headers.get('content-range');
      if (upstream.status === 206) {
        const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange || '');
        const expected = match && byteRange(range, Number(match[3]));
        if (!range || !expected || expected.start !== Number(match[1]) || expected.end !== Number(match[2])) throw new Error('invalid_range');
        const partLength = expected.end - expected.start + 1;
        if (length !== null && length !== partLength) throw new Error('invalid_length');
        length = partLength;
      }
      const heartbeat = () => new Transform({ transform(chunk, encoding, done) {
        clearTimeout(idle); idle = setTimeout(cancel, 30_000); idle.unref(); done(null, chunk);
      } });
      if (length !== null && (!range || upstream.status === 206)) {
        res.status(upstream.status);
        res.setHeader('Content-Length', length);
        if (upstream.status === 206) res.setHeader('Content-Range', contentRange);
        if (req.method === 'HEAD') return res.end();
        await pipeline(Readable.fromWeb(upstream.body), heartbeat(), res, { signal: controller.signal });
      } else {
        // Providers may omit length or ignore Range. Spool to disk in those
        // cases so HEAD/GET lengths and locally served byte ranges stay exact.
        folder = await mkdtemp(join(tmpdir(), 'enrollgen-compliance-'));
        const path = join(folder, 'audio');
        await pipeline(Readable.fromWeb(upstream.body), heartbeat(), createWriteStream(path, { mode: 0o600 }), { signal: controller.signal });
        const size = (await stat(path)).size;
        const selected = byteRange(range, size);
        if (selected === false) { res.setHeader('Content-Range', `bytes */${size}`); return res.status(416).end(); }
        res.status(selected ? 206 : 200);
        res.setHeader('Content-Length', selected ? selected.end - selected.start + 1 : size);
        if (selected) res.setHeader('Content-Range', `bytes ${selected.start}-${selected.end}/${size}`);
        if (req.method === 'HEAD') return res.end();
        await pipeline(createReadStream(path, selected || undefined), heartbeat(), res, { signal: controller.signal });
      }
    } catch(error) {
      log(JSON.stringify({ event: 'recording_compliance_media_failed', code: 'provider_or_database_error' }));
      if (!res.headersSent) {
        res.removeHeader('Content-Length'); res.removeHeader('Content-Range');
        res.status(error?.status===404?404:502).end();
      } else res.destroy();
    } finally {
      clearTimeout(overall); clearTimeout(idle); res.off('close', cancel);
      if (upstream?.body && !upstream.body.locked) await upstream.body.cancel().catch(() => {});
      if (folder) await rm(folder, { recursive: true, force: true });
    }
  };
}
