import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Modal, Pressable, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Check, Coins, ArrowLeft, Palette, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { supabase } from '../lib/supabase';
import { purchaseCosmetic } from '../lib/shop';
import { track } from '../lib/analytics';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { DEFAULT_AVATAR_CONFIG, LAYER_ORDER, RARITY_META, RARITY_ORDER, getCategoryParts, normalizeConfig } from '../data/cosmetics';
import { WorldAvatar } from '../components/WorldAvatar';
import { GlyphThumb } from '../components/worldGlyphs';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { a11yButton, announce, ICON_HIT_SLOP } from '../lib/a11y';
import type { AvatarConfig, CosmeticCategory, CosmeticPart } from '../types';

interface ShopProps {
  onBack: () => void;
  onEditAvatar: () => void;
}

const CATEGORY_LABELS: Record<CosmeticCategory, [string, string]> = {
  cosmos: ['Cosmos', 'Cosmos'],
  globe: ['Globes', 'Globes'],
  orbit: ['Orbites', 'Orbits'],
  emblem: ['Emblèmes', 'Emblems'],
  satellite: ['Satellites', 'Satellites'],
};

/** Stable preview config for a tile: defaults everywhere, with the previewed
 *  part swapped into its slot — so cosmos/orbit/globe tiles show the real element. */
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

const PREVIEW_SIZE = Math.min(Dimensions.get('window').width - 48, 300);

/** Tiles per grid row — chunked so a virtualized SectionList can render rows. */
const SHOP_COLS = 3;

interface ShopSection {
  cat: CosmeticCategory;
  data: CosmeticPart[][];
}

