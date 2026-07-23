import type { GrantTokenResponse, VoiceConfig } from '../../core/types';

/** Hostnames where a raw `devOnlyToken` is permitted. */
export function isLocalOrigin(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localhost')
  );
}

function isGrantResponse(v: unknown): v is GrantTokenResponse {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>)['access_token'] === 'string' &&
    typeof (v as Record<string, unknown>)['expires_in'] === 'number'
  );
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Resolve a short-lived Deepgram credential. Order: `getToken` (caller-owned
 * minting) → `tokenEndpoint` (bare POST minting a grant-token JWT server-side)
 * → `devOnlyToken`, allowed only on a local origin (the raw-token-in-prod
 * footgun is a hard throw, not a doc note).
 */
export async function resolveToken(
  config: Readonly<VoiceConfig>,
  deps: { fetchFn?: FetchLike; hostname?: string; signal?: AbortSignal } = {},
): Promise<string> {
  if (config.getToken) {
    // A rejection propagates and degrades like any other token failure.
    const token = await config.getToken();
    if (typeof token !== 'string' || token.length === 0) {
      throw new Error('pinflow: voice.getToken returned an empty token');
    }
    return token;
  }

  if (config.tokenEndpoint) {
    // Do NOT "simplify" to `deps.fetchFn ?? fetch`: passing `fetch` by value
    // detaches it from its receiver, and Chromium/WebKit then throw
    // "Illegal invocation" when it is called. The arrow keeps the call
    // receiver-correct (a bare `fetch(...)` call resolves the global binding).
    const fetchFn = deps.fetchFn ?? ((input: string, init?: RequestInit) => fetch(input, init));
    // Teardown mid-mint cancels the request itself (codex audit #4).
    const res = await fetchFn(config.tokenEndpoint, {
      method: 'POST',
      ...(deps.signal ? { signal: deps.signal } : {}),
    });
    if (!res.ok) throw new Error(`token endpoint returned ${res.status}`);
    const body: unknown = await res.json();
    if (!isGrantResponse(body)) throw new Error('invalid token response');
    return body.access_token;
  }

  if (config.devOnlyToken) {
    const hostname = deps.hostname ?? location.hostname;
    if (!isLocalOrigin(hostname)) {
      throw new Error(
        'pinflow: voice.devOnlyToken is only allowed on a local origin; use voice.tokenEndpoint in production',
      );
    }
    return config.devOnlyToken;
  }

  throw new Error('pinflow: no voice token configured (set voice.tokenEndpoint)');
}
