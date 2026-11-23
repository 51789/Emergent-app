import { checkPassword, isValidEmail } from '../validation';

describe('isValidEmail', () => {
  it('accepts normal addresses and rejects obvious mistakes', () => {
    expect(isValidEmail('mario.rossi@example.com')).toBe(true);
    expect(isValidEmail('  a@b.co ')).toBe(true);
    expect(isValidEmail('mario@')).toBe(false);
    expect(isValidEmail('mario rossi@example.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('checkPassword', () => {
  it('requires strength only when asked', () => {
    expect(checkPassword('', false)).toBe('required');
    expect(checkPassword('abc', false)).toBeNull();
    expect(checkPassword('abc', true)).toBe('tooShort');
    expect(checkPassword('abcdefgh', true)).toBeNull();
  });
});
