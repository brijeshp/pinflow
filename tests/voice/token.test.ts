import { describe, expect, it, vi } from 'vitest';
import { isLocalOrigin, resolveToken } from '../../src/voice/transcription/token';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('isLocalOrigin', () => {
  it('accepts loopback and *.local hosts', () => {
    expect(isLocalOrigin('localhost')).toBe(true);
    expect(isLocalOrigin('127.0.0.1')).toBe(true);
    expect(isLocalOrigin('dev.local')).toBe(true);
  });
  it('rejects public hosts', () => {
    expect(isLocalOrigin('demo.sensavera.com')).toBe(false);
    expect(isLocalOrigin('example.com')).toBe(false);
  });
});

describe('resolveToken', () => {
  it('getToken wins over tokenEndpoint (P4.1 escape hatch)', async () => {
    const fetchFn = vi.fn();
    const getToken = vi.fn().mockResolvedValue('custom-jwt');
    const token = await resolveToken(
      { getToken, tokenEndpoint: 'https://x/token', devOnlyToken: 'dev' },
      { fetchFn, hostname: 'localhost' },
    );
    expect(token).toBe('custom-jwt');
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('a getToken rejection propagates and degrades like any other token failure', async () => {
    await expect(
      resolveToken({ getToken: () => Promise.reject(new Error('mint failed')) }),
    ).rejects.toThrow('mint failed');
  });

  it('an empty getToken result is a failure, not a silent bad credential', async () => {
    await expect(resolveToken({ getToken: () => Promise.resolve('') })).rejects.toThrow(
      'empty token',
    );
  });

  it('mints from a token endpoint and returns the access_token', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: 'jwt-123', expires_in: 60 }));
    const token = await resolveToken({ tokenEndpoint: 'https://x/token' }, { fetchFn });
    expect(token).toBe('jwt-123');
    expect(fetchFn).toHaveBeenCalledWith('https://x/token', { method: 'POST' });
  });

  it('defaults to global fetch with the exact args when no fetchFn is injected', async () => {
    // The default MUST stay wrapped in an arrow (see token.ts): passing `fetch`
    // by value detaches it from its receiver and Chromium/WebKit throw
    // "Illegal invocation". happy-dom cannot reproduce the receiver check, so
    // this pins the default path: globalThis.fetch called with correct args.
    const spy = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: 'jwt-default', expires_in: 60 }));
    vi.stubGlobal('fetch', spy);
    try {
      const token = await resolveToken({ tokenEndpoint: 'https://x/token' });
      expect(token).toBe('jwt-default');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('https://x/token', { method: 'POST' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('throws on a non-200 token endpoint', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, false, 403));
    await expect(resolveToken({ tokenEndpoint: 'https://x/token' }, { fetchFn })).rejects.toThrow(
      '403',
    );
  });

  it('throws on an invalid token response body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ nope: true }));
    await expect(resolveToken({ tokenEndpoint: 'https://x/token' }, { fetchFn })).rejects.toThrow(
      'invalid',
    );
  });

  it('allows a devOnlyToken on a local origin', async () => {
    const token = await resolveToken({ devOnlyToken: 'dev-jwt' }, { hostname: 'localhost' });
    expect(token).toBe('dev-jwt');
  });

  it('THROWS for a devOnlyToken on a public origin (no raw-token-in-prod footgun)', async () => {
    await expect(
      resolveToken({ devOnlyToken: 'dev-jwt' }, { hostname: 'demo.sensavera.com' }),
    ).rejects.toThrow('local origin');
  });

  it('throws when no token is configured', async () => {
    await expect(resolveToken({}, {})).rejects.toThrow('no voice token');
  });
});
