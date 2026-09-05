import { afterEach, describe, expect, it } from 'vitest';
import {
  anchorToScreen,
  buildAnchor,
  clickToPositionPercent,
  resolveAnchor,
} from '../../src/core/anchor';

describe('anchor', () => {
  it('computes percentage offsets within element', () => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ left: 100, top: 50, width: 200, height: 100 }) as DOMRect;
    expect(clickToPositionPercent(el, 200, 100)).toEqual({ x: 50, y: 50 });
    expect(clickToPositionPercent(el, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(clickToPositionPercent(el, 300, 150)).toEqual({ x: 100, y: 100 });
  });

  it('clamps to 0-100', () => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
    expect(clickToPositionPercent(el, -10, -10)).toEqual({ x: 0, y: 0 });
    expect(clickToPositionPercent(el, 200, 200)).toEqual({ x: 100, y: 100 });
  });

  it('builds an anchor with selectors + fingerprint + position', () => {
    document.body.innerHTML = '<button data-testid="cta">Hello</button>';
    const btn = document.querySelector('button')!;
    btn.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 40 }) as DOMRect;
    const a = buildAnchor(btn, 50, 20);
    expect(a.selectors.testid).toBe('cta');
    expect(a.textFingerprint).toBe('Hello');
    expect(a.positionPercent).toEqual({ x: 50, y: 50 });
  });

  it('resolves back through anchor', () => {
    document.body.innerHTML = '<button data-testid="cta">Hello</button>';
    const btn = document.querySelector('button')!;
    const a = buildAnchor(btn, 0, 0);
    expect(resolveAnchor(a, document)).toBe(btn);
  });

  it('captures element context: name, role, nearest heading', () => {
    document.body.innerHTML =
      '<section><h2>Next section</h2><div><button>Continue</button></div></section>';
    const btn = document.querySelector('button')!;
    const a = buildAnchor(btn, 0, 0);
    // toMatchObject: the visual snapshot (color/font, always computed) rides alongside.
    expect(a.context).toMatchObject({ name: 'Continue', role: 'button', heading: 'Next section' });
  });

  it('context prefers aria-label and explicit role', () => {
    document.body.innerHTML = '<div role="tab" aria-label="Settings">⚙</div>';
    const a = buildAnchor(document.querySelector('div')!, 0, 0);
    expect(a.context?.name).toBe('Settings');
    expect(a.context?.role).toBe('tab');
  });

  it('context heading is best-effort: absent when no heading precedes', () => {
    document.body.innerHTML = '<main><button>Lonely</button></main>';
    const a = buildAnchor(document.querySelector('button')!, 0, 0);
    expect(a.context?.heading).toBeUndefined();
    expect(a.context?.role).toBe('button');
  });

  it('context heading takes the LAST heading inside a preceding sibling and caps at 80 chars', () => {
    const long = 'H'.repeat(120);
    document.body.innerHTML = `<div><h1>First</h1><h3>${long}</h3></div><p><button>Go</button></p>`;
    const a = buildAnchor(document.querySelector('button')!, 0, 0);
    expect(a.context?.heading).toBe('H'.repeat(80));
  });

  it('context name is absent for an unnamed element', () => {
    document.body.innerHTML = '<div><input type="text"></div>';
    const a = buildAnchor(document.querySelector('input')!, 0, 0);
    expect(a.context?.name).toBeUndefined();
  });

  it('screen position uses element rect', () => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 50 }) as DOMRect;
    expect(anchorToScreen(el, { x: 50, y: 50 })).toEqual({ left: 60, top: 45 });
  });
});

