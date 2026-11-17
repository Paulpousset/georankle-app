/**
 * Fenêtre du « Coffre du jour » : les 7 jours du cycle, le jour en cours mis
 * en avant, et le bouton pour ouvrir le coffre. Sans compte, elle invite à se
 * connecter (le coffre est versé côté serveur).
 */
import { useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import { Check, Gift, X } from 'lucide-react-native';

import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors, PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton } from '../lib/a11y';
import {
  CHEST_REWARDS,
  chestDay,
  chestReady,
  claimDailyChest,
  nextStreak,
  type ChestState,
} from '../lib/chest';
import { AtlasCoin } from './AtlasIcons';

export const CHEST_GOLD = '#b8791f';

interface Props {
  visible: boolean;
  state: ChestState;
  isAuthenticated: boolean;
  onClose: () => void;
  onOpenAuth: () => void;
  /** Après ouverture : nouvel état à refléter dans la bulle. */
  onClaimed: (state: ChestState) => void;
}

export function DailyChestModal({
  visible,
  state,
  isAuthenticated,
  onClose,
  onOpenAuth,
  onClaimed,
}: Props) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [busy, setBusy] = useState(false);
  const [won, setWon] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  const close = () => {
    setWon(null);
    setFailed(false);
    onClose();
  };

  const ready = chestReady(state);
  const streak = nextStreak(state);
  const today = chestDay(streak);

  const claim = async () => {
    setBusy(true);
    setFailed(false);
    const r = await claimDailyChest();
    setBusy(false);
    if (!r) {
      setFailed(true);
      return;
    }
    setWon(r.coins);
    onClaimed({ lastClaim: new Date().toISOString().slice(0, 10), streak: r.streak });
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={close}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.75)',
          padding: 20,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 380,
            backgroundColor: c.card,
            borderRadius: 24,
            padding: 22,
            borderWidth: 2,
            borderColor: CHEST_GOLD,
            gap: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Gift color={CHEST_GOLD} size={26} />
            <Text style={{ flex: 1, fontFamily: FONTS.headingBlack, fontSize: 22, color: c.text }}>
              {tr(language, 'Coffre du jour', 'Daily chest')}
            </Text>
            <TouchableOpacity onPress={close} {...a11yButton(tr(language, 'Fermer', 'Close'))}>
              <X color={c.textMuted} size={22} />
            </TouchableOpacity>
          </View>
          <Text
            style={{ fontFamily: FONTS.mono, fontSize: 12, color: c.textMuted, lineHeight: 17 }}
          >
            {tr(
              language,
              'Reviens chaque jour : le coffre grossit jusqu’au 7e jour. Un jour manqué, et ça repart de 1.',
              'Come back every day: the chest grows until day 7. Miss a day and it starts over.',
            )}
          </Text>

          {/* Les 7 jours du cycle */}
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}
          >
            {CHEST_REWARDS.map((coins, i) => {
              const day = i + 1;
              const done = ready ? day < today : day <= today;
              const current = day === today;
              return (
                <View
                  key={day}
                  style={{
                    width: day === 7 ? 108 : 70,
                    height: 70,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    borderWidth: current ? 2 : 1,
                    borderColor: current ? CHEST_GOLD : c.border,
                    backgroundColor: done
                      ? isDarkMode
                        ? 'rgba(184,121,31,0.25)'
                        : 'rgba(184,121,31,0.18)'
                      : c.surface,
                  }}
                >
                  <Text style={{ fontFamily: FONTS.monoBold, fontSize: 10, color: c.textMuted }}>
                    {tr(language, 'J{0}', 'D{0}', [day])}
                  </Text>
                  {done && !current ? (
                    <Check color={CHEST_GOLD} size={18} />
                  ) : day === 7 ? (
                    <Gift color={CHEST_GOLD} size={18} />
                  ) : (
                    <AtlasCoin color={PALETTE.sand} size={16} />
                  )}
                  <Text style={{ fontFamily: FONTS.headingBlack, fontSize: 14, color: c.text }}>
                    {coins}
                  </Text>
                </View>
              );
            })}
          </View>

          {won !== null ? (
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Text style={{ fontFamily: FONTS.headingBlack, fontSize: 26, color: CHEST_GOLD }}>
                +{won}
              </Text>
              <Text
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 12,
                  color: c.textMuted,
                  textAlign: 'center',
                }}
              >
                {tr(
                  language,
                  'Reviens demain pour le jour {0}.',
                  'Come back tomorrow for day {0}.',
                  [chestDay(streak + 1)],
                )}
              </Text>
            </View>
          ) : !isAuthenticated ? (
            <TouchableOpacity
              onPress={onOpenAuth}
              style={{
                height: 50,
                borderRadius: 25,
                backgroundColor: CHEST_GOLD,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              {...a11yButton(tr(language, 'Se connecter pour ouvrir', 'Sign in to open'))}
            >
              <Text style={{ fontFamily: FONTS.monoBold, fontSize: 14, color: '#fff' }}>
                {tr(language, 'Connecte-toi pour l’ouvrir', 'Sign in to open it')}
              </Text>
            </TouchableOpacity>
          ) : ready ? (
            <TouchableOpacity
              onPress={claim}
              disabled={busy}
              style={{
                height: 50,
                borderRadius: 25,
                backgroundColor: CHEST_GOLD,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
              }}
              {...a11yButton(tr(language, 'Ouvrir le coffre', 'Open the chest'), { busy })}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ fontFamily: FONTS.monoBold, fontSize: 15, color: '#fff' }}>
                  {tr(language, 'Ouvrir · +{0}', 'Open · +{0}', [CHEST_REWARDS[today - 1]])}
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <Text
              style={{
                fontFamily: FONTS.monoBold,
                fontSize: 13,
                color: c.textMuted,
                textAlign: 'center',
              }}
            >
              {tr(
                language,
                'Déjà ouvert aujourd’hui. À demain !',
                'Already opened today. See you tomorrow!',
              )}
            </Text>
          )}
          {failed && (
            <Text
              style={{
                fontFamily: FONTS.mono,
                fontSize: 11,
                color: PALETTE.dangerRed,
                textAlign: 'center',
              }}
            >
              {tr(
                language,
                'Impossible d’ouvrir le coffre. Réessaie.',
                'Could not open the chest. Try again.',
              )}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}
