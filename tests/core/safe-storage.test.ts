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

it('#8: a readable store whose setItem throws yields the memory shim (write probe)', async () => {
  const { acquireStorage } = await import('../../src/core/safe-storage');
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
  const readOnly = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {},
    key: () => null,
    length: 0,
    clear: () => {},
  } as unknown as Storage;
  Object.defineProperty(window, 'localStorage', { value: readOnly, configurable: true });
  try {
    const s = acquireStorage();
    expect(() => s.setItem('k', 'v')).not.toThrow();
    expect(s.getItem('k')).toBe('v'); // memory shim semantics, not the broken store
  } finally {
    if (original) Object.defineProperty(window, 'localStorage', original);
  }
});

it('#8 (r2): the memory shim is a page-level singleton — re-acquisition keeps the corpus', async () => {
  const { acquireStorage } = await import('../../src/core/safe-storage');
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
  const broken = {
    getItem: () => null,
    setItem: () => {
      throw new Error('denied');
    },
    removeItem: () => {},
    key: () => null,
    length: 0,
    clear: () => {},
  } as unknown as Storage;
  Object.defineProperty(window, 'localStorage', { value: broken, configurable: true });
  try {
    const first = acquireStorage();
    first.setItem('pinflow:c:p:R', '{"x":1}');
    const second = acquireStorage(); // re-init (e.g. React remount)
    expect(second.getItem('pinflow:c:p:R')).toBe('{"x":1}');
    second.removeItem('pinflow:c:p:R');
  } finally {
    if (original) Object.defineProperty(window, 'localStorage', original);
  }
});
