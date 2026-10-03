import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { checked, mediaUrl, twilioHeaders, providerJson, fetchRecordingMedia } from './recordings.js';

export function createRecordingMediaHandler({ db, config, fetchImpl = fetch, log = console.error }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const token = req.params?.token;
    if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) return res.status(404).end();
    let controller;
    const cancel = () => controller?.abort();
    res.on('close', cancel);
    try {
      const ticket = checked(await db.from('recording_download_tickets').select('*')
        .eq('token_hash', createHash('sha256').update(token).digest('hex')).maybeSingle());
      if (!ticket || Date.parse(ticket.expires_at) <= Date.now() || ticket.account_sid !== config.twilioAccountSid) {
        return res.status(404).end();
      }
      const range = req.header('range');
      if (range && !/^bytes=\d*-\d*$/.test(range)) return res.status(416).end();
      controller = new AbortController();
      // Large retained recordings stream without the ingestion byte cap; a
      // 30-second idle deadline and two-hour overall ceiling bound resources.
      const overall = setTimeout(cancel, 2 * 60 * 60_000); overall.unref();
      let idle = setTimeout(cancel, 30_000); idle.unref();
      try {
        const metadataUrl = `https://api.twilio.com/2010-04-01/Accounts/${ticket.account_sid}/Recordings/${ticket.recording_sid}.json`;
        const metadataResponse = await fetchImpl(metadataUrl, { headers: twilioHeaders(config), signal: controller.signal, redirect: 'error' });
        if (!metadataResponse.ok) { await metadataResponse.body?.cancel(); return res.status(metadataResponse.status === 404 ? 404 : 502).end(); }
        const metadata = await providerJson(metadataResponse, 16_384);
        if (metadata.account_sid !== ticket.account_sid || metadata.sid !== ticket.recording_sid || metadata.call_sid !== ticket.expected_call_sid) {
          return res.status(404).end();
        }
        const channels = [1, 2].includes(metadata.channels) ? metadata.channels : ticket.channels;
        const upstream = await fetchRecordingMedia(mediaUrl(ticket.account_sid, ticket.recording_sid, channels),
          config, { range, signal: controller.signal }, fetchImpl);
        if (!upstream.ok || !upstream.body) {
          await upstream.body?.cancel(); return res.status(upstream.status === 404 ? 404 : upstream.status === 416 ? 416 : 502).end();
        }
        res.status(upstream.status === 206 ? 206 : 200);
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Disposition', `${ticket.download ? 'attachment' : 'inline'}; filename="recording-${ticket.recording_sid}.wav"`);
        for (const header of ['content-length', 'content-range', 'accept-ranges']) {
          const value = upstream.headers.get(header); if (value) res.setHeader(header, value);
        }
        const stream = Readable.fromWeb(upstream.body);
        stream.on('data', () => { clearTimeout(idle); idle = setTimeout(cancel, 30_000); idle.unref(); });
        await pipeline(stream, res);
      } finally { clearTimeout(overall); clearTimeout(idle); }
    } catch {
      log(JSON.stringify({ event: 'recording_media_failed', code: 'provider_or_database_error' }));
      if (!res.headersSent) res.status(502).end(); else res.destroy();
    } finally { res.off('close', cancel); }
  };
}
