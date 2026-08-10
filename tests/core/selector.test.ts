import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildSelectors,
  findByCandidates,
  getCssPath,
  getStableId,
  getTestId,
  getTextFingerprint,
} from '../../src/core/selector';

function html(s: string): Document {
  return new DOMParser().parseFromString(s, 'text/html');
}

describe('selector', () => {
  it('prefers data-testid', () => {
    const doc = html('<button data-testid="cta">Go</button>');
    const el = doc.querySelector('button')!;
    expect(getTestId(el)).toBe('cta');
  });

  it('rejects auto-generated ids', () => {
    const doc = html('<div id=":r1:"></div><div id="legit-id"></div>');
    const els = doc.querySelectorAll('div');
    expect(getStableId(els[0]!)).toBeNull();
    expect(getStableId(els[1]!)).toBe('legit-id');
  });

  it('anchors on legit semantic ids; the hashed heuristic requires a digit (P4.6)', () => {
    const doc = html(
      '<div id="header"></div><div id="sidebar"></div><div id="a1b2c3"></div><div id="x9f3k2m"></div>',
    );
    const els = doc.querySelectorAll('div');
    expect(getStableId(els[0]!)).toBe('header'); // pure letters — semantic
    expect(getStableId(els[1]!)).toBe('sidebar');
    expect(getStableId(els[2]!)).toBeNull(); // digits + length — likely hashed
    expect(getStableId(els[3]!)).toBeNull();
  });

  it('keeps legit long class names in css paths; skips digit-bearing hashes (P4.6)', () => {
    const doc = html('<main><button class="button x1y2z3q">Go</button></main>');
    const css = getCssPath(doc.querySelector('button')!);
    expect(css).toContain('.button'); // pure letters — semantic
    expect(css).not.toContain('x1y2z3q'); // digit-bearing hash — skipped
  });

  it('builds a css path with nth-of-type', () => {
    const doc = html(
      '<main><section><button class="cta-primary">A</button></section><section><button>B</button></section></main>',
    );
    const btn = doc.querySelectorAll('button')[1]!;
    const css = getCssPath(btn);
    expect(css).toContain('main');
    expect(css).toContain('section:nth-of-type(2)');
    expect(css).toContain('button');
  });

  it('fingerprints visible text truncated at 80 chars', () => {
    const doc = html(`<p>${'x'.repeat(100)}</p>`);
    const p = doc.querySelector('p')!;
    expect(getTextFingerprint(p)).toHaveLength(80);
  });

  it('xpath starts at body children — never the /html/body/body[1] double (live artifact bug)', () => {
    document.body.innerHTML = '<div><div><p>target</p></div></div>';
    const p = document.querySelector('p')!;
    const sels = buildSelectors(p);
    expect(sels.xpath).toBe('/html/body/div[1]/div[1]/p[1]');
    expect(sels.xpath).not.toContain('body/body');
  });

  it('buildSelectors returns all four + matches back via findByCandidates', () => {
    document.body.innerHTML =
      '<main><button data-testid="cta" class="primary">Get started</button></main>';
    const btn = document.querySelector('button')!;
    const sels = buildSelectors(btn);
    expect(sels.testid).toBe('cta');
    const found = findByCandidates(document, sels, getTextFingerprint(btn));
    expect(found).toBe(btn);
  });

  it('falls back to fingerprint when selectors break', () => {
    document.body.innerHTML = '<div><span>unique-marker</span></div>';
    const sels = {
      testid: null,
      id: null,
      css: 'nope > nope',
      xpath: '/doesnotexist',
    };
    const found = findByCandidates(document, sels, 'unique-marker');
    expect(found?.textContent).toBe('unique-marker');
  });
});

