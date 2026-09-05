/**
 * In-game globe picker for the Globe mode: swap the planet you play on without
 * leaving the round.
 *
 * Lists the classic globe — the app's own theme planet, no cosmetic — plus every
 * globe the player actually owns. Unlike the "Globes en jeu" lab, this one does
 * NOT offer what you haven't bought: it is a play surface, not a showroom, and a
 * locked planet dangled mid-round would just be noise.
 *
 * Picking rebuilds the globe page, so it is only offered between guesses (the
 * caller gates on the playing phase) — a reload during the result reveal would
 * wipe the answer highlight.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, ShoppingBag, X } from 'lucide-react-native';

import { WorldAvatar } from './WorldAvatar';
import { showAlert } from '../lib/alert';
import { GLOBE_PARTS, partStyleKey } from '../lib/globeSkin';
import { supabase } from '../lib/supabase';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { tr } from '../i18n';
import { a11yButton } from '../lib/a11y';
import type { AvatarConfig, CosmeticPart } from '../types';

interface GlobePickerModalProps {
  visible: boolean;
  onClose: () => void;
  /** Style key currently worn, or null for the classic theme globe. */
  current: string | null;
  /** Same contract as useGameGlobeSkin().choose — null picks the classic globe. */
  onPick: (key: string | null) => void;
  /**
   * Opens the shop. Only passed where leaving is harmless (free solo play): it
   * navigates away, which ends the round in progress, so the caller confirms
   * first and simply omits this in a daily / online / parcours game.
   */
  onOpenShop?: () => void;
}

/** Tile preview: the previewed globe alone on the free default backdrop. */
function tileConfig(part: CosmeticPart): AvatarConfig {
  return {
    v: 4,
    useCustom: true,
    layers: {
      cosmos: { id: 'cosmos_bluenight', tint: null },
      globe: { id: part.id, tint: null },
      orbit: { id: 'orbit_none', tint: null },
      emblem: { id: 'emblem_none', tint: null },
      satellite: { id: 'sat_none', tint: null },
    },
  };
}

export function GlobePickerModal({ visible, onClose, current, onPick, onOpenShop }: GlobePickerModalProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const t = (fr: string, en: string, args?: readonly unknown[]) => tr(language, fr, en, args);

  const [owned, setOwned] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!visible || owned) return;
    let alive = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const id = auth.user?.id;
      if (!id) {
        // Signed out: only the free default is available anyway.
        if (alive) setOwned(new Set());
        return;
      }
      const { data } = await supabase.from('user_cosmetics').select('item_id').eq('user_id', id);
      if (alive) setOwned(new Set((data ?? []).map((r) => r.item_id as string)));
    })().catch(() => {
      if (alive) setOwned(new Set());
    });
    return () => {
      alive = false;
    };
  }, [visible, owned]);

  const mine = GLOBE_PARTS.filter((p) => p.isDefault || owned?.has(p.id));

  const pick = (key: string | null) => {
    onPick(key);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: c.background, borderColor: c.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: c.text }]}>
              {t('Choisis ton globe', 'Pick your globe')}
            </Text>
            <TouchableOpacity onPress={onClose} {...a11yButton(t('Fermer', 'Close'))}>
              <X color={c.textMuted} size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.grid}>
            <TouchableOpacity
              onPress={() => pick(null)}
              style={[
                styles.tile,
                { borderColor: current === null ? c.accent : c.border, backgroundColor: c.card },
              ]}
              {...a11yButton(t('Globe classique', 'Classic globe'), { selected: current === null })}
            >
              <View style={[styles.art, { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 }]} />
              <Text style={[styles.name, { color: c.text }]} numberOfLines={2}>
                {t('Classique', 'Classic')}
              </Text>
              {current === null ? <Check color={c.accent} size={14} /> : null}
            </TouchableOpacity>

            {mine.map((part) => {
              const key = partStyleKey(part);
              const on = current === key;
              return (
                <TouchableOpacity
                  key={part.id}
                  onPress={() => pick(key)}
                  style={[
                    styles.tile,
                    { borderColor: on ? c.accent : c.border, backgroundColor: c.card },
                  ]}
                  {...a11yButton(tr(language, part.nameFr, part.nameEn), { selected: on })}
                >
                  <View style={styles.art}>
                    <WorldAvatar config={tileConfig(part)} size={64} round />
                  </View>
                  <Text style={[styles.name, { color: c.text }]} numberOfLines={2}>
                    {tr(language, part.nameFr, part.nameEn)}
                  </Text>
                  {on ? <Check color={c.accent} size={14} /> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.note, { color: c.textFaint }]}>
            {t(
              'Seuls tes globes sont proposés ici. La boutique en a d’autres.',
              'Only your own globes show up here. The shop has more.',
            )}
          </Text>

          {onOpenShop ? (
            <TouchableOpacity
              onPress={() => {
                // This sheet only ever opens mid-round, and the shop is a page:
                // going there unmounts the game. Ask first rather than eat a
                // round the player was in the middle of.
                showAlert(
                  t('Ouvrir la boutique ?', 'Open the shop?'),
                  t('Ta partie en cours sera perdue.', 'Your current game will be lost.'),
                  [
                    { text: t('Annuler', 'Cancel'), style: 'cancel' },
                    {
                      text: t('Boutique', 'Shop'),
                      onPress: () => {
                        onClose();
                        onOpenShop();
                      },
                    },
                  ],
                );
              }}
              style={[styles.shopBtn, { borderColor: c.accent, backgroundColor: c.card }]}
              {...a11yButton(t('Voir la boutique', 'Open the shop'))}
            >
              <ShoppingBag color={c.accent} size={16} />
              <Text style={[styles.shopBtnText, { color: c.accent }]}>
                {t('Voir la boutique', 'Open the shop')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 17, fontFamily: FONTS.headingBlack },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 8 },
  tile: {
    width: '31%',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 5,
  },
  art: { width: 64, height: 64, borderRadius: 32, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 10, fontFamily: FONTS.mono, textAlign: 'center', minHeight: 26 },
  note: { fontSize: 10, fontFamily: FONTS.mono, textAlign: 'center', marginTop: 8, lineHeight: 15 },
  shopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  shopBtnText: { fontSize: 13, fontFamily: FONTS.monoBold },
});
