import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { showAlert } from '../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Check, ArrowLeft, Lock, ShoppingBag } from 'lucide-react-native';

import { supabase } from '../lib/supabase';
import { track } from '../lib/analytics';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { WorldAvatar } from '../components/WorldAvatar';
import { GlyphThumb } from '../components/worldGlyphs';
import {
  DEFAULT_AVATAR_CONFIG,
  LAYER_ORDER,
  RARITY_META,
  TINT_PALETTES,
  getCategoryParts,
  getPart,
  normalizeConfig,
} from '../data/cosmetics';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { a11yButton, announce } from '../lib/a11y';
import type { AvatarConfig, CosmeticCategory, CosmeticPart } from '../types';
import type { Json } from '../types/database';

interface AvatarEditorProps {
  onBack: () => void;
  onOpenShop: () => void;
}

const CATEGORY_LABELS: Record<CosmeticCategory, [string, string]> = {
  cosmos: ['Cosmos', 'Cosmos'],
  globe: ['Globe', 'Globe'],
  orbit: ['Orbite', 'Orbit'],
  emblem: ['Emblème', 'Emblem'],
  satellite: ['Satellite', 'Satellite'],
};

function cloneConfig(cfg: AvatarConfig): AvatarConfig {
  return { v: cfg.v, useCustom: cfg.useCustom, layers: { ...cfg.layers } };
}

/** Mini preview config: defaults everywhere, with `part` swapped into its slot
 *  so cosmos/orbit/globe tiles show the real rendered element. */
function tileConfig(part: CosmeticPart): AvatarConfig {
  const layers: AvatarConfig['layers'] = {
    cosmos: { id: 'cosmos_bluenight', tint: null },
    globe: { id: 'globe_classic', tint: null },
    orbit: { id: 'orbit_none', tint: null },
    emblem: { id: 'emblem_none', tint: null },
    satellite: { id: 'sat_none', tint: null },
  };
  layers[part.category] = { id: part.id, tint: part.defaultTint ?? null };
  return { v: 4, useCustom: true, layers };
}

