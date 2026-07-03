import { describe, expect, it } from 'vitest';
import { WORKLET_SOURCE } from '../../src/voice/capture/worklet';

// The worklet ships as an inline source string compiled by the browser's
// AudioWorklet. Compile it here with the worklet globals stubbed so the
// downsampler math is testable without a real audio graph.

interface PcmProcessor {
  process(inputs: Float32Array[][]): boolean;
  flush(): void;
}

interface CompiledWorklet {
  proc: PcmProcessor;
  /** Total Int16 samples posted so far (including flushed remainder). */
  samples: () => number;
}

function compileWorklet(sampleRate: number): CompiledWorklet {
  let posted = 0;
  class FakeAudioWorkletProcessor {
    port = {
      postMessage: (buf: ArrayBuffer): void => {
        posted += buf.byteLength / 2; // linear16 → 2 bytes per sample
      },
    };
  }
  // Holder array (not a plain `let`) so control-flow analysis does not narrow
  // the closure-assigned constructor to `null` at the read below.
  const registered: Array<new () => PcmProcessor> = [];
  const registerProcessor = (_name: string, c: new () => PcmProcessor): void => {
    registered.push(c);
  };
  new Function('AudioWorkletProcessor', 'sampleRate', 'registerProcessor', WORKLET_SOURCE)(
    FakeAudioWorkletProcessor,
    sampleRate,
    registerProcessor,
  );
  const Ctor = registered[0];
  if (!Ctor) throw new Error('worklet source never called registerProcessor');
  return { proc: new Ctor(), samples: () => posted };
}

function feed(proc: PcmProcessor, totalSamples: number): void {
  const block = new Float32Array(128).fill(0.5);
  let remaining = totalSamples;
  while (remaining > 0) {
    const n = Math.min(remaining, 128);
    proc.process([[n === 128 ? block : new Float32Array(n).fill(0.5)]]);
    remaining -= n;
  }
}

describe('pinflow-pcm worklet downsampler', () => {
  it('keeps the fractional ratio at 44.1kHz — 1s of input yields ~16000 samples', () => {
    // ratio = 44100/16000 = 2.75625 (fractional). Discarding the remainder on
    // each emit (count = 0) degrades to one sample per ceil(ratio) = 3 inputs,
    // i.e. ~14700 Hz declared as 16 kHz.
    const { proc, samples } = compileWorklet(44100);
    feed(proc, 44100);
    proc.flush();
    expect(samples()).toBeGreaterThanOrEqual(15998);
    expect(samples()).toBeLessThanOrEqual(16002);
  });

  it('still downsamples exactly 3:1 at 48kHz (integer ratio unaffected)', () => {
    const { proc, samples } = compileWorklet(48000);
    feed(proc, 48000);
    proc.flush();
    expect(samples()).toBe(16000);
  });
});
