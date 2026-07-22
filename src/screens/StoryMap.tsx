import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';
import {
  ArrowLeft, Flag, Gift, Globe, Heart, Info, LayoutGrid, List, Lock, Map as MapIcon,
  Plus, Puzzle, Route, Star, TrendingUp, X, Zap, type LucideIcon,
} from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';

import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../components/ToastProvider';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { showAlert } from '../lib/alert';
import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';
import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import {
  normalizeConfig, DEFAULT_AVATAR_CONFIG, getPartById, STORY_COSMETIC_UNLOCKS,
} from '../data/cosmetics';
import { WorldAvatar } from '../components/WorldAvatar';
import { Avatar } from '../components/Avatar';
import type { AvatarConfig } from '../types';

import { STORY_LEVEL_COUNT, getStoryLevel, type StoryLevel } from '../data/story';
import { biomeForTier, type Biome, type BiomeDecor } from '../data/biomes';
import {
  getStorySnapshot,
  consumeLife,
  claimLifeFromAd,
  recordLevel,
  getFriendsPositions,
  MAX_LIVES,
  type StorySnapshot,
  type FriendPosition,
} from '../lib/story';
import { rewardedAdsAvailable, watchRewardedAd } from '../lib/monetization';
import StoryGameHost from './StoryGameHost';

// ── Layout constants for the winding river-path ────────────────────────────────
const ROW_H = 118; // vertical spacing per level node
const NODE = 62; // medallion diameter
const TOP_PAD = 52;
const PER_TIER = 10;
const RIVER_W = 52;

/** Which lucide icon marks each game mode on a medallion. */
const MODE_ICON: Record<string, LucideIcon> = {
  'quiz-flag': Flag,
  'quiz-capital': Flag,
  guess: Info,
  globe: Globe,
  silhouette: Puzzle,
  borders: Route,
  higherlower: TrendingUp,
  streak: Zap,
  classic: LayoutGrid,
};

/** Milestone level → exclusive reward item id (from the shared unlock schedule). */
const REWARD_AT = new Map(STORY_COSMETIC_UNLOCKS.map((u) => [u.level, u.itemId]));

interface StoryMapProps {
  user: User | null;
  onBack: () => void;
  onOpenPlayer?: (userId: string, username?: string | null) => void;
}

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Tiny deterministic RNG so a tier's decoration is stable across renders. */
function makeRng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => (s = Math.imul(s ^ (s >>> 15), 0x2c9277b5) >>> 0) / 4294967296;
}

/** Lighten/darken a hex by amt in [-1,1] (toward black/white). */
function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(full, 16);
  const t = Math.abs(amt);
  const tg = amt < 0 ? 0 : 255;
  const r = Math.round(((n >> 16) & 255) + (tg - ((n >> 16) & 255)) * t);
  const g = Math.round(((n >> 8) & 255) + (tg - ((n >> 8) & 255)) * t);
  const b = Math.round((n & 255) + (tg - (n & 255)) * t);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/** Build an avatar config that equips a single exclusive reward part. */
function rewardConfig(itemId: string): AvatarConfig {
  const cfg = normalizeConfig(DEFAULT_AVATAR_CONFIG);
  const part = getPartById(itemId);
  if (part) cfg.layers[part.category] = { id: itemId, tint: null };
  return cfg;
}

/**
 * Story campaign map — a detailed, themed winding-river journey. Each 10-level
 * tier is a biome painted with a background relief, scattered decoration (varied
 * per tier so repeats never look the same) and the river as the path. Level
 * medallions carry their game-mode icon; milestone levels show a floating
 * preview of the exclusive cosmetic you win there. The player's globe rides their
 * current level, friends' globes mark theirs.
 */
