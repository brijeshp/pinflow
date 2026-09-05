import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteComment,
  emptyStore,
  listReviewers,
  loadAllStores,
  loadStore,
  mergeComments,
  renameReviewer,
  normalizeComments,
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

  it('re-saving a migrated store stamps schemaVersion 4 and is idempotent', () => {
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
    expect(raw.schemaVersion).toBe(4);
    // Loading again yields a structurally stable result.
    expect(loadStore(localStorage, 'p', 'sarah')).toEqual(first);
  });

  it('saveStore persists v3', () => {
    saveStore(localStorage, emptyStore('p', 'sarah'));
    const raw = JSON.parse(localStorage.getItem('pinflow:c:p:sarah') as string);
    expect(raw.schemaVersion).toBe(4);
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

  it('loads a v2 store unchanged under schema v3 (status/resolution simply absent)', () => {
    localStorage.setItem(
      'pinflow:c:p:sarah',
      JSON.stringify({
        schemaVersion: 2,
        reviewer: 'sarah',
        project: 'p',
        createdAt: '2026-01-01T00:00:00Z',
        comments: [makeComment({ id: 'cmt_v2' })],
      }),
    );
    const loaded = loadStore(localStorage, 'p', 'sarah');
    expect(loaded?.comments).toHaveLength(1);
    expect(loaded?.comments[0]).not.toHaveProperty('status');
    expect(loaded?.comments[0]).not.toHaveProperty('resolution');
  });

  it('round-trips v3 status and resolution', () => {
    const store = upsertComment(
      emptyStore('p', 'sarah'),
      makeComment({ id: 'cmt_r', status: 'done', resolution: 'Shipped in v2.' }),
    );
    saveStore(localStorage, store);
    const loaded = loadStore(localStorage, 'p', 'sarah');
    expect(loaded?.comments[0]).toMatchObject({ status: 'done', resolution: 'Shipped in v2.' });
  });

  it('drops an invalid status and non-string resolution; caps resolution at 500 chars', () => {
    const invalid = { ...makeComment({ id: 'cmt_x' }), status: 'wontfix', resolution: 42 };
    const long = {
      ...makeComment({ id: 'cmt_y' }),
      status: 'declined',
      resolution: 'z'.repeat(600),
    };
    localStorage.setItem(
      'pinflow:c:p:sarah',
      JSON.stringify({
        schemaVersion: 3,
        reviewer: 'sarah',
        project: 'p',
        createdAt: '2026-01-01T00:00:00Z',
        comments: [invalid, long],
      }),
    );
    const loaded = loadStore(localStorage, 'p', 'sarah');
    expect(loaded?.comments[0]).not.toHaveProperty('status');
    expect(loaded?.comments[0]).not.toHaveProperty('resolution');
    expect(loaded?.comments[1]?.status).toBe('declined');
    expect(loaded?.comments[1]?.resolution).toHaveLength(500);
  });

  it('merge: server-only comments are added, local-only comments are kept', () => {
    const local = [makeComment({ id: 'cmt_local', text: 'not synced yet' })];
    const server = [makeComment({ id: 'cmt_server', text: 'from another device' })];
    const merged = mergeComments(local, server);
    expect(merged.map((c) => c.id)).toEqual(['cmt_local', 'cmt_server']);
  });

  it('merge: higher updatedAt wins the whole comment for content', () => {
    const localNewer = mergeComments(
      [makeComment({ id: 'cmt_a', text: 'edited here', updatedAt: '2026-06-02T00:00:00Z' })],
      [makeComment({ id: 'cmt_a', text: 'stale server copy', updatedAt: '2026-06-01T00:00:00Z' })],
    );
    expect(localNewer[0]?.text).toBe('edited here');

    const serverNewer = mergeComments(
      [makeComment({ id: 'cmt_a', text: 'stale local copy', updatedAt: '2026-06-01T00:00:00Z' })],
      [
        makeComment({
          id: 'cmt_a',
          text: 'edited on another device',
          updatedAt: '2026-06-02T00:00:00Z',
        }),
      ],
    );
    expect(serverNewer[0]?.text).toBe('edited on another device');
  });

  it('merge: equal updatedAt resolves to the server copy (deterministic tie-break)', () => {
    const merged = mergeComments(
      [makeComment({ id: 'cmt_a', text: 'local' })],
      [makeComment({ id: 'cmt_a', text: 'server' })],
    );
    expect(merged[0]?.text).toBe('server');
  });

  it('merge: server status/resolution always win, even when local content is newer', () => {
    const merged = mergeComments(
      [
        makeComment({
          id: 'cmt_a',
          text: 'freshly edited',
          updatedAt: '2026-06-09T00:00:00Z',
          status: 'open',
        }),
      ],
      [
        makeComment({
          id: 'cmt_a',
          text: 'old text',
          updatedAt: '2026-06-01T00:00:00Z',
          status: 'done',
          resolution: 'Fixed in build 42.',
        }),
      ],
    );
    expect(merged[0]).toMatchObject({
      text: 'freshly edited',
      status: 'done',
      resolution: 'Fixed in build 42.',
    });
  });

  it('merge: server-absent disposition CLEARS a local one (server owns disposition)', () => {
    const merged = mergeComments(
      [
        makeComment({
          id: 'cmt_a',
          updatedAt: '2026-06-09T00:00:00Z',
          status: 'done',
          resolution: 'stale local disposition',
        }),
      ],
      [makeComment({ id: 'cmt_a', updatedAt: '2026-06-01T00:00:00Z' })],
    );
    expect(merged[0]).not.toHaveProperty('status');
    expect(merged[0]).not.toHaveProperty('resolution');
  });

  it('merge: disposition on a server-only comment survives verbatim', () => {
    const merged = mergeComments(
      [],
      [makeComment({ id: 'cmt_s', status: 'declined', resolution: 'Out of scope.' })],
    );
    expect(merged[0]).toMatchObject({ status: 'declined', resolution: 'Out of scope.' });
  });

  it('merge: pure — neither input array nor its comments are mutated', () => {
    const local = [
      makeComment({
        id: 'cmt_a',
        text: 'local',
        status: 'open',
        updatedAt: '2026-06-09T00:00:00Z',
      }),
    ];
    const server = [makeComment({ id: 'cmt_a', text: 'server', status: 'done' })];
    const localSnapshot = JSON.parse(JSON.stringify(local));
    const serverSnapshot = JSON.parse(JSON.stringify(server));
    mergeComments(local, server);
    expect(local).toEqual(localSnapshot);
    expect(server).toEqual(serverSnapshot);
  });

  it('merge: preserves local ordering and appends server-only comments in server order', () => {
    const local = [makeComment({ id: 'cmt_1' }), makeComment({ id: 'cmt_2' })];
    const server = [
      makeComment({ id: 'cmt_3' }),
      makeComment({ id: 'cmt_2' }),
      makeComment({ id: 'cmt_4' }),
    ];
    expect(mergeComments(local, server).map((c) => c.id)).toEqual([
      'cmt_1',
      'cmt_2',
      'cmt_3',
      'cmt_4',
    ]);
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

describe('production audit hardening', () => {
  afterEach(() => localStorage.clear());

  it('#19: colon-bearing names cannot alias another namespace', async () => {
    const { saveStore, loadStore, emptyStore, listReviewers } =
      await import('../../src/core/storage');
    saveStore(localStorage, { ...emptyStore('a', 'b:c'), comments: [] });
    // Same raw concatenation, different scope — must NOT read a:b/c.
    expect(loadStore(localStorage, 'a:b', 'c')).toBeNull();
    expect(loadStore(localStorage, 'a', 'b:c')).not.toBeNull();
    expect(listReviewers(localStorage, 'a')).toEqual(['b:c']);
    expect(listReviewers(localStorage, 'a:b')).toEqual([]);
  });

  it('#19: pre-encoding corpora (colon-bearing) are still readable via the legacy key', async () => {
    const { loadStore } = await import('../../src/core/storage');
    const legacy = {
      schemaVersion: 3,
      reviewer: 'b:c',
      project: 'a',
      createdAt: 'x',
      comments: [],
    };
    localStorage.setItem('pinflow:c:a:b:c', JSON.stringify(legacy));
    expect(loadStore(localStorage, 'a', 'b:c')?.reviewer).toBe('b:c');
  });

  it('#20: non-finite anchor numbers drop the record instead of exporting NaN%', async () => {
    const { normalizeComments } = await import('../../src/core/storage');
    const base = {
      id: 'c1',
      createdAt: 'x',
      updatedAt: 'x',
      route: '/',
      fullUrl: 'u',
      text: 't',
      modality: 'text',
    };
    const anchor = (pos: unknown, vp: unknown) => ({
      selectors: { testid: null, id: null, css: 'body', xpath: '/x' },
      textFingerprint: '',
      positionPercent: pos,
      viewport: vp,
    });
    const good = { ...base, anchor: anchor({ x: 1, y: 2 }, { width: 3, height: 4 }) };
    const nan = { ...base, id: 'c2', anchor: anchor({ x: NaN, y: 2 }, { width: 3, height: 4 }) };
    const missing = { ...base, id: 'c3', anchor: anchor({ x: 1 }, { width: 3, height: 4 }) };
    const stringy = {
      ...base,
      id: 'c4',
      anchor: anchor({ x: '1', y: 2 }, { width: 3, height: 4 }),
    };
    expect(normalizeComments([good, nan, missing, stringy]).map((c) => c.id)).toEqual(['c1']);
  });
});

it('a missing or non-string updatedAt is coerced at the boundary, never trusted', async () => {
  // updatedAt is the one field of the revision stamp that used to ride the
  // spread unvalidated: a null slips into JSON.stringify as null and two
  // different records could stamp identically (0.11.0 review #4).
  const { normalizeComments } = await import('../../src/core/storage');
  const base = {
    id: 'c1',
    createdAt: '2026-01-01T00:00:00.000Z',
    route: '/',
    fullUrl: 'https://x/',
    text: 't',
    modality: 'text',
    anchor: {
      selectors: { testid: null, id: null, css: 'body', xpath: '/html/body' },
      textFingerprint: '',
      positionPercent: { x: 1, y: 1 },
      viewport: { width: 800, height: 600 },
    },
  };
  const [missing] = normalizeComments([{ ...base }]);
  expect(missing?.updatedAt).toBe('2026-01-01T00:00:00.000Z'); // falls back to createdAt
  const [nulled] = normalizeComments([{ ...base, updatedAt: null }]);
  expect(nulled?.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  const [kept] = normalizeComments([{ ...base, updatedAt: '2026-02-02T00:00:00.000Z' }]);
  expect(kept?.updatedAt).toBe('2026-02-02T00:00:00.000Z');
});

it('duplicate ids are collapsed at the boundary — newest revision wins, later on ties', async () => {
  // Two records sharing an id would collapse the clear's revision map and
  // desync every by-id consumer (merge, union, render) — dedupe where all
  // untrusted comment lists enter (0.11.0 review #5).
  const { normalizeComments } = await import('../../src/core/storage');
  const base = {
    id: 'c1',
    createdAt: '2026-01-01T00:00:00.000Z',
    route: '/',
    fullUrl: 'https://x/',
    text: 'first',
    modality: 'text',
    anchor: {
      selectors: { testid: null, id: null, css: 'body', xpath: '/html/body' },
      textFingerprint: '',
      positionPercent: { x: 1, y: 1 },
      viewport: { width: 800, height: 600 },
    },
  };
  const out = normalizeComments([
    { ...base, updatedAt: '2026-01-02T00:00:00.000Z', text: 'newer' },
    { ...base, updatedAt: '2026-01-01T00:00:00.000Z', text: 'older' },
  ]);
  expect(out).toHaveLength(1);
  expect(out[0]?.text).toBe('newer');
  const tie = normalizeComments([
    { ...base, updatedAt: '2026-01-02T00:00:00.000Z', text: 'first write' },
    { ...base, updatedAt: '2026-01-02T00:00:00.000Z', text: 'second write' },
  ]);
  expect(tie).toHaveLength(1);
  expect(tie[0]?.text).toBe('second write');
});

it('#19 (r2): a legacy raw-key blob is rejected when its embedded scope mismatches', async () => {
  const { loadStore } = await import('../../src/core/storage');
  // Raw key "pinflow:c:a:b:c" is reachable as project "a", reviewer "b:c" —
  // but the blob says it belongs to project "a:b", reviewer "c".
  localStorage.setItem(
    'pinflow:c:a:b:c',
    JSON.stringify({
      schemaVersion: 3,
      reviewer: 'c',
      project: 'a:b',
      createdAt: 'x',
      comments: [],
    }),
  );
  expect(loadStore(localStorage, 'a', 'b:c')).toBeNull(); // scope mismatch → refused
  expect(loadStore(localStorage, 'a:b', 'c')?.reviewer).toBe('c'); // true owner reads fine
  localStorage.clear();
});

it('#20 (r3): context/fingerprint/voice shapes are validated at their REAL locations', async () => {
  const { normalizeComments } = await import('../../src/core/storage');
  const base = (id: string, anchorExtra: object, commentExtra: object = {}) => ({
    id,
    createdAt: 'x',
    updatedAt: 'x',
    route: '/',
    fullUrl: 'u',
    text: 't',
    modality: 'text',
    anchor: {
      selectors: { testid: null, id: null, css: 'body', xpath: '/x' },
      textFingerprint: '',
      positionPercent: { x: 1, y: 2 },
      viewport: { width: 3, height: 4 },
      ...anchorExtra,
    },
    ...commentExtra,
  });
  const kept = normalizeComments([
    base('ok', {}),
    base('okctx', { context: { name: 'n', styles: { color: 'red' } } }),
    base('badctx', { context: 'not-an-object' }),
    base('badstyles', { context: { styles: { color: 42 } } }),
    base('badfp', { textFingerprint: 42 }),
    base('badvoice', {}, { voice: { durationMs: 'long' } }),
    base('badconf', {}, { voice: { durationMs: 100, confidence: 7 } }),
    base('okvoice', {}, { voice: { durationMs: 100, confidence: 0.5, interim: true } }),
  ]).map((c) => c.id);
  expect(kept.sort()).toEqual(['ok', 'okctx', 'okvoice'].sort());
});

describe('areaPercent validation (marquee picker)', () => {
  it('keeps a valid areaPercent, drops records with a malformed one, passes point comments untouched', async () => {
    const { normalizeComments } = await import('../../src/core/storage');
    const base = {
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      route: '/',
      fullUrl: 'http://x/',
      text: 't',
      modality: 'text',
      anchor: {
        selectors: { testid: null, id: null, css: 'body', xpath: '/html/body' },
        textFingerprint: '',
        positionPercent: { x: 50, y: 50 },
        viewport: { width: 800, height: 600 },
      },
    };
    const withArea = {
      ...base,
      id: 'ok',
      anchor: { ...base.anchor, areaPercent: { x: 10, y: 10, w: 50, h: 50 } },
    };
    const nanArea = {
      ...base,
      id: 'nan',
      anchor: { ...base.anchor, areaPercent: { x: NaN, y: 10, w: 50, h: 50 } },
    };
    const outOfRange = {
      ...base,
      id: 'oob',
      anchor: { ...base.anchor, areaPercent: { x: 10, y: 10, w: 150, h: 50 } },
    };
    const point = { ...base, id: 'pt' };
    const kept = normalizeComments([withArea, nanArea, outOfRange, point]);
    expect(kept.map((c) => c.id)).toEqual(['ok', 'pt']);
    expect(kept[0]!.anchor.areaPercent).toEqual({ x: 10, y: 10, w: 50, h: 50 });
    expect(kept[1]!.anchor.areaPercent).toBeUndefined();
  });
});

// 0.4.1 review #8: the fingerprint's documented representation is ≤80 chars,
// but hydration accepted any string — and the matcher's lowercase/bigram work
// is O(length), so a multi-megabyte value became a host-thread stall. The cap
// belongs at normalization so no oversized value ever reaches a matcher.
it('caps an oversized hydrated textFingerprint to the 80-char representation', async () => {
  const { normalizeComments } = await import('../../src/core/storage');
  const oversized = {
    id: 'big',
    createdAt: 'x',
    updatedAt: 'x',
    route: '/',
    fullUrl: 'u',
    text: 't',
    modality: 'text',
    anchor: {
      selectors: { testid: null, id: null, css: 'body', xpath: '/x' },
      textFingerprint: 'a'.repeat(2_000_000),
      positionPercent: { x: 1, y: 2 },
      viewport: { width: 3, height: 4 },
    },
  };
  const kept = normalizeComments([oversized]);
  expect(kept).toHaveLength(1);
  expect(kept[0]!.id).toBe('big');
  expect(kept[0]!.anchor.textFingerprint).toBe('a'.repeat(80));
});

// ————— 0.6.1 —————
describe('a malformed textFingerprint must not take the whole store down', () => {
  function rec(fingerprint: unknown): unknown {
    return {
      id: 'c1',
      createdAt: 'x',
      updatedAt: 'x',
      route: '/',
      fullUrl: 'http://x/',
      modality: 'text',
      text: 't',
      anchor: {
        selectors: { testid: null, id: null, css: 'p', xpath: '/p' },
        textFingerprint: fingerprint,
        positionPercent: { x: 1, y: 1 },
        viewport: { width: 100, height: 100 },
      },
    };
  }

  // optStr admitted null/undefined, then normalizeComments dereferenced
  // .length unguarded in the same map — so ONE hostile record from a source()
  // payload or tampered localStorage threw and discarded every other comment.
  it.each([
    ['null', null],
    ['absent', undefined],
    ['a number', 42],
  ])('drops only the bad record when the fingerprint is %s', (_label, fp) => {
    const good = rec('real fingerprint') as Record<string, unknown>;
    (good as { id: string }).id = 'c2';
    expect(() => normalizeComments([rec(fp), good] as never)).not.toThrow();
    const out = normalizeComments([rec(fp), good] as never);
    expect(out.map((c) => c.id)).toEqual(['c2']);
  });

  it('keeps an empty-string fingerprint, which buildAnchor legitimately writes', () => {
    expect(normalizeComments([rec('')] as never)).toHaveLength(1);
  });
});

describe('covers survives hydration (0.6.1)', () => {
  function rec(covers: unknown): unknown {
    return {
      id: 'c1',
      createdAt: 'x',
      updatedAt: 'x',
      route: '/',
      fullUrl: 'http://x/',
      modality: 'text',
      text: 't',
      anchor: {
        selectors: { testid: null, id: null, css: 'p', xpath: '/p' },
        textFingerprint: 'fp',
        positionPercent: { x: 1, y: 1 },
        viewport: { width: 100, height: 100 },
        areaPercent: { x: 0, y: 0, w: 10, h: 10 },
        ...(covers === undefined ? {} : { covers }),
      },
    };
  }

  it('keeps a valid covers string untouched', () => {
    const out = normalizeComments([rec('one\ntwo')] as never);
    expect(out[0]!.anchor.covers).toBe('one\ntwo');
  });

  it('an old area comment with no covers still validates', () => {
    expect(normalizeComments([rec(undefined)] as never)).toHaveLength(1);
  });

  it('drops a record whose covers is not a string', () => {
    expect(normalizeComments([rec(42)] as never)).toEqual([]);
  });
});

// ————— 0.6.1 review round —————
describe('covers is string-or-absent, never null (review #2)', () => {
  function rec(covers: unknown, present = true): unknown {
    return {
      id: 'c1',
      createdAt: 'x',
      updatedAt: 'x',
      route: '/',
      fullUrl: 'http://x/',
      modality: 'text',
      text: 't',
      anchor: {
        selectors: { testid: null, id: null, css: 'p', xpath: '/p' },
        textFingerprint: 'fp',
        positionPercent: { x: 1, y: 1 },
        viewport: { width: 100, height: 100 },
        areaPercent: { x: 0, y: 0, w: 10, h: 10 },
        ...(present ? { covers } : {}),
      },
    };
  }

  // optStr admits null, and the spread preserved it into a field the type
  // declares as `string | undefined` — so a source() payload could hand every
  // downstream consumer a null where only a string is possible.
  it('drops a record whose covers is null', () => {
    expect(normalizeComments([rec(null)] as never)).toEqual([]);
  });

  it('keeps absence, which is how every point comment and every 0.6.0 record looks', () => {
    const out = normalizeComments([rec(undefined, false)] as never);
    expect(out).toHaveLength(1);
    expect(out[0]!.anchor.covers).toBeUndefined();
  });

  it('keeps a real string', () => {
    expect(normalizeComments([rec('one\ntwo')] as never)[0]!.anchor.covers).toBe('one\ntwo');
  });
});

// Naming yourself at export time moves the corpus: the storage key embeds the
// reviewer (`pinflow:c:<project>:<reviewer>`), so a rename that only rewrote
// the blob would strand every existing comment under the old key.
describe('renameReviewer', () => {
  beforeEach(() => localStorage.clear());

  it('moves the corpus to the new key and drops the old one', () => {
    saveStore(localStorage, {
      ...emptyStore('p', 'anon_abc'),
      comments: [makeComment({ id: 'cmt_1' })],
    });
    expect(renameReviewer(localStorage, 'p', 'anon_abc', 'Brijesh')).toBe(true);

    const moved = loadStore(localStorage, 'p', 'Brijesh');
    expect(moved?.comments.map((c) => c.id)).toEqual(['cmt_1']);
    expect(moved?.reviewer).toBe('Brijesh');
    expect(localStorage.getItem(storageKey('p', 'anon_abc'))).toBeNull();
  });

  it('merges into an existing store under the target name without duplicating', () => {
    saveStore(localStorage, {
      ...emptyStore('p', 'anon_abc'),
      comments: [makeComment({ id: 'cmt_new' }), makeComment({ id: 'cmt_shared' })],
    });
    saveStore(localStorage, {
      ...emptyStore('p', 'Brijesh'),
      comments: [makeComment({ id: 'cmt_old' }), makeComment({ id: 'cmt_shared' })],
    });
    expect(renameReviewer(localStorage, 'p', 'anon_abc', 'Brijesh')).toBe(true);

    const ids = loadStore(localStorage, 'p', 'Brijesh')?.comments.map((c) => c.id) ?? [];
    expect([...ids].sort()).toEqual(['cmt_new', 'cmt_old', 'cmt_shared']);
    expect(localStorage.getItem(storageKey('p', 'anon_abc'))).toBeNull();
  });

  it('is a no-op when the names match', () => {
    saveStore(localStorage, { ...emptyStore('p', 'Brijesh'), comments: [makeComment()] });
    expect(renameReviewer(localStorage, 'p', 'Brijesh', 'Brijesh')).toBe(false);
    expect(loadStore(localStorage, 'p', 'Brijesh')?.comments).toHaveLength(1);
  });

  it('reports failure without destroying the source when the write is refused', () => {
    saveStore(localStorage, { ...emptyStore('p', 'anon_abc'), comments: [makeComment()] });
    const real = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      if (k === storageKey('p', 'Brijesh')) throw new DOMException('quota', 'QuotaExceededError');
      real(k, v);
    });
    expect(renameReviewer(localStorage, 'p', 'anon_abc', 'Brijesh')).toBe(false);
    spy.mockRestore();
    // The corpus must still be readable under the name it already had.
    expect(loadStore(localStorage, 'p', 'anon_abc')?.comments).toHaveLength(1);
  });
});

// Review #2: the first merge kept the TARGET's copy of a duplicate id and then
// deleted the source key — so a newer edit made under the anonymous handle was
// destroyed by naming yourself. Ids matching is not the same as content
// surviving, which is exactly what the original test asserted.
describe('renameReviewer duplicate-id conflicts', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the newer edit when both sides hold the same comment', () => {
    saveStore(localStorage, {
      ...emptyStore('p', 'Brijesh'),
      comments: [
        makeComment({ id: 'cmt_1', text: 'stale edit', updatedAt: '2026-08-11T12:00:00Z' }),
      ],
    });
    saveStore(localStorage, {
      ...emptyStore('p', 'anon_abc'),
      comments: [makeComment({ id: 'cmt_1', text: 'new edit', updatedAt: '2026-08-12T12:00:00Z' })],
    });
    expect(renameReviewer(localStorage, 'p', 'anon_abc', 'Brijesh')).toBe(true);

    const kept = loadStore(localStorage, 'p', 'Brijesh')?.comments ?? [];
    expect(kept).toHaveLength(1);
    expect(kept[0]!.text).toBe('new edit');
    expect(kept[0]!.updatedAt).toBe('2026-08-12T12:00:00Z');
  });

  it('keeps the target copy when the source edit is older', () => {
    saveStore(localStorage, {
      ...emptyStore('p', 'Brijesh'),
      comments: [makeComment({ id: 'cmt_1', text: 'newer', updatedAt: '2026-08-12T12:00:00Z' })],
    });
    saveStore(localStorage, {
      ...emptyStore('p', 'anon_abc'),
      comments: [makeComment({ id: 'cmt_1', text: 'older', updatedAt: '2026-08-11T12:00:00Z' })],
    });
    renameReviewer(localStorage, 'p', 'anon_abc', 'Brijesh');
    expect(loadStore(localStorage, 'p', 'Brijesh')?.comments[0]!.text).toBe('newer');
  });

  it('breaks an updatedAt tie toward the target, deterministically', () => {
    const at = '2026-08-12T12:00:00Z';
    saveStore(localStorage, {
      ...emptyStore('p', 'Brijesh'),
      comments: [makeComment({ id: 'cmt_1', text: 'target', updatedAt: at })],
    });
    saveStore(localStorage, {
      ...emptyStore('p', 'anon_abc'),
      comments: [makeComment({ id: 'cmt_1', text: 'source', updatedAt: at })],
    });
    renameReviewer(localStorage, 'p', 'anon_abc', 'Brijesh');
    expect(loadStore(localStorage, 'p', 'Brijesh')?.comments[0]!.text).toBe('target');
  });
});

