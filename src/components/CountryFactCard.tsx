/**
 * The "learn something" card for one country.
 *
 * Opened from a run recap row, or from the "En savoir plus" button on a wrong
 * answer. It exists because naming the right answer teaches nothing: what makes
 * Zambia memorable is that it borders eight countries and sits 39th by area,
 * not the four letters of its name.
 *
 * Deliberately a pull, not a push — a modal the player opens — so the pace of a
 * timed run is never broken by a wall of statistics.
 */
import { useMemo } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';

import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { countryFacts, pickNotableRank } from '../lib/countryFacts';
import { getFlagUrl } from '../lib/flags';
import { a11yButton, a11yHidden, a11yImage } from '../lib/a11y';
import { tr } from '../i18n';
import { getColors, PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';

interface CountryFactCardProps {
  /** Country to describe; null closes the card. */
  cca3: string | null;
  onClose: () => void;
}

export function CountryFactCard({ cca3, onClose }: CountryFactCardProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);

  // Memoised on the country so a re-render can't swap the fact mid-read; the
  // draw happens again next time the card is opened.
  const facts = useMemo(() => (cca3 ? countryFacts(cca3, language) : null), [cca3, language]);
  const rank = useMemo(() => (facts ? pickNotableRank(facts.ranks) : null), [facts]);
  if (!facts) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.backdrop}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
        >
          <View style={styles.header}>
            <Image
              source={{ uri: getFlagUrl(facts.cca3) }}
              style={styles.flag}
              {...a11yImage(tr(language, `Drapeau : ${facts.name}`, `Flag: ${facts.name}`))}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.kicker, { color: c.textFaint }]}>
                {tr(language, 'FICHE PAYS', 'COUNTRY FACTS')}
              </Text>
              <Text style={[styles.title, { color: c.text }]}>{facts.name}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              {...a11yButton(tr(language, 'Fermer', 'Close'))}
            >
              <X color={c.textFaint} size={20} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            <View style={[styles.block, { borderColor: c.border }]}>
              {facts.rows.map((row) => (
                <View
                  key={row.label}
                  style={styles.factRow}
                  accessible
                  accessibilityLabel={`${row.label} : ${row.value}`}
                >
                  <Text style={[styles.factLabel, { color: c.textFaint }]} {...a11yHidden}>
                    {row.label}
                  </Text>
                  <Text style={[styles.factValue, { color: c.text }]} {...a11yHidden}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>

            {rank && (
              <>
                <Text style={[styles.kicker, { color: c.textFaint, marginBottom: 6 }]}>
                  {tr(language, 'DANS LE MONDE', 'IN THE WORLD')}
                </Text>
                {[rank].map((r) => (
                  <View
                    key={r.themeId}
                    style={[styles.rankRow, { borderColor: c.border }]}
                    accessible
                    accessibilityLabel={tr(
                      language,
                      `${r.label} : ${r.rank}ᵉ sur ${r.total}${
                        r.position === 'bottom' ? `, ${r.fromEnd}ᵉ en partant de la fin` : ''
                      }. ${r.hint}`,
                      `${r.label}: ranked ${r.rank} of ${r.total}${
                        r.position === 'bottom' ? `, ${r.fromEnd}${r.fromEnd === 1 ? 'st' : 'th'} from last` : ''
                      }. ${r.hint}`,
                    )}
                  >
                    <View
                      style={[
                        styles.rankBadge,
                        // Surface dédiée, PAS `c.textFaint` : c'est une couleur
                        // de texte secondaire, et l'utiliser en fond sous du
                        // blanc donnait 3,5:1 en thème sombre. Ce gris ardoise
                        // tient dans les deux thèmes (6,4:1 avec du blanc).
                        r.position === 'bottom' && { backgroundColor: PALETTE.slateMuted },
                      ]}
                    >
                      <Text style={styles.rankNumber}>{r.rank}</Text>
                      <Text style={styles.rankTotal}>/{r.total}</Text>
                    </View>
                    <View style={{ flex: 1 }} {...a11yHidden}>
                      <Text style={[styles.rankLabel, { color: c.text }]}>{r.label}</Text>
                      {/* A raw "138/142" reads as mid-table; say which end it is. */}
                      {r.position === 'bottom' && (
                        <Text style={[styles.rankFromEnd, { color: c.textFaint }]}>
                          {tr(
                            language,
                            r.fromEnd === 1
                              ? 'dernier mondial'
                              : `${r.fromEnd}ᵉ en partant de la fin`,
                            r.fromEnd === 1 ? 'last in the world' : `${r.fromEnd}th from last`,
                          )}
                        </Text>
                      )}
                      <Text style={[styles.rankHint, { color: c.textFaint }]}>{r.hint}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.82)',
    padding: 20,
  },
  card: { width: '100%', maxWidth: 380, borderRadius: 22, borderWidth: 1, padding: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  flag: { width: 46, height: 31, borderRadius: 4 },
  kicker: { fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.2 },
  title: { fontFamily: FONTS.headingBlack, fontSize: 20 },
  block: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginBottom: 16 },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 8 },
  factLabel: { fontFamily: FONTS.mono, fontSize: 11 },
  factValue: { fontFamily: FONTS.monoBold, fontSize: 12, flexShrink: 1, textAlign: 'right' },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: PALETTE.oceanBlue,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  rankNumber: { fontFamily: FONTS.monoBold, color: '#fff', fontSize: 15 },
  rankTotal: { fontFamily: FONTS.mono, color: 'rgba(255,255,255,0.7)', fontSize: 9 },
  rankLabel: { fontFamily: FONTS.monoBold, fontSize: 12.5, marginBottom: 2 },
  rankFromEnd: { fontFamily: FONTS.monoBold, fontSize: 9.5, marginBottom: 2 },
  rankHint: { fontFamily: FONTS.mono, fontSize: 9.5, lineHeight: 13 },
});
