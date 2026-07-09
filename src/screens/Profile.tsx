import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { Bell, Camera, Check, Coins, Eye, EyeOff, ArrowLeft, HelpCircle, LayoutGrid, LogOut, Palette, ShoppingBag, Trash2, Zap } from 'lucide-react-native';

import { supabase } from '../lib/supabase';
import { useCachedData } from '../lib/cache';
import { isValidUsername, usernameError, USERNAME_MAX } from '../lib/validation';
import { cancelDailyReminder, getDailyReminderPrefs, scheduleDailyReminder } from '../lib/notifications';
import { track } from '../lib/analytics';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { getRankFromElo, modeLabel } from '../lib/ranked';
import { RankGlobe } from '../components/RankGlobe';
import { Avatar } from '../components/Avatar';
import { WorldAvatar } from '../components/WorldAvatar';
import { deriveDefaultConfigFromSeed, normalizeConfig } from '../data/cosmetics';
import { tr } from '../i18n';
import { resetTutorial } from '../lib/tutorial';
import { resetModeIntros } from '../lib/modeIntro';
import { MODE_INTROS } from '../data/modeIntros';
import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import type { AvatarConfig, GameMode, MatchMode } from '../types';

interface ProfileProps {
  onBack: () => void;
  onLoggedOut: () => void;
  onEditAvatar: () => void;
  onOpenShop: () => void;
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
}

const MODES: MatchMode[] = ['classic', 'streak', 'versus', 'globe', 'guess', 'higherlower', 'silhouette', 'borders'];

type ModeStat = { wins: number; total: number };

/** Everything the Profile screen reads from Supabase in one cacheable snapshot. */
interface ProfileSnapshot {
  username: string;
  avatarUrl: string | null;
  avatarConfig: AvatarConfig | null;
  showRank: boolean;
  coins: number;
  elo: number;
  wins: number;
  losses: number;
  modeStats: Record<string, ModeStat>;
  bestClassic: number | null;
  bestStreak: number | null;
}

/** Decode a base64 string into a byte array (no external dependency, web + native). */
function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const bytes = new Uint8Array((len * 3) / 4 - (clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0));

  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = lookup[clean.charCodeAt(i)];
    const e2 = lookup[clean.charCodeAt(i + 1)];
    const e3 = lookup[clean.charCodeAt(i + 2)];
    const e4 = lookup[clean.charCodeAt(i + 3)];
    bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < bytes.length) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < bytes.length) bytes[p++] = ((e3 & 3) << 6) | e4;
  }
  return bytes;
}

