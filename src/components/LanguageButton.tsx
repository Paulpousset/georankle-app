/**
 * Le bouton de langue des en-têtes (menu, Défi du Jour).
 *
 * Un simple « FR » ne se lisait pas comme un sélecteur : le pictogramme
 * « traduction » et la petite flèche disent « langue » et « menu déroulant ».
 * Il ouvre le sélecteur des seize langues, monté une fois dans App.tsx.
 */
import { Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, Languages } from 'lucide-react-native';

import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { tr } from '../i18n';
import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';
import { commonStyles as styles } from '../theme/commonStyles';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';

export function LanguageButton() {
  const { language, openLanguagePicker } = useLanguage();
  const { isDarkMode } = useTheme();
  const c = getColors(isDarkMode);

  return (
    <TouchableOpacity
      onPress={openLanguagePicker}
      style={[
        styles.refreshBtn,
        !isDarkMode && styles.refreshBtnLight,
        { paddingVertical: 8, paddingHorizontal: 9, minWidth: 42, alignItems: 'center' },
      ]}
      hitSlop={ICON_HIT_SLOP}
      {...a11yButton(tr(language, 'Changer de langue', 'Change language'))}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Languages color={c.text} size={16} strokeWidth={1.8} />
        <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 11 }}>
          {language.toUpperCase()}
        </Text>
        <ChevronDown color={c.text} size={12} strokeWidth={2.2} />
      </View>
    </TouchableOpacity>
  );
}
