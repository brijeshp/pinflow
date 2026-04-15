import { describe, expect, it } from 'vitest';
import { init, version } from '../src/core/index';

describe('scaffolding smoke', () => {
  it('exports version', () => {
    expect(version).toBe('0.0.0');
  });

  it('init is callable', () => {
    expect(() => init({ project: 'test' })).not.toThrow();
  });
});
