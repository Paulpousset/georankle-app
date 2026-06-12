import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft,
  BarChart3,
  Flag,
  Globe,
  Info,
  LayoutGrid,
  LogIn,
  Monitor,
  Moon,
  ShoppingBag,
  Sliders,
  Sun,
  Swords,
  Trophy,
  User,
  Users,
  Wifi,
  Zap,
} from 'lucide-react-native';
import type { ComponentType } from 'react';

import type { GameMode, Language, MatchMode } from '../types';
import { commonStyles as styles } from '../theme/commonStyles';
import { PALETTE, getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { CompassRose, CoordLabel } from '../theme/decorative';
import { tr } from '../i18n';

type PlayType = 'solo' | 'local' | 'online';

interface ModeCardProps {
  icon: ComponentType<{ color: string; size: number }>;
  accent: string;
  tint: string;
  title: string;
  subtitle: string;
  isDarkMode: boolean;
  onPress: () => void;
  onLeaderboard?: () => void;
}

function ModeCard({ icon: Icon, accent, tint, title, subtitle, isDarkMode, onPress, onLeaderboard }: ModeCardProps) {
  const c = getColors(isDarkMode);
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

  if (!onLeaderboard) {
    return (
      <TouchableOpacity onPress={onPress} style={cardStyle}>
        {inner}
      </TouchableOpacity>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <TouchableOpacity onPress={onPress} style={[...cardStyle, { flex: 1 }]}>
        {inner}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onLeaderboard}
        style={{
          padding: 14,
          borderRadius: 14,
          backgroundColor: tint,
          borderWidth: 1,
          borderColor: c.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Trophy color={accent} size={20} />
      </TouchableOpacity>
    </View>
  );
}

interface PlayTypeCardProps {
  icon: ComponentType<{ color: string; size: number }>;
  accent: string;
  tint: string;
  title: string;
  subtitle: string;
  isDarkMode: boolean;
  onPress: () => void;
}

function PlayTypeCard({ icon: Icon, accent, tint, title, subtitle, isDarkMode, onPress }: PlayTypeCardProps) {
  const c = getColors(isDarkMode);
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.countryCard,
        !isDarkMode && styles.countryCardLight,
        {
          padding: 22,
          alignItems: 'center',
          gap: 10,
          borderBottomWidth: 3,
          borderBottomColor: accent,
        },
      ]}
    >
      <View style={{ backgroundColor: tint, padding: 16, borderRadius: 16 }}>
        <Icon color={accent} size={32} />
      </View>
      <Text
        style={[
          styles.countryName,
          !isDarkMode && styles.countryNameLight,
          { fontSize: 20, textAlign: 'center' },
        ]}
      >
        {title}
      </Text>
      <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 10, textAlign: 'center' }}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

interface MainMenuProps {
  isDarkMode: boolean;
  language: Language;
  isAuthenticated: boolean;
  onToggleTheme: () => void;
  onToggleLanguage: () => void;
  onOpenAuth: () => void;
  onOpenShop: () => void;
  onOpenFriends: () => void;
  onOpenLeaderboard: () => void;
  onOpenOnlineModeLeaderboard: (mode: MatchMode, accent: string) => void;
  onPlay: (mode: GameMode) => void;
  onPlayOnline: (mode: MatchMode) => void;
  onPlayRanked: () => void;
}

