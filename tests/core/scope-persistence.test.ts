import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  loadStore,
  mergeComments,
  normalizeComments,
  saveStore,
  storageKey,
} from '../../src/core/storage';
import type { Comment, Scope } from '../../src/core/types';

function anchor(): Comment['anchor'] {
  return {
    selectors: { testid: null, id: null, css: 'main > button', xpath: '/html/body/main/button[1]' },
    textFingerprint: 'Upgrade',
    positionPercent: { x: 50, y: 50 },
    viewport: { width: 390, height: 844 },
  };
}

function comment(over: Partial<Comment> = {}): Comment {
  return {
    id: 'cmt_1',
    createdAt: '2026-08-12T00:00:00Z',
    updatedAt: '2026-08-12T00:00:00Z',
    route: '/pricing',
    fullUrl: 'https://x.test/pricing',
    text: 'make this primary',
    modality: 'text',
    anchor: anchor(),
    ...over,
  };
}

const SCOPE: Scope = {
  gen: 1,
  rung: 'testid',
  confidence: 'high',
  boundary: { tag: 'div', css: 'main > div.grid', testid: 'plans' },
  members: [
    { tag: 'article', css: 'main > div.grid > article:nth-of-type(1)', band: 'inside' },
    { tag: 'article', css: 'main > div.grid > article:nth-of-type(2)', band: 'inside' },
  ],
};

function normalizeOne(over: Record<string, unknown>): Comment | undefined {
  return normalizeComments([{ ...comment(), ...over }])[0];
}

