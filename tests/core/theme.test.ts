import { afterEach, describe, expect, it } from 'vitest';

import { STYLES } from '../../src/core/ui/styles';

function host(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[data-pinflow-root]');
  if (!node) throw new Error('pinflow root missing');
  return node;
}

describe('theme tokens (A1)', () => {
  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('applies theme values as --pf-* custom properties on the shadow host', async () => {
    const { init } = await import('../../src/core/index');
    const handle = init({
      project: 'th',
      reviewer: 'Sam',
      theme: {
        fontFamily: 'DM Sans',
        accent: '#2d8b8b',
        accentContrast: '#f1faee',
        surface: '#ffffff',
        text: '#1a2332',
        textMuted: '#4a5568',
        danger: '#e07a5f',
        radius: '14px',
        shadow: '0 4px 20px rgba(26,35,50,0.1)',
      },
    });
    const style = host().style;
    expect(style.getPropertyValue('--pf-font-family')).toBe('DM Sans');
    expect(style.getPropertyValue('--pf-accent')).toBe('#2d8b8b');
    expect(style.getPropertyValue('--pf-accent-contrast')).toBe('#f1faee');
    expect(style.getPropertyValue('--pf-text-muted')).toBe('#4a5568');
    expect(style.getPropertyValue('--pf-radius')).toBe('14px');
    expect(style.getPropertyValue('--pf-shadow')).toBe('0 4px 20px rgba(26,35,50,0.1)');
    handle.destroy();
  });

  it('sets no --pf-* properties when theme is omitted (stock look preserved)', async () => {
    const { init } = await import('../../src/core/index');
    const handle = init({ project: 'th2', reviewer: 'Sam' });
    expect(host().getAttribute('style') ?? '').not.toContain('--pf-');
    handle.destroy();
  });

  it('stylesheet consumes the tokens via var() with stock fallbacks', () => {
    expect(STYLES).toContain('var(--pf-accent,#2563eb)');
    expect(STYLES).toContain('var(--pf-surface,#fff)');
    expect(STYLES).toContain('var(--pf-radius,12px)');
    expect(STYLES).toContain('var(--pf-danger,#dc2626)');
    expect(STYLES).toContain('var(--pf-shadow,');
    // Chrome drops a var()-dependent longhand sharing a block with all:initial,
    // so the font token must be consumed on .root — never inside :host.
    const hostRule = STYLES.slice(0, STYLES.indexOf('}') + 1);
    expect(hostRule).not.toContain('var(--pf-font-family');
    expect(STYLES).toMatch(/\.root\{[^}]*font-family:var\(--pf-font-family,inherit\)/);
  });

  it('draft textarea is 16px on coarse pointers — iOS Safari must not auto-zoom on focus', () => {
    // Safari zooms the whole page when a focused input is under 16px; the
    // reviewer then pinches out and the gesture eats the draft. 16px on touch
    // devices removes the zoom trigger at the source.
    expect(STYLES).toContain('@media (pointer:coarse){.input textarea{font-size:16px}}');
  });

  it('resolution treatments ride the textMuted token (L2.3)', () => {
    expect(STYLES).toMatch(/\.pin\[data-status\]\{background:var\(--pf-text-muted,#64748b\)\}/);
    expect(STYLES).toMatch(/\.pin\[data-status="declined"\]\{text-decoration:line-through\}/);
    expect(STYLES).toMatch(/\.input \.res\{[^}]*color:var\(--pf-text-muted,#64748b\)/);
  });
});
