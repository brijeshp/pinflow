import { describe, expect, it } from 'vitest';
import { acquireStorage, memoryStorage } from '../../src/core/safe-storage';

describe('safe-storage', () => {
  it('memoryStorage implements the Storage members the library uses', () => {
    const s = memoryStorage();
    expect(s.getItem('a')).toBeNull();
    s.setItem('a', '1');
    s.setItem('b', '2');
    expect(s.getItem('a')).toBe('1');
    expect(s.length).toBe(2);
    expect(s.key(0)).toBe('a');
    expect(s.key(9)).toBeNull();
    s.removeItem('a');
    expect(s.getItem('a')).toBeNull();
    expect(s.length).toBe(1);
    s.clear();
    expect(s.length).toBe(0);
  });

  it('acquireStorage returns the real localStorage when accessible', () => {
    expect(acquireStorage()).toBe(window.localStorage);
  });

  it('acquireStorage falls back to the shim when the getter throws', () => {
    const desc = Object.getOwnPropertyDescriptor(window, 'localStorage');
    if (!desc) throw new Error('localStorage descriptor missing');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    try {
      const s = acquireStorage();
      s.setItem('x', 'y');
      expect(s.getItem('x')).toBe('y');
    } finally {
      Object.defineProperty(window, 'localStorage', desc);
    }
  });
});
