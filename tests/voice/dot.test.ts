import { describe, expect, it } from 'vitest';
import { createDot } from '../../src/voice/ui/dot';

/**
 * The HUD lives in the core shadow tree, so var(--pf-*) tokens inherit into
 * it exactly like the accent tokens already do. These tests pin the theming
 * contract: card surface/text/font and the interim color must consume theme
 * tokens with the stock dark values as fallbacks.
 */
describe('createDot theming', () => {
  function build() {
    const mount = document.createElement('div');
    createDot(mount);
    const card = mount.querySelector<HTMLElement>('[role="dialog"]')!;
    const log = card.querySelector<HTMLElement>('[role="log"]')!;
    const interim = log.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    const stop = card.querySelector<HTMLElement>('button')!;
    return { card, interim, stop };
  }

  it('card consumes surface/text/font tokens with the stock values as fallbacks', () => {
    const { card } = build();
    expect(card.style.cssText).toContain('var(--pf-surface,#0c1f26)');
    expect(card.style.cssText).toContain('var(--pf-text,#eaf6f4)');
    expect(card.style.cssText).toContain('var(--pf-font-family,system-ui,sans-serif)');
  });

  it('interim transcript consumes the muted-text token', () => {
    const { interim } = build();
    expect(interim.style.cssText).toContain('var(--pf-text-muted,#8fb6b0)');
  });

  it('stop button consumes the font token', () => {
    const { stop } = build();
    expect(stop.style.cssText).toContain('var(--pf-font-family,system-ui,sans-serif)');
  });
});
