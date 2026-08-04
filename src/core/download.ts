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
export async function copyToClipboard(content: string): Promise<boolean> {
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
