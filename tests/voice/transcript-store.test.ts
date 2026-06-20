import { describe, expect, it } from 'vitest';
import { TranscriptStore } from '../../src/voice/transcript-store';

describe('TranscriptStore', () => {
  it('appends finals with a space and trims', () => {
    const s = new TranscriptStore();
    s.pushFinal('  hello  ');
    s.pushFinal('world');
    expect(s.text).toBe('hello world');
  });

  it('overwrites the interim tail without touching committed text', () => {
    const s = new TranscriptStore();
    s.pushFinal('hello');
    s.pushInterim('wor');
    s.pushInterim('world');
    expect(s.display).toEqual({ committed: 'hello', interim: 'world' });
    expect(s.text).toBe('hello');
  });

  it('clears the interim tail when a final lands', () => {
    const s = new TranscriptStore();
    s.pushInterim('wor');
    s.pushFinal('world');
    expect(s.display.interim).toBe('');
  });

  it('ignores interims once finalizing but still accepts the trailing final', () => {
    const s = new TranscriptStore();
    s.pushFinal('hello');
    s.beginFinalize();
    expect(s.pushInterim('late')).toBe(false);
    expect(s.pushFinal('world')).toBe(true);
    expect(s.text).toBe('hello world');
  });

  it('ignores everything once closed (no post-stop twitch)', () => {
    const s = new TranscriptStore();
    s.pushFinal('hello');
    s.close();
    expect(s.pushInterim('x')).toBe(false);
    expect(s.pushFinal('y')).toBe(false);
    expect(s.text).toBe('hello');
  });

  it('reports empty when only interim text exists', () => {
    const s = new TranscriptStore();
    s.pushInterim('typing...');
    expect(s.isEmpty()).toBe(true);
    s.pushFinal('real');
    expect(s.isEmpty()).toBe(false);
  });
});