describe('fuzzy re-anchor fallback (first-user feedback: edits orphan pins on every pass)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function selectorsForBody(
    html: string,
    pick: string,
  ): ReturnType<typeof buildSelectors> & {
    fp: string;
  } {
    document.body.innerHTML = html;
    const elx = document.querySelector(pick)!;
    return { ...buildSelectors(elx), fp: getTextFingerprint(elx) };
  }

  it('a lightly reworded element keeps its anchor when every exact candidate misses', () => {
    const sels = selectorsForBody(
      '<main><p class="intro">This survey is anonymous and only asks for broad groups.</p></main>',
      'p',
    );
    const fp = getTextFingerprint(document.querySelector('p')!);
    // The edit pass: structure and classes change (css/xpath break), one word
    // is reworded (exact fingerprint breaks) — the pin must survive.
    document.body.innerHTML =
      '<section><p class="lead">This survey is anonymous and only asks about broad groups.</p></section>';
    const found = findByCandidates(document, sels, fp);
    expect(found).toBe(document.querySelector('p'));
  });

  it('entirely different content stays an honest orphan — no wrong-element attach', () => {
    const sels = selectorsForBody(
      '<main><p>Pricing table for the enterprise tier.</p></main>',
      'p',
    );
    const fp = getTextFingerprint(document.querySelector('p')!);
    document.body.innerHTML = '<section><p>Contact our sales department today.</p></section>';
    expect(findByCandidates(document, sels, fp)).toBeNull();
  });

  it('two-similar-paragraphs trap: picks the closer text, not the first candidate', () => {
    const sels = selectorsForBody(
      '<main><p id="x1">Reviewers can pin comments on any element of the page.</p></main>',
      'p',
    );
    const fp = getTextFingerprint(document.querySelector('p')!);
    document.body.innerHTML = [
      '<section>',
      '<p>Reviewers can pin notes on some elements of the app.</p>',
      '<p>Reviewers can pin comments on any element of that page.</p>',
      '</section>',
    ].join('');
    const found = findByCandidates(document, sels, fp);
    expect(found?.textContent).toContain('any element of that page');
  });

  it('same score, different tag: the stored tag (from the css path) wins', () => {
    const sels = selectorsForBody(
      '<main><p class="note">Voice notes land as text transcripts.</p></main>',
      'p',
    );
    const fp = getTextFingerprint(document.querySelector('p')!);
    document.body.innerHTML = [
      '<section>',
      '<div>Voice notes land as text transcript.</div>',
      '<p>Voice notes land as text transcript.</p>',
      '</section>',
    ].join('');
    const found = findByCandidates(document, sels, fp);
    expect(found?.tagName).toBe('P');
  });
});

describe('fuzzy re-anchor hardening (0.3.0 review #2/#3)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('threshold applies to RAW similarity — the same-tag bias cannot smuggle a sub-0.6 match in', () => {
    // 'Save now settings panel' vs 'Save all sections today': raw Dice < 0.6.
    document.body.innerHTML = '<main><p class="a">Save now settings panel</p></main>';
    const p = document.querySelector('p')!;
    const sels = buildSelectors(p);
    const fp = getTextFingerprint(p);
    document.body.innerHTML = '<section><p class="b">Save all sections today</p></section>';
    expect(findByCandidates(document, sels, fp)).toBeNull();
  });

  it('very short fingerprints never fuzzy-match — tiny bigram sets are noise', () => {
    document.body.innerHTML = '<main><button id="ok-btn-x">No</button></main>';
    const b = document.querySelector('button')!;
    const sels = { ...buildSelectors(b), id: null, css: '#gone', xpath: '/nope' };
    const fp = getTextFingerprint(b); // 'No'
    document.body.innerHTML = '<section><button>Not</button></section>';
    expect(findByCandidates(document, sels, fp)).toBeNull();
  });

  it('wrapper-vs-leaf: an ancestor with an identical fingerprint loses to the descendant', () => {
    // Stable-ID css ('#review…') carries no tag; wrapper and button share the
    // fingerprint (textContent flows up). The pin was on the BUTTON.
    document.body.innerHTML =
      '<main><div id="review9x"><button>Approve the latest draft version</button></div></main>';
    const btn = document.querySelector('button')!;
    const sels = {
      ...buildSelectors(btn),
      css: '#review9x',
      xpath: '/nope',
      id: null,
      testid: null,
    };
    const fp = getTextFingerprint(btn);
    document.body.innerHTML =
      '<section><div class="wrap"><button>Approve the newest draft version</button></div></section>';
    const found = findByCandidates(document, sels, fp);
    expect(found?.tagName).toBe('BUTTON');
  });
});

