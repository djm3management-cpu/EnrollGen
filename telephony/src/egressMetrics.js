import { Socket } from 'node:net';

const destinations = ['twilio', 'deepgram', 'supabase', 'browser', 'other'];
export function createEgressMetrics() {
  const bytes = Object.fromEntries(destinations.map(key => [key, 0]));
  const open = { twilio_media: 0, deepgram: 0, browser: 0, supabase_realtime: 0 };
  return {
    sent(destination, size) { bytes[destination] += size; },
    acquire(type) {
      open[type] = (open[type] || 0) + 1;
      let released = false;
      return () => { if (!released) { released = true; open[type]--; } };
    },
    snapshot() { return { bytes: { ...bytes }, open: { ...open } }; },
  };
}
export const egressMetrics = createEgressMetrics();
export function destinationFor(socket) {
  if (socket.server) return socket.egressDestination || 'browser';
  const host = String(socket.servername || socket._host || '').toLowerCase();
  if (host.endsWith('.twilio.com')) return 'twilio';
  if (host.endsWith('.deepgram.com')) return 'deepgram';
  if (host.endsWith('.supabase.co') || host.endsWith('.supabase.in')) return 'supabase';
  return 'other';
}
// Count application bytes at the shared TCP/TLS write boundary, including HTTP
// uploads streamed by fetch and Twilio SDK requests. Never inspect/log content.
// TLS framing and TCP retransmission overhead are excluded.
export function startEgressMetrics({ metrics = egressMetrics, log = console.log } = {}) {
  const original = Socket.prototype.write;
  Socket.prototype.write = function(chunk, encoding, callback) {
    if (this !== process.stdout && this !== process.stderr && (typeof chunk === 'string' || ArrayBuffer.isView(chunk))) {
      metrics.sent(destinationFor(this), typeof chunk === 'string'
        ? Buffer.byteLength(chunk, typeof encoding === 'string' ? encoding : undefined) : chunk.byteLength);
    }
    return original.call(this, chunk, encoding, callback);
  };
  let previous = metrics.snapshot().bytes;
  const timer = setInterval(() => {
    const snapshot = metrics.snapshot();
    const intervalBytes = Object.fromEntries(destinations.map(key => [key, snapshot.bytes[key] - previous[key]]));
    previous = snapshot.bytes;
    log(JSON.stringify({ event: 'telephony_egress', interval_seconds: 300, ...snapshot, intervalBytes }));
  }, 300_000);
  timer.unref();
  return () => { clearInterval(timer); Socket.prototype.write = original; };
}