export default function Profile({ onBack, onLoggedOut, onEditAvatar, onOpenShop, isAdmin, onOpenAdmin }: ProfileProps) {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const userId = user?.id ?? '';
  const email = user?.email ?? '';
  const c = getColors(isDarkMode);

  const [username, setUsername] = useState('');
  const [savedUsername, setSavedUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);
  const [coins, setCoins] = useState(0);
  const [showRank, setShowRank] = useState(true);
  const [elo, setElo] = useState(1000);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [modeStats, setModeStats] = useState<Record<string, ModeStat>>({});
  const [bestClassic, setBestClassic] = useState<number | null>(null);
  const [bestStreak, setBestStreak] = useState<number | null>(null);

  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Daily reminder — ON by default for everyone, opt-out (local notification;
  // preference stored in AsyncStorage).
  const REMINDER_TIMES = ['08:00', '09:00', '12:00', '18:00', '20:00'];
  const [reminderOn, setReminderOn] = useState(true);
  const [reminderTime, setReminderTime] = useState('09:00');
  useEffect(() => {
    getDailyReminderPrefs().then((p) => {
      setReminderOn(p.enabled);
      setReminderTime(p.time);
    });
  }, []);

  const toggleReminder = async (value: boolean) => {
    setReminderOn(value);
    if (value) {
      const ok = await scheduleDailyReminder(reminderTime, language);
      setReminderOn(ok);
      if (ok) track('daily_reminder_set', { time: reminderTime });
    } else {
      await cancelDailyReminder();
    }
  };

  const cycleReminderTime = async () => {
    const next = REMINDER_TIMES[(REMINDER_TIMES.indexOf(reminderTime) + 1) % REMINDER_TIMES.length];
    setReminderTime(next);
    if (reminderOn) {
      await scheduleDailyReminder(next, language);
      track('daily_reminder_set', { time: next });
    }
  };

  const rank = getRankFromElo(elo);

  const fetchProfile = useCallback(async (): Promise<ProfileSnapshot> => {
    // All five reads are independent → fire them in parallel.
    const [profileRes, walletRes, ratingRes, matchesRes, scoresRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('username, avatar_url, show_rank, avatar_config')
        .eq('id', userId)
        .single(),
      supabase.from('coin_wallets').select('balance').eq('user_id', userId).maybeSingle(),
      // maybeSingle: players who never finished a ranked match have no row —
      // .single() turned every such profile view into a 406 + console error.
      supabase.from('player_ratings').select('elo, wins, losses').eq('user_id', userId).maybeSingle(),
      supabase
        .from('matches')
        .select('game_mode, player1_id, player2_id, p1_rounds_won, p2_rounds_won')
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .eq('status', 'completed'),
      supabase.from('scores').select('game_mode, score').eq('user_id', userId),
    ]);

    const profile = profileRes.data;
    const rating = ratingRes.data;

    // Per-mode win rate from completed matches.
    const stats: Record<string, ModeStat> = {};
    for (const m of matchesRes.data ?? []) {
      const mode = m.game_mode as string;
      if (!stats[mode]) stats[mode] = { wins: 0, total: 0 };
      stats[mode].total += 1;
      const iAmP1 = m.player1_id === userId;
      const myRounds = iAmP1 ? (m.p1_rounds_won ?? 0) : (m.p2_rounds_won ?? 0);
      const oppRounds = iAmP1 ? (m.p2_rounds_won ?? 0) : (m.p1_rounds_won ?? 0);
      if (myRounds > oppRounds) stats[mode].wins += 1;
    }

    // Solo records.
    const scores = scoresRes.data ?? [];
    const classic = scores.filter((s) => s.game_mode === 'classic').map((s) => s.score);
    const streak = scores.filter((s) => s.game_mode === 'streak').map((s) => s.score);

    return {
      username: profile?.username ?? '',
      avatarUrl: profile?.avatar_url ?? null,
      avatarConfig: profile?.avatar_config
        ? normalizeConfig(profile.avatar_config as unknown as AvatarConfig)
        : null,
      showRank: profile?.show_rank ?? true,
      coins: walletRes.data?.balance ?? 0,
      elo: rating?.elo ?? 1000,
      wins: rating?.wins ?? 0,
      losses: rating?.losses ?? 0,
      modeStats: stats,
      bestClassic: classic.length ? Math.min(...classic) : null,
      bestStreak: streak.length ? Math.max(...streak) : null,
    };
  }, [userId]);

  const { data: snapshot, loading } = useCachedData<ProfileSnapshot>(
    `profile:${userId}`,
    fetchProfile,
    { enabled: !!userId },
  );

  // Push the cached/fresh snapshot into local state. The username text input is
  // only seeded once so background refreshes don't clobber what the user is typing.
  const nameHydrated = useRef(false);
  useEffect(() => {
    if (!snapshot) return;
    setSavedUsername(snapshot.username);
    if (!nameHydrated.current) {
      setUsername(snapshot.username);
      nameHydrated.current = true;
    }
    setAvatarUrl(snapshot.avatarUrl);
    setAvatarConfig(snapshot.avatarConfig);
    setShowRank(snapshot.showRank);
    setCoins(snapshot.coins);
    setElo(snapshot.elo);
    setWins(snapshot.wins);
    setLosses(snapshot.losses);
    setModeStats(snapshot.modeStats);
    setBestClassic(snapshot.bestClassic);
    setBestStreak(snapshot.bestStreak);
  }, [snapshot]);

  // Inline username validation: only allow saving a changed, well-formed name.
  const usernameErr = usernameError(language, username);
  const canSaveName = isValidUsername(username) && username.trim() !== savedUsername;

  const saveUsername = async () => {
    const trimmed = username.trim();
    if (!isValidUsername(username) || trimmed === savedUsername) return;
    setSavingName(true);
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, username: trimmed, updated_at: new Date().toISOString() });
    setSavingName(false);
    if (error) {
      Alert.alert(tr(language, 'Erreur', 'Error'), error.message);
    } else {
      setSavedUsername(trimmed);
    }
  };

  const toggleShowRank = async (value: boolean) => {
    setShowRank(value);
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, show_rank: value, updated_at: new Date().toISOString() });
    if (error) {
      setShowRank(!value);
      Alert.alert(tr(language, 'Erreur', 'Error'), error.message);
    }
  };

  const pickAndUploadAvatar = async () => {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          tr(language, 'Permission requise', 'Permission needed'),
          tr(language, 'Autorisez l\'accès aux photos pour changer votre avatar.', 'Allow photo access to change your avatar.'),
        );
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert(tr(language, 'Erreur', 'Error'), tr(language, 'Image illisible.', 'Could not read image.'));
      return;
    }

    setUploading(true);
    try {
      const ext = (asset.uri.split('.').pop() ?? 'jpg').split('?')[0].toLowerCase();
      const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const path = `${userId}/avatar.${ext === 'png' || ext === 'webp' ? ext : 'jpg'}`;
      const bytes = base64ToBytes(asset.base64);

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, bytes, { contentType, upsert: true });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      // Cache-buster so the new image shows immediately (fixed path is overwritten on each upload).
      const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

      const { error: saveError } = await supabase
        .from('profiles')
        .upsert({ id: userId, avatar_url: publicUrl, updated_at: new Date().toISOString() });
      if (saveError) throw saveError;

      setAvatarUrl(publicUrl);
    } catch (e: unknown) {
      Alert.alert(tr(language, 'Erreur', 'Error'), e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const doLogout = async () => {
    await supabase.auth.signOut();
    onLoggedOut();
  };

  const logout = () => {
    Alert.alert(
      tr(language, 'Déconnexion', 'Logout'),
      tr(language, 'Veux-tu vraiment te déconnecter ?', 'Do you really want to log out?'),
      [
        { text: tr(language, 'Annuler', 'Cancel'), style: 'cancel' },
        { text: tr(language, 'Déconnexion', 'Logout'), style: 'destructive', onPress: doLogout },
      ],
    );
  };

  const [deleting, setDeleting] = useState(false);

  const performDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.rpc('delete_user_account');
    if (error) {
      setDeleting(false);
      Alert.alert(
        tr(language, 'Erreur', 'Error'),
        tr(
          language,
          "La suppression a échoué. Réessayez plus tard.",
          'Deletion failed. Please try again later.',
        ),
      );
      return;
    }
    await supabase.auth.signOut();
    onLoggedOut();
  };

  const confirmDeleteAccount = () => {
    const title = tr(language, 'Supprimer le compte', 'Delete account');
    const message = tr(
      language,
      'Cette action est définitive. Votre compte, votre rang et toutes vos données seront supprimés. Continuer ?',
      'This is permanent. Your account, rank and all your data will be erased. Continue?',
    );
    if (Platform.OS === 'web') {
      // Alert on web has no buttons callback; fall back to confirm().
      if (typeof confirm === 'function' && confirm(`${title}\n\n${message}`)) {
        performDelete();
      }
      return;
    }
    Alert.alert(title, message, [
      { text: tr(language, 'Annuler', 'Cancel'), style: 'cancel' },
      { text: tr(language, 'Supprimer', 'Delete'), style: 'destructive', onPress: performDelete },
    ]);
  };

  const openPrivacyPolicy = () => {
    Linking.openURL('https://geogames-mu.vercel.app/privacy.html');
  };

  // Replay the whole onboarding: clear the guided-tour flag AND every per-mode
  // "how to play" flag, then drop back to the menu — where the tour re-appears
  // on mount and each game re-explains itself the next time it's opened.
  const replayTutorial = async () => {
    await Promise.all([
      resetTutorial(),
      resetModeIntros(Object.keys(MODE_INTROS) as GameMode[]),
    ]);
    track('tutorial_replayed');
    onBack();
  };

  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

  // Show the 3D character unless the user opted for a photo (useCustom === false).
  // Null config (legacy users) → a deterministic default derived from the name.
  const avatar3DConfig =
    avatarConfig?.useCustom
      ? avatarConfig
      : avatarConfig == null
        ? deriveDefaultConfigFromSeed(savedUsername || userId)
        : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}
          {...a11yButton(tr(language, 'Retour', 'Back'))}
        >
          <ArrowLeft color={c.text} size={20} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>
          {tr(language, 'Mon Profil', 'My Profile')}
        </Text>
        <TouchableOpacity
          onPress={logout}
          style={[styles.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}
          {...a11yButton(tr(language, 'Déconnexion', 'Logout'))}
        >
          <LogOut color="#8b1a1a" size={20} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={c.accent} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar + identity */}
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, alignItems: 'center' }]}>
            <View style={styles.avatarWrap}>
              {avatar3DConfig ? (
                <View style={{ width: 168, height: 168, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: rank.color }}>
                  <WorldAvatar config={avatar3DConfig} size={168} animate />
                </View>
              ) : (
                <Avatar
                  config={avatarConfig}
                  photoUrl={avatarUrl}
                  username={savedUsername}
                  size={104}
                  ringColor={rank.color}
                  ringWidth={3}
                />
              )}
            </View>

            {/* Avatar actions */}
            <View style={styles.avatarActions}>
              <TouchableOpacity
                onPress={pickAndUploadAvatar}
                disabled={uploading}
                style={[styles.avatarActionBtn, { backgroundColor: c.background, borderColor: c.border }]}
                {...a11yButton(tr(language, 'Changer la photo de profil', 'Change profile photo'), {
                  disabled: uploading,
                  busy: uploading,
                })}
              >
                {uploading ? <ActivityIndicator size="small" color={c.accent} /> : <Camera color={c.textMuted} size={15} />}
                <Text style={[styles.avatarActionText, { color: c.textMuted }]}>{tr(language, 'Photo', 'Photo')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onEditAvatar}
                style={[styles.avatarActionBtn, { backgroundColor: c.background, borderColor: c.border }]}
                {...a11yButton(tr(language, 'Personnaliser l\'avatar', 'Customize avatar'))}
              >
                <Palette color={c.accent} size={15} />
                <Text style={[styles.avatarActionText, { color: c.accent }]}>{tr(language, 'Personnaliser', 'Customize')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onOpenShop}
                style={[styles.avatarActionBtn, { backgroundColor: c.background, borderColor: c.border }]}
                {...a11yButton(tr(language, `Boutique, ${coins} pièces`, `Shop, ${coins} coins`))}
              >
                <Coins color="#ffd700" size={15} />
                <Text style={[styles.avatarActionText, { color: c.text }]}>{coins}</Text>
                <ShoppingBag color={c.textMuted} size={15} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.emailText, { color: c.textFaint }]}>{email}</Text>

            {/* Username editor */}
            <View style={[styles.nameRow, { backgroundColor: c.background, borderColor: c.border }]}>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder={tr(language, 'Pseudo', 'Username')}
                placeholderTextColor={c.textFaint}
                style={[styles.nameInput, { color: c.text }]}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={USERNAME_MAX}
                returnKeyType="done"
                onSubmitEditing={saveUsername}
              />
              <TouchableOpacity
                onPress={saveUsername}
                disabled={savingName || !canSaveName}
                hitSlop={ICON_HIT_SLOP}
                style={[
                  styles.nameSaveBtn,
                  { backgroundColor: canSaveName ? c.accent : c.border },
                ]}
                {...a11yButton(tr(language, 'Enregistrer le pseudo', 'Save username'), {
                  disabled: savingName || !canSaveName,
                  busy: savingName,
                })}
              >
                {savingName ? <ActivityIndicator size="small" color="#fff" /> : <Check color="#fff" size={18} />}
              </TouchableOpacity>
            </View>
            {usernameErr && (
              <Text style={[styles.nameError, { color: '#c0392b' }]}>{usernameErr}</Text>
            )}
          </View>

          {/* Ranked rank with show/hide toggle */}
          <View style={[styles.card, { backgroundColor: c.card, borderColor: rank.color }]}>
            <View style={styles.sectionHeadRow}>
              <Text style={[styles.sectionTitle, { color: c.textMuted }]}>
                {tr(language, 'RANG CLASSÉ', 'RANKED RANK')}
              </Text>
              <View style={styles.toggleWrap}>
                {showRank ? <Eye color={c.textMuted} size={15} /> : <EyeOff color={c.textFaint} size={15} />}
                <Text style={[styles.toggleLabel, { color: c.textFaint }]}>
                  {showRank ? tr(language, 'Visible', 'Shown') : tr(language, 'Masqué', 'Hidden')}
                </Text>
                <Switch
                  value={showRank}
                  onValueChange={toggleShowRank}
                  trackColor={{ false: c.border, true: rank.color }}
                  thumbColor="#fff"
                  accessibilityLabel={tr(language, 'Afficher mon rang aux autres joueurs', 'Show my rank to other players')}
                  accessibilityState={{ checked: showRank }}
                />
              </View>
            </View>

            <View style={styles.rankRow}>
              <RankGlobe rank={rank} size={72} showName={false} language={language} spin />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={[styles.rankName, { color: rank.color }]}>
                  {language === 'fr' ? rank.nameFr : rank.name}
                </Text>
                <ScoreText style={[styles.eloText, { color: c.text }]}>
                  {elo} <Text style={{ color: c.textFaint, fontSize: 12 }}>ELO</Text>
                </ScoreText>
                <View style={styles.wlRow}>
                  <Text style={[styles.wlStat, { color: '#2a6e3f' }]}>{wins}V</Text>
                  <Text style={{ color: c.textFaint }}> · </Text>
                  <Text style={[styles.wlStat, { color: '#8b1a1a' }]}>{losses}D</Text>
                  <Text style={{ color: c.textFaint }}> · </Text>
                  <Text style={[styles.wlStat, { color: c.textMuted }]}>
                    {winRate}% {tr(language, 'victoires', 'win rate')}
                  </Text>
                </View>
              </View>
            </View>
            <Text style={[styles.hint, { color: c.textFaint }]}>
              {showRank
                ? tr(language, 'Votre rang est visible par les autres joueurs.', 'Your rank is visible to other players.')
                : tr(language, 'Votre rang est caché des autres joueurs.', 'Your rank is hidden from other players.')}
            </Text>
          </View>

          {/* Win rate per mode */}
          <Text style={[styles.outerSectionTitle, { color: c.textMuted }]}>
            {tr(language, '% DE VICTOIRE PAR MODE', 'WIN RATE BY MODE')}
          </Text>
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, gap: 10 }]}>
            {MODES.map((mode) => {
              const s = modeStats[mode] ?? { wins: 0, total: 0 };
              const rate = s.total > 0 ? Math.round((s.wins / s.total) * 100) : 0;
              return (
                <View key={mode}>
                  <View style={styles.modeLabelRow}>
                    <Text style={[styles.modeName, { color: c.text }]}>{modeLabel(mode, language)}</Text>
                    <Text style={[styles.modeRate, { color: s.total > 0 ? rank.color : c.textFaint }]}>
                      {s.total > 0 ? `${rate}%` : '—'}
                    </Text>
                  </View>
                  <View style={[styles.barTrack, { backgroundColor: c.background }]}>
                    <View style={[styles.barFill, { width: `${rate}%`, backgroundColor: rank.color }]} />
                  </View>
                  <Text style={[styles.modeSub, { color: c.textFaint }]}>
                    {s.total > 0
                      ? `${s.wins}V / ${s.total - s.wins}D · ${s.total} ${tr(language, 'parties', 'matches')}`
                      : tr(language, 'Aucune partie', 'No matches yet')}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Solo records */}
          <Text style={[styles.outerSectionTitle, { color: c.textMuted }]}>
            {tr(language, 'RECORDS SOLO', 'SOLO RECORDS')}
          </Text>
          <View style={styles.recordsRow}>
            <View style={[styles.recordCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <LayoutGrid size={20} color="#2a6e3f" />
              <Text style={[styles.recordLabel, { color: c.textFaint }]}>RANKLE</Text>
              <ScoreText style={[styles.recordValue, { color: '#2a6e3f' }]}>{bestClassic ?? '—'}</ScoreText>
            </View>
            <View style={[styles.recordCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <Zap size={20} color="#c4872a" />
              <Text style={[styles.recordLabel, { color: c.textFaint }]}>STREAK</Text>
              <ScoreText style={[styles.recordValue, { color: '#c4872a' }]}>{bestStreak ?? '—'}</ScoreText>
            </View>
          </View>

          {/* Daily reminder */}
          <Text style={[styles.outerSectionTitle, { color: c.textMuted }]}>
            {tr(language, 'DÉFI QUOTIDIEN', 'DAILY CHALLENGE')}
          </Text>
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.sectionHeadRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Bell color={c.textMuted} size={16} />
                <Text style={[styles.sectionTitle, { color: c.textMuted }]}>
                  {tr(language, 'Rappel quotidien', 'Daily reminder')}
                </Text>
              </View>
              <Switch
                value={reminderOn}
                onValueChange={toggleReminder}
                trackColor={{ false: c.border, true: '#e8772e' }}
                thumbColor="#fff"
                accessibilityLabel={tr(language, 'Rappel quotidien', 'Daily reminder')}
                accessibilityState={{ checked: reminderOn }}
              />
            </View>
            <TouchableOpacity
              onPress={cycleReminderTime}
              disabled={!reminderOn}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, opacity: reminderOn ? 1 : 0.5 }}
              {...a11yButton(tr(language, `Heure du rappel, ${reminderTime}`, `Reminder time, ${reminderTime}`), {
                hint: tr(language, 'Appuyer pour changer', 'Tap to change'),
                disabled: !reminderOn,
              })}
            >
              <Text style={[styles.hint, { color: c.textFaint }]}>
                {tr(language, "Heure du rappel (appuie pour changer)", 'Reminder time (tap to change)')}
              </Text>
              <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 15 }}>{reminderTime}</Text>
            </TouchableOpacity>
          </View>

          {/* Help — replay the guided tour + every "how to play" card. */}
          <Text style={[styles.outerSectionTitle, { color: c.textMuted }]}>
            {tr(language, 'AIDE', 'HELP')}
          </Text>
          <TouchableOpacity
            style={[styles.adminBtn, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={replayTutorial}
            {...a11yButton(tr(language, 'Revoir le tutoriel', 'Replay the tutorial'), {
              hint: tr(
                language,
                'Relance la visite guidée et réaffiche les règles de chaque jeu',
                'Restarts the guided tour and shows each game’s rules again',
              ),
            })}
          >
            <HelpCircle color={c.accent} size={18} />
            <Text style={[styles.adminText, { color: c.accent }]}>
              {tr(language, 'Revoir le tutoriel', 'Replay the tutorial')}
            </Text>
          </TouchableOpacity>

          {isAdmin && onOpenAdmin && (
            <TouchableOpacity
              style={[styles.adminBtn, { backgroundColor: c.card, borderColor: c.accent }]}
              onPress={onOpenAdmin}
              {...a11yButton(tr(language, 'Notifications push (Admin)', 'Push notifications (Admin)'))}
            >
              <Bell color={c.accent} size={18} />
              <Text style={[styles.adminText, { color: c.accent }]}>
                {tr(language, 'Notifications push (Admin)', 'Push notifications (Admin)')}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={logout}
            {...a11yButton(tr(language, 'Déconnexion', 'Logout'))}
          >
            <LogOut color="#fff" size={18} />
            <Text style={styles.logoutText}>{tr(language, 'Déconnexion', 'Logout')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={openPrivacyPolicy}
            {...a11yButton(tr(language, 'Politique de confidentialité', 'Privacy Policy'), { role: 'link' })}
          >
            <Text style={[styles.linkText, { color: c.textMuted }]}>
              {tr(language, 'Politique de confidentialité', 'Privacy Policy')}
            </Text>
          </TouchableOpacity>

          {/* Danger zone — required by App Store Guideline 5.1.1(v) */}
          <TouchableOpacity
            style={[styles.deleteBtn, { borderColor: '#8b1a1a' }]}
            onPress={confirmDeleteAccount}
            disabled={deleting}
            {...a11yButton(tr(language, 'Supprimer mon compte', 'Delete my account'), {
              disabled: deleting,
              busy: deleting,
            })}
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#8b1a1a" />
            ) : (
              <>
                <Trash2 color="#8b1a1a" size={18} />
                <Text style={styles.deleteText}>
                  {tr(language, 'Supprimer mon compte', 'Delete my account')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontFamily: FONTS.headingBlack },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  card: { borderRadius: 18, borderWidth: 1, padding: 18 },
  avatarWrap: { marginBottom: 12 },
  avatar: { width: 104, height: 104, borderRadius: 52, borderWidth: 3 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarActions: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  avatarActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, height: 34, borderRadius: 10, borderWidth: 1,
  },
  avatarActionText: { fontSize: 12, fontFamily: FONTS.monoBold },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailText: { fontSize: 12, fontFamily: FONTS.mono, marginBottom: 12 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    paddingLeft: 14,
    paddingRight: 6,
  },
  nameInput: { flex: 1, height: 48, fontSize: 16, fontFamily: FONTS.mono },
  nameError: { fontSize: 11, fontFamily: FONTS.mono, marginTop: 6, marginLeft: 4 },
  nameSaveBtn: { width: 40, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 11, fontFamily: FONTS.monoBold, letterSpacing: 1 },
  outerSectionTitle: { fontSize: 11, fontFamily: FONTS.monoBold, letterSpacing: 1, marginBottom: -6, marginLeft: 4 },
  toggleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleLabel: { fontSize: 11, fontFamily: FONTS.mono },
  rankRow: { flexDirection: 'row', alignItems: 'center' },
  rankName: { fontSize: 20, fontFamily: FONTS.headingBlack },
  eloText: { fontSize: 24, fontFamily: FONTS.headingBlack, marginTop: 2 },
  wlRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  wlStat: { fontSize: 13, fontFamily: FONTS.monoBold },
  hint: { fontSize: 11, fontFamily: FONTS.mono, marginTop: 14, textAlign: 'center' },
  modeLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 },
  modeName: { fontSize: 14, fontFamily: FONTS.monoBold },
  modeRate: { fontSize: 15, fontFamily: FONTS.headingBlack },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  modeSub: { fontSize: 10, fontFamily: FONTS.mono, marginTop: 4 },
  recordsRow: { flexDirection: 'row', gap: 12 },
  recordCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'center', gap: 6 },
  recordLabel: { fontSize: 10, fontFamily: FONTS.mono, letterSpacing: 1 },
  recordValue: { fontSize: 24, fontFamily: FONTS.headingBlack },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#8b1a1a',
    height: 52,
    borderRadius: 14,
    marginTop: 4,
  },
  logoutText: { color: '#fff', fontSize: 15, fontFamily: FONTS.monoBold },
  adminBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
  },
  adminText: { fontSize: 15, fontFamily: FONTS.monoBold },
  linkBtn: { alignItems: 'center', paddingVertical: 8 },
  linkText: { fontSize: 13, fontFamily: FONTS.mono, textDecorationLine: 'underline' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    height: 48,
    borderRadius: 14,
  },
  deleteText: { color: '#8b1a1a', fontSize: 14, fontFamily: FONTS.monoBold },
});
