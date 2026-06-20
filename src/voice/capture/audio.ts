import { computeLevels } from './levels';
import { createWorkletUrl } from './worklet';
import type { AudioCapture } from '../types';

const BANDS = 5;
const FFT_SIZE = 64;

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor {
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error('AudioContext unavailable');
  return Ctor;
}

/**
 * Real microphone capture: getUserMedia → AudioWorklet (16kHz linear16 PCM) +
 * an AnalyserNode driving a 5-band waveform on its own rAF. All resources are
 * released on stop() — mic tracks stopped (kills the OS indicator), AudioContext
 * closed, worklet port detached, Blob URL revoked.
 */
export function createAudioCapture(): AudioCapture {
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let node: AudioWorkletNode | null = null;
  let analyser: AnalyserNode | null = null;
  let raf = 0;
  let url = '';

  return {
    async start(onPcm, onLevels): Promise<void> {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      ctx = new (audioContextCtor())();
      if (ctx.state === 'suspended') await ctx.resume();
      url = createWorkletUrl();
      await ctx.audioWorklet.addModule(url);

      const src = ctx.createMediaStreamSource(stream);
      node = new AudioWorkletNode(ctx, 'pinflow-pcm');
      node.port.onmessage = (e: MessageEvent): void => onPcm(e.data as ArrayBuffer);
      src.connect(node);
      // The worklet outputs silence but must be pulled to run; connect to dest.
      node.connect(ctx.destination);

      if (onLevels) {
        analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const loop = (): void => {
          if (!analyser) return;
          analyser.getByteFrequencyData(data);
          onLevels(computeLevels(data, BANDS));
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      }
    },

    stop(): void {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      stream?.getTracks().forEach((t) => t.stop());
      if (node) {
        node.port.onmessage = null;
        node.disconnect();
      }
      analyser?.disconnect();
      void ctx?.close().catch(() => {});
      if (url) URL.revokeObjectURL(url);
      ctx = null;
      stream = null;
      node = null;
      analyser = null;
      url = '';
    },
  };
}
