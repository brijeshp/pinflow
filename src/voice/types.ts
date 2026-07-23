// Internal seams for the voice module. The browser adapters (AudioWorklet
// capture, Deepgram WebSocket) implement these; the session orchestrator depends
// only on the interfaces, so it is fully unit-testable with fakes.

export interface AudioCapture {
  /** Acquire the mic and begin streaming linear16 PCM frames + waveform levels. */
  start(onPcm: (frame: ArrayBuffer) => void, onLevels?: (levels: number[]) => void): Promise<void>;
  /** Stop tracks and release the AudioContext. Idempotent. */
  stop(): Promise<void> | void;
}

export interface TranscriptionStream {
  sendPcm(frame: ArrayBuffer): void;
  /** Flush remaining audio and resolve when the trailing final has been sent. */
  finalize(): Promise<void>;
  close(): void;
}

export interface TranscriptionProvider {
  /** Provenance tag persisted in VoiceMeta, e.g. `deepgram:nova-3`. */
  readonly engine: string;
  open(opts: {
    onInterim: (text: string) => void;
    onFinal: (text: string, confidence?: number) => void;
    onError: (err: unknown) => void;
  }): Promise<TranscriptionStream>;
}

export interface SessionView {
  update(committed: string, interim: string): void;
  setLevels(levels: number[]): void;
}
