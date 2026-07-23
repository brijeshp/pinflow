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
  // 'recording' → ('finalizing' →) 'settled': persistence happens exactly once,
  // on the transition INTO 'settled'. dispose() during 'finalizing' releases
  // hardware but leaves persistence to the in-flight stop() (codex audit #5).
  let phase: 'recording' | 'finalizing' | 'settled' = 'recording';
  let disposed = false;
  const aborted = (): boolean => host.signal?.aborted === true;
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
      onError: (err) => {
        host.logger.warn('voice provider error', err);
        // A post-open provider failure must not leave a dead recording with a
        // live microphone (codex audit #17): salvage what was heard and stop.
        if (phase !== 'recording') return;
        phase = 'settled';
        void deps.capture.stop();
        const d = store.display;
        const interimTail = d.interim.trim();
        store.close();
        stream?.close();
        const text = interimTail
          ? d.committed
            ? d.committed + ' ' + interimTail
            : interimTail
          : d.committed;
        persist(text, interimTail.length > 0);
      },
    });
  } catch (err) {
    host.logger.warn('voice provider open failed', err);
    if (!aborted()) host.degradeToText();
    return noopSession;
  }
  if (aborted()) {
    // Torn down while the socket was opening: no mic, no dot, no fallback.
    stream.close();
    return noopSession;
  }

  try {
    await deps.capture.start(
      (frame) => stream?.sendPcm(frame),
      (levels) => deps.view.setLevels(levels),
    );
  } catch (err) {
    host.logger.warn('mic capture failed', err);
    void deps.capture.stop(); // idempotent — releases anything partially acquired
    stream.close();
    if (!aborted()) host.degradeToText();
    return noopSession;
  }
  if (aborted()) {
    // Mic permission resolved into a torn-down world: release everything.
    void deps.capture.stop();
    stream.close();
    return noopSession;
  }

  const persist = (text: string, interim: boolean): void => {
    if (text.trim().length === 0) {
      host.discard();
      return;
    }
    host.commit({
      text,
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
      if (phase !== 'recording') return;
      phase = 'finalizing';
      store.beginFinalize();
      // Await the flush handshake so the last partial PCM buffer is on the
      // wire BEFORE the finalize frame (codex audit #21).
      await deps.capture.stop();
      try {
        await stream?.finalize();
      } catch (err) {
        host.logger.warn('voice finalize failed', err);
      }
      if (phase !== 'finalizing') return; // provider error settled meanwhile
      store.close();
      stream?.close();
      phase = 'settled';
      persist(store.text, false);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      void deps.capture.stop();
      // 'finalizing' belongs to the in-flight stop(): it will persist exactly
      // once when finalize resolves — salvaging here would double-commit.
      if (phase === 'recording') {
        phase = 'settled';
        // Best-effort salvage: committed finals PLUS any still-pending interim
        // tail (the store is still recording — finalize never ran). The interim
        // flag is set only when interim content actually made it into the text,
        // matching the VoiceMeta.interim doc.
        const d = store.display;
        const interimTail = d.interim.trim();
        store.close();
        const text = interimTail
          ? d.committed
            ? `${d.committed} ${interimTail}`
            : interimTail
          : d.committed;
        persist(text, interimTail.length > 0);
      }
      stream?.close();
    },
  };
}