describe('nested-target capture (anchored ancestor)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('clicking a nested element records the nearest ancestor data-testid', () => {
    document.body.innerHTML = '<button data-testid="cta"><span>Hello</span></button>';
    const span = document.querySelector('span')!;
    const a = buildAnchor(span, 0, 0);
    expect(a.selectors.testid).toBe('cta');
    expect(resolveAnchor(a, document)).toBe(document.querySelector('button'));
  });

  it('re-bases positionPercent on the anchored ancestor rect', () => {
    document.body.innerHTML = '<button data-testid="cta"><span>Hello</span></button>';
    const btn = document.querySelector('button')!;
    const span = document.querySelector('span')!;
    btn.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 40 }) as DOMRect;
    span.getBoundingClientRect = () => ({ left: 20, top: 10, width: 60, height: 20 }) as DOMRect;
    const a = buildAnchor(span, 30, 15);
    // 30/15 is 30%/37.5% of the button rect — NOT 16.67%/25% of the span rect.
    expect(a.positionPercent).toEqual({ x: 30, y: 37.5 });
  });

  it('fingerprint and context describe the anchored ancestor', () => {
    document.body.innerHTML =
      '<section><h2>Next section</h2><button data-testid="cta" aria-label="Continue"><span class="icon">→</span></button></section>';
    const span = document.querySelector('span')!;
    const a = buildAnchor(span, 0, 0);
    expect(a.textFingerprint).toBe('→');
    expect(a.context).toMatchObject({ name: 'Continue', role: 'button', heading: 'Next section' });
  });

  it('skips ancestors whose data-testid is empty or whitespace', () => {
    document.body.innerHTML =
      '<div data-testid="outer"><div data-testid="  "><span>Deep</span></div></div>';
    const a = buildAnchor(document.querySelector('span')!, 0, 0);
    expect(a.selectors.testid).toBe('outer');
  });

  it('falls back to the raw target when no ancestor is anchored', () => {
    document.body.innerHTML = '<div><span id="leaf">Plain</span></div>';
    const span = document.getElementById('leaf')!;
    const a = buildAnchor(span, 0, 0);
    expect(a.selectors.testid).toBeNull();
    expect(resolveAnchor(a, document)).toBe(span);
  });
});

describe('visual context capture (agent blast radius)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('captures the computed-style micro-snapshot for styled elements', () => {
    document.body.innerHTML =
      '<div id="hero" style="background-color: rgb(241, 250, 238); color: rgb(26, 35, 50); font-size: 17px; font-family: \'DM Sans\', sans-serif; border-radius: 14px">Hero</div>';
    const el = document.getElementById('hero')!;
    const anchor = buildAnchor(el, 10, 10);
    expect(anchor.context?.styles).toMatchObject({
      background: 'rgb(241, 250, 238)',
      color: 'rgb(26, 35, 50)',
      fontSize: '17px',
      fontFamily: 'DM Sans',
      radius: '14px',
    });
  });

  it('omits default/empty style values instead of shipping noise', () => {
    document.body.innerHTML = '<p id="plain">Plain text</p>';
    const anchor = buildAnchor(document.getElementById('plain')!, 5, 5);
    const styles = anchor.context?.styles ?? {};
    expect(styles).not.toHaveProperty('background'); // transparent default
    expect(styles).not.toHaveProperty('radius'); // 0px default
    expect(styles).not.toHaveProperty('textAlign'); // `start` initial value
  });

  // Alignment is the second-largest thing reviewers actually comment on after
  // motion, and "Left align" is ambiguous between text alignment and
  // un-centring a `margin-inline: auto` block. Capturing the computed value
  // says which one the reviewer was looking at.
  it('captures a non-default text-align', () => {
    document.body.innerHTML = '<h2 id="head" style="text-align: center">Heading</h2>';
    const anchor = buildAnchor(document.getElementById('head')!, 5, 5);
    expect(anchor.context?.styles?.textAlign).toBe('center');
  });

  it('caps the accessible name at 80 chars even for CMS-length alt text (review r18)', () => {
    document.body.innerHTML = `<img id="long" alt="${'a'.repeat(300)}" src="/x.jpg">`;
    const anchor = buildAnchor(document.getElementById('long')!, 5, 5);
    expect(anchor.context?.name?.length).toBe(80);
  });

  it('captures a truncated src for image pins; alt still flows via accessible name', () => {
    document.body.innerHTML = `<img id="pic" alt="Team photo" src="https://cdn.example.com/${'x'.repeat(300)}.jpg">`;
    const anchor = buildAnchor(document.getElementById('pic')!, 5, 5);
    expect(anchor.context?.src).toBeDefined();
    expect(anchor.context!.src!.length).toBeLessThanOrEqual(200);
    expect(anchor.context!.src!.startsWith('https://cdn.example.com/')).toBe(true);
    expect(anchor.context?.name).toBe('Team photo');
  });
});

