export function download(content: string, filename: string, type = 'text/markdown'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  // Deliberately DETACHED: modern browsers download from unattached anchors,
  // and a detached node's click never propagates to document — an attached
  // one would hit the armed annotate handler and place a bogus pin.
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Clipboard failure is non-fatal: the file download is the primary channel and
// the confirmation copy adjusts its message when the clipboard was unavailable.
//
// ONE clipboard, ONE page-lifetime in-flight write (0.10.0 review #11, #12).
// Two constraints shaped this and ruled a queue out: WebKit rejects writes
// that start behind an async boundary (the user activation is gone by then),
// so every INITIATED write must begin synchronously under its gesture; and a
// write the engine never settles must not wedge the page. So: at most one
// write is in flight. A caller with the SAME content shares its result (a
// retry of the same artifact is the same delivery); different content while
// busy fails fast — refused, never reordered, so a stale write can never land
// after a newer artifact was delivered. The settle bound is ELAPSED time
// checked synchronously at share time — never a timer, which a backgrounded
// page suspends past any wall-clock promise (0.10.0 review #13) — and a late
// settle simply drains the slot.
const CLIP_SETTLE_MS = 3000;
let inFlight: { content: string; p: Promise<boolean>; at: number } | null = null;

async function rawCopy(content: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      return true;
    }
  } catch {
    /* degrade below */
  }
  return false;
}

export function copyToClipboard(content: string): Promise<boolean> {
  if (inFlight) {
    if (performance.now() - inFlight.at < CLIP_SETTLE_MS && inFlight.content === content)
      return inFlight.p;
    return Promise.resolve(false);
  }
  const rec = { content, at: performance.now(), p: Promise.resolve(false) };
  rec.p = rawCopy(content).then((ok) => {
    if (inFlight === rec) inFlight = null;
    return ok;
  });
  inFlight = rec;
  return rec.p;
}
