import { useEffect, useState } from 'react';
import { ScrollView, Share, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Award, Check, LogOut, Play, Share2 } from 'lucide-react-native';

import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../components/ToastProvider';
import { useCachedData } from '../lib/cache';
import { showAlert } from '../lib/alert';
import {
  fetchLeagueLeaderboard,
  leagueModesFor,
  leaveLeague,
  type League,
  type LeagueEntry,
  type LeaguePeriod,
} from '../lib/league';
import { dailyModeLabel, getLocalState, getTodayUTC, type DailyState } from '../lib/daily';
import { leagueLink } from '../lib/links';
import { track } from '../lib/analytics';
import { MODE_META } from './DailyHub';
import { LeagueReminderButton } from '../components/LeagueReminderButton';
import { Avatar } from '../components/Avatar';
import { AsyncState } from '../components/AsyncState';
import { ScoreText } from '../components/ScoreText';
import { commonStyles as styles } from '../theme/commonStyles';
import { PALETTE, getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, a11yImage, ICON_HIT_SLOP } from '../lib/a11y';
import type { GameMode, Language } from '../types';

const MEDAL_COLORS = ['#c4872a', '#7aa0c4', '#a08060'];

interface LeagueDetailProps {
  league: League;
  currentUserId: string;
  onPlayDaily: (mode: GameMode) => void;
  onBack: () => void;
  onOpenPlayer?: (userId: string, username?: string | null) => void;
}

const PERIODS: { key: LeaguePeriod; fr: string; en: string }[] = [
  { key: 'day', fr: 'Jour', en: 'Day' },
  { key: 'month', fr: 'Mois', en: 'Month' },
  { key: 'total', fr: 'Total', en: 'All-time' },
];

/** Invite text shared by the code button — a real join link, plus the code as
 *  a manual fallback for players who already have the app open. */
function inviteMessage(league: League, language: Language): string {
  return tr(
    language,
    `Rejoins ma ligue « ${league.name} » sur GeoG ! 3 défis géo par jour, on se classe entre nous.\n👉 ${leagueLink(league.code)}\n(ou entre le code ${league.code} dans l'app)`,
    `Join my league “${league.name}” on GeoG! 3 geo challenges a day, private leaderboard.\n👉 ${leagueLink(league.code)}\n(or enter code ${league.code} in the app)`,
  );
}

/**
 * One league: today's 3 drawn modes (play them like any daily), the invite
 * code, and the Day / Month / All-time leaderboards aggregated server-side.
 */