// ————— 0.6.1: heading from the block the marquee was drawn over —————
// An area rect spanning sibling cards has no tight common ancestor, so the
// climb lands on a page-level container. nearestHeading() was then walking
// from THAT — and a container like <main> has NO heading above it — so the
// export lost its "under '…'" clause, the one line telling the agent where on
// the page to look. Fixture mirrors the shipped pinflow.dev structure.
describe('buildAnchor deep-element heading (0.6.1)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const page =
    '<main id="main">' +
    '<section><h1>Put feedback directly on the page</h1></section>' +
    '<section><h2>Three ways teams use it</h2>' +
    '<ul id="cards"><li id="card">Production websites</li></ul></section>' +
    '</main>';

  it('a page-level anchor has no heading of its own (the reported defect)', () => {
    document.body.innerHTML = page;
    const main = document.getElementById('main')!;
    expect(buildAnchor(main, 0, 0).context?.heading).toBeUndefined();
  });

  it('takes the heading from the deep element when one is supplied', () => {
    document.body.innerHTML = page;
    const main = document.getElementById('main')!;
    const card = document.getElementById('card')!;
    expect(buildAnchor(main, 0, 0, card).context?.heading).toBe('Three ways teams use it');
  });

  // The guard against the mixed-provenance design we rejected: only the
  // heading may come from the deep element. Everything else must keep
  // describing the element **Element:** names, or the block contradicts
  // itself with nothing to explain the mismatch.
  it('moves ONLY the heading, never the selectors, fingerprint, name or role', () => {
    document.body.innerHTML = page;
    const main = document.getElementById('main')!;
    const card = document.getElementById('card')!;
    const plain = buildAnchor(main, 0, 0);
    const deep = buildAnchor(main, 0, 0, card);
    expect(deep.selectors).toEqual(plain.selectors);
    expect(deep.textFingerprint).toBe(plain.textFingerprint);
    expect(deep.context?.name).toBe(plain.context?.name);
    expect(deep.context?.role).toBe(plain.context?.role);
  });
});

