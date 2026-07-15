import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioCapture } from '../../src/voice/capture/audio';

interface Fakes {
  track: { stop: ReturnType<typeof vi.fn> };
  ctxClose: ReturnType<typeof vi.fn>;
  revoke: ReturnType<typeof vi.fn>;
}

function install(opts: { addModuleError?: Error } = {}): Fakes {
  const track = { stop: vi.fn() };
  const stream = { getTracks: (): Array<typeof track> => [track] };
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });

  const ctxClose = vi.fn().mockResolvedValue(undefined);
  const addModule = opts.addModuleError
    ? vi.fn().mockRejectedValue(opts.addModuleError)
    : vi.fn().mockResolvedValue(undefined);

  class FakeAudioContext {
    state = 'running';
    audioWorklet = { addModule };
    destination = {};
    resume = vi.fn().mockResolvedValue(undefined);
    close = ctxClose;
    createMediaStreamSource(): { connect: ReturnType<typeof vi.fn> } {
      return { connect: vi.fn() };
    }
  }
  class FakeWorkletNode {
    port: { onmessage: unknown } = { onmessage: null };
    connect = vi.fn();
    disconnect = vi.fn();
  }
  const revoke = vi.fn();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:pinflow-test'),
    revokeObjectURL: revoke,
  });

  return { track, ctxClose, revoke };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createAudioCapture', () => {
  it('acquires and fully releases resources across start/stop', async () => {
    const fakes = install();
    const capture = createAudioCapture();
    await capture.start(vi.fn());
    capture.stop();
    expect(fakes.track.stop).toHaveBeenCalledTimes(1);
    expect(fakes.ctxClose).toHaveBeenCalledTimes(1);
    expect(fakes.revoke).toHaveBeenCalledWith('blob:pinflow-test');
  });

  it('releases the mic, context, and blob URL when addModule rejects (host CSP)', async () => {
    // If anything after getUserMedia throws — e.g. audioWorklet.addModule(blob:)
    // rejected by a host CSP that blocks blob: workers — everything acquired so
    // far must be released, or the OS mic indicator stays on for the page's life.
    const fakes = install({ addModuleError: new Error('CSP blocked blob: worker') });
    const capture = createAudioCapture();
    await expect(capture.start(vi.fn())).rejects.toThrow('CSP');
    expect(fakes.track.stop).toHaveBeenCalledTimes(1);
    expect(fakes.ctxClose).toHaveBeenCalledTimes(1);
    expect(fakes.revoke).toHaveBeenCalledWith('blob:pinflow-test');
  });

  it('stop() stays idempotent after a failed start', async () => {
    const fakes = install({ addModuleError: new Error('nope') });
    const capture = createAudioCapture();
    await expect(capture.start(vi.fn())).rejects.toThrow('nope');
    capture.stop();
    capture.stop();
    expect(fakes.track.stop).toHaveBeenCalledTimes(1);
  });
});