export default function StoryMap({ user, onBack, onOpenPlayer }: StoryMapProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);
  const { width } = useWindowDimensions();

  const [snapshot, setSnapshot] = useState<StorySnapshot | null>(null);
  const [friends, setFriends] = useState<FriendPosition[]>([]);
  const [myAvatar, setMyAvatar] = useState<AvatarConfig | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [active, setActive] = useState<StoryLevel | null>(null);
  const [adAvailable, setAdAvailable] = useState(false);
  const [countdownMs, setCountdownMs] = useState(0);
  const [view, setView] = useState<'map' | 'table'>('map');

  const scrollRef = useRef<ScrollView>(null);
  const regenTarget = useRef<number>(0);
  const didAutoScroll = useRef(false);

  // ── Geometry ─────────────────────────────────────────────────────────────────
  const amp = Math.min(Math.max(width * 0.26, 58), 130);
  const centerX = width / 2;
  const contentHeight = TOP_PAD * 2 + STORY_LEVEL_COUNT * ROW_H;
  const tierCount = Math.ceil(STORY_LEVEL_COUNT / PER_TIER);

  const riverX = useCallback(
    (y: number) => centerX + amp * Math.sin(((y - TOP_PAD) / ROW_H) * 0.8),
    [amp, centerX],
  );
  const nodePos = useCallback(
    (level: number) => {
      const y = TOP_PAD + (level - 1) * ROW_H;
      return { x: riverX(y), y };
    },
    [riverX],
  );
  const bandTop = useCallback(
    (tier: number) => (tier === 1 ? 0 : TOP_PAD + ((tier - 1) * PER_TIER - 0.5) * ROW_H),
    [],
  );
  const bandBottom = useCallback(
    (tier: number) => (tier === tierCount ? contentHeight : TOP_PAD + (tier * PER_TIER - 0.5) * ROW_H),
    [contentHeight, tierCount],
  );
  const riverSegment = useCallback(
    (top: number, bottom: number) => {
      let d = '';
      for (let y = top - 4; y <= bottom + 4; y += 12) {
        d += `${d ? 'L' : 'M'}${riverX(y).toFixed(1)} ${y.toFixed(1)} `;
      }
      return d;
    },
    [riverX],
  );

  // ── Themed background (biome bands + relief + river + decor) ──────────────────
  const background = useMemo(() => {
    const defs: React.ReactNode[] = [];
    const body: React.ReactNode[] = [];
    for (let tier = 1; tier <= tierCount; tier++) {
      const b = biomeForTier(tier);
      const top = bandTop(tier);
      const bot = bandBottom(tier);
      const rng = makeRng(tier * 2654435761);

      defs.push(
        <LinearGradient key={`bank_${tier}`} id={`bank_${tier}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={b.bank[0]} />
          <Stop offset="1" stopColor={b.bank[1]} />
        </LinearGradient>,
      );
      body.push(<Rect key={`bg_${tier}`} x={0} y={top} width={width} height={bot - top} fill={`url(#bank_${tier})`} />);
      // Far relief for depth (behind everything else in the band).
      body.push(...drawFeature(b, top, bot, width, rng));
      // Per-tier variation overlay so same-biome repeats read differently.
      const tint = rng() < 0.5 ? '#ffffff' : '#000000';
      body.push(<Rect key={`ov_${tier}`} x={0} y={top} width={width} height={bot - top} fill={tint} opacity={0.03 + rng() * 0.04} />);
      // The river: glow, body, shimmer.
      const seg = riverSegment(top, bot);
      body.push(<Path key={`rg_${tier}`} d={seg} stroke={b.river[1]} strokeWidth={RIVER_W + 14} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.3} />);
      body.push(<Path key={`rv_${tier}`} d={seg} stroke={b.river[1]} strokeWidth={RIVER_W} fill="none" strokeLinecap="round" strokeLinejoin="round" />);
      body.push(<Path key={`re_${tier}`} d={seg} stroke={b.river[0]} strokeWidth={RIVER_W * 0.34} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />);
      // Scattered small decoration on the banks.
      body.push(...drawScatter(b, top, bot, width, riverX, rng));
    }
    return { defs, body };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, amp, centerX]);

  // ── Data loading ───────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    const snap = await getStorySnapshot(user);
    setSnapshot(snap);
    if (snap.lives < MAX_LIVES && snap.nextRegenMs > 0) {
      regenTarget.current = Date.now() + snap.nextRegenMs;
      setCountdownMs(snap.nextRegenMs);
    } else {
      regenTarget.current = 0;
      setCountdownMs(0);
    }
  }, [user]);

  useEffect(() => {
    track('story_opened');
    reload();
    rewardedAdsAvailable().then(setAdAvailable).catch(() => setAdAvailable(false));
    getFriendsPositions(user).then(setFriends).catch(() => setFriends([]));
    if (user) {
      supabase
        .from('profiles')
        .select('avatar_config, username')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }: any) => {
          if (data?.avatar_config) setMyAvatar(normalizeConfig(data.avatar_config as AvatarConfig));
          if (data?.username) setMyName(data.username);
        }, () => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (regenTarget.current === 0) return;
      const remaining = regenTarget.current - Date.now();
      if (remaining <= 0) {
        regenTarget.current = 0;
        void reload();
      } else {
        setCountdownMs(remaining);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [reload]);

  const currentLevel = Math.min((snapshot?.maxLevel ?? 0) + 1, STORY_LEVEL_COUNT);

  const onViewportLayout = useCallback(
    (h: number) => {
      if (didAutoScroll.current || !snapshot) return;
      didAutoScroll.current = true;
      const { y } = nodePos(currentLevel);
      scrollRef.current?.scrollTo({ y: Math.max(0, y - h / 2), animated: false });
    },
    [snapshot, currentLevel, nodePos],
  );

  // ── Actions ────────────────────────────────────────────────────────────────────
  const watchAdForLife = useCallback(async () => {
    if (!adAvailable) {
      toast.info(tr(language, 'Les vies reviennent avec le temps.', 'Lives come back over time.'));
      return;
    }
    const res = await watchRewardedAd();
    if (!res.earned) {
      toast.error(tr(language, 'Pub non terminée.', 'Ad not completed.'));
      return;
    }
    const claim = await claimLifeFromAd(user);
    if (claim.granted) {
      toast.success(tr(language, '+1 vie !', '+1 life!'));
      track('story_life_ad_claimed');
    } else {
      toast.info(tr(language, 'Vies déjà au maximum ou limite du jour atteinte.', 'Lives already full or daily limit reached.'));
    }
    await reload();
  }, [adAvailable, user, language, toast, reload]);

  const offerAd = useCallback(() => {
    showAlert(
      tr(language, 'Plus de vies', 'Out of lives'),
      tr(
        language,
        'Attends qu’une vie revienne, ou regarde une pub pour en gagner une tout de suite.',
        'Wait for a life to come back, or watch an ad to get one now.',
      ),
      [
        { text: tr(language, 'Plus tard', 'Later'), style: 'cancel' },
        ...(adAvailable
          ? [{ text: tr(language, 'Regarder une pub', 'Watch an ad'), onPress: () => void watchAdForLife() }]
          : []),
      ],
    );
  }, [adAvailable, language, watchAdForLife]);

  const onTapLevel = useCallback(
    async (level: number) => {
      if (!snapshot) return;
      if (level > currentLevel) {
        toast.info(tr(language, 'Termine les niveaux précédents d’abord.', 'Finish the earlier levels first.'));
        return;
      }
      if (snapshot.lives <= 0) {
        offerAd();
        return;
      }
      const spent = await consumeLife(user);
      if (!spent.ok) {
        offerAd();
        return;
      }
      setSnapshot((s) => (s ? { ...s, lives: spent.lives } : s));
      track('story_level_started', { level });
      setActive(getStoryLevel(level));
    },
    [snapshot, currentLevel, user, language, toast, offerAd],
  );

  const onLevelComplete = useCallback(
    async ({ score, stars }: { score: number; stars: number }) => {
      const lvl = active?.level;
      setActive(null);
      if (lvl == null) return;
      const res = await recordLevel(user, lvl, score, stars);
      if (stars >= 1) {
        toast.success(
          tr(
            language,
            `Niveau ${lvl} réussi — ${'★'.repeat(stars)}${res.coins ? ` +${res.coins} pièces` : ''}`,
            `Level ${lvl} cleared — ${'★'.repeat(stars)}${res.coins ? ` +${res.coins} coins` : ''}`,
          ),
        );
        const part = res.unlockedItemId ? getPartById(res.unlockedItemId) : undefined;
        if (part) {
          const name = language === 'fr' ? part.nameFr : part.nameEn;
          toast.success(tr(language, `Nouveau cosmétique débloqué : ${name} !`, `New cosmetic unlocked: ${name}!`));
        }
      } else {
        toast.error(tr(language, 'Score trop bas — réessaie !', 'Score too low — try again!'));
      }
      await reload();
    },
    [active, user, language, toast, reload],
  );

  // ── Active level overlay ─────────────────────────────────────────────────────
  if (active) {
    return (
      <StoryGameHost
        level={active}
        onExit={() => {
          setActive(null);
          void reload();
        }}
        onLevelComplete={onLevelComplete}
      />
    );
  }

  const friendsByLevel = new Map<number, FriendPosition[]>();
  for (const f of friends) {
    const lvl = Math.min(Math.max(f.maxLevel, 1), STORY_LEVEL_COUNT);
    const arr = friendsByLevel.get(lvl) ?? [];
    arr.push(f);
    friendsByLevel.set(lvl, arr);
  }

  const lives = snapshot?.lives ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      {/* Header: back + title + lives */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <TouchableOpacity onPress={onBack} hitSlop={ICON_HIT_SLOP} {...a11yButton(tr(language, 'Retour', 'Back'))}>
          <ArrowLeft color={c.text} size={24} />
        </TouchableOpacity>
        <Text style={{ fontFamily: FONTS.heading, color: c.text, fontSize: 20, flex: 1 }}>
          {tr(language, 'Mode Histoire', 'Story Mode')}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {Array.from({ length: MAX_LIVES }, (_, i) => (
            <Heart key={i} size={16} color="#e8772e" fill={i < lives ? '#e8772e' : 'transparent'} />
          ))}
          {lives < MAX_LIVES && countdownMs > 0 ? (
            <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 11, marginLeft: 4 }}>
              {fmtCountdown(countdownMs)}
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={watchAdForLife}
            hitSlop={ICON_HIT_SLOP}
            style={{ marginLeft: 6 }}
            {...a11yButton(tr(language, 'Gagner une vie', 'Earn a life'))}
          >
            <Plus color={c.accent} size={18} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Carte / Tableau toggle */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
        {([
          ['map', MapIcon, tr(language, 'Carte', 'Map')],
          ['table', List, tr(language, 'Tableau', 'List')],
        ] as const).map(([key, Icon, label]) => {
          const on = view === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setView(key)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 6,
                paddingHorizontal: 14,
                borderRadius: 999,
                backgroundColor: on ? c.accent : c.card,
                borderWidth: 1,
                borderColor: on ? c.accent : c.border,
              }}
              {...a11yButton(label, { selected: on })}
            >
              <Icon color={on ? '#fff' : c.textMuted} size={15} />
              <Text style={{ fontFamily: FONTS.mono, fontSize: 12, color: on ? '#fff' : c.textMuted }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {view === 'table' ? (
        <StoryTable
          snapshot={snapshot}
          friends={friends}
          myAvatar={myAvatar}
          myName={myName}
          user={user}
          language={language}
          colors={c}
          onOpenPlayer={onOpenPlayer}
        />
      ) : (
      <ScrollView
        ref={scrollRef}
        onLayout={(e) => onViewportLayout(e.nativeEvent.layout.height)}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ height: contentHeight, width }}>
          {/* Themed biome background + relief + river path */}
          <Svg width={width} height={contentHeight} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
            <Defs>{background.defs}</Defs>
            {background.body}
          </Svg>

          {/* Level medallions + reward markers */}
          {Array.from({ length: STORY_LEVEL_COUNT }, (_, idx) => {
            const level = idx + 1;
            const { x, y } = nodePos(level);
            const meta = getStoryLevel(level);
            const biome = biomeForTier(meta.tier);
            const stars = snapshot?.stars[level] ?? 0;
            const locked = level > currentLevel;
            const isCurrent = level === currentLevel;
            const nodeFriends = friendsByLevel.get(level) ?? [];
            const rewardItem = REWARD_AT.get(level);
            const ModeIcon = MODE_ICON[meta.mode] ?? Globe;
            const ringDark = shade(biome.rim, -0.35);
            const ringLight = shade(biome.rim, 0.28);

            // Reward marker sits opposite the medallion's horizontal offset.
            const rewardSide = x > centerX ? -1 : 1;

            return (
              <View key={level} style={{ position: 'absolute', left: x - NODE / 2, top: y }}>
                {/* Tier banner every 10 levels */}
                {level % PER_TIER === 1 ? (
                  <View style={{ position: 'absolute', top: -34, left: NODE / 2 - 74, width: 148, alignItems: 'center' }}>
                    <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
                      <Text style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#fff', letterSpacing: 1 }}>
                        {tr(language, `PALIER ${meta.tier} · ${biome.nameFr.toUpperCase()}`, `TIER ${meta.tier} · ${biome.nameEn.toUpperCase()}`)}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {/* Reward preview — shows WHAT you win and at which level */}
                {rewardItem ? (
                  <RewardMarker
                    itemId={rewardItem}
                    level={level}
                    side={rewardSide}
                    language={language}
                    dim={locked}
                    textColor={c.text}
                    cardBg={isDarkMode ? 'rgba(19,32,64,0.92)' : 'rgba(255,255,255,0.92)'}
                  />
                ) : null}

                {/* Medallion */}
                <View style={{ width: NODE, height: NODE }}>
                  {/* drop shadow */}
                  <View style={{ position: 'absolute', top: 6, left: NODE / 2 - 22, width: 44, height: 12, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.22)' }} />
                  {/* outer ring */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={locked}
                    onPress={() => onTapLevel(level)}
                    {...a11yButton(
                      locked
                        ? tr(language, `Niveau ${level} verrouillé`, `Level ${level} locked`)
                        : tr(language, `Niveau ${level}, ${biome.nameFr}`, `Level ${level}, ${biome.nameEn}`),
                    )}
                    style={{
                      width: NODE,
                      height: NODE,
                      borderRadius: NODE / 2,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: locked ? '#6b6b6b' : ringDark,
                      borderWidth: 2,
                      borderColor: stars >= 3 ? '#ffcf4a' : isCurrent ? '#fff' : 'rgba(255,255,255,0.5)',
                    }}
                  >
                    {/* inner disc */}
                    <View
                      style={{
                        width: NODE - 12,
                        height: NODE - 12,
                        borderRadius: (NODE - 12) / 2,
                        backgroundColor: locked ? '#8a8a8a' : biome.rim,
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {/* top highlight */}
                      <View style={{ position: 'absolute', top: 2, width: NODE - 20, height: (NODE - 12) / 2, borderRadius: NODE, backgroundColor: locked ? 'rgba(255,255,255,0.18)' : ringLight, opacity: 0.5 }} />
                      {locked ? (
                        <Lock color="#ffffffdd" size={22} />
                      ) : (
                        <Text style={{ fontFamily: FONTS.heading, color: biome.onRim, fontSize: 19 }}>{level}</Text>
                      )}
                    </View>
                    {/* mode-icon badge */}
                    {!locked ? (
                      <View
                        style={{
                          position: 'absolute',
                          bottom: -4,
                          right: -4,
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: ringDark,
                          borderWidth: 1.5,
                          borderColor: '#fff',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <ModeIcon color="#fff" size={12} />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                </View>

                {/* Stars earned */}
                {!locked && stars > 0 ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 3 }}>
                    {[1, 2, 3].map((s) => (
                      <Star key={s} size={13} color="#ffcf4a" fill={s <= stars ? '#ffcf4a' : 'transparent'} />
                    ))}
                  </View>
                ) : null}

                {/* Player globe on the current level */}
                {isCurrent ? (
                  <View style={{ position: 'absolute', top: -46, left: NODE / 2 - 19 }} pointerEvents="none">
                    <WorldAvatar config={myAvatar ?? DEFAULT_AVATAR_CONFIG} size={38} animate round />
                  </View>
                ) : null}

                {/* Friends' globes on their level */}
                {nodeFriends.length > 0 ? (
                  <View style={{ position: 'absolute', top: NODE - 6, left: NODE, flexDirection: 'row' }}>
                    {nodeFriends.slice(0, 3).map((f, i) => (
                      <TouchableOpacity
                        key={f.userId}
                        onPress={() => onOpenPlayer?.(f.userId, f.username)}
                        style={{ marginLeft: i === 0 ? 0 : -8 }}
                        {...a11yButton(f.username ?? tr(language, 'Ami', 'Friend'))}
                      >
                        <Avatar
                          config={f.avatarConfig ? normalizeConfig(f.avatarConfig as AvatarConfig) : null}
                          username={f.username}
                          size={26}
                          ringColor={biome.rim}
                          ringWidth={2}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Table view: friends ranking + rewards checklist ────────────────────────────

function StoryTable({
  snapshot, friends, myAvatar, myName, user, language, colors, onOpenPlayer,
}: {
  snapshot: StorySnapshot | null;
  friends: FriendPosition[];
  myAvatar: AvatarConfig | null;
  myName: string | null;
  user: User | null;
  language: 'fr' | 'en';
  colors: ReturnType<typeof getColors>;
  onOpenPlayer?: (userId: string, username?: string | null) => void;
}) {
  const c = colors;
  const myMax = snapshot?.maxLevel ?? 0;
  const { width } = useWindowDimensions();
  const [preview, setPreview] = useState<{ itemId: string; level: number } | null>(null);

  const catLabel = (category: string) =>
    ({
      globe: tr(language, 'Globe', 'Globe'),
      orbit: tr(language, 'Anneau', 'Orbit'),
      cosmos: tr(language, 'Fond cosmique', 'Cosmic backdrop'),
      emblem: tr(language, 'Emblème', 'Emblem'),
      satellite: tr(language, 'Satellite', 'Satellite'),
    } as Record<string, string>)[category] ?? category;

  // Friends + self, ranked by highest cleared level.
  const ranking = useMemo(() => {
    const rows = friends.map((f) => ({
      id: f.userId,
      name: f.username ?? tr(language, 'Ami', 'Friend'),
      config: f.avatarConfig ? normalizeConfig(f.avatarConfig as AvatarConfig) : null,
      maxLevel: f.maxLevel,
      isMe: false,
    }));
    rows.push({
      id: user?.id ?? 'me',
      name: myName ?? tr(language, 'Vous', 'You'),
      config: myAvatar,
      maxLevel: myMax,
      isMe: true,
    });
    return rows.sort((a, b) => b.maxLevel - a.maxLevel);
  }, [friends, myAvatar, myName, myMax, user, language]);

  const rewards = STORY_COSMETIC_UNLOCKS;

  const previewPart = preview ? getPartById(preview.itemId) : undefined;
  const previewOwned = preview ? myMax >= preview.level : false;

  return (
    <>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      {/* ── Friends ranking ── */}
      <Text style={{ fontFamily: FONTS.heading, color: c.text, fontSize: 16, marginBottom: 10 }}>
        {tr(language, 'Progression des amis', 'Friends’ progress')}
      </Text>
      <View style={{ backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
        {ranking.map((r, i) => (
          <TouchableOpacity
            key={r.id}
            disabled={r.isMe || !onOpenPlayer}
            onPress={() => !r.isMe && onOpenPlayer?.(r.id, r.name)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: c.border,
              backgroundColor: r.isMe ? (c.accent + '22') : 'transparent',
            }}
            {...a11yButton(`${r.name}, ${tr(language, 'niveau', 'level')} ${r.maxLevel}`)}
          >
            <Text style={{ fontFamily: FONTS.mono, fontSize: 13, color: c.textMuted, width: 22 }}>{i + 1}</Text>
            <Avatar config={r.config} username={r.name} size={34} ringColor={r.isMe ? c.accent : c.border} ringWidth={2} />
            <Text style={{ fontFamily: FONTS.heading, color: c.text, fontSize: 14, flex: 1 }} numberOfLines={1}>
              {r.name}{r.isMe ? tr(language, ' (vous)', ' (you)') : ''}
            </Text>
            <View style={{ backgroundColor: c.surface, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 }}>
              <Text style={{ fontFamily: FONTS.mono, fontSize: 12, color: c.text }}>
                {r.maxLevel > 0 ? tr(language, `Niv ${r.maxLevel}`, `Lvl ${r.maxLevel}`) : tr(language, '—', '—')}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Rewards checklist ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 10 }}>
        <Gift color={c.text} size={17} />
        <Text style={{ fontFamily: FONTS.heading, color: c.text, fontSize: 16 }}>
          {tr(language, 'Récompenses exclusives', 'Exclusive rewards')}
        </Text>
      </View>
      <View style={{ backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
        {rewards.map((u, i) => {
          const part = getPartById(u.itemId);
          if (!part) return null;
          const owned = myMax >= u.level;
          const name = language === 'fr' ? part.nameFr : part.nameEn;
          return (
            <TouchableOpacity
              key={u.itemId}
              activeOpacity={0.7}
              onPress={() => setPreview({ itemId: u.itemId, level: u.level })}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: c.border,
                opacity: owned ? 1 : 0.85,
              }}
              {...a11yButton(
                `${name}, ${catLabel(part.category)}, ${tr(language, `niveau ${u.level}`, `level ${u.level}`)}`,
                { hint: tr(language, 'Voir l’aperçu', 'See preview') },
              )}
            >
              <WorldAvatar config={rewardConfig(u.itemId)} size={40} round />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.heading, color: c.text, fontSize: 14 }} numberOfLines={1}>{name}</Text>
                <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 11 }}>
                  {catLabel(part.category)} · {tr(language, `Niveau ${u.level}`, `Level ${u.level}`)}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: owned ? '#2a6e3f22' : c.surface,
                  borderRadius: 999,
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                }}
              >
                {owned ? (
                  <Star color="#2a6e3f" size={12} fill="#2a6e3f" />
                ) : (
                  <Lock color={c.textMuted} size={12} />
                )}
                <Text style={{ fontFamily: FONTS.mono, fontSize: 11, color: owned ? '#2a6e3f' : c.textMuted }}>
                  {owned ? tr(language, 'Débloqué', 'Unlocked') : tr(language, `Niv ${u.level}`, `Lvl ${u.level}`)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>

    {/* Reward preview modal */}
    <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
      <Pressable
        onPress={() => setPreview(null)}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: Math.min(width - 48, 340),
            backgroundColor: c.card,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#ffcf4a',
            padding: 22,
            alignItems: 'center',
          }}
        >
          <TouchableOpacity
            onPress={() => setPreview(null)}
            hitSlop={ICON_HIT_SLOP}
            style={{ position: 'absolute', top: 12, right: 12, zIndex: 2 }}
            {...a11yButton(tr(language, 'Fermer', 'Close'))}
          >
            <X color={c.textMuted} size={22} />
          </TouchableOpacity>

          {preview && previewPart ? (
            <>
              <View style={{ marginTop: 6, marginBottom: 14 }}>
                <WorldAvatar config={rewardConfig(preview.itemId)} size={Math.min(width * 0.5, 190)} animate round />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Gift color="#e0a93a" size={15} />
                <Text style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#c98a1a', letterSpacing: 1 }}>
                  {tr(language, 'EXCLUSIF · MODE HISTOIRE', 'EXCLUSIVE · STORY MODE')}
                </Text>
              </View>
              <Text style={{ fontFamily: FONTS.heading, fontSize: 20, color: c.text, textAlign: 'center' }}>
                {language === 'fr' ? previewPart.nameFr : previewPart.nameEn}
              </Text>
              <Text style={{ fontFamily: FONTS.mono, fontSize: 12, color: c.textMuted, marginTop: 3 }}>
                {catLabel(previewPart.category)} · {tr(language, `Niveau ${preview.level}`, `Level ${preview.level}`)}
              </Text>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 14,
                  backgroundColor: previewOwned ? '#2a6e3f22' : c.surface,
                  borderRadius: 999,
                  paddingVertical: 6,
                  paddingHorizontal: 14,
                }}
              >
                {previewOwned ? <Star color="#2a6e3f" size={14} fill="#2a6e3f" /> : <Lock color={c.textMuted} size={14} />}
                <Text style={{ fontFamily: FONTS.mono, fontSize: 12, color: previewOwned ? '#2a6e3f' : c.textMuted }}>
                  {previewOwned
                    ? tr(language, 'Débloqué — équipe-le dans ton avatar', 'Unlocked — equip it on your avatar')
                    : tr(language, `À gagner au niveau ${preview.level}`, `Earn it at level ${preview.level}`)}
                </Text>
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}

// ── Reward marker ──────────────────────────────────────────────────────────────

function RewardMarker({
  itemId, level, side, language, dim, textColor, cardBg,
}: {
  itemId: string;
  level: number;
  side: number;
  language: 'fr' | 'en';
  dim: boolean;
  textColor: string;
  cardBg: string;
}) {
  const part = getPartById(itemId);
  const cfg = useMemo(() => rewardConfig(itemId), [itemId]);
  if (!part) return null;
  const name = language === 'fr' ? part.nameFr : part.nameEn;
  // Card floats to the side of the river, clear of the medallion.
  const dx = side < 0 ? -(NODE / 2 + 118) : NODE + 10;
  return (
    <View
      style={{
        position: 'absolute',
        top: NODE / 2 - 26,
        left: dx,
        width: 116,
        opacity: dim ? 0.6 : 1,
        alignItems: 'center',
        backgroundColor: cardBg,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#ffcf4a',
        paddingVertical: 6,
        paddingHorizontal: 6,
        flexDirection: 'row',
        gap: 6,
      }}
      pointerEvents="none"
    >
      <WorldAvatar config={cfg} size={40} round />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONTS.mono, fontSize: 8.5, color: '#c98a1a', letterSpacing: 0.5 }}>
          {tr(language, `NIV ${level} · À GAGNER`, `LVL ${level} · REWARD`)}
        </Text>
        <Text style={{ fontFamily: FONTS.heading, fontSize: 11, color: textColor }} numberOfLines={2}>
          {name}
        </Text>
      </View>
    </View>
  );
}

// ── Background art helpers ──────────────────────────────────────────────────────

/** Far relief silhouette for depth, drawn low in the band. */
function drawFeature(biome: Biome, top: number, bottom: number, width: number, rng: () => number): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const base = bottom - 10;
  const col = biome.featureColor;
  const k = `f_${top.toFixed(0)}`;
  const jitter = rng();
  switch (biome.feature) {
    case 'hills':
      for (let i = 0; i < 3; i++) {
        const cx = width * (0.15 + 0.35 * i) + jitter * 40;
        out.push(<Ellipse key={`${k}h${i}`} cx={cx} cy={base} rx={90 + rng() * 40} ry={70 + rng() * 20} fill={col} opacity={0.28} />);
      }
      break;
    case 'mountains':
    case 'canopy':
      for (let i = 0; i < 4; i++) {
        const mx = width * (0.1 + 0.26 * i) + jitter * 30;
        const h = 90 + rng() * 70;
        if (biome.feature === 'canopy') {
          out.push(<Ellipse key={`${k}c${i}`} cx={mx} cy={top + 40 + rng() * 30} rx={50 + rng() * 24} ry={34 + rng() * 14} fill={col} opacity={0.3} />);
        } else {
          out.push(<Polygon key={`${k}m${i}`} points={`${mx - 70},${base} ${mx},${base - h} ${mx + 70},${base}`} fill={col} opacity={0.3} />);
          out.push(<Polygon key={`${k}ms${i}`} points={`${mx - 22},${base - h + 22} ${mx},${base - h} ${mx + 22},${base - h + 22}`} fill="#ffffff" opacity={0.35} />);
        }
      }
      break;
    case 'volcano': {
      const vx = width * (0.28 + jitter * 0.4);
      const h = 150;
      out.push(<Polygon key={`${k}v`} points={`${vx - 90},${base} ${vx - 26},${base - h} ${vx + 26},${base - h} ${vx + 90},${base}`} fill={col} opacity={0.55} />);
      out.push(<Path key={`${k}vl`} d={`M${vx - 20},${base - h} q 20 30 40 0`} stroke="#ff7a2a" strokeWidth={4} fill="none" opacity={0.7} />);
      out.push(<Circle key={`${k}vg`} cx={vx} cy={base - h} r={16} fill="#ffb04a" opacity={0.4} />);
      break;
    }
    case 'iceberg':
      for (let i = 0; i < 3; i++) {
        const ix = width * (0.2 + 0.3 * i) + jitter * 30;
        out.push(<Polygon key={`${k}i${i}`} points={`${ix - 60},${base} ${ix - 20},${base - 80 - rng() * 30} ${ix + 24},${base - 60} ${ix + 62},${base}`} fill={col} opacity={0.5} />);
      }
      break;
    case 'island':
      for (let i = 0; i < 3; i++) {
        const ix = width * (0.18 + 0.32 * i) + jitter * 20;
        out.push(<Ellipse key={`${k}is${i}`} cx={ix} cy={base} rx={54 + rng() * 26} ry={20} fill={col} opacity={0.5} />);
      }
      break;
    case 'dunes':
      for (let i = 0; i < 3; i++) {
        out.push(<Ellipse key={`${k}d${i}`} cx={width * (0.2 + 0.3 * i)} cy={base + 20} rx={130} ry={60 + rng() * 20} fill={col} opacity={0.22} />);
      }
      break;
    case 'starfield':
      for (let i = 0; i < 40; i++) {
        out.push(<Circle key={`${k}s${i}`} cx={rng() * width} cy={top + rng() * (bottom - top)} r={rng() * 1.3 + 0.3} fill="#ffffff" opacity={0.3 + rng() * 0.5} />);
      }
      out.push(<Ellipse key={`${k}neb`} cx={width * (0.3 + jitter * 0.4)} cy={top + (bottom - top) * 0.4} rx={120} ry={70} fill={col} opacity={0.3} />);
      break;
  }
  return out;
}

/** Scattered small props between the banks, kept off the river. */
function drawScatter(
  biome: Biome, top: number, bottom: number, width: number, riverX: (y: number) => number, rng: () => number,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const count = 16 + Math.floor(rng() * 10);
  for (let i = 0; i < count; i++) {
    const y = top + rng() * (bottom - top);
    const rx = riverX(y);
    const side = rng() < 0.5 ? -1 : 1;
    const x = rx + side * (46 + rng() * (width / 2 - 62));
    if (x < 10 || x > width - 10) continue;
    const kind = biome.decor[Math.floor(rng() * biome.decor.length)];
    const s = 0.8 + rng() * 0.8;
    out.push(<G key={`s_${top.toFixed(0)}_${i}`}>{drawDecor(kind, x, y, s, rng)}</G>);
  }
  return out;
}

function drawDecor(kind: BiomeDecor, x: number, y: number, s: number, rng: () => number): React.ReactNode {
  switch (kind) {
    case 'grass':
      return <Path d={`M${x} ${y} q ${-3 * s} ${-11 * s} ${-6 * s} ${-13 * s} q ${5 * s} ${2 * s} ${6 * s} ${10 * s} q ${1 * s} ${-8 * s} ${6 * s} ${-10 * s} q ${-3 * s} ${3 * s} ${-6 * s} ${13 * s} z`} fill="#3a6a28" opacity={0.55} />;
    case 'flower':
      return (
        <>
          {[0, 72, 144, 216, 288].map((a) => {
            const r = (a * Math.PI) / 180;
            return <Circle key={a} cx={x + Math.cos(r) * 3 * s} cy={y + Math.sin(r) * 3 * s} r={2 * s} fill={rng() < 0.5 ? '#ff6a8a' : '#ffd23a'} opacity={0.9} />;
          })}
          <Circle cx={x} cy={y} r={1.6 * s} fill="#7a3a10" />
        </>
      );
    case 'tree':
      return (
        <>
          <Rect x={x - 1.5 * s} y={y} width={3 * s} height={9 * s} fill="#5a3a1a" />
          <Circle cx={x} cy={y - 4 * s} r={8 * s} fill="#2e6e2a" opacity={0.9} />
          <Circle cx={x - 4 * s} cy={y - 1 * s} r={5 * s} fill="#357a2f" opacity={0.9} />
        </>
      );
    case 'pine':
      return (
        <>
          <Rect x={x - 1 * s} y={y + 4 * s} width={2 * s} height={5 * s} fill="#5a3a1a" />
          <Polygon points={`${x},${y - 12 * s} ${x - 7 * s},${y + 5 * s} ${x + 7 * s},${y + 5 * s}`} fill="#2f6a3a" opacity={0.92} />
          <Polygon points={`${x},${y - 6 * s} ${x - 6 * s},${y + 1 * s} ${x + 6 * s},${y + 1 * s}`} fill="#3a7a44" opacity={0.92} />
        </>
      );
    case 'palm':
      return (
        <>
          <Path d={`M${x} ${y + 10 * s} q ${2 * s} ${-8 * s} ${0} ${-12 * s}`} stroke="#7a5a2a" strokeWidth={2 * s} fill="none" />
          {[-1, 0, 1].map((d) => (
            <Path key={d} d={`M${x} ${y - 2 * s} q ${d * 10 * s} ${-4 * s} ${d * 14 * s} ${2 * s}`} stroke="#2e8a4a" strokeWidth={2 * s} fill="none" />
          ))}
        </>
      );
    case 'acacia':
      return (
        <>
          <Rect x={x - 1 * s} y={y} width={2 * s} height={9 * s} fill="#6a4a24" />
          <Ellipse cx={x} cy={y - 2 * s} rx={12 * s} ry={4 * s} fill="#3f6a2a" opacity={0.9} />
        </>
      );
    case 'cactus':
      return (
        <>
          <Rect x={x - 2 * s} y={y - 8 * s} width={4 * s} height={16 * s} rx={2 * s} fill="#2f7a3a" />
          <Rect x={x + 1 * s} y={y - 4 * s} width={5 * s} height={2.4 * s} rx={1.2 * s} fill="#2f7a3a" />
          <Rect x={x + 5 * s} y={y - 8 * s} width={2.4 * s} height={5 * s} rx={1.2 * s} fill="#2f7a3a" />
        </>
      );
    case 'rock':
      return <Ellipse cx={x} cy={y} rx={6 * s} ry={4 * s} fill="#7a7268" opacity={0.75} />;
    case 'ember':
      return <Circle cx={x} cy={y} r={(1.4 + rng() * 1.8) * s} fill="#ff8a3a" opacity={0.5 + rng() * 0.4} />;
    case 'snow':
      return <Circle cx={x} cy={y} r={(1.2 + rng() * 1.4) * s} fill="#ffffff" opacity={0.9} />;
    case 'crystal':
      return <Polygon points={`${x},${y - 6 * s} ${x + 3 * s},${y} ${x},${y + 6 * s} ${x - 3 * s},${y}`} fill="#cfe9f7" opacity={0.85} stroke="#8fc3e6" strokeWidth={0.6} />;
    case 'wave':
      return <Path d={`M${x - 12 * s} ${y} q ${6 * s} ${-5 * s} ${12 * s} 0 q ${6 * s} ${5 * s} ${12 * s} 0`} stroke="#ffffff" strokeWidth={1.6} fill="none" opacity={0.45} />;
    case 'cloud':
      return (
        <G opacity={0.75}>
          <Ellipse cx={x} cy={y} rx={12 * s} ry={6 * s} fill="#ffffff" />
          <Ellipse cx={x + 9 * s} cy={y + 1 * s} rx={8 * s} ry={5 * s} fill="#ffffff" />
          <Ellipse cx={x - 9 * s} cy={y + 1 * s} rx={7 * s} ry={4 * s} fill="#ffffff" />
        </G>
      );
    case 'star':
      return <Circle cx={x} cy={y} r={1.2 * s} fill="#ffffff" opacity={0.5 + rng() * 0.5} />;
    case 'comet':
      return (
        <G opacity={0.8}>
          <Path d={`M${x} ${y} l ${10 * s} ${-6 * s}`} stroke="#9ab8ff" strokeWidth={1.4} />
          <Circle cx={x} cy={y} r={1.8 * s} fill="#dfe8ff" />
        </G>
      );
    case 'fern':
      return (
        <G opacity={0.7} stroke="#2f6a2a" strokeWidth={1.2} fill="none">
          {[-1, 0, 1].map((d) => (
            <Path key={d} d={`M${x} ${y + 6 * s} q ${d * 6 * s} ${-6 * s} ${d * 8 * s} ${-12 * s}`} />
          ))}
        </G>
      );
  }
}
