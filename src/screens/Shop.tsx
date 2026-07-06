import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Modal, Pressable, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Check, Coins, ArrowLeft, Palette, X, Sparkles, Package } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { supabase } from '../lib/supabase';
import { purchaseCosmetic, purchaseBundle, fetchFeaturedCosmetic, type FeaturedCosmetic } from '../lib/shop';
import { track } from '../lib/analytics';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import {
  BUNDLES,
  DEFAULT_AVATAR_CONFIG,
  LAYER_ORDER,
  RARITY_META,
  RARITY_ORDER,
  getCategoryParts,
  getPart,
  isNewPart,
  normalizeConfig,
} from '../data/cosmetics';
import { WorldAvatar } from '../components/WorldAvatar';
import { GlyphThumb } from '../components/worldGlyphs';
import { RewardedAdButton } from '../components/RewardedAdButton';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { a11yButton, announce, ICON_HIT_SLOP } from '../lib/a11y';
import type { AvatarConfig, CosmeticBundle, CosmeticCategory, CosmeticPart } from '../types';
import type { Json } from '../types/database';

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

type ShopFilter = 'all' | 'epicPlus' | 'notOwned' | 'new';

const FILTER_LABELS: [ShopFilter, string, string][] = [
  ['all', 'Tout', 'All'],
  ['epicPlus', 'Épique +', 'Epic +'],
  ['notOwned', 'Non possédé', 'Not owned'],
  ['new', 'Nouveau', 'New'],
];

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
  ownedCount: number;
  totalCount: number;
  data: CosmeticPart[][];
}

/** Sum of the individual prices of a bundle's items (the crossed-out price). */
function bundleBasePrice(bundle: CosmeticBundle): number {
  return bundle.itemIds.reduce((sum, id) => {
    for (const cat of LAYER_ORDER) {
      const p = getPart(cat, id);
      if (p) return sum + p.price;
    }
    return sum;
  }, 0);
}

