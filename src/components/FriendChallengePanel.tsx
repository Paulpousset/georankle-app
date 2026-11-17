/**
 * Onglet Duel › « Défi entre amis » : choisir un mode pour lancer une grille à
 * envoyer, et voir les réponses à ses défis récents.
 *
 * Le temps réel tourne à vide (pas assez de joueurs en même temps) : le défi
 * en différé est donc mis en tête de l'onglet. Voir src/lib/friendChallenge.ts.
 */
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Send, X } from 'lucide-react-native';

import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton, a11yHidden } from '../lib/a11y';
import { DAILY_MODES, dailyModeLabel } from '../lib/daily';
import {
  fetchMyChallenges,
  formatChallengeScore,
  requestCreateChallenge,
  type MyChallenge,
} from '../lib/friendChallenge';
import { tr } from '../i18n';

interface Props {
  visible: boolean;
  isDarkMode: boolean;
  onClose: () => void;
}

export function FriendChallengePanel({ visible, isDarkMode, onClose }: Props) {
  const c = getColors(isDarkMode);
  const { language } = useLanguage();
  const [mine, setMine] = useState<MyChallenge[]>([]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    fetchMyChallenges(10).then((rows) => {
      if (alive) setMine(rows);
    });
    return () => {
      alive = false;
    };
  }, [visible]);

  const pick = (mode: (typeof DAILY_MODES)[number]) => {
    onClose();
    requestCreateChallenge(mode);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: c.background, borderColor: c.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: c.text }]}>
              {tr(language, 'Défi entre amis', 'Friend challenge')}
            </Text>
            <TouchableOpacity onPress={onClose} {...a11yButton(tr(language, 'Fermer', 'Close'))}>
              <X color={c.textMuted} size={22} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.sub, { color: c.textMuted }]}>
            {tr(
              language,
              'Joue une grille, envoie le lien : ton ami joue la même quand il veut, sans être en ligne en même temps.',
              'Play a grid, send the link: your friend plays the same one whenever they like, no need to be online together.',
            )}
          </Text>
          <ScrollView
            style={{ maxHeight: 460 }}
            contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
          >
            <View style={styles.modes}>
              {DAILY_MODES.map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => pick(m)}
                  style={[styles.mode, { borderColor: c.border, backgroundColor: c.card }]}
                  {...a11yButton(dailyModeLabel(m, language))}
                >
                  <Text style={[styles.modeText, { color: c.text }]} numberOfLines={1}>
                    {dailyModeLabel(m, language)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {mine.length > 0 ? (
              <>
                <Text style={[styles.section, { color: c.textMuted }]}>
                  {tr(language, 'MES DÉFIS', 'MY CHALLENGES')}
                </Text>
                {mine.map((ch) => (
                  <View
                    key={ch.code}
                    style={[styles.row, { borderColor: c.border, backgroundColor: c.card }]}
                  >
                    <Send color={c.accent} size={16} {...a11yHidden} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={1}>
                        {dailyModeLabel(ch.mode, language)} ·{' '}
                        {formatChallengeScore(ch.mode, ch.creator_score, language)}
                      </Text>
                      <Text style={[styles.rowSub, { color: c.textMuted }]} numberOfLines={2}>
                        {ch.results.length === 0
                          ? tr(language, 'Pas encore de réponse', 'No answer yet')
                          : ch.results
                              .map(
                                (r) =>
                                  `${r.username ?? '?'} ${formatChallengeScore(ch.mode, r.score, language)}`,
                              )
                              .join(' · ')}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 },
  sheet: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: FONTS.heading, fontSize: 20 },
  sub: { fontFamily: FONTS.mono, fontSize: 12 },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mode: { borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  modeText: { fontFamily: FONTS.monoBold, fontSize: 12.5 },
  section: { fontFamily: FONTS.monoBold, fontSize: 10, letterSpacing: 2, marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  rowTitle: { fontFamily: FONTS.monoBold, fontSize: 12.5 },
  rowSub: { fontFamily: FONTS.mono, fontSize: 11, marginTop: 2 },
});
