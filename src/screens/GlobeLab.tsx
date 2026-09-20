/**
 * "Globes en jeu" — try every shop globe on the REAL gameplay globe.
 *
 * The preview is not a mock-up: it builds the very same page the Globe mode
 * mounts (buildFindEarthHtml on the WebGL renderer, buildGlobeHtml on the
 * Canvas-2D fallback) with the previewed skin, so what shows here is exactly
 * what a round will look like — drag, pinch and zoom included.
 *
 * Every skin is testable, owned or not: the pick is a device-local override
 * (lib/globeSkin.ts), never an equip, so it can't grant a cosmetic. Owned /
 * equipped state is still labelled on the tiles so the real economy stays
 * legible. "Utiliser dans les parties" writes the override; the tile marked
 * "en jeu" is what the games are actually wearing.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Check, Lock, RotateCcw } from 'lucide-react-native';

import rawCountriesStats from '../../assets/countries_stats.json';
import rawWorldPolygons from '../../assets/world_polygons.json';
import GlobeWebView from '../components/GlobeWebView';
import { WorldAvatar } from '../components/WorldAvatar';
import { buildGlobeHtml } from './FindCountryGame';
import { buildFindEarthHtml } from '../lib/globe3d/buildEarthHtml';
import {
  GLOBE_PARTS,
  loadGameGlobePref,
  loadSkinForKey,
  partStyleKey,
  resolveSkinKey,
  setGameGlobeOverride,
  skinMapPalette,
  type GameGlobePref,
  type GameGlobeSkin,
} from '../lib/globeSkin';
import { RARITY_META } from '../data/cosmetics';
import { supabase } from '../lib/supabase';
import { getMapPalette } from '../theme/mapPalette';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { a11yButton, announce } from '../lib/a11y';
import { tr } from '../i18n';
import type { AvatarConfig, CosmeticPart } from '../types';

interface GlobeLabProps {
  onBack: () => void;
}

interface CountryStat {
  name: string;
  name_en: string;
  cca3: string;
  lat: number;
  lng: number;
  region: string;
  area: number;
}

interface WorldPolygon {
  id: string;
  r: number[][][];
}

/** A globe style key; `null` only while the prefs are still loading. */
type PreviewKey = string | null;

/** Tile preview config: the previewed globe on the free default backdrop. */
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

