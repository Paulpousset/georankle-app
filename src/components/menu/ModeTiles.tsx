/**
 * Les briques du menu principal : tuile de mode (onglet Jouer), carte de mode
 * en ligne (onglet Duel), couleurs de famille et géométrie de grille.
 */
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import {
  Flag,
  Globe,
  HelpCircle,
  Info,
  Landmark,
  Languages,
  LayoutGrid,
  Map,
  MapPin,
  Puzzle,
  Route,
  Ruler,
  Scissors,
  Star,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react-native';
import type { ComponentType } from 'react';

import type { GameMode } from '../../types';
import type { ModeFamily } from '../../data/menuModes';
import { commonStyles as styles } from '../../theme/commonStyles';
import { PALETTE, getColors } from '../../theme/colors';
import { FONTS } from '../../theme/typography';
import { tr } from '../../i18n';
import { useLanguage } from '../../contexts/LanguageContext';
import { a11yButton, ICON_HIT_SLOP } from '../../lib/a11y';
import { useStageWidth } from '../../lib/stage';
import { hoverLift } from '../../lib/webHover';
import { NotificationDot } from '../NotificationDot';
import { ContinentIcon } from '../ContinentIcon';

export type MenuIcon = ComponentType<{ color: string; size: number }>;

export const MODE_ICONS: Partial<Record<GameMode, MenuIcon>> = {
  globe: Globe,
  borders: Route,
  split: Scissors,
  scale: Ruler,
  pinpoint: MapPin,
  regions: Map,
  guess: Info,
  silhouette: Puzzle,
  'quiz-flag': Flag,
  'quiz-capital': Landmark,
  languages: Languages,
  classic: LayoutGrid,
  higherlower: TrendingUp,
  streak: Zap,
};

/**
 * Une couleur par famille, pour que l'œil range les modes avant de lire.
 * Sur fond nuit, les teintes claires gardent le contraste en texte/icône.
 */
export function familyColors(
  family: ModeFamily,
  isDarkMode: boolean,
): { accent: string; tint: string } {
  switch (family) {
    case 'map':
      return isDarkMode
        ? { accent: PALETTE.chartBlue, tint: 'rgba(74,158,255,0.12)' }
        : { accent: PALETTE.oceanBlue, tint: 'rgba(26,74,122,0.10)' };
    case 'recognize':
      return isDarkMode
        ? { accent: '#f08a5d', tint: 'rgba(240,138,93,0.13)' }
        : { accent: PALETTE.vermilion, tint: 'rgba(192,74,26,0.10)' };
    case 'compare':
      return isDarkMode
        ? { accent: '#5fbf7f', tint: 'rgba(95,191,127,0.13)' }
        : { accent: PALETTE.forestGreen, tint: 'rgba(42,110,63,0.10)' };
  }
}

/** Colonne de contenu du menu sur téléphone — la mise en page de référence. */
export const MENU_COL = 400;
/**
 * Colonne de contenu sur ordinateur (web) : trois tuiles par ligne au lieu de
 * deux, pour ne pas laisser une colonne étroite au milieu du vide.
 */
const MENU_COL_WIDE = 720;
/** Gouttière entre deux tuiles/cartes de la grille élargie. */
export const MENU_GRID_GAP = 14;

/**
 * Géométrie de la grille du menu. Web uniquement : le natif (téléphone comme
 * tablette) garde la mise en page téléphone.
 */
export function useMenuGrid() {
  const stageWidth = useStageWidth();
  const wide = Platform.OS === 'web' && stageWidth >= 780;
  const col = wide ? MENU_COL_WIDE : MENU_COL;
  return {
    wide,
    /** Largeur max de la colonne de contenu. */
    col,
    /** Grandes cartes seules (Local, En ligne verrouillé) : inutile de les étirer. */
    cardCol: wide ? 480 : MENU_COL,
    /** Tuile de mode : 3 par ligne en grand, 2 sinon. */
    tile: wide ? (col - MENU_GRID_GAP * 2) / 3 : ('48.4%' as const),
    /** Carte de mode en ligne : 2 par ligne en grand, pleine largeur sinon. */
    card: wide ? (col - MENU_GRID_GAP) / 2 : ('100%' as const),
  };
}

/** Petite pastille pleine (« NOUVEAU »). */
export function MenuBadge({ label, color }: { label: string; color: string }) {
  return (
    <View
      style={{ backgroundColor: color, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}
    >
      <Text
        style={{ fontFamily: FONTS.monoBold, color: '#fff', fontSize: 8.5, letterSpacing: 0.4 }}
      >
        {label}
      </Text>
    </View>
  );
}

interface ModeTileProps {
  icon: MenuIcon;
  accent: string;
  tint: string;
  title: string;
  subtitle: string;
  isDarkMode: boolean;
  onPress: () => void;
  onHelp?: () => void;
  /** Record personnel affiché en bas de la tuile (null = jamais joué / inconnu). */
  record?: number | null;
  isNew?: boolean;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  /**
   * Un continent est choisi mais le vivier de ce mode est trop petit : il sera
   * joué en monde entier. Signalé plutôt que désactivé.
   */
  worldOnly?: boolean;
}

/** Tuile de la grille des modes (onglet Jouer, Accueil « À essayer »). */
export function ModeTile({
  icon: Icon,
  accent,
  tint,
  title,
  subtitle,
  isDarkMode,
  onPress,
  onHelp,
  record,
  isNew,
  favorite,
  onToggleFavorite,
  worldOnly,
}: ModeTileProps) {
  const c = getColors(isDarkMode);
  const { language } = useLanguage();
  const { tile: tileWidth } = useMenuGrid();
  const smallBtn = {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.countryCard,
        !isDarkMode && styles.countryCardLight,
        {
          width: tileWidth,
          padding: 12,
          alignItems: 'flex-start',
          gap: 8,
          borderBottomWidth: 3,
          borderBottomColor: accent,
          minHeight: 132,
        },
      ]}
      {...a11yButton(
        worldOnly
          ? tr(language, '{0}, joué en monde entier', '{0}, played worldwide', [title])
          : title,
        { hint: tr(language, 'Démarrer ce mode', 'Start this mode') },
      )}
      {...hoverLift}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%' }}>
        <View style={{ backgroundColor: tint, padding: 9, borderRadius: 10 }}>
          <Icon color={accent} size={20} />
        </View>
        {worldOnly && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <ContinentIcon continent={null} color={c.textFaint} size={11} />
            <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 8 }}>
              {tr(language, 'monde', 'world')}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {isNew && <MenuBadge label={tr(language, 'NOUVEAU', 'NEW')} color={PALETTE.vermilion} />}
        {onToggleFavorite && !isNew && (
          <TouchableOpacity
            onPress={onToggleFavorite}
            hitSlop={ICON_HIT_SLOP}
            style={smallBtn}
            {...a11yButton(
              favorite
                ? tr(language, 'Retirer {0} des favoris', 'Remove {0} from favorites', [title])
                : tr(language, 'Ajouter {0} aux favoris', 'Add {0} to favorites', [title]),
              { selected: !!favorite },
            )}
          >
            <Star
              color={favorite ? PALETTE.sand : c.textFaint}
              fill={favorite ? PALETTE.sand : 'transparent'}
              size={13}
            />
          </TouchableOpacity>
        )}
        {onHelp && (
          <TouchableOpacity
            onPress={onHelp}
            hitSlop={ICON_HIT_SLOP}
            style={smallBtn}
            {...a11yButton(tr(language, 'Comment jouer à {0}', 'How to play {0}', [title]), {
              hint: tr(language, 'Voir les règles de ce mode', 'See this mode’s rules'),
            })}
          >
            <HelpCircle color={c.textFaint} size={13} />
          </TouchableOpacity>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.countryName,
            !isDarkMode && styles.countryNameLight,
            { fontSize: 14.5, textAlign: 'left', marginBottom: 2 },
          ]}
        >
          {title}
        </Text>
        <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 8.5, lineHeight: 12 }}>
          {subtitle}
        </Text>
      </View>
      {record != null && (
        <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 9 }}>
          {tr(language, 'Record', 'Best')}{' '}
          <Text style={{ fontFamily: FONTS.monoBold, color: c.text }}>{record}</Text>
        </Text>
      )}
    </TouchableOpacity>
  );
}

