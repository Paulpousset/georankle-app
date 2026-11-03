/**
 * Onglet « Jouer » : la bibliothèque des modes solo.
 *
 * Les modes sont rangés en trois familles (Sur la carte, Reconnaître,
 * Comparer), avec une recherche, des filtres et des favoris : la liste reste
 * lisible même quand l'app gagne de nouveaux modes.
 */
import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Search, Star, X } from 'lucide-react-native';

import type { GameMode } from '../../types';
import { MENU_MODES, MODE_FAMILIES, matchesQuery, type ModeFamily } from '../../data/menuModes';
import {
  familyColors,
  MENU_GRID_GAP,
  MODE_ICONS,
  ModeTile,
  useMenuGrid,
} from '../../components/menu/ModeTiles';
import { ReviewEntryCard } from '../../components/ReviewEntryCard';
import { ContinentChip } from '../../components/ContinentChip';
import { PALETTE, getColors } from '../../theme/colors';
import { FONTS } from '../../theme/typography';
import { tr } from '../../i18n';
import { useLanguage } from '../../contexts/LanguageContext';
import { a11yButton, ICON_HIT_SLOP } from '../../lib/a11y';
import { scopeSupported, useSoloScope, useTrainingMode } from '../../lib/soloScope';
import { useFavoriteModes, usePersonalBests } from '../../lib/menuPrefs';
import { playSfx } from '../../lib/sfx';

type Filter = 'all' | 'favorites' | ModeFamily;

interface PlayTabProps {
  isDarkMode: boolean;
  /** Le drapeau distant du mode Langues (masqué tant qu'il est éteint). */
  languagesMode: boolean;
  onPlay: (mode: GameMode) => void;
  onPlayReview: (mode: GameMode, ids: string[]) => void;
  onHelp: (mode: GameMode) => void;
  /** Change à chaque retour au menu : relit records et révisions. */
  refreshKey: number;
}