function findPart(id: string): CosmeticPart | undefined {
  for (const cat of LAYER_ORDER) {
    const p = getPart(cat, id);
    if (p) return p;
  }
  return undefined;
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

  // Funnel step between shop_opened and cosmetic_purchased: an item preview
  // was opened (from the grid or the featured banner).
  useEffect(() => {
    if (previewPart) track('shop_item_viewed', { item_id: previewPart.id });
  }, [previewPart]);
  const [featured, setFeatured] = useState<FeaturedCosmetic | null>(null);
  const [filter, setFilter] = useState<ShopFilter>('all');

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [{ data: wallet }, { data: cosmetics }, { data: profile }, feat] = await Promise.all([
      supabase.from('coin_wallets').select('balance').eq('user_id', userId).maybeSingle(),
      supabase.from('user_cosmetics').select('item_id').eq('user_id', userId),
      supabase.from('profiles').select('avatar_config').eq('id', userId).single(),
      fetchFeaturedCosmetic(),
    ]);
    setBalance(wallet?.balance ?? 0);
    setOwned(new Set((cosmetics ?? []).map((r) => r.item_id as string)));
    if (profile?.avatar_config) setAvatarConfig(normalizeConfig(profile.avatar_config as unknown as AvatarConfig));
    setFeatured(feat);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => { track('shop_opened'); }, []);

  const featuredPart = useMemo(
    () => (featured ? findPart(featured.itemId) : undefined),
    [featured],
  );

  /** Price actually charged for a part today (featured discount applied). */
  const effectivePrice = useCallback(
    (part: CosmeticPart) => (featured && featured.itemId === part.id ? featured.price : part.price),
    [featured],
  );

  // Config shown in the preview modal: base config with the previewed item swapped in.
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

  /** Equip the freshly bought part onto the current config (post-purchase flow). */
  const equipPart = useCallback(async (part: CosmeticPart) => {
    const next = normalizeConfig({
      ...avatarConfig,
      layers: {
        ...avatarConfig.layers,
        [part.category]: { id: part.id, tint: part.defaultTint ?? null },
      },
    });
    const { error } = await supabase.rpc('equip_cosmetics', { p_config: next as unknown as Json });
    if (error) {
      Alert.alert(tr(language, 'Erreur', 'Error'), error.message);
      return;
    }
    setAvatarConfig(next);
    track('avatar_equipped', { category: part.category, item_id: part.id });
    announce(tr(language, `${part.nameFr} équipé`, `${part.nameEn} equipped`));
  }, [avatarConfig, language]);

  const buy = async (part: CosmeticPart) => {
    const price = effectivePrice(part);
    if (balance < price) {
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
      track('cosmetic_purchased', { item_id: part.id, price });
      if (featured?.itemId === part.id) track('featured_purchased', { item_id: part.id, price });
      setPreviewPart(null);
      // Post-purchase flow: offer to equip the new item right away.
      const itemName = language === 'fr' ? part.nameFr : part.nameEn;
      Alert.alert(
        tr(language, `${itemName} acheté !`, `${itemName} purchased!`),
        tr(language, "L'équiper sur ton monde maintenant ?", 'Equip it on your world now?'),
        [
          { text: tr(language, 'Plus tard', 'Later'), style: 'cancel' },
          { text: tr(language, 'Équiper', 'Equip'), onPress: () => { void equipPart(part); } },
        ],
      );
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

  const buyBundle = (bundle: CosmeticBundle) => {
    const name = language === 'fr' ? bundle.nameFr : bundle.nameEn;
    if (balance < bundle.price) {
      Alert.alert(
        tr(language, 'Solde insuffisant', 'Insufficient funds'),
        tr(language, 'Jouez pour gagner des pièces.', 'Play to earn coins.'),
      );
      return;
    }
    const missing = bundle.itemIds.filter((id) => !owned.has(id));
    Alert.alert(
      name,
      tr(
        language,
        `Acheter ${missing.length} objet${missing.length > 1 ? 's' : ''} pour ${bundle.price} pièces ?`,
        `Buy ${missing.length} item${missing.length > 1 ? 's' : ''} for ${bundle.price} coins?`,
      ),
      [
        { text: tr(language, 'Annuler', 'Cancel'), style: 'cancel' },
        {
          text: tr(language, 'Acheter', 'Buy'),
          onPress: async () => {
            setBuying(bundle.id);
            const result = await purchaseBundle(bundle.id, userId);
            if (result.ok) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              setBalance(result.newBalance);
              setOwned((prev) => {
                const next = new Set(prev);
                for (const id of result.granted) next.add(id);
                return next;
              });
              track('bundle_purchased', { bundle_id: bundle.id, price: bundle.price });
              announce(tr(
                language,
                `${name} acheté. Nouveau solde : ${result.newBalance} pièces.`,
                `${name} purchased. New balance: ${result.newBalance} coins.`,
              ));
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
              Alert.alert(tr(language, 'Achat impossible', 'Purchase failed'), result.message);
            }
            setBuying(null);
          },
        },
      ],
    );
  };

  const renderThumb = (part: CosmeticPart, size = 60) => {
    if (part.category === 'globe' || part.category === 'cosmos' || part.category === 'orbit') {
      return (
        <View style={[styles.thumbRound, { width: size, height: size, borderRadius: size / 2 }]}>
          <WorldAvatar config={tileConfig(part)} size={size} />
        </View>
      );
    }
    return (
      <View style={[styles.thumbGlyphWrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.background, borderColor: c.border }]}>
        <GlyphThumb id={part.id} category={part.category} size={size - 4} />
      </View>
    );
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

  // Sections react to the active filter (and to ownership for 'notOwned').
  const sections = useMemo<ShopSection[]>(() => {
    return LAYER_ORDER.map((cat) => {
      const all = getCategoryParts(cat).filter((p) => !p.isDefault);
      const ownedCount = all.filter((p) => owned.has(p.id)).length;
      const parts = all
        .filter((p) => {
          switch (filter) {
            case 'epicPlus': return p.rarity === 'epic' || p.rarity === 'legendary';
            case 'notOwned': return !owned.has(p.id);
            case 'new': return isNewPart(p);
            default: return true;
          }
        })
        .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.price - b.price);
      const rows: CosmeticPart[][] = [];
      for (let i = 0; i < parts.length; i += SHOP_COLS) rows.push(parts.slice(i, i + SHOP_COLS));
      return { cat, ownedCount, totalCount: all.length, data: rows };
    }).filter((s) => s.data.length > 0);
  }, [filter, owned]);

  const renderTile = useCallback(
    (part: CosmeticPart) => {
      const itemOwned = owned.has(part.id);
      const price = effectivePrice(part);
      const affordable = balance >= price;
      const itemName = language === 'fr' ? part.nameFr : part.nameEn;
      const meta = RARITY_META[part.rarity];
      const glow = part.rarity === 'epic' || part.rarity === 'legendary';
      const stateLabel = itemOwned
        ? tr(language, 'possédé', 'owned')
        : tr(language, `${price} pièces`, `${price} coins`);
      return (
        <TouchableOpacity
          key={part.id}
          onPress={() => setPreviewPart(part)}
          style={[
            styles.tile,
            { backgroundColor: c.card, borderColor: meta.color + '88' },
            glow && { shadowColor: meta.color, shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
          ]}
          {...a11yButton(`${itemName}, ${stateLabel}`, {
            selected: itemOwned,
            hint: tr(language, 'Voir cet objet', 'View this item'),
          })}
        >
          {isNewPart(part) && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>{tr(language, 'NOUVEAU', 'NEW')}</Text>
            </View>
          )}
          {renderThumb(part)}
          <RarityBadge part={part} />
          <Text style={[styles.tileName, { color: c.text }]} numberOfLines={2}>
            {itemName}
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
              {price !== part.price && (
                <Text style={[styles.priceStrike, { color: c.textMuted }]}>{part.price}</Text>
              )}
              <Text style={[styles.priceText, { color: affordable ? c.text : c.textMuted }]}>
                {price}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      );
    },
    // renderThumb/RarityBadge close over c/language which are in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [owned, balance, c, language, effectivePrice],
  );

  const renderRow = useCallback(
    ({ item: row }: { item: CosmeticPart[] }) => (
      <View style={styles.grid}>{row.map(renderTile)}</View>
    ),
    [renderTile],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: ShopSection }) => (
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: c.textMuted }]}>
          {tr(language, CATEGORY_LABELS[section.cat][0], CATEGORY_LABELS[section.cat][1]).toUpperCase()}
        </Text>
        <View style={styles.sectionProgress}>
          <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: c.accent, width: `${Math.round((section.ownedCount / Math.max(1, section.totalCount)) * 100)}%` },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: c.textMuted }]}>
            {section.ownedCount}/{section.totalCount}
          </Text>
        </View>
      </View>
    ),
    [c, language],
  );

  const listHeader = useCallback(
    () => {
      const featMeta = featuredPart ? RARITY_META[featuredPart.rarity] : null;
      return (
        <View style={styles.headerStack}>
          {/* ── Pub récompensée (invisible tant que le flag rewarded_ads est off) ── */}
          <RewardedAdButton
            context="shop"
            onEarned={(coins) => setBalance((b) => b + coins)}
          />

          {/* ── Vitrine du jour ── */}
          {featured && featuredPart && !owned.has(featuredPart.id) && (
            <TouchableOpacity
              onPress={() => setPreviewPart(featuredPart)}
              style={[styles.featuredCard, { borderColor: (featMeta?.color ?? c.accent) + 'aa' }]}
              {...a11yButton(
                tr(
                  language,
                  `Vitrine du jour : ${featuredPart.nameFr}, ${featured.price} pièces au lieu de ${featured.basePrice}`,
                  `Today's featured: ${featuredPart.nameEn}, ${featured.price} coins instead of ${featured.basePrice}`,
                ),
              )}
            >
              <View style={styles.featuredDiscount}>
                <Text style={styles.featuredDiscountText}>-30%</Text>
              </View>
              {renderThumb(featuredPart, 64)}
              <View style={styles.featuredInfo}>
                <View style={styles.featuredTitleRow}>
                  <Sparkles size={13} color="#ffd700" />
                  <Text style={[styles.featuredTitle, { color: c.textMuted }]}>
                    {tr(language, 'VITRINE DU JOUR', "TODAY'S FEATURED")}
                  </Text>
                </View>
                <Text style={[styles.featuredName, { color: c.text }]} numberOfLines={1}>
                  {language === 'fr' ? featuredPart.nameFr : featuredPart.nameEn}
                </Text>
                <View style={styles.priceRow}>
                  <Coins color="#ffd700" size={13} />
                  <Text style={[styles.priceStrike, { color: c.textMuted }]}>{featured.basePrice}</Text>
                  <Text style={[styles.featuredPrice, { color: '#ffd700' }]}>{featured.price}</Text>
                  <Text style={[styles.featuredHint, { color: c.textMuted }]}>
                    {tr(language, "· aujourd'hui seulement", '· today only')}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* ── Packs ── */}
          {BUNDLES.map((bundle) => {
            const allOwned = bundle.itemIds.every((id) => owned.has(id));
            const base = bundleBasePrice(bundle);
            const busy = buying === bundle.id;
            return (
              <TouchableOpacity
                key={bundle.id}
                onPress={() => !allOwned && buyBundle(bundle)}
                disabled={allOwned || busy}
                style={[styles.bundleCard, { backgroundColor: c.card, borderColor: RARITY_META.epic.color + '77', opacity: allOwned ? 0.55 : 1 }]}
                {...a11yButton(
                  tr(
                    language,
                    `${bundle.nameFr}, ${allOwned ? 'possédé' : `${bundle.price} pièces au lieu de ${base}`}`,
                    `${bundle.nameEn}, ${allOwned ? 'owned' : `${bundle.price} coins instead of ${base}`}`,
                  ),
                  { disabled: allOwned || busy, busy },
                )}
              >
                <View style={styles.bundleThumbs}>
                  {bundle.itemIds.slice(0, 3).map((id, i) => {
                    const p = findPart(id);
                    return p ? (
                      <View key={id} style={[styles.bundleThumb, { marginLeft: i === 0 ? 0 : -14, borderColor: c.card }]}>
                        {renderThumb(p, 40)}
                      </View>
                    ) : null;
                  })}
                </View>
                <View style={styles.bundleInfo}>
                  <View style={styles.featuredTitleRow}>
                    <Package size={12} color={RARITY_META.epic.color} />
                    <Text style={[styles.bundleName, { color: c.text }]} numberOfLines={1}>
                      {language === 'fr' ? bundle.nameFr : bundle.nameEn}
                    </Text>
                  </View>
                  <Text style={[styles.bundleCount, { color: c.textMuted }]}>
                    {tr(language, `${bundle.itemIds.length} objets`, `${bundle.itemIds.length} items`)}
                  </Text>
                </View>
                {busy ? (
                  <ActivityIndicator size="small" color={c.accent} />
                ) : allOwned ? (
                  <View style={styles.ownedRow}>
                    <Check size={13} color={c.accent} />
                    <Text style={[styles.ownedText, { color: c.accent }]}>{tr(language, 'Possédé', 'Owned')}</Text>
                  </View>
                ) : (
                  <View style={styles.bundlePriceCol}>
                    <Text style={[styles.priceStrike, { color: c.textMuted }]}>{base}</Text>
                    <View style={styles.priceRow}>
                      <Coins color="#ffd700" size={13} />
                      <Text style={[styles.bundlePrice, { color: c.text }]}>{bundle.price}</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          {/* ── Filtres ── */}
          <View style={styles.filterRow}>
            {FILTER_LABELS.map(([key, fr, en]) => {
              const active = filter === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => {
                    setFilter(key);
                    track('shop_filter_changed', { filter: key });
                  }}
                  style={[
                    styles.filterChip,
                    { borderColor: active ? c.accent : c.border, backgroundColor: active ? c.accent + '22' : c.card },
                  ]}
                  {...a11yButton(tr(language, fr, en), { selected: active })}
                >
                  <Text style={[styles.filterText, { color: active ? c.accent : c.textMuted }]}>
                    {tr(language, fr, en)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

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
        </View>
      );
    },
    // buyBundle/renderThumb close over state already in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c, language, onEditAvatar, featured, featuredPart, owned, filter, buying, balance],
  );

  const isOwned = previewPart ? owned.has(previewPart.id) : false;
  const previewPrice = previewPart ? effectivePrice(previewPart) : 0;
  const canAfford = previewPart ? balance >= previewPrice : false;

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
                      tr(language, `Acheter pour ${previewPrice} pièces`, `Buy for ${previewPrice} coins`),
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
                        {previewPrice !== previewPart.price && (
                          <Text style={styles.buyStrike}>{previewPart.price}</Text>
                        )}
                        <Text style={styles.buyText}>{previewPrice}</Text>
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
  headerStack: { gap: 10 },
  // Vitrine du jour
  featuredCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, borderWidth: 1.5, padding: 12,
    backgroundColor: '#141b33', overflow: 'hidden',
  },
  featuredDiscount: {
    position: 'absolute', top: 10, right: 10, backgroundColor: '#ffd700',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, zIndex: 1,
  },
  featuredDiscountText: { fontSize: 11, fontFamily: FONTS.headingBlack, color: '#000' },
  featuredInfo: { flex: 1, gap: 3 },
  featuredTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  featuredTitle: { fontSize: 10, fontFamily: FONTS.monoBold, letterSpacing: 1 },
  featuredName: { fontSize: 15, fontFamily: FONTS.headingBlack },
  featuredPrice: { fontSize: 14, fontFamily: FONTS.headingBlack },
  featuredHint: { fontSize: 10, fontFamily: FONTS.mono },
  // Packs
  bundleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 10,
  },
  bundleThumbs: { flexDirection: 'row', alignItems: 'center' },
  bundleThumb: { borderRadius: 22, borderWidth: 2, overflow: 'hidden' },
  bundleInfo: { flex: 1, gap: 2 },
  bundleName: { fontSize: 13, fontFamily: FONTS.headingBlack, flexShrink: 1 },
  bundleCount: { fontSize: 10, fontFamily: FONTS.mono },
  bundlePriceCol: { alignItems: 'flex-end', gap: 1 },
  bundlePrice: { fontSize: 14, fontFamily: FONTS.headingBlack },
  // Filtres
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { paddingHorizontal: 12, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  filterText: { fontSize: 11, fontFamily: FONTS.monoBold },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14, borderWidth: 1 },
  editText: { fontSize: 14, fontFamily: FONTS.monoBold },
  // Sections
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: 4, marginRight: 4 },
  sectionTitle: { fontSize: 11, fontFamily: FONTS.monoBold, letterSpacing: 1 },
  sectionProgress: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressTrack: { width: 64, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  progressText: { fontSize: 10, fontFamily: FONTS.monoBold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: 96, borderRadius: 14, borderWidth: 1, padding: 10, alignItems: 'center', gap: 5 },
  newBadge: {
    position: 'absolute', top: 6, right: 6, zIndex: 1,
    backgroundColor: '#ff4d6d', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1,
  },
  newBadgeText: { fontSize: 7, fontFamily: FONTS.headingBlack, color: '#fff', letterSpacing: 0.5 },
  thumbRound: { overflow: 'hidden', backgroundColor: '#05060f' },
  thumbGlyphWrap: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rarityBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  rarityDot: { width: 6, height: 6, borderRadius: 3 },
  rarityText: { fontSize: 9, fontFamily: FONTS.monoBold, letterSpacing: 0.3, textTransform: 'uppercase' },
  tileName: { fontSize: 10, fontFamily: FONTS.mono, textAlign: 'center' },
  ownedRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ownedText: { fontSize: 10, fontFamily: FONTS.monoBold },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  priceText: { fontSize: 11, fontFamily: FONTS.monoBold },
  priceStrike: { fontSize: 10, fontFamily: FONTS.mono, textDecorationLine: 'line-through' },
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
  buyStrike: { color: '#ffffff88', fontSize: 13, fontFamily: FONTS.mono, textDecorationLine: 'line-through' },
  buyLabel: { fontSize: 14, fontFamily: FONTS.mono },
});
