import { init, version } from './index';

export { init, version };
export * from './types';

// Auto-init when loaded via `<script data-project="...">`. Capture
// currentScript synchronously — it's null after the script finishes
// executing — then wait for the body to exist before initing (so the
// tag can be placed in <head> without `defer`).
if (typeof document !== 'undefined') {
  const script = document.currentScript as HTMLScriptElement | null;
  const project = script?.dataset.project;
  if (project) {
    if (document.body) {
      init({ project });
    } else {
      document.addEventListener('DOMContentLoaded', () => init({ project }), { once: true });
    }
  }
}
