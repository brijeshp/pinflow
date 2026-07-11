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
