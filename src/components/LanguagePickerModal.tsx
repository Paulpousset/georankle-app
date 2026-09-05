/**
 * Le sélecteur de langue, seize entrées.
 *
 * Il remplace la bascule fr/en d'origine, qui ne pouvait plus rien vouloir dire
 * au-delà de deux langues. Chaque langue est écrite **dans sa propre langue** :
 * un joueur tombé sur une interface qu'il ne lit pas doit pouvoir retrouver la
 * sienne, et « Ελληνικά » y sert mieux que « Grec ».
 *
 * Monté une seule fois par le Router, ouvert par `openLanguagePicker()` depuis
 * n'importe quel écran — le menu, une partie en cours, l'écran de connexion.
 */
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, X } from 'lucide-react-native';

import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LANGUAGE_CODES, LOCALES } from '../i18n/locales';
import { a11yButton } from '../lib/a11y';
import { tr } from '../i18n';

export function LanguagePickerModal() {
  const { isDarkMode } = useTheme();
  const { language, languagePickerOpen, closeLanguagePicker, chooseLanguage } = useLanguage();
  const c = getColors(isDarkMode);

  return (
    <Modal
      visible={languagePickerOpen}
      transparent
      animationType="slide"
      onRequestClose={closeLanguagePicker}
    >
      <Pressable style={styles.backdrop} onPress={closeLanguagePicker}>
        <Pressable
          style={[styles.sheet, { backgroundColor: c.background, borderColor: c.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: c.text }]}>
              {tr(language, 'Choisis ta langue', 'Choose your language')}
            </Text>
            <TouchableOpacity
              onPress={closeLanguagePicker}
              {...a11yButton(tr(language, 'Fermer', 'Close'))}
            >
              <X color={c.textMuted} size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.list}>
            {LANGUAGE_CODES.map((code) => {
              const meta = LOCALES[code];
              const active = code === language;
              return (
                <TouchableOpacity
                  key={code}
                  onPress={() => chooseLanguage(code)}
                  style={[
                    styles.row,
                    { borderColor: active ? c.accent : c.border, backgroundColor: c.card },
                  ]}
                  {...a11yButton(meta.english, { selected: active })}
                >
                  <Text style={styles.flag}>{meta.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.native, { color: c.text }]} numberOfLines={1}>
                      {meta.native}
                    </Text>
                    <Text style={[styles.code, { color: c.textFaint }]}>{code.toUpperCase()}</Text>
                  </View>
                  {active && <Check color={c.accent} size={18} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '82%',
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontFamily: FONTS.headingBlack, fontSize: 20 },
  list: { gap: 8, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  flag: { fontSize: 22 },
  native: { fontFamily: FONTS.monoBold, fontSize: 15 },
  code: { fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1, marginTop: 2 },
});
