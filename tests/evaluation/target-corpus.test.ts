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

it('abstains when an early exact hit cannot be proven unique within the visit budget', () => {
  vi.spyOn(performance, 'now').mockReturnValue(0);
  document.body.innerHTML = '<p>Unique target phrase</p>' + '<div>noise</div>'.repeat(3000);
  expect(
    findByCandidates(
      document,
      { testid: null, id: null, css: '', xpath: '' },
      'Unique target phrase',
    ),
  ).toBeNull();
});
