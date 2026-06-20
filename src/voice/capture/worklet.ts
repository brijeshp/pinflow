// AudioWorklet processor source, shipped as a string and loaded via a Blob URL
// (no separate file for hosts to serve). Downsamples the AudioContext rate
// (commonly 48kHz) to 16kHz mono and emits linear16 PCM as transferable
// ArrayBuffers — all off the main thread.
const WORKLET_SOURCE = `
class PinflowPCM extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.acc = 0;
    this.count = 0;
    this.out = new Int16Array(2048);
    this.len = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch = input[0];
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i];
      this.count++;
      if (this.count >= this.ratio) {
        let s = this.acc / this.count;
        s = s < -1 ? -1 : s > 1 ? 1 : s;
        this.out[this.len++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        this.acc = 0;
        this.count = 0;
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
