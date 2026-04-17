const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function createId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `cmt_${out}`;
}