// 0.8.0 review. scope.ts strips invisible characters from a label at CAPTURE,
// and says why: the value "flows into localStorage, the JSON export and the
// host's onChange payload, all of which bypass the markdown escapers
// entirely". Hydration serves backends, imported exports and tampered blobs —
// strictly less trusted than the DOM — but re-applied only the LENGTH cap. So
// the one boundary that exists to distrust the wire let the wire through.
describe('scope hydration sanitises like capture does', () => {
  const withScope = (boundary: unknown): unknown[] => [
    {
      id: 'c1',
      createdAt: '',
      updatedAt: '',
      route: '/',
      text: 'the reviewer words',
      modality: 'text',
      anchor: {
        selectors: { testid: null, id: null, css: 'body', xpath: '/html/body' },
        textFingerprint: '',
        positionPercent: { x: 1, y: 1 },
        viewport: { width: 9, height: 9 },
      },
      scope: { gen: 1, rung: 'landmark', confidence: 'low', boundary },
    },
  ];

  it('strips bidi overrides, zero-width and Unicode tag characters from a label', () => {
    const evil = 'Save‮​\u{E0001} me';
    const out = normalizeComments(withScope({ tag: 'div', css: 'div', label: evil }) as never);
    const label = out[0]!.scope!.boundary.label!;
    expect(label).toBe('Save me');
    expect(/[​-‏‪-‮﻿]/.test(label)).toBe(false);
    expect(/\uDB40[\uDC00-\uDC7F]/.test(label)).toBe(false);
  });

  it('also strips them from a testid, which reaches the same artifact line', () => {
    const out = normalizeComments(
      withScope({ tag: 'div', css: 'div', testid: 'up‮grade' }) as never,
    );
    expect(out[0]!.scope!.boundary.testid).toBe('upgrade');
  });

  // Every other untrusted string on the record is bounded — textFingerprint to
  // FP_MAX, resolution to 500. These two were not, so one payload could carry
  // an unbounded string into every future export and onChange call.
  it('rejects a node whose tag or css is absurdly long rather than truncating it', () => {
    const longCss = normalizeComments(withScope({ tag: 'div', css: 'y'.repeat(50000) }) as never);
    expect(longCss[0]!.scope).toBeUndefined();
    const longTag = normalizeComments(withScope({ tag: 'x'.repeat(5000), css: 'div' }) as never);
    expect(longTag[0]!.scope).toBeUndefined();
    // Losing a boundary hint must never lose the reviewer's words.
    expect(longCss[0]!.text).toBe('the reviewer words');
    expect(longTag[0]!.text).toBe('the reviewer words');
  });

  it('keeps a realistic deep css path', () => {
    const real = Array.from({ length: 20 }, (_, i) => `div.wrapper-${i} > section`).join(' > ');
    const out = normalizeComments(withScope({ tag: 'section', css: real }) as never);
    expect(out[0]!.scope!.boundary.css).toBe(real);
  });
});