describe('fingerprint walk container discipline (found via 0.3.0 review #2/#6 debugging)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('an identical-fingerprint ancestor chain resolves to the LEAF, never html/body', () => {
    document.body.innerHTML =
      '<div><section><p>The one and only paragraph of meaningful text.</p></section></div>';
    const sels = { testid: null, id: null, css: '#nope', xpath: '/nope' };
    // html, body, div, section, and p all share this fingerprint.
    const found = findByCandidates(
      document,
      sels,
      'The one and only paragraph of meaningful text.',
    );
    expect(found?.tagName).toBe('P');
  });

  it('exact match always beats a better-scoring fuzzy candidate', () => {
    document.body.innerHTML = [
      '<main>',
      '<p>Approve the latest draft version today</p>',
      '<p>Approve the latest draft versions today</p>',
      '</main>',
    ].join('');
    const sels = { testid: null, id: null, css: '#nope', xpath: '/nope' };
    const found = findByCandidates(document, sels, 'Approve the latest draft versions today');
    expect(found?.textContent).toBe('Approve the latest draft versions today');
  });
});

describe('fuzzy minimum-fingerprint boundary (verification round)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function probe(fp: string, candidate: string): Element | null {
    document.body.innerHTML = `<main><p>${candidate}</p></main>`;
    return findByCandidates(document, { testid: null, id: null, css: '#nope', xpath: '/nope' }, fp);
  }

  it('length 11 never fuzzy-matches; length 12 may', () => {
    // 11 chars, one char edited in the candidate → exactness fails, fuzzy off.
    expect(probe('elevenchars', 'elevenchara')).toBeNull();
    // 12 chars, one char edited → fuzzy eligible and similar enough.
    expect(probe('twelve chars', 'twelve charz')).not.toBeNull();
  });
});

