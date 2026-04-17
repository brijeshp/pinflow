import { describe, expect, it } from 'vitest';
import { createId } from '../../src/core/id';

describe('createId', () => {
  it('returns a string with the cmt_ prefix', () => {
    expect(createId()).toMatch(/^cmt_[a-z0-9]{9}$/);
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createId()));
    expect(ids.size).toBe(100);
  });
});
