import type { VoiceHost, VoiceModule, VoiceSession } from '../core/voice-contract';
import { createAudioCapture } from './capture/audio';
import { createDeepgramProvider } from './transcription/deepgram';
import { resolveToken } from './transcription/token';
import { noopSession, startSession } from './session';
import { createDot } from './ui/dot';

async function start(host: VoiceHost): Promise<VoiceSession> {
  // Abort gates at EVERY stage boundary (review #4): before any side
  // effect, after the (abortable) token mint, and inside startSession before
  // socket and mic acquisition.
  if (host.signal?.aborted) return noopSession;
  let token: string;
  try {
    token = await resolveToken(host.config, { ...(host.signal ? { signal: host.signal } : {}) });
  } catch (err) {
    if (host.signal?.aborted) return noopSession; // teardown, not a failure
    host.logger.warn('voice token resolution failed', err);
    host.degradeToText();
    return noopSession;
  }
  if (host.signal?.aborted) return noopSession;

  const dot = createDot(host.mount);
  const session = await startSession(host, {
    capture: createAudioCapture(),
    provider: createDeepgramProvider(token),
    view: dot,
  });
  dot.onStop = (): void => void session.stop();
  return session;
}

const voiceModule: VoiceModule = { start };
export default voiceModule;
