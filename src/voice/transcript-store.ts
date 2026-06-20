export type SessionState = 'recording' | 'finalizing' | 'closed';

/**
 * Accumulates streaming transcript results with the two invariants the dot UI
 * depends on:
 *  - finals are APPENDED (never replace prior text) so "tap to add more" works;
 *  - once finalizing/closed, late interims are ignored and once closed even
 *    late finals are dropped — so the bubble can't twitch after the user stops.
 */
export class TranscriptStore {
  private committedText = '';
  private interimText = '';
  private state: SessionState = 'recording';

  get currentState(): SessionState {
    return this.state;
  }

  /** Live, not-yet-final text. Accepted only while recording. */
  pushInterim(text: string): boolean {
    if (this.state !== 'recording') return false;
    this.interimText = text;
    return true;
  }

  /** Finalized segment — appended. Accepted while recording or finalizing. */
  pushFinal(text: string): boolean {
    if (this.state === 'closed') return false;
    const t = text.trim();
    if (t) this.committedText = this.committedText ? `${this.committedText} ${t}` : t;
    this.interimText = '';
    return true;
  }

  beginFinalize(): void {
    if (this.state === 'recording') this.state = 'finalizing';
  }

  close(): void {
    this.state = 'closed';
    this.interimText = '';
  }

  /** The persisted text — committed finals only. */
  get text(): string {
    return this.committedText;
  }

  get display(): { committed: string; interim: string } {
    return { committed: this.committedText, interim: this.interimText };
  }

  isEmpty(): boolean {
    return this.committedText.trim().length === 0;
  }
}
