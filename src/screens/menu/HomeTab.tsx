/**
 * Onglet « Accueil » : un seul rendez-vous par jour.
 *
 * Le GeoG du jour (un puzzle, le même pour tous, partageable) avec la série,
 * puis les amis (défi en différé), le Mode Histoire là où on s'est arrêté et
 * les quêtes. La liste complète des modes vit dans l'onglet Jouer, les 14
 * autres puzzles du jour dans le hub du défi. Voir src/lib/featuredDaily.ts.
 */
import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import {
  CalendarDays,
  ChevronRight,
  LogIn,
  Map,
  Play,
  Send,
  Share2,
  UserPlus,
  X,
} from 'lucide-react-native';

import type { GameMode, Language } from '../../types';
import { STORY_LEVEL_COUNT } from '../../data/story';
import { GHOST_SCHEDULE } from '../../data/ghostCountries';
import {
  dailyModeLabel,
  getLocalState,
  getPuzzleNumber,
  getTodayUTC,
  type DailyState,
} from '../../lib/daily';
import { bonusProgress, featuredDailyMode } from '../../lib/featuredDaily';
import { prefetchReferralCode, shareDailyResult } from '../../lib/shareDaily';
import { getStorySnapshot } from '../../lib/story';
import { useMenuGrid } from '../../components/menu/ModeTiles';
import { FriendChallengePanel } from '../../components/FriendChallengePanel';
import { DailyQuests } from '../../components/DailyQuests';
import { AtlasFlame } from '../../components/AtlasIcons';
import { ScoreText } from '../../components/ScoreText';
import { commonStyles as styles } from '../../theme/commonStyles';
import { PALETTE, getColors } from '../../theme/colors';
import { FONTS } from '../../theme/typography';
import { tr } from '../../i18n';
import { useLanguage } from '../../contexts/LanguageContext';
import { a11yButton, a11yImage, ICON_HIT_SLOP } from '../../lib/a11y';
import { hoverLift } from '../../lib/webHover';

/** Accent du défi du jour (flamme), comme sur l'écran du défi. */
export const DAILY_FLAME = '#e8772e';

interface HomeTabProps {
  isDarkMode: boolean;
  isAuthenticated: boolean;
  /** Le hub du défi du jour (les 15 puzzles). */
  onOpenDaily: () => void;
  /** Lance directement un puzzle du jour (le GeoG du jour). */
  onPlayDaily: (mode: GameMode) => void;
  onOpenStory: () => void;
  onOpenSignup: () => void;
  onOpenAuth: () => void;
  /** Le tour guidé de premier lancement vise la carte du défi du jour. */
  dailyRef: React.Ref<View>;
  refreshKey: number;
}

/** Secondes avant le prochain défi (minuit UTC). */
function secondsToNextDaily(): number {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(0, Math.floor((next - now.getTime()) / 1000));
}

