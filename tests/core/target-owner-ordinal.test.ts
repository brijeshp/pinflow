import { afterEach, describe, expect, it } from 'vitest';
import { buildAnchor, resolveAnchor } from '../../src/core/anchor';
import { normalizeComments } from '../../src/core/storage';
import type { Anchor, Comment, TargetEvidence } from '../../src/core/types';

afterEach(() => {
  document.body.innerHTML = '';
});

const comment = (anchor: Anchor): Comment => ({
  id: 'ordinal',
  text: 'Keep this pin where it was placed',
  route: '/',
  fullUrl: 'https://example.test/',
  createdAt: 'now',
  updatedAt: 'now',
  modality: 'text',
  anchor,
});

// The owner constraint must never park a pin at the moment it is placed: the
// element under the cursor is the strongest identity there is. Lookalike
// owners resolve by their position among equals and park only when that set
// changes, which is the case a positional locator gets silently wrong.
describe('lookalike owners', () => {
  const cards = () => {
    document.body.innerHTML =
      '<ul>' + '<li>Product name<button>Buy</button></li>'.repeat(3) + '</ul>';
    return document.querySelectorAll('button');
  };

  it('resolve at placement and after hydration by position among equals', () => {
    const buttons = cards();
    const anchor = buildAnchor(buttons[1]!, 0, 0);
    expect(anchor.owner).toMatchObject({ ordinal: 1, count: 3 });
    expect(resolveAnchor(anchor)).toBe(buttons[1]);
    const [hydrated] = normalizeComments([comment(anchor)]);
    expect(hydrated!.anchor.owner).toMatchObject({ ordinal: 1, count: 3 });
    expect(resolveAnchor(hydrated!.anchor)).toBe(buttons[1]);
  });

  it('park when a lookalike is filtered away, even if the old path still hits', () => {
    const buttons = cards();
    const anchor = buildAnchor(buttons[1]!, 0, 0);
    document.querySelector('li')!.remove();
    expect(resolveAnchor(anchor)).toBeNull();
  });

  it('park when a lookalike is added', () => {
    const buttons = cards();
    const anchor = buildAnchor(buttons[1]!, 0, 0);
    document
      .querySelector('ul')!
      .insertAdjacentHTML('beforeend', document.querySelector('li')!.outerHTML);
    expect(resolveAnchor(anchor)).toBeNull();
  });

  it.each<[string, (owner: TargetEvidence) => void]>([
    ['ordinal beyond count', (o) => void (o.ordinal = 3)],
    ['ordinal without count', (o) => void delete o.count],
    ['count of one', (o) => void ((o.ordinal = 0), (o.count = 1))],
    ['fractional ordinal', (o) => void (o.ordinal = 0.5)],
    ['a path with a document-wide axis', (o) => void (o.path = '/descendant::input[1]')],
  ])('reject hydrated owner evidence with %s', (_label, corrupt) => {
    const buttons = cards();
    const anchor = buildAnchor(buttons[1]!, 0, 0);
    const owner = { ...anchor.owner! };
    corrupt(owner);
    expect(normalizeComments([comment({ ...anchor, owner })])).toEqual([]);
  });
});

describe('owners without text', () => {
  it('a single textless row still binds and resolves', () => {
    document.body.innerHTML = '<ul><li><input type="checkbox"></li></ul>';
    const input = document.querySelector('input')!;
    const anchor = buildAnchor(input, 0, 0);
    expect(anchor.owner?.textFingerprint).toBe('');
    expect(resolveAnchor(anchor)).toBe(input);
    document
      .querySelector('ul')!
      .insertAdjacentHTML('beforeend', '<li><input type="checkbox"></li>');
    expect(resolveAnchor(anchor)).toBeNull();
  });

  it('identical shadow hosts without ids resolve by position and park when one disappears', () => {
    for (let i = 0; i < 2; i++) {
      const host = document.createElement('sl-input');
      document.body.append(host);
      host.attachShadow({ mode: 'open' }).innerHTML = '<input type="text">';
    }
    const hosts = document.querySelectorAll('sl-input');
    const inner = hosts[1]!.shadowRoot!.querySelector('input')!;
    const anchor = buildAnchor(inner, 0, 0);
    expect(anchor.shadowPath?.[0]).toMatchObject({ ordinal: 1, count: 2 });
    expect(resolveAnchor(anchor)).toBe(inner);
    hosts[0]!.remove();
    expect(resolveAnchor(anchor)).toBeNull();
  });
});

