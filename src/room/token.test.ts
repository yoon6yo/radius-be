import { generateToken, normalizeToken, isValidToken } from './token';

const ALPHABET = 'ABCDEFGHIJKMNPQRSTUVWXYZ23456789';

describe('generateToken', () => {
  it('returns a 6-character string', () => {
    expect(generateToken()).toHaveLength(6);
  });

  it('only uses characters from ALPHABET', () => {
    for (let i = 0; i < 50; i++) {
      const token = generateToken();
      for (const char of token) {
        expect(ALPHABET).toContain(char);
      }
    }
  });

  it('does not produce 0, 1, L, O', () => {
    for (let i = 0; i < 100; i++) {
      const token = generateToken();
      expect(token).not.toMatch(/[01LO]/);
    }
  });

  it('generates distinct tokens (collision resistance)', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken()));
    expect(tokens.size).toBeGreaterThan(190);
  });
});

describe('normalizeToken', () => {
  it('converts to uppercase', () => {
    expect(normalizeToken('abcdef')).toBe('ABCDEF');
  });

  it('trims whitespace', () => {
    expect(normalizeToken('  ABC234  ')).toBe('ABC234');
  });

  it('handles both at once', () => {
    expect(normalizeToken(' ab2cd3 ')).toBe('AB2CD3');
  });
});

describe('isValidToken', () => {
  it('accepts a valid generated token', () => {
    const token = generateToken();
    expect(isValidToken(token)).toBe(true);
  });

  it('accepts lowercase of valid characters (case-insensitive)', () => {
    expect(isValidToken('abcdef')).toBe(true);
    expect(isValidToken('mnpqrs')).toBe(true);
  });

  it('accepts tokens containing I (valid ALPHABET char)', () => {
    expect(isValidToken('AIBCDE')).toBe(true);
    expect(isValidToken('aibcde')).toBe(true);
  });

  it('rejects token with O (visually confusing)', () => {
    expect(isValidToken('ABCDO2')).toBe(false);
  });

  it('rejects token with L (visually confusing)', () => {
    expect(isValidToken('ABCDL2')).toBe(false);
  });

  it('rejects token with 0 (visually confusing)', () => {
    expect(isValidToken('ABCD02')).toBe(false);
  });

  it('rejects token with 1 (visually confusing)', () => {
    expect(isValidToken('ABCD12')).toBe(false);
  });

  it('rejects token shorter than 6 chars', () => {
    expect(isValidToken('ABCDE')).toBe(false);
  });

  it('rejects token longer than 6 chars', () => {
    expect(isValidToken('ABCDEFG')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidToken('')).toBe(false);
  });

  it('rejects token with spaces inside', () => {
    expect(isValidToken('AB CD2')).toBe(false);
  });

  it('accepts token with surrounding whitespace (trims before checking)', () => {
    expect(isValidToken('  ABCD23  ')).toBe(true);
  });
});
