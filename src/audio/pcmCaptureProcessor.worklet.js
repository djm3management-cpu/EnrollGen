const DEFAULT_TARGET_RATE = 16000;
const DEFAULT_BUFFER_SIZE = 4096;
const WAVEFORM_PEAK_COUNT = 48;

function computeWaveformPeaks(source, gain = 2.4) {
  const peaks = new Array(WAVEFORM_PEAK_COUNT).fill(0);
  if (!source.length) return peaks;

  for (let bin = 0; bin < WAVEFORM_PEAK_COUNT; bin += 1) {
    const start = Math.floor((bin * source.length) / WAVEFORM_PEAK_COUNT);
    const end = Math.max(
      start + 1,
      Math.floor(((bin + 1) * source.length) / WAVEFORM_PEAK_COUNT)
    );
    let peak = 0;

    for (let i = start; i < end; i += 1) {
      peak = Math.max(peak, Math.abs(source[Math.min(i, source.length - 1)] || 0));
    }

    peaks[bin] = Math.min(1, peak * gain);
  }

  return peaks;
}

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetSampleRate =
      options.processorOptions?.targetSampleRate || DEFAULT_TARGET_RATE;
    this.bufferSize =
      options.processorOptions?.bufferSize || DEFAULT_BUFFER_SIZE;
    this.chunks = [];
    this.pendingLength = 0;
  }

  flush() {
    const source = new Float32Array(this.pendingLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      source.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    this.pendingLength = 0;

    let sum = 0;
    for (let i = 0; i < source.length; i += 1) {
      sum += source[i] * source[i];
    }
    const level = Math.min(1, Math.sqrt(sum / source.length) * 5);
    const peaks = computeWaveformPeaks(source);
    const ratio = sampleRate / this.targetSampleRate;
    const pcm = new Int16Array(Math.max(1, Math.floor(source.length / ratio)));

    for (let i = 0; i < pcm.length; i += 1) {
      const sourceIndex = Math.min(
        source.length - 1,
        Math.floor(i * ratio)
      );
      const value = Math.max(-1, Math.min(1, source[sourceIndex] || 0));
      pcm[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
    }

    this.port.postMessage({ level, peaks, pcm: pcm.buffer }, [pcm.buffer]);
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input?.length) return true;

    this.chunks.push(new Float32Array(input));
    this.pendingLength += input.length;
    if (this.pendingLength >= this.bufferSize) this.flush();
    return true;
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
