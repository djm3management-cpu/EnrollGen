export const WAVEFORM_PEAK_COUNT = 48;

function readSampleValue(samples, index, { byteTimeDomain = false } = {}) {
  const value = samples[index] || 0;
  return byteTimeDomain ? (value - 128) / 128 : value;
}

export function computeRmsLevel(samples, options = {}) {
  if (!samples?.length) return 0;

  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const centered = readSampleValue(samples, i, options);
    sum += centered * centered;
  }

  return Math.min(1, Math.sqrt(sum / samples.length) * (options.gain || 5));
}

export function computeWaveformPeaks(
  samples,
  { bins = WAVEFORM_PEAK_COUNT, byteTimeDomain = false, gain = 2.4 } = {}
) {
  const peaks = new Array(bins).fill(0);
  if (!samples?.length) return peaks;

  for (let bin = 0; bin < bins; bin += 1) {
    const start = Math.floor((bin * samples.length) / bins);
    const end = Math.max(start + 1, Math.floor(((bin + 1) * samples.length) / bins));
    let peak = 0;

    for (let i = start; i < end; i += 1) {
      peak = Math.max(
        peak,
        Math.abs(readSampleValue(samples, Math.min(i, samples.length - 1), { byteTimeDomain }))
      );
    }

    peaks[bin] = Math.min(1, peak * gain);
  }

  return peaks;
}
