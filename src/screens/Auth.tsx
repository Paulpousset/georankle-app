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

import { supabase } from '../lib/supabase';
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
      onAuthSuccess();
    } else {
      // Email confirmation enabled: prompt the user to check their inbox.
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
                  backgroundColor: '#2563eb',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 15,
                }}
              >
                <User color="white" size={40} />
              </View>

              <View style={[styles.inputContainer, { marginBottom: 10, width: '100%' }]}>
                <TextInput
                  placeholder={language === 'fr' ? 'Pseudo' : 'Username'}
                  value={username}
                  onChangeText={setUsername}
                  style={styles.input}
                />
                <TouchableOpacity onPress={updateUsername} disabled={loading}>
                  <Text style={{ color: '#2563eb', fontWeight: 'bold', paddingRight: 10 }}>
                    {language === 'fr' ? 'OK' : 'SET'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 12, color: '#64748b' }}>{email}</Text>
            </View>

            <Text
              style={{
                fontSize: 14,
                fontWeight: 'bold',
                color: '#1e293b',
                marginBottom: 10,
                textAlign: 'center',
              }}
            >
              {language === 'fr' ? 'Vos records' : 'Your records'}
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: '#f8fafc',
                  padding: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                }}
              >
                <LayoutGrid size={20} color="#10b981" />
                <Text style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>CLASSIC</Text>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#10b981' }}>
                  {bestClassic || '—'}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  backgroundColor: '#f8fafc',
                  padding: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                }}
              >
                <Zap size={20} color="#fbbf24" />
                <Text style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>STREAK</Text>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#fbbf24' }}>
                  {bestStreak || '—'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#ef4444' }]}
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
              <Mail size={20} color="#666" style={styles.icon} />
              <TextInput
                onChangeText={setEmail}
                value={email}
                placeholder="email@address.com"
                autoCapitalize="none"
                style={styles.input}
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.inputContainer}>
              <Lock size={20} color="#666" style={styles.icon} />
              <TextInput
                onChangeText={setPassword}
                value={password}
                secureTextEntry
                placeholder={t.password}
                autoCapitalize="none"
                style={styles.input}
                placeholderTextColor="#999"
              />
            </View>

            {mode === 'signup' && (
              <View style={styles.inputContainer}>
                <Lock size={20} color="#666" style={styles.icon} />
                <TextInput
                  onChangeText={setConfirmPassword}
                  value={confirmPassword}
                  secureTextEntry
                  placeholder={t.confirmPassword}
                  autoCapitalize="none"
                  style={styles.input}
                  placeholderTextColor="#999"
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
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
    color: '#1a1a1a',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  icon: { marginRight: 10 },
  input: { flex: 1, height: 50, color: '#333', fontSize: 16 },
  button: {
    backgroundColor: '#2563eb',
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 10,
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  switchText: { marginTop: 20, color: '#2563eb', textAlign: 'center', fontSize: 14 },
});

export default Auth;
