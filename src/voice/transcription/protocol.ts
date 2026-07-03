// Hand-rolled Deepgram streaming wire protocol. Kept dependency-free and tiny —
// the @deepgram/sdk is ~50 KB+ and would blow the voice budget.

export interface ListenParams {
  model: string;
  language: string;
}

export function buildListenUrl(p: ListenParams): string {
  const q = new URLSearchParams({
    model: p.model,
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    interim_results: 'true',
    endpointing: '300',
    smart_format: 'true',
    language: p.language,
  });
  return `wss://api.deepgram.com/v1/listen?${q.toString()}`;
}

// Text control frames (sent as WebSocket text messages).
export const KEEPALIVE_FRAME = JSON.stringify({ type: 'KeepAlive' });
export const FINALIZE_FRAME = JSON.stringify({ type: 'Finalize' });
export const CLOSE_STREAM_FRAME = JSON.stringify({ type: 'CloseStream' });

export type DeepgramMessage =
  | {
      type: 'results';
      transcript: string;
      isFinal: boolean;
      confidence?: number;
      /** Present (true) only on the Results frame acking a Finalize. */
      fromFinalize?: true;
    }
  | { type: 'metadata' }
  | { type: 'error'; detail: string }
  | { type: 'unknown' };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function firstAlternative(data: Record<string, unknown>): Record<string, unknown> | null {
  const channel = data['channel'];
  if (!isObject(channel)) return null;
  const alts = channel['alternatives'];
  if (!Array.isArray(alts) || !isObject(alts[0])) return null;
  return alts[0];
}

// Parse an untrusted WS frame. Returns null on malformed input so the caller can
// drop the frame and keep the last good transcript.
export function parseMessage(raw: string): DeepgramMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(data) || typeof data['type'] !== 'string') return null;

  switch (data['type']) {
    case 'Results': {
      const alt = firstAlternative(data);
      const transcript = alt && typeof alt['transcript'] === 'string' ? alt['transcript'] : '';
      const isFinal = data['is_final'] === true || data['speech_final'] === true;
      const rawConf = alt ? alt['confidence'] : undefined;
      const confidence = typeof rawConf === 'number' ? clamp01(rawConf) : undefined;
      return {
        type: 'results',
        transcript,
        isFinal,
        ...(confidence !== undefined && { confidence }),
        ...(data['from_finalize'] === true && { fromFinalize: true as const }),
      };
    }
    case 'Metadata':
      return { type: 'metadata' };
    case 'Error':
      return {
        type: 'error',
        detail: typeof data['description'] === 'string' ? data['description'] : 'error',
      };
    default:
      return { type: 'unknown' };
  }
}