// A non-string label reaching a string-only sanitiser is how the FP_MAX bug
// took out a whole store: the guard was a cast, so the throw happened inside
// the map and discarded every other comment with it.
it('survives a scope node whose label or testid is not a string', () => {
  const rec = (boundary: unknown): unknown[] => [
    {
      id: 'c1',
      createdAt: '',
      updatedAt: '',
      route: '/',
      text: 'kept',
      modality: 'text',
      anchor: {
        selectors: { testid: null, id: null, css: 'body', xpath: '/html/body' },
        textFingerprint: '',
        positionPercent: { x: 1, y: 1 },
        viewport: { width: 9, height: 9 },
      },
      scope: { gen: 1, rung: 'landmark', confidence: 'low', boundary },
    },
  ];
  for (const bad of [5, {}, [], true]) {
    expect(() =>
      normalizeComments(rec({ tag: 'div', css: 'div', label: bad }) as never),
    ).not.toThrow();
    const out = normalizeComments(rec({ tag: 'div', css: 'div', testid: bad }) as never);
    expect(out[0]!.text).toBe('kept');
    expect(out[0]!.scope!.boundary.testid).toBeUndefined();
  }
});

// The 0.7.0 rename and the 0.8.0 scope model met for the first time in a
// merge, so no test covered a scoped comment surviving a corpus move.
it('carries scope through a reviewer rename, newest edit winning', () => {
  localStorage.clear();
  const scoped = (id: string, updatedAt: string, label: string): Comment => ({
    ...makeComment({ id, updatedAt }),
    scope: {
      gen: 1,
      rung: 'testid',
      confidence: 'high',
      boundary: { tag: 'section', css: 'section', label },
    },
  });
  saveStore(localStorage, {
    ...emptyStore('p', 'Brijesh'),
    comments: [scoped('cmt_1', '2026-08-11T00:00:00Z', 'older')],
  });
  saveStore(localStorage, {
    ...emptyStore('p', 'anon_abc'),
    comments: [
      scoped('cmt_1', '2026-08-12T00:00:00Z', 'newer'),
      scoped('cmt_2', '2026-08-12T00:00:00Z', 'only-here'),
    ],
  });
  expect(renameReviewer(localStorage, 'p', 'anon_abc', 'Brijesh')).toBe(true);

  const moved = loadStore(localStorage, 'p', 'Brijesh')?.comments ?? [];
  expect(moved).toHaveLength(2);
  const one = moved.find((c) => c.id === 'cmt_1')!;
  expect(one.scope?.boundary.label).toBe('newer');
  expect(one.scope?.rung).toBe('testid');
  expect(moved.find((c) => c.id === 'cmt_2')?.scope?.boundary.label).toBe('only-here');
});

