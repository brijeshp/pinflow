import { init, version } from './index';

export { init, version };
export * from './types';

// Auto-init when loaded via <script data-project="...">.
if (typeof document !== 'undefined') {
  const script = document.currentScript as HTMLScriptElement | null;
  const project = script?.dataset.project;
  if (project) {
    init({ project });
  }
}
