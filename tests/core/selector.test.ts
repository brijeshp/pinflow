import { describe, expect, it } from 'vitest';
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

describe('fuzzy re-anchor hardening (codex 0.3.0 review #2/#3)', () => {
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

describe('fingerprint walk container discipline (found via codex 0.3.0 #2/#6 debugging)', () => {
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
