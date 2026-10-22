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

/**
 * Misspelled domains seen at signup. An address like `x@gmial.com` passes the
 * shape check, so Supabase sends the confirmation email anyway and it bounces:
 * too many bounces and Supabase cuts the project off from its email service.
 */
const DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmal.com': 'gmail.com',
  'gmil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'gmail.fr': 'gmail.com', 'gmail.con': 'gmail.com',
  'gmail.cmo': 'gmail.com', 'gmail.comm': 'gmail.com', 'gmail.vom': 'gmail.com', 'gmail.xom': 'gmail.com',
  'gmail.ocm': 'gmail.com', 'gmaul.com': 'gmail.com', 'gmsil.com': 'gmail.com', 'gmail.coml': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmil.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmial.fr': 'hotmail.fr', 'hotmai.fr': 'hotmail.fr',
  'hotmal.fr': 'hotmail.fr', 'hotmil.fr': 'hotmail.fr', 'hotmail.fe': 'hotmail.fr',
  'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.con': 'outlook.com', 'outlok.fr': 'outlook.fr',
  'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yaho.fr': 'yahoo.fr', 'yahooo.fr': 'yahoo.fr',
  'icloud.con': 'icloud.com', 'iclod.com': 'icloud.com', 'icoud.com': 'icloud.com', 'icloud.co': 'icloud.com',
  'iclould.com': 'icloud.com', 'icluod.com': 'icloud.com',
  'orange.fe': 'orange.fr', 'oange.fr': 'orange.fr', 'ornage.fr': 'orange.fr', 'wanadoo.fe': 'wanadoo.fr',
  'free.fe': 'free.fr', 'sfr.fe': 'sfr.fr', 'laposte.ne': 'laposte.net',
};

/** Top-level domains no real mail host uses, typed in place of `.com`. */
const TLD_TYPOS: Record<string, string> = { con: 'com', cpm: 'com', cmo: 'com', ocm: 'com', vom: 'com', xom: 'com', comm: 'com' };

/**
 * The address the user most likely meant when the domain is a known typo
 * (`x@gmial.com` → `x@gmail.com`), or null when nothing looks misspelled.
 */
export function emailTypoSuggestion(email: string): string | null {
  const v = email.trim();
  if (!isValidEmail(v)) return null;
  const at = v.lastIndexOf('@');
  const local = v.slice(0, at);
  const domain = v.slice(at + 1).toLowerCase();
  const fixed = DOMAIN_TYPOS[domain];
  if (fixed) return `${local}@${fixed}`;
  const dot = domain.lastIndexOf('.');
  const tld = TLD_TYPOS[domain.slice(dot + 1)];
  return tld ? `${local}@${domain.slice(0, dot)}.${tld}` : null;
}

/** Inline error for an email field, or null when valid/empty. */
export function emailError(language: Language, email: string): string | null {
  const v = email.trim();
  if (!v) return null; // don't nag on an untouched field
  if (!isValidEmail(v)) return tr(language, 'Adresse email invalide', 'Invalid email address');
  const suggestion = emailTypoSuggestion(v);
  if (suggestion) return tr(language, 'Vouliez-vous dire {0} ?', 'Did you mean {0}?', [suggestion]);
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
      language, 'Le mot de passe doit faire au moins {0} caractères', 'Password must be at least {0} characters', [PASSWORD_MIN],
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
      language, 'Au moins {0} caractères', 'At least {0} characters', [USERNAME_MIN],
    );
  }
  if (v.length > USERNAME_MAX) {
    return tr(language, 'Au plus {0} caractères', 'At most {0} characters', [USERNAME_MAX]);
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