/** Compte à rebours isolé : le tic d'une seconde ne redessine que lui. */
function DailyCountdown({ color, language }: { color: string; language: Language }) {
  const [left, setLeft] = useState(secondsToNextDaily);
  useEffect(() => {
    const id = setInterval(() => setLeft(secondsToNextDaily()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const text = `${pad(Math.floor(left / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`;
  return (
    <Text
      style={{ fontFamily: FONTS.monoBold, color, fontSize: 11, fontVariant: ['tabular-nums'] }}
      {...a11yImage(tr(language, 'Prochain défi dans {0}', 'Next challenge in {0}', [text]))}
    >
      {text}
    </Text>
  );
}

export function HomeTab({
  isDarkMode,
  isAuthenticated,
  onOpenDaily,
  onPlayDaily,
  onOpenStory,
  onOpenSignup,
  onOpenAuth,
  dailyRef,
  refreshKey,
}: HomeTabProps) {
  const c = getColors(isDarkMode);
  const { language } = useLanguage();
  const grid = useMenuGrid();

  // Défi du jour : série et modes faits aujourd'hui (cache local, marche déconnecté).
  const [daily, setDaily] = useState<DailyState>({
    streak: 0,
    best: 0,
    todayCount: 0,
    results: {},
  });
  useEffect(() => {
    let alive = true;
    getLocalState().then((s) => {
      if (alive) setDaily(s);
    });
    // Le partage doit s'ouvrir sans attente au tap (voir shareDaily.ts).
    prefetchReferralCode();
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  // Mode Histoire : niveau atteint et étoiles (instantané local, affichage seul).
  const [story, setStory] = useState({ level: 0, stars: 0 });
  useEffect(() => {
    let alive = true;
    getStorySnapshot(null).then((s) => {
      if (alive)
        setStory({
          level: s.maxLevel,
          stars: Object.values(s.stars).reduce((sum, n) => sum + n, 0),
        });
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  // Inscription : bandeau masquable pour la session seulement.
  const [signupDismissed, setSignupDismissed] = useState(false);

  const [friendsOpen, setFriendsOpen] = useState(false);

  const today = getTodayUTC();
  const featured = featuredDailyMode(today);
  const featuredResult = daily.results[featured];
  const bonus = bonusProgress(daily, featured);
  const halloween = !!GHOST_SCHEDULE[today];
  const storyBlue = isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue;

  return (
    <View style={{ width: '100%', maxWidth: grid.col, gap: 14, marginTop: 14 }}>
      {!isAuthenticated && !signupDismissed && (
        <View
          style={{
            borderRadius: 18,
            borderWidth: 2,
            borderColor: c.accent,
            backgroundColor: isDarkMode ? c.surface : PALETTE.parchmentDark,
            padding: 16,
          }}
        >
          <TouchableOpacity
            onPress={() => setSignupDismissed(true)}
            style={{ position: 'absolute', top: 8, right: 8, padding: 6, zIndex: 2 }}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(tr(language, 'Masquer', 'Dismiss'))}
          >
            <X color={c.textFaint} size={16} />
          </TouchableOpacity>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              marginBottom: 12,
              paddingRight: 20,
            }}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: c.accentStrong,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UserPlus color="#fff" size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.headingBlack, fontSize: 16, color: c.text }}>
                {tr(language, 'Crée ton compte gratuit', 'Create your free account')}
              </Text>
              <Text
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 11.5,
                  color: c.textMuted,
                  marginTop: 2,
                  lineHeight: 16,
                }}
              >
                {tr(
                  language,
                  'Sauvegarde ta progression, joue en ligne, gagne des pièces et grimpe au classement.',
                  'Save your progress, play online, earn coins and climb the leaderboard.',
                )}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={onOpenSignup}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 12,
                backgroundColor: c.accentStrong,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
              {...a11yButton(tr(language, "S'inscrire", 'Sign up'))}
            >
              <UserPlus color="#fff" size={18} />
              <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 14 }}>
                {tr(language, "S'inscrire", 'Sign up')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onOpenAuth}
              style={{
                height: 44,
                paddingHorizontal: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: c.border,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
              {...a11yButton(tr(language, 'Se connecter', 'Log in'))}
            >
              <LogIn color={c.text} size={16} />
              <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 13 }}>
                {tr(language, 'Connexion', 'Log in')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* GeoG du jour : un puzzle, le même pour tous, la première chose qu'on voit. */}
      <TouchableOpacity
        ref={dailyRef}
        onPress={() => (featuredResult ? onOpenDaily() : onPlayDaily(featured))}
        style={{
          borderRadius: 20,
          borderWidth: 2,
          borderColor: DAILY_FLAME,
          backgroundColor: isDarkMode ? 'rgba(232,119,46,0.12)' : 'rgba(232,119,46,0.13)',
          padding: 16,
        }}
        {...a11yButton(tr(language, 'GeoG du jour #{0}', 'Daily GeoG #{0}', [getPuzzleNumber()]), {
          hint: featuredResult
            ? tr(language, 'Voir les puzzles bonus du jour', "See today's bonus puzzles")
            : tr(language, 'Jouer le puzzle du jour', "Play today's puzzle"),
        })}
        {...hoverLift}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CalendarDays color={DAILY_FLAME} size={18} />
          <Text
            style={{
              fontFamily: FONTS.monoBold,
              color: DAILY_FLAME,
              fontSize: 11,
              letterSpacing: 1.2,
              flex: 1,
            }}
          >
            {tr(language, 'GEOG DU JOUR', 'DAILY GEOG')} #{getPuzzleNumber()}
          </Text>
          <DailyCountdown color={c.textMuted} language={language} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <Text
            style={{ fontFamily: FONTS.headingBlack, fontSize: 24, color: c.text, flex: 1 }}
            numberOfLines={2}
          >
            {dailyModeLabel(featured, language, today)}
          </Text>
          {daily.streak > 0 && (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
              {...a11yImage(tr(language, 'Série de {0} jours', '{0}-day streak', [daily.streak]))}
            >
              <AtlasFlame color={DAILY_FLAME} size={18} />
              <ScoreText
                style={{ fontFamily: FONTS.headingBlack, color: DAILY_FLAME, fontSize: 20 }}
              >
                {daily.streak}
              </ScoreText>
            </View>
          )}
        </View>
        <Text
          style={{
            fontFamily: FONTS.mono,
            color: c.textMuted,
            fontSize: 11,
            marginTop: 4,
            marginBottom: 14,
          }}
        >
          {featuredResult
            ? tr(
                language,
                'Ton score : {0}. Reviens demain pour le #{1}.',
                'Your score: {0}. Back tomorrow for #{1}.',
                [featuredResult.score, getPuzzleNumber() + 1],
              )
            : halloween
              ? tr(
                  language,
                  '🎃 Spécial Halloween : pays fantômes',
                  '🎃 Halloween special: ghost countries',
                )
              : tr(
                  language,
                  'Le même puzzle pour tout le monde, une seule fois par jour.',
                  'The same puzzle for everyone, once a day.',
                )}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={onOpenDaily}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 }}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(
              tr(language, 'Puzzles bonus, {0} sur {1}', 'Bonus puzzles, {0} of {1}', [
                bonus.done,
                bonus.total,
              ]),
            )}
          >
            <Text style={{ fontFamily: FONTS.monoBold, color: c.textMuted, fontSize: 11 }}>
              {tr(language, 'Bonus {0}/{1}', 'Bonus {0}/{1}', [bonus.done, bonus.total])}
            </Text>
            <ChevronRight color={c.textMuted} size={14} />
          </TouchableOpacity>
          {featuredResult ? (
            <TouchableOpacity
              onPress={() => shareDailyResult(featuredResult, daily.streak, language, featured)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 36,
                paddingHorizontal: 14,
                borderRadius: 18,
                backgroundColor: PALETTE.vermilion,
              }}
              {...a11yButton(tr(language, 'Partager mon résultat', 'Share my result'))}
            >
              <Share2 color="#fff" size={14} />
              <Text style={{ fontFamily: FONTS.monoBold, color: '#fff', fontSize: 12.5 }}>
                {tr(language, 'Partager', 'Share')}
              </Text>
            </TouchableOpacity>
          ) : (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 36,
                paddingHorizontal: 14,
                borderRadius: 18,
                backgroundColor: PALETTE.vermilion,
              }}
            >
              <Play color="#fff" fill="#fff" size={13} />
              <Text style={{ fontFamily: FONTS.monoBold, color: '#fff', fontSize: 12.5 }}>
                {tr(language, 'Jouer', 'Play')}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Amis : le défi en différé (les joueurs qui ont un ami restent 3 fois plus). */}
      {isAuthenticated && (
        <TouchableOpacity
          onPress={() => setFriendsOpen(true)}
          style={[
            styles.countryCard,
            !isDarkMode && styles.countryCardLight,
            {
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              borderWidth: 2,
              borderColor: PALETTE.vermilion,
            },
          ]}
          {...a11yButton(tr(language, 'Défier un ami', 'Challenge a friend'))}
          {...hoverLift}
        >
          <View
            style={{
              backgroundColor: 'rgba(192,74,26,0.14)',
              padding: 10,
              borderRadius: 12,
            }}
          >
            <Send color={PALETTE.vermilion} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.headingBlack, fontSize: 16, color: c.text }}>
              {tr(language, 'Défie un ami', 'Challenge a friend')}
            </Text>
            <Text
              style={{
                fontFamily: FONTS.mono,
                fontSize: 11,
                color: c.textMuted,
                marginTop: 2,
                lineHeight: 15,
              }}
            >
              {tr(
                language,
                'Même grille, il joue quand il veut. Ses réponses arrivent ici.',
                'Same grid, they play whenever. Their answers land here.',
              )}
            </Text>
          </View>
          <ChevronRight color={c.textMuted} size={18} />
        </TouchableOpacity>
      )}
      <FriendChallengePanel
        visible={friendsOpen}
        isDarkMode={isDarkMode}
        onClose={() => setFriendsOpen(false)}
      />

      {/* Mode Histoire — reprendre la campagne là où on s'est arrêté. */}
      <TouchableOpacity
        onPress={onOpenStory}
        style={[
          styles.countryCard,
          !isDarkMode && styles.countryCardLight,
          {
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            borderWidth: 2,
            borderColor: storyBlue,
            backgroundColor: isDarkMode ? 'rgba(26,74,122,0.16)' : 'rgba(26,74,122,0.10)',
          },
        ]}
        {...a11yButton(tr(language, 'Mode Histoire', 'Story Mode'), {
          hint: tr(language, 'Ouvrir la campagne de {0} niveaux', 'Open the {0}-level campaign', [
            STORY_LEVEL_COUNT,
          ]),
        })}
        {...hoverLift}
      >
        <View
          style={{
            backgroundColor: isDarkMode ? 'rgba(74,158,255,0.18)' : 'rgba(26,74,122,0.16)',
            padding: 11,
            borderRadius: 12,
          }}
        >
          <Map color={storyBlue} size={26} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: FONTS.monoBold,
              color: c.textMuted,
              fontSize: 9.5,
              letterSpacing: 1.2,
            }}
          >
            {story.level > 0
              ? tr(language, 'REPRENDRE · MODE HISTOIRE', 'RESUME · STORY MODE')
              : tr(language, 'MODE HISTOIRE', 'STORY MODE')}
          </Text>
          <Text
            style={[
              styles.countryName,
              { fontSize: 18, textAlign: 'left', marginTop: 2, color: storyBlue },
            ]}
          >
            {story.level > 0
              ? tr(language, 'Niveau {0} / {1}', 'Level {0} / {1}', [
                  Math.min(story.level + 1, STORY_LEVEL_COUNT),
                  STORY_LEVEL_COUNT,
                ])
              : tr(language, '{0} niveaux, de plus en plus durs', '{0} levels, harder and harder', [
                  STORY_LEVEL_COUNT,
                ])}
          </Text>
          {story.level > 0 && (
            <View
              style={{
                marginTop: 7,
                height: 5,
                borderRadius: 3,
                backgroundColor: isDarkMode ? 'rgba(74,158,255,0.18)' : 'rgba(26,74,122,0.14)',
                overflow: 'hidden',
              }}
              {...a11yImage(
                tr(language, 'Progression : niveau {0} sur {1}', 'Progress: level {0} of {1}', [
                  story.level,
                  STORY_LEVEL_COUNT,
                ]),
              )}
            >
              <View
                style={{
                  height: '100%',
                  width: `${Math.min(100, (story.level / STORY_LEVEL_COUNT) * 100)}%`,
                  borderRadius: 3,
                  backgroundColor: storyBlue,
                }}
              />
            </View>
          )}
        </View>
        {story.level > 0 && (
          <Text
            style={{ fontFamily: FONTS.monoBold, color: PALETTE.sand, fontSize: 12 }}
            {...a11yImage(tr(language, '{0} étoiles', '{0} stars', [story.stars]))}
          >
            ★ {story.stars}
          </Text>
        )}
      </TouchableOpacity>

      {/* Quêtes du jour (comptes seulement : la validation est côté serveur). */}
      {isAuthenticated && <DailyQuests />}
    </View>
  );
}
