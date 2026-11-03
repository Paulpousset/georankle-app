/**
 * La barre d'onglets du menu principal : Accueil, Jouer, Histoire, Duel, Moi.
 *
 * Accueil / Jouer / Duel changent le contenu du menu ; Histoire (le globe du
 * joueur, au centre) et Moi ouvrent leur écran. La barre reste en bas, sous
 * le pouce, et pose les pastilles de notification (invitation de duel).
 */
import { forwardRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Globe2, Home, LayoutGrid, Swords, User } from 'lucide-react-native';

import type { AvatarConfig } from '../../types';
import { PALETTE, getColors } from '../../theme/colors';
import { FONTS } from '../../theme/typography';
import { tr } from '../../i18n';
import { useLanguage } from '../../contexts/LanguageContext';
import { a11yButton } from '../../lib/a11y';
import { playSfx } from '../../lib/sfx';
import { NotificationDot } from '../NotificationDot';
import { AvatarPreview3D } from '../AvatarPreview3D';
import type { MenuIcon } from './ModeTiles';

export type MenuTab = 'home' | 'play' | 'duel';

const CENTER = 58;

interface MenuTabBarProps {
  tab: MenuTab;
  onSelect: (tab: MenuTab) => void;
  onOpenStory: () => void;
  onOpenProfile: () => void;
  isDarkMode: boolean;
  isAuthenticated: boolean;
  /** Le globe du joueur (cosmétiques compris), au centre de la barre. */
  avatar: AvatarConfig | null | undefined;
  notifyDuel?: boolean;
  /** Le tour guidé vise l'onglet Jouer (la bibliothèque des modes)… */
  playRef?: React.Ref<View>;
  /** …et l'onglet Moi (profil). */
  profileRef?: React.Ref<View>;
}

export function MenuTabBar({
  tab,
  onSelect,
  onOpenStory,
  onOpenProfile,
  isDarkMode,
  isAuthenticated,
  avatar,
  notifyDuel = false,
  playRef,
  profileRef,
}: MenuTabBarProps) {
  const c = getColors(isDarkMode);
  const { language } = useLanguage();
  const insets = useSafeAreaInsets();
  const activeColor = isDarkMode ? PALETTE.chartBlue : PALETTE.vermilion;

  const select = (next: MenuTab) => {
    if (next !== tab) playSfx('tap');
    onSelect(next);
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'flex-start',
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingHorizontal: 6,
        backgroundColor: isDarkMode ? c.card : PALETTE.parchmentDark,
        borderTopWidth: 1,
        borderTopColor: c.border,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-around',
          width: '100%',
          maxWidth: 520,
        }}
      >
        <TabButton
          icon={Home}
          label={tr(language, 'Accueil', 'Home')}
          active={tab === 'home'}
          onPress={() => select('home')}
          color={c.textMuted}
          activeColor={activeColor}
        />
        <TabButton
          ref={playRef}
          icon={LayoutGrid}
          label={tr(language, 'Jouer', 'Play')}
          active={tab === 'play'}
          onPress={() => select('play')}
          color={c.textMuted}
          activeColor={activeColor}
        />
        {/* Histoire : le globe du joueur, en relief au-dessus de la barre. */}
        <TouchableOpacity
          onPress={onOpenStory}
          style={{ alignItems: 'center', width: 72 }}
          {...a11yButton(tr(language, 'Mode Histoire', 'Story Mode'), {
            hint: tr(language, 'Ouvrir la campagne', 'Open the campaign'),
          })}
        >
          <View
            style={{
              width: CENTER,
              height: CENTER,
              borderRadius: CENTER / 2,
              marginTop: -32,
              overflow: 'hidden',
              borderWidth: 3,
              borderColor: PALETTE.sand,
              backgroundColor: PALETTE.oceanBlue,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            {isAuthenticated ? (
              <AvatarPreview3D config={avatar ?? null} size={CENTER - 6} />
            ) : (
              <Globe2 color={PALETTE.parchment} size={28} />
            )}
          </View>
          <Text
            style={{ fontFamily: FONTS.monoBold, fontSize: 9.5, color: c.textMuted, marginTop: 3 }}
          >
            {tr(language, 'Histoire', 'Story')}
          </Text>
        </TouchableOpacity>
        <TabButton
          icon={Swords}
          label={tr(language, 'Duel', 'Duel')}
          active={tab === 'duel'}
          onPress={() => select('duel')}
          color={c.textMuted}
          activeColor={activeColor}
          notify={notifyDuel}
        />
        <TabButton
          ref={profileRef}
          icon={User}
          label={isAuthenticated ? tr(language, 'Moi', 'Me') : tr(language, 'Connexion', 'Log in')}
          active={false}
          onPress={onOpenProfile}
          color={c.textMuted}
          activeColor={activeColor}
        />
      </View>
    </View>
  );
}

interface TabButtonProps {
  icon: MenuIcon;
  label: string;
  active: boolean;
  onPress: () => void;
  color: string;
  activeColor: string;
  notify?: boolean;
}

const TabButton = forwardRef<View, TabButtonProps>(function TabButton(
  { icon: Icon, label, active, onPress, color, activeColor, notify = false },
  ref,
) {
  const tint = active ? activeColor : color;
  return (
    <TouchableOpacity
      ref={ref}
      onPress={onPress}
      style={{ alignItems: 'center', gap: 3, minWidth: 60, paddingVertical: 2 }}
      {...a11yButton(label, { selected: active })}
    >
      <View>
        <Icon color={tint} size={22} />
        <NotificationDot show={notify} />
      </View>
      <Text style={{ fontFamily: FONTS.monoBold, fontSize: 9.5, color: tint }}>{label}</Text>
    </TouchableOpacity>
  );
});