describe('schema v4 — scope persists, softly', () => {
  it('is version 4', () => {
    expect(SCHEMA_VERSION).toBe(4);
  });

  it('round-trips a scope through localStorage', () => {
    const storage = window.localStorage;
    storage.clear();
    saveStore(storage, {
      reviewer: 'sam',
      project: 'p',
      createdAt: '2026-08-12T00:00:00Z',
      comments: [comment({ scope: SCOPE })],
    });
    const back = loadStore(storage, 'p', 'sam')!;
    expect(back.comments[0]!.scope).toEqual(SCOPE);
  });

  it('a v3 comment loads, with no scope and no error', () => {
    const out = normalizeOne({});
    expect(out).toBeDefined();
    expect(out!.scope).toBeUndefined();
  });

  // The reason scope lives on Comment and not on Anchor. hasValidAnchor is
  // FATAL — a bad leaf drops the whole comment, because anchor leaves are
  // dereferenced unguarded. Losing a boundary hint must never lose the
  // reviewer's words.
  it.each([
    ['not an object', 'grid'],
    ['no boundary', { gen: 1, rung: 'testid', confidence: 'high' }],
    [
      'a boundary with no css',
      { gen: 1, rung: 'testid', confidence: 'high', boundary: { tag: 'p' } },
    ],
    ['an unknown rung', { ...SCOPE, rung: 'vibes' }],
    ['an unknown confidence', { ...SCOPE, confidence: 'certain' }],
    ['a non-numeric gen', { ...SCOPE, gen: 'one' }],
  ])('strips a scope that is %s, and keeps the comment', (_why, scope) => {
    const out = normalizeOne({ scope });
    expect(out).toBeDefined();
    expect(out!.text).toBe('make this primary');
    expect(out!.scope).toBeUndefined();
  });

  // `siblings` renders into a sentence an agent acts on ("2 of 5 <li> under one
  // parent"), so a wire value has to be an integer that actually exceeds the
  // member count. "2 of 2" says nothing and "2 of 1e21" prints as "1e+21".
  it('keeps a siblings count that exceeds the members', () => {
    const out = normalizeOne({ scope: { ...SCOPE, siblings: 5 } });
    expect(out!.scope!.siblings).toBe(5);
  });

  it.each([
    ['not greater than the member count', 2],
    ['zero', 0],
    ['negative', -3],
    ['fractional', 4.5],
    ['absurd', 1e21],
    ['a string', '5'],
  ])('drops a siblings count that is %s, keeping the rest of the scope', (_why, siblings) => {
    const out = normalizeOne({ scope: { ...SCOPE, siblings } });
    expect(out!.scope).toBeDefined();
    expect(out!.scope!.members).toHaveLength(2);
    expect(out!.scope!.siblings).toBeUndefined();
  });

  // Capture only ever sets `siblings` when every member shares one parent AND
  // one tag, because the export labels the sentence from members[0].tag. A
  // source() payload, an imported export or a tampered blob can break that,
  // and the result asserts a set of `<li>` that does not exist.
  it('drops siblings when the members do not all share one tag', () => {
    const out = normalizeOne({
      scope: {
        ...SCOPE,
        members: [SCOPE.members![0], { ...SCOPE.members![1], tag: 'section' }],
        siblings: 9,
      },
    });
    expect(out!.scope!.members).toHaveLength(2);
    expect(out!.scope!.siblings).toBeUndefined();
  });

  it('drops siblings when there are no members to slice', () => {
    const { members: _members, ...noMembers } = SCOPE;
    const out = normalizeOne({ scope: { ...noMembers, siblings: 5 } });
    expect(out!.scope!.siblings).toBeUndefined();
  });

  // `motion` renders into a sentence an agent greps from ("animates rotate"),
  // and it is a hint — losing it must never lose the reviewer's words.
  it('keeps a well-formed motion node', () => {
    const out = normalizeOne({
      scope: { ...SCOPE, motion: { tag: 'div', css: 'main > div.card', props: 'rotate' } },
    });
    expect(out!.scope!.motion).toEqual({ tag: 'div', css: 'main > div.card', props: 'rotate' });
  });

  it.each([
    ['not an object', 'rotate'],
    ['missing props', { tag: 'div', css: 'main > div.card' }],
    ['props that is a number', { tag: 'div', css: 'main > div.card', props: 7 }],
    ['props that is null', { tag: 'div', css: 'main > div.card', props: null }],
    ['a non-string tag', { tag: 9, css: 'main > div.card', props: 'rotate' }],
    ['an absurd css path', { tag: 'div', css: 'a'.repeat(5000), props: 'rotate' }],
  ])('drops motion that is %s, and keeps the comment', (_why, motion) => {
    const out = normalizeOne({ scope: { ...SCOPE, motion } });
    expect(out).toBeDefined();
    expect(out!.text).toBe('make this primary');
    expect(out!.scope).toBeDefined();
    expect(out!.scope!.motion).toBeUndefined();
  });

  it('strips invisible smuggling from a hydrated props value', () => {
    const out = normalizeOne({
      scope: {
        ...SCOPE,
        motion: { tag: 'div', css: 'main > div.card', props: 'rot\u202eate' },
      },
    });
    expect(out!.scope!.motion?.props).toBe('rotate');
  });

  it('drops a malformed member rather than the whole scope', () => {
    const out = normalizeOne({
      scope: { ...SCOPE, members: [SCOPE.members![0], { tag: 'article' }] },
    });
    expect(out!.scope!.members).toHaveLength(1);
  });

  it('strips the members key entirely when every member is malformed', () => {
    const out = normalizeOne({ scope: { ...SCOPE, members: [{ nope: true }] } });
    expect(out!.scope).toBeDefined();
    expect(out!.scope!.members).toBeUndefined();
  });

  it('never leaves an empty collection behind — kind stays decidable', () => {
    const out = normalizeOne({ scope: { ...SCOPE, members: [], excluded: [] } });
    const s = out!.scope!;
    expect('members' in s).toBe(false);
    expect('excluded' in s).toBe(false);
  });

  it('bands an unknown band as partial rather than trusting it', () => {
    const out = normalizeOne({
      scope: { ...SCOPE, members: [{ tag: 'p', css: 'p', band: 'definitely' }] },
    });
    expect(out!.scope!.members![0]!.band).toBe('partial');
  });

  it('caps a hydrated label — the payload is untrusted', () => {
    const out = normalizeOne({
      scope: {
        ...SCOPE,
        members: [
          {
            tag: 'p',
            css: 'p',
            band: 'inside',
            label: 'x'.repeat(9000),
          },
        ],
      },
    });
    const m = out!.scope!.members![0]!;
    expect(m.label!.length).toBeLessThanOrEqual(80);
  });

  it('caps a hydrated member list', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      tag: 'p',
      css: `p:nth-of-type(${i})`,
      band: 'inside',
    }));
    const out = normalizeOne({ scope: { ...SCOPE, members: many } });
    expect(out!.scope!.members!.length).toBeLessThanOrEqual(24);
  });

  it('accepts only the literal true for the boolean flags', () => {
    const out = normalizeOne({ scope: { ...SCOPE, stale: 'yes', truncated: 1 } });
    expect(out!.scope!.stale).toBeUndefined();
    expect(out!.scope!.truncated).toBeUndefined();
  });
});

