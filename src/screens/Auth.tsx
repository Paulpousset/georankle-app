import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LayoutGrid, LogIn, Lock, Mail, User, UserPlus, Zap } from 'lucide-react-native';

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

type Mode = 'login' | 'signup' | 'profile';

interface AuthProps {
  onAuthSuccess: () => void;
  language: Language;
}

const Auth = ({ onAuthSuccess, language }: AuthProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [bestClassic, setBestClassic] = useState<number | null>(null);
  const [bestStreak, setBestStreak] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('login');

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

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

      // Lowest total rank is best for classic; highest streak is best for streak.
      if (classicScores.length > 0) setBestClassic(Math.min(...classicScores));
      if (streakScores.length > 0) setBestStreak(Math.max(...streakScores));
    }
  };

  const t = {
    fr: {
      email: 'Email',
      password: 'Mot de passe',
      confirmPassword: 'Confirmer le mot de passe',
      login: 'Se connecter',
      signup: "S'inscrire",
      noAccount: "Pas de compte ? S'inscrire",
      haveAccount: 'Déjà un compte ? Se connecter',
      error: 'Erreur',
      success: 'Succès',
      checkEmail: "Vérifiez vos emails pour confirmer l'inscription !",
      passwordsDontMatch: 'Les mots de passe ne correspondent pas',
      invalidEmail: 'Adresse email invalide',
      invalidUsername: 'Pseudo invalide',
    },
    en: {
      email: 'Email',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      login: 'Login',
      signup: 'Sign Up',
      noAccount: "Don't have an account? Sign up",
      haveAccount: 'Already have an account? Login',
      error: 'Error',
      success: 'Success',
      checkEmail: 'Check your email for confirmation link!',
      passwordsDontMatch: 'Passwords do not match',
      invalidEmail: 'Invalid email address',
      invalidUsername: 'Invalid username',
    },
  }[language];

  async function updateUsername() {
    if (!isValidUsername(username)) {
      Alert.alert(t.error, usernameErr ?? t.invalidUsername);
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

    if (error) Alert.alert(t.error, error.message);
    else Alert.alert(t.success, language === 'fr' ? 'Profil mis à jour !' : 'Profile updated!');
    setLoading(false);
  }

  async function signInWithEmail() {
    if (!isValidEmail(email)) {
      Alert.alert(t.error, t.invalidEmail);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      Alert.alert(
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

  async function signUpWithEmail() {
    if (!isValidEmail(email)) {
      Alert.alert(t.error, t.invalidEmail);
      return;
    }
    const pwErr = passwordError(language, password);
    if (pwErr) {
      Alert.alert(t.error, pwErr);
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t.error, t.passwordsDontMatch);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      log.error('Signup error details:', error);
      Alert.alert(t.error, error.message);
    } else if (data?.session) {
      // Email confirmation disabled: the session exists, log in directly.
      track('signed_up');
      onAuthSuccess();
    } else {
      // Email confirmation enabled: prompt the user to check their inbox.
      track('signed_up');
      Alert.alert(language === 'fr' ? 'Compte créé !' : 'Account created!', t.checkEmail);
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
        ) : (
          <View>
            <Text style={styles.title}>{mode === 'login' ? t.login : t.signup}</Text>

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
                onSubmitEditing={() => passwordRef.current?.focus()}
                submitBehavior="submit"
                style={styles.input}
                placeholderTextColor={PALETTE.brownLight}
                accessibilityLabel={t.email}
              />
            </View>
            {emailErr && <Text style={styles.fieldError}>{emailErr}</Text>}

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
