import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteComment,
  emptyStore,
  listReviewers,
  loadAllStores,
  loadStore,
  saveStore,
  storageKey,
  upsertComment,
} from '../../src/core/storage';
import type { Comment } from '../../src/core/types';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'cmt_a',
    createdAt: '2026-04-15T00:00:00Z',
    updatedAt: '2026-04-15T00:00:00Z',
    route: '/',
    fullUrl: 'http://x/',
    text: 'hi',
    modality: 'text',
    anchor: {
      selectors: { testid: null, id: null, css: 'body', xpath: '/html/body' },
      textFingerprint: '',
      positionPercent: { x: 50, y: 50 },
      viewport: { width: 1440, height: 900 },
    },
    ...overrides,
  };
}

describe('storage', () => {
  beforeEach(() => localStorage.clear());

  it('keys namespace by project + reviewer', () => {
    expect(storageKey('p', 'sarah')).toBe('pinflow:c:p:sarah');
  });

  it('does not mistake identity key for a reviewer store', () => {
    // identity.ts uses `pinflow:r:<project>` — previously the store prefix
    // `pinflow:<project>:` would swallow an identity key when project === 'r'.
    localStorage.setItem('pinflow:r:anything', 'Sarah');
    expect(listReviewers(localStorage, 'r')).toEqual([]);
  });

  it('saves and loads a store', () => {
    const s = emptyStore('p', 'sarah');
    saveStore(localStorage, s);
    expect(loadStore(localStorage, 'p', 'sarah')).toMatchObject({
      reviewer: 'sarah',
      project: 'p',
    });
  });

  it('returns null for missing/malformed', () => {
    expect(loadStore(localStorage, 'p', 'nope')).toBeNull();
    localStorage.setItem('pinflow:c:p:bad', 'not json');
    expect(loadStore(localStorage, 'p', 'bad')).toBeNull();
  });

  it('reads a newer schema tolerantly instead of wiping it (forward-compat)', () => {
    // A future build wrote schemaVersion 999. An older build must NOT return null
    // (which would let the next save overwrite the user's data) — it reads the
    // stable core fields and leaves the blob intact.
    localStorage.setItem(
      'pinflow:c:p:sarah',
      JSON.stringify({
        schemaVersion: 999,
        reviewer: 'sarah',
        project: 'p',
        createdAt: '2026-01-01T00:00:00Z',
        comments: [makeComment({ id: 'cmt_future' })],
        futureField: 'ignored',
      }),
    );
    const loaded = loadStore(localStorage, 'p', 'sarah');
    expect(loaded).toMatchObject({ reviewer: 'sarah', project: 'p' });
    expect(loaded?.comments).toHaveLength(1);
  });

  it('upserts and deletes comments immutably', () => {
    const s1 = emptyStore('p', 'sarah');
    const s2 = upsertComment(s1, makeComment());
    expect(s1.comments).toHaveLength(0);
    expect(s2.comments).toHaveLength(1);
    const s3 = upsertComment(s2, makeComment({ id: 'cmt_a', text: 'updated' }));
    expect(s3.comments).toHaveLength(1);
    expect(s3.comments[0]?.text).toBe('updated');
    const s4 = deleteComment(s3, 'cmt_a');
    expect(s4.comments).toHaveLength(0);
  });

  it('lists reviewers and loads all', () => {
    saveStore(localStorage, emptyStore('p', 'sarah'));
    saveStore(localStorage, emptyStore('p', 'mike'));
    saveStore(localStorage, emptyStore('other', 'jen'));
    expect(listReviewers(localStorage, 'p')).toEqual(['mike', 'sarah']);
    expect(loadAllStores(localStorage, 'p')).toHaveLength(2);
  });
});

