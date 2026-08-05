import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteComment,
  emptyStore,
  listReviewers,
  loadAllStores,
  loadStore,
  mergeComments,
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

  it('re-saving a migrated store stamps schemaVersion 3 and is idempotent', () => {
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
    expect(raw.schemaVersion).toBe(3);
    // Loading again yields a structurally stable result.
    expect(loadStore(localStorage, 'p', 'sarah')).toEqual(first);
  });

  it('saveStore persists v3', () => {
    saveStore(localStorage, emptyStore('p', 'sarah'));
    const raw = JSON.parse(localStorage.getItem('pinflow:c:p:sarah') as string);
    expect(raw.schemaVersion).toBe(3);
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
