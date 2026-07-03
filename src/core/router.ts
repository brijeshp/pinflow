export interface RouteWatcher {
  stop(): void;
}

// Patches history.push/replaceState so SPA nav fires `onChange`, then
// restores the originals on `stop()`. `queueMicrotask` lets the nav
// complete before we re-read `location`.
export function watchRoute(onChange: (route: string) => void): RouteWatcher {
  let route = routeOf();
  let stopped = false;
  const emit = (): void => {
    if (stopped) return; // an orphaned wrapper (see stop) must never emit
    const next = routeOf();
    if (next !== route) {
      route = next;
      onChange(route);
    }
  };

  const origPush = history.pushState;
  const origReplace = history.replaceState;
  const wrappedPush = function (this: History, ...args: Parameters<History['pushState']>) {
    const r = origPush.apply(this, args);
    queueMicrotask(emit);
    return r;
  };
  const wrappedReplace = function (this: History, ...args: Parameters<History['replaceState']>) {
    const r = origReplace.apply(this, args);
    queueMicrotask(emit);
    return r;
  };
  history.pushState = wrappedPush;
  history.replaceState = wrappedReplace;
  window.addEventListener('popstate', emit);
  window.addEventListener('hashchange', emit);

  return {
    stop() {
      stopped = true;
      // Another library may have wrapped history AFTER us; restoring then
      // would rip ITS wrapper out of the chain. Only restore while still on
      // top — otherwise leave ours in place, dead (the flag above).
      if (history.pushState === wrappedPush) history.pushState = origPush;
      if (history.replaceState === wrappedReplace) history.replaceState = origReplace;
      window.removeEventListener('popstate', emit);
      window.removeEventListener('hashchange', emit);
    },
  };
}

export function routeOf(url: string = window.location.href): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return '/';
  }
}
