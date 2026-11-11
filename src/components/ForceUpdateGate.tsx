/**
 * Mise à jour obligatoire au lancement : si une mise à jour OTA attend, un
 * écran non fermable la télécharge et relance l'app dessus (lib/otaUpdate.ts).
 * Rien ne s'affiche tant que la vérification n'a rien trouvé ; en cas d'échec
 * l'écran disparaît et on joue avec la version actuelle.
 *
 * Vérifié au lancement, puis à chaque retour au premier plan après au moins
 * FOREGROUND_RECHECK_MS d'absence : sur Android surtout, l'app est reprise
 * depuis l'arrière-plan bien plus souvent que relancée, et un joueur pouvait
 * garder un vieux bundle des jours durant. Jamais en pleine partie : seulement
 * au retour d'une longue absence.
 *
 * Monté une fois à la racine, après le reste, pour passer au-dessus de tout.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Text, View } from 'react-native';
import { Download } from 'lucide-react-native';

import { tr } from '../i18n';
import { applyOtaUpdate, FOREGROUND_RECHECK_MS, isOtaUpdateAvailable } from '../lib/otaUpdate';
import { RECORDING_MODE } from '../lib/recordingMode';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';

export function ForceUpdateGate() {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [updating, setUpdating] = useState(false);

  const busy = useRef(false);

  useEffect(() => {
    // Pas dans le build de tournage : un rechargement casserait la vidéo.
    if (RECORDING_MODE) return;
    let alive = true;
    const check = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        if (!(await isOtaUpdateAvailable()) || !alive) return;
        setUpdating(true);
        // reloadAsync relance l'app : on ne revient ici qu'en cas d'échec.
        await applyOtaUpdate();
        if (alive) setUpdating(false);
      } finally {
        busy.current = false;
      }
    };
    void check();

    let backgroundSince: number | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundSince = Date.now();
      } else if (state === 'active' && backgroundSince !== null) {
        const away = Date.now() - backgroundSince;
        backgroundSince = null;
        if (away >= FOREGROUND_RECHECK_MS) void check();
      }
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  if (!updating) return null;

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
            alignItems: 'center',
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
            {tr(language, 'Mise à jour en cours', 'Updating')}
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
              'Une nouvelle version de GeoG arrive, l’app redémarre dans un instant.',
              'A new version of GeoG is on its way, the app will restart in a moment.',
            )}
          </Text>
          <ActivityIndicator color={c.accentStrong} />
        </View>
      </View>
    </Modal>
  );
}
