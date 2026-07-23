import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  Flag,
  Globe,
  HelpCircle,
  Info,
  LayoutGrid,
  Lock,
  LogIn,
  Map,
  Monitor,
  Moon,
  ShoppingBag,
  Puzzle,
  Route,
  SlidersHorizontal,
  Sun,
  Swords,
  TrendingUp,
  Trophy,
  User,
  UserPlus,
  Users,
  Wifi,
  X,
  Zap,
} from 'lucide-react-native';
import { AtlasFlame } from '../components/AtlasIcons';
import { MenuGlobe } from '../components/MenuGlobe';
import type { ComponentType } from 'react';

import type { GameMode, MatchMode } from '../types';
import { commonStyles as styles } from '../theme/commonStyles';
import { PALETTE, getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { CompassRose, CoordLabel } from '../theme/decorative';
import { tr } from '../i18n';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getLocalState } from '../lib/daily';
import { getStorySnapshot } from '../lib/story';
import { STORY_LEVEL_COUNT } from '../data/story';
import { a11yButton, a11yImage, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';
import { NotificationDot } from '../components/NotificationDot';
import { OnboardingTutorial, ONBOARDING_STEPS, type TutorialRect } from '../components/OnboardingTutorial';
import { ModeIntroCard } from '../components/ModeIntroModal';
import { getHasSeenTutorial, setHasSeenTutorial } from '../lib/tutorial';

export type PlayType = 'solo' | 'local' | 'online';

/** Flame accent for the daily-challenge hero + streak badge. */
const DAILY_FLAME = '#e8772e';

interface ModeCardProps {
  icon: ComponentType<{ color: string; size: number }>;
  accent: string;
  tint: string;
  title: string;
  subtitle: string;
  isDarkMode: boolean;
  onPress: () => void;
  onLeaderboard?: () => void;
  /** Show a "?" button that opens this mode's "how to play" card. */
  onHelp?: () => void;
  /** Show a notification dot on the card (e.g. a pending invite for this mode). */
  notify?: boolean;
}

function ModeCard({ icon: Icon, accent, tint, title, subtitle, isDarkMode, onPress, onLeaderboard, onHelp, notify = false }: ModeCardProps) {
  const c = getColors(isDarkMode);
  const { language } = useLanguage();
  const startHint = tr(language, 'Démarrer ce mode', 'Start this mode');
  const cardStyle = [
    styles.countryCard,
    !isDarkMode && styles.countryCardLight,
    {
      padding: 18,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 15,
      borderLeftWidth: 4,
      borderLeftColor: accent,
    },
  ];

  const inner = (
    <>
      <View style={{ backgroundColor: tint, padding: 12, borderRadius: 12 }}>
        <Icon color={accent} size={28} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.countryName,
            !isDarkMode && styles.countryNameLight,
            { fontSize: 17, textAlign: 'left', marginBottom: 3 },
          ]}
        >
          {title}
        </Text>
        <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 10 }}>{subtitle}</Text>
      </View>
    </>
  );

  if (!onLeaderboard && !onHelp) {
    return (
      <TouchableOpacity onPress={onPress} style={cardStyle} {...a11yButton(title, { hint: startHint })}>
        {inner}
        <NotificationDot show={notify} />
      </TouchableOpacity>
    );
  }

  // Square action button beside the card, matching the leaderboard button.
  const actionBtnStyle = {
    padding: 14,
    borderRadius: 14,
    backgroundColor: tint,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <TouchableOpacity onPress={onPress} style={[...cardStyle, { flex: 1 }]} {...a11yButton(title, { hint: startHint })}>
        {inner}
        <NotificationDot show={notify} />
      </TouchableOpacity>
      {onHelp && (
        <TouchableOpacity
          onPress={onHelp}
          style={actionBtnStyle}
          {...a11yButton(tr(language, `Comment jouer à ${title}`, `How to play ${title}`), {
            hint: tr(language, 'Voir les règles de ce mode', 'See this mode’s rules'),
          })}
        >
          <HelpCircle color={accent} size={20} />
        </TouchableOpacity>
      )}
      {onLeaderboard && (
        <TouchableOpacity
          onPress={onLeaderboard}
          style={actionBtnStyle}
          {...a11yButton(tr(language, `Classement ${title}`, `${title} leaderboard`))}
        >
          <Trophy color={accent} size={20} />
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Seconds until the next daily challenge (UTC midnight). */
function secondsToNextDaily(): number {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(0, Math.floor((next - now.getTime()) / 1000));
}

/** Live HH:MM:SS countdown to the next daily — isolated so the 1s tick only
 *  re-renders this small block, never the whole menu. */
function DailyCountdown({ color, labelColor, language }: { color: string; labelColor: string; language: 'fr' | 'en' }) {
  const [left, setLeft] = useState(secondsToNextDaily);
  useEffect(() => {
    const id = setInterval(() => setLeft(secondsToNextDaily()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const text = `${pad(Math.floor(left / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`;
  return (
    <View
      style={{ alignItems: 'center' }}
      {...a11yImage(tr(language, `Prochain défi dans ${text}`, `Next challenge in ${text}`))}
    >
      <Text style={{ fontFamily: FONTS.monoBold, color, fontSize: 13, fontVariant: ['tabular-nums'] }}>{text}</Text>
      <Text style={{ fontFamily: FONTS.mono, color: labelColor, fontSize: 7, letterSpacing: 1 }}>
        {tr(language, 'PROCHAIN DÉFI', 'NEXT CHALLENGE')}
      </Text>
    </View>
  );
}

interface ModeTileProps {
  icon: ComponentType<{ color: string; size: number }>;
  accent: string;
  tint: string;
  title: string;
  subtitle: string;
  isDarkMode: boolean;
  onPress: () => void;
  onHelp?: () => void;
}

/** Compact 2-column grid tile for the solo mode list. */
function ModeTile({ icon: Icon, accent, tint, title, subtitle, isDarkMode, onPress, onHelp }: ModeTileProps) {
  const c = getColors(isDarkMode);
  const { language } = useLanguage();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.countryCard,
        !isDarkMode && styles.countryCardLight,
        {
          width: '48.4%',
          padding: 13,
          alignItems: 'flex-start',
          gap: 8,
          borderBottomWidth: 3,
          borderBottomColor: accent,
        },
      ]}
      {...a11yButton(title, { hint: tr(language, 'Démarrer ce mode', 'Start this mode') })}
    >
      {onHelp && (
        <TouchableOpacity
          onPress={onHelp}
          hitSlop={ICON_HIT_SLOP}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 1,
            borderColor: c.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          {...a11yButton(tr(language, `Comment jouer à ${title}`, `How to play ${title}`), {
            hint: tr(language, 'Voir les règles de ce mode', 'See this mode’s rules'),
          })}
        >
          <HelpCircle color={c.textFaint} size={13} />
        </TouchableOpacity>
      )}
      <View style={{ backgroundColor: tint, padding: 9, borderRadius: 10 }}>
        <Icon color={accent} size={20} />
      </View>
      <View>
        <Text style={[styles.countryName, !isDarkMode && styles.countryNameLight, { fontSize: 14.5, textAlign: 'left', marginBottom: 2 }]}>
          {title}
        </Text>
        <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 8.5, lineHeight: 12 }}>{subtitle}</Text>
      </View>
    </TouchableOpacity>
  );
}

/** Segmented Solo / Local / En Ligne tab bar with a sliding thumb. */
function PlayTabs({
  index,
  onSelect,
  isDarkMode,
  notifyOnline,
}: {
  index: number;
  onSelect: (i: number) => void;
  isDarkMode: boolean;
  notifyOnline: boolean;
}) {
  const c = getColors(isDarkMode);
  const { language } = useLanguage();
  const [w, setW] = useState(0);
  const [slideX] = useState(() => new Animated.Value(0));
  const thumbColor = isDarkMode ? PALETTE.chartBlue : PALETTE.sepia;

  useEffect(() => {
    Animated.timing(slideX, {
      toValue: (index * w) / 3,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [index, w, slideX]);

  const tabs: { icon: ComponentType<{ color: string; size: number }>; label: string; notify?: boolean }[] = [
    { icon: User, label: 'Solo' },
    { icon: Monitor, label: 'Local' },
    { icon: Wifi, label: tr(language, 'En Ligne', 'Online'), notify: notifyOnline },
  ];

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width - 8)}
      style={{
        width: '100%',
        maxWidth: 400,
        flexDirection: 'row',
        borderWidth: 1.5,
        borderColor: c.border,
        borderRadius: 14,
        backgroundColor: isDarkMode ? c.card : PALETTE.parchmentDark,
        padding: 4,
        position: 'relative',
      }}
    >
      {w > 0 && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 4,
            bottom: 4,
            left: 4,
            width: w / 3,
            borderRadius: 10,
            backgroundColor: thumbColor,
            transform: [{ translateX: slideX }],
          }}
        />
      )}
      {tabs.map((t, i) => {
        const active = i === index;
        const TabIcon = t.icon;
        const color = active ? '#fff' : c.textMuted;
        return (
          <TouchableOpacity
            key={t.label}
            onPress={() => onSelect(i)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 10,
            }}
            {...a11yButton(t.label, {
              hint: tr(language, 'Afficher cet onglet', 'Show this tab'),
              selected: active,
            })}
          >
            <TabIcon color={color} size={15} />
            <Text style={{ fontFamily: FONTS.monoBold, color, fontSize: 12 }}>{t.label}</Text>
            <NotificationDot show={!!t.notify && !active} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface MainMenuProps {
  isAuthenticated: boolean;
  onOpenAuth: () => void;
  /** Opens the auth modal straight on the sign-up screen (banner CTA). */
  onOpenSignup: () => void;
  onOpenShop: () => void;
  onOpenFriends: () => void;
  onOpenLeaderboard: () => void;
  onOpenOnlineModeLeaderboard: (mode: MatchMode, accent: string) => void;
  onPlay: (mode: GameMode) => void;
  onPlayOnline: (mode: MatchMode) => void;
  onPlayCustomOnline: () => void;
  onPlayRanked: () => void;
  /** Opens the friend-leagues hub (3 daily challenges, private leaderboards). */
  onOpenLeague: () => void;
  onOpenDaily: () => void;
  onOpenStory: () => void;
  /** Which play-type sub-list is open (null = the play-type chooser). Lifted to
   *  App so it survives launching a game — returning lands on the same list. */
  playType: PlayType | null;
  onChangePlayType: (playType: PlayType | null) => void;
  /** Incoming friend-request count — shown as a dot on the Friends icon. */
  pendingFriendCount?: number;
  /** Mode of a pending game invite — dots the Online card and that mode. */
  incomingInviteMode?: MatchMode | null;
}

export function MainMenu({
  isAuthenticated,
  onOpenAuth,
  onOpenSignup,
  onOpenShop,
  onOpenFriends,
  onOpenLeaderboard,
  onOpenOnlineModeLeaderboard,
  onPlay,
  onPlayOnline,
  onPlayCustomOnline,
  onPlayRanked,
  onOpenLeague,
  onOpenDaily,
  onOpenStory,
  playType,
  onChangePlayType: setPlayType,
  pendingFriendCount = 0,
  incomingInviteMode = null,
}: MainMenuProps) {
  const { isDarkMode, toggleTheme } = useTheme();
  const { language, toggleLanguage } = useLanguage();
  const c = getColors(isDarkMode);
  const iconColor = c.text;
  const accent = c.accent;

  // Daily streak badge — read from the local cache (works logged-out too).
  const [dailyStreak, setDailyStreak] = useState(0);
  useEffect(() => {
    getLocalState().then((s) => setDailyStreak(s.streak));
  }, []);

  // Story progress for the campaign card — local snapshot, display only.
  // `user: null` reads the device cache, which recordLevel keeps in sync.
  const [storyLevel, setStoryLevel] = useState(0);
  const [storyStars, setStoryStars] = useState(0);
  useEffect(() => {
    let mounted = true;
    getStorySnapshot(null).then((s) => {
      if (!mounted) return;
      setStoryLevel(s.maxLevel);
      setStoryStars(Object.values(s.stars).reduce((sum, n) => sum + n, 0));
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Decorative globe sizing — planet rising behind the title.
  const { width: windowWidth } = useWindowDimensions();
  const globeSize = Math.min(windowWidth * 0.7, 300);

  // Tab index mapping: `playType` stays lifted in App (back gesture resets it
  // to null, which shows the default Solo tab again).
  const tabIndex = playType === 'local' ? 1 : playType === 'online' ? 2 : 0;
  const selectTab = (i: number) => setPlayType(i === 1 ? 'local' : i === 2 ? 'online' : 'solo');

  // Which mode's "how to play" card is open from a "?" button (null = none).
  // Shown on demand from the menu, so it does NOT mark the mode as seen.
  const [helpMode, setHelpMode] = useState<GameMode | null>(null);

  // Sign-up nudge for logged-out players. Dismissible for the session only, so
  // it reappears next launch — a gentle, repeatable conversion prompt.
  const [signupBannerDismissed, setSignupBannerDismissed] = useState(false);

  // ----- First-launch onboarding tour -----
  // Refs on the elements the tour spotlights. `any` keeps the union of View /
  // TouchableOpacity instance types simple; we only touch `measureInWindow`.
  const modesRef = useRef<any>(null);
  const dailyRef = useRef<any>(null);
  const profileRef = useRef<any>(null);
  const shopRef = useRef<any>(null);
  const friendsRef = useRef<any>(null);

  const [showTutorial, setShowTutorial] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    getHasSeenTutorial().then((seen) => {
      if (cancelled || seen) return;
      // Small delay so the menu has fully laid out before we measure targets.
      timer = setTimeout(() => {
        if (!cancelled) setShowTutorial(true);
      }, 450);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const finishTutorial = useCallback(() => {
    setShowTutorial(false);
    setHasSeenTutorial(true);
  }, []);

  // Measure a spotlight target in window coordinates (matches the Modal frame).
  // Resolves null when the element isn't mounted (e.g. Shop/Friends are hidden
  // for logged-out users) so the step falls back to a centered card.
  const measureTarget = useCallback(
    (id: string) =>
      new Promise<TutorialRect | null>((resolve) => {
        const node = { modes: modesRef, daily: dailyRef, profile: profileRef, shop: shopRef, friends: friendsRef }[id]?.current;
        if (!node || typeof node.measureInWindow !== 'function') {
          resolve(null);
          return;
        }
        let settled = false;
        const settle = (r: TutorialRect | null) => {
          if (!settled) {
            settled = true;
            resolve(r);
          }
        };
        node.measureInWindow((x: number, y: number, width: number, height: number) => {
          settle(width > 0 && height > 0 ? { x, y, width, height } : null);
        });
        // measureInWindow can silently never fire if the node is detached.
        setTimeout(() => settle(null), 300);
      }),
    [],
  );

  return (
    <SafeAreaView
      style={[styles.container, !isDarkMode && styles.containerLight, { flex: 1 }]}
    >
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      {/* Header row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <TouchableOpacity
          ref={profileRef}
          onPress={onOpenAuth}
          style={[
            styles.refreshBtn,
            !isDarkMode && styles.refreshBtnLight,
            { padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
          ]}
          {...a11yButton(
            isAuthenticated ? tr(language, 'Profil', 'Profile') : tr(language, 'Connexion', 'Login'),
          )}
        >
          {isAuthenticated ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <User color="white" size={14} />
              </View>
              <Text style={{ fontFamily: FONTS.mono, color: iconColor, fontSize: 11 }}>
                {tr(language, 'Profil', 'Profile')}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <LogIn color={iconColor} size={18} />
              <Text style={{ fontFamily: FONTS.mono, color: iconColor, fontSize: 11 }}>
                {tr(language, 'Connexion', 'Login')}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity
            onPress={toggleLanguage}
            style={[
              styles.refreshBtn,
              !isDarkMode && styles.refreshBtnLight,
              { padding: 8, minWidth: 42, alignItems: 'center' },
            ]}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(tr(language, 'Changer de langue', 'Change language'))}
          >
            <Text style={{ fontFamily: FONTS.monoBold, color: iconColor, fontSize: 11 }}>
              {language.toUpperCase()}
            </Text>
          </TouchableOpacity>
          {isAuthenticated && (
            <TouchableOpacity
              ref={shopRef}
              onPress={onOpenShop}
              style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }]}
              hitSlop={ICON_HIT_SLOP}
              {...a11yButton(tr(language, 'Boutique', 'Shop'))}
            >
              <ShoppingBag color={iconColor} size={22} />
            </TouchableOpacity>
          )}
          {isAuthenticated && (
            <TouchableOpacity
              ref={friendsRef}
              onPress={onOpenFriends}
              style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }]}
              hitSlop={ICON_HIT_SLOP}
              {...a11yButton(
                pendingFriendCount > 0
                  ? tr(
                      language,
                      `Amis, ${pendingFriendCount} demande${pendingFriendCount > 1 ? 's' : ''} en attente`,
                      `Friends, ${pendingFriendCount} pending request${pendingFriendCount > 1 ? 's' : ''}`,
                    )
                  : tr(language, 'Amis', 'Friends'),
              )}
            >
              <Users color={iconColor} size={22} />
              <NotificationDot count={pendingFriendCount} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={toggleTheme}
            style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }]}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(
              isDarkMode
                ? tr(language, 'Passer en thème clair', 'Switch to light theme')
                : tr(language, 'Passer en thème sombre', 'Switch to dark theme'),
            )}
          >
            {isDarkMode ? <Sun color={PALETTE.sand} size={22} /> : <Moon color={c.textMuted} size={22} />}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onOpenLeaderboard}
            style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }]}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(tr(language, 'Classement', 'Leaderboard'))}
          >
            <BarChart3 color={iconColor} size={22} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 0,
          paddingBottom: 60,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero: the planet rises behind the title (echoes the landing page). */}
        <MenuGlobe
          size={globeSize}
          isDarkMode={isDarkMode}
          backgroundColor={c.background}
          style={{ alignSelf: 'center' }}
        />
        <View style={{ alignItems: 'center', marginTop: -globeSize * 0.28, marginBottom: 8, position: 'relative' }}>
          <View style={{ position: 'absolute', right: -50, top: 0, opacity: 0.5 }}>
            <CompassRose size={44} color={c.border} />
          </View>
          <ScoreText
            style={{
              fontFamily: FONTS.headingBlack,
              fontSize: 52,
              color: c.text,
              letterSpacing: -1,
            }}
          >
            GeoGames
          </ScoreText>
          <CoordLabel lat="48°N" lng="2°E" color={c.textFaint} size={10} />
        </View>

        <View style={{ width: '100%', marginVertical: 16, overflow: 'hidden', height: 1, backgroundColor: c.border, opacity: 0.6 }} />

        {/* Sign-up call-to-action for logged-out players: what an account unlocks,
            straight to the sign-up screen. Dismissible for the session. */}
        {!isAuthenticated && !signupBannerDismissed && (
          <View
            style={{
              width: '100%',
              maxWidth: 400,
              marginBottom: 18,
              borderRadius: 18,
              borderWidth: 2,
              borderColor: accent,
              backgroundColor: isDarkMode ? c.surface : PALETTE.parchmentDark,
              padding: 16,
              overflow: 'hidden',
            }}
          >
            <TouchableOpacity
              onPress={() => setSignupBannerDismissed(true)}
              style={{ position: 'absolute', top: 8, right: 8, padding: 6, zIndex: 2 }}
              hitSlop={ICON_HIT_SLOP}
              {...a11yButton(tr(language, 'Masquer', 'Dismiss'))}
            >
              <X color={c.textFaint} size={16} />
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, paddingRight: 20 }}>
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: accent,
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
                <Text style={{ fontFamily: FONTS.mono, fontSize: 11.5, color: c.textMuted, marginTop: 2, lineHeight: 16 }}>
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
                  backgroundColor: accent,
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
                <LogIn color={iconColor} size={16} />
                <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 13 }}>
                  {tr(language, 'Connexion', 'Log in')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Daily challenge hero — always visible, the first thing players see. */}
        <TouchableOpacity
          ref={dailyRef}
          onPress={onOpenDaily}
          style={[
            styles.countryCard,
            !isDarkMode && styles.countryCardLight,
            {
              width: '100%',
              maxWidth: 400,
              padding: 18,
              marginBottom: 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 15,
              borderWidth: 2,
              borderColor: DAILY_FLAME,
              backgroundColor: isDarkMode ? 'rgba(232,119,46,0.12)' : 'rgba(232,119,46,0.10)',
            },
          ]}
          {...a11yButton(tr(language, 'Défi du Jour', 'Daily Challenge'), {
            hint: tr(language, 'Ouvrir le défi du jour', 'Open the daily challenge'),
          })}
        >
          <View style={{ backgroundColor: isDarkMode ? 'rgba(232,119,46,0.22)' : 'rgba(232,119,46,0.16)', padding: 12, borderRadius: 12 }}>
            <CalendarDays color={DAILY_FLAME} size={28} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.countryName, !isDarkMode && styles.countryNameLight, { fontSize: 17, textAlign: 'left', marginBottom: 3, color: DAILY_FLAME }]}>
              {tr(language, 'Défi du Jour', 'Daily Challenge')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {dailyStreak > 0 && <AtlasFlame color={DAILY_FLAME} size={11} />}
              <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 10 }}>
                {dailyStreak > 0
                  ? tr(language, `Série de ${dailyStreak} · 8 modes`, `${dailyStreak}-day streak · 8 modes`)
                  : tr(language, 'Un puzzle par mode, chaque jour', 'One puzzle per mode, every day')}
              </Text>
            </View>
          </View>
          <DailyCountdown color={c.text} labelColor={c.textFaint} language={language} />
          {dailyStreak > 0 ? (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
              {...a11yImage(tr(language, `Série de ${dailyStreak} jours`, `${dailyStreak}-day streak`))}
            >
              <AtlasFlame color={DAILY_FLAME} size={18} />
              <ScoreText style={{ fontFamily: FONTS.headingBlack, color: DAILY_FLAME, fontSize: 20 }}>
                {dailyStreak}
              </ScoreText>
            </View>
          ) : (
            <View style={{ backgroundColor: DAILY_FLAME, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontFamily: FONTS.monoBold, color: '#fff', fontSize: 9 }}>
                {tr(language, 'NOUVEAU', 'NEW')}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Story mode hero — the 300-level campaign, right below the daily. */}
        <TouchableOpacity
          onPress={onOpenStory}
          style={[
            styles.countryCard,
            !isDarkMode && styles.countryCardLight,
            {
              width: '100%',
              maxWidth: 400,
              padding: 18,
              marginBottom: 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 15,
              borderWidth: 2,
              borderColor: PALETTE.oceanBlue,
              backgroundColor: isDarkMode ? 'rgba(26,74,122,0.16)' : 'rgba(26,74,122,0.10)',
            },
          ]}
          {...a11yButton(tr(language, 'Mode Histoire', 'Story Mode'), {
            hint: tr(language, 'Ouvrir la campagne de 300 niveaux', 'Open the 300-level campaign'),
          })}
        >
          <View style={{ backgroundColor: isDarkMode ? 'rgba(26,74,122,0.24)' : 'rgba(26,74,122,0.16)', padding: 12, borderRadius: 12 }}>
            <Map color={PALETTE.oceanBlue} size={28} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.countryName, !isDarkMode && styles.countryNameLight, { fontSize: 17, textAlign: 'left', marginBottom: 3, color: PALETTE.oceanBlue }]}>
              {tr(language, 'Mode Histoire', 'Story Mode')}
            </Text>
            <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 10 }}>
              {storyLevel > 0
                ? tr(
                    language,
                    `Niveau ${Math.min(storyLevel + 1, STORY_LEVEL_COUNT)} / ${STORY_LEVEL_COUNT}`,
                    `Level ${Math.min(storyLevel + 1, STORY_LEVEL_COUNT)} / ${STORY_LEVEL_COUNT}`,
                  )
                : tr(language, `${STORY_LEVEL_COUNT} niveaux, de plus en plus durs`, `${STORY_LEVEL_COUNT} levels, harder and harder`)}
            </Text>
            {storyLevel > 0 && (
              <View
                style={{
                  marginTop: 7,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: isDarkMode ? 'rgba(74,158,255,0.18)' : 'rgba(26,74,122,0.14)',
                  overflow: 'hidden',
                }}
                {...a11yImage(
                  tr(
                    language,
                    `Progression : niveau ${storyLevel} sur ${STORY_LEVEL_COUNT}`,
                    `Progress: level ${storyLevel} of ${STORY_LEVEL_COUNT}`,
                  ),
                )}
              >
                <View
                  style={{
                    height: '100%',
                    width: `${Math.min(100, (storyLevel / STORY_LEVEL_COUNT) * 100)}%`,
                    borderRadius: 3,
                    backgroundColor: isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue,
                  }}
                />
              </View>
            )}
          </View>
          {storyLevel > 0 ? (
            <Text
              style={{ fontFamily: FONTS.monoBold, color: PALETTE.sand, fontSize: 12 }}
              {...a11yImage(tr(language, `${storyStars} étoiles`, `${storyStars} stars`))}
            >
              ★ {storyStars}
            </Text>
          ) : (
            <View style={{ backgroundColor: PALETTE.oceanBlue, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontFamily: FONTS.monoBold, color: '#fff', fontSize: 9 }}>
                {tr(language, 'NOUVEAU', 'NEW')}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Solo / Local / Online tab bar — replaces the old play-type chooser
            screen, so every mode list is one tap away from launch. */}
        <View ref={modesRef} style={{ width: '100%', maxWidth: 400, alignItems: 'center', marginBottom: 16 }}>
          <PlayTabs
            index={tabIndex}
            onSelect={selectTab}
            isDarkMode={isDarkMode}
            notifyOnline={!!incomingInviteMode}
          />
        </View>

        {tabIndex === 0 ? (
          <>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                rowGap: 11,
                width: '100%',
                maxWidth: 400,
              }}
            >
              <ModeTile
                icon={Globe}
                accent={isDarkMode ? PALETTE.sand : PALETTE.vermilion}
                tint={isDarkMode ? 'rgba(196,135,42,0.14)' : 'rgba(192,74,26,0.10)'}
                title={tr(language, 'Globe Géo', 'Geo Globe')}
                subtitle={tr(language, 'Trouvez les pays sur le globe', 'Find countries on the globe')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('globe')}
                onHelp={() => setHelpMode('globe')}
              />
              <ModeTile
                icon={Map}
                accent={isDarkMode ? PALETTE.sand : PALETTE.vermilion}
                tint={isDarkMode ? 'rgba(196,135,42,0.14)' : 'rgba(192,74,26,0.10)'}
                title={tr(language, 'Défis Pays', 'Country Challenges')}
                subtitle={tr(language, 'Des jeux variés pour un pays', 'Diverse games for one country')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('regions')}
                onHelp={() => setHelpMode('regions')}
              />
              <ModeTile
                icon={Info}
                accent={isDarkMode ? PALETTE.chartBlue : PALETTE.vermilion}
                tint={isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(192,74,26,0.10)'}
                title={tr(language, 'Devinez le Pays', 'Guess Country')}
                subtitle={tr(language, 'Identifiez le pays depuis ses infos', 'Identify the country from clues')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('guess')}
                onHelp={() => setHelpMode('guess')}
              />
              <ModeTile
                icon={Route}
                accent={PALETTE.sand}
                tint={isDarkMode ? 'rgba(196,135,42,0.15)' : 'rgba(196,135,42,0.10)'}
                title={tr(language, 'Frontières', 'Borders')}
                subtitle={tr(language, 'Reliez deux pays par leurs frontières', 'Link two countries through borders')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('borders')}
                onHelp={() => setHelpMode('borders')}
              />
              <ModeTile
                icon={Puzzle}
                accent={PALETTE.forestGreen}
                tint={isDarkMode ? 'rgba(42,110,63,0.15)' : 'rgba(42,110,63,0.10)'}
                title="Silhouette"
                subtitle={tr(language, 'Devinez le pays à sa forme', 'Guess the country by its shape')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('silhouette')}
                onHelp={() => setHelpMode('silhouette')}
              />
              <ModeTile
                icon={TrendingUp}
                accent={isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue}
                tint={isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(26,74,122,0.10)'}
                title={tr(language, 'Plus ou Moins', 'Higher or Lower')}
                subtitle={tr(language, 'Quel pays est au-dessus ?', 'Which country is higher?')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('higherlower')}
                onHelp={() => setHelpMode('higherlower')}
              />
              <ModeTile
                icon={LayoutGrid}
                accent={isDarkMode ? PALETTE.forestGreen : PALETTE.forestGreen}
                tint={isDarkMode ? 'rgba(42,110,63,0.15)' : 'rgba(42,110,63,0.10)'}
                title="Rankle"
                subtitle={tr(language, 'Associez chaque pays à un thème', 'Match each country to a theme')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('classic')}
                onHelp={() => setHelpMode('classic')}
              />
              <ModeTile
                icon={Zap}
                accent={PALETTE.sand}
                tint={isDarkMode ? 'rgba(196,135,42,0.15)' : 'rgba(196,135,42,0.10)'}
                title={tr(language, 'Mode Streak', 'Streak Mode')}
                subtitle={tr(language, 'Enchaînez les bonnes réponses', 'Chain correct answers')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('streak')}
                onHelp={() => setHelpMode('streak')}
              />
              <ModeTile
                icon={Flag}
                accent={PALETTE.sand}
                tint={isDarkMode ? 'rgba(196,135,42,0.15)' : 'rgba(196,135,42,0.10)'}
                title={tr(language, 'Capitales', 'Capitals')}
                subtitle={tr(language, 'Retrouvez les capitales du monde', 'Find the world capitals')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('quiz-capital')}
                onHelp={() => setHelpMode('quiz-capital')}
              />
              <ModeTile
                icon={Flag}
                accent={isDarkMode ? PALETTE.chartBlue : PALETTE.vermilion}
                tint={isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(192,74,26,0.10)'}
                title={tr(language, 'Drapeaux', 'Flags')}
                subtitle={tr(language, 'Identifiez les drapeaux des pays', 'Identify country flags')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('quiz-flag')}
                onHelp={() => setHelpMode('quiz-flag')}
              />
            </View>
          </>
        ) : tabIndex === 1 ? (
          /* Local tab — pass-and-play on this device. */
          <View
            style={[
              styles.countryCard,
              !isDarkMode && styles.countryCardLight,
              { width: '100%', maxWidth: 400, padding: 22, alignItems: 'center', gap: 12 },
            ]}
          >
            <View
              style={{
                backgroundColor: isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(26,74,122,0.10)',
                padding: 16,
                borderRadius: 16,
              }}
            >
              <Monitor color={isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue} size={32} />
            </View>
            <Text style={[styles.countryName, !isDarkMode && styles.countryNameLight, { fontSize: 20, textAlign: 'center' }]}>
              {tr(language, 'Partie locale', 'Local game')}
            </Text>
            <Text
              style={{
                fontFamily: FONTS.mono,
                color: c.textMuted,
                fontSize: 11,
                textAlign: 'center',
                lineHeight: 17,
                maxWidth: 300,
              }}
            >
              {tr(
                language,
                'Composez votre partie — modes et manches — puis passez le téléphone à tour de rôle.',
                'Build your game — modes and rounds — then pass the phone around.',
              )}
            </Text>
            <TouchableOpacity
              onPress={() => onPlay('local-builder')}
              style={{
                marginTop: 6,
                height: 46,
                paddingHorizontal: 24,
                borderRadius: 13,
                backgroundColor: isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
              {...a11yButton(tr(language, 'Créer une partie locale', 'Create a local game'), {
                hint: tr(language, 'Choisir les modes et les joueurs', 'Pick modes and players'),
              })}
            >
              <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 14 }}>
                {tr(language, 'Créer une partie locale', 'Create a local game')}
              </Text>
              <ChevronRight color="#fff" size={18} />
            </TouchableOpacity>
          </View>
        ) : !isAuthenticated ? (
          /* Online tab, logged out — explain what's behind the lock. */
          <View
            style={[
              styles.countryCard,
              !isDarkMode && styles.countryCardLight,
              { width: '100%', maxWidth: 400, padding: 22, alignItems: 'center', gap: 12 },
            ]}
          >
            <View
              style={{
                backgroundColor: isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(192,74,26,0.10)',
                padding: 16,
                borderRadius: 16,
              }}
            >
              <Lock color={accent} size={32} />
            </View>
            <Text style={[styles.countryName, !isDarkMode && styles.countryNameLight, { fontSize: 20, textAlign: 'center' }]}>
              {tr(language, 'Affronte le monde entier', 'Take on the whole world')}
            </Text>
            <Text
              style={{
                fontFamily: FONTS.mono,
                color: c.textMuted,
                fontSize: 11,
                textAlign: 'center',
                lineHeight: 17,
                maxWidth: 300,
              }}
            >
              {tr(
                language,
                'Duels, matchs à 8 joueurs et mode classé ELO — avec un compte gratuit.',
                'Duels, 8-player matches and ranked ELO — with a free account.',
              )}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <TouchableOpacity
                onPress={onOpenSignup}
                style={{
                  height: 46,
                  paddingHorizontal: 20,
                  borderRadius: 13,
                  backgroundColor: accent,
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
                  height: 46,
                  paddingHorizontal: 16,
                  borderRadius: 13,
                  borderWidth: 1,
                  borderColor: c.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
                {...a11yButton(tr(language, 'Se connecter', 'Log in'))}
              >
                <LogIn color={iconColor} size={16} />
                <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 13 }}>
                  {tr(language, 'Connexion', 'Log in')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View style={{ gap: 12, width: '100%', maxWidth: 400 }}>
              {/* Ranked mode — highlighted card */}
              <TouchableOpacity
                onPress={onPlayRanked}
                style={[
                  styles.countryCard,
                  !isDarkMode && styles.countryCardLight,
                  {
                    padding: 18,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 15,
                    borderWidth: 2,
                    borderColor: '#c4872a',
                    backgroundColor: isDarkMode ? 'rgba(196,135,42,0.12)' : 'rgba(196,135,42,0.10)',
                  },
                ]}
                {...a11yButton(tr(language, 'Mode Classé', 'Ranked Mode'), {
                  hint: tr(language, 'Démarrer ce mode', 'Start this mode'),
                })}
              >
                <View style={{ backgroundColor: isDarkMode ? 'rgba(196,135,42,0.25)' : 'rgba(196,135,42,0.18)', padding: 12, borderRadius: 12 }}>
                  <Swords color="#c4872a" size={28} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.countryName, !isDarkMode && styles.countryNameLight, { fontSize: 17, textAlign: 'left', marginBottom: 3, color: '#c4872a' }]}>
                    {tr(language, 'Mode Classé', 'Ranked Mode')}
                  </Text>
                  <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 10 }}>
                    {tr(language, 'ELO · Bronze → Maître · Modes variés', 'ELO · Bronze → Master · Mixed modes')}
                  </Text>
                </View>
                <Trophy color="#c4872a" size={20} />
              </TouchableOpacity>

              {/* Friend leagues — 3 shared daily challenges, private leaderboards */}
              <TouchableOpacity
                onPress={onOpenLeague}
                style={[
                  styles.countryCard,
                  !isDarkMode && styles.countryCardLight,
                  {
                    padding: 18,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 15,
                    borderWidth: 2,
                    borderColor: isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue,
                    backgroundColor: isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(26,74,122,0.10)',
                  },
                ]}
                {...a11yButton(tr(language, 'Ligue', 'League'), {
                  hint: tr(language, 'Créer ou rejoindre une ligue', 'Create or join a league'),
                })}
              >
                <View style={{ backgroundColor: isDarkMode ? 'rgba(74,158,255,0.22)' : 'rgba(26,74,122,0.16)', padding: 12, borderRadius: 12 }}>
                  <Users color={isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue} size={28} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.countryName, !isDarkMode && styles.countryNameLight, { fontSize: 17, textAlign: 'left', marginBottom: 3, color: isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue }]}>
                    {tr(language, 'Ligue', 'League')}
                  </Text>
                  <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 10 }}>
                    {tr(language, '3 défis par jour · classement privé', '3 daily challenges · private leaderboard')}
                  </Text>
                </View>
                <Trophy color={isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue} size={20} />
              </TouchableOpacity>

              {/* Custom game — build your own mode sequence vs a friend or stranger */}
              <TouchableOpacity
                onPress={onPlayCustomOnline}
                style={[
                  styles.countryCard,
                  !isDarkMode && styles.countryCardLight,
                  {
                    padding: 18,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 15,
                    borderWidth: 2,
                    borderColor: PALETTE.forestGreen,
                    backgroundColor: isDarkMode ? 'rgba(42,110,63,0.12)' : 'rgba(42,110,63,0.10)',
                  },
                ]}
                {...a11yButton(tr(language, 'Partie personnalisée', 'Custom game'), {
                  hint: tr(language, 'Construire une suite de modes', 'Build a sequence of modes'),
                })}
              >
                <View style={{ backgroundColor: isDarkMode ? 'rgba(42,110,63,0.25)' : 'rgba(42,110,63,0.16)', padding: 12, borderRadius: 12 }}>
                  <SlidersHorizontal color={PALETTE.forestGreen} size={28} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.countryName, !isDarkMode && styles.countryNameLight, { fontSize: 17, textAlign: 'left', marginBottom: 3, color: PALETTE.forestGreen }]}>
                    {tr(language, 'Partie personnalisée', 'Custom game')}
                  </Text>
                  <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 10 }}>
                    {tr(language, 'Enchaîne les modes de ton choix', 'Chain the modes you pick')}
                  </Text>
                </View>
                <ChevronRight color={PALETTE.forestGreen} size={20} />
              </TouchableOpacity>

              <View style={{ height: 1, backgroundColor: c.border, opacity: 0.5, marginVertical: 2 }} />

              <ModeCard
                icon={Globe}
                accent={isDarkMode ? PALETTE.sand : PALETTE.vermilion}
                tint={isDarkMode ? 'rgba(196,135,42,0.14)' : 'rgba(192,74,26,0.10)'}
                title={tr(language, 'Globe Géo', 'Geo Globe')}
                subtitle={tr(language, 'Trouvez les pays sur le globe', 'Find countries on the globe')}
                isDarkMode={isDarkMode}
                onPress={() => onPlayOnline('globe')}
                onLeaderboard={() => onOpenOnlineModeLeaderboard('globe', isDarkMode ? PALETTE.sand : PALETTE.vermilion)}
                notify={incomingInviteMode === 'globe'}
              />
              <ModeCard
                icon={Map}
                accent={isDarkMode ? PALETTE.sand : PALETTE.oceanBlue}
                tint={isDarkMode ? 'rgba(196,135,42,0.14)' : 'rgba(26,74,122,0.10)'}
                title={tr(language, 'Défis Pays', 'Country Challenges')}
                subtitle={tr(language, "Placez les régions d'un pays, à 2", "Place a country's regions, head-to-head")}
                isDarkMode={isDarkMode}
                onPress={() => onPlayOnline('regions')}
                onLeaderboard={() => onOpenOnlineModeLeaderboard('regions', isDarkMode ? PALETTE.sand : PALETTE.oceanBlue)}
                notify={incomingInviteMode === 'regions'}
              />
              <ModeCard
                icon={Info}
                accent={isDarkMode ? PALETTE.chartBlue : PALETTE.vermilion}
                tint={isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(192,74,26,0.10)'}
                title={tr(language, 'Devine le Pays', 'Guess Country')}
                subtitle={tr(language, 'Même pays mystère pour les deux', 'Same mystery country for both')}
                isDarkMode={isDarkMode}
                onPress={() => onPlayOnline('guess')}
                onLeaderboard={() => onOpenOnlineModeLeaderboard('guess', isDarkMode ? PALETTE.chartBlue : PALETTE.vermilion)}
                notify={incomingInviteMode === 'guess'}
              />
              <ModeCard
                icon={Route}
                accent={PALETTE.sand}
                tint={isDarkMode ? 'rgba(196,135,42,0.15)' : 'rgba(196,135,42,0.10)'}
                title={tr(language, 'Frontières', 'Borders')}
                subtitle={tr(language, 'Le même trajet pour les deux joueurs', 'Same route for both players')}
                isDarkMode={isDarkMode}
                onPress={() => onPlayOnline('borders')}
                onLeaderboard={() => onOpenOnlineModeLeaderboard('borders', PALETTE.sand)}
                notify={incomingInviteMode === 'borders'}
              />
              <ModeCard
                icon={Puzzle}
                accent={PALETTE.forestGreen}
                tint={isDarkMode ? 'rgba(42,110,63,0.15)' : 'rgba(42,110,63,0.10)'}
                title="Silhouette"
                subtitle={tr(language, 'Les mêmes formes pour les deux joueurs', 'Same shapes for both players')}
                isDarkMode={isDarkMode}
                onPress={() => onPlayOnline('silhouette')}
                onLeaderboard={() => onOpenOnlineModeLeaderboard('silhouette', PALETTE.forestGreen)}
                notify={incomingInviteMode === 'silhouette'}
              />
              <ModeCard
                icon={TrendingUp}
                accent={isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue}
                tint={isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(26,74,122,0.10)'}
                title={tr(language, 'Plus ou Moins', 'Higher or Lower')}
                subtitle={tr(language, 'La même chaîne pour les deux joueurs', 'Same chain for both players')}
                isDarkMode={isDarkMode}
                onPress={() => onPlayOnline('higherlower')}
                onLeaderboard={() => onOpenOnlineModeLeaderboard('higherlower', isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue)}
                notify={incomingInviteMode === 'higherlower'}
              />
              <ModeCard
                icon={Users}
                accent={isDarkMode ? PALETTE.chartBlue : PALETTE.vermilion}
                tint={isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(192,74,26,0.10)'}
                title={tr(language, 'Mode Versus', 'Versus Mode')}
                subtitle={tr(language, 'Affrontez un joueur en ligne', 'Face a player online')}
                isDarkMode={isDarkMode}
                onPress={() => onPlayOnline('versus')}
                onLeaderboard={() => onOpenOnlineModeLeaderboard('versus', isDarkMode ? PALETTE.chartBlue : PALETTE.vermilion)}
                notify={incomingInviteMode === 'versus'}
              />
              <ModeCard
                icon={LayoutGrid}
                accent={PALETTE.forestGreen}
                tint={isDarkMode ? 'rgba(42,110,63,0.15)' : 'rgba(42,110,63,0.10)'}
                title="Rankle"
                subtitle={tr(language, 'Associez chaque pays à un thème', 'Match each country to a theme')}
                isDarkMode={isDarkMode}
                onPress={() => onPlayOnline('classic')}
                onLeaderboard={() => onOpenOnlineModeLeaderboard('classic', PALETTE.forestGreen)}
                notify={incomingInviteMode === 'classic'}
              />
              <ModeCard
                icon={Zap}
                accent={PALETTE.sand}
                tint={isDarkMode ? 'rgba(196,135,42,0.15)' : 'rgba(196,135,42,0.10)'}
                title={tr(language, 'Mode Streak', 'Streak Mode')}
                subtitle={tr(language, 'Enchaînez les bonnes réponses', 'Chain correct answers')}
                isDarkMode={isDarkMode}
                onPress={() => onPlayOnline('streak')}
                onLeaderboard={() => onOpenOnlineModeLeaderboard('streak', PALETTE.sand)}
                notify={incomingInviteMode === 'streak'}
              />
            </View>
          </>
        )}

        <View style={{ height: 1, width: '60%', backgroundColor: c.border, opacity: 0.4, marginTop: 36 }} />
        <Text style={{ marginTop: 10, fontFamily: FONTS.mono, color: c.textFaint, fontSize: 9, letterSpacing: 1 }}>
          GEOG · v2.0
        </Text>
      </ScrollView>

      {/* First-launch guided tour — spotlights the menu's key features. The key
          remounts it fresh each time it opens so it always starts at step 1. */}
      <OnboardingTutorial
        key={showTutorial ? 'tour-open' : 'tour-closed'}
        visible={showTutorial}
        steps={ONBOARDING_STEPS}
        measureTarget={measureTarget}
        onFinish={finishTutorial}
      />

      {/* "How to play" card opened from a mode's "?" button — a plain close
          handler, so consulting the rules here never marks the mode as seen. */}
      <ModeIntroCard mode={helpMode} onDismiss={() => setHelpMode(null)} />
    </SafeAreaView>
  );
}
