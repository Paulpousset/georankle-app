/**
 * Tiny, dependency-free form validators shared across the auth + profile screens.
 *
 * Each validator returns `null` when the value is valid, or a localised error
 * message ready to render inline. Keeping them pure (no React, no i18n context)
 * makes them trivial to unit-test and reuse from any screen.
 */
import { tr } from '../i18n';
import type { Language } from '../types';

/** Practical email shape check — not RFC-perfect, but rejects the obvious typos. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;

/**
 * Dependency-free, offline stand-in for Supabase's "leaked password protection"
 * (the HaveIBeenPwned check, which is a paid-plan feature). It won't catch every
 * breached password, but it rejects the handful attackers try first — which is
 * where most of the real-world risk lives. Compared case-insensitively.
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password!', 'password123', 'passw0rd',
  '12345678', '123456789', '1234567890', '123123123', '00000000', '11111111',
  'qwerty', 'qwertyui', 'qwerty123', 'azerty', 'azertyui', 'azerty123',
  'abc123', 'abcd1234', 'abcdefgh', 'iloveyou', 'letmein', 'welcome',
  'admin', 'administrator', 'changeme', 'motdepasse', 'football', 'baseball',
  'sunshine', 'princess', 'dragon', 'monkey', 'superman', 'starwars',
]);

/** True when the password is on the common/breached blocklist above. */
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.trim().toLowerCase());
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Inline error for an email field, or null when valid/empty. */
export function emailError(language: Language, email: string): string | null {
  const v = email.trim();
  if (!v) return null; // don't nag on an untouched field
  if (!isValidEmail(v)) return tr(language, 'Adresse email invalide', 'Invalid email address');
  return null;
}

/**
 * Inline error for a password field, or null when valid/empty. Enforces a
 * minimum length and rejects the most common/breached passwords. Intended for
 * account creation — login stays lenient so older, shorter passwords still work.
 */
export function passwordError(language: Language, password: string): string | null {
  if (!password) return null;
  if (password.length < PASSWORD_MIN) {
    return tr(
      language,
      `Le mot de passe doit faire au moins ${PASSWORD_MIN} caractères`,
      `Password must be at least ${PASSWORD_MIN} characters`,
    );
  }
  if (isCommonPassword(password)) {
    return tr(
      language,
      'Ce mot de passe est trop courant, choisissez-en un autre',
      'This password is too common, please choose another',
    );
  }
  return null;
}

/** Inline error for a "confirm password" field, or null when valid/empty. */
export function confirmPasswordError(
  language: Language,
  password: string,
  confirm: string,
): string | null {
  if (!confirm) return null;
  if (password !== confirm) {
    return tr(language, 'Les mots de passe ne correspondent pas', 'Passwords do not match');
  }
  return null;
}

/**
 * Inline error for a username, or null when valid/empty. Allows letters, digits,
 * spaces and a few separators; bounded length so it fits the UI everywhere.
 */
export function usernameError(language: Language, username: string): string | null {
  const v = username.trim();
  if (!v) return null;
  if (v.length < USERNAME_MIN) {
    return tr(
      language,
      `Au moins ${USERNAME_MIN} caractères`,
      `At least ${USERNAME_MIN} characters`,
    );
  }
  if (v.length > USERNAME_MAX) {
    return tr(language, `Au plus ${USERNAME_MAX} caractères`, `At most ${USERNAME_MAX} characters`);
  }
  if (!/^[\p{L}\p{N} _.-]+$/u.test(v)) {
    return tr(
      language,
      'Lettres, chiffres et espaces uniquement',
      'Letters, numbers and spaces only',
    );
  }
  return null;
}

/** True when a username passes every rule above (and is non-empty). */
export function isValidUsername(username: string): boolean {
  const v = username.trim();
  return v.length >= USERNAME_MIN && v.length <= USERNAME_MAX && /^[\p{L}\p{N} _.-]+$/u.test(v);
}
