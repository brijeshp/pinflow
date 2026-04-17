import { modeFromUrl, resolveReviewer } from './identity';
import { routeOf, watchRoute } from './router';
import type { Mode, PinflowConfig } from './types';
import { Annotator } from './ui/annotator';

export type {
  Anchor,
  Comment,
  Mode,
  PinflowConfig,
  Position,
  PositionPercent,
  ReviewerStore,
  SelectorCandidates,
  Viewport,
} from './types';

export const version = '0.0.0';

export interface Handle {
  destroy(): void;
}

let current: Handle | null = null;

export function init(config: PinflowConfig): Handle {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { destroy() {} };
  }
  current?.destroy();

  const storage = window.localStorage;
  const mode: Mode = config.mode ?? modeFromUrl(window.location.href) ?? 'reviewer';
  const reviewer =
    config.reviewer ??
    resolveReviewer({
      url: window.location.href,
      storage,
      project: config.project,
      ...(mode === 'reviewer' ? { prompt: (m: string) => window.prompt(m) } : {}),
    }) ??
    (mode === 'builder' ? '__builder__' : null);

  if (!reviewer) return { destroy() {} };

  const annotator = new Annotator({ config, reviewer, mode, storage });
  const watcher = watchRoute(() => annotator.refreshRoute());

  const handle: Handle = {
    destroy() {
      watcher.stop();
      annotator.destroy();
      if (current === handle) current = null;
    },
  };
  current = handle;
  return handle;
}

export function destroy(): void {
  current?.destroy();
  current = null;
}

export { routeOf };
