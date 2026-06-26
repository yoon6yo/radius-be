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

// 토큰 형식: ALPHABET 문자 6자 (대소문자 구분 없이 검사)
const TOKEN_PATTERN = /^[A-HJKMNP-Z2-9]{6}$/i;

export function isValidToken(token: string): boolean {
  return TOKEN_PATTERN.test(token.trim());
}
