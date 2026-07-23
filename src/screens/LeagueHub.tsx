import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ChevronRight, Crown, Plus, Ticket, Users } from 'lucide-react-native';

import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../components/ToastProvider';
import { useCachedData } from '../lib/cache';
import {
  createLeague,
  getMyLeagues,
  joinLeague,
  type League,
  type LeagueFailReason,
} from '../lib/league';
import { track } from '../lib/analytics';
import { LeagueReminderButton } from '../components/LeagueReminderButton';
import { commonStyles as styles } from '../theme/commonStyles';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';
import { AsyncState } from '../components/AsyncState';
import type { Language } from '../types';

interface LeagueHubProps {
  onBack: () => void;
  onOpenLeague: (league: League) => void;
  /** The signed-in user's id — flags the leagues they own with a crown. */
  currentUserId: string;
}

/** Human copy for the create/join RPC failure reasons. */
function failCopy(reason: LeagueFailReason | undefined, language: Language): string {
  switch (reason) {
    case 'bad_name':
      return tr(language, 'Nom invalide (1 à 30 caractères).', 'Invalid name (1 to 30 characters).');
    case 'too_many_leagues':
      return tr(language, 'Tu es déjà dans trop de ligues (20 max).', 'You are already in too many leagues (20 max).');
    case 'invalid_code':
      return tr(language, 'Code invalide — vérifie auprès de ton ami.', 'Invalid code — double-check with your friend.');
    case 'already_member':
      return tr(language, 'Tu es déjà membre de cette ligue.', 'You are already a member of this league.');
    case 'full':
      return tr(language, 'Cette ligue est complète (50 membres max).', 'This league is full (50 members max).');
    default:
      return tr(language, 'Une erreur est survenue. Réessaie.', 'Something went wrong. Try again.');
  }
}

/**
 * Ligues hub: the signed-in player's leagues, plus create-by-name and
 * join-by-code forms. A league is a private friend group ranked on the 3 daily
 * modes drawn each day (see src/lib/league.ts).
 */
