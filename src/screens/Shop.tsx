import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BookOpen, Beer, Check, Circle, Coins, Crosshair, Home, Palette, Shield, Sparkles, Sword, Wand2 } from 'lucide-react-native';
import type { ComponentType } from 'react';

import { supabase } from '../lib/supabase';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { LAYER_ORDER, getCategoryParts } from '../data/cosmetics';
import type { CosmeticCategory, CosmeticPart, Language } from '../types';

interface ShopProps {
  session: { user: { id: string } | null };
  isDarkMode: boolean;
  language: Language;
  onBack: () => void;
  onEditAvatar: () => void;
}

const CATEGORY_LABELS: Record<CosmeticCategory, [string, string]> = {
  hero: ['Héros', 'Heroes'],
  weapon: ['Armes', 'Weapons'],
  offhand: ['Boucliers & soutien', 'Shields & offhand'],
  background: ['Décors', 'Environments'],
  frame: ['Cadres', 'Frames'],
};

const GEAR_ICONS: Record<string, ComponentType<{ color: string; size: number }>> = {
  weapon_sword_1h: Sword,
  weapon_sword_2h: Sword,
  weapon_dagger: Sword,
  weapon_axe_1h: Sword,
  weapon_axe_2h: Sword,
  weapon_wand: Wand2,
  weapon_staff: Sparkles,
  weapon_crossbow: Crosshair,
  weapon_mug: Beer,
  offhand_shield_round: Shield,
  offhand_shield_square: Shield,
  offhand_shield_badge: Shield,
  offhand_shield_spikes: Shield,
  offhand_spellbook: BookOpen,
};

export default function Shop({ session, isDarkMode, language, onBack, onEditAvatar }: ShopProps) {
  const userId = session.user?.id ?? '';
  const c = getColors(isDarkMode);

  const [balance, setBalance] = useState(0);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [{ data: wallet }, { data: cosmetics }] = await Promise.all([
      supabase.from('coin_wallets').select('balance').eq('user_id', userId).maybeSingle(),
      supabase.from('user_cosmetics').select('item_id').eq('user_id', userId),
    ]);
    setBalance(wallet?.balance ?? 0);
    setOwned(new Set((cosmetics ?? []).map((r) => r.item_id as string)));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const buy = async (part: CosmeticPart) => {
    if (balance < part.price) {
      Alert.alert(tr(language, 'Solde insuffisant', 'Insufficient funds'), tr(language, 'Jouez pour gagner des pièces.', 'Play to earn coins.'));
      return;
    }
    setBuying(part.id);
    const { data, error } = await supabase.rpc('purchase_cosmetic', { p_item_id: part.id });
    setBuying(null);
    if (error) {
      Alert.alert(tr(language, 'Erreur', 'Error'), error.message);
      return;
    }
    const result = data as { already_owned: boolean; new_balance: number };
    setBalance(result.new_balance);
    setOwned((prev) => new Set(prev).add(part.id));
  };

  const renderTileVisual = (part: CosmeticPart) => {
    if (part.thumbUrl) {
      return <Image source={{ uri: part.thumbUrl }} style={{ width: 60, height: 60, borderRadius: 30 }} resizeMode="cover" />;
    }
    if (part.swatch) {
      return (
        <View
          style={{
            width: 60, height: 60, borderRadius: 30,
            backgroundColor: part.category === 'frame' ? 'transparent' : part.swatch,
            borderWidth: part.category === 'frame' ? 6 : 1,
            borderColor: part.category === 'frame' ? part.swatch : c.border,
          }}
        />
      );
    }
    const Icon = GEAR_ICONS[part.id] ?? Circle;
    return (
      <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <Icon color={c.text} size={28} />
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
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={onEditAvatar} style={[styles.editBtn, { backgroundColor: c.card, borderColor: c.accent }]}>
            <Palette color={c.accent} size={18} />
            <Text style={[styles.editText, { color: c.accent }]}>{tr(language, 'Personnaliser mon héros', 'Customize my hero')}</Text>
          </TouchableOpacity>

          {LAYER_ORDER.map((cat) => {
            const parts = getCategoryParts(cat).filter((p) => !p.isDefault);
            if (parts.length === 0) return null;
            return (
              <View key={cat} style={{ gap: 10 }}>
                <Text style={[styles.sectionTitle, { color: c.textMuted }]}>
                  {tr(language, CATEGORY_LABELS[cat][0], CATEGORY_LABELS[cat][1]).toUpperCase()}
                </Text>
                <View style={styles.grid}>
                  {parts.map((part) => {
                    const isOwned = owned.has(part.id);
                    const canAfford = balance >= part.price;
                    return (
                      <View key={part.id} style={[styles.tile, { backgroundColor: c.card, borderColor: c.border }]}>
                        {renderTileVisual(part)}
                        <Text style={[styles.tileName, { color: c.text }]} numberOfLines={1}>
                          {language === 'fr' ? part.nameFr : part.nameEn}
                        </Text>
                        {isOwned ? (
                          <View style={styles.ownedRow}>
                            <Check size={13} color={c.accent} />
                            <Text style={[styles.ownedText, { color: c.accent }]}>{tr(language, 'Possédé', 'Owned')}</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => buy(part)}
                            disabled={buying === part.id}
                            style={[styles.buyBtn, { backgroundColor: canAfford ? c.accent : c.border }]}
                          >
                            {buying === part.id ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <>
                                <Coins color="#ffd700" size={13} />
                                <Text style={styles.buyText}>{part.price}</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>
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
  coinChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  coinText: { fontSize: 15, fontFamily: FONTS.headingBlack },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48, gap: 18 },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14, borderWidth: 1 },
  editText: { fontSize: 14, fontFamily: FONTS.monoBold },
  sectionTitle: { fontSize: 11, fontFamily: FONTS.monoBold, letterSpacing: 1, marginLeft: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: 96, borderRadius: 14, borderWidth: 1, padding: 10, alignItems: 'center', gap: 6 },
  tileName: { fontSize: 10, fontFamily: FONTS.mono, textAlign: 'center' },
  ownedRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ownedText: { fontSize: 10, fontFamily: FONTS.monoBold },
  buyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: 8, minWidth: 52 },
  buyText: { color: '#fff', fontSize: 12, fontFamily: FONTS.monoBold },
});