// 0.4.1 P2. The heal ladder shipped three defects on one path: it trusted
// position over contradicting content, it burned its walk budget on <head>,
// and it normalised entire subtrees to keep 80 characters. These must land
// together — verify-before-trust makes the fingerprint walk run on every
// successful positional resolve, so without the other two it is a regression.
describe('heal correctness under stress (0.4.1 P2)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  // P2c. A positional rung proves only that SOMETHING still sits at that path.
  // Virtualised lists and infinite scroll recycle nodes, so a stale
  // li:nth-of-type(1) resolves confidently onto different content. selector.ts
  // calls a wrong re-anchor "worse than an honest orphan" — and the rung
  // ordering guaranteed one.
  it('a recycled positional hit loses to the element that carries the fingerprint', () => {
    document.body.innerHTML =
      '<ul><li>Wireless keyboard, black</li><li>Order number 1042 shipped</li></ul>';
    const found = findByCandidates(
      document,
      { testid: null, id: null, css: 'li:nth-of-type(1)', xpath: '/html/body/ul[1]/li[1]' },
      'Order number 1042 shipped',
    );
    expect(found?.textContent).toBe('Order number 1042 shipped');
  });

  // Conservatism cuts both ways: when nothing corroborates, the positional hit
  // is still better than nothing, so it must survive as the fallback.
  it('keeps the positional hit when no element corroborates the fingerprint', () => {
    document.body.innerHTML = '<ul><li>Wireless keyboard, black</li></ul>';
    const found = findByCandidates(
      document,
      { testid: null, id: null, css: 'li:nth-of-type(1)', xpath: '/html/body/ul[1]/li[1]' },
      'Order number 1042 shipped',
    );
    expect(found?.textContent).toBe('Wireless keyboard, black');
  });

  // P2b. The walk started at the document root, so <head> was scored. A page
  // titled "Checkout" would heal a pin on a "Checkout" heading to <title> —
  // an exact match, found first, and never displaced because the deepest-wins
  // rule only replaces a match with its own descendant.
  it('never heals to an element inside <head>', () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><title>Checkout</title></head><body><main><h1>Checkout</h1></main></body></html>',
      'text/html',
    );
    const found = findByCandidates(
      doc,
      { testid: null, id: null, css: '#nope', xpath: '/nope' },
      'Checkout',
    );
    expect(found?.tagName).toBe('H1');
  });

  // P2a. getTextFingerprint normalised the whole subtree before slicing to 80.
  // A naive `slice(400)` before the regex is 81x faster but WRONG on
  // pretty-printed markup, which is mostly whitespace: it would silently
  // shorten fingerprints and orphan every existing pin on upgrade.
  it('bounds the work without shortening the fingerprint on whitespace-heavy markup', () => {
    const items = Array.from(
      { length: 400 },
      (_, i) => `\n${' '.repeat(40)}<span>${String.fromCharCode(97 + (i % 26))}</span>`,
    ).join('');
    document.body.innerHTML = `<div id="ws">${items}\n</div>`;
    const el = document.getElementById('ws')!;
    const naive = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    expect(getTextFingerprint(el)).toBe(naive);
    expect(getTextFingerprint(el)).toHaveLength(80);
  });

  // Round 1 P1. Demotion must never let a WORSE match win. A positional hit
  // that css and xpath both agree on outranks a merely-fuzzy stranger — and
  // getting this backwards is not transient: _persistHeal writes the resolved
  // element back into anchor.selectors, so the next load corroborates the
  // stranger trivially and the original anchor is unrecoverable. The trigger is
  // a reviewer asking for copy to be rewritten, the most common request there is.
  it('a fuzzy stranger never outranks a positional hit whose text was legitimately rewritten', () => {
    document.body.innerHTML =
      '<main>' +
      '<p id="real">Get started in seconds</p>' +
      '<p id="stranger">Start your free 30-day trial today, no card</p>' +
      '</main>';
    const found = findByCandidates(
      document,
      { testid: null, id: null, css: '#real', xpath: '/html/body/main[1]/p[1]' },
      'Start your free 30-day trial today, no credit card required',
    );
    expect(found?.id).toBe('real');
  });

  // Round 1 P2. Moving the counter below the skip meant skipped nodes cost
  // nothing — and once an exact match exists, EVERY remaining node is skipped.
  // Measured at 16,002 of 16,005 elements walked with both bounds nominally in
  // force, against main's 2,001. Pre-order traversal makes the match's subtree
  // contiguous, so the first non-descendant ends the walk.
  it('stops walking once the exact match subtree is behind it', () => {
    // Same reason: the deadline firing early would make this pass without the
    // break, i.e. for the wrong reason.
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const noise = Array.from({ length: 800 }, (_, i) => `<p>filler ${i}</p>`).join('');
    document.body.innerHTML = `<main><p>the pinned paragraph text</p>${noise}</main>`;
    const spy = vi.spyOn(Element.prototype, 'contains');
    findByCandidates(
      document,
      { testid: null, id: null, css: '#nope', xpath: '/nope' },
      'the pinned paragraph text',
    );
    // One containment probe to discover the subtree ended, not one per node.
    expect(spy.mock.calls.length).toBeLessThan(20);
  });

  // Round 1 P2. tagName preserves case outside the HTML namespace, so an SVG
  // <title> reports 'title' and slipped the skip list — the same zero-layout
  // wrong-attach the <head> fix exists to prevent. Uppercasing the tag before
  // the test closes it (and makes the whole list work in XHTML, where every
  // entry was previously inert).
  //
  // KNOWN RESIDUAL, deliberately not fixed here: the enclosing <svg> still
  // matches, because textContent aggregates its <title> child. That is a much
  // milder case — the <svg> has a layout box, so the pin is placeable and the
  // reviewer may genuinely have pinned the icon. Suppressing it would mean
  // custom text extraction per candidate, which is a real cost for a narrow
  // case. Asserting the safety property rather than a specific winner.
  it('never heals to a zero-box SVG metadata node', () => {
    document.body.innerHTML =
      '<main><svg viewBox="0 0 1 1"><title>Checkout</title><circle r="1"/></svg><h1>Checkout</h1></main>';
    const found = findByCandidates(
      document,
      { testid: null, id: null, css: '#nope', xpath: '/nope' },
      'Checkout',
    );
    expect(found?.tagName.toUpperCase()).not.toBe('TITLE');
    expect(found?.tagName.toUpperCase()).not.toBe('DESC');
    // Pin the documented residual too, so a future change cannot move it
    // silently and quietly turn the comment above into fiction.
    expect(found?.tagName.toUpperCase()).toBe('SVG');
  });

  // Round 2 P2. Charging budget before the tag skip stopped a <select> of
  // <option>s outrunning the bound, but reintroduced main's starvation: 1,500
  // <source> elements in a gallery evict real content from the 2,000-node cap
  // and the heal lands on the page container — a wrong attach. Two counters:
  // a scored-node budget for semantics, a visit budget as the safety valve.
  it('elements that can never be pin targets do not starve the scored-node budget', () => {
    // Freeze the clock: this asserts the COUNT budget, and leaving the 2 ms
    // wall-clock deadline live would make a 2,100-node walk race a loaded CI
    // machine and fail for an unrelated reason.
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const sources = '<source srcset="x.webp">'.repeat(2100);
    document.body.innerHTML = `<main><picture>${sources}</picture><p id="target">the pinned paragraph text</p></main>`;
    const found = findByCandidates(
      document,
      { testid: null, id: null, css: '#nope', xpath: '/nope' },
      'the pinned paragraph text',
    );
    expect(found?.id).toBe('target');
  });

  // Round 2 P2. The zero-box guard shipped with no coverage: happy-dom returns
  // one rect for everything, including display:none and detached nodes, so the
  // branch never executes naturally. Stubbing the layout read is the only way
  // to reach it — and an untested branch in the one function whose failure mode
  // is silent is the wrong thing to ship.
  it('an exact match with no layout box never displaces a positional hit', () => {
    document.body.innerHTML =
      '<main>' +
      '<p id="real">Get started in seconds</p>' +
      '<p id="stale" hidden>Start your free 30-day trial today, no credit card required</p>' +
      '</main>';
    const stale = document.getElementById('stale')!;
    const sels = { testid: null, id: null, css: '#real', xpath: '/html/body/main[1]/p[1]' };
    const fp = 'Start your free 30-day trial today, no credit card required';

    // Without the stub the duplicate looks laid-out and wins — the documented
    // undecidable case.
    expect(findByCandidates(document, sels, fp)?.id).toBe('stale');

    vi.spyOn(stale, 'getClientRects').mockReturnValue([] as unknown as DOMRectList);
    expect(findByCandidates(document, sels, fp)?.id).toBe('real');
  });

  // Round 1 test gap. The whitespace fixture above normalises to 95 chars, so
  // it takes the fast path — the fallback branch whose absence would orphan
  // stored pins on upgrade was never executed by any test.
  it('takes the full-string fallback when the bounded prefix yields under 80 chars', () => {
    const el = document.createElement('div');
    el.textContent = `${' '.repeat(3000)}the actual content arrives well past the bounded prefix boundary`;
    document.body.appendChild(el);
    expect(getTextFingerprint(el)).toBe(
      (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
    );
    expect(getTextFingerprint(el).startsWith('the actual content')).toBe(true);
  });

  // P2d. 2,000 nodes is ~1.5 ms on a laptop and ~9.5 ms on a phone, so a pure
  // count cap is device-dependent. The walk must also yield on elapsed time.
  it('abandons the walk when the time budget is exhausted', () => {
    const rows = Array.from({ length: 300 }, (_, i) => `<p>row ${i}</p>`).join('');
    document.body.innerHTML = `<main>${rows}<p>the pinned paragraph text</p></main>`;
    const sels = { testid: null, id: null, css: '#nope', xpath: '/nope' };

    // BOTH halves need a pinned clock, not just the exhausted one. The control
    // walks 300 rows against the real 2 ms deadline, so on a slower machine the
    // budget fires legitimately and the baseline returns null — which is how
    // this test failed in CI while passing ~80 consecutive local runs. A test
    // about a deadline must not be racing one.
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    expect(findByCandidates(document, sels, 'the pinned paragraph text')).not.toBeNull();

    // First call establishes the deadline; every later call is past it.
    let n = 0;
    clock.mockImplementation(() => (n++ === 0 ? 0 : 1e6));
    expect(findByCandidates(document, sels, 'the pinned paragraph text')).toBeNull();
  });
});