export default function GlobeLab({ onBack }: GlobeLabProps) {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const t = (fr: string, en: string, args?: readonly unknown[]) => tr(language, fr, en, args);

  const [pref, setPref] = useState<GameGlobePref | null>(null);
  const [preview, setPreview] = useState<PreviewKey>(null);
  // Keyed by the style it belongs to, so a stale texture is never handed to a
  // freshly picked skin while its own load is still in flight.
  const [resolved, setResolved] = useState<{ key: PreviewKey; skin: GameGlobeSkin | null } | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [equippedKey, setEquippedKey] = useState<string | null>(null);
  const [threeSrc, setThreeSrc] = useState<string | null>(null);

  // ── Initial state: prefs decide what is already worn in game ───────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await loadGameGlobePref();
      if (!alive) return;
      setPref(p);
      setPreview(resolveSkinKey(p));
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Ownership + equipped globe, for the tile labels only (never for gating).
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const [{ data: cosmetics }, { data: profile }] = await Promise.all([
        supabase.from('user_cosmetics').select('item_id').eq('user_id', user.id),
        supabase.from('profiles').select('avatar_config').eq('id', user.id).single(),
      ]);
      if (!alive) return;
      setOwned(new Set((cosmetics ?? []).map((r) => r.item_id as string)));
      const cfg = profile?.avatar_config as unknown as AvatarConfig | null;
      setEquippedKey(cfg?.layers?.globe?.id ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  // The renderer the games will use, by the same rule as useGameGlobeSkin — so
  // the preview can't lie: a worn globe always brings WebGL, and a globe is
  // always worn.
  const use3d = true;

  useEffect(() => {
    if (!use3d || threeSrc) return;
    let alive = true;
    import('../vendor/threeSource')
      .then((m) => {
        if (alive) setThreeSrc(m.THREE_SRC);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [use3d, threeSrc]);

  // ── Resolve the previewed skin's texture ──────────────────────────────────
  useEffect(() => {
    let alive = true;
    loadSkinForKey(preview, { config: pref?.config ?? null })
      .then((s) => {
        if (alive) setResolved({ key: preview, skin: s });
      })
      .catch(() => {
        if (alive) setResolved({ key: preview, skin: null });
      });
    return () => {
      alive = false;
    };
  }, [preview, pref?.config]);

  const skin = resolved?.key === preview ? resolved.skin : null;
  const skinReady = resolved !== null && resolved.key === preview;

  const globeHtml = useMemo(() => {
    if (!skinReady) return null;
    const pal = skinMapPalette(getMapPalette(isDarkMode), preview);
    if (use3d) {
      if (!threeSrc) return null;
      return buildFindEarthHtml({
        threeSrc,
        isDark: isDarkMode,
        pal,
        polygons: rawWorldPolygons as unknown as WorldPolygon[],
        dots: (rawCountriesStats as unknown as CountryStat[]).map((co) => ({
          cca3: co.cca3,
          lat: co.lat,
          lng: co.lng,
          area: co.area,
        })),
        skin,
      });
    }
    return buildGlobeHtml(
      rawCountriesStats as unknown as CountryStat[],
      isDarkMode,
      rawWorldPolygons as unknown as WorldPolygon[],
      pal,
    );
  }, [skinReady, skin, preview, use3d, threeSrc, isDarkMode]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const appliedKey = pref ? resolveSkinKey(pref) : null;
  const isApplied = appliedKey === preview;

  const previewPart = useMemo(
    () => GLOBE_PARTS.find((p) => partStyleKey(p) === preview) ?? null,
    [preview],
  );
  const previewName = previewPart
    ? tr(language, previewPart.nameFr, previewPart.nameEn)
    : t('Terre classique', 'Classic Earth');

  const apply = useCallback(async () => {
    if (!pref || preview === null) return;
    // Pinning the equipped globe as an override would freeze it: leave the
    // override empty so a later equip in the shop follows through on its own.
    const asOverride = preview === pref.equipped ? null : preview;
    await setGameGlobeOverride(asOverride);
    setPref({ ...pref, override: asOverride });
    announce(tr(language, 'Globe appliqué aux parties', 'Globe applied to games'));
  }, [pref, preview, language]);

  const followEquipped = useCallback(async () => {
    if (!pref) return;
    await setGameGlobeOverride(null);
    setPref({ ...pref, override: null });
    setPreview(pref.equipped);
  }, [pref]);

  const rarity = previewPart ? RARITY_META[previewPart.rarity] : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}
          {...a11yButton(t('Retour', 'Back'))}
        >
          <ArrowLeft color={c.text} size={20} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>{t('Globes en jeu', 'In-game globes')}</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Live gameplay globe with the previewed skin */}
        <View style={[styles.previewWrap, { borderColor: c.border, backgroundColor: skinMapPalette(getMapPalette(isDarkMode), preview).bg }]}>
          {globeHtml ? (
            <GlobeWebView
              // A new page per skin/renderer — the builders bake the look in.
              key={`${preview ?? 'classic'}:${use3d ? '3d' : '2d'}:${isDarkMode ? 'd' : 'l'}`}
              source={{ html: globeHtml }}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              scrollEnabled={false}
              style={styles.previewWeb}
            />
          ) : (
            <View style={styles.previewLoading}>
              <ActivityIndicator color={c.accent} />
            </View>
          )}
        </View>

        <View style={styles.previewMeta}>
          <Text style={[styles.previewName, { color: c.text }]}>{previewName}</Text>
          <View style={styles.previewTags}>
            {rarity ? (
              <Text style={[styles.tag, { color: rarity.color, borderColor: rarity.color }]}>
                {tr(language, rarity.labelFr, rarity.labelEn)}
              </Text>
            ) : null}
            <Text style={[styles.tag, { color: c.textMuted, borderColor: c.border }]}>
              {use3d ? t('rendu 3D', '3D renderer') : t('rendu 2D', '2D renderer')}
            </Text>
            {isApplied ? (
              <Text style={[styles.tag, { color: c.accent, borderColor: c.accent }]}>
                {t('en jeu', 'in game')}
              </Text>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          onPress={apply}
          disabled={!pref || isApplied}
          style={[
            styles.cta,
            { backgroundColor: isApplied ? c.card : c.accent, borderColor: isApplied ? c.border : c.accent },
          ]}
          {...a11yButton(t('Utiliser ce globe dans les parties', 'Use this globe in games'))}
        >
          {isApplied ? <Check color={c.textMuted} size={18} /> : null}
          <Text style={[styles.ctaText, { color: isApplied ? c.textMuted : '#fff' }]}>
            {isApplied
              ? t('Déjà utilisé dans les parties', 'Already used in games')
              : t('Utiliser dans les parties', 'Use in games')}
          </Text>
        </TouchableOpacity>

        {/* Le globe équipé dans la boutique est celui des parties (Terre
            classique par défaut) ; un choix fait ici le remplace, sur cet
            appareil seulement. */}
        {pref?.override ? (
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <TouchableOpacity
              onPress={followEquipped}
              style={styles.optRow}
              {...a11yButton(t('Revenir au globe équipé', 'Back to the equipped globe'))}
            >
              <RotateCcw color={c.accent} size={16} />
              <View style={styles.optLabel}>
                <Text style={[styles.optTitle, { color: c.accent }]}>
                  {t('Revenir au globe équipé', 'Back to the equipped globe')}
                </Text>
                <Text style={[styles.optSub, { color: c.textFaint }]}>
                  {t(
                    'Les parties portent alors le globe équipé dans la boutique, comme sur ton profil.',
                    'Games then wear the globe equipped in the shop, like on your profile.',
                  )}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* All globes — every one testable, owned or not */}
        <Text style={[styles.sectionTitle, { color: c.textMuted }]}>
          {t( 'TOUS LES GLOBES ({0})', 'ALL GLOBES ({0})', [GLOBE_PARTS.length])}
        </Text>

        <View style={styles.grid}>
          {GLOBE_PARTS.map((part) => {
            const key = partStyleKey(part);
            const isOwned = part.isDefault || owned.has(part.id);
            const selected = preview === key;
            const inGame = appliedKey === key;
            return (
              <TouchableOpacity
                key={part.id}
                onPress={() => setPreview(key)}
                style={[
                  styles.tile,
                  { borderColor: selected ? c.accent : c.border, backgroundColor: c.card },
                ]}
                {...a11yButton(tr(language, part.nameFr, part.nameEn))}
              >
                <View style={styles.tileArt}>
                  <WorldAvatar config={tileConfig(part)} size={64} round />
                </View>
                <Text style={[styles.tileName, { color: c.text }]} numberOfLines={2}>
                  {tr(language, part.nameFr, part.nameEn)}
                </Text>
                <View style={styles.tileBadges}>
                  {inGame ? (
                    <Text style={[styles.badge, { color: c.accent }]}>{t('en jeu', 'in game')}</Text>
                  ) : equippedKey === part.id ? (
                    <Text style={[styles.badge, { color: c.textMuted }]}>{t('équipé', 'equipped')}</Text>
                  ) : !isOwned ? (
                    <>
                      <Lock color={c.textFaint} size={10} />
                      <Text style={[styles.badge, { color: c.textFaint }]}>{t('test', 'test')}</Text>
                    </>
                  ) : (
                    <Text style={[styles.badge, { color: c.textFaint }]}>{t('possédé', 'owned')}</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.footNote, { color: c.textFaint }]}>
          {t(
            'Tester un globe non possédé ne le débloque pas : le choix reste local à cet appareil.',
            'Testing a globe you do not own does not unlock it — the pick stays local to this device.',
          )}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontFamily: FONTS.headingBlack },
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  previewWrap: {
    height: 320,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  previewWeb: { flex: 1, backgroundColor: 'transparent' },
  previewLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewMeta: { gap: 6 },
  previewName: { fontSize: 17, fontFamily: FONTS.monoBold },
  previewTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    fontSize: 11,
    fontFamily: FONTS.mono,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 13,
  },
  ctaText: { fontSize: 15, fontFamily: FONTS.monoBold },
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optLabel: { flex: 1, gap: 3 },
  optTitle: { fontSize: 14, fontFamily: FONTS.monoBold },
  optSub: { fontSize: 11, fontFamily: FONTS.mono, lineHeight: 15 },
  sectionTitle: { fontSize: 11, fontFamily: FONTS.monoBold, letterSpacing: 1, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '31%',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 6,
  },
  tileArt: {
    width: 64,
    height: 64,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 32,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileName: { fontSize: 11, fontFamily: FONTS.mono, textAlign: 'center', minHeight: 28 },
  tileBadges: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  badge: { fontSize: 9, fontFamily: FONTS.monoBold, textTransform: 'uppercase', letterSpacing: 0.4 },
  footNote: { fontSize: 11, fontFamily: FONTS.mono, lineHeight: 16, marginTop: 4 },
});
