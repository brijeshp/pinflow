import { describe, expect, it, vi } from 'vitest';
import { startSession, type SessionDeps } from '../../src/voice/session';
import type { VoiceHost } from '../../src/core/voice-contract';
import type {
  AudioCapture,
  TranscriptionProvider,
  TranscriptionStream,
} from '../../src/voice/types';

function makeHost(): VoiceHost & {
  committed: Array<{ text: string; voice: unknown }>;
  discarded: number;
  degraded: number;
} {
  const committed: Array<{ text: string; voice: unknown }> = [];
  let discarded = 0;
  let degraded = 0;
  return {
    config: {},
    mount: document.createElement('div'),
    anchor: {} as VoiceHost['anchor'],
    route: '/',
    commit: (p) => committed.push(p),
    discard: () => {
      discarded += 1;
    },
    degradeToText: () => {
      degraded += 1;
    },
    logger: { warn: () => {}, error: () => {} },
    get committed() {
      return committed;
    },
    get discarded() {
      return discarded;
    },
    get degraded() {
      return degraded;
    },
  };
}

interface FakeStream extends TranscriptionStream {
  emitInterim(t: string): void;
  emitFinal(t: string, confidence?: number): void;
  finalized: boolean;
  closed: boolean;
}

function makeProvider(): { provider: TranscriptionProvider; stream: () => FakeStream } {
  let captured: {
    onInterim: (t: string) => void;
    onFinal: (t: string, confidence?: number) => void;
  } | null = null;
  let theStream: FakeStream | null = null;
  const provider: TranscriptionProvider = {
    engine: 'fake:test',
    open(opts) {
      captured = opts;
      theStream = {
        sendPcm: () => {},
        finalize: () => Promise.resolve(),
        close: () => {
          theStream!.closed = true;
        },
        emitInterim: (t) => captured!.onInterim(t),
        emitFinal: (t, confidence) => captured!.onFinal(t, confidence),
        finalized: false,
        closed: false,
      };
      return Promise.resolve(theStream);
    },
  };
  return { provider, stream: () => theStream! };
}

function makeCapture(opts: { fail?: boolean } = {}): AudioCapture & { stopped: number } {
  let stopped = 0;
  return {
    start: () => (opts.fail ? Promise.reject(new Error('NotAllowed')) : Promise.resolve()),
    stop: () => {
      stopped += 1;
    },
    get stopped() {
      return stopped;
    },
  };
}

function baseDeps(over: Partial<SessionDeps> = {}): SessionDeps {
  const { provider } = makeProvider();
  return {
    capture: makeCapture(),
    provider,
    view: { update: () => {}, setLevels: () => {} },
    now: () => 1000,
    ...over,
  };
}

describe('startSession', () => {
  it('streams transcripts then commits the finalized text on stop', async () => {
    const host = makeHost();
    const { provider, stream } = makeProvider();
    const view = { update: vi.fn(), setLevels: vi.fn() };
    let t = 0;
    const session = await startSession(host, {
      ...baseDeps(),
      provider,
      view,
      now: () => (t += 1000),
    });
    stream().emitFinal('hello');
    stream().emitInterim('wor');
    await session.stop();
    expect(view.update).toHaveBeenCalledWith('hello', 'wor');
    expect(host.committed).toHaveLength(1);
    expect(host.committed[0]?.text).toBe('hello');
    expect(host.committed[0]?.voice).toMatchObject({ engine: 'fake:test' });
  });

  it('discards the dot when nothing was said', async () => {
    const host = makeHost();
    const session = await startSession(host, baseDeps());
    await session.stop();
    expect(host.discarded).toBe(1);
    expect(host.committed).toHaveLength(0);
  });

  it('degrades to text when the mic is denied (and never commits)', async () => {
    const host = makeHost();
    const session = await startSession(host, {
      ...baseDeps(),
      capture: makeCapture({ fail: true }),
    });
    await session.stop();
    expect(host.degraded).toBe(1);
    expect(host.committed).toHaveLength(0);
  });

  it('stops the capture when capture.start fails partway (mic never left live)', async () => {
    // Defense in depth for the partial-acquisition leak: even if the capture's
    // own cleanup regressed, the session must call the (idempotent) stop().
    const host = makeHost();
    const capture = makeCapture({ fail: true });
    await startSession(host, { ...baseDeps(), capture });
    expect(capture.stopped).toBeGreaterThanOrEqual(1);
    expect(host.degraded).toBe(1);
  });

  it('ignores transcript frames that arrive after stop (no post-stop twitch)', async () => {
    const host = makeHost();
    const { provider, stream } = makeProvider();
    const session = await startSession(host, { ...baseDeps(), provider });
    stream().emitFinal('hello');
    await session.stop();
    stream().emitFinal('late'); // must be ignored
    expect(host.committed[0]?.text).toBe('hello');
  });

  it('releases the mic on stop and is idempotent', async () => {
    const host = makeHost();
    const capture = makeCapture();
    const session = await startSession(host, { ...baseDeps(), capture });
    await session.stop();
    await session.stop();
    expect(capture.stopped).toBeGreaterThanOrEqual(1);
    expect(host.committed.length + host.discarded).toBe(1); // settled exactly once
  });

  it('persists the MINIMUM confidence across finals (pessimistic aggregate)', async () => {
    const host = makeHost();
    const { provider, stream } = makeProvider();
    const session = await startSession(host, { ...baseDeps(), provider });
    stream().emitFinal('hello', 0.9);
    stream().emitFinal('there', 0.4);
    stream().emitFinal('world', 0.8);
    await session.stop();
    expect(host.committed[0]?.voice).toMatchObject({ confidence: 0.4 });
  });

  it('omits confidence entirely when no final carried one', async () => {
    const host = makeHost();
    const { provider, stream } = makeProvider();
    const session = await startSession(host, { ...baseDeps(), provider });
    stream().emitFinal('hello');
    await session.stop();
    const voice = host.committed[0]?.voice as Record<string, unknown>;
    expect('confidence' in voice).toBe(false);
  });

  it('dispose() releases the mic and best-effort persists committed text as interim', async () => {
    const host = makeHost();
    const { provider, stream } = makeProvider();
    const capture = makeCapture();
    const session = await startSession(host, { ...baseDeps(), provider, capture });
    stream().emitFinal('partial thought');
    session.dispose();
    session.dispose(); // idempotent
    expect(capture.stopped).toBeGreaterThanOrEqual(1);
    expect(host.committed).toHaveLength(1);
    expect(host.committed[0]?.voice).toMatchObject({ interim: true });
  });
});