export function PlayTab({
  isDarkMode,
  languagesMode,
  onPlay,
  onPlayReview,
  onHelp,
  refreshKey,
}: PlayTabProps) {
  const c = getColors(isDarkMode);
  const { language } = useLanguage();
  const grid = useMenuGrid();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [favorites, toggleFavorite] = useFavoriteModes();
  const [soloScope, setSoloScope] = useSoloScope();
  const [training, setTraining] = useTrainingMode();
  const [zoneOpen, setZoneOpen] = useState(false);

  const modes = useMemo(
    () => MENU_MODES.filter((m) => m.featureFlag !== 'languages_mode' || languagesMode),
    [languagesMode],
  );
  const bests = usePersonalBests(
    modes.map((m) => m.mode),
    refreshKey,
  );

  const visible = modes.filter(
    (m) =>
      matchesQuery(m, query) &&
      (filter === 'all' || (filter === 'favorites' ? favorites.has(m.mode) : m.family === filter)),
  );

  const chips: { id: Filter; label: string; color?: string }[] = [
    { id: 'all', label: tr(language, 'Tous', 'All') },
    { id: 'favorites', label: tr(language, 'Favoris', 'Favorites') },
    ...MODE_FAMILIES.map((f) => ({
      id: f.id as Filter,
      label: tr(language, f.fr, f.en),
      color: familyColors(f.id, isDarkMode).accent,
    })),
  ];

  const selectFilter = (f: Filter) => {
    if (f !== filter) playSfx('tap');
    setFilter(f);
  };

  return (
    <View style={{ width: '100%', maxWidth: grid.col }}>
      {/* Recherche */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          height: 44,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: c.border,
          backgroundColor: isDarkMode ? c.card : PALETTE.parchmentDark,
          paddingHorizontal: 12,
          marginTop: 12,
        }}
      >
        <Search color={c.textMuted} size={16} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={tr(language, 'Chercher un mode…', 'Search a mode…')}
          placeholderTextColor={c.textFaint}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={{
            flex: 1,
            fontFamily: FONTS.mono,
            fontSize: 13,
            color: c.text,
            paddingVertical: 0,
          }}
          accessibilityLabel={tr(language, 'Chercher un mode', 'Search a mode')}
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => setQuery('')}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(tr(language, 'Effacer la recherche', 'Clear search'))}
          >
            <X color={c.textMuted} size={16} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filtres */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 12 }}
        style={{ flexGrow: 0 }}
      >
        {chips.map((chip) => {
          const active = chip.id === filter;
          const count =
            chip.id === 'all' ? modes.length : chip.id === 'favorites' ? favorites.size : null;
          return (
            <TouchableOpacity
              key={chip.id}
              onPress={() => selectFilter(chip.id)}
              style={{
                height: 34,
                paddingHorizontal: 14,
                borderRadius: 17,
                borderWidth: 1.5,
                borderColor: active ? c.text : c.border,
                backgroundColor: active ? c.text : isDarkMode ? c.card : PALETTE.parchmentDark,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
              {...a11yButton(chip.label, { selected: active })}
            >
              {chip.id === 'favorites' && (
                <Star color={PALETTE.sand} fill={active ? PALETTE.sand : 'transparent'} size={13} />
              )}
              {chip.color && !active && (
                <View
                  style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: chip.color }}
                />
              )}
              <Text
                style={{
                  fontFamily: FONTS.monoBold,
                  fontSize: 12,
                  color: active ? c.background : c.textMuted,
                }}
              >
                {chip.label}
              </Text>
              {count != null && count > 0 && (
                <Text
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 11,
                    color: active ? c.background : c.textFaint,
                  }}
                >
                  {count}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Révisions en attente + zone (continent) des parties solo */}
      <ReviewEntryCard onPlayReview={onPlayReview} refreshKey={refreshKey} />
      <ContinentChip
        scope={soloScope}
        onChange={setSoloScope}
        training={training}
        onChangeTraining={setTraining}
        open={zoneOpen}
        setOpen={setZoneOpen}
      />

      {visible.length === 0 && (
        <Text
          style={{
            fontFamily: FONTS.mono,
            fontSize: 12,
            color: c.textMuted,
            textAlign: 'center',
            marginTop: 24,
            lineHeight: 18,
          }}
        >
          {filter === 'favorites' && !query
            ? tr(
                language,
                'Pas encore de favori. Touche l’étoile d’un mode pour le retrouver ici.',
                'No favorites yet. Tap a mode’s star to find it here.',
              )
            : tr(language, 'Aucun mode ne correspond.', 'No mode matches.')}
        </Text>
      )}

      {MODE_FAMILIES.map((family) => {
        const items = visible.filter((m) => m.family === family.id);
        if (items.length === 0) return null;
        const { accent, tint } = familyColors(family.id, isDarkMode);
        return (
          <View key={family.id} style={{ marginTop: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginBottom: 10,
                marginTop: 6,
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: accent }} />
              <Text
                style={{
                  fontFamily: FONTS.monoBold,
                  fontSize: 10,
                  letterSpacing: 2,
                  color: c.textMuted,
                }}
              >
                {tr(language, family.fr, family.en).toUpperCase()}
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: grid.wide ? 'flex-start' : 'space-between',
                columnGap: grid.wide ? MENU_GRID_GAP : 0,
                rowGap: grid.wide ? MENU_GRID_GAP : 11,
              }}
            >
              {items.map((m) => {
                const Icon = MODE_ICONS[m.mode];
                if (!Icon) return null;
                return (
                  <ModeTile
                    key={m.mode}
                    icon={Icon}
                    accent={accent}
                    tint={tint}
                    title={tr(language, m.titleFr, m.titleEn)}
                    subtitle={tr(language, m.subtitleFr, m.subtitleEn)}
                    isDarkMode={isDarkMode}
                    onPress={() => onPlay(m.mode)}
                    onHelp={() => onHelp(m.mode)}
                    record={bests[m.mode] ?? null}
                    isNew={m.isNew && bests[m.mode] == null}
                    favorite={favorites.has(m.mode)}
                    onToggleFavorite={() => toggleFavorite(m.mode)}
                    worldOnly={!!soloScope && !scopeSupported(m.mode, soloScope)}
                  />
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}
