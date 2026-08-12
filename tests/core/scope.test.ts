import { beforeEach, describe, expect, it } from 'vitest';
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

  it('a landmark covering the whole viewport is demoted by area alone', () => {
    // Two elements in the document, so descendant share cannot be what fires.
    mount('<main id="m"><span id="s">x</span></main>');
    const m = document.querySelector('#m') as HTMLElement;
    const s = document.querySelector('#s') as Element;
    rect(m, 0, 0, 1000, 800);
    rect(s, 0, 0, 10, 10);
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    expect(resolveScope(s)!.scope.confidence).toBe('low');
  });
});

describe('scope — caps and skips', () => {
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