describe('healing hardening (0.4.1 independent review #2/#3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  // Review #2 P1. An EMPTY candidate fingerprint corroborated a meaningful
  // stored one, so a recycled/still-loading row won through its stale
  // :nth-of-type position while the real text sat mounted one element over.
  // The pinned element provably had ≥12 chars of text at pin time — a blank
  // node at that path is never confirmation.
  it('an empty positional hit cannot corroborate a meaningful stored fingerprint', () => {
    document.body.innerHTML =
      '<main><div class="row" id="recycled"></div>' +
      '<p id="mounted">Start your free 30-day trial today, no credit card required</p></main>';
    const found = findByCandidates(
      document,
      { testid: null, id: null, css: '#recycled', xpath: '/html/body/main[1]/div[1]' },
      'Start your free 30-day trial today, no credit card required',
    );
    expect(found?.id).toBe('mounted');
  });

  // The empty hit is demoted, not discarded: with no better candidate anywhere
  // it must still win as the fallback (same conservatism as the non-empty
  // uncorroborated case above).
  it('an empty positional hit still survives as the last-resort fallback', () => {
    document.body.innerHTML = '<main><div class="row" id="recycled"></div></main>';
    const found = findByCandidates(
      document,
      { testid: null, id: null, css: '#recycled', xpath: '/html/body/main[1]/div[1]' },
      'Start your free 30-day trial today, no credit card required',
    );
    expect(found?.id).toBe('recycled');
  });

  // Review #3 P1 (pre-existing). With NO positional hit, the zero-box guard
  // never ran: a hidden responsive duplicate met first in the walk was
  // accepted as the exact match, displayed at a zero rect, and eligible to be
  // PERSISTED as a heal. Layout eligibility must gate acceptance itself, and
  // the walk must continue past hidden matches to a later visible one.
  it('a hidden exact match loses to a later visible exact match when no positional hit exists', () => {
    document.body.innerHTML =
      '<main>' +
      '<p id="stale" hidden>Start your free 30-day trial today, no credit card required</p>' +
      '<p id="real">Start your free 30-day trial today, no credit card required</p>' +
      '</main>';
    vi.spyOn(document.getElementById('stale')!, 'getClientRects').mockReturnValue(
      [] as unknown as DOMRectList,
    );
    const found = findByCandidates(
      document,
      { testid: null, id: null, css: '#nope', xpath: '/nope' },
      'Start your free 30-day trial today, no credit card required',
    );
    expect(found?.id).toBe('real');
  });

  // Hidden-only: an honest orphan beats anchoring to an element the reviewer
  // cannot see (and beats persisting its selectors as a heal).
  it('returns null when the only exact match has no layout box', () => {
    document.body.innerHTML =
      '<main><p id="stale" hidden>Start your free 30-day trial today, no credit card required</p></main>';
    vi.spyOn(document.getElementById('stale')!, 'getClientRects').mockReturnValue(
      [] as unknown as DOMRectList,
    );
    const found = findByCandidates(
      document,
      { testid: null, id: null, css: '#nope', xpath: '/nope' },
      'Start your free 30-day trial today, no credit card required',
    );
    expect(found).toBeNull();
  });
});
