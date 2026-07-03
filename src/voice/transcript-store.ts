export type SessionState = 'recording' | 'finalizing' | 'closed';

/**
 * Accumulates streaming transcript results with the two invariants the dot UI
 * depends on:
 *  - finals are APPENDED (never replace prior text) so "tap to add more" works;
 *  - once finalizing/closed, late interims are ignored and once closed even
 *    late finals are dropped — so the bubble can't twitch after the user stops.
 */
export class TranscriptStore {
  private _committedText = '';
  private _interimText = '';
  private _state: SessionState = 'recording';

  get currentState(): SessionState {
    return this._state;
  }

  /** Live, not-yet-final text. Accepted only while recording. */
  pushInterim(text: string): boolean {
    if (this._state !== 'recording') return false;
    this._interimText = text;
    return true;
  }

  /** Finalized segment — appended. Accepted while recording or finalizing. */
  pushFinal(text: string): boolean {
    if (this._state === 'closed') return false;
    const t = text.trim();
    if (t) this._committedText = this._committedText ? `${this._committedText} ${t}` : t;
    this._interimText = '';
    return true;
  }

  beginFinalize(): void {
    if (this._state === 'recording') this._state = 'finalizing';
  }

  close(): void {
    this._state = 'closed';
    this._interimText = '';
  }

  /** The persisted text — committed finals only. */
  get text(): string {
    return this._committedText;
  }

  get display(): { committed: string; interim: string } {
    return { committed: this._committedText, interim: this._interimText };
  }

  isEmpty(): boolean {
    return this._committedText.trim().length === 0;
  }
}
