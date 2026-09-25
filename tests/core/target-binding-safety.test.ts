import { afterEach, describe, expect, it } from 'vitest';
import { buildAnchor, resolveAnchor } from '../../src/core/anchor';
import { normalizeComments } from '../../src/core/storage';
import type { Anchor, Comment } from '../../src/core/types';

afterEach(() => {
  document.body.innerHTML = '';
});

function comment(anchor: Anchor): Comment {
  return {
    id: 'binding',
    text: 'Keep attached to this row',
    route: '/',
    fullUrl: 'https://example.test/',
    createdAt: 'now',
    updatedAt: 'now',
    modality: 'text',
    anchor,
  };
}

describe('ambiguous repeated owners', () => {
  it('abstains when identical row labels and duplicate testids cannot identify the selected entity', () => {
    document.body.innerHTML =
      '<ul>' +
      '<li data-testid="patient">Alex Reed<input data-testid="select" type="checkbox"></li>'.repeat(
        3,
      ) +
      '</ul>';
    const rows = document.querySelectorAll('li');
    const anchor = buildAnchor(rows[1]!.querySelector('input')!, 0, 0);
    rows[1]!.remove();
    // The old nth-child path now reaches another person with the same visible name.
    expect(resolveAnchor(anchor)).toBeNull();
  });

  it('resolves identical row labels through a stable unique row id after reorder', () => {
    document.body.innerHTML =
      '<ul>' +
      '<li id="patient-one" data-testid="patient">Alex Reed<input data-testid="select" type="checkbox"></li>' +
      '<li id="patient-two" data-testid="patient">Alex Reed<input data-testid="select" type="checkbox"></li>' +
      '<li id="patient-three" data-testid="patient">Alex Reed<input data-testid="select" type="checkbox"></li></ul>';
    const row = document.querySelector('#patient-two')!;
    const target = row.querySelector('input')!;
    const anchor = buildAnchor(target, 0, 0);
    document.querySelector('ul')!.prepend(row);
    expect(resolveAnchor(anchor)).toBe(target);
    row.remove();
    expect(resolveAnchor(anchor)).toBeNull();
  });
});

describe('persisted owner and shadow constraints fail closed without dropping words', () => {
  // Corrupt binding evidence must neither widen the target (drop the
  // constraint) nor cost the reviewer their note (drop the record): the
  // comment survives with an unresolvable binding, parked until re-placed.
  it.each([null, 'owner', {}, { selectors: {}, textFingerprint: 'Alex' }])(
    'keeps a comment with malformed owner evidence %j but parks its target',
    (owner) => {
      document.body.innerHTML = '<button id="save">Save</button>';
      const anchor = buildAnchor(document.querySelector('button')!, 0, 0);
      const [kept] = normalizeComments([{ ...comment(anchor), anchor: { ...anchor, owner } }]);
      expect(kept?.text).toBe('Keep attached to this row');
      expect(kept?.anchor.owner).toBeUndefined();
      expect(kept?.anchor.shadowPath).toEqual([]);
      expect(resolveAnchor(kept!.anchor)).toBeNull();
    },
  );

  it.each([null, 'host', [{}], [{ selectors: {}, textFingerprint: 'Host' }]])(
    'keeps a comment with malformed shadow host evidence %j but parks its target',
    (shadowPath) => {
      document.body.innerHTML = '<button id="save">Save</button>';
      const anchor = buildAnchor(document.querySelector('button')!, 0, 0);
      const [kept] = normalizeComments([{ ...comment(anchor), anchor: { ...anchor, shadowPath } }]);
      expect(kept?.text).toBe('Keep attached to this row');
      expect(kept?.anchor.shadowPath).toEqual([]);
      expect(resolveAnchor(kept!.anchor)).toBeNull();
    },
  );

  it('parks a shadow path beyond the supported depth rather than truncating away a constraint', () => {
    document.body.innerHTML = '<button id="save">Save</button>';
    const anchor = buildAnchor(document.querySelector('button')!, 0, 0);
    const host = { selectors: anchor.selectors, textFingerprint: 'Host' };
    const [kept] = normalizeComments([
      { ...comment(anchor), anchor: { ...anchor, shadowPath: Array(9).fill(host) } },
    ]);
    expect(kept?.anchor.shadowPath).toEqual([]);
    expect(resolveAnchor(kept!.anchor)).toBeNull();
  });
});

it('does not follow a shadow control when its enclosing repeated row is recycled', () => {
  document.body.innerHTML =
    '<ul><li><span>Blair Stone</span><patient-toggle id="toggle-widget"></patient-toggle></li></ul>';
  const host = document.querySelector('patient-toggle')!;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<input type="checkbox" aria-label="Select patient">';
  const input = root.querySelector('input')!;
  const anchor = buildAnchor(input, 0, 0);
  expect(resolveAnchor(anchor)).toBe(input);
  // A virtualized list can retain the exact host/control while changing its row entity.
  document.querySelector('li span')!.textContent = 'Dana West';
  expect(resolveAnchor(anchor)).toBeNull();
});
