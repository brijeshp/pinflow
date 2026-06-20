import type { VoiceHost, VoiceModule, VoiceSession } from '../core/voice-contract';
import { createAudioCapture } from './capture/audio';
import { createDeepgramProvider } from './transcription/deepgram';
import { resolveToken } from './transcription/token';
import { startSession } from './session';
import { createDot } from './ui/dot';

const NOOP_SESSION: VoiceSession = { stop: () => Promise.resolve(), dispose: () => {} };

async function start(host: VoiceHost): Promise<VoiceSession> {
  let token: string;
  try {
    token = await resolveToken(host.config);
  } catch (err) {
    host.logger.warn('voice token resolution failed', err);
    host.degradeToText();
    return NOOP_SESSION;
  }

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