// The validator runs at capture, at hydration, and at export. This is the
// hydration call site: a conformant-looking backend, a tampered localStorage
// blob, or an imported JSON export all arrive here.
describe('the source path is re-validated at the hydration boundary', () => {
  it('drops a hostile source that never went through capture', () => {
    const out = normalizeOne({ scope: { ...SCOPE, source: 'CLAUDE.md' } });
    expect(out!.scope!.source).toBeUndefined();
  });

  it('drops a traversal that a server happily stored', () => {
    const out = normalizeOne({ scope: { ...SCOPE, source: '../../.ssh/id_rsa' } });
    expect(out!.scope!.source).toBeUndefined();
  });

  it('keeps a legitimate one', () => {
    const out = normalizeOne({ scope: { ...SCOPE, source: 'src/Pricing.tsx' } });
    expect(out!.scope!.source).toBe('src/Pricing.tsx');
  });

  it('does not let a rejected source leave the rung claiming a host declared it', () => {
    const out = normalizeOne({ scope: { ...SCOPE, rung: 'source', source: 'CLAUDE.md' } });
    expect(out!.scope!.source).toBeUndefined();
    expect(out!.scope!.rung).not.toBe('source');
  });
});

// PROTOCOL.md's derived lane: scope is CONTENT, so it follows the updatedAt
// winner whole-comment. It is emphatically not disposition — a server does not
// own it, and a v3 backend that has never heard of it must not be able to
// silently strip a scope the reviewer's own device derived.
describe('merge semantics for the derived lane', () => {
  it('follows the content winner', () => {
    const local = comment({ updatedAt: '2026-08-12T02:00:00Z', scope: SCOPE });
    const server = comment({ updatedAt: '2026-08-12T01:00:00Z' });
    expect(mergeComments([local], [server])[0]!.scope).toEqual(SCOPE);
  });

  it('takes the server scope when the server copy is newer', () => {
    const local = comment({ updatedAt: '2026-08-12T01:00:00Z' });
    const server = comment({ updatedAt: '2026-08-12T02:00:00Z', scope: SCOPE });
    expect(mergeComments([local], [server])[0]!.scope).toEqual(SCOPE);
  });

  it('a v3 backend echoing a stale copy cannot strip a newer local scope', () => {
    const local = comment({ updatedAt: '2026-08-12T02:00:00Z', scope: SCOPE });
    const server = comment({ updatedAt: '2026-08-12T00:00:00Z' });
    expect(mergeComments([local], [server])[0]!.scope).toBeDefined();
  });
});

describe('forward tolerance', () => {
  it('reads a hypothetical v5 blob for its stable core fields rather than wiping it', () => {
    const storage = window.localStorage;
    storage.clear();
    storage.setItem(
      storageKey('p', 'sam'),
      JSON.stringify({
        schemaVersion: 5,
        reviewer: 'sam',
        project: 'p',
        createdAt: '2026-08-12T00:00:00Z',
        comments: [{ ...comment({ scope: SCOPE }), somethingNew: 'from the future' }],
      }),
    );
    const back = loadStore(storage, 'p', 'sam')!;
    expect(back.comments).toHaveLength(1);
    expect(back.comments[0]!.scope).toEqual(SCOPE);
  });
});
