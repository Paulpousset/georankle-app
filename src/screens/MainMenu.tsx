import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BarChart3, Moon, ShoppingBag, Sun, Users } from 'lucide-react-native';

import { AdBanner } from '../components/AdBanner';
import { useLiftSoundToggle } from '../components/SoundToggle';
import { LanguageButton } from '../components/LanguageButton';
import { useAuth } from '../contexts/AuthContext';
import { useCachedData } from '../lib/cache';
import { supabase } from '../lib/supabase';
import { normalizeConfig } from '../data/cosmetics';
import type { AvatarConfig, GameMode, MatchMode } from '../types';
import { MenuGlobe } from '../components/MenuGlobe';
import { whenLaunchIntroDone } from '../components/LaunchIntro';
import { useFeatureFlag } from '../lib/featureFlags';
import { commonStyles as styles } from '../theme/commonStyles';
import { PALETTE, getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { CompassRose, CoordLabel } from '../theme/decorative';
import { tr } from '../i18n';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';
import { NotificationDot } from '../components/NotificationDot';
import {
  OnboardingTutorial,
  ONBOARDING_STEPS,
  type TutorialRect,
} from '../components/OnboardingTutorial';
import { ModeIntroCard } from '../components/ModeIntroModal';
import { getHasSeenTutorial, setHasSeenTutorial } from '../lib/tutorial';
import { useStageWidth } from '../lib/stage';
import { MenuTabBar, type MenuTab } from '../components/menu/MenuTabBar';
import { HomeTab } from './menu/HomeTab';
import { PlayTab } from './menu/PlayTab';
import { DuelTab, type DuelSegment } from './menu/DuelTab';

/**
 * Sous-partie du menu ouverte, remontée dans App pour survivre au lancement
 * d'une partie (on revient sur le même onglet). null = Accueil, 'solo' =
 * Jouer, 'online' / 'local' = Duel (en ligne / même téléphone).
 */
export type PlayType = 'solo' | 'local' | 'online';

function tabOf(playType: PlayType | null): MenuTab {
  return playType === 'solo'
    ? 'play'
    : playType === 'online' || playType === 'local'
      ? 'duel'
      : 'home';
}

interface MainMenuProps {
  isAuthenticated: boolean;
  /** Profil si connecté, sinon la fenêtre de connexion. */
  onOpenAuth: () => void;
  /** Opens the auth modal straight on the sign-up screen (banner CTA). */
  onOpenSignup: () => void;
  onOpenShop: () => void;
  onOpenFriends: () => void;
  onOpenLeaderboard: () => void;
  onOpenOnlineModeLeaderboard: (mode: MatchMode, accent: string) => void;
  onPlay: (mode: GameMode) => void;
  /** Starts a review run: a normal solo game drawing from the missed countries. */
  onPlayReview: (mode: GameMode, ids: string[]) => void;
  onPlayOnline: (mode: MatchMode) => void;
  onPlayCustomOnline: () => void;
  onPlayRanked: () => void;
  /** Opens the friend-leagues hub (3 daily challenges, private leaderboards). */
  onOpenLeague: () => void;
  onOpenDaily: () => void;
  onOpenStory: () => void;
  playType: PlayType | null;
  onChangePlayType: (playType: PlayType | null) => void;
  /** Incoming friend-request count — shown as a dot on the Friends icon. */
  pendingFriendCount?: number;
  /** Mode of a pending game invite — dots the Duel tab and that mode. */
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
  onPlayReview,
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
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const iconColor = c.text;

  const tab = tabOf(playType);
  // Le dernier sous-onglet de Duel choisi, pour y revenir depuis la barre.
  const [lastDuel, setLastDuel] = useState<DuelSegment>(playType === 'local' ? 'local' : 'online');
  const duelSegment: DuelSegment = playType === 'local' ? 'local' : 'online';
  const selectTab = (next: MenuTab) => {
    if (next === 'home') setPlayType(null);
    else if (next === 'play') setPlayType('solo');
    else setPlayType(lastDuel);
  };
  const selectDuelSegment = (segment: DuelSegment) => {
    setLastDuel(segment);
    setPlayType(segment);
  };

  // Remonter en haut de page à chaque changement d'onglet.
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [tab]);

  // Le bouton son flottant se pose au-dessus de la barre d'onglets.
  const [bottomBarHeight, setBottomBarHeight] = useState(0);
  useLiftSoundToggle(bottomBarHeight);

  // Relit records, révisions, défi et histoire à chaque retour au menu (le
  // menu est remonté après une partie).
  const [refreshKey] = useState(() => Date.now());

  // Décor de l'Accueil : la planète se lève derrière le titre.
  const windowWidth = useStageWidth();
  const globeSize = Math.min(windowWidth * 0.6, 250);

  // Quelle carte « comment jouer » est ouverte depuis un bouton « ? ».
  // Ouverte à la demande : elle ne marque PAS le mode comme vu.
  const [helpMode, setHelpMode] = useState<GameMode | null>(null);

  // Interrupteur distant du mode Langues : sa tuile reste cachée tant qu'il
  // est éteint (fermé par défaut).
  const languagesMode = useFeatureFlag('languages_mode');

  const { user: authUser } = useAuth();
  const fetchMyAvatar = useCallback(async (): Promise<AvatarConfig | null> => {
    if (!authUser) return null;
    const { data } = await supabase
      .from('profiles')
      .select('avatar_config')
      .eq('id', authUser.id)
      .single();
    return data?.avatar_config
      ? normalizeConfig(data.avatar_config as unknown as AvatarConfig)
      : null;
  }, [authUser]);
  // ttl 0 : revalide à chaque retour au menu, donc un globe changé dans le
  // profil ou la boutique apparaît tout de suite.
  const { data: myAvatar } = useCachedData<AvatarConfig | null>(
    `menu-avatar:${authUser?.id ?? 'anon'}`,
    fetchMyAvatar,
    { enabled: !!authUser, ttl: 0 },
  );

  // ----- Tour guidé de premier lancement -----
  // `any` garde simple l'union des types d'instance ; on n'utilise que
  // `measureInWindow`.
  const modesRef = useRef<any>(null);
  const dailyRef = useRef<any>(null);
  const profileRef = useRef<any>(null);
  const shopRef = useRef<any>(null);
  const friendsRef = useRef<any>(null);

  const [showTutorial, setShowTutorial] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    getHasSeenTutorial().then(async (seen) => {
      if (cancelled || seen) return;
      // L'intro de lancement d'abord : le tour s'ouvrirait par-dessus.
      await whenLaunchIntroDone();
      if (cancelled) return;
      // Le tour se fait sur l'Accueil, où vivent ses cibles.
      setPlayType(null);
      // Petit délai : le menu doit être disposé avant qu'on mesure les cibles.
      timer = setTimeout(() => {
        if (!cancelled) setShowTutorial(true);
      }, 450);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Une seule fois, au premier montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishTutorial = useCallback(() => {
    setShowTutorial(false);
    setHasSeenTutorial(true);
  }, []);

  // Mesure une cible du tour en coordonnées fenêtre. null quand l'élément
  // n'est pas monté (Boutique/Amis cachés déconnecté) : carte centrée.
  const measureTarget = useCallback(
    (id: string) =>
      new Promise<TutorialRect | null>((resolve) => {
        const node = {
          modes: modesRef,
          daily: dailyRef,
          profile: profileRef,
          shop: shopRef,
          friends: friendsRef,
        }[id]?.current;
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
        // measureInWindow peut ne jamais répondre si le nœud est détaché.
        setTimeout(() => settle(null), 300);
      }),
    [],
  );

  const headerBtn = [styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }];
  const tabTitle =
    tab === 'play'
      ? tr(language, 'Jouer', 'Play')
      : tab === 'duel'
        ? tr(language, 'Duel', 'Duel')
        : null;

  return (
    <SafeAreaView
      // Pas de bord bas : la barre d'onglets gère elle-même l'indicateur d'accueil.
      edges={['top', 'left', 'right']}
      style={[styles.container, !isDarkMode && styles.containerLight, { flex: 1 }]}
    >
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      {/* En-tête : titre de l'onglet (ou la langue sur l'Accueil) + raccourcis. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          gap: 8,
        }}
      >
        {tabTitle ? (
          <Text
            style={{ fontFamily: FONTS.headingBlack, fontSize: 28, color: c.text, flexShrink: 1 }}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {tabTitle}
          </Text>
        ) : (
          <LanguageButton />
        )}

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {tabTitle && <LanguageButton />}
          {isAuthenticated && (
            <TouchableOpacity
              ref={shopRef}
              onPress={onOpenShop}
              style={headerBtn}
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
              style={headerBtn}
              hitSlop={ICON_HIT_SLOP}
              {...a11yButton(
                pendingFriendCount > 0
                  ? tr(
                      language,
                      'Amis, {0} demande{1} en attente',
                      'Friends, {0} pending request{1}',
                      [pendingFriendCount, pendingFriendCount > 1 ? 's' : ''],
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
            style={headerBtn}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(
              isDarkMode
                ? tr(language, 'Passer en thème clair', 'Switch to light theme')
                : tr(language, 'Passer en thème sombre', 'Switch to dark theme'),
            )}
          >
            {isDarkMode ? (
              <Sun color={PALETTE.sand} size={22} />
            ) : (
              <Moon color={c.textMuted} size={22} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onOpenLeaderboard}
            style={headerBtn}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(tr(language, 'Classement', 'Leaderboard'))}
          >
            <BarChart3 color={iconColor} size={22} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'home' && (
          <>
            {/* La planète se lève derrière le titre (comme la page d'accueil du site). */}
            <MenuGlobe
              size={globeSize}
              isDarkMode={isDarkMode}
              backgroundColor={c.background}
              style={{ alignSelf: 'center' }}
            />
            <View
              style={{ alignItems: 'center', marginTop: -globeSize * 0.28, position: 'relative' }}
            >
              <View style={{ position: 'absolute', right: -50, top: 0, opacity: 0.5 }}>
                <CompassRose size={40} color={c.border} />
              </View>
              <ScoreText
                style={{
                  fontFamily: FONTS.headingBlack,
                  fontSize: 46,
                  color: c.text,
                  letterSpacing: -1,
                }}
              >
                GeoGames
              </ScoreText>
              <CoordLabel lat="48°N" lng="2°E" color={c.textFaint} size={10} />
            </View>
            <HomeTab
              isDarkMode={isDarkMode}
              isAuthenticated={isAuthenticated}
              languagesMode={languagesMode}
              onOpenDaily={onOpenDaily}
              onOpenStory={onOpenStory}
              onOpenSignup={onOpenSignup}
              onOpenAuth={onOpenAuth}
              onPlay={onPlay}
              onHelp={setHelpMode}
              dailyRef={dailyRef}
              refreshKey={refreshKey}
            />
          </>
        )}

        {tab === 'play' && (
          <PlayTab
            isDarkMode={isDarkMode}
            languagesMode={languagesMode}
            onPlay={onPlay}
            onPlayReview={onPlayReview}
            onHelp={setHelpMode}
            refreshKey={refreshKey}
          />
        )}

        {tab === 'duel' && (
          <DuelTab
            isDarkMode={isDarkMode}
            isAuthenticated={isAuthenticated}
            languagesMode={languagesMode}
            segment={duelSegment}
            onChangeSegment={selectDuelSegment}
            incomingInviteMode={incomingInviteMode}
            onOpenAuth={onOpenAuth}
            onOpenSignup={onOpenSignup}
            onPlayRanked={onPlayRanked}
            onOpenLeague={onOpenLeague}
            onPlayCustomOnline={onPlayCustomOnline}
            onPlayOnline={onPlayOnline}
            onPlayLocal={() => onPlay('local-builder')}
            onOpenOnlineModeLeaderboard={onOpenOnlineModeLeaderboard}
          />
        )}

        <View
          style={{
            height: 1,
            width: '60%',
            backgroundColor: c.border,
            opacity: 0.4,
            marginTop: 36,
          }}
        />
        <Text
          style={{
            marginTop: 10,
            fontFamily: FONTS.mono,
            color: c.textFaint,
            fontSize: 9,
            letterSpacing: 1,
          }}
        >
          GEOG · v2.0
        </Text>
      </ScrollView>

      {/* Pub + barre d'onglets : leur hauteur soulève le bouton son flottant. */}
      <View onLayout={(e) => setBottomBarHeight(Math.round(e.nativeEvent.layout.height))}>
        <AdBanner />

        <MenuTabBar
          tab={tab}
          onSelect={selectTab}
          onOpenStory={onOpenStory}
          onOpenProfile={onOpenAuth}
          isDarkMode={isDarkMode}
          isAuthenticated={isAuthenticated}
          avatar={myAvatar}
          notifyDuel={!!incomingInviteMode && tab !== 'duel'}
          playRef={modesRef}
          profileRef={profileRef}
        />
      </View>

      {/* Tour guidé de premier lancement. La clé le remonte à neuf à chaque
          ouverture, pour qu'il reparte toujours de l'étape 1. */}
      <OnboardingTutorial
        key={showTutorial ? 'tour-open' : 'tour-closed'}
        visible={showTutorial}
        steps={ONBOARDING_STEPS}
        measureTarget={measureTarget}
        onFinish={finishTutorial}
      />

      {/* Carte « comment jouer » ouverte depuis un bouton « ? » : la consulter
          ici ne marque jamais le mode comme vu. */}
      <ModeIntroCard mode={helpMode} onDismiss={() => setHelpMode(null)} />
    </SafeAreaView>
  );
}
