/**
 * Onglet « Duel » : tout le multijoueur au même endroit.
 *
 * « En ligne » : mode classé, ligues entre amis, partie personnalisée, puis
 * les matchs rapides d'un seul mode, rangés par famille comme l'onglet Jouer.
 * « Même téléphone » : la partie locale qu'on se passe de main en main.
 */
import { Text, TouchableOpacity, View } from 'react-native';
import {
  ChevronRight,
  Lock,
  LogIn,
  Monitor,
  SlidersHorizontal,
  Swords,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react-native';
import type { ComponentType } from 'react';

import type { MatchMode } from '../../types';
import { MENU_MODES, MODE_FAMILIES } from '../../data/menuModes';
import {
  familyColors,
  MENU_GRID_GAP,
  MODE_ICONS,
  ModeCard,
  useMenuGrid,
} from '../../components/menu/ModeTiles';
import { commonStyles as styles } from '../../theme/commonStyles';
import { PALETTE, getColors } from '../../theme/colors';
import { FONTS } from '../../theme/typography';
import { tr } from '../../i18n';
import { useLanguage } from '../../contexts/LanguageContext';
import { a11yButton } from '../../lib/a11y';
import { hoverLift } from '../../lib/webHover';
import { playSfx } from '../../lib/sfx';

export type DuelSegment = 'online' | 'local';

interface DuelTabProps {
  isDarkMode: boolean;
  isAuthenticated: boolean;
  languagesMode: boolean;
  segment: DuelSegment;
  onChangeSegment: (segment: DuelSegment) => void;
  incomingInviteMode: MatchMode | null;
  onOpenAuth: () => void;
  onOpenSignup: () => void;
  onPlayRanked: () => void;
  onOpenLeague: () => void;
  onPlayCustomOnline: () => void;
  onPlayOnline: (mode: MatchMode) => void;
  onPlayLocal: () => void;
  onOpenOnlineModeLeaderboard: (mode: MatchMode, accent: string) => void;
}

export function DuelTab(props: DuelTabProps) {
  const { isDarkMode, segment, onChangeSegment } = props;
  const c = getColors(isDarkMode);
  const { language } = useLanguage();
  const grid = useMenuGrid();

  const segments: {
    id: DuelSegment;
    label: string;
    icon: ComponentType<{ color: string; size: number }>;
    notify?: boolean;
  }[] = [
    {
      id: 'online',
      label: tr(language, 'En ligne', 'Online'),
      icon: Swords,
      notify: !!props.incomingInviteMode,
    },
    { id: 'local', label: tr(language, 'Même téléphone', 'Same phone'), icon: Monitor },
  ];

  return (
    <View style={{ width: '100%', maxWidth: grid.col }}>
      <View
        style={{
          flexDirection: 'row',
          borderWidth: 1.5,
          borderColor: c.border,
          borderRadius: 14,
          backgroundColor: isDarkMode ? c.card : PALETTE.parchmentDark,
          padding: 4,
          marginTop: 12,
          marginBottom: 14,
        }}
      >
        {segments.map((s) => {
          const active = s.id === segment;
          const color = active ? c.background : c.textMuted;
          const Icon = s.icon;
          return (
            <TouchableOpacity
              key={s.id}
              onPress={() => {
                if (!active) playSfx('tap');
                onChangeSegment(s.id);
              }}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: active ? c.text : 'transparent',
              }}
              {...a11yButton(s.label, { selected: active })}
            >
              <Icon color={color} size={15} />
              <Text style={{ fontFamily: FONTS.monoBold, color, fontSize: 12 }}>{s.label}</Text>
              {s.notify && !active && (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: PALETTE.vermilion,
                  }}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {segment === 'local' ? (
        <LocalCard {...props} />
      ) : props.isAuthenticated ? (
        <OnlineList {...props} />
      ) : (
        <LockedCard {...props} />
      )}
    </View>
  );
}

function BigCard({
  icon: Icon,
  color,
  title,
  subtitle,
  onPress,
  trailing,
  isDarkMode,
  tintAlpha = 0.1,
}: {
  icon: ComponentType<{ color: string; size: number }>;
  color: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  trailing: ComponentType<{ color: string; size: number }>;
  isDarkMode: boolean;
  tintAlpha?: number;
}) {
  const c = getColors(isDarkMode);
  const { language } = useLanguage();
  const Trailing = trailing;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.countryCard,
        !isDarkMode && styles.countryCardLight,
        {
          padding: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          borderWidth: 2,
          borderColor: color,
          backgroundColor: hexA(color, isDarkMode ? tintAlpha + 0.02 : tintAlpha),
        },
      ]}
      {...a11yButton(title, { hint: tr(language, 'Démarrer ce mode', 'Start this mode') })}
      {...hoverLift}
    >
      <View
        style={{
          backgroundColor: hexA(color, isDarkMode ? 0.24 : 0.17),
          padding: 11,
          borderRadius: 12,
        }}
      >
        <Icon color={color} size={26} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.countryName, { fontSize: 17, textAlign: 'left', marginBottom: 3, color }]}
        >
          {title}
        </Text>
        <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 10 }}>{subtitle}</Text>
      </View>
      <Trailing color={color} size={20} />
    </TouchableOpacity>
  );
}