export default function AvatarEditor({ onBack, onOpenShop }: AvatarEditorProps) {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const userId = user?.id ?? '';
  const c = getColors(isDarkMode);

  const [config, setConfig] = useState<AvatarConfig>(() => cloneConfig(DEFAULT_AVATAR_CONFIG));
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<CosmeticCategory>('globe');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [{ data: profile }, { data: cosmetics }] = await Promise.all([
      supabase.from('profiles').select('avatar_config').eq('id', userId).single(),
      supabase.from('user_cosmetics').select('item_id').eq('user_id', userId),
    ]);
    if (profile?.avatar_config) {
      setConfig(normalizeConfig(profile.avatar_config as unknown as AvatarConfig));
    }
    setOwned(new Set((cosmetics ?? []).map((r) => r.item_id as string)));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const isOwned = useCallback(
    (part: CosmeticPart) => part.isDefault || owned.has(part.id),
    [owned],
  );

  const selectPart = (part: CosmeticPart) => {
    if (!isOwned(part)) {
      onOpenShop();
      return;
    }
    track('avatar_equipped', { category: part.category, item_id: part.id });
    setConfig((prev) => {
      const next = cloneConfig(prev);
      const prevTint = prev.layers[part.category]?.tint ?? null;
      next.layers[part.category] = {
        id: part.id,
        tint: part.tintable ? (prevTint ?? part.defaultTint ?? null) : null,
      };
      return next;
    });
  };

  const selectTint = (tint: string) => {
    setConfig((prev) => {
      const next = cloneConfig(prev);
      next.layers[activeCategory] = { ...next.layers[activeCategory], tint };
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('equip_cosmetics', {
      p_config: normalizeConfig(config) as unknown as Json,
    });
    setSaving(false);
    if (error) {
      showAlert(tr(language, 'Erreur', 'Error'), error.message);
      return;
    }
    announce(tr(language, 'Monde enregistré', 'World saved'));
    onBack();
  };

  const activeLayer = config.layers[activeCategory];
  const activePart = getPart(activeCategory, activeLayer?.id ?? '');
  const tintPalette = TINT_PALETTES[activeCategory];
  const showTints = activePart?.tintable && tintPalette && tintPalette.length > 0;

  const parts = useMemo(() => getCategoryParts(activeCategory), [activeCategory]);

  const renderTileVisual = (part: CosmeticPart, ownedPart: boolean) => {
    const op = ownedPart ? 1 : 0.4;
    if (part.category === 'globe' || part.category === 'cosmos' || part.category === 'orbit') {
      return (
        <View style={{ width: 56, height: 56, borderRadius: 28, overflow: 'hidden', backgroundColor: '#05060f', opacity: op }}>
          <WorldAvatar config={tileConfig(part)} size={56} />
        </View>
      );
    }
    if (part.category === 'emblem' || part.category === 'satellite') {
      return (
        <View style={{ width: 56, height: 56, borderRadius: 28, overflow: 'hidden', backgroundColor: c.background, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', opacity: op }}>
          <GlyphThumb id={part.id} category={part.category} size={52} />
        </View>
      );
    }
    return (
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.background, borderWidth: 1, borderColor: c.border, opacity: op }} />
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}
          accessibilityRole="button"
          accessibilityLabel={tr(language, 'Retour', 'Back')}
        >
          <ArrowLeft color={c.text} size={20} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>{tr(language, 'Mon Monde', 'My World')}</Text>
        <TouchableOpacity
          onPress={onOpenShop}
          style={[styles.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}
          accessibilityRole="button"
          accessibilityLabel={tr(language, 'Ouvrir la boutique', 'Open shop')}
        >
          <ShoppingBag color={c.accent} size={20} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={c.accent} />
        </View>
      ) : (
        <>
          {/* Live preview — the composed world avatar */}
          <View style={styles.previewWrap}>
            <View style={[styles.previewViewport, { borderColor: c.border }]}>
              <WorldAvatar config={config} size={200} animate />
            </View>
          </View>

          {/* Category tabs */}
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
              {LAYER_ORDER.map((cat) => {
                const active = cat === activeCategory;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setActiveCategory(cat)}
                    style={[
                      styles.tab,
                      { borderColor: active ? c.accent : c.border, backgroundColor: active ? c.accent : c.card },
                    ]}
                    {...a11yButton(tr(language, CATEGORY_LABELS[cat][0], CATEGORY_LABELS[cat][1]), {
                      selected: active,
                      role: 'tab',
                    })}
                  >
                    <Text style={[styles.tabText, { color: active ? '#fff' : c.textMuted }]}>
                      {tr(language, CATEGORY_LABELS[cat][0], CATEGORY_LABELS[cat][1])}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* Tint swatches (backgrounds) */}
            {showTints && (
              <View style={styles.swatchRow}>
                {tintPalette!.map((tint) => {
                  const selected = activeLayer?.tint === tint;
                  return (
                    <TouchableOpacity
                      key={tint}
                      onPress={() => selectTint(tint)}
                      style={[styles.swatch, { backgroundColor: tint, borderColor: selected ? c.text : c.border, borderWidth: selected ? 3 : 1 }]}
                      {...a11yButton(tr(language, `Couleur ${tint}`, `Color ${tint}`), { selected })}
                    />
                  );
                })}
              </View>
            )}

            {/* Parts grid */}
            <View style={styles.grid}>
              {parts.map((part) => {
                const ownedPart = isOwned(part);
                const selected = activeLayer?.id === part.id;
                const partName = language === 'fr' ? part.nameFr : part.nameEn;
                const tileLabel = ownedPart
                  ? partName
                  : tr(language, `${partName}, verrouillé, ${part.price} pièces`, `${partName}, locked, ${part.price} coins`);
                return (
                  <TouchableOpacity
                    key={part.id}
                    onPress={() => selectPart(part)}
                    activeOpacity={0.8}
                    style={[
                      styles.tile,
                      { backgroundColor: c.card, borderColor: selected ? c.accent : c.border, borderWidth: selected ? 3 : 1 },
                    ]}
                    {...a11yButton(tileLabel, {
                      selected,
                      hint: ownedPart ? undefined : tr(language, 'Ouvrir la boutique pour débloquer', 'Open shop to unlock'),
                    })}
                  >
                    {renderTileVisual(part, ownedPart)}
                    {!part.isDefault && (
                      <View style={[styles.rarityDot, { backgroundColor: RARITY_META[part.rarity].color }]} />
                    )}
                    <Text style={[styles.tileName, { color: c.text }]} numberOfLines={1}>
                      {language === 'fr' ? part.nameFr : part.nameEn}
                    </Text>
                    {!ownedPart && (
                      <View style={styles.lockRow}>
                        <Lock size={11} color={c.textFaint} />
                        <Text style={[styles.lockPrice, { color: c.textFaint }]}>{part.price}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.background }]}>
            <TouchableOpacity
              onPress={save}
              disabled={saving}
              {...a11yButton(tr(language, 'Enregistrer mon monde', 'Save my world'), {
                disabled: saving,
                busy: saving,
              })}
              style={[styles.saveBtn, { backgroundColor: c.accent, opacity: saving ? 0.6 : 1 }]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Check color="#fff" size={18} />
                  <Text style={styles.saveText}>{tr(language, 'Enregistrer', 'Save')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1,
  },
  iconBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: FONTS.headingBlack },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewWrap: { alignItems: 'center', paddingVertical: 12, gap: 8 },
  previewViewport: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  spinHint: { fontSize: 10, fontFamily: FONTS.mono },
  tabBar: { paddingHorizontal: 12, gap: 8, paddingBottom: 10 },
  tab: { paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 12, fontFamily: FONTS.monoBold },
  content: { padding: 16, paddingBottom: 24, gap: 16 },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-start' },
  tile: { width: 92, borderRadius: 14, padding: 8, alignItems: 'center', gap: 4 },
  rarityDot: { width: 8, height: 8, borderRadius: 4, position: 'absolute', top: 8, right: 8 },
  tileName: { fontSize: 10, fontFamily: FONTS.mono, textAlign: 'center' },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lockPrice: { fontSize: 10, fontFamily: FONTS.monoBold },
  footer: { padding: 16, borderTopWidth: 1 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 14 },
  saveText: { color: '#fff', fontSize: 15, fontFamily: FONTS.monoBold },
});
