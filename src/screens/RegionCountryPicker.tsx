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
import { ArrowLeft, Layers, Map as MapIcon, Search, XCircle } from 'lucide-react-native';
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
import type { RegionLevelKey, RegionCountrySel } from './FindRegionGame';

export interface RegionPick extends RegionCountrySel {
  level: RegionLevelKey;
}

interface RegionCountryPickerProps {
  onPick: (pick: RegionPick) => void;
  onBack: () => void;
  title?: string;
}

function levelLabel(key: string, language: Language): string {
  return key === 'departments'
    ? tr(language, 'Départements', 'Departments')
    : tr(language, 'Régions', 'Regions');
}

export default function RegionCountryPicker({
  onPick,
  onBack,
  title,
}: RegionCountryPickerProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<RegionCountry | null>(null);

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

  const select = (country: RegionCountry, level: RegionLevelKey) => {
    onPick({ cca3: country.cca3, name: country.name, name_en: country.name_en, unit: country.unit, level });
  };

  const onCountryPress = (country: RegionCountry) => {
    if (country.levels.length <= 1) {
      select(country, (country.levels[0]?.key as RegionLevelKey) ?? 'regions');
    } else {
      setChosen(country);
    }
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
            {tr(language, 'Choisis le niveau de découpage', 'Choose the division level')}
          </Text>
          {chosen.levels.map((lvl) => {
            const Icon = lvl.key === 'departments' ? Layers : MapIcon;
            return (
              <TouchableOpacity
                key={lvl.key}
                onPress={() => select(chosen, lvl.key as RegionLevelKey)}
                style={[styles.levelCard, { backgroundColor: c.card, borderColor: c.border }]}
                {...a11yButton(`${levelLabel(lvl.key, language)}, ${lvl.count}`, {
                  hint: tr(language, 'Choisir ce niveau', 'Choose this level'),
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
              </TouchableOpacity>
            );
          })}
        </View>
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
          return (
            <TouchableOpacity
              key={country.cca3}
              onPress={() => onCountryPress(country)}
              style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}
              {...a11yButton(`${countryName(country)}, ${detail}`, {
                hint: country.levels.length > 1
                  ? tr(language, 'Choisir le niveau de découpage', 'Choose the division level')
                  : tr(language, 'Choisir ce pays', 'Choose this country'),
              })}
            >
              <Image source={{ uri: getFlagUrl(country.cca3) }} style={styles.rowFlag} accessibilityElementsHidden importantForAccessibility="no" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.heading, color: c.text, fontSize: 16 }}>
                  {countryName(country)}
                </Text>
                <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 12 }}>{detail}</Text>
              </View>
              {country.levels.length > 1 && <Layers color={c.textMuted} size={16} />}
            </TouchableOpacity>
          );
        })}
        {list.length === 0 && (
          <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 13, textAlign: 'center', marginTop: 24 }}>
            {tr(language, 'Aucun pays trouvé.', 'No country found.')}
          </Text>
        )}
      </ScrollView>
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
  levelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
  },
});
