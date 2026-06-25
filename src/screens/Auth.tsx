import { useEffect, useState } from 'react';
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
import { FONTS } from '../theme/typography';
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
      passwordTooShort: 'Le mot de passe doit faire au moins 6 caractères',
      invalidEmail: 'Adresse email invalide',
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
      passwordTooShort: 'Password must be at least 6 characters',
      invalidEmail: 'Invalid email address',
    },
  }[language];

  async function updateUsername() {
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
      .upsert({ id: user.id, username, updated_at: new Date() });

    if (error) Alert.alert(t.error, error.message);
    else Alert.alert(t.success, language === 'fr' ? 'Profil mis à jour !' : 'Profile updated!');
    setLoading(false);
  }

  async function signInWithEmail() {
    if (!email.includes('@')) {
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
    if (!email.includes('@')) {
      Alert.alert(t.error, t.invalidEmail);
      return;
    }
    if (password.length < 6) {
      Alert.alert(t.error, t.passwordTooShort);
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
      console.log('Signup error details:', error);
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
                  backgroundColor: '#1a4a7a',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 15,
                  borderWidth: 2,
                  borderColor: '#c4a87a',
                }}
              >
                <User color="#d8e8f4" size={40} />
              </View>

              <View style={[styles.inputContainer, { marginBottom: 10, width: '100%' }]}>
                <TextInput
                  placeholder={language === 'fr' ? 'Pseudo' : 'Username'}
                  value={username}
                  onChangeText={setUsername}
                  style={styles.input}
                  placeholderTextColor="#a08060"
                />
                <TouchableOpacity onPress={updateUsername} disabled={loading}>
                  <Text style={{ color: '#c04a1a', fontFamily: FONTS.monoBold, paddingRight: 10 }}>
                    {language === 'fr' ? 'OK' : 'SET'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 12, fontFamily: FONTS.mono, color: '#7a5c38' }}>{email}</Text>
            </View>

            <Text
              style={{
                fontSize: 14,
                fontFamily: FONTS.monoBold,
                color: '#2c1810',
                marginBottom: 10,
                textAlign: 'center',
              }}
            >
              {language === 'fr' ? 'Vos records' : 'Your records'}
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              <View style={styles.statCard}>
                <LayoutGrid size={20} color="#2a6e3f" />
                <Text style={styles.statLabel}>RANKLE</Text>
                <Text style={[styles.statValue, { color: '#2a6e3f' }]}>
                  {bestClassic || '—'}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Zap size={20} color="#c4872a" />
                <Text style={styles.statLabel}>STREAK</Text>
                <Text style={[styles.statValue, { color: '#c4872a' }]}>
                  {bestStreak || '—'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#8b1a1a' }]}
              onPress={async () => {
                await supabase.auth.signOut();
                setMode('login');
                setEmail('');
                setPassword('');
                onAuthSuccess();
              }}
            >
              <Text style={styles.buttonText}>{language === 'fr' ? 'Déconnexion' : 'Logout'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.title}>{mode === 'login' ? t.login : t.signup}</Text>

            <View style={styles.inputContainer}>
              <Mail size={20} color="#7a5c38" style={styles.icon} />
              <TextInput
                onChangeText={setEmail}
                value={email}
                placeholder="email@address.com"
                autoCapitalize="none"
                style={styles.input}
                placeholderTextColor="#a08060"
              />
            </View>

            <View style={styles.inputContainer}>
              <Lock size={20} color="#7a5c38" style={styles.icon} />
              <TextInput
                onChangeText={setPassword}
                value={password}
                secureTextEntry
                placeholder={t.password}
                autoCapitalize="none"
                style={styles.input}
                placeholderTextColor="#a08060"
              />
            </View>

            {mode === 'signup' && (
              <View style={styles.inputContainer}>
                <Lock size={20} color="#7a5c38" style={styles.icon} />
                <TextInput
                  onChangeText={setConfirmPassword}
                  value={confirmPassword}
                  secureTextEntry
                  placeholder={t.confirmPassword}
                  autoCapitalize="none"
                  style={styles.input}
                  placeholderTextColor="#a08060"
                />
              </View>
            )}

            <TouchableOpacity
              style={styles.button}
              onPress={() => (mode === 'login' ? signInWithEmail() : signUpWithEmail())}
              disabled={loading}
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

            <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}>
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
    backgroundColor: '#e8d9b8',
    padding: 24,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#c4a87a',
    shadowColor: '#2c1810',
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
    color: '#2c1810',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2e8d0',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#c4a87a',
  },
  icon: { marginRight: 10 },
  input: { flex: 1, height: 50, color: '#2c1810', fontSize: 16, fontFamily: FONTS.mono },
  button: {
    backgroundColor: '#c04a1a',
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 10,
  },
  buttonText: { color: 'white', fontSize: 16, fontFamily: FONTS.monoBold },
  switchText: { marginTop: 20, color: '#c04a1a', textAlign: 'center', fontSize: 14, fontFamily: FONTS.mono },
  statCard: {
    flex: 1,
    backgroundColor: '#f2e8d0',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c4a87a',
  },
  statLabel: { fontSize: 10, fontFamily: FONTS.mono, color: '#7a5c38', marginTop: 4 },
  statValue: { fontSize: 18, fontFamily: FONTS.headingBlack },
});

export default Auth;
