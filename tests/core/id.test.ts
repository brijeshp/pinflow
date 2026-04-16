import { describe, expect, it } from 'vitest';
import { createId } from '../../src/core/id';

describe('createId', () => {
  it('returns a string with the given prefix', () => {
    const id = createId('cmt');
    expect(id).toMatch(/^cmt_[a-z0-9]{9}$/);
  });

  it('uses default prefix', () => {
    const id = createId();
    expect(id).toMatch(/^cmt_/);
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createId()));
    expect(ids.size).toBe(100);
  });
});
