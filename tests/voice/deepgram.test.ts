import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeepgramProvider } from '../../src/voice/transcription/deepgram';
import { KEEPALIVE_FRAME } from '../../src/voice/transcription/protocol';
import type { TranscriptionProvider } from '../../src/voice/types';

class FakeWS {
  binaryType = '';
  readyState = 0;
  readonly sent: unknown[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  send(data: unknown): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
}

interface Harness {
  fake: FakeWS;
  opts: {
    onInterim: ReturnType<typeof vi.fn>;
    onFinal: ReturnType<typeof vi.fn>;
    onError: ReturnType<typeof vi.fn>;
  };
  promise: ReturnType<TranscriptionProvider['open']>;
}

function openProvider(): Harness {
  const fake = new FakeWS();
  const provider = createDeepgramProvider('jwt', () => fake as unknown as WebSocket);
  const opts = { onInterim: vi.fn(), onFinal: vi.fn(), onError: vi.fn() };
  const promise = provider.open(opts);
  return { fake, opts, promise };
}

function keepalives(fake: FakeWS): number {
  return fake.sent.filter((f) => f === KEEPALIVE_FRAME).length;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createDeepgramProvider lifecycle', () => {
  it('rejects open with the close code when the server closes pre-open (no onError)', async () => {
    const { fake, opts, promise } = openProvider();
    fake.onclose?.({ code: 1006 } as CloseEvent);
    await expect(promise).rejects.toThrow('1006');
    expect(opts.onError).not.toHaveBeenCalled();
  });

  it('clears the keepalive and reports onError when the server closes after open', async () => {
    const { fake, opts, promise } = openProvider();
    fake.readyState = WebSocket.OPEN;
    fake.onopen?.();
    await promise;
    vi.advanceTimersByTime(4000);
    expect(keepalives(fake)).toBe(1);

    fake.onclose?.({ code: 1011 } as CloseEvent);
    expect(opts.onError).toHaveBeenCalledTimes(1);
    expect(String(opts.onError.mock.calls[0]?.[0])).toContain('1011');
    vi.advanceTimersByTime(12000);
    expect(keepalives(fake)).toBe(1); // interval is dead — no leaked keepalive
  });

  it('rejects and closes the socket when the open times out', async () => {
    const { fake, promise } = openProvider();
    let settled: unknown = null;
    promise.then(
      () => {
        settled = 'opened';
      },
      (e: unknown) => {
        settled = e;
      },
    );
    await vi.advanceTimersByTimeAsync(9999);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBeInstanceOf(Error);
    expect(String(settled)).toMatch(/timed out/i);
    expect(fake.closed).toBe(true);
  });

  it('does not time out or close the socket once opened', async () => {
    const { fake, promise } = openProvider();
    fake.readyState = WebSocket.OPEN;
    fake.onopen?.();
    const stream = await promise;
    await vi.advanceTimersByTimeAsync(30000);
    expect(fake.closed).toBe(false);
    stream.close();
  });

  it('closes the socket on a pre-open error rejection', async () => {
    const { fake, opts, promise } = openProvider();
    fake.onerror?.(new Error('boom'));
    await expect(promise).rejects.toThrow('failed to open');
    expect(fake.closed).toBe(true);
    expect(opts.onError).not.toHaveBeenCalled();
  });

  it('teardown close() detaches onclose so it never reports a spurious error', async () => {
    const { fake, opts, promise } = openProvider();
    fake.readyState = WebSocket.OPEN;
    fake.onopen?.();
    const stream = await promise;
    stream.close();
    fake.onclose?.({ code: 1000 } as CloseEvent);
    expect(opts.onError).not.toHaveBeenCalled();
  });
});
