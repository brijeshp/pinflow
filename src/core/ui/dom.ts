import { STYLES } from './styles';

export interface UIRoot {
  host: HTMLElement;
  shadow: ShadowRoot;
  root: HTMLDivElement;
  destroy(): void;
}

export function createUIRoot(): UIRoot {
  const host = document.createElement('div');
  host.setAttribute('data-pinflow-root', '');
  host.style.cssText =
    'all:initial; position:fixed; inset:0; pointer-events:none; z-index:2147483646;';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);
  const root = document.createElement('div');
  root.className = 'root';
  shadow.appendChild(root);
  return {
    host,
    shadow,
    root,
    destroy() {
      host.remove();
    },
  };
}

/** Tiny createElement helper — className/text are the two things every site sets. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Apply a px position produced by `flipPosition` (or any {left,top} pair). */
export function place(node: HTMLElement, pos: { left: number; top: number }): void {
  node.style.left = `${pos.left}px`;
  node.style.top = `${pos.top}px`;
}

export function flipPosition(
  anchor: { left: number; top: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  offset = 12,
): { left: number; top: number } {
  let left = anchor.left + offset;
  let top = anchor.top + offset;
  if (left + size.width > viewport.width - 8) {
    left = anchor.left - size.width - offset;
  }
  if (top + size.height > viewport.height - 8) {
    top = anchor.top - size.height - offset;
  }
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  return { left, top };
}
