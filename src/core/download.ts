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
// ONE clipboard, ONE page-lifetime queue (0.10.0 review #11): the Clipboard
// API gives concurrent writes no ordering, so a stale artifact's slow write
// could land after a newer one was delivered — from ANY writer: the export
// confirmation, its retries, the public downloadExport(), even a replacement
// widget instance. Every write chains here, in initiation order; rawCopy
// never rejects, so the chain cannot wedge.
let clipChain: Promise<unknown> = Promise.resolve();

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
  const next = clipChain.then(() => rawCopy(content));
  clipChain = next;
  return next;
}