export function MainMenu({
  isDarkMode,
  language,
  isAuthenticated,
  onToggleTheme,
  onToggleLanguage,
  onOpenAuth,
  onOpenShop,
  onOpenFriends,
  onOpenLeaderboard,
  onOpenOnlineModeLeaderboard,
  onPlay,
  onPlayOnline,
  onPlayRanked,
}: MainMenuProps) {
  const [playType, setPlayType] = useState<PlayType | null>(null);
  const c = getColors(isDarkMode);
  const iconColor = c.text;
  const accent = c.accent;

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
        {playType ? (
          <TouchableOpacity
            onPress={() => setPlayType(null)}
            style={[
              styles.refreshBtn,
              !isDarkMode && styles.refreshBtnLight,
              { padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
            ]}
          >
            <ArrowLeft color={iconColor} size={18} />
            <Text style={{ fontFamily: FONTS.mono, color: iconColor, fontSize: 11 }}>
              {tr(language, 'Retour', 'Back')}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={onOpenAuth}
            style={[
              styles.refreshBtn,
              !isDarkMode && styles.refreshBtnLight,
              { padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
            ]}
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
        )}

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity
            onPress={onToggleLanguage}
            style={[
              styles.refreshBtn,
              !isDarkMode && styles.refreshBtnLight,
              { padding: 8, minWidth: 42, alignItems: 'center' },
            ]}
          >
            <Text style={{ fontFamily: FONTS.monoBold, color: iconColor, fontSize: 11 }}>
              {language.toUpperCase()}
            </Text>
          </TouchableOpacity>
          {isAuthenticated && (
            <TouchableOpacity
              onPress={onOpenShop}
              style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }]}
            >
              <ShoppingBag color={iconColor} size={22} />
            </TouchableOpacity>
          )}
          {isAuthenticated && (
            <TouchableOpacity
              onPress={onOpenFriends}
              style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }]}
            >
              <Users color={iconColor} size={22} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={onToggleTheme}
            style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }]}
          >
            {isDarkMode ? <Sun color={PALETTE.sand} size={22} /> : <Moon color={c.textMuted} size={22} />}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onOpenLeaderboard}
            style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }]}
          >
            <BarChart3 color={iconColor} size={22} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 30,
          paddingBottom: 60,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero title block */}
        <View style={{ alignItems: 'center', marginBottom: 8, position: 'relative' }}>
          <View style={{ position: 'absolute', right: -50, top: 0, opacity: 0.5 }}>
            <CompassRose size={44} color={c.border} />
          </View>
          <Text
            style={{
              fontFamily: FONTS.headingBlack,
              fontSize: 52,
              color: c.text,
              letterSpacing: -1,
            }}
          >
            GeoG
          </Text>
          <CoordLabel lat="48°N" lng="2°E" color={c.textFaint} size={10} />
        </View>

        <View style={{ width: '100%', marginVertical: 16, overflow: 'hidden', height: 1, backgroundColor: c.border, opacity: 0.6 }} />

        {!playType ? (
          <>
            <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 11, marginBottom: 28, textAlign: 'center' }}>
              {tr(language, 'Comment souhaitez-vous jouer ?', 'How do you want to play?')}
            </Text>
            <View style={{ gap: 14, width: '100%', maxWidth: 400 }}>
              <PlayTypeCard
                icon={User}
                accent={isDarkMode ? PALETTE.forestGreen : PALETTE.forestGreen}
                tint={isDarkMode ? 'rgba(42,110,63,0.15)' : 'rgba(42,110,63,0.10)'}
                title="Solo"
                subtitle={tr(language, 'Jouez seul à votre rythme', 'Play alone at your own pace')}
                isDarkMode={isDarkMode}
                onPress={() => setPlayType('solo')}
              />
              <PlayTypeCard
                icon={Monitor}
                accent={isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue}
                tint={isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(26,74,122,0.10)'}
                title="Local"
                subtitle={tr(language, 'Défiez des amis sur le même appareil', 'Challenge friends on the same device')}
                isDarkMode={isDarkMode}
                onPress={() => setPlayType('local')}
              />
              <PlayTypeCard
                icon={Wifi}
                accent={isDarkMode ? PALETTE.chartBlue : PALETTE.vermilion}
                tint={isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(192,74,26,0.10)'}
                title={tr(language, 'En Ligne', 'Online')}
                subtitle={tr(language, 'Affrontez des joueurs du monde entier', 'Face players from around the world')}
                isDarkMode={isDarkMode}
                onPress={() => (isAuthenticated ? setPlayType('online') : onOpenAuth())}
              />
            </View>
          </>
        ) : playType === 'solo' ? (
          <>
            <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 11, marginBottom: 28, textAlign: 'center' }}>
              {tr(language, 'Choisissez votre mode de jeu', 'Choose your game mode')}
            </Text>
            <View style={{ gap: 12, width: '100%', maxWidth: 400 }}>
              <ModeCard
                icon={LayoutGrid}
                accent={isDarkMode ? PALETTE.forestGreen : PALETTE.forestGreen}
                tint={isDarkMode ? 'rgba(42,110,63,0.15)' : 'rgba(42,110,63,0.10)'}
                title={tr(language, 'Mode Classique', 'Classic Mode')}
                subtitle={tr(language, 'Classez les pays par population', 'Rank countries by population')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('classic')}
              />
              <ModeCard
                icon={Zap}
                accent={PALETTE.sand}
                tint={isDarkMode ? 'rgba(196,135,42,0.15)' : 'rgba(196,135,42,0.10)'}
                title={tr(language, 'Mode Streak', 'Streak Mode')}
                subtitle={tr(language, 'Enchaînez les bonnes réponses', 'Chain correct answers')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('streak')}
              />
              <ModeCard
                icon={Info}
                accent={isDarkMode ? PALETTE.chartBlue : PALETTE.vermilion}
                tint={isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(192,74,26,0.10)'}
                title={tr(language, 'Devinez le Pays', 'Guess Country')}
                subtitle={tr(language, 'Identifiez le pays depuis ses infos', 'Identify the country from clues')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('guess')}
              />
              <ModeCard
                icon={Globe}
                accent={isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue}
                tint={isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(26,74,122,0.10)'}
                title={tr(language, 'Globe Géo', 'Geo Globe')}
                subtitle={tr(language, 'Trouvez les pays sur le globe', 'Find countries on the globe')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('globe')}
              />
              <ModeCard
                icon={Flag}
                accent={PALETTE.sand}
                tint={isDarkMode ? 'rgba(196,135,42,0.15)' : 'rgba(196,135,42,0.10)'}
                title={tr(language, 'Capitales', 'Capitals')}
                subtitle={tr(language, 'Retrouvez les capitales du monde', 'Find the world capitals')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('quiz-capital')}
              />
              <ModeCard
                icon={Flag}
                accent={isDarkMode ? PALETTE.chartBlue : PALETTE.vermilion}
                tint={isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(192,74,26,0.10)'}
                title={tr(language, 'Drapeaux', 'Flags')}
                subtitle={tr(language, 'Identifiez les drapeaux des pays', 'Identify country flags')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('quiz-flag')}
              />
              <ModeCard
                icon={Flag}
                accent={isDarkMode ? PALETTE.nightMuted : PALETTE.brown}
                tint={isDarkMode ? 'rgba(122,160,196,0.12)' : 'rgba(122,92,56,0.10)'}
                title="Mix"
                subtitle={tr(language, 'Capitales et drapeaux mélangés', 'Capitals and flags mixed')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('quiz-mix')}
              />
            </View>
          </>
        ) : playType === 'local' ? (
          <>
            <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 11, marginBottom: 28, textAlign: 'center' }}>
              {tr(language, 'Choisissez votre mode de jeu', 'Choose your game mode')}
            </Text>
            <View style={{ gap: 12, width: '100%', maxWidth: 400 }}>
              <ModeCard
                icon={Sliders}
                accent={PALETTE.forestGreen}
                tint={isDarkMode ? 'rgba(42,110,63,0.15)' : 'rgba(42,110,63,0.10)'}
                title={tr(language, 'Partie personnalisée', 'Custom Game')}
                subtitle={tr(language, 'Enchaînez les modes, à plusieurs', 'Chain any modes, multiplayer')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('local-builder')}
              />
              <ModeCard
                icon={Users}
                accent={isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue}
                tint={isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(26,74,122,0.10)'}
                title={tr(language, 'Mode Versus', 'Versus Mode')}
                subtitle={tr(language, 'Défiez un ami sur cet appareil', 'Challenge a friend on this device')}
                isDarkMode={isDarkMode}
                onPress={() => onPlay('versus')}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 11, marginBottom: 28, textAlign: 'center' }}>
              {tr(language, 'Choisissez votre mode de jeu', 'Choose your game mode')}
            </Text>
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

              <View style={{ height: 1, backgroundColor: c.border, opacity: 0.5, marginVertical: 2 }} />

              <ModeCard
                icon={LayoutGrid}
                accent={PALETTE.forestGreen}
                tint={isDarkMode ? 'rgba(42,110,63,0.15)' : 'rgba(42,110,63,0.10)'}
                title={tr(language, 'Mode Classique', 'Classic Mode')}
                subtitle={tr(language, 'Classez les pays par population', 'Rank countries by population')}
                isDarkMode={isDarkMode}
                onPress={() => onPlayOnline('classic')}
                onLeaderboard={() => onOpenOnlineModeLeaderboard('classic', PALETTE.forestGreen)}
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
              />
              <ModeCard
                icon={Globe}
                accent={isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue}
                tint={isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(26,74,122,0.10)'}
                title={tr(language, 'Globe Géo', 'Geo Globe')}
                subtitle={tr(language, 'Trouvez les pays sur le globe', 'Find countries on the globe')}
                isDarkMode={isDarkMode}
                onPress={() => onPlayOnline('globe')}
                onLeaderboard={() => onOpenOnlineModeLeaderboard('globe', isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue)}
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
              />
            </View>
          </>
        )}

        <View style={{ height: 1, width: '60%', backgroundColor: c.border, opacity: 0.4, marginTop: 36 }} />
        <Text style={{ marginTop: 10, fontFamily: FONTS.mono, color: c.textFaint, fontSize: 9, letterSpacing: 1 }}>
          GEOG · v2.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
