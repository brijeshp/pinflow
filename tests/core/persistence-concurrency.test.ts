import { afterEach, describe, expect, it, vi } from 'vitest';
import { rememberReviewer, rememberedReviewer } from '../../src/core/identity';
import { routeKey } from '../../src/core/route-key';
import { emptyStore, loadStore, renameReviewer, saveStore } from '../../src/core/storage';
import type { Anchor, Comment } from '../../src/core/types';
import { Annotator } from '../../src/core/ui/annotator';

const PROJECT = 'concurrent-feedback';
const REVIEWER = 'Reviewer';
const instances: Annotator[] = [];

// Separate annotators hold independent snapshots, just as two tabs do. Drive
// the commit boundary directly so global pointer listeners cannot submit the
// same gesture to every simulated tab; edits and deletes use the actual UI.
interface Editor {
  _commitTextComment(anchor: Anchor, text: string, openForEdit: boolean): void;
  _openInput(commentId: string): void;
}

function comment(id: string, text = id): Comment {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    route: routeKey(),
    fullUrl: window.location.href,
    text,
    modality: 'text',
    anchor: {
      selectors: { testid: null, id: null, css: 'body', xpath: '/html/body' },
      textFingerprint: '',
      positionPercent: { x: 50, y: 50 },
      viewport: { width: 800, height: 600 },
    },
  };
}

function seed(comments: Comment[]): void {
  saveStore(localStorage, { ...emptyStore(PROJECT, REVIEWER), comments });
}

function tab(): { editor: Editor; root: ShadowRoot } {
  const annotator = new Annotator({
    config: { project: PROJECT },
    reviewer: REVIEWER,
    mode: 'reviewer',
    storage: localStorage,
  });
  instances.push(annotator);
  const hosts = document.querySelectorAll('[data-pinflow-root]');
  const root = hosts[hosts.length - 1]?.shadowRoot;
  if (!root) throw new Error('Annotator root missing');
  return { editor: annotator as unknown as Editor, root };
}

function add(target: ReturnType<typeof tab>, text: string): void {
  target.editor._commitTextComment(comment('anchor').anchor, text, false);
}

function edit(target: ReturnType<typeof tab>, id: string, text: string): void {
  target.editor._openInput(id);
  const input = target.root.querySelector('textarea');
  const save = target.root.querySelector<HTMLButtonElement>('button.save');
  if (!input || !save) throw new Error('Comment editor missing');
  input.value = text;
  save.click();
}

function remove(target: ReturnType<typeof tab>, id: string): void {
  target.editor._openInput(id);
  const button = target.root.querySelector<HTMLButtonElement>('button.delete');
  if (!button) throw new Error('Delete action missing');
  button.click();
}

function savedTexts(): string[] {
  return (loadStore(localStorage, PROJECT, REVIEWER)?.comments ?? []).map((c) => c.text).sort();
}

afterEach(() => {
  for (const annotator of instances.splice(0)) annotator.destroy();
  vi.restoreAllMocks();
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('independent reviewer snapshots', () => {
  it('preserves both additions when the second tab started before the first save', () => {
    const first = tab();
    const second = tab();

    add(first, 'First tab feedback');
    add(second, 'Second tab feedback');

    expect(savedTexts()).toEqual(['First tab feedback', 'Second tab feedback']);
  });

  it('preserves another tab addition when saving an existing comment edit', () => {
    seed([comment('existing', 'Original')]);
    const first = tab();
    const second = tab();

    add(first, 'New feedback');
    edit(second, 'existing', 'Revised feedback');

    expect(savedTexts()).toEqual(['New feedback', 'Revised feedback']);
  });

  it('does not resurrect a deleted comment when a stale tab adds unrelated feedback', () => {
    seed([comment('removed', 'Deleted feedback')]);
    const first = tab();
    const second = tab();

    remove(first, 'removed');
    add(second, 'New feedback');

    expect(savedTexts()).toEqual(['New feedback']);
  });

  it('preserves third-tab additions across a deletion and a later stale-tab save', () => {
    seed([comment('removed', 'Deleted feedback')]);
    const first = tab();
    const second = tab();
    const third = tab();

    add(third, 'Third tab feedback');
    remove(first, 'removed');
    add(second, 'Second tab feedback');

    expect(savedTexts()).toEqual(['Second tab feedback', 'Third tab feedback']);
  });

  it('does not restore a deleted comment when a stale editor saves an edit', () => {
    seed([comment('removed', 'Deleted feedback')]);
    const first = tab();
    const second = tab();
    remove(first, 'removed');
    edit(second, 'removed', 'Stale edit');
    expect(savedTexts()).toEqual([]);
  });

  it('retains a failed-persist addition for the next successful save', () => {
    const first = tab();
    const write = localStorage.setItem.bind(localStorage);
    const deny = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    add(first, 'Pending feedback');
    deny.mockImplementation(write);
    add(first, 'Later feedback');
    expect(savedTexts()).toEqual(['Later feedback', 'Pending feedback']);
  });
});

it('keeps the source corpus reachable if remembering a reviewer rename is refused', () => {
  seed([comment('valuable-feedback', 'Keep this feedback')]);
  rememberReviewer(localStorage, PROJECT, REVIEWER);
  const write = localStorage.setItem.bind(localStorage);
  vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
    if (key === `pinflow:r:${PROJECT}`) throw new DOMException('denied', 'QuotaExceededError');
    write(key, value);
  });

  const renamed = renameReviewer(localStorage, PROJECT, REVIEWER, 'New name');

  expect(rememberedReviewer(localStorage, PROJECT)).toBe(REVIEWER);
  expect(loadStore(localStorage, PROJECT, REVIEWER)?.comments).toEqual([
    comment('valuable-feedback', 'Keep this feedback'),
  ]);
  expect(renamed).toBe(false);
});
