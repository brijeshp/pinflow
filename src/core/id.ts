const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Shared by comment ids and anonymous reviewer handles — one RNG, one alphabet. */
export function randomToken(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function createId(): string {
  return `cmt_${randomToken(9)}`;
}
