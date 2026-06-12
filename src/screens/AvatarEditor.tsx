import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BookOpen, Beer, Check, Circle, Crosshair, Home, Lock, Shield, ShoppingBag, Sparkles, Sword, Wand2 } from 'lucide-react-native';
import type { ComponentType } from 'react';

import { supabase } from '../lib/supabase';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { Avatar3D } from '../components/Avatar3D';
import {
  DEFAULT_AVATAR_CONFIG,
  LAYER_ORDER,
  TINT_PALETTES,
  getCategoryParts,
  getPart,
  normalizeConfig,
} from '../data/cosmetics';
import type { AvatarConfig, CosmeticCategory, CosmeticPart, Language } from '../types';

interface AvatarEditorProps {
  session: { user: { id: string } | null };
  isDarkMode: boolean;
  language: Language;
  onBack: () => void;
  onOpenShop: () => void;
}

const CATEGORY_LABELS: Record<CosmeticCategory, [string, string]> = {
  hero: ['Héros', 'Hero'],
  weapon: ['Arme', 'Weapon'],
  offhand: ['Bouclier', 'Offhand'],
  background: ['Décor', 'Environment'],
  frame: ['Cadre', 'Frame'],
};

/** Icon per gear item for tiles without an image thumbnail. */
const GEAR_ICONS: Record<string, ComponentType<{ color: string; size: number }>> = {
  weapon_none: Circle,
  weapon_sword_1h: Sword,
  weapon_sword_2h: Sword,
  weapon_dagger: Sword,
  weapon_axe_1h: Sword,
  weapon_axe_2h: Sword,
  weapon_wand: Wand2,
  weapon_staff: Sparkles,
  weapon_crossbow: Crosshair,
  weapon_mug: Beer,
  offhand_none: Circle,
  offhand_shield_round: Shield,
  offhand_shield_square: Shield,
  offhand_shield_badge: Shield,
  offhand_shield_spikes: Shield,
  offhand_spellbook: BookOpen,
};

function cloneConfig(cfg: AvatarConfig): AvatarConfig {
  return { v: cfg.v, useCustom: cfg.useCustom, layers: { ...cfg.layers } };
}

export default function AvatarEditor({ session, isDarkMode, language, onBack, onOpenShop }: AvatarEditorProps) {
  const userId = session.user?.id ?? '';
  const c = getColors(isDarkMode);

  const [config, setConfig] = useState<AvatarConfig>(() => cloneConfig(DEFAULT_AVATAR_CONFIG));
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<CosmeticCategory>('hero');
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
      setConfig(normalizeConfig(profile.avatar_config as AvatarConfig));
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
    const { error } = await supabase.rpc('equip_cosmetics', { p_config: normalizeConfig(config) });
    setSaving(false);
    if (error) {
      Alert.alert(tr(language, 'Erreur', 'Error'), error.message);
      return;
    }
    onBack();
  };

  const activeLayer = config.layers[activeCategory];
  const activePart = getPart(activeCategory, activeLayer?.id ?? '');
  const tintPalette = TINT_PALETTES[activeCategory];
  const showTints = activePart?.tintable && tintPalette && tintPalette.length > 0;

  const parts = useMemo(() => getCategoryParts(activeCategory), [activeCategory]);

  const renderTileVisual = (part: CosmeticPart, ownedPart: boolean) => {
    if (part.thumbUrl) {
      return (
        <Image
          source={{ uri: part.thumbUrl }}
          style={{ width: 56, height: 56, borderRadius: 28, opacity: ownedPart ? 1 : 0.4 }}
          resizeMode="cover"
        />
      );
    }
    if (part.swatch) {
      return (
        <View
          style={{
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: part.category === 'frame' ? 'transparent' : part.swatch,
            borderWidth: part.category === 'frame' ? 6 : 1,
            borderColor: part.category === 'frame' ? part.swatch : c.border,
            opacity: ownedPart ? 1 : 0.4,
          }}
        />
      );
    }
    const Icon = GEAR_ICONS[part.id] ?? Circle;
    return (
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', opacity: ownedPart ? 1 : 0.4 }}>
        <Icon color={c.text} size={26} />
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={onBack} style={[styles.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}>
          <Home color={c.text} size={20} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>{tr(language, 'Mon Héros', 'My Hero')}</Text>
        <TouchableOpacity onPress={onOpenShop} style={[styles.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}>
          <ShoppingBag color={c.accent} size={20} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={c.accent} />
        </View>
      ) : (
        <>
          {/* Live 3D preview — hero in its environment, drag to rotate */}
          <View style={styles.previewWrap}>
            <View style={[styles.previewViewport, { borderColor: c.border }]}>
              <Avatar3D config={config} size={200} style={{ width: 200, height: 230 }} interactive />
            </View>
            <Text style={[styles.spinHint, { color: c.textFaint }]}>
              {tr(language, 'Glissez pour faire tourner', 'Drag to rotate')}
            </Text>
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
                return (
                  <TouchableOpacity
                    key={part.id}
                    onPress={() => selectPart(part)}
                    activeOpacity={0.8}
                    style={[
                      styles.tile,
                      { backgroundColor: c.card, borderColor: selected ? c.accent : c.border, borderWidth: selected ? 3 : 1 },
                    ]}
                  >
                    {renderTileVisual(part, ownedPart)}
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
            <TouchableOpacity onPress={save} disabled={saving} style={[styles.saveBtn, { backgroundColor: c.accent }]}>
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
  tileName: { fontSize: 10, fontFamily: FONTS.mono, textAlign: 'center' },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lockPrice: { fontSize: 10, fontFamily: FONTS.monoBold },
  footer: { padding: 16, borderTopWidth: 1 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 14 },
  saveText: { color: '#fff', fontSize: 15, fontFamily: FONTS.monoBold },
});
