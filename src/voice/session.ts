import type { VoiceHost, VoiceSession } from '../core/voice-contract';
import { TranscriptStore } from './transcript-store';
import type {
  AudioCapture,
  SessionView,
  TranscriptionProvider,
  TranscriptionStream,
} from './types';

export interface SessionDeps {
  capture: AudioCapture;
  provider: TranscriptionProvider;
  view: SessionView;
  /** Injectable clock for duration; defaults to Date.now. */
  now?: () => number;
}

/** Inert session handed back on every degrade path. */
export const noopSession: VoiceSession = { stop: () => Promise.resolve(), dispose: () => {} };

/**
 * Orchestrates one recording: provider stream + mic capture → transcript store →
 * view, then finalize-and-persist (or discard) on stop. Any opening failure
 * (provider or mic) degrades to the text fallback. `dispose` releases hardware
 * unconditionally and best-effort persists already-committed text so a teardown
 * mid-recording never silently loses a transcript.
 */
export async function startSession(host: VoiceHost, deps: SessionDeps): Promise<VoiceSession> {
  const store = new TranscriptStore();
  const clock = deps.now ?? Date.now;
  const startedAt = clock();
  let stream: TranscriptionStream | null = null;
  let settled = false; // committed or discarded — guards idempotency
  let disposed = false;
  // Aggregated as the MINIMUM across accepted finals — the pessimistic value
  // is the honest one for downstream consumers. Unset if no final carried one.
  let minConfidence: number | undefined;

  const render = (): void => {
    const d = store.display;
    deps.view.update(d.committed, d.interim);
  };

  try {
    stream = await deps.provider.open({
      onInterim: (t) => {
        if (store.pushInterim(t)) render();
      },
      onFinal: (t, confidence) => {
        if (store.pushFinal(t)) {
          if (confidence !== undefined) {
            minConfidence =
              minConfidence === undefined ? confidence : Math.min(minConfidence, confidence);
          }
          render();
        }
      },
      onError: (err) => host.logger.warn('voice provider error', err),
    });
  } catch (err) {
    host.logger.warn('voice provider open failed', err);
    host.degradeToText();
    return noopSession;
  }

  try {
    await deps.capture.start(
      (frame) => stream?.sendPcm(frame),
      (levels) => deps.view.setLevels(levels),
    );
  } catch (err) {
    host.logger.warn('mic capture failed', err);
    deps.capture.stop(); // idempotent — releases anything partially acquired
    stream.close();
    host.degradeToText();
    return noopSession;
  }

  const persist = (interim: boolean): void => {
    if (store.isEmpty()) {
      host.discard();
      return;
    }
    host.commit({
      text: store.text,
      voice: {
        durationMs: Math.max(0, clock() - startedAt),
        engine: deps.provider.engine,
        ...(minConfidence !== undefined ? { confidence: minConfidence } : {}),
        ...(interim ? { interim: true } : {}),
      },
    });
  };

  return {
    async stop(): Promise<void> {
      if (settled) return;
      settled = true;
      store.beginFinalize();
      deps.capture.stop(); // release the mic immediately
      try {
        await stream?.finalize();
      } catch (err) {
        host.logger.warn('voice finalize failed', err);
      }
      store.close();
      stream?.close();
      persist(false);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      deps.capture.stop();
      if (!settled) {
        settled = true;
        store.close();
        persist(true); // best-effort: keep what was already committed
      }
      stream?.close();
    },
  };
}
