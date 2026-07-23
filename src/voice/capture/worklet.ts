// AudioWorklet processor source, shipped as a string and loaded via a Blob URL
// (no separate file for hosts to serve). Downsamples the AudioContext rate
// (commonly 48kHz) to 16kHz mono and emits linear16 PCM as transferable
// ArrayBuffers — all off the main thread.
// Exported for tests only — the test harness compiles this string with the
// AudioWorklet globals stubbed (there is no worklet runtime in happy-dom).
export const WORKLET_SOURCE = `
class PinflowPCM extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.acc = 0;
    this.n = 0;
    this.phase = 0;
    this.out = new Int16Array(2048);
    this.len = 0;
    // Stop/flush handshake: the main thread posts 'flush' during teardown and
    // waits for 'flushed' so short recordings' partial buffers reach the wire
    // (codex audit #21).
    this.port.onmessage = (e) => {
      if (e.data === 'flush') {
        this.flush();
        this.port.postMessage('flushed');
      }
    };
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch = input[0];
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i];
      this.n++;
      this.phase++;
      if (this.phase >= this.ratio) {
        // Average over the REAL samples accumulated — the fractional-cadence
        // remainder lives in \`phase\` only, so amplitude is never diluted by
        // phantom zero samples (codex audit #21: 0.5 in must be ~0.5 out).
        let s = this.acc / this.n;
        s = s < -1 ? -1 : s > 1 ? 1 : s;
        this.out[this.len++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        this.acc = 0;
        this.n = 0;
        this.phase -= this.ratio;
        if (this.len >= this.out.length) this.flush();
      }
    }
    return true;
  }
  flush() {
    if (this.len === 0) return;
    const buf = this.out.slice(0, this.len).buffer;
    this.port.postMessage(buf, [buf]);
    this.len = 0;
  }
}
registerProcessor('pinflow-pcm', PinflowPCM);
`;

export function createWorkletUrl(): string {
  const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}
