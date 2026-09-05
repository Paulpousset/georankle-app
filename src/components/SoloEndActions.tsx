/**
 * Barre d'actions de fin de partie solo — le même trio partout.
 *
 * Chaque mode avait son propre bouton « Rejouer », qui retirait en fait un
 * nouveau lot de pays : impossible de refaire la partie qu'on venait de rater,
 * donc impossible de vérifier qu'on avait retenu. On distingue maintenant :
 *
 *  - « Rejouer la même partie » : mêmes pays, mêmes thèmes, mêmes questions.
 *    C'est l'action d'apprentissage, donc la principale.
 *  - « Nouvelle partie » : le tirage aléatoire d'avant.
 *  - « Menu » : la sortie.
 *
 * En défi quotidien la partie est unique : « Rejouer la même » n'a pas de sens
 * et « Partager » prend la place principale (`onShare`).
 */
import { Text, TouchableOpacity, View } from 'react-native';
import { Home, RefreshCcw, Share2, Shuffle } from 'lucide-react-native';

import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton, a11yHidden } from '../lib/a11y';
import { ScoreText } from './ScoreText';
import { tr } from '../i18n';

interface SoloEndActionsProps {
  /** Rejoue exactement le même contenu. Absent = bouton masqué. */
  onReplaySame?: () => void;
  /** Nouveau tirage. Absent = bouton masqué. */
  onNewGame?: () => void;
  /** Quotidien : remplace les deux boutons ci-dessus. */
  onShare?: () => void;
  onMenu: () => void;
  /** Libellé du bouton de sortie (« Menu » par défaut, « Retour » en révision). */
  menuLabel?: string;
  /** Couleur de l'action principale (par défaut l'accent du thème). */
  accent?: string;
}

export function SoloEndActions({
  onReplaySame,
  onNewGame,
  onShare,
  onMenu,
  menuLabel,
  accent,
}: SoloEndActionsProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const primary = accent ?? c.accentStrong;

  const btn = (
    key: string,
    label: string,
    Icon: typeof Home,
    onPress: () => void,
    kind: 'primary' | 'secondary',
  ) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      activeOpacity={0.85}
      {...a11yButton(label)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        paddingVertical: 14,
        paddingHorizontal: 10,
        borderRadius: 14,
        backgroundColor: kind === 'primary' ? primary : c.card,
        borderWidth: 1,
        borderColor: kind === 'primary' ? primary : c.border,
      }}
    >
      <Icon color={kind === 'primary' ? '#fff' : c.text} size={17} {...a11yHidden} />
      {/* Deux boutons côte à côte sur un écran de 360 px : sans rétrécissement,
          « Nouvelle partie » se faisait couper en « Nouvelle par… ». */}
      <ScoreText
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{
          flexShrink: 1,
          color: kind === 'primary' ? '#fff' : c.text,
          fontFamily: FONTS.monoBold,
          fontSize: 13.5,
        }}
      >
        {label}
      </ScoreText>
    </TouchableOpacity>
  );

  return (
    <View style={{ alignSelf: 'stretch', gap: 10 }}>
      {onShare
        ? btn('share', tr(language, 'Partager', 'Share'), Share2, onShare, 'primary')
        : onReplaySame
          ? btn(
              'same',
              tr(language, 'Rejouer la même partie', 'Replay the same game'),
              RefreshCcw,
              onReplaySame,
              'primary',
            )
          : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {onNewGame ? (
          <View style={{ flex: 1 }}>
            {btn(
              'new',
              tr(language, 'Nouvelle partie', 'New game'),
              Shuffle,
              onNewGame,
              onShare || onReplaySame ? 'secondary' : 'primary',
            )}
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          {btn('menu', menuLabel ?? tr(language, 'Menu', 'Menu'), Home, onMenu, 'secondary')}
        </View>
      </View>
    </View>
  );
}
