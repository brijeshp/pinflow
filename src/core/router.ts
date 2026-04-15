type Listener = (route: string) => void;

export interface RouteWatcher {
  stop(): void;
  current(): string;
}

function currentRoute(): string {
  return window.location.pathname + window.location.search;
}

export function watchRoute(onChange: Listener): RouteWatcher {
  let route = currentRoute();
  const emit = () => {
    const next = currentRoute();
    if (next !== route) {
      route = next;
      onChange(route);
    }
  };

  const origPush = history.pushState;
  const origReplace = history.replaceState;

  history.pushState = function (this: History, ...args: Parameters<typeof origPush>) {
    const r = origPush.apply(this, args);
    queueMicrotask(emit);
    return r;
  };
  history.replaceState = function (this: History, ...args: Parameters<typeof origReplace>) {
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
    current: () => route,
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
