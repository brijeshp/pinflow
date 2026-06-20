// Types-only contract shared between the core engine and the lazily-loaded
// `pinflow/voice` module. The voice module imports these with `import type`
// (erased at build), so there is no runtime cycle and no bundling edge.
import type { Anchor, VoiceConfig, VoiceMeta } from './types';

export interface Logger {
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
}

/**
 * The narrow port the core engine hands the voice module. Voice never touches
 * the store or the `Annotator` instance directly — it talks back through here.
 */
export interface VoiceHost {
  readonly config: Readonly<VoiceConfig>;
  /** A host-owned node inside the shadow root, positioned next to the dot. */
  readonly mount: HTMLElement;
  readonly anchor: Anchor;
  /** Route key captured at dot creation — frozen for the session's lifetime. */
  readonly route: string;
  /** Persist the finalized note. Called once, at finalize. */
  commit(patch: { text: string; voice: VoiceMeta }): void;
  /** Drop the dot without persisting (empty transcript). */
  discard(): void;
  /** Failure ladder hand-back: render the editable text fallback in the dot. */
  degradeToText(prefill?: string): void;
  readonly logger: Logger;
}

/** One live recording. The core OWNS its lifecycle and disposes it on teardown. */
export interface VoiceSession {
  /** Finalize + persist-or-discard. Idempotent. */
  stop(): Promise<void>;
  /** Release mic + AudioContext + WS unconditionally. Idempotent. */
  dispose(): void;
}

/** The default export of `pinflow/voice`. */
export interface VoiceModule {
  start(host: VoiceHost): Promise<VoiceSession>;
}
