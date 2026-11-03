/**
 * Petit bouton « son » flottant, présent sur tous les écrans.
 *
 * Monté une seule fois dans App.tsx, au-dessus de l'app mais sous les modales
 * (langues, alertes) et l'intro. Il pilote le même réglage que l'interrupteur
 * du profil (src/lib/sfx.ts) : les deux restent synchronisés.
 *
 * Coin bas-gauche, 34 px, discret : les écrans de jeu gardent leurs boutons
 * pleine largeur et leur globe, le pouce du droitier ne passe pas dessus.
 */
import React, { useEffect, useSyncExternalStore } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Volume2, VolumeX } from 'lucide-react-native';

import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useSfxEnabled } from '../lib/sfx';
import { a11yButton } from '../lib/a11y';
import { tr } from '../i18n';

/**
 * Hauteur réservée en bas par l'écran courant (la barre d'onglets du menu) :
 * le bouton se pose au-dessus au lieu de la masquer.
 */
let bottomLift = 0;
const liftListeners = new Set<() => void>();
function setBottomLift(px: number) {
  if (px === bottomLift) return;
  bottomLift = px;
  liftListeners.forEach((l) => l());
}
function subscribeLift(l: () => void) {
  liftListeners.add(l);
  return () => {
    liftListeners.delete(l);
  };
}

/** Un écran avec une barre en bas soulève le bouton son de `px` tant qu'il est monté. */
export function useLiftSoundToggle(px: number) {
  useEffect(() => {
    setBottomLift(px);
    return () => setBottomLift(0);
  }, [px]);
}

export function SoundToggle() {
  const [on, setOn] = useSfxEnabled();
  const lift = useSyncExternalStore(
    subscribeLift,
    () => bottomLift,
    () => 0,
  );
  const { colors: c } = useTheme();
  const { language } = useLanguage();
  const insets = useSafeAreaInsets();

  const Icon = on ? Volume2 : VolumeX;
  return (
    <TouchableOpacity
      onPress={() => setOn(!on)}
      hitSlop={8}
      style={[
        styles.button,
        {
          bottom: lift > 0 ? lift + 10 : insets.bottom + 10,
          left: insets.left + 10,
          backgroundColor: c.card,
          borderColor: c.border,
        },
      ]}
      {...a11yButton(
        on
          ? tr(language, 'Couper le son', 'Mute sound')
          : tr(language, 'Activer le son', 'Unmute sound'),
        { selected: !on },
      )}
    >
      <Icon color={c.textMuted} size={16} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.85,
    zIndex: 50,
    elevation: 4,
  },
});
