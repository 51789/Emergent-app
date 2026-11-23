const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;

export function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export type PasswordProblem = 'required' | 'tooShort' | null;

/** `requireStrength` is false for sign-in (we only check it is not empty). */
export function checkPassword(value: string, requireStrength: boolean): PasswordProblem {
  if (!value) return 'required';
  if (requireStrength && value.length < MIN_PASSWORD_LENGTH) return 'tooShort';
  return null;
}
