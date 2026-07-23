import { modeFromUrl, resolveReviewer } from './identity';
import { watchRoute } from './router';
import { routeKey as routeOf } from './route-key';
import { acquireStorage } from './safe-storage';
import type { Mode, PinflowConfig } from './types';
import { Annotator } from './ui/annotator';

export type {
  ActivationConfig,
  Anchor,
  Comment,
  GrantTokenResponse,
  Mode,
  Modality,
  PinflowConfig,
  PinflowTheme,
  PositionPercent,
  ReviewerStore,
  SelectorCandidates,
  Viewport,
  VoiceConfig,
  VoiceMeta,
} from './types';

// Injected by tsup `define` at build time (src/globals.d.ts); the `typeof`
// guard keeps vitest — which runs source without the define — working.
export const version = typeof __PINFLOW_VERSION__ !== 'undefined' ? __PINFLOW_VERSION__ : '0.0.0';

// Twin of `isLocalOrigin` in src/voice/transcription/token.ts — duplicated
// (3 lines of predicate) because core must never runtime-import from voice;
// keep the two in sync.
function isLocalOrigin(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localhost')
  );
}

export interface Handle {
  destroy(): void;
  /**
   * Re-evaluate the current route/frame key and re-render pins. Called
   * automatically on URL changes; hosts using `config.routeKey` call it
   * whenever their logical screen changes without a URL change.
   */
  refreshRoute(): void;
  /**
   * Current corpus as versioned JSON (`{ pinflowExport, generatedAt, comments }`):
   * the current reviewer's store in reviewer mode, all stores in builder mode.
   */
  exportJSON(): string;
  /**
   * Markdown artifact, same generator as the export button. Hosts place the
   * submission moment themselves (stealth mode has no chrome).
   */
  exportMarkdown(): string;
  /** Download the artifact + copy to clipboard — no confirmation UI; the host owns UX. */
  downloadExport(): void;
}

// SSR and declined-identity installs return an inert handle with the full API
// (one shared noop: '' for the export getters, ignored for the void methods).
function noopHandle(): Handle {
  const n = (): '' => '';
  return { destroy: n, refreshRoute: n, exportJSON: n, exportMarkdown: n, downloadExport: n };
}

let current: Handle | null = null;

export function init(config: PinflowConfig): Handle {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return noopHandle();
  }
  // The devOnlyToken guardrail is a LOUD, EARLY failure by design (types.ts
  // promises "throws at init"). token.ts re-checks lazily as defense in depth.
  if (config.voice?.devOnlyToken && !isLocalOrigin(window.location.hostname)) {
    throw new Error(
      'pinflow: voice.devOnlyToken needs a local origin — use voice.tokenEndpoint in production',
    );
  }
  if (current) {
    console.warn('[pinflow] another instance is active — replacing it');
    current.destroy();
  }

  const storage = acquireStorage();
  const mode: Mode = config.mode ?? modeFromUrl(window.location.href) ?? 'reviewer';
  const stealth = config.activation?.mode === 'stealth';
  const promptFn = (m: string): string | null => window.prompt(m);
  // Stealth must stay invisible at host startup: URL-param / remembered
  // identity still resolves eagerly (non-blocking), but the window.prompt
  // fallback is deferred to the first gesture activation (resolveIdentity).
  const reviewer =
    config.reviewer ??
    resolveReviewer({
      url: window.location.href,
      storage,
      project: config.project,
      ...(mode === 'reviewer' && !stealth ? { prompt: promptFn } : {}),
    }) ??
    (mode === 'builder' ? '__builder__' : null);

  if (!reviewer && !stealth) return noopHandle();

  const annotator = new Annotator({
    config,
    reviewer,
    mode,
    storage,
    ...(reviewer
      ? {}
      : {
          resolveIdentity: () =>
            resolveReviewer({
              url: window.location.href,
              storage,
              project: config.project,
              prompt: promptFn,
            }),
        }),
  });
  const watcher = watchRoute(() => annotator.refreshRoute());

  const handle: Handle = {
    destroy() {
      watcher.stop();
      annotator.destroy();
      if (current === handle) current = null;
    },
    refreshRoute() {
      annotator.refreshRoute();
    },
    exportJSON: () => annotator.exportJSON(),
    exportMarkdown: () => annotator.exportMarkdown(),
    downloadExport: () => annotator.downloadExport(),
  };
  current = handle;
  return handle;
}

export function destroy(): void {
  current?.destroy();
  current = null;
}

// The full artifact toolkit is public: all four are DOM-free pure functions,
// usable server-side (the sensavera hub renders collated exports from backend
// rows with these — no widget, no DOM). Tree-shaken away for widget-only use.
export { exportBuilder, exportFilename, exportJSON, exportReviewer } from './export';
export type { DescribeRoute, ExportMeta, IsOrphaned } from './export';
export { routeOf };
