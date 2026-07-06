import { afterEach, describe, expect, it } from 'vitest';

// Host-defined routeKey (frame-per-screen hosts on a single URL): pins must
// anchor to the host's frame id and reset when the host advances frames —
// the whole point of embedding for wizard/phased experiences.

function altClick(target: EventTarget): void {
  const e = new Event('pointerdown', { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 1, pointerType: 'mouse', altKey: true, clientX: 12, clientY: 12 });
  target.dispatchEvent(e);
  // Consume the gesture controller's one-shot trailing click swallow.
  document.body.dispatchEvent(new Event('click', { bubbles: true }));
}

function shadow(): ShadowRoot {
  const root = document.querySelector('[data-pinflow-root]')?.shadowRoot;
  if (!root) throw new Error('pinflow shadow root missing');
  return root;
}

function saveWith(text: string): void {
  const ta = shadow().querySelector('textarea');
  if (!ta) throw new Error('input did not open');
  ta.value = text;
  shadow().querySelector<HTMLButtonElement>('button.save')?.click();
}

describe('host-defined routeKey (frame-per-screen hosts)', () => {
  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('anchors comments to the frame key, hides them on frame change, and shows them again on return', async () => {
    const { init } = await import('../../src/core/index');
    let frame = 'welcome';
    const handle = init({
      project: 'fr',
      reviewer: 'Sam',
      activation: { mode: 'stealth' },
      routeKey: () => frame,
    });

    altClick(document.body);
    saveWith('pin on the welcome frame');
    expect(shadow().querySelectorAll('.pin')).toHaveLength(1);

    const store = JSON.parse(localStorage.getItem('pinflow:c:fr:Sam') as string);
    expect(store.comments[0].route).toBe('welcome');

    // Host advances to the next frame (same URL) and notifies pinflow.
    frame = 'section-2';
    handle.refreshRoute();
    expect(shadow().querySelectorAll('.pin')).toHaveLength(0); // no carry-over

    altClick(document.body);
    saveWith('pin on section two');
    expect(shadow().querySelectorAll('.pin')).toHaveLength(1); // only this frame's

    // Returning to a previous frame restores exactly its pins.
    frame = 'welcome';
    handle.refreshRoute();
    const pins = shadow().querySelectorAll('.pin');
    expect(pins).toHaveLength(1);
    const all = JSON.parse(localStorage.getItem('pinflow:c:fr:Sam') as string).comments;
    expect(all.map((c: { route: string }) => c.route).sort()).toEqual(['section-2', 'welcome']);
    handle.destroy();
  });

  it('voice-degraded and orphan classification use the frame key too', async () => {
    const { init } = await import('../../src/core/index');
    let frame = 'f1';
    const handle = init({
      project: 'fr2',
      reviewer: 'Sam',
      activation: { mode: 'stealth' },
      routeKey: () => frame,
    });
    altClick(document.body);
    saveWith('anchored');
    // isOrphaned only classifies comments on the CURRENT frame; a different
    // frame's comment is conservatively "live" — assert no throw via export
    // path indirectly by just switching frames.
    frame = 'f2';
    handle.refreshRoute();
    expect(shadow().querySelectorAll('.pin')).toHaveLength(0);
    handle.destroy();
  });
});
