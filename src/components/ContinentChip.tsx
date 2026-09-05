/**
 * The solo "zone" selector — a chip above the mode grid, plus its picker sheet.
 *
 * Choosing a continent narrows the answer pool of every country mode, which is
 * how the solo tab becomes a place to *revise* ("je bosse l'Afrique") rather
 * than only to score. The choice is sticky (AsyncStorage, see lib/soloScope)
 * because a player working on one continent plays several runs in a row.
 *
 * The sheet is honest about the trade-offs it can't hide: each row shows how
 * many countries the continent holds, and a continent that some mode can't
 * honour (Oceania has 14 countries and only 3 usable silhouettes) says which
 * modes will still be played worldwide, instead of quietly lying.
 */
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, ChevronDown, Globe2, GraduationCap } from 'lucide-react-native';

import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { CONTINENTS, continentCount, type ContinentId } from '../data/continents';
import { ContinentIcon } from './ContinentIcon';
import { unsupportedModes } from '../lib/soloScope';
import { a11yButton, announce } from '../lib/a11y';
import { tr } from '../i18n';
import { getColors, PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { hoverLift } from '../lib/webHover';
import type { GameMode, Language } from '../types';

/** Short mode names, only ever used to explain a worldwide fallback. */
const MODE_NAMES: Partial<Record<GameMode, { fr: string; en: string }>> = {
  classic: { fr: 'Rankle', en: 'Rankle' },
  silhouette: { fr: 'Silhouette', en: 'Silhouette' },
  globe: { fr: 'Globe Géo', en: 'Geo Globe' },
  guess: { fr: 'Devinez le Pays', en: 'Guess the Country' },
  streak: { fr: 'Streak', en: 'Streak' },
  higherlower: { fr: 'Plus ou Moins', en: 'Higher or Lower' },
  'quiz-capital': { fr: 'Capitales', en: 'Capitals' },
  'quiz-flag': { fr: 'Drapeaux', en: 'Flags' },
};

const modeNames = (modes: GameMode[], language: Language) =>
  modes.map((m) => (MODE_NAMES[m] ? tr(language, MODE_NAMES[m].fr, MODE_NAMES[m].en) : m)).join(', ');

interface ContinentChipProps {
  scope: ContinentId | null;
  onChange: (scope: ContinentId | null) => void;
  training: boolean;
  onChangeTraining: (training: boolean) => void;
  /** Opens/closes the picker sheet — owned by the parent so back can close it. */
  open: boolean;
  setOpen: (open: boolean) => void;
}

export function ContinentChip({ scope, onChange, training, onChangeTraining, open, setOpen }: ContinentChipProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);

  const active = CONTINENTS.find((x) => x.id === scope) ?? null;
  const label = active
    ? (tr(language, active.fr, active.en))
    : tr(language, 'Monde', 'World');

  const select = (next: ContinentId | null) => {
    onChange(next);
    setOpen(false);
    const continent = next ? CONTINENTS.find((x) => x.id === next) : undefined;
    const name = continent ? tr(language, continent.fr, continent.en) : next ?? tr(language, 'Monde', 'World');
    announce(tr(language, 'Zone : {0}', 'Zone: {0}', [name]));
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[
          styles.chip,
          {
            backgroundColor: c.card,
            borderColor: scope ? PALETTE.oceanBlue : c.border,
          },
        ]}
        {...a11yButton(tr(language, 'Zone de jeu : {0}', 'Play zone: {0}', [label]), {
          hint: tr(language, 'Choisir un continent', 'Pick a continent'),
        })}
        {...hoverLift}
      >
        <ContinentIcon continent={scope} color={scope ? PALETTE.oceanBlue : c.text} size={21} />
        <Text style={[styles.chipCaption, { color: c.textFaint }]}>
          {tr(language, 'ZONE', 'ZONE')}
        </Text>
        <Text style={[styles.chipLabel, { color: c.text }]}>{label}</Text>
        {training && (
          <Text style={[styles.chipCaption, { color: PALETTE.forestGreen }]}>
            {tr(language, '· ENTRAÎNEMENT', '· TRAINING')}
          </Text>
        )}
        {/* The affordance: without it the chip reads as a label, not a control. */}
        <View style={styles.chipSpacer} />
        <ChevronDown color={c.textFaint} size={15} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setOpen(false)}
          style={styles.backdrop}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.sheetHeader}>
              <Globe2 color={PALETTE.oceanBlue} size={20} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetKicker, { color: c.textFaint }]}>
                  {tr(language, 'JOUER EN SOLO', 'SOLO PLAY')}
                </Text>
                <Text style={[styles.sheetTitle, { color: c.text }]}>
                  {tr(language, 'Choisis ta zone', 'Pick your zone')}
                </Text>
              </View>
            </View>
            <Text style={[styles.sheetBlurb, { color: c.textMuted }]}>
              {tr(
                language,
                'Les questions ne porteront plus que sur cette zone. Les parties ainsi jouées rapportent des pièces mais n’entrent pas au classement.',
                'Questions will only cover this zone. Such runs still earn coins, but stay off the leaderboard.',
              )}
            </Text>

            <ScrollView style={{ maxHeight: 420 }}>
              <ZoneRow
                continent={null}
                label={tr(language, 'Monde', 'World')}
                sub={tr(language, '195 pays · classement actif', '195 countries · leaderboard on')}
                selected={scope === null}
                onPress={() => select(null)}
                colors={c}
                language={language}
              />
              {CONTINENTS.map((cont) => {
                const missing = unsupportedModes(cont.id);
                const count = continentCount(cont.id);
                return (
                  <ZoneRow
                    key={cont.id}
                    continent={cont.id}
                    label={tr(language, cont.fr, cont.en)}
                    sub={
                      missing.length
                        ? tr(
                            language, '{0} pays · {1} reste{2} en monde', '{0} countries · {3} stay{4} worldwide', [count, modeNames(missing, 'fr'), missing.length > 1 ? 'nt' : '', modeNames(missing, 'en'), missing.length > 1 ? '' : 's'],
                          )
                        : tr(language, '{0} pays', '{0} countries', [count])
                    }
                    selected={scope === cont.id}
                    onPress={() => select(cont.id)}
                    colors={c}
                    language={language}
                  />
                );
              })}
            </ScrollView>

            {/* Same sheet, same question: how do I want to play solo now? */}
            <TouchableOpacity
              onPress={() => onChangeTraining(!training)}
              style={[
                styles.toggle,
                { borderColor: training ? PALETTE.forestGreen : c.border },
              ]}
              {...a11yButton(tr(language, 'Mode entraînement', 'Training mode'), {
                role: 'switch',
                selected: training,
                hint: tr(
                  language,
                  'Sans échec ni score : la bonne réponse est toujours expliquée',
                  'No failure, no score: every answer is explained',
                ),
              })}
              {...hoverLift}
            >
              <GraduationCap
                color={training ? PALETTE.forestGreen : c.textMuted}
                size={20}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: c.text }]}>
                  {tr(language, 'Mode entraînement', 'Training mode')}
                </Text>
                <Text style={[styles.rowSub, { color: c.textFaint }]}>
                  {tr(
                    language,
                    'Aucune erreur ne termine la partie · ni pièces ni classement',
                    'No mistake ends the run · no coins, no leaderboard',
                  )}
                </Text>
              </View>
              <View
                style={[
                  styles.switchTrack,
                  { backgroundColor: training ? PALETTE.forestGreen : c.border },
                ]}
              >
                <View style={[styles.switchThumb, training && { alignSelf: 'flex-end' }]} />
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