interface ModeCardProps {
  icon: MenuIcon;
  accent: string;
  tint: string;
  title: string;
  subtitle: string;
  isDarkMode: boolean;
  onPress: () => void;
  onLeaderboard?: () => void;
  /** Pastille de notification (ex. une invitation en attente pour ce mode). */
  notify?: boolean;
}

/** Carte de mode en ligne, avec son bouton de classement (onglet Duel). */
export function ModeCard({
  icon: Icon,
  accent,
  tint,
  title,
  subtitle,
  isDarkMode,
  onPress,
  onLeaderboard,
  notify = false,
}: ModeCardProps) {
  const c = getColors(isDarkMode);
  const { language } = useLanguage();
  const { card: cardWidth } = useMenuGrid();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: cardWidth }}>
      <TouchableOpacity
        onPress={onPress}
        style={[
          styles.countryCard,
          !isDarkMode && styles.countryCardLight,
          {
            flex: 1,
            paddingVertical: 12,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderLeftWidth: 4,
            borderLeftColor: accent,
          },
        ]}
        {...a11yButton(title, { hint: tr(language, 'Démarrer ce mode', 'Start this mode') })}
        {...hoverLift}
      >
        <View style={{ backgroundColor: tint, padding: 9, borderRadius: 10 }}>
          <Icon color={accent} size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.countryName,
              !isDarkMode && styles.countryNameLight,
              { fontSize: 15.5, textAlign: 'left', marginBottom: 2 },
            ]}
          >
            {title}
          </Text>
          <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 9.5 }}>
            {subtitle}
          </Text>
        </View>
        <NotificationDot show={notify} />
      </TouchableOpacity>
      {onLeaderboard && (
        <TouchableOpacity
          onPress={onLeaderboard}
          style={{
            padding: 13,
            borderRadius: 14,
            backgroundColor: tint,
            borderWidth: 1,
            borderColor: c.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          {...a11yButton(tr(language, 'Classement {0}', '{0} leaderboard', [title]))}
        >
          <Trophy color={accent} size={18} />
        </TouchableOpacity>
      )}
    </View>
  );
}
