import { Buffer } from 'node:buffer';
// Valid interleaved PCM WAV: distinguishable agent/customer channels.
export function recordingWav(channels = 2) {
  const dataBytes = 32 * channels; const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22); wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(8000 * channels * 2, 28); wav.writeUInt16LE(channels * 2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < 16; frame++) for (let channel = 0; channel < channels; channel++) wav.writeInt16LE(channel ? -1000 : 1000, 44 + (frame * channels + channel) * 2);
  return wav;
}
