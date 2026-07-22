import { showAlert } from '../lib/alert';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
  Coins,
  Globe2,
  KeyRound,
  LayoutGrid,
  LogIn,
  Lock,
  Mail,
  User,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react-native';

import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { a11yButton } from '../lib/a11y';
import { log } from '../lib/log';
import {
  confirmPasswordError,
  emailError,
  isValidEmail,
  isValidUsername,
  passwordError,
  usernameError,
  USERNAME_MAX,
} from '../lib/validation';
import { FONTS } from '../theme/typography';
import { PALETTE } from '../theme/colors';
import type { Language } from '../types';

type Mode = 'login' | 'signup' | 'forgot' | 'profile';

/** Where the password-reset email link sends the user to set a new password. */
const RESET_REDIRECT_URL = 'https://playgeog.com/reset-password.html';

interface AuthProps {
  onAuthSuccess: () => void;
  language: Language;
  /** Which screen to open on first mount (banner CTA opens signup). */
  initialMode?: 'login' | 'signup';
}

const Auth = ({ onAuthSuccess, language, initialMode = 'login' }: AuthProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [bestClassic, setBestClassic] = useState<number | null>(null);
  const [bestStreak, setBestStreak] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [mode, setMode] = useState<Mode>(initialMode);

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);

  // Live inline validation. Helpers return null for an empty field; `submitted`
  // forces the email/password "required" feedback after a submit attempt.
  const emailErr = emailError(language, email);
  const passwordErr = passwordError(language, password);
  const confirmErr = confirmPasswordError(language, password, confirmPassword);
  const usernameErr = usernameError(language, username);

  // Login only requires a non-empty password — the min-length rule is enforced
  // at account creation, not on existing accounts (older accounts may be shorter).
  const canSubmitLogin = isValidEmail(email) && password.length > 0;
  const canSubmitSignup =
    isValidEmail(email) &&
    isValidUsername(username) &&
    password.length > 0 &&
    passwordErr === null &&
    password === confirmPassword &&
    confirmPassword.length > 0;
  const canSubmit = mode === 'login' ? canSubmitLogin : canSubmitSignup;

  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setMode('profile');
        setEmail(session.user.email ?? '');
        fetchProfile(session.user.id);
      }
    };
    checkUser();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();

    if (profile) setUsername(profile.username || '');

    const { data: scores } = await supabase
      .from('scores')
      .select('game_mode, score')
      .eq('user_id', userId);

    if (scores) {
      const classicScores = scores.filter((s) => s.game_mode === 'classic').map((s) => s.score);
      const streakScores = scores.filter((s) => s.game_mode === 'streak').map((s) => s.score);

      // Classic now stores a 0–100 efficiency (higher is better); filter out
      // legacy raw-points rows (>100) as ClassicGame/Leaderboard do. Streak is
      // a plain chain length, higher is better.
      const classicEff = classicScores.filter((s) => s <= 100);
      if (classicEff.length > 0) setBestClassic(Math.max(...classicEff));
      if (streakScores.length > 0) setBestStreak(Math.max(...streakScores));
    }
  };

  const t = {
    fr: {
      email: 'Email',
      password: 'Mot de passe',
      confirmPassword: 'Confirmer le mot de passe',
      username: 'Pseudo',
      login: 'Se connecter',
      signup: "S'inscrire",
      noAccount: "Pas de compte ? S'inscrire",
      haveAccount: 'Déjà un compte ? Se connecter',
      forgot: 'Mot de passe oublié ?',
      resetTitle: 'Mot de passe oublié',
      resetIntro:
        'Saisis ton email : on t’envoie un lien pour choisir un nouveau mot de passe.',
      sendReset: 'Envoyer le lien',
      resetSentTitle: 'Email envoyé !',
      resetSentBody:
        'Vérifie ta boîte de réception (et les spams) pour réinitialiser ton mot de passe.',
      backToLogin: 'Retour à la connexion',
      error: 'Erreur',
      success: 'Succès',
      checkEmail: "Vérifiez vos emails pour confirmer l'inscription !",
      passwordsDontMatch: 'Les mots de passe ne correspondent pas',
      invalidEmail: 'Adresse email invalide',
      invalidUsername: 'Pseudo invalide',
      joinTitle: 'Rejoins GeoGames',
      benefitsTitle: 'Crée ton compte pour :',
      benefit1: 'Sauvegarder ta progression et tes records',
      benefit2: 'Jouer en ligne en 1v1 et multijoueur',
      benefit3: 'Gagner des pièces et débloquer la boutique',
      benefit4: 'Te faire des amis et grimper au classement',
    },
    en: {
      email: 'Email',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      username: 'Username',
      login: 'Login',
      signup: 'Sign Up',
      noAccount: "Don't have an account? Sign up",
      haveAccount: 'Already have an account? Login',
      forgot: 'Forgot password?',
      resetTitle: 'Forgot password',
      resetIntro: 'Enter your email and we’ll send you a link to choose a new password.',
      sendReset: 'Send link',
      resetSentTitle: 'Email sent!',
      resetSentBody: 'Check your inbox (and spam) to reset your password.',
      backToLogin: 'Back to login',
      error: 'Error',
      success: 'Success',
      checkEmail: 'Check your email for confirmation link!',
      passwordsDontMatch: 'Passwords do not match',
      invalidEmail: 'Invalid email address',
      invalidUsername: 'Invalid username',
      joinTitle: 'Join GeoGames',
      benefitsTitle: 'Create an account to:',
      benefit1: 'Save your progress and records',
      benefit2: 'Play online 1v1 and multiplayer',
      benefit3: 'Earn coins and unlock the shop',
      benefit4: 'Add friends and climb the leaderboard',
    },
  }[language];

  async function updateUsername() {
    if (!isValidUsername(username)) {
      showAlert(t.error, usernameErr ?? t.invalidUsername);
      return;
    }
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, username: username.trim(), updated_at: new Date().toISOString() });

    if (error) showAlert(t.error, error.message);
    else showAlert(t.success, language === 'fr' ? 'Profil mis à jour !' : 'Profile updated!');
    setLoading(false);
  }

  async function signInWithEmail() {
    if (!isValidEmail(email)) {
      showAlert(t.error, t.invalidEmail);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      showAlert(
        t.error,
        error.message === 'Invalid login credentials'
          ? language === 'fr'
            ? 'Email ou mot de passe incorrect'
            : 'Invalid email or password'
          : error.message,
      );
    } else {
      onAuthSuccess();
    }
    setLoading(false);
  }

  async function sendPasswordReset() {
    if (!isValidEmail(email)) {
      showAlert(t.error, t.invalidEmail);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: RESET_REDIRECT_URL,
    });
    setLoading(false);
    if (error) {
      log.error('Password reset error:', error);
      showAlert(t.error, error.message);
      return;
    }
    // Always land on the confirmation screen — don't reveal whether the address
    // has an account (avoids leaking which emails are registered).
    track('password_reset_requested');
    setResetSent(true);
  }

  async function signUpWithEmail() {
    if (!isValidEmail(email)) {
      showAlert(t.error, t.invalidEmail);
      return;
    }
    if (!isValidUsername(username)) {
      showAlert(t.error, usernameErr ?? t.invalidUsername);
      return;
    }
    const pwErr = passwordError(language, password);
    if (pwErr) {
      showAlert(t.error, pwErr);
      return;
    }
    if (password !== confirmPassword) {
      showAlert(t.error, t.passwordsDontMatch);
      return;
    }

    setLoading(true);
    const trimmedUsername = username.trim();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // Stash the chosen username in user metadata so it survives the
      // email-confirmation round-trip; the profiles row is written below (session
      // present) or by the UsernameGate right after the confirmed first login.
      options: { data: { username: trimmedUsername } },
    });

    if (error) {
      log.error('Signup error details:', error);
      showAlert(t.error, error.message);
    } else if (data?.session) {
      // Email confirmation disabled: the session exists, persist the username now.
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ id: data.session.user.id, username: trimmedUsername, updated_at: new Date().toISOString() });
      if (profileError) log.error('Username upsert error:', profileError);
      track('signed_up');
      onAuthSuccess();
    } else {
      // Email confirmation enabled: prompt the user to check their inbox.
      track('signed_up');
      showAlert(language === 'fr' ? 'Compte créé !' : 'Account created!', t.checkEmail);
      setMode('login');
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {mode === 'profile' ? (
          <View>
            <Text style={styles.title}>{language === 'fr' ? 'Mon Profil' : 'My Profile'}</Text>

            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: PALETTE.oceanBlue,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 15,
                  borderWidth: 2,
                  borderColor: PALETTE.tan,
                }}
              >
                <User color={PALETTE.nightText} size={40} />
              </View>

              <View style={[styles.inputContainer, { marginBottom: 10, width: '100%' }]}>
                <TextInput
                  placeholder={language === 'fr' ? 'Pseudo' : 'Username'}
                  value={username}
                  onChangeText={setUsername}
                  style={styles.input}
                  placeholderTextColor={PALETTE.brownLight}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={USERNAME_MAX}
                  returnKeyType="done"
                  onSubmitEditing={updateUsername}
                  accessibilityLabel={language === 'fr' ? 'Pseudo' : 'Username'}
                />
                <TouchableOpacity
                  onPress={updateUsername}
                  disabled={loading}
                  {...a11yButton(
                    language === 'fr' ? 'Enregistrer le pseudo' : 'Save username',
                    { disabled: loading },
                  )}
                >
                  <Text style={{ color: PALETTE.vermilion, fontFamily: FONTS.monoBold, paddingRight: 10 }}>
                    {language === 'fr' ? 'OK' : 'SET'}
                  </Text>
                </TouchableOpacity>
              </View>
              {usernameErr && (
                <Text style={[styles.fieldError, { alignSelf: 'flex-start' }]}>{usernameErr}</Text>
              )}
              <Text style={{ fontSize: 12, fontFamily: FONTS.mono, color: PALETTE.brown }}>{email}</Text>
            </View>

            <Text
              style={{
                fontSize: 14,
                fontFamily: FONTS.monoBold,
                color: PALETTE.sepia,
                marginBottom: 10,
                textAlign: 'center',
              }}
            >
              {language === 'fr' ? 'Vos records' : 'Your records'}
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              <View style={styles.statCard}>
                <LayoutGrid size={20} color={PALETTE.forestGreen} />
                <Text style={styles.statLabel}>RANKLE</Text>
                <Text style={[styles.statValue, { color: PALETTE.forestGreen }]}>
                  {bestClassic || '—'}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Zap size={20} color={PALETTE.sand} />
                <Text style={styles.statLabel}>STREAK</Text>
                <Text style={[styles.statValue, { color: PALETTE.sand }]}>
                  {bestStreak || '—'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: PALETTE.dangerRed }]}
              onPress={async () => {
                await supabase.auth.signOut();
                setMode('login');
                setEmail('');
                setPassword('');
                onAuthSuccess();
              }}
              {...a11yButton(language === 'fr' ? 'Déconnexion' : 'Logout')}
            >
              <Text style={styles.buttonText}>{language === 'fr' ? 'Déconnexion' : 'Logout'}</Text>
            </TouchableOpacity>
          </View>
        ) : mode === 'forgot' ? (
          <View>
            <Text style={styles.title}>{t.resetTitle}</Text>

            {resetSent ? (
              <>
                <View style={styles.resetIconWrap}>
                  <Mail size={32} color={PALETTE.forestGreen} />
                </View>
                <Text style={styles.resetSentTitle}>{t.resetSentTitle}</Text>
                <Text style={styles.resetIntro}>{t.resetSentBody}</Text>
              </>
            ) : (
              <>
                <Text style={styles.resetIntro}>{t.resetIntro}</Text>

                <View style={styles.inputContainer}>
                  <Mail size={20} color={PALETTE.brown} style={styles.icon} />
                  <TextInput
                    onChangeText={setEmail}
                    value={email}
                    placeholder="email@address.com"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoComplete="email"
                    returnKeyType="done"
                    maxLength={254}
                    onSubmitEditing={sendPasswordReset}
                    style={styles.input}
                    placeholderTextColor={PALETTE.brownLight}
                    accessibilityLabel={t.email}
                  />
                </View>
                {emailErr && <Text style={styles.fieldError}>{emailErr}</Text>}

                <TouchableOpacity
                  style={[styles.button, (loading || !isValidEmail(email)) && styles.buttonDisabled]}
                  onPress={sendPasswordReset}
                  disabled={loading || !isValidEmail(email)}
                  {...a11yButton(t.sendReset, {
                    disabled: loading || !isValidEmail(email),
                    busy: loading,
                  })}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <>
                      <KeyRound size={20} color="white" />
                      <Text style={styles.buttonText}>{t.sendReset}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              onPress={() => {
                setResetSent(false);
                setMode('login');
              }}
              style={styles.backRow}
              {...a11yButton(t.backToLogin)}
            >
              <ArrowLeft size={16} color={PALETTE.vermilion} />
              <Text style={styles.switchText}>{t.backToLogin}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.title}>{mode === 'login' ? t.login : t.joinTitle}</Text>

            {/* Value proposition — shown at signup to convert non-registered players. */}
            {mode === 'signup' && (
              <View style={styles.benefits}>
                <Text style={styles.benefitsTitle}>{t.benefitsTitle}</Text>
                <Benefit icon={<LayoutGrid size={15} color={PALETTE.forestGreen} />} label={t.benefit1} />
                <Benefit icon={<Globe2 size={15} color={PALETTE.oceanBlue} />} label={t.benefit2} />
                <Benefit icon={<Coins size={15} color={PALETTE.sand} />} label={t.benefit3} />
                <Benefit icon={<Users size={15} color={PALETTE.vermilion} />} label={t.benefit4} />
              </View>
            )}

            <View style={styles.inputContainer}>
              <Mail size={20} color={PALETTE.brown} style={styles.icon} />
              <TextInput
                onChangeText={setEmail}
                value={email}
                placeholder="email@address.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                returnKeyType="next"
                maxLength={254}
                onSubmitEditing={() =>
                  mode === 'signup' ? usernameRef.current?.focus() : passwordRef.current?.focus()
                }
                submitBehavior="submit"
                style={styles.input}
                placeholderTextColor={PALETTE.brownLight}
                accessibilityLabel={t.email}
              />
            </View>
            {emailErr && <Text style={styles.fieldError}>{emailErr}</Text>}

            {/* Username is required at signup so no one is left "Anonymous Player". */}
            {mode === 'signup' && (
              <>
                <View style={styles.inputContainer}>
                  <User size={20} color={PALETTE.brown} style={styles.icon} />
                  <TextInput
                    ref={usernameRef}
                    onChangeText={setUsername}
                    value={username}
                    placeholder={t.username}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    maxLength={USERNAME_MAX}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    submitBehavior="submit"
                    style={styles.input}
                    placeholderTextColor={PALETTE.brownLight}
                    accessibilityLabel={t.username}
                  />
                </View>
                {usernameErr && <Text style={styles.fieldError}>{usernameErr}</Text>}
              </>
            )}

            <View style={styles.inputContainer}>
              <Lock size={20} color={PALETTE.brown} style={styles.icon} />
              <TextInput
                ref={passwordRef}
                onChangeText={setPassword}
                value={password}
                secureTextEntry
                placeholder={t.password}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                returnKeyType={mode === 'signup' ? 'next' : 'done'}
                maxLength={72}
                onSubmitEditing={() =>
                  mode === 'signup' ? confirmRef.current?.focus() : signInWithEmail()
                }
                submitBehavior={mode === 'signup' ? 'submit' : 'blurAndSubmit'}
                style={styles.input}
                placeholderTextColor={PALETTE.brownLight}
                accessibilityLabel={t.password}
              />
            </View>
            {mode === 'signup' && passwordErr && (
              <Text style={styles.fieldError}>{passwordErr}</Text>
            )}

            {mode === 'signup' && (
              <>
                <View style={styles.inputContainer}>
                  <Lock size={20} color={PALETTE.brown} style={styles.icon} />
                  <TextInput
                    ref={confirmRef}
                    onChangeText={setConfirmPassword}
                    value={confirmPassword}
                    secureTextEntry
                    placeholder={t.confirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    returnKeyType="done"
                    maxLength={72}
                    onSubmitEditing={signUpWithEmail}
                    style={styles.input}
                    placeholderTextColor={PALETTE.brownLight}
                    accessibilityLabel={t.confirmPassword}
                  />
                </View>
                {confirmErr && <Text style={styles.fieldError}>{confirmErr}</Text>}
              </>
            )}

            {/* Forgot-password entry point — login only. */}
            {mode === 'login' && (
              <TouchableOpacity
                onPress={() => {
                  setResetSent(false);
                  setMode('forgot');
                }}
                style={styles.forgotRow}
                {...a11yButton(t.forgot)}
              >
                <Text style={styles.forgotText}>{t.forgot}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.button, (loading || !canSubmit) && styles.buttonDisabled]}
              onPress={() => (mode === 'login' ? signInWithEmail() : signUpWithEmail())}
              disabled={loading || !canSubmit}
              {...a11yButton(mode === 'login' ? t.login : t.signup, {
                disabled: loading || !canSubmit,
                busy: loading,
              })}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  {mode === 'login' ? (
                    <LogIn size={20} color="white" />
                  ) : (
                    <UserPlus size={20} color="white" />
                  )}
                  <Text style={styles.buttonText}>{mode === 'login' ? t.login : t.signup}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
              {...a11yButton(mode === 'login' ? t.noAccount : t.haveAccount, {
                hint:
                  mode === 'login'
                    ? language === 'fr'
                      ? "Bascule vers la création de compte"
                      : 'Switches to account creation'
                    : language === 'fr'
                      ? 'Bascule vers la connexion'
                      : 'Switches to login',
              })}
            >
              <Text style={styles.switchText}>
                {mode === 'login' ? t.noAccount : t.haveAccount}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

/** A single benefit row in the signup value-proposition list. */
function Benefit({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <View style={styles.benefitRow}>
      <View style={styles.benefitIcon}>{icon}</View>
      <Text style={styles.benefitText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, width: '100%', maxWidth: 400, alignSelf: 'center' },
  card: {
    backgroundColor: PALETTE.parchmentDark,
    padding: 24,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: PALETTE.tan,
    shadowColor: PALETTE.sepia,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  title: {
    fontSize: 24,
    fontFamily: FONTS.headingBlack,
    marginBottom: 24,
    textAlign: 'center',
    color: PALETTE.sepia,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.parchment,
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: PALETTE.tan,
  },
  icon: { marginRight: 10 },
  input: { flex: 1, height: 50, color: PALETTE.sepia, fontSize: 16, fontFamily: FONTS.mono },
  fieldError: {
    color: PALETTE.dangerRed,
    fontSize: 12,
    fontFamily: FONTS.mono,
    marginTop: -8,
    marginBottom: 12,
    marginLeft: 4,
  },
  button: {
    backgroundColor: PALETTE.vermilion,
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 10,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: 'white', fontSize: 16, fontFamily: FONTS.monoBold },
  switchText: { marginTop: 20, color: PALETTE.vermilion, textAlign: 'center', fontSize: 14, fontFamily: FONTS.mono },
  // Forgot-password link, right-aligned above the login button.
  forgotRow: { alignSelf: 'flex-end', marginTop: -4, marginBottom: 4, paddingVertical: 4 },
  forgotText: { color: PALETTE.oceanBlue, fontSize: 13, fontFamily: FONTS.mono, textDecorationLine: 'underline' },
  // Reset-password screen.
  resetIntro: {
    fontSize: 14,
    fontFamily: FONTS.mono,
    color: PALETTE.brown,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  resetIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: PALETTE.parchment,
    borderWidth: 1,
    borderColor: PALETTE.tan,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  resetSentTitle: {
    fontSize: 18,
    fontFamily: FONTS.headingBlack,
    color: PALETTE.forestGreen,
    textAlign: 'center',
    marginBottom: 10,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 },
  // Signup value proposition.
  benefits: {
    backgroundColor: PALETTE.parchment,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PALETTE.tan,
    padding: 14,
    marginBottom: 18,
    gap: 9,
  },
  benefitsTitle: {
    fontSize: 12,
    fontFamily: FONTS.monoBold,
    color: PALETTE.sepia,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitIcon: { width: 20, alignItems: 'center' },
  benefitText: { flex: 1, fontSize: 12.5, fontFamily: FONTS.mono, color: PALETTE.brown, lineHeight: 17 },
  statCard: {
    flex: 1,
    backgroundColor: PALETTE.parchment,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PALETTE.tan,
  },
  statLabel: { fontSize: 10, fontFamily: FONTS.mono, color: PALETTE.brown, marginTop: 4 },
  statValue: { fontSize: 18, fontFamily: FONTS.headingBlack },
});

export default Auth;
