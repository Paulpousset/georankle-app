import {
  confirmPasswordError,
  emailError,
  isCommonPassword,
  isValidEmail,
  isValidUsername,
  passwordError,
  usernameError,
} from '../validation';

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('  user.name@example.com  ')).toBe(true); // trims
  });
  it('rejects malformed addresses', () => {
    for (const bad of ['', 'plainaddress', 'a@b', 'a@b.', '@b.co', 'a b@c.co', 'a@b c.co']) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });
});

describe('emailError', () => {
  it('returns null for an empty (untouched) field', () => {
    expect(emailError('en', '')).toBeNull();
  });
  it('flags an invalid address and stays null when valid', () => {
    expect(emailError('en', 'nope')).toBe('Invalid email address');
    expect(emailError('fr', 'nope')).toBe('Adresse email invalide');
    expect(emailError('en', 'ok@ok.com')).toBeNull();
  });
});

describe('passwordError', () => {
  it('is null when empty, flags too-short, passes at the minimum', () => {
    expect(passwordError('en', '')).toBeNull();
    expect(passwordError('en', '123')).toMatch(/at least/);
    expect(passwordError('en', '1234567')).toMatch(/at least/); // 7 chars < 8
    expect(passwordError('en', 'k7$mapple')).toBeNull(); // 8+ chars, not common
  });

  it('rejects common/breached passwords (the free HIBP stand-in)', () => {
    expect(passwordError('en', 'password')).toMatch(/too common/);
    expect(passwordError('en', 'PASSWORD')).toMatch(/too common/); // case-insensitive
    expect(passwordError('fr', 'azerty123')).toBe(
      'Ce mot de passe est trop courant, choisissez-en un autre',
    );
  });
});

describe('isCommonPassword', () => {
  it('matches the blocklist case-insensitively and lets strong passwords through', () => {
    expect(isCommonPassword('password123')).toBe(true);
    expect(isCommonPassword('  AzErTy  ')).toBe(true); // trims + lowercases
    expect(isCommonPassword('k7$mapple')).toBe(false);
  });
});

describe('confirmPasswordError', () => {
  it('only complains once a confirmation is typed and it differs', () => {
    expect(confirmPasswordError('en', 'abcdef', '')).toBeNull();
    expect(confirmPasswordError('en', 'abcdef', 'abcdeX')).toMatch(/do not match/);
    expect(confirmPasswordError('en', 'abcdef', 'abcdef')).toBeNull();
  });
});

describe('username validation', () => {
  it('isValidUsername enforces length and character rules', () => {
    expect(isValidUsername('ab')).toBe(false); // too short
    expect(isValidUsername('Léo 2')).toBe(true); // letters, accents, digits, space
    expect(isValidUsername('a'.repeat(21))).toBe(false); // too long
    expect(isValidUsername('bad/name')).toBe(false); // illegal char
    expect(isValidUsername('  ok_name-1  ')).toBe(true); // trims, allowed separators
  });

  it('usernameError returns null when empty and a message when invalid', () => {
    expect(usernameError('en', '')).toBeNull();
    expect(usernameError('en', 'ab')).toMatch(/At least/);
    expect(usernameError('en', 'good name')).toBeNull();
    expect(usernameError('fr', 'x@y')).toBe('Lettres, chiffres et espaces uniquement');
  });
});