// A pin taken inside a modal is bound to that LAYER, not to page geometry.
// Without this, closing the dialog let the heal ladder attach the comment to
// whatever was left in the tree — the session header, a sibling in the next
// dialog — and _persistHeal wrote the stranger into the stored selectors.
describe('dialog layer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const page = '<main><h1>Session</h1><button>Save</button></main>';

  it('records the enclosing dialog with its aria-label', () => {
    document.body.innerHTML =
      page +
      '<div class="backdrop"><div role="dialog" aria-label="Add Patients"><button>Save</button></div></div>';
    const a = buildAnchor(document.querySelector('[role="dialog"] button')!, 0, 0);
    expect(a.layer).toEqual({ role: 'dialog', name: 'Add Patients' });
  });

  it('names the dialog by aria-labelledby, then by its first heading', () => {
    document.body.innerHTML =
      '<div role="dialog" aria-labelledby="t"><h2 id="t">New Appointment</h2><button>Go</button></div>' +
      '<div role="dialog"><header><h3>Session Recording</h3></header><button>Stop</button></div>';
    const [a, b] = Array.from(document.querySelectorAll('[role="dialog"] button'));
    expect(buildAnchor(a!, 0, 0).layer?.name).toBe('New Appointment');
    expect(buildAnchor(b!, 0, 0).layer?.name).toBe('Session Recording');
  });

  it('aria-modal and alertdialog count as layers; an unnamed dialog records no name', () => {
    document.body.innerHTML =
      '<section aria-modal="true"><button>A</button></section>' +
      '<div role="alertdialog"><button>B</button></div>';
    const [a, b] = Array.from(document.querySelectorAll('button'));
    expect(buildAnchor(a!, 0, 0).layer).toEqual({ role: 'dialog' });
    expect(buildAnchor(b!, 0, 0).layer).toEqual({ role: 'dialog' });
  });

  it('a page pin records no layer', () => {
    document.body.innerHTML = page;
    expect(buildAnchor(document.querySelector('button')!, 0, 0).layer).toBeUndefined();
  });

  it('parks when the dialog is gone: a same-text page element never wins', () => {
    document.body.innerHTML =
      page +
      '<div class="backdrop"><div role="dialog" aria-label="Add Patients"><button>Save</button></div></div>';
    const a = buildAnchor(document.querySelector('[role="dialog"] button')!, 0, 0);
    document.querySelector('.backdrop')!.remove();
    // The page still holds a "Save" button: the fingerprint walk would take it.
    expect(document.querySelector('main button')!.textContent).toBe('Save');
    expect(resolveAnchor(a, document)).toBeNull();
  });

  it('parks when the css/xpath path lands outside every open dialog', () => {
    document.body.innerHTML =
      '<div><div role="dialog" aria-label="Add Patients"><p>x</p></div></div>';
    const a = buildAnchor(document.querySelector('p')!, 0, 0);
    // The dialog closes and a page element now sits at the recorded path.
    document.body.innerHTML = '<div><div><p>x</p></div></div>';
    expect(document.querySelector(a.selectors.css)).not.toBeNull();
    expect(resolveAnchor(a, document)).toBeNull();
  });

  it('snaps back when a dialog with the same name reopens', () => {
    const dialog =
      '<div class="backdrop"><div role="dialog" aria-label="Add Patients"><button>Save</button></div></div>';
    document.body.innerHTML = page + dialog;
    const a = buildAnchor(document.querySelector('[role="dialog"] button')!, 0, 0);
    document.querySelector('.backdrop')!.remove();
    expect(resolveAnchor(a, document)).toBeNull();
    document.body.insertAdjacentHTML('beforeend', dialog);
    expect(resolveAnchor(a, document)).toBe(document.querySelector('[role="dialog"] button'));
  });

  it('never resolves inside a different dialog, even one with an identical element', () => {
    document.body.innerHTML =
      page +
      '<div class="backdrop"><div role="dialog" aria-label="Add Patients"><button>Save</button></div></div>';
    const a = buildAnchor(document.querySelector('[role="dialog"] button')!, 0, 0);
    document.body.innerHTML =
      page +
      '<div class="backdrop"><div role="dialog" aria-label="New Appointment"><button>Save</button></div></div>';
    expect(resolveAnchor(a, document)).toBeNull();
  });

  it('an unnamed layer resolves inside any open dialog, and a closed <dialog> is not open', () => {
    document.body.innerHTML = page + '<dialog open><button>Save</button></dialog>';
    const a = buildAnchor(document.querySelector('dialog button')!, 0, 0);
    expect(a.layer).toEqual({ role: 'dialog' });
    document.querySelector('dialog')!.removeAttribute('open');
    expect(resolveAnchor(a, document)).toBeNull();
    document.querySelector('dialog')!.setAttribute('open', '');
    expect(resolveAnchor(a, document)).toBe(document.querySelector('dialog button'));
  });
});

describe('accessible name in context (0.12.0)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('names a labelled checkbox by its label, with its implicit role, and mirrors both into selectors', () => {
    document.body.innerHTML =
      '<h2>Bill-led Group Session 1</h2><label for="all">All Attended</label><input id="all" type="checkbox">';
    const a = buildAnchor(document.querySelector('input')!, 0, 0);
    expect(a.context).toMatchObject({
      name: 'All Attended',
      role: 'checkbox',
      heading: 'Bill-led Group Session 1',
    });
    expect(a.selectors).toMatchObject({ role: 'checkbox', name: 'All Attended' });
  });

  it('a text-only element still names itself by its fingerprint, and carries no name selector', () => {
    document.body.innerHTML = '<button>Continue</button>';
    const a = buildAnchor(document.querySelector('button')!, 0, 0);
    expect(a.context?.name).toBe('Continue');
    expect(a.selectors.name).toBeUndefined();
  });

  it('a dialog is still named by aria-labelledby through the shared ladder', () => {
    document.body.innerHTML =
      '<div role="dialog" aria-labelledby="t"><h2 id="t">New Appointment</h2><button>Go</button></div>';
    expect(buildAnchor(document.querySelector('button')!, 0, 0).layer?.name).toBe(
      'New Appointment',
    );
  });
});
