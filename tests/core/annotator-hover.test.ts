import { afterEach, describe, expect, it, vi } from 'vitest';
import { Annotator } from '../../src/core/ui/annotator';
import { STYLES } from '../../src/core/ui/styles';

const PROJECT = 'p';
const REVIEWER = 'Tester';

function shadow(): ShadowRoot {
  const host = document.querySelector('[data-pinflow-root]');
  if (!host?.shadowRoot) throw new Error('pinflow root not mounted');
  return host.shadowRoot;
}

function makeAnnotator(): Annotator {
  return new Annotator({
    config: { project: PROJECT },
    reviewer: REVIEWER,
    mode: 'reviewer',
    storage: localStorage,
  });
}

function arm(): void {
  shadow().querySelector<HTMLButtonElement>('.control')?.click();
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function moveOver(target: EventTarget): void {
  target.dispatchEvent(new Event('pointermove', { bubbles: true, composed: true }));
}

function mockRect(el: Element, rect: { left: number; top: number; width: number; height: number }) {
  return vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => rect,
  } as DOMRect);
}

function hostParagraph(): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = 'host paragraph';
  document.body.appendChild(p);
  return p;
}

describe('armed-mode hover outline', () => {
  let annotator: Annotator | null = null;

  afterEach(() => {
    annotator?.destroy();
    annotator = null;
    localStorage.clear();
    document.body.innerHTML = '';
    document.body.style.cursor = '';
    vi.restoreAllMocks();
  });

  it('adds ZERO move listeners at rest; armed attaches exactly one, disarm detaches it (P2)', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    annotator = makeAnnotator();
    const moveAdds = () => addSpy.mock.calls.filter((c) => c[0] === 'pointermove').length;
    const moveRemoves = () => removeSpy.mock.calls.filter((c) => c[0] === 'pointermove').length;

    expect(moveAdds()).toBe(0); // rest: no capture-phase move handler at all

    arm();
    expect(moveAdds()).toBe(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(moveRemoves()).toBeGreaterThanOrEqual(1);

    // Detached means detached: a move after disarm must never build an outline.
    moveOver(hostParagraph());
    expect(shadow().querySelector('.hl')).toBeNull();
  });

  it('while armed, hover outlines the element under the cursor at its screen rect', async () => {
    annotator = makeAnnotator();
    arm();
    const target = hostParagraph();
    mockRect(target, { left: 10, top: 20, width: 100, height: 50 });

    moveOver(target);
    await nextFrame();

    const hl = shadow().querySelector<HTMLElement>('.hl');
    expect(hl).not.toBeNull();
    expect(hl!.style.left).toBe('10px');
    expect(hl!.style.top).toBe('20px');
    expect(hl!.style.width).toBe('100px');
    expect(hl!.style.height).toBe('50px');
  });

  it('never outlines pinflow’s own UI (composedPath guard, like _onDocumentClick)', async () => {
    annotator = makeAnnotator();
    arm();
    const target = hostParagraph();
    mockRect(target, { left: 10, top: 20, width: 100, height: 50 });
    moveOver(target);
    await nextFrame();
    expect(shadow().querySelector<HTMLElement>('.hl')!.style.display).not.toBe('none');

    // Crossing onto pinflow chrome hides the outline instead of boxing it.
    moveOver(document.querySelector('[data-pinflow-root]')!);
    await nextFrame();
    expect(shadow().querySelector<HTMLElement>('.hl')!.style.display).toBe('none');
  });

  it('rAF-throttles: multiple moves per frame paint once, last target wins', async () => {
    annotator = makeAnnotator();
    arm();
    const a = hostParagraph();
    const b = hostParagraph();
    const aRect = mockRect(a, { left: 1, top: 2, width: 3, height: 4 });
    mockRect(b, { left: 5, top: 6, width: 7, height: 8 });

    moveOver(a);
    moveOver(b);
    await nextFrame();

    expect(aRect).not.toHaveBeenCalled(); // a's frame never painted
    expect(shadow().querySelector<HTMLElement>('.hl')!.style.left).toBe('5px');
  });

  it('Escape removes the outline element entirely', async () => {
    annotator = makeAnnotator();
    arm();
    const target = hostParagraph();
    moveOver(target);
    await nextFrame();
    expect(shadow().querySelector('.hl')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(shadow().querySelector('.hl')).toBeNull();
  });

  it('placing a pin removes the outline with the armed state', async () => {
    annotator = makeAnnotator();
    arm();
    const target = hostParagraph();
    moveOver(target);
    await nextFrame();
    expect(shadow().querySelector('.hl')).not.toBeNull();

    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(shadow().querySelector('textarea')).not.toBeNull(); // pin landed
    expect(shadow().querySelector('.hl')).toBeNull();
  });

  it('disarming via the control removes the outline', async () => {
    annotator = makeAnnotator();
    arm();
    moveOver(hostParagraph());
    await nextFrame();
    expect(shadow().querySelector('.hl')).not.toBeNull();

    shadow().querySelector<HTMLButtonElement>('.control')?.click(); // second click disarms
    expect(shadow().querySelector('.hl')).toBeNull();
  });

  it('a pending throttle frame after disarm never resurrects the outline', async () => {
    annotator = makeAnnotator();
    arm();
    moveOver(hostParagraph()); // frame scheduled, not yet painted
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextFrame();
    expect(shadow().querySelector('.hl')).toBeNull();
  });

  it('outline styling: non-interactive, accent-tokened, reduced-motion drops the transition', () => {
    const hlRule = /\.hl\{[^}]*\}/.exec(STYLES)?.[0] ?? '';
    expect(hlRule).toContain('pointer-events:none');
    expect(hlRule).toContain('border:2px solid var(--pf-accent');
    expect(hlRule).toContain('position:fixed');
    // Subtle accent fill, not an opaque slab.
    expect(hlRule).toMatch(/background:[^;]*var\(--pf-accent/);
    // prefers-reduced-motion: the outline must not animate between elements.
    const reduced = /@media \(prefers-reduced-motion:reduce\)\{[^@]*\}/.exec(STYLES)?.[0] ?? '';
    expect(reduced).toContain('.hl{transition:none}');
  });
});
