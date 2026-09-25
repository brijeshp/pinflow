import { afterEach, describe, expect, it, vi } from 'vitest';
import { findByCandidates } from '../../src/core/selector';
import type { SelectorCandidates } from '../../src/core/types';

// Labeled synthetic cases, not a claim of model accuracy on customer feedback.
// Each case has an exact DOM ground truth; null explicitly rewards abstention.
const cases: {
  name: string;
  html: string;
  selectors: Partial<SelectorCandidates>;
  fingerprint: string;
  expected: string | null;
}[] = [
  {
    name: 'stable identifier',
    html: '<button data-testid="buy" id="correct">Buy</button>',
    selectors: { testid: 'buy' },
    fingerprint: 'Buy',
    expected: 'correct',
  },
  {
    name: 'duplicate identifier with distinct accessible name',
    html: '<button data-testid="remove" aria-label="Remove Alice">Remove</button><button id="correct" data-testid="remove" aria-label="Remove Bob">Remove</button>',
    selectors: { testid: 'remove', role: 'button', name: 'Remove Bob' },
    fingerprint: 'Remove',
    expected: 'correct',
  },
  {
    name: 'rebuilt class with accessible name',
    html: '<button id="correct" class="hash-new" aria-label="Continue">Next</button>',
    selectors: { css: '.hash-old', role: 'button', name: 'Continue' },
    fingerprint: 'Next',
    expected: 'correct',
  },
  {
    name: 'removed target',
    html: '<main>Different screen</main>',
    selectors: { testid: 'deleted', css: '.old' },
    fingerprint: 'Unrelated target that no longer exists',
    expected: null,
  },
  {
    name: 'ambiguous unnamed controls',
    html: '<button>Save</button><button>Save</button>',
    selectors: {},
    fingerprint: 'Save',
    expected: null,
  },
  {
    name: 'ambiguous accessible names',
    html: '<button aria-label="Save"></button><button aria-label="Save"></button>',
    selectors: { role: 'button', name: 'Save' },
    fingerprint: '',
    expected: null,
  },
];
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
describe('target selection evaluation corpus', () => {
  it.each(cases)('$name', ({ html, selectors, fingerprint, expected }) => {
    document.body.innerHTML = html;
    const hit = findByCandidates(
      document,
      { testid: null, id: null, css: '', xpath: '', ...selectors },
      fingerprint,
    );
    expect(hit).toBe(expected ? document.getElementById(expected) : null);
  });
});

// Most real pages exceed the scan budget (2,000 scored nodes, or 2 ms — a few
// hundred nodes on a phone). Abstaining whenever the scan is cut short would
// switch off the text rung, the one that survives a rebuild, on those pages.
it('keeps an early exact hit when a large page exhausts the scan budget', () => {
  vi.spyOn(performance, 'now').mockReturnValue(0);
  document.body.innerHTML = '<p>Unique target phrase</p>' + '<div>noise</div>'.repeat(3000);
  expect(
    findByCandidates(
      document,
      { testid: null, id: null, css: '', xpath: '' },
      'Unique target phrase',
    ),
  ).toBe(document.querySelector('p'));
});

it('prefers a truncated-scan exact hit over a structural hit that contradicts the text', () => {
  vi.spyOn(performance, 'now').mockReturnValue(0);
  document.body.innerHTML =
    '<p>Unique target phrase</p><div id="moved">Something else entirely</div>' +
    '<div>noise</div>'.repeat(3000);
  expect(
    findByCandidates(
      document,
      { testid: null, id: null, css: '#moved', xpath: '' },
      'Unique target phrase',
    ),
  ).toBe(document.querySelector('p'));
});

it('abstains from a fuzzy best guess when the scan is cut short', () => {
  vi.spyOn(performance, 'now').mockReturnValue(0);
  document.body.innerHTML = '<p>Unique target phrases</p>' + '<div>noise</div>'.repeat(3000);
  expect(
    findByCandidates(
      document,
      { testid: null, id: null, css: '', xpath: '' },
      'Unique target phrase',
    ),
  ).toBeNull();
});