export default function LeagueHub({ onBack, onOpenLeague, currentUserId }: LeagueHubProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);

  const { data, loading, error, refetch } = useCachedData<League[]>(
    'my-leagues',
    getMyLeagues,
    { ttl: 0 },
  );
  const leagues = data ?? [];

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submitCreate = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    const res = await createLeague(name);
    setBusy(false);
    if (!res.ok || !res.league) {
      toast.error(failCopy(res.reason, language));
      return;
    }
    track('league_created');
    setName('');
    refetch();
    // Jump straight into the fresh league — inviting friends is the next step.
    onOpenLeague({
      id: res.league.id,
      name: res.league.name,
      code: res.league.code,
      ownerId: currentUserId,
      memberCount: 1,
      createdAt: new Date().toISOString(),
    });
  };

  const submitJoin = async () => {
    if (busy || !code.trim()) return;
    setBusy(true);
    const res = await joinLeague(code);
    setBusy(false);
    if (!res.ok) {
      toast.error(failCopy(res.reason, language));
      return;
    }
    track('league_joined');
    setCode('');
    toast.success(
      tr(language, `Bienvenue dans « ${res.league?.name} » !`, `Welcome to “${res.league?.name}”!`),
    );
    refetch();
  };

  const inputStyle = {
    flex: 1,
    height: 46,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontFamily: FONTS.mono,
    fontSize: 14,
    backgroundColor: c.card,
    borderColor: c.border,
    color: c.text,
  } as const;

  return (
    <SafeAreaView style={[styles.container, !isDarkMode && styles.containerLight, { flex: 1 }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 20,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }]}
          hitSlop={ICON_HIT_SLOP}
          {...a11yButton(tr(language, 'Retour', 'Back'))}
        >
          <ArrowLeft color={c.text} size={18} />
        </TouchableOpacity>
        <Text style={{ fontFamily: FONTS.heading, color: c.text, fontSize: 20, flex: 1 }}>
          {tr(language, 'Ligues', 'Leagues')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 50, gap: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 11, lineHeight: 17 }}>
          {tr(
            language,
            'Crée une ligue avec tes amis : 3 défis identiques chaque jour, classement du jour, du mois et général.',
            'Create a league with your friends: 3 identical challenges every day, with daily, monthly and all-time rankings.',
          )}
        </Text>

        {/* Create */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            style={inputStyle}
            placeholder={tr(language, 'Nom de la nouvelle ligue…', 'New league name…')}
            placeholderTextColor={c.textFaint}
            value={name}
            onChangeText={setName}
            maxLength={30}
            onSubmitEditing={submitCreate}
            returnKeyType="done"
          />
          <TouchableOpacity
            onPress={submitCreate}
            disabled={busy || !name.trim()}
            style={{
              height: 46,
              paddingHorizontal: 14,
              borderRadius: 13,
              backgroundColor: c.accent,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
              opacity: busy || !name.trim() ? 0.5 : 1,
            }}
            {...a11yButton(tr(language, 'Créer la ligue', 'Create the league'))}
          >
            <Plus color="#fff" size={16} />
            <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 13 }}>
              {tr(language, 'Créer', 'Create')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Join by code */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            style={inputStyle}
            placeholder={tr(language, "Code d'invitation…", 'Invite code…')}
            placeholderTextColor={c.textFaint}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            onSubmitEditing={submitJoin}
            returnKeyType="done"
          />
          <TouchableOpacity
            onPress={submitJoin}
            disabled={busy || !code.trim()}
            style={{
              height: 46,
              paddingHorizontal: 14,
              borderRadius: 13,
              borderWidth: 1,
              borderColor: c.accent,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
              opacity: busy || !code.trim() ? 0.5 : 1,
            }}
            {...a11yButton(tr(language, 'Rejoindre avec ce code', 'Join with this code'))}
          >
            <Ticket color={c.accent} size={16} />
            <Text style={{ color: c.accent, fontFamily: FONTS.monoBold, fontSize: 13 }}>
              {tr(language, 'Rejoindre', 'Join')}
            </Text>
          </TouchableOpacity>
        </View>

        {busy ? <ActivityIndicator color={c.accent} /> : null}

        {/* Obvious opt-in for the 10:00 "play your league" reminder — only once
            the player actually has a league to be reminded about. */}
        {leagues.length > 0 ? <LeagueReminderButton /> : null}

        <View style={{ height: 1, backgroundColor: c.border, opacity: 0.5, marginVertical: 6 }} />

        {/* My leagues */}
        <AsyncState
          loading={loading}
          error={error}
          onRetry={refetch}
          errorLabel={tr(language, 'Impossible de charger tes ligues.', 'Could not load your leagues.')}
        >
          {leagues.length === 0 ? (
            <Text
              style={{
                textAlign: 'center',
                marginTop: 30,
                fontFamily: FONTS.mono,
                color: c.textMuted,
                fontSize: 12,
                lineHeight: 18,
              }}
            >
              {tr(
                language,
                'Aucune ligue pour le moment.\nCrée la tienne ou rejoins celle d’un ami !',
                'No league yet.\nCreate yours or join a friend’s!',
              )}
            </Text>
          ) : (
            <View style={{ gap: 12 }}>
              {leagues.map((l) => (
                <TouchableOpacity
                  key={l.id}
                  onPress={() => onOpenLeague(l)}
                  style={[
                    styles.countryCard,
                    !isDarkMode && styles.countryCardLight,
                    { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
                  ]}
                  {...a11yButton(l.name, {
                    hint: tr(language, 'Ouvrir cette ligue', 'Open this league'),
                  })}
                >
                  <View
                    style={{
                      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                      padding: 11,
                      borderRadius: 12,
                    }}
                  >
                    <Users color={c.accent} size={24} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text
                        style={[
                          styles.countryName,
                          !isDarkMode && styles.countryNameLight,
                          { fontSize: 16, textAlign: 'left' },
                        ]}
                        numberOfLines={1}
                      >
                        {l.name}
                      </Text>
                      {l.ownerId === currentUserId ? <Crown color="#c4872a" size={14} /> : null}
                    </View>
                    <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 11 }}>
                      {tr(language, `${l.memberCount} membre(s)`, `${l.memberCount} member(s)`)} · {l.code}
                    </Text>
                  </View>
                  <ChevronRight color={c.textMuted} size={20} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </AsyncState>
      </ScrollView>
    </SafeAreaView>
  );
}
