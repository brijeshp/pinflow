import { describe, expect, it } from 'vitest';
import { STYLES } from '../../src/core/ui/styles';
import { Annotator } from '../../src/core/ui/annotator';

describe('adaptive theming (dark-host fix + one-variable story)', () => {
  it('no hardcoded light chrome in panel/drawer secondary buttons — tokens only', () => {
    // #f8fafc / #0f172a literals in button rules are the dark-surface bug:
    // light-on-light ghost buttons whenever a host themes the surface dark.
    const buttonRules = STYLES.split('}').filter((r) => r.includes('button'));
    for (const rule of buttonRules) {
      expect(rule).not.toContain('#f8fafc');
      expect(rule).not.toContain('#0f172a');
    }
  });

  it('surface/text defaults are light-dark() adaptive', () => {
    expect(STYLES).toMatch(/--pf-surface,\s*light-dark\(/);
    expect(STYLES).toMatch(/--pf-text,\s*light-dark\(/);
  });

  it('pin ring follows the surface token, not hardcoded white', () => {
    const pinRule = STYLES.split('}').find((r) => r.startsWith('.pin{') || r.includes('.pin{'));
    expect(pinRule).not.toContain('2px #fff');
  });

  it('accentContrast derives from accent luminance when omitted', () => {
    localStorage.setItem('pinflow:r:thm', 'T');
    const dark = new Annotator({
      config: { project: 'thm', theme: { accent: '#0a3d3b' } }, // dark accent → white contrast
      reviewer: 'T',
      mode: 'reviewer',
      storage: localStorage,
    });
    const host = document.querySelector('[data-pinflow-root]') as HTMLElement;
    expect(host.style.getPropertyValue('--pf-accent-contrast').trim()).toBe('#fff');
    dark.destroy();
    document.body.innerHTML = '';

    const light = new Annotator({
      config: { project: 'thm', theme: { accent: '#a7f3d0' } }, // light accent → dark contrast
      reviewer: 'T',
      mode: 'reviewer',
      storage: localStorage,
    });
    const host2 = document.querySelector('[data-pinflow-root]') as HTMLElement;
    expect(host2.style.getPropertyValue('--pf-accent-contrast').trim()).not.toBe('#fff');
    light.destroy();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('an explicit accentContrast is never overridden by derivation', () => {
    localStorage.setItem('pinflow:r:thm2', 'T');
    const a = new Annotator({
      config: { project: 'thm2', theme: { accent: '#0a3d3b', accentContrast: '#ffd700' } },
      reviewer: 'T',
      mode: 'reviewer',
      storage: localStorage,
    });
    const host = document.querySelector('[data-pinflow-root]') as HTMLElement;
    expect(host.style.getPropertyValue('--pf-accent-contrast').trim()).toBe('#ffd700');
    a.destroy();
    localStorage.clear();
    document.body.innerHTML = '';
  });
});

describe('scheme follows the page, not the OS', () => {
  it('host carries INLINE color-scheme:inherit — the inline all:initial outranks any :host rule', async () => {
    const { createUIRoot } = await import('../../src/core/ui/dom');
    const ui = createUIRoot();
    expect(ui.host.style.cssText).toContain('color-scheme: inherit');
    ui.host.remove();
    const { STYLES } = await import('../../src/core/ui/styles');
    expect(STYLES).not.toContain('color-scheme:light dark');
  });
});
