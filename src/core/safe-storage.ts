/**
 * Third-party embeds can land on pages where merely READING
 * `window.localStorage` throws (SecurityError under third-party storage
 * blocking / sandboxed iframes). init() must never crash the host, so we fall
 * back to a non-persistent in-memory Storage shim: the widget still works for
 * the session, it just forgets on reload.
 */
export function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => {
      m.delete(k);
    },
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
    },
  };
}

/** Real localStorage when accessible; the in-memory shim when blocked. */
export function acquireStorage(): Storage {
  try {
    const s = window.localStorage;
    if (s) return s;
  } catch {
    /* storage blocked — fall through to the shim */
  }
  return memoryStorage();
}
