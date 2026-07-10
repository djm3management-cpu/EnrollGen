// G.711 mu-law -> linear16 decode (ITU-T reference algorithm), used to
// compute a customer audio level from Twilio Media Stream payloads
// server-side, since the browser never sees that audio as a track.
const EXP_LUT = [0, 132, 396, 924, 1980, 4092, 8316, 16764];

function decodeMulawByte(ulawByte) {
  const inverted = ~ulawByte & 0xff;
  const sign = inverted & 0x80;
  const exponent = (inverted >> 4) & 0x07;
  const mantissa = inverted & 0x0f;
  const sample = EXP_LUT[exponent] + (mantissa << (exponent + 3));
  return sign ? -sample : sample;
}

const MULAW_DECODE_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i += 1) {
  MULAW_DECODE_TABLE[i] = decodeMulawByte(i);
}

export function decodeMulaw(buffer) {
  const samples = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) {
    samples[i] = MULAW_DECODE_TABLE[buffer[i]];
  }
  return samples;
}

// Mirrors the client's computeRmsLevel gain/clamp so the customer meter
// reads comparably to the agent's local AnalyserNode-driven meter.
export function rmsLevel(samples, gain = 6) {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const normalized = samples[i] / 32768;
    sum += normalized * normalized;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * gain);
}
