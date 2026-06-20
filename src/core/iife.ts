import { init, version } from './index';
import type { PinflowConfig } from './types';

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
    const config: PinflowConfig = { project };
    const activation = script?.dataset.activation;
    if (activation === 'stealth' || activation === 'both') {
      config.activation = { mode: activation };
    }
    const start = (): void => {
      init(config);
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
  }
}
