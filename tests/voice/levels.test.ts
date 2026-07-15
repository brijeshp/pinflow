import { describe, expect, it } from 'vitest';
import { computeLevels } from '../../src/voice/capture/levels';

describe('computeLevels', () => {
  it('returns one normalized level per band', () => {
    const freq = new Uint8Array(20).fill(255);
    const levels = computeLevels(freq, 5);
    expect(levels).toHaveLength(5);
    for (const l of levels) expect(l).toBeCloseTo(1);
  });

  it('normalizes to 0..1', () => {
    const freq = new Uint8Array([0, 0, 128, 128]);
    const levels = computeLevels(freq, 2);
    expect(levels[0]).toBeCloseTo(0);
    expect(levels[1]).toBeCloseTo(128 / 255);
  });

  it('handles a zero band count', () => {
    expect(computeLevels(new Uint8Array(4), 0)).toEqual([]);
  });
});
