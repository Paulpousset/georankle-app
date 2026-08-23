/**
 * "Ce que tu as raté" — the end-of-run review, shared by every solo mode.
 *
 * Silhouette and Langues each grew their own recap; every other mode had none,
 * so a run ended with a score and no way to learn from it. This is that markup
 * extracted once, with the mistakes pulled to the top (they're what you came
 * back for) and each row opening the country's fact card.
 *
 * Rows are mode-agnostic on purpose: a mode supplies the question label, what
 * the player answered, and the right answer. `cca3` is optional — a row without
 * one simply isn't tappable.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { CountryFactCard } from './CountryFactCard';
import { a11yButton, a11yHidden } from '../lib/a11y';
import { tr } from '../i18n';
import { getColors, PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';

export interface RecapEntry {
  /** Country the question was about — makes the row open a fact card. */
  cca3?: string;
  /** What was asked ("Zambie", "Quelle est la capitale du Pérou ?"…). */
  prompt: string;
  /** What the player answered. Empty when they ran out of time. */
  yourAnswer?: string;
  /** The right answer, always shown on a miss. */
  correctAnswer: string;
  ok: boolean;
}

interface RunRecapProps {
  entries: RecapEntry[];
  /** Mistakes first (the default). Set false to keep play order. */
  mistakesFirst?: boolean;
  maxHeight?: number;
}

export function RunRecap({ entries, mistakesFirst = true, maxHeight = 260 }: RunRecapProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [factsFor, setFactsFor] = useState<string | null>(null);

  if (!entries.length) return null;

  // Stable partition — inside each group the play order is preserved, so the
  // recap still reads as a replay of the run.
  const ordered = mistakesFirst
    ? [...entries.filter((e) => !e.ok), ...entries.filter((e) => e.ok)]
    : entries;
  const missed = entries.filter((e) => !e.ok).length;

  return (
    <>
      <View style={{ alignSelf: 'stretch' }}>
        <Text style={[styles.kicker, { color: c.textFaint }]}>
          {missed === 0
            ? tr(language, 'SANS FAUTE', 'FLAWLESS')
            : tr(
                language,
                `CE QUE TU AS RATÉ · ${missed}`,
                `WHAT YOU MISSED · ${missed}`,
              )}
        </Text>
        <ScrollView
          style={[styles.list, { backgroundColor: c.card, borderColor: c.border, maxHeight }]}
          showsVerticalScrollIndicator={false}
        >
          {ordered.map((e, i) => {
            const tappable = !!e.cca3;
            const answerLine = e.ok
              ? e.correctAnswer
              : tr(
                  language,
                  `${e.yourAnswer || '—'}  →  ${e.correctAnswer}`,
                  `${e.yourAnswer || '—'}  →  ${e.correctAnswer}`,
                );
            const label = e.ok
              ? tr(language, `${e.prompt}, correct`, `${e.prompt}, correct`)
              : tr(
                  language,
                  `${e.prompt}, raté. Ta réponse ${e.yourAnswer || 'aucune'}. Bonne réponse ${e.correctAnswer}`,
                  `${e.prompt}, missed. You answered ${e.yourAnswer || 'nothing'}. Correct answer ${e.correctAnswer}`,
                );
            return (
              <TouchableOpacity
                key={`${e.prompt}-${i}`}
                disabled={!tappable}
                onPress={() => e.cca3 && setFactsFor(e.cca3)}
                style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}
                {...a11yButton(label, {
                  hint: tappable
                    ? tr(language, 'Voir la fiche du pays', 'See the country facts')
                    : undefined,
                })}
              >
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: e.ok ? PALETTE.forestGreen : PALETTE.dangerRed },
                  ]}
                  {...a11yHidden}
                />
                <View style={{ flex: 1 }} {...a11yHidden}>
                  <Text style={[styles.prompt, { color: c.text }]} numberOfLines={1}>
                    {e.prompt}
                  </Text>
                  <Text
                    style={[
                      styles.answer,
                      { color: e.ok ? c.textFaint : PALETTE.dangerRed },
                    ]}
                    numberOfLines={1}
                  >
                    {answerLine}
                  </Text>
                </View>
                {tappable && <ChevronRight color={c.textFaint} size={15} {...a11yHidden} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <CountryFactCard cca3={factsFor} onClose={() => setFactsFor(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.2, marginBottom: 6 },
  list: { borderWidth: 1, borderRadius: 14, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  prompt: { fontFamily: FONTS.monoBold, fontSize: 12.5, marginBottom: 2 },
  answer: { fontFamily: FONTS.mono, fontSize: 10.5 },
});
