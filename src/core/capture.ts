import { LAYOUT_KEYS, normalizeDetails } from './details';
import type { CaptureDetails } from './types';

/** One bounded snapshot at capture, never on pointermove. No form values or network data. */
export function captureDetails(el: Element): CaptureDetails | undefined {
  const details: CaptureDetails = {
    bounds: el.getBoundingClientRect(),
  };
  if (el.parentElement) details.parentBounds = el.parentElement.getBoundingClientRect();
  const state: string[] = [];
  if (el instanceof HTMLInputElement && /^(checkbox|radio)$/.test(el.type))
    state.push('checked=' + el.checked);
  if ('disabled' in el && typeof el.disabled === 'boolean') state.push('disabled=' + el.disabled);
  if (el instanceof HTMLOptionElement) state.push('selected=' + el.selected);
  for (const key of ['expanded', 'selected', 'pressed', 'checked', 'disabled']) {
    const value = el.getAttribute('aria-' + key);
    if (value === 'true' || value === 'false') state.push(key + '=' + value);
  }
  if (state.length) details.state = state;
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let text = '',
    count = 0,
    node: Node | null;
  while ((node = walker.nextNode()) && count++ < 64 && text.length < 513) {
    if (
      !node.parentElement?.closest(
        'script,style,textarea,[contenteditable], [data-pinflow-private]',
      )
    )
      text += (node.textContent ?? '').slice(0, 513 - text.length);
  }
  if (text) details.text = text;
  if (node || text.length > 512) details.truncated = true;
  const cs = getComputedStyle(el);
  details.layout = {};
  for (const key of LAYOUT_KEYS) if (cs[key]) details.layout[key] = cs[key];
  // Rectangles describe rendered text fragments, not an inferred intended phrase.
  if (text && !details.truncated) {
    const range = el.ownerDocument.createRange();
    range.selectNodeContents(el);
    const rectangles = range.getClientRects();
    details.textRects = Array.from(rectangles).slice(0, 12);
    if (rectangles.length > 12) details.truncated = true;
  }
  if (el.tagName === 'CANVAS') details.limitation = 'canvas';
  else if (el.tagName === 'IFRAME') details.limitation = 'frame';
  else if (el.localName.includes('-') && !el.shadowRoot) details.limitation = 'shadow-host';
  return normalizeDetails(details);
}