export default function Shop({ onBack, onEditAvatar }: ShopProps) {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const userId = user?.id ?? '';
  const c = getColors(isDarkMode);

  const [balance, setBalance] = useState(0);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const [previewPart, setPreviewPart] = useState<CosmeticPart | null>(null);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [{ data: wallet }, { data: cosmetics }, { data: profile }] = await Promise.all([
      supabase.from('coin_wallets').select('balance').eq('user_id', userId).maybeSingle(),
      supabase.from('user_cosmetics').select('item_id').eq('user_id', userId),
      supabase.from('profiles').select('avatar_config').eq('id', userId).single(),
    ]);
    setBalance(wallet?.balance ?? 0);
    setOwned(new Set((cosmetics ?? []).map((r) => r.item_id as string)));
    if (profile?.avatar_config) setAvatarConfig(normalizeConfig(profile.avatar_config as unknown as AvatarConfig));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => { track('shop_opened'); }, []);

  // Config shown in the 3D modal: base config with the previewed item swapped in.
  const previewConfig = useMemo<AvatarConfig>(() => {
    if (!previewPart) return avatarConfig;
    return {
      ...avatarConfig,
      layers: {
        ...avatarConfig.layers,
        [previewPart.category]: { id: previewPart.id, tint: previewPart.defaultTint ?? null },
      },
    };
  }, [previewPart, avatarConfig]);

  const buy = async (part: CosmeticPart) => {
    if (balance < part.price) {
      Alert.alert(
        tr(language, 'Solde insuffisant', 'Insufficient funds'),
        tr(language, 'Jouez pour gagner des pièces.', 'Play to earn coins.'),
      );
      return;
    }
    setBuying(part.id);
    const result = await purchaseCosmetic(part.id, userId);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setBalance(result.newBalance);
      setOwned((prev) => new Set(prev).add(part.id));
      announce(
        tr(
          language,
          `${part.nameFr} acheté. Nouveau solde : ${result.newBalance} pièces.`,
          `${part.nameEn} purchased. New balance: ${result.newBalance} coins.`,
        ),
      );
      track('cosmetic_purchased', { item_id: part.id, price: part.price });
    } else {
      // The purchase runs inside a native Modal, where an app-root toast would be
      // hidden behind it — Alert reliably surfaces above the modal.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(
        tr(language, 'Achat impossible', 'Purchase failed'),
        tr(
          language,
          `Ton achat n'a pas pu être finalisé. Vérifie ta connexion et réessaie.\n\n${result.message}`,
          `Your purchase could not be completed. Check your connection and try again.\n\n${result.message}`,
        ),
      );
    }
    setBuying(null);
  };

  const renderThumb = (part: CosmeticPart) => {
    if (part.category === 'globe' || part.category === 'cosmos' || part.category === 'orbit') {
      return (
        <View style={styles.thumbRound}>
          <WorldAvatar config={tileConfig(part)} size={60} />
        </View>
      );
    }
    if (part.category === 'emblem' || part.category === 'satellite') {
      return (
        <View style={[styles.thumbGlyphWrap, { backgroundColor: c.background, borderColor: c.border }]}>
          <GlyphThumb id={part.id} category={part.category} size={56} />
        </View>
      );
    }
    return <View style={[styles.thumbCircle, { backgroundColor: c.background, borderColor: c.border }]} />;
  };

  const RarityBadge = ({ part }: { part: CosmeticPart }) => {
    const meta = RARITY_META[part.rarity];
    return (
      <View style={[styles.rarityBadge, { backgroundColor: meta.color + '22', borderColor: meta.color }]}>
        <View style={[styles.rarityDot, { backgroundColor: meta.color }]} />
        <Text style={[styles.rarityText, { color: meta.color }]}>
          {language === 'fr' ? meta.labelFr : meta.labelEn}
        </Text>
      </View>
    );
  };

  // Section structure (categories → rows of parts) is static; only tile content
  // depends on owned/balance, so this is memoised once.
  const sections = useMemo<ShopSection[]>(() => {
    return LAYER_ORDER.map((cat) => {
      const parts = getCategoryParts(cat)
        .filter((p) => !p.isDefault)
        .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.price - b.price);
      const rows: CosmeticPart[][] = [];
      for (let i = 0; i < parts.length; i += SHOP_COLS) rows.push(parts.slice(i, i + SHOP_COLS));
      return { cat, data: rows };
    }).filter((s) => s.data.length > 0);
  }, []);

  const renderTile = useCallback(
    (part: CosmeticPart) => {
      const itemOwned = owned.has(part.id);
      const affordable = balance >= part.price;
      const itemName = language === 'fr' ? part.nameFr : part.nameEn;
      const stateLabel = itemOwned
        ? tr(language, 'possédé', 'owned')
        : tr(language, `${part.price} pièces`, `${part.price} coins`);
      return (
        <TouchableOpacity
          key={part.id}
          onPress={() => setPreviewPart(part)}
          style={[styles.tile, { backgroundColor: c.card, borderColor: RARITY_META[part.rarity].color + '88' }]}
          {...a11yButton(`${itemName}, ${stateLabel}`, {
            selected: itemOwned,
            hint: tr(language, 'Voir cet objet', 'View this item'),
          })}
        >
          {renderThumb(part)}
          <RarityBadge part={part} />
          <Text style={[styles.tileName, { color: c.text }]} numberOfLines={2}>
            {language === 'fr' ? part.nameFr : part.nameEn}
          </Text>
          {itemOwned ? (
            <View style={styles.ownedRow}>
              <Check size={12} color={c.accent} />
              <Text style={[styles.ownedText, { color: c.accent }]}>
                {tr(language, 'Possédé', 'Owned')}
              </Text>
            </View>
          ) : (
            <View style={styles.priceRow}>
              <Coins color="#ffd700" size={12} />
              <Text style={[styles.priceText, { color: affordable ? c.text : c.textMuted }]}>
                {part.price}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      );
    },
    // renderThumb/RarityBadge close over c/language which are in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [owned, balance, c, language],
  );

  const renderRow = useCallback(
    ({ item: row }: { item: CosmeticPart[] }) => (
      <View style={styles.grid}>{row.map(renderTile)}</View>
    ),
    [renderTile],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: ShopSection }) => (
      <Text style={[styles.sectionTitle, { color: c.textMuted }]}>
        {tr(language, CATEGORY_LABELS[section.cat][0], CATEGORY_LABELS[section.cat][1]).toUpperCase()}
      </Text>
    ),
    [c, language],
  );

  const listHeader = useCallback(
    () => (
      <TouchableOpacity
        onPress={onEditAvatar}
        style={[styles.editBtn, { backgroundColor: c.card, borderColor: c.accent }]}
        {...a11yButton(tr(language, 'Personnaliser mon monde', 'Customize my world'))}
      >
        <Palette color={c.accent} size={18} />
        <Text style={[styles.editText, { color: c.accent }]}>
          {tr(language, 'Personnaliser mon monde', 'Customize my world')}
        </Text>
      </TouchableOpacity>
    ),
    [c, language, onEditAvatar],
  );

  const isOwned = previewPart ? owned.has(previewPart.id) : false;
  const canAfford = previewPart ? balance >= previewPart.price : false;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}
          accessibilityRole="button"
          accessibilityLabel={tr(language, 'Retour', 'Back')}
        >
          <ArrowLeft color={c.text} size={20} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>{tr(language, 'Boutique', 'Shop')}</Text>
        <View style={[styles.coinChip, { backgroundColor: c.card, borderColor: c.border }]}>
          <Coins color="#ffd700" size={16} />
          <Text style={[styles.coinText, { color: c.text }]}>{balance}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={c.accent} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(row, index) => row[0]?.id ?? String(index)}
          renderItem={renderRow}
          renderSectionHeader={renderSectionHeader}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          initialNumToRender={6}
          windowSize={7}
          removeClippedSubviews
        />
      )}

      {/* ── World preview modal ────────────────────────────────────────────── */}
      <Modal
        visible={!!previewPart}
        transparent
        animationType="slide"
        onRequestClose={() => setPreviewPart(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setPreviewPart(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => {}}>

            {/* drag handle */}
            <View style={[styles.handle, { backgroundColor: c.border }]} />

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setPreviewPart(null)}
              hitSlop={ICON_HIT_SLOP}
              {...a11yButton(tr(language, 'Fermer', 'Close'))}
            >
              <X color={c.textMuted} size={20} />
            </TouchableOpacity>

            {/* World avatar preview (pure SVG) */}
            <View style={[styles.avatar3dWrap, { width: PREVIEW_SIZE, height: PREVIEW_SIZE }]}>
              {previewPart && (
                <WorldAvatar
                  config={previewConfig}
                  size={PREVIEW_SIZE}
                  animate
                />
              )}
            </View>

            {previewPart && (
              <>
                <RarityBadge part={previewPart} />
                <Text style={[styles.itemName, { color: c.text }]}>
                  {language === 'fr' ? previewPart.nameFr : previewPart.nameEn}
                </Text>

                {isOwned ? (
                  <View style={[styles.ownedBadge, { borderColor: c.accent }]}>
                    <Check size={16} color={c.accent} />
                    <Text style={[styles.ownedBadgeText, { color: c.accent }]}>
                      {tr(language, 'Déjà possédé', 'Already owned')}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => buy(previewPart)}
                    disabled={buying === previewPart.id}
                    {...a11yButton(
                      tr(language, `Acheter pour ${previewPart.price} pièces`, `Buy for ${previewPart.price} coins`),
                      {
                        disabled: buying === previewPart.id,
                        busy: buying === previewPart.id,
                        hint: canAfford
                          ? undefined
                          : tr(language, 'Solde insuffisant', 'Insufficient funds'),
                      },
                    )}
                    style={[
                      styles.buyBtn,
                      { backgroundColor: canAfford ? c.accent : c.border, opacity: buying === previewPart.id ? 0.6 : 1 },
                    ]}
                  >
                    {buying === previewPart.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Coins color="#ffd700" size={18} />
                        <Text style={styles.buyText}>{previewPart.price}</Text>
                        <Text style={[styles.buyLabel, { color: canAfford ? '#ffffffcc' : '#ffffff88' }]}>
                          {tr(language, '— Acheter', '— Buy')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
  coinChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  coinText: { fontSize: 15, fontFamily: FONTS.headingBlack },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48, gap: 18 },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14, borderWidth: 1 },
  editText: { fontSize: 14, fontFamily: FONTS.monoBold },
  sectionTitle: { fontSize: 11, fontFamily: FONTS.monoBold, letterSpacing: 1, marginLeft: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: 96, borderRadius: 14, borderWidth: 1, padding: 10, alignItems: 'center', gap: 5 },
  thumbRound: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', backgroundColor: '#05060f' },
  thumbSwatch: { width: 60, height: 60, borderRadius: 30 },
  thumbCircle: { width: 60, height: 60, borderRadius: 30, borderWidth: 1 },
  thumbGlyphWrap: { width: 60, height: 60, borderRadius: 30, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  thumbGlyph: { fontSize: 30 },
  rarityBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  rarityDot: { width: 6, height: 6, borderRadius: 3 },
  rarityText: { fontSize: 9, fontFamily: FONTS.monoBold, letterSpacing: 0.3, textTransform: 'uppercase' },
  tileName: { fontSize: 10, fontFamily: FONTS.mono, textAlign: 'center' },
  ownedRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ownedText: { fontSize: 10, fontFamily: FONTS.monoBold },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  priceText: { fontSize: 11, fontFamily: FONTS.monoBold },
  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1,
    paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12,
    alignItems: 'center', gap: 16,
  },
  handle: { width: 40, height: 4, borderRadius: 2, marginBottom: 4 },
  closeBtn: { position: 'absolute', top: 16, right: 20, zIndex: 1 },
  avatar3dWrap: { borderRadius: 16, overflow: 'hidden' },
  itemName: { fontSize: 20, fontFamily: FONTS.headingBlack, textAlign: 'center' },
  ownedBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  ownedBadgeText: { fontSize: 15, fontFamily: FONTS.monoBold },
  buyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, paddingHorizontal: 28, borderRadius: 16, alignSelf: 'stretch' },
  buyText: { color: '#fff', fontSize: 18, fontFamily: FONTS.headingBlack },
  buyLabel: { fontSize: 14, fontFamily: FONTS.mono },
});
