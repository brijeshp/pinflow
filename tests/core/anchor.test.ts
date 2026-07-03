import { describe, expect, it } from 'vitest';
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

  it('screen position uses element rect', () => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 50 }) as DOMRect;
    expect(anchorToScreen(el, { x: 50, y: 50 })).toEqual({ left: 60, top: 45 });
  });
});
