import { describe, expect, it } from 'vitest';
import { buildListenUrl, parseMessage } from '../../src/voice/transcription/protocol';

describe('buildListenUrl', () => {
  it('encodes the nova-3 linear16 16k streaming params', () => {
    const url = buildListenUrl({ model: 'nova-3', language: 'en' });
    expect(url).toContain('wss://api.deepgram.com/v1/listen?');
    expect(url).toContain('model=nova-3');
    expect(url).toContain('encoding=linear16');
    expect(url).toContain('sample_rate=16000');
    expect(url).toContain('interim_results=true');
    expect(url).toContain('endpointing=300');
  });
});

describe('parseMessage', () => {
  const results = (over: Record<string, unknown>): string =>
    JSON.stringify({
      type: 'Results',
      channel: { alternatives: [{ transcript: 'hello world', confidence: 0.97 }] },
      ...over,
    });

  it('parses an interim result', () => {
    expect(parseMessage(results({ is_final: false }))).toEqual({
      type: 'results',
      transcript: 'hello world',
      isFinal: false,
      confidence: 0.97,
    });
  });

  it('treats is_final or speech_final as final', () => {
    expect(parseMessage(results({ is_final: true }))?.type).toBe('results');
    expect((parseMessage(results({ speech_final: true })) as { isFinal: boolean }).isFinal).toBe(
      true,
    );
  });

  it('clamps out-of-range confidence', () => {
    const msg = parseMessage(
      results({ channel: { alternatives: [{ transcript: 'x', confidence: 1.5 }] } }),
    );
    expect(msg).toMatchObject({ confidence: 1 });
  });

  it('yields an empty transcript when alternatives are missing', () => {
    const msg = parseMessage(JSON.stringify({ type: 'Results', channel: {} }));
    expect(msg).toMatchObject({ type: 'results', transcript: '' });
  });

  it('maps Error and Metadata frames', () => {
    expect(parseMessage(JSON.stringify({ type: 'Error', description: 'boom' }))).toEqual({
      type: 'error',
      detail: 'boom',
    });
    expect(parseMessage(JSON.stringify({ type: 'Metadata' }))).toEqual({ type: 'metadata' });
  });

  it('returns null on malformed input (frame is dropped)', () => {
    expect(parseMessage('{ not json')).toBeNull();
    expect(parseMessage('42')).toBeNull();
    expect(parseMessage(JSON.stringify({ noType: true }))).toBeNull();
  });
});