export default function LeagueDetail({
  league,
  currentUserId,
  onPlayDaily,
  onBack,
  onOpenPlayer,
}: LeagueDetailProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);

  const today = getTodayUTC();
  const modes = leagueModesFor(today);

  // Local daily state → "done + score" badges on today's mode cards. The screen
  // remounts when a daily run ends (the Router swaps back), so this is fresh.
  const [dailyState, setDailyState] = useState<DailyState | null>(null);
  useEffect(() => {
    track('league_opened');
    getLocalState().then(setDailyState);
  }, []);

  const [period, setPeriod] = useState<LeaguePeriod>('day');
  const { data, loading, refreshing, error, refetch } = useCachedData<LeagueEntry[]>(
    `league-lb:${league.id}:${period}`,
    () => fetchLeagueLeaderboard(league.id, period),
    { ttl: 0 },
  );
  const entries = data ?? [];

  const shareInvite = () => {
    track('league_invite_shared');
    Share.share({ message: inviteMessage(league, language) }).catch(() => {});
  };

  const confirmLeave = () => {
    showAlert(
      tr(language, 'Quitter la ligue ?', 'Leave the league?'),
      tr(
        language,
        `Tu ne verras plus le classement de « ${league.name} ».`,
        `You will no longer see “${league.name}”’s leaderboard.`,
      ),
      [
        { text: tr(language, 'Annuler', 'Cancel'), style: 'cancel' },
        {
          text: tr(language, 'Quitter', 'Leave'),
          style: 'destructive',
          onPress: async () => {
            const res = await leaveLeague(league.id);
            if (!res.ok) {
              toast.error(tr(language, 'Impossible de quitter la ligue.', 'Could not leave the league.'));
              return;
            }
            track('league_left');
            onBack();
          },
        },
      ],
    );
  };

  const doneCount = modes.filter((m) => dailyState?.results[m]).length;

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
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONTS.heading, color: c.text, fontSize: 20 }} numberOfLines={1}>
            {league.name}
          </Text>
          <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 10 }}>
            {tr(language, 'Code', 'Code')} {league.code}
          </Text>
        </View>
        <TouchableOpacity
          onPress={shareInvite}
          style={{ padding: 8 }}
          hitSlop={ICON_HIT_SLOP}
          {...a11yButton(tr(language, 'Inviter des amis', 'Invite friends'), {
            hint: tr(language, "Partager le code d'invitation", 'Share the invite code'),
          })}
        >
          <Share2 color={c.accent} size={20} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={confirmLeave}
          style={{ padding: 8 }}
          hitSlop={ICON_HIT_SLOP}
          {...a11yButton(tr(language, 'Quitter la ligue', 'Leave the league'))}
        >
          <LogOut color={c.textMuted} size={18} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50 }} showsVerticalScrollIndicator={false}>
        {/* Today's 3 drawn modes */}
        <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 11, marginBottom: 10 }}>
          {tr(language, `Défis du jour · ${doneCount}/${modes.length} faits`, `Today's challenges · ${doneCount}/${modes.length} done`)}
        </Text>
        <View style={{ gap: 10 }}>
          {modes.map((mode) => {
            const meta = MODE_META[mode];
            const Icon = meta.icon;
            const result = dailyState?.results[mode];
            const done = !!result;
            return (
              <TouchableOpacity
                key={mode}
                onPress={() => (done ? undefined : onPlayDaily(mode))}
                disabled={done}
                {...a11yButton(dailyModeLabel(mode, language), {
                  disabled: done,
                  hint: done
                    ? tr(language, 'Déjà joué aujourd’hui', 'Already played today')
                    : tr(language, 'Démarrer ce défi', 'Start this challenge'),
                })}
                style={[
                  styles.countryCard,
                  !isDarkMode && styles.countryCardLight,
                  {
                    padding: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderLeftWidth: 4,
                    borderLeftColor: meta.accent,
                    opacity: done ? 0.85 : 1,
                  },
                ]}
              >
                <View
                  style={{
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    padding: 10,
                    borderRadius: 12,
                  }}
                >
                  <Icon color={meta.accent} size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.countryName,
                      !isDarkMode && styles.countryNameLight,
                      { fontSize: 15, textAlign: 'left' },
                    ]}
                  >
                    {dailyModeLabel(mode, language)}
                  </Text>
                  <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 11 }}>
                    {done
                      ? `${tr(language, 'Fait', 'Done')} · ${result.score}${mode === 'classic' ? '%' : ''}`
                      : tr(language, 'À jouer', 'To play')}
                  </Text>
                </View>
                {done ? (
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: PALETTE.forestGreen,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Check color="#fff" size={15} />
                  </View>
                ) : (
                  <Play color={meta.accent} size={20} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Obvious opt-in for the 10:00 daily "play your league" reminder. */}
        <View style={{ marginTop: 14 }}>
          <LeagueReminderButton />
        </View>

        {/* Period tabs */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: c.surface,
            borderRadius: 13,
            borderWidth: 1,
            borderColor: c.border,
            padding: 4,
            marginTop: 22,
            marginBottom: 12,
          }}
        >
          {PERIODS.map((p) => {
            const active = p.key === period;
            return (
              <TouchableOpacity
                key={p.key}
                onPress={() => setPeriod(p.key)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 10,
                  alignItems: 'center',
                  backgroundColor: active ? c.accent : 'transparent',
                }}
                {...a11yButton(tr(language, p.fr, p.en), {
                  hint: tr(language, 'Afficher ce classement', 'Show this ranking'),
                  selected: active,
                })}
              >
                <Text
                  style={{
                    fontFamily: FONTS.monoBold,
                    fontSize: 12,
                    color: active ? '#fff' : c.textMuted,
                  }}
                >
                  {tr(language, p.fr, p.en)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Leaderboard — every member appears, 0 pts included. */}
        <AsyncState
          loading={loading || (refreshing && entries.length === 0)}
          error={error}
          onRetry={refetch}
          errorLabel={tr(language, 'Impossible de charger le classement.', 'Could not load the leaderboard.')}
        >
          <View style={{ gap: 8 }}>
            {entries.map((item, index) => {
              const isMe = item.userId === currentUserId;
              const rankLabel = tr(language, `Rang ${index + 1}`, `Rank ${index + 1}`);
              return (
                <TouchableOpacity
                  key={item.userId}
                  activeOpacity={onOpenPlayer ? 0.6 : 1}
                  disabled={!onOpenPlayer}
                  onPress={() => onOpenPlayer?.(item.userId, item.username)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 14,
                    borderWidth: isMe ? 2 : 1,
                    backgroundColor: c.card,
                    borderColor: isMe ? c.accent : c.border,
                  }}
                  {...a11yButton(
                    `${rankLabel}, ${item.username}${isMe ? tr(language, ' (toi)', ' (you)') : ''}`,
                    {
                      disabled: !onOpenPlayer,
                      hint: onOpenPlayer ? tr(language, 'Voir le profil', 'View profile') : undefined,
                    },
                  )}
                >
                  <View style={{ width: 34, alignItems: 'center' }}>
                    {index < 3 ? (
                      <Award size={24} color={MEDAL_COLORS[index]} {...a11yImage(rankLabel)} />
                    ) : (
                      <Text style={{ fontFamily: FONTS.monoBold, color: c.textMuted }}>{index + 1}</Text>
                    )}
                  </View>
                  <Avatar
                    config={item.avatarConfig}
                    photoUrl={item.avatarUrl}
                    username={item.username}
                    size={34}
                  />
                  <View style={{ flex: 1, paddingLeft: 10 }}>
                    <Text style={{ fontFamily: FONTS.heading, color: c.text }} numberOfLines={1}>
                      {item.username}
                      {isMe ? tr(language, ' (toi)', ' (you)') : ''}
                    </Text>
                    <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 10 }}>
                      {tr(language, `${item.played} défi(s) joué(s)`, `${item.played} challenge(s) played`)}
                    </Text>
                  </View>
                  <ScoreText style={{ fontFamily: FONTS.headingBlack, fontSize: 16, color: c.accent }}>
                    {`${item.total} pts`}
                  </ScoreText>
                </TouchableOpacity>
              );
            })}
            {entries.length === 0 ? (
              <Text
                style={{
                  textAlign: 'center',
                  marginTop: 20,
                  fontFamily: FONTS.mono,
                  color: c.textMuted,
                  fontSize: 12,
                }}
              >
                {tr(language, 'Personne au classement pour le moment.', 'Nobody on the board yet.')}
              </Text>
            ) : null}
          </View>
        </AsyncState>
      </ScrollView>
    </SafeAreaView>
  );
}
