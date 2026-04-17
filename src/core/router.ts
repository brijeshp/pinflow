export interface RouteWatcher {
  stop(): void;
}

function current(): string {
  return window.location.pathname + window.location.search;
}

// Patches history.push/replaceState so SPA nav fires `onChange`, then
// restores the originals on `stop()`. `queueMicrotask` lets the nav
// complete before we re-read `location`.
export function watchRoute(onChange: (route: string) => void): RouteWatcher {
  let route = current();
  const emit = (): void => {
    const next = current();
    if (next !== route) {
      route = next;
      onChange(route);
    }
  };

  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (this: History, ...args: Parameters<History['pushState']>) {
    const r = origPush.apply(this, args);
    queueMicrotask(emit);
    return r;
  };
  history.replaceState = function (this: History, ...args: Parameters<History['replaceState']>) {
    const r = origReplace.apply(this, args);
    queueMicrotask(emit);
    return r;
  };
  window.addEventListener('popstate', emit);
  window.addEventListener('hashchange', emit);

  return {
    stop() {
      history.pushState = origPush;
      history.replaceState = origReplace;
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
