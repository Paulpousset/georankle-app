import { useMemo, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Check, HelpCircle, Layers, Map as MapIcon, Play, Search, Wifi, XCircle } from 'lucide-react-native';
import Fuse from 'fuse.js';

import { getColors, PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';
import { getFlagUrl } from '../lib/flags';
import { REGION_MANIFEST, type RegionCountry } from '../../assets/regions';
import type { Language } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { challengesForCountry, type Challenge } from '../data/challenges';
import type { RegionLevelKey, RegionCountrySel } from './FindRegionGame';

export interface RegionPick extends RegionCountrySel {
  level: RegionLevelKey;
}

interface RegionCountryPickerProps {
  /** Returns one or more country/level picks (a single tap → array of one). */
  onPick: (picks: RegionPick[]) => void;
  onBack: () => void;
  title?: string;
  /**
   * When provided (solo only), each country's chooser also lists its CARRÉ/DUO/
   * CASH quizzes (src/data/challenges.ts) and countries with a quiz get a NEW
   * badge. Tapping a quiz launches it immediately via this callback.
   */
  onPickChallenge?: (challenge: Challenge) => void;
  /**
   * When provided, each listed quiz also offers an "En ligne" action that starts
   * a 1v1 match for that quiz (via challenge matchmaking).
   */
  onPickChallengeOnline?: (challenge: Challenge) => void;
}

function levelLabel(key: string, language: Language): string {
  return key === 'departments'
    ? tr(language, 'Départements', 'Departments')
    : tr(language, 'Régions', 'Regions');
}

const pickKey = (cca3: string, level: RegionLevelKey) => `${cca3}:${level}`;

export default function RegionCountryPicker({
  onPick,
  onBack,
  title,
  onPickChallenge,
  onPickChallengeOnline,
}: RegionCountryPickerProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<RegionCountry | null>(null);
  // Multi-select: tapping a country adds it to the mix; "Commencer" confirms.
  const [selected, setSelected] = useState<RegionPick[]>([]);

  const countries = REGION_MANIFEST;
  const fuse = useMemo(
    () => new Fuse(countries, { keys: ['name', 'name_en'], threshold: 0.3 }),
    [countries],
  );

  const list = useMemo(() => {
    if (search.trim().length > 1) return fuse.search(search).map((r) => r.item);
    return [...countries].sort((a, b) =>
      (language === 'fr' ? a.name : a.name_en).localeCompare(language === 'fr' ? b.name : b.name_en, language),
    );
  }, [search, fuse, countries, language]);

  const countryName = (x: RegionCountry) => (language === 'fr' ? x.name : (x.name_en ?? x.name));

  const isPicked = (cca3: string, level: RegionLevelKey) =>
    selected.some((p) => p.cca3 === cca3 && p.level === level);
  const isCountryPicked = (cca3: string) => selected.some((p) => p.cca3 === cca3);

  // Quizzes are surfaced when at least one way to launch them exists (solo / online).
  const countryChallenges = (cca3: string): Challenge[] =>
    onPickChallenge || onPickChallengeOnline ? challengesForCountry(cca3) : [];

  const toggle = (country: RegionCountry, level: RegionLevelKey) => {
    setSelected((prev) =>
      prev.some((p) => p.cca3 === country.cca3 && p.level === level)
        ? prev.filter((p) => !(p.cca3 === country.cca3 && p.level === level))
        : [...prev, { cca3: country.cca3, name: country.name, name_en: country.name_en, unit: country.unit, level }],
    );
  };

  const onCountryPress = (country: RegionCountry) => {
    // Open the chooser when there's a choice to make: multiple map levels, or a
    // quiz to offer alongside the map. Otherwise tap = add the single level.
    if (country.levels.length <= 1 && countryChallenges(country.cca3).length === 0) {
      toggle(country, (country.levels[0]?.key as RegionLevelKey) ?? 'regions');
    } else {
      setChosen(country);
    }
  };

  const confirm = () => {
    if (selected.length > 0) onPick(selected);
  };

  // Sticky "start" bar — shown once at least one country is in the mix.
  const renderConfirmBar = () => {
    if (selected.length === 0) return null;
    const label =
      selected.length === 1
        ? tr(language, 'Commencer', 'Start')
        : tr(language, `Commencer · ${selected.length} pays`, `Start · ${selected.length} countries`);
    return (
      <View style={[styles.confirmBar, { backgroundColor: c.card, borderTopColor: c.border }]}>
        <Text style={[styles.confirmCount, { color: c.textMuted }]} numberOfLines={1}>
          {selected.map((p) => (language === 'fr' ? p.name : (p.name_en ?? p.name))).join(', ')}
        </Text>
        <TouchableOpacity
          onPress={confirm}
          style={[styles.confirmBtn, { backgroundColor: PALETTE.oceanBlue }]}
          {...a11yButton(label)}
        >
          <Play color="white" size={18} />
          <Text style={styles.confirmBtnText}>{label}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── Level chooser (countries with both régions and départements) ──────────
  if (chosen) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity
            onPress={() => setChosen(null)}
            style={styles.iconBtn}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(tr(language, 'Retour', 'Back'))}
          >
            <ArrowLeft color={c.text} size={22} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>
            {countryName(chosen)}
          </Text>
          <View style={{ width: 38 }} />
        </View>

        <View style={{ padding: 20, gap: 14 }}>
          <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 6 }}>
            {(onPickChallenge || onPickChallengeOnline) && countryChallenges(chosen.cca3).length > 0
              ? tr(language, 'Choisis un jeu', 'Choose a game')
              : tr(language, 'Choisis le niveau de découpage', 'Choose the division level')}
          </Text>
          {chosen.levels.map((lvl) => {
            const Icon = lvl.key === 'departments' ? Layers : MapIcon;
            const picked = isPicked(chosen.cca3, lvl.key as RegionLevelKey);
            return (
              <TouchableOpacity
                key={lvl.key}
                onPress={() => toggle(chosen, lvl.key as RegionLevelKey)}
                style={[
                  styles.levelCard,
                  { backgroundColor: c.card, borderColor: picked ? PALETTE.oceanBlue : c.border },
                ]}
                {...a11yButton(`${levelLabel(lvl.key, language)}, ${lvl.count}`, {
                  hint: tr(language, 'Ajouter ou retirer ce niveau', 'Add or remove this level'),
                  selected: picked,
                })}
              >
                <Icon color={PALETTE.oceanBlue} size={26} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONTS.headingBlack, color: c.text, fontSize: 18 }}>
                    {levelLabel(lvl.key, language)}
                  </Text>
                  <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 12 }}>
                    {lvl.count} {levelLabel(lvl.key, language).toLowerCase()}
                  </Text>
                </View>
                {picked && <Check color={PALETTE.oceanBlue} size={22} />}
              </TouchableOpacity>
            );
          })}

          {/* Country-specific quizzes (CARRÉ/DUO/CASH): play solo or start a 1v1. */}
          {(onPickChallenge || onPickChallengeOnline) && countryChallenges(chosen.cca3).map((ch) => (
            <View
              key={ch.id}
              style={[styles.levelCard, { backgroundColor: c.card, borderColor: PALETTE.sand }]}
            >
              <HelpCircle color={PALETTE.sand} size={26} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontFamily: FONTS.headingBlack, color: c.text, fontSize: 18 }}>
                    {language === 'fr' ? ch.titleFr : ch.titleEn}
                  </Text>
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>{tr(language, 'NOUVEAU', 'NEW')}</Text>
                  </View>
                </View>
                <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 12 }}>
                  {(language === 'fr' ? ch.subtitleFr : ch.subtitleEn)} · CARRÉ · DUO · CASH
                </Text>
              </View>
              <View style={{ gap: 6 }}>
                {onPickChallenge && (
                  <TouchableOpacity
                    onPress={() => onPickChallenge(ch)}
                    style={styles.quizActionBtn}
                    {...a11yButton(tr(language, `Jouer ${language === 'fr' ? ch.titleFr : ch.titleEn} en solo`, `Play ${language === 'fr' ? ch.titleFr : ch.titleEn} solo`))}
                  >
                    <Play color={PALETTE.sand} size={14} />
                    <Text style={styles.quizActionText}>{tr(language, 'Solo', 'Solo')}</Text>
                  </TouchableOpacity>
                )}
                {onPickChallengeOnline && (
                  <TouchableOpacity
                    onPress={() => onPickChallengeOnline(ch)}
                    style={[styles.quizActionBtn, { backgroundColor: PALETTE.forestGreen, borderColor: PALETTE.forestGreen }]}
                    {...a11yButton(tr(language, `Jouer ${language === 'fr' ? ch.titleFr : ch.titleEn} en ligne`, `Play ${language === 'fr' ? ch.titleFr : ch.titleEn} online`))}
                  >
                    <Wifi color="#fff" size={14} />
                    <Text style={[styles.quizActionText, { color: '#fff' }]}>{tr(language, 'En ligne', 'Online')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
        {renderConfirmBar()}
      </SafeAreaView>
    );
  }

  // ── Country list ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.iconBtn}
          hitSlop={ICON_HIT_SLOP}
          {...a11yButton(tr(language, 'Retour', 'Back'))}
        >
          <ArrowLeft color={c.text} size={22} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>
          {title ?? tr(language, 'Choisis un pays', 'Choose a country')}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
          <Search color={c.textMuted} size={20} style={{ marginLeft: 14 }} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder={tr(language, 'Rechercher un pays…', 'Search a country…')}
            placeholderTextColor={c.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              style={{ padding: 14 }}
              {...a11yButton(tr(language, 'Effacer la recherche', 'Clear search'))}
            >
              <XCircle color={c.textMuted} size={20} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 8 }} keyboardShouldPersistTaps="handled">
        {list.map((country) => {
          const totalUnits = country.levels.reduce((s, l) => s + l.count, 0);
          const detail = country.levels.length > 1
            ? country.levels.map((l) => `${l.count} ${levelLabel(l.key, language).toLowerCase()}`).join(' · ')
            : `${totalUnits} ${levelLabel(country.levels[0]?.key ?? 'regions', language).toLowerCase()}`;
          const picked = isCountryPicked(country.cca3);
          return (
            <TouchableOpacity
              key={country.cca3}
              onPress={() => onCountryPress(country)}
              style={[styles.row, { backgroundColor: c.card, borderColor: picked ? PALETTE.oceanBlue : c.border }]}
              {...a11yButton(`${countryName(country)}, ${detail}`, {
                hint: country.levels.length > 1
                  ? tr(language, 'Choisir le niveau de découpage', 'Choose the division level')
                  : tr(language, 'Ajouter ou retirer ce pays', 'Add or remove this country'),
                selected: picked,
              })}
            >
              <Image source={{ uri: getFlagUrl(country.cca3) }} style={styles.rowFlag} accessibilityElementsHidden importantForAccessibility="no" />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontFamily: FONTS.heading, color: c.text, fontSize: 16 }}>
                    {countryName(country)}
                  </Text>
                  {countryChallenges(country.cca3).length > 0 && (
                    <View style={styles.newBadge}>
                      <Text style={styles.newBadgeText}>{tr(language, 'NOUVEAU', 'NEW')}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 12 }}>{detail}</Text>
              </View>
              {picked ? (
                <Check color={PALETTE.oceanBlue} size={20} />
              ) : (
                country.levels.length > 1 && <Layers color={c.textMuted} size={16} />
              )}
            </TouchableOpacity>
          );
        })}
        {list.length === 0 && (
          <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 13, textAlign: 'center', marginTop: 24 }}>
            {tr(language, 'Aucun pays trouvé.', 'No country found.')}
          </Text>
        )}
      </ScrollView>
      {renderConfirmBar()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  iconBtn: { padding: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: FONTS.headingBlack, textAlign: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5 },
  searchInput: { flex: 1, padding: 14, fontSize: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  rowFlag: { width: 40, height: 27, borderRadius: 4 },
  newBadge: { backgroundColor: PALETTE.sand, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  newBadgeText: { color: '#fff', fontFamily: FONTS.monoBold, fontSize: 9, letterSpacing: 0.5 },
  levelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
  },
  quizActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: PALETTE.sand,
    justifyContent: 'center',
  },
  quizActionText: { fontFamily: FONTS.monoBold, fontSize: 12, color: PALETTE.sand },
  confirmBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
  confirmCount: { flex: 1, fontFamily: FONTS.mono, fontSize: 12 },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  confirmBtnText: { color: 'white', fontFamily: FONTS.monoBold, fontSize: 15 },
});
