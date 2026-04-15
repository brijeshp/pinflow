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
  Theme,
  Viewport,
} from './types';

export const version = '0.0.0';

interface Handle {
  destroy(): void;
}

let current: (Handle & { annotator: Annotator; stopRoute: () => void }) | null = null;

export function init(config: PinflowConfig): Handle {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { destroy() {} };
  }
  if (current) current.destroy();

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

  if (!reviewer) {
    return { destroy() {} };
  }

  const annotator = new Annotator({
    config,
    reviewer,
    mode,
    storage,
  });
  const watcher = watchRoute(() => annotator.refreshRoute());

  current = {
    annotator,
    stopRoute: () => watcher.stop(),
    destroy() {
      watcher.stop();
      annotator.destroy();
      if (current === this) current = null;
    },
  };
  return current;
}

export function destroy(): void {
  current?.destroy();
  current = null;
}

export { routeOf };