/** `#rrggbb` + opacité → `rgba(...)`. */
function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function OnlineList(props: DuelTabProps) {
  const {
    isDarkMode,
    languagesMode,
    incomingInviteMode,
    onPlayOnline,
    onOpenOnlineModeLeaderboard,
  } = props;
  const c = getColors(isDarkMode);
  const { language } = useLanguage();
  const grid = useMenuGrid();
  const leagueColor = isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue;
  const online = MENU_MODES.filter(
    (m) => m.online && (m.featureFlag !== 'languages_mode' || languagesMode),
  );

  return (
    <View style={{ gap: 12 }}>
      <BigCard
        icon={Swords}
        color={PALETTE.sand}
        title={tr(language, 'Mode Classé', 'Ranked Mode')}
        subtitle={tr(
          language,
          'ELO · Bronze → Maître · Modes variés',
          'ELO · Bronze → Master · Mixed modes',
        )}
        onPress={props.onPlayRanked}
        trailing={Trophy}
        isDarkMode={isDarkMode}
      />
      <BigCard
        icon={Users}
        color={leagueColor}
        title={tr(language, 'Ligue', 'League')}
        subtitle={tr(
          language,
          '3 défis par jour · classement privé',
          '3 daily challenges · private leaderboard',
        )}
        onPress={props.onOpenLeague}
        trailing={Trophy}
        isDarkMode={isDarkMode}
      />
      <BigCard
        icon={SlidersHorizontal}
        color={PALETTE.forestGreen}
        title={tr(language, 'Partie personnalisée', 'Custom game')}
        subtitle={tr(language, 'Enchaîne les modes de ton choix', 'Chain the modes you pick')}
        onPress={props.onPlayCustomOnline}
        trailing={ChevronRight}
        isDarkMode={isDarkMode}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginTop: 10,
        }}
      >
        <Text style={{ fontFamily: FONTS.headingBlack, fontSize: 19, color: c.text }}>
          {tr(language, 'Match rapide', 'Quick match')}
        </Text>
        <Text style={{ fontFamily: FONTS.mono, fontSize: 10, color: c.textMuted }}>
          {tr(language, '1 contre 1, un seul mode', '1 vs 1, one mode')}
        </Text>
      </View>

      {MODE_FAMILIES.map((family) => {
        const items = online.filter((m) => m.family === family.id);
        const { accent, tint } = familyColors(family.id, isDarkMode);
        // Capitales et Drapeaux se jouent en ligne dans le Mode Versus.
        const withVersus = family.id === 'recognize';
        if (items.length === 0 && !withVersus) return null;
        return (
          <View key={family.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: accent }} />
              <Text
                style={{
                  fontFamily: FONTS.monoBold,
                  fontSize: 10,
                  letterSpacing: 2,
                  color: c.textMuted,
                }}
              >
                {tr(language, family.fr, family.en).toUpperCase()}
              </Text>
            </View>
            <View
              style={{
                flexDirection: grid.wide ? 'row' : 'column',
                flexWrap: 'wrap',
                columnGap: MENU_GRID_GAP,
                rowGap: 10,
              }}
            >
              {items.map((m) => {
                const Icon = MODE_ICONS[m.mode];
                const mode = m.online!;
                if (!Icon) return null;
                return (
                  <ModeCard
                    key={mode}
                    icon={Icon}
                    accent={accent}
                    tint={tint}
                    title={tr(language, m.titleFr, m.titleEn)}
                    subtitle={tr(
                      language,
                      m.onlineSubtitleFr ?? m.subtitleFr,
                      m.onlineSubtitleEn ?? m.subtitleEn,
                    )}
                    isDarkMode={isDarkMode}
                    onPress={() => onPlayOnline(mode)}
                    onLeaderboard={() => onOpenOnlineModeLeaderboard(mode, accent)}
                    notify={incomingInviteMode === mode}
                  />
                );
              })}
              {withVersus && (
                <ModeCard
                  icon={MODE_ICONS['quiz-capital']!}
                  accent={accent}
                  tint={tint}
                  title={tr(language, 'Mode Versus', 'Versus Mode')}
                  subtitle={tr(
                    language,
                    'Capitales et drapeaux, face à un joueur',
                    'Capitals and flags, against a player',
                  )}
                  isDarkMode={isDarkMode}
                  onPress={() => onPlayOnline('versus')}
                  onLeaderboard={() => onOpenOnlineModeLeaderboard('versus', accent)}
                  notify={incomingInviteMode === 'versus'}
                />
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function LocalCard({ isDarkMode, onPlayLocal }: DuelTabProps) {
  const c = getColors(isDarkMode);
  const { language } = useLanguage();
  const grid = useMenuGrid();
  const blue = isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue;
  return (
    <View
      style={[
        styles.countryCard,
        !isDarkMode && styles.countryCardLight,
        {
          width: '100%',
          maxWidth: grid.cardCol,
          alignSelf: 'center',
          padding: 22,
          alignItems: 'center',
          gap: 12,
        },
      ]}
    >
      <View
        style={{
          backgroundColor: hexA(blue, isDarkMode ? 0.12 : 0.1),
          padding: 16,
          borderRadius: 16,
        }}
      >
        <Monitor color={blue} size={32} />
      </View>
      <Text
        style={[
          styles.countryName,
          !isDarkMode && styles.countryNameLight,
          { fontSize: 20, textAlign: 'center' },
        ]}
      >
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
        onPress={onPlayLocal}
        style={{
          marginTop: 6,
          height: 46,
          paddingHorizontal: 24,
          borderRadius: 13,
          backgroundColor: isDarkMode ? PALETTE.chartBlueStrong : PALETTE.oceanBlue,
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
  );
}

function LockedCard({ isDarkMode, onOpenSignup, onOpenAuth }: DuelTabProps) {
  const c = getColors(isDarkMode);
  const { language } = useLanguage();
  const grid = useMenuGrid();
  return (
    <View
      style={[
        styles.countryCard,
        !isDarkMode && styles.countryCardLight,
        {
          width: '100%',
          maxWidth: grid.cardCol,
          alignSelf: 'center',
          padding: 22,
          alignItems: 'center',
          gap: 12,
        },
      ]}
    >
      <View
        style={{
          backgroundColor: isDarkMode ? 'rgba(74,158,255,0.12)' : 'rgba(192,74,26,0.10)',
          padding: 16,
          borderRadius: 16,
        }}
      >
        <Lock color={c.accent} size={32} />
      </View>
      <Text
        style={[
          styles.countryName,
          !isDarkMode && styles.countryNameLight,
          { fontSize: 20, textAlign: 'center' },
        ]}
      >
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
          <LogIn color={c.text} size={16} />
          <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 13 }}>
            {tr(language, 'Connexion', 'Log in')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
