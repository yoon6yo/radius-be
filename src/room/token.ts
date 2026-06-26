import { randomBytes } from 'crypto';

// Excludes visually confusing characters: 0/O (zero/letter-O), 1/L (one/letter-L)
const ALPHABET = 'ABCDEFGHIJKMNPQRSTUVWXYZ23456789'; // 32 chars — 256 % 32 === 0, no modulo bias
const TOKEN_LENGTH = 6;

export function generateToken(): string {
  const bytes = randomBytes(TOKEN_LENGTH);
  return Array.from(bytes)
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join('');
}

export function normalizeToken(token: string): string {
  return token.toUpperCase().trim();
}
