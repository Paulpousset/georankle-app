/**
 * Écran bloquant « mise à jour obligatoire ».
 *
 * Vérifie la version minimale au lancement et à chaque retour au premier plan
 * (le joueur revient souvent du store sans avoir relancé l'app). Si la version
 * installée est trop ancienne, une carte non fermable couvre tout et renvoie
 * vers l'App Store / le Play Store. Voir lib/forceUpdate.ts.
 *
 * Monté une fois à la racine, après le reste, pour passer au-dessus de tout.
 */
import { useEffect, useState } from 'react';
import { AppState, Linking, Modal, Text, TouchableOpacity, View } from 'react-native';
import { Download } from 'lucide-react-native';

import { tr } from '../i18n';
import { isUpdateRequired, storeUrl } from '../lib/forceUpdate';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton } from '../lib/a11y';

export function ForceUpdateGate() {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [required, setRequired] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = () => {
      isUpdateRequired()
        .then((v) => {
          if (alive) setRequired(v);
        })
        .catch(() => {});
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  if (!required) return null;

  const cta = tr(language, 'Mettre à jour', 'Update');

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.9)',
          padding: 20,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 350,
            backgroundColor: c.card,
            borderRadius: 24,
            padding: 24,
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: c.accentStrong,
              alignItems: 'center',
              justifyContent: 'center',
              alignSelf: 'center',
              marginBottom: 16,
            }}
          >
            <Download color="#fff" size={30} />
          </View>

          <Text
            style={{
              fontFamily: FONTS.headingBlack,
              fontSize: 20,
              color: c.text,
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            {tr(language, 'Mise à jour nécessaire', 'Update required')}
          </Text>
          <Text
            style={{
              fontFamily: FONTS.mono,
              fontSize: 13,
              color: c.textMuted,
              textAlign: 'center',
              lineHeight: 19,
              marginBottom: 20,
            }}
          >
            {tr(
              language,
              'Une nouvelle version de GeoG est disponible. Mets à jour l’app pour continuer à jouer.',
              'A new version of GeoG is available. Update the app to keep playing.',
            )}
          </Text>

          <TouchableOpacity
            onPress={() => {
              Linking.openURL(storeUrl()).catch(() => {});
            }}
            style={{
              height: 50,
              borderRadius: 14,
              backgroundColor: c.accentStrong,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            {...a11yButton(cta)}
          >
            <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 15 }}>{cta}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
