import type { SessionView } from '../types';

export interface DotUI extends SessionView {
  /** Mutable — wired to session.stop() once the session exists. */
  onStop: () => void;
}

const BAR_COUNT = 5;

/**
 * The in-page voice dot: a recording indicator, a 5-bar waveform, the live
 * transcript (committed in an aria-live log; interim aria-hidden), and a Stop
 * button. All text is set via textContent (never innerHTML).
 */
export function createDot(mount: HTMLElement): DotUI {
  mount.style.pointerEvents = 'auto';

  const card = document.createElement('div');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Voice feedback');
  card.style.cssText = [
    'font:14px/1.4 system-ui,sans-serif',
    'background:#0c1f26',
    'color:#eaf6f4',
    'padding:10px 12px',
    'border-radius:12px',
    'box-shadow:0 6px 24px rgba(0,0,0,.35)',
    'max-width:280px',
    'display:flex',
    'flex-direction:column',
    'gap:8px',
  ].join(';');

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:8px;height:24px';

  const rec = document.createElement('span');
  rec.setAttribute('aria-hidden', 'true');
  rec.style.cssText = 'width:10px;height:10px;border-radius:50%;background:#ff5a5a;flex:0 0 auto';

  const wave = document.createElement('div');
  wave.setAttribute('aria-hidden', 'true');
  wave.style.cssText = 'display:flex;align-items:center;gap:3px;height:24px';
  const bars: HTMLDivElement[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = document.createElement('div');
    bar.style.cssText =
      'width:3px;height:20px;border-radius:2px;background:#2fd6c3;transform:scaleY(.12);transform-origin:center';
    wave.appendChild(bar);
    bars.push(bar);
  }
  row.append(rec, wave);

  const log = document.createElement('div');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  log.style.cssText = 'min-height:20px;max-height:120px;overflow:auto;word-break:break-word';
  const committedEl = document.createElement('span');
  const interimEl = document.createElement('span');
  interimEl.setAttribute('aria-hidden', 'true');
  interimEl.style.cssText = 'color:#8fb6b0';
  log.append(committedEl, interimEl);

  const stop = document.createElement('button');
  stop.type = 'button';
  stop.textContent = 'Stop';
  stop.setAttribute('aria-label', 'Stop recording and save');
  stop.style.cssText = [
    'align-self:flex-end',
    'min-height:24px',
    'padding:4px 12px',
    'border:0',
    'border-radius:8px',
    'background:#2fd6c3',
    'color:#06231f',
    'font:600 13px system-ui,sans-serif',
    'cursor:pointer',
  ].join(';');

  card.append(row, log, stop);
  mount.appendChild(card);

  const ui: DotUI = {
    onStop: () => {},
    update(committed, interim) {
      committedEl.textContent = committed;
      interimEl.textContent = interim ? `${committed ? ' ' : ''}${interim}` : '';
    },
    setLevels(levels) {
      for (let i = 0; i < bars.length; i++) {
        const v = Math.min(1, Math.max(0.12, levels[i] ?? 0));
        bars[i]!.style.transform = `scaleY(${v})`;
      }
    },
  };
  stop.addEventListener('click', () => ui.onStop());
  return ui;
}
