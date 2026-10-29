// No lookahead or audio buffering: hold/release affect gain, never delay samples.
class AgentNoiseGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'thresholdDb', defaultValue: -50, minValue: -100, maxValue: 0, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.gain = 0;
    this.hold = 0;
    this.attack = Math.exp(-1 / (sampleRate * 0.005));
    this.release = Math.exp(-1 / (sampleRate * 0.150));
    this.holdFrames = Math.round(sampleRate * 0.200);
    this.running = true;
    this.measurement = null;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'dispose') this.running = false;
      if (data.type === 'sample') this.measurement = { remaining: Math.round(sampleRate * 3), values: [] };
    };
  }

  process(inputs, outputs, parameters) {
    if (!this.running) return false;
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    if (this.measurement) {
      this.measurement.values.push(rms);
      this.measurement.remaining -= input.length;
      if (this.measurement.remaining <= 0) {
        this.port.postMessage({ type: 'samples', values: this.measurement.values });
        this.measurement = null;
      }
    }
    const open = rms >= Math.pow(10, parameters.thresholdDb[0] / 20);
    if (open) this.hold = this.holdFrames;
    for (let i = 0; i < output.length; i++) {
      const target = open || this.hold > 0 ? 1 : 0;
      if (!open && this.hold > 0) this.hold--;
      const coefficient = target ? this.attack : this.release;
      this.gain = target + coefficient * (this.gain - target);
      output[i] = input[i] * this.gain;
    }
    return true;
  }
}

registerProcessor('enrollgen-noise-gate', AgentNoiseGate);
