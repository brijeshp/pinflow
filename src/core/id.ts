const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function createId(prefix = 'cmt'): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${out}`;
}