interface ZoneRowProps {
  /** null = the world row. */
  continent: ContinentId | null;
  label: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof getColors>;
  language: Language;
}

function ZoneRow({ continent, label, sub, selected, onPress, colors, language }: ZoneRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.row, { borderColor: selected ? PALETTE.oceanBlue : colors.border }]}
      {...a11yButton(`${label}. ${sub}`, {
        selected,
        hint: tr(language, 'Jouer dans cette zone', 'Play in this zone'),
      })}
      {...hoverLift}
    >
      <ContinentIcon
        continent={continent}
        color={selected ? PALETTE.oceanBlue : colors.textMuted}
        size={24}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.rowSub, { color: colors.textFaint }]}>{sub}</Text>
      </View>
      {selected && <Check color={PALETTE.oceanBlue} size={18} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  chipSpacer: { flex: 1 },
  chipCaption: { fontFamily: FONTS.mono, fontSize: 8.5, letterSpacing: 1.2 },
  chipLabel: { fontFamily: FONTS.monoBold, fontSize: 13 },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sheetKicker: { fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 1.2 },
  sheetTitle: { fontFamily: FONTS.headingBlack, fontSize: 18 },
  sheetBlurb: { fontFamily: FONTS.mono, fontSize: 11.5, lineHeight: 17, marginBottom: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
    marginBottom: 8,
  },
  rowLabel: { fontFamily: FONTS.monoBold, fontSize: 13.5, marginBottom: 2 },
  rowSub: { fontFamily: FONTS.mono, fontSize: 9.5, lineHeight: 13 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
    marginTop: 4,
  },
  switchTrack: { width: 40, height: 22, borderRadius: 11, padding: 3, justifyContent: 'center' },
  switchThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' },
});
