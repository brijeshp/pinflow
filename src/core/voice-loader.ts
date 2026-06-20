import type { VoiceModule } from './voice-contract';

/**
 * The ONLY place the `pinflow/voice` specifier appears in core. It is marked
 * `external` in the build, so this dynamic import stays a runtime reference —
 * voice code is never bundled into the core / IIFE output (CI greps for this).
 *
 * ESM consumers resolve it via the package `exports` map. On the IIFE/CDN path
 * there is no module resolver, so the import rejects and the caller degrades to
 * text (a dedicated CDN voice loader is deferred to v2.1).
 */
export function loadVoice(): Promise<VoiceModule> {
  return import('pinflow/voice').then((m) => (m as { default: VoiceModule }).default);
}
