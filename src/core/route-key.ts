const PINFLOW_PARAMS = new Set(['reviewer', 'mode']);

export function routeKey(url: string = window.location.href): string {
  try {
    const u = new URL(url);
    const params = new URLSearchParams(u.search);
    for (const k of PINFLOW_PARAMS) params.delete(k);
    const search = params.toString();
    return u.pathname + (search ? `?${search}` : '');
  } catch {
    return '/';
  }
}
