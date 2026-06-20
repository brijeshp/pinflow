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
  it('mints from a token endpoint and returns the access_token', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: 'jwt-123', expires_in: 60 }));
    const token = await resolveToken({ tokenEndpoint: 'https://x/token' }, { fetchFn });
    expect(token).toBe('jwt-123');
    expect(fetchFn).toHaveBeenCalledWith('https://x/token', { method: 'POST' });
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