describe('owners with a unique identity', () => {
  it('keep the pin when the pinned control text is fixed inside an id-bearing row', () => {
    document.body.innerHTML =
      '<table><tbody><tr id="r1"><td>Alex</td><td><button>Approve</button></td></tr>' +
      '<tr id="r2"><td>Blair</td><td><button>Approve</button></td></tr></tbody></table>';
    const button = document.querySelector('#r1 button')!;
    const anchor = buildAnchor(button, 0, 0);
    expect(anchor.owner?.identity).toBe('id');
    button.textContent = 'Confirm';
    expect(resolveAnchor(anchor)).toBe(button);
  });

  it('still park when text outside the pinned control changes, even under a stable testid', () => {
    // A slot-style id can be recycled to another entity; the row's own text is
    // the tie-breaker, so a live timestamp is a documented reason to re-place.
    document.body.innerHTML =
      '<ul><li data-testid="m-1">Alex <time>2 min ago</time><button>Reply</button></li>' +
      '<li data-testid="m-2">Blair <time>5 min ago</time><button>Reply</button></li></ul>';
    const button = document.querySelector('[data-testid="m-1"] button')!;
    const anchor = buildAnchor(button, 0, 0);
    expect(anchor.owner).toMatchObject({ identity: 'testid', textFingerprint: 'Alex 2 min ago' });
    button.textContent = 'Answer';
    expect(resolveAnchor(anchor)).toBe(button);
    document.querySelector('[data-testid="m-1"] time')!.textContent = '3 min ago';
    expect(resolveAnchor(anchor)).toBeNull();
  });

  it('still park when the identity is duplicated or recycled to another entity', () => {
    document.body.innerHTML =
      '<ul><li id="one">Alex<input></li><li id="two">Blair<input></li></ul>';
    const input = document.querySelector('#two input')!;
    const anchor = buildAnchor(input, 0, 0);
    document.querySelector('#one')!.id = 'two';
    expect(resolveAnchor(anchor)).toBeNull();
    input.closest('li')!.remove();
    // The surviving #two is Alex's row wearing Blair's id.
    expect(resolveAnchor(anchor)).toBeNull();
  });
});

describe('owners the capture budget cannot classify', () => {
  it('record no constraint above the candidate cap and keep the legacy locator', () => {
    document.body.innerHTML = '<ul>' + '<li>Row<button>Go</button></li>'.repeat(501) + '</ul>';
    const button = document.querySelectorAll('button')[250]!;
    const anchor = buildAnchor(button, 0, 0);
    expect(anchor.owner).toBeUndefined();
    expect(resolveAnchor(anchor)).toBe(button);
  });

  it('fall back to the locator ladder for a shadow host above the cap', () => {
    for (let i = 0; i < 501; i++) {
      const host = document.createElement('x-cell');
      document.body.append(host);
      host.attachShadow({ mode: 'open' }).innerHTML = '<button>Go</button>';
    }
    const host = document.querySelectorAll('x-cell')[250]!;
    const inner = host.shadowRoot!.querySelector('button')!;
    const anchor = buildAnchor(inner, 0, 0);
    expect(anchor.shadowPath?.[0]?.ambiguous).toBe(true);
    expect(resolveAnchor(anchor)).toBe(inner);
  });
});
