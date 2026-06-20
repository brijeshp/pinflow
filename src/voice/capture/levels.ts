// Collapse FFT frequency-bin magnitudes (0..255) into N normalized band levels
// (0..1) for the waveform bars. Pure — driven by the capture rAF loop.
export function computeLevels(freq: Uint8Array, bands: number): number[] {
  if (bands <= 0) return [];
  const out: number[] = [];
  const size = Math.max(1, Math.floor(freq.length / bands));
  for (let b = 0; b < bands; b++) {
    const start = b * size;
    const end = b === bands - 1 ? freq.length : start + size;
    let sum = 0;
    for (let i = start; i < end; i++) sum += freq[i] ?? 0;
    const count = Math.max(1, end - start);
    out.push(sum / count / 255);
  }
  return out;
}
