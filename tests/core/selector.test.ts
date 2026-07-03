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
