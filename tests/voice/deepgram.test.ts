import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeepgramProvider } from '../../src/voice/transcription/deepgram';
import { FINALIZE_FRAME, KEEPALIVE_FRAME } from '../../src/voice/transcription/protocol';
import type { TranscriptionProvider, TranscriptionStream } from '../../src/voice/types';

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

describe('finalize handshake (P2.3)', () => {
  function resultFrame(over: Record<string, unknown> = {}): MessageEvent {
    return {
      data: JSON.stringify({
        type: 'Results',
        is_final: true,
        channel: { alternatives: [{ transcript: 'tail words' }] },
        ...over,
      }),
    } as MessageEvent;
  }

  async function openedStream(h: Harness): Promise<TranscriptionStream> {
    h.fake.readyState = WebSocket.OPEN;
    h.fake.onopen?.();
    return h.promise;
  }

  function trackedFinalize(stream: TranscriptionStream): { resolved: () => boolean } {
    let done = false;
    void stream.finalize().then(() => {
      done = true;
    });
    return { resolved: () => done };
  }

  it('resolves early when the from_finalize ack arrives', async () => {
    const h = openProvider();
    const stream = await openedStream(h);
    const fin = trackedFinalize(stream);
    expect(h.fake.sent).toContain(FINALIZE_FRAME);

    // An ordinary result must NOT resolve the handshake.
    h.fake.onmessage?.(resultFrame());
    await vi.advanceTimersByTimeAsync(50);
    expect(fin.resolved()).toBe(false);

    h.fake.onmessage?.(resultFrame({ from_finalize: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fin.resolved()).toBe(true);
    // The ack's final transcript still reaches the caller.
    expect(h.opts.onFinal).toHaveBeenCalledWith('tail words', undefined);
    stream.close();
  });

  it('resolves at the fallback ceiling when no ack arrives', async () => {
    const h = openProvider();
    const stream = await openedStream(h);
    const fin = trackedFinalize(stream);

    await vi.advanceTimersByTimeAsync(999);
    expect(fin.resolved()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(fin.resolved()).toBe(true);
    stream.close();
  });

  it('resolves when the socket closes while waiting', async () => {
    const h = openProvider();
    const stream = await openedStream(h);
    const fin = trackedFinalize(stream);

    h.fake.onclose?.({ code: 1006 } as CloseEvent);
    await vi.advanceTimersByTimeAsync(0);
    expect(fin.resolved()).toBe(true);
    stream.close();
  });
});