describe('anchor.layer (dialog binding)', () => {
  it('preserves a well-formed layer through hydration', () => {
    const c = makeComment({
      anchor: {
        selectors: { testid: null, id: null, css: 'body', xpath: '/html/body' },
        textFingerprint: '',
        positionPercent: { x: 50, y: 50 },
        viewport: { width: 1440, height: 900 },
        layer: { role: 'dialog', name: 'Add Patients' },
      },
    });
    expect(normalizeComments([c])[0]?.anchor.layer).toEqual({
      role: 'dialog',
      name: 'Add Patients',
    });
  });

  it('drops a record whose layer would corrupt resolution', () => {
    const bad = (layer: unknown) =>
      makeComment({
        anchor: {
          selectors: { testid: null, id: null, css: 'body', xpath: '/html/body' },
          textFingerprint: '',
          positionPercent: { x: 50, y: 50 },
          viewport: { width: 1440, height: 900 },
          layer: layer as never,
        },
      });
    expect(normalizeComments([bad('dialog')])).toHaveLength(0);
    expect(normalizeComments([bad({ role: 7 })])).toHaveLength(0);
    expect(normalizeComments([bad({ role: 'dialog', name: 3 })])).toHaveLength(0);
    expect(normalizeComments([bad({ role: 'dialog', name: 'x'.repeat(81) })])).toHaveLength(0);
    expect(normalizeComments([bad(null)])).toHaveLength(0);
  });
});
