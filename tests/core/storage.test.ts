import { beforeEach, describe, expect, it } from 'vitest';
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
    expect(loadStore(localStorage, 'p', 'sarah')).toMatchObject({ reviewer: 'sarah', project: 'p' });
  });

  it('returns null for missing/malformed', () => {
    expect(loadStore(localStorage, 'p', 'nope')).toBeNull();
    localStorage.setItem('pinflow:c:p:bad', 'not json');
    expect(loadStore(localStorage, 'p', 'bad')).toBeNull();
  });

  it('ignores wrong schema version', () => {
    localStorage.setItem(
      'pinflow:c:p:sarah',
      JSON.stringify({ schemaVersion: 999, reviewer: 'sarah', project: 'p', comments: [] }),
    );
    expect(loadStore(localStorage, 'p', 'sarah')).toBeNull();
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
