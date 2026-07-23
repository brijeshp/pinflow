/**
 * Third-party embeds can land on pages where merely READING
 * `window.localStorage` throws (SecurityError under third-party storage
 * blocking / sandboxed iframes). init() must never crash the host, so we fall
 * back to a non-persistent in-memory Storage shim: the widget still works for
 * the session, it just forgets on reload.
 */
// A SINGLETON backing map (codex audit #8): every degraded acquisition in
// this page shares one corpus, so re-init after a failed probe does not
// silently discard the session's comments. Still non-persistent by nature.
const memoryBacking = new Map<string, string>();

export function memoryStorage(): Storage {
  const m = memoryBacking;
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
    // A WRITE probe, not just a read: Safari private mode and some embed
    // policies expose a readable store whose setItem throws — a session
    // there must run on the memory shim from the start or every comment is
    // silently lost on re-init (codex audit #8). The probe key is removed
    // immediately; quota exhaustion later still degrades via saveStore's
    // single warning.
    if (s) {
      const probe = 'pinflow:probe';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    }
  } catch {
    /* storage blocked or write-denied — fall through to the shim */
  }
  return memoryStorage();
}
