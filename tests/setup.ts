// Node 25 exposes an experimental localStorage global that lacks methods,
// and some DOM envs don't fully implement Storage. Replace with a trivial
// Map-backed polyfill so tests are deterministic across Node versions.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

const memLocal = new MemoryStorage();
const memSession = new MemoryStorage();

for (const target of [globalThis, typeof window !== 'undefined' ? window : undefined]) {
  if (!target) continue;
  Object.defineProperty(target, 'localStorage', {
    value: memLocal,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(target, 'sessionStorage', {
    value: memSession,
    writable: true,
    configurable: true,
  });
}

// Provide CSS.escape if the DOM env omits it.
const g = globalThis as { CSS?: { escape?: (s: string) => string } };
if (typeof g.CSS === 'undefined') {
  g.CSS = { escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
} else if (typeof g.CSS.escape !== 'function') {
  g.CSS.escape = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
