import { createApp, type Component } from 'vue';

interface Wrapper {
  el: HTMLDivElement;
  unmount(): void;
}

export function mount(component: Component, props: Record<string, unknown>): Wrapper {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(component, props);
  app.mount(el);
  return {
    el,
    unmount() {
      app.unmount();
      el.remove();
    },
  };
}