describe('storage v2 migration & hardening', () => {
  beforeEach(() => localStorage.clear());

  it('migrates a v1 store, defaulting every comment to text modality', () => {
    // v1 comments had no `modality` field.
    const v1Comment = { ...makeComment({ id: 'cmt_v1' }) } as Record<string, unknown>;
    delete v1Comment['modality'];
    localStorage.setItem(
      'pinflow:c:p:sarah',
      JSON.stringify({
        schemaVersion: 1,
        reviewer: 'sarah',
        project: 'p',
        createdAt: '2026-01-01T00:00:00Z',
        comments: [v1Comment],
      }),
    );
    const loaded = loadStore(localStorage, 'p', 'sarah');
    expect(loaded?.comments).toHaveLength(1);
    expect(loaded?.comments[0]?.modality).toBe('text');
  });

  it('re-saving a migrated store stamps schemaVersion 2 and is idempotent', () => {
    localStorage.setItem(
      'pinflow:c:p:sarah',
      JSON.stringify({
        schemaVersion: 1,
        reviewer: 'sarah',
        project: 'p',
        createdAt: '2026-01-01T00:00:00Z',
        comments: [],
      }),
    );
    const first = loadStore(localStorage, 'p', 'sarah');
    expect(first).not.toBeNull();
    saveStore(localStorage, first!);
    const raw = JSON.parse(localStorage.getItem('pinflow:c:p:sarah') as string);
    expect(raw.schemaVersion).toBe(2);
    // Loading again yields a structurally stable result.
    expect(loadStore(localStorage, 'p', 'sarah')).toEqual(first);
  });

  it('saveStore persists v2', () => {
    saveStore(localStorage, emptyStore('p', 'sarah'));
    const raw = JSON.parse(localStorage.getItem('pinflow:c:p:sarah') as string);
    expect(raw.schemaVersion).toBe(2);
  });

  it('discards a corrupt blob on load', () => {
    localStorage.setItem('pinflow:c:p:bad', '{ broken json');
    expect(loadStore(localStorage, 'p', 'bad')).toBeNull();
  });

  it('coerces corrupt text/route/createdAt to safe defaults instead of crashing export (P4.6)', () => {
    const corrupt = {
      ...makeComment({ id: 'cmt_corrupt' }),
      text: 42,
      route: null,
      createdAt: 1234567890,
    };
    localStorage.setItem(
      'pinflow:c:p:sarah',
      JSON.stringify({
        schemaVersion: 2,
        reviewer: 'sarah',
        project: 'p',
        createdAt: '2026-01-01T00:00:00Z',
        comments: [corrupt],
      }),
    );
    const loaded = loadStore(localStorage, 'p', 'sarah');
    expect(loaded?.comments).toHaveLength(1);
    expect(loaded?.comments[0]).toMatchObject({ text: '', route: '', createdAt: '' });
  });

  it('drops records with a corrupt anchor sub-shape, keeping valid siblings (P4.6)', () => {
    const good = makeComment({ id: 'cmt_good' });
    const noSelectors = { ...makeComment({ id: 'cmt_a' }), anchor: { positionPercent: {} } };
    const badCss = {
      ...makeComment({ id: 'cmt_b' }),
      anchor: { ...good.anchor, selectors: { css: 9 } },
    };
    const noPosition = {
      ...makeComment({ id: 'cmt_c' }),
      anchor: { selectors: good.anchor.selectors, viewport: good.anchor.viewport },
    };
    const noViewport = {
      ...makeComment({ id: 'cmt_d' }),
      anchor: { selectors: good.anchor.selectors, positionPercent: { x: 1, y: 2 } },
    };
    localStorage.setItem(
      'pinflow:c:p:sarah',
      JSON.stringify({
        schemaVersion: 2,
        reviewer: 'sarah',
        project: 'p',
        createdAt: '2026-01-01T00:00:00Z',
        comments: [good, noSelectors, badCss, noPosition, noViewport],
      }),
    );
    const loaded = loadStore(localStorage, 'p', 'sarah');
    expect(loaded?.comments.map((c) => c.id)).toEqual(['cmt_good']);
  });

  it('never throws on write failure and warns exactly once per session', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throwing: Storage = {
      getItem: () => null,
      setItem: () => {
        const err = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
    expect(() => saveStore(throwing, emptyStore('p', 'sarah'))).not.toThrow();
    saveStore(throwing, emptyStore('p', 'sarah')); // second failure — silent
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[pinflow] failed to persist comments', expect.any(Error));
    warn.mockRestore();
  });
});
