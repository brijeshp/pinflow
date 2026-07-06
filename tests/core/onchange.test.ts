import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Comment, ReviewerStore } from '../../src/core/types';

// Synthesize the desktop Alt+click stealth gesture (happy-dom has no
// PointerEvent constructor — same pattern as init.test.ts).
function altClick(target: EventTarget): void {
  const e = new Event('pointerdown', { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 1, pointerType: 'mouse', altKey: true, clientX: 12, clientY: 12 });
  target.dispatchEvent(e);
  // The gesture controller swallows exactly one trailing click after an
  // activation (so the press release doesn't click the host page). Consume it
  // here so the test's subsequent .click() calls reach their targets.
  document.body.dispatchEvent(new Event('click', { bubbles: true }));
}

function shadow(): ShadowRoot {
  const root = document.querySelector('[data-pinflow-root]')?.shadowRoot;
  if (!root) throw new Error('pinflow shadow root missing');
  return root;
}

interface Change {
  type: 'add' | 'update' | 'delete';
  comment: Comment;
  storeSize: number;
}

describe('onChange callback (A2)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  async function mount(changes: Change[], onChange?: (s: ReviewerStore, c: unknown) => void) {
    const { init } = await import('../../src/core/index');
    return init({
      project: 'oc',
      reviewer: 'Sam',
      activation: { mode: 'stealth' },
      onChange:
        onChange ??
        ((store, change) =>
          changes.push({ ...change, storeSize: store.comments.length } as Change)),
    });
  }

  it('fires add → update → delete across a comment lifecycle', async () => {
    const changes: Change[] = [];
    const handle = await mount(changes);

    altClick(document.body);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.type).toBe('add');
    expect(changes[0]!.comment.modality).toBe('text');
    expect(changes[0]!.storeSize).toBe(1);
    const id = changes[0]!.comment.id;

    const ta = shadow().querySelector('textarea');
    expect(ta).not.toBeNull();
    ta!.value = 'needs more contrast';
    (shadow().querySelector('.save') as HTMLButtonElement).click();
    expect(changes).toHaveLength(2);
    expect(changes[1]!.type).toBe('update');
    expect(changes[1]!.comment.id).toBe(id);
    expect(changes[1]!.comment.text).toBe('needs more contrast');

    // Save closed the popup — reopen via the pin to delete.
    (shadow().querySelector('.pin') as HTMLDivElement).click();
    (shadow().querySelector('.delete') as HTMLButtonElement).click();
    expect(changes).toHaveLength(3);
    expect(changes[2]!.type).toBe('delete');
    expect(changes[2]!.comment.id).toBe(id);
    expect(changes[2]!.storeSize).toBe(0);
    handle.destroy();
  });

  it('does not emit an update when Save is clicked with unchanged text', async () => {
    const changes: Change[] = [];
    const handle = await mount(changes);
    altClick(document.body);
    const ta = shadow().querySelector('textarea')!;
    ta.value = 'kept';
    (shadow().querySelector('.save') as HTMLButtonElement).click();
    (shadow().querySelector('.pin') as HTMLDivElement).click();
    (shadow().querySelector('.save') as HTMLButtonElement).click(); // no edit this time
    expect(changes.map((c) => c.type)).toEqual(['add', 'update']);
    handle.destroy();
  });

  it('dismissing a never-saved empty comment emits its delete', async () => {
    const changes: Change[] = [];
    const handle = await mount(changes);
    altClick(document.body); // add (empty text)
    const ta = shadow().querySelector('textarea')!;
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(changes.map((c) => c.type)).toEqual(['add', 'delete']);
    expect(changes[1]!.storeSize).toBe(0);
    handle.destroy();
  });

  it('a throwing handler is contained and never breaks the annotator', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handle = await mount([], () => {
      throw new Error('host bug');
    });
    expect(() => altClick(document.body)).not.toThrow();
    // The comment was still created and persisted despite the handler throwing.
    const raw = localStorage.getItem('pinflow:c:oc:Sam');
    expect(JSON.parse(raw as string).comments).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    handle.destroy();
  });
});
