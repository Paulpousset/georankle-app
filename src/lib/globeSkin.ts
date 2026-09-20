/**
 * Shop globe cosmetics → gameplay globes ("mon globe de la boutique aussi en jeu").
 *
 * The `globe` slot of the shop sells 20 planet skins (src/data/cosmetics.ts) that
 * until now only ever showed up on the avatar. Each one already ships a whole
 * Blender rig — equirect texture, shared continent-relief GLB and its own props
 * (volcanoes, ice crystals, crown) — so the gameplay globes can wear the exact
 * planet the player bought, with no new art:
 *
 *  - 3D renderer (buildEarthHtml): the same assembly <AvatarPreview3D> uses in
 *    the shop, down to the rig's lights, toon ramp and tone mapping. The texture
 *    already draws every country border, so the overlay paints NOTHING over it
 *    and a round looks like the shop preview. Only Mars (bare crust, no
 *    landmasses) and Eclipse (black on black) get a legibility coat — countries
 *    must stay readable on every skin, that is the whole game.
 *  - 2D fallback (canvas orthographic globes): a canvas globe can't sample an
 *    equirect map, so there the skin only re-colours the MapPalette slots
 *    (ocean / land / graticule / atmosphere). The gameplay state colours
 *    (hover / selected / correct / wrong) are NEVER skinned.
 *
 * Resolution order (`resolveSkinKey`): the local test override wins, then the
 * equipped globe if the player turned the option on, else null = the stock theme
 * look. All three prefs are device-local (AsyncStorage) — no new server state,
 * so a skin can never block or desync a round.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { GLOBE_STYLES } from '../components/WorldAvatar';
import { getCategoryParts, getPart, normalizeConfig } from '../data/cosmetics';
import { COSMETIC_LAYERS } from '../data/cosmeticLayers.gen';
import { COSMETIC_MODELS, GLOBE_TEXTURES } from '../data/cosmeticModels.gen';
import type { MapPalette } from '../theme/mapPalette';
import type { AvatarConfig, CosmeticPart } from '../types';
import { moduleToWebViewUri } from './globe3d/textureLoader';
import { supabase } from './supabase';

/** Every globe cosmetic, catalog order (the "Globes en jeu" grid renders these). */
export const GLOBE_PARTS: CosmeticPart[] = getCategoryParts('globe');

/** The style key a globe cosmetic renders as (join key into GLOBE_STYLES). */
export function partStyleKey(part: CosmeticPart): string {
  return part.globeStyle ?? 'classic';
}

/** Style key of the globe equipped in a config, falling back to the free classic. */
export function globeStyleKey(config: AvatarConfig | null | undefined): string {
  const id = config?.layers?.globe?.id;
  const key = (id ? getPart('globe', id) : undefined)?.globeStyle ?? 'classic';
  return GLOBE_STYLES[key] ? key : 'classic';
}

/** Whether a style can be worn in game at all (needs a style table + a texture). */
export function isSkinnable(key: string): boolean {
  return !!GLOBE_STYLES[key];
}

// ── Colour helpers ───────────────────────────────────────────────────────────

function toRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Perceived luminance, 0 (black) → 1 (white). */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function isDarkColor(hex: string): boolean {
  return luminance(hex) < 0.45;
}

// ── 3D skin descriptor (injected into the WebView payload) ───────────────────

export interface GameGlobeSkin {
  key: string;
  /** Equirect skin texture as a URI the WebView can load (data URL on native). */
  texture: string;
  /**
   * The Blender rig, exactly what <AvatarPreview3D> puts on its sphere: the
   * shared 3D continent relief GLB and the style's own props (volcanoes, ice
   * crystals, crown…). Null when the style has no relief (Mars, Terre-Galaxie
   * have no continents) or no props.
   */
  landModel: string | null;
  propsModel: string | null;
  /** Ink colour of the relief's outline shell, per style (rig's LAND_INK). */
  landInk: string;
  /** Dark styles are self-lit in the rig: unlit material, no toon banding. */
  unlit: boolean;
  /** Sphere tint shown under/around the texture, and the page background tone. */
  ocean: string;
  oceanDeep: string;
  /** Fresnel atmosphere colour — null means this skin has no halo. */
  atmo: string | null;
  atmoStrength: number;
  /** Country outline colour, picked to stay readable against this skin. */
  line: string;
  /** Halo painted under the outline so it reads over a busy texture too. */
  halo: string;
  /**
   * Colour of the crisp 3D border lines that fade in as the player zooms: the
   * equirect texture goes soft past ~4×, these keep the countries sharp. Plain
   * hex — it feeds a three.js material, not a canvas.
   */
  crispLine: string;
  /**
   * Graticule, drawn even where the land coat is forbidden (Borders): without
   * it a dark skin turns that globe into a featureless black panel.
   */
  grat: string;
  /**
   * Legibility coat drawn over the planet, and how much of one it needs:
   *   'none'    — the pack texture already draws every country border legibly
   *               (17 of 20 skins). Nothing is painted, so a round looks exactly
   *               like the shop preview.
   *   'outline' — Eclipse: continents are there but almost invisible.
   *   'fill'    — Mars: the texture is bare crust, no landmasses at all.
   */
  coat: 'none' | 'outline' | 'fill';
  /** Translucent land tint, only used by the 'fill' coat. */
  landCoat: string | null;
  /** Decorative cloud layer (menu globe only — clouds would hide the answer). */
  clouds: boolean;
  stars: boolean;
  /**
   * The rest of the equipped world, so a round shows the same sky as the profile:
   * the cosmos backdrop texture (scene background) and the orbiting satellite —
   * its GLB plus its id, which the page needs for the rig's per-model scale and
   * flight behaviour. Both null when nothing is equipped in that slot.
   */
  cosmos: string | null;
  satellite: { id: string; model: string } | null;
}

/** The rig's NO_RELIEF: no continents modelled, so no relief GLB to raise. */
const NO_RELIEF_SKINS = new Set(['mars', 'st_galaxy']);

/**
 * The only two skins the pack texture does not leave playable on its own.
 * Everything else is left untouched so a round looks exactly like the shop.
 */
const COATS: Record<string, 'outline' | 'fill'> = {
  // Bare Martian crust: no landmasses at all, so land also needs a tint.
  mars: 'fill',
  // Continents are there but nearly black-on-black.
  eclipse: 'outline',
};

/**
 * Rig tables, mirrored from buildAvatarHtml so the gameplay globe and the shop
 * preview are the same planet. Keep in sync with GLOBE_DARK / LAND_INK there.
 */
const UNLIT_SKINS = new Set([
  'night', 'lava', 'eclipse', 'biolum', 'hologram', 'cyber', 'st_galaxy', 'st_fractured',
]);

const LAND_INK: Record<string, string> = {
  classic: '#202f2d', satellite: '#19292a', gaia: '#1b312c', pastel: '#33303f',
  political: '#253037', vintage: '#2c2b2f', gold: '#302d28', night: '#11192d', ice: '#333846',
  lava: '#12131f', blueprint: '#111c35', cyber: '#0e1323', hologram: '#0e1727', biolum: '#0e1823',
  eclipse: '#0e1221', relief: '#2b2a2e', st_fractured: '#11182b', st_crowned: '#302d28',
};

/** Build the 3D descriptor for a style key, given its resolved rig asset URIs. */
export function buildGameGlobeSkin(
  key: string,
  texture: string,
  rig: {
    landModel?: string | null;
    propsModel?: string | null;
    cosmos?: string | null;
    satellite?: { id: string; model: string } | null;
  } = {},
): GameGlobeSkin {
  const gs = GLOBE_STYLES[key] ?? GLOBE_STYLES.classic;
  const [lit, mid, deep] = gs.ocean;
  const dark = isDarkColor(mid);
  // Contrast-checked outlines: light lines on a dark planet, dark on a bright
  // one. Never the style's own stroke colour — eclipse's is #1a1a26 on near
  // black, which would make the map unplayable.
  const line = dark ? 'rgba(255,255,255,0.62)' : 'rgba(24,22,32,0.55)';
  const halo = dark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.60)';
  return {
    key,
    texture,
    // No continents in the texture → nothing to raise in relief either.
    landModel: NO_RELIEF_SKINS.has(key) ? null : (rig.landModel ?? null),
    propsModel: rig.propsModel ?? null,
    landInk: LAND_INK[key] ?? '#1c2438',
    unlit: UNLIT_SKINS.has(key),
    cosmos: rig.cosmos ?? null,
    satellite: rig.satellite ?? null,
    ocean: mid,
    oceanDeep: deep,
    atmo: gs.atmo ?? null,
    atmoStrength: gs.atmo ? (dark ? 1.15 : 0.7) : 0,
    line,
    halo,
    crispLine: dark ? '#ffffff' : '#1a1824',
    grat: dark ? 'rgba(255,255,255,0.16)' : 'rgba(24,22,32,0.14)',
    coat: COATS[key] ?? 'none',
    landCoat: COATS[key] === 'fill' ? rgba(gs.land === 'none' ? lit : gs.land, 0.3) : null,
    clouds: !!gs.clouds,
    stars: isDarkColor(deep),
  };
}

// ── 2D fallback: re-colour the map palette ───────────────────────────────────

/**
 * A MapPalette wearing the skin's planet colours. Only the "scenery" slots are
 * touched: hov/sel/ok/bad stay exactly as the theme defines them so a skin can
 * never make a correct/wrong answer ambiguous.
 */
export function skinMapPalette(pal: MapPalette, key: string | null): MapPalette {
  const gs = key ? GLOBE_STYLES[key] : null;
  if (!gs) return pal;
  const [lit, mid, deep] = gs.ocean;
  const dark = isDarkColor(mid);
  const landless = gs.land === 'none';
  const [lr, lg, lb] = toRgb(dark ? '#ffffff' : '#181620');
  return {
    ...pal,
    bg: deep,
    ocean0: lit,
    ocean1: deep,
    grat: rgba(gs.grat, dark ? 0.28 : 0.22),
    landF: landless ? rgba(mid, 0.35) : rgba(gs.land, 0.85),
    landS: dark ? 'rgba(255,255,255,0.55)' : 'rgba(24,22,32,0.5)',
    dot: `rgba(${lr},${lg},${lb},`,
    rim: dark ? rgba('#ffffff', 0.35) : rgba('#181620', 0.4),
    atm: gs.atmo ? rgba(gs.atmo, 0.14) : null,
    atmEnd: gs.atmo ? rgba(gs.atmo, 0) : null,
  };
}

// ── Device-local preferences ─────────────────────────────────────────────────

const K_OVERRIDE = 'gameGlobe:override';
const K_CONFIG = 'gameGlobe:config';
const K_RENDERER = 'gameGlobe:renderer';

/**
 * How the board is drawn: the 3D world (WebGL, the worn globe with its relief)
 * or the basic flat globe (Canvas-2D, the skin's colours only). A visible
 * switch in every globe game (Paul, 20/09/2026) — device-local, like the pick.
 */
export type GlobeRenderer = '3d' | 'basic';

export async function loadGameGlobeRenderer(): Promise<GlobeRenderer> {
  try {
    return (await AsyncStorage.getItem(K_RENDERER)) === 'basic' ? 'basic' : '3d';
  } catch {
    return '3d';
  }
}

export async function setGameGlobeRenderer(r: GlobeRenderer): Promise<void> {
  await AsyncStorage.setItem(K_RENDERER, r).catch(() => {});
}

/**
 * Paul, 19/09/2026: the games ALWAYS wear a shop globe — the free classic Earth
 * at the very least. The old "theme globe, no cosmetic" opt-out is gone (its
 * `gameGlobe:enabled` key is simply ignored now): a globe you bought is meant
 * to be seen where you play, and the classic one is the default for everyone.
 */
export interface GameGlobePref {
  /** In-game / "Globes en jeu" pick — wins over the equipped globe. */
  override: string | null;
  /**
   * Last known equipped avatar config. The whole thing, not just the globe: the
   * cosmos backdrop and the orbiting satellite come from it too, and a game must
   * never wait on the network to know what the player is wearing.
   */
  config: AvatarConfig | null;
  /** Equipped globe style, derived from `config`. */
  equipped: string;
}

export const DEFAULT_GAME_GLOBE_PREF: GameGlobePref = {
  override: null,
  config: null,
  equipped: 'classic',
};

export async function loadGameGlobePref(): Promise<GameGlobePref> {
  try {
    const rows = await AsyncStorage.multiGet([K_OVERRIDE, K_CONFIG]);
    const map = Object.fromEntries(rows) as Record<string, string | null>;
    const override = map[K_OVERRIDE];
    let config: AvatarConfig | null = null;
    if (map[K_CONFIG]) {
      try {
        config = normalizeConfig(JSON.parse(map[K_CONFIG]) as AvatarConfig);
      } catch {
        config = null;
      }
    }
    return {
      override: override && isSkinnable(override) ? override : null,
      config,
      equipped: globeStyleKey(config),
    };
  } catch {
    return DEFAULT_GAME_GLOBE_PREF;
  }
}

/** Pick a style to wear in game regardless of ownership (null = back to equipped). */
export async function setGameGlobeOverride(key: string | null): Promise<void> {
  if (key && isSkinnable(key)) await AsyncStorage.setItem(K_OVERRIDE, key).catch(() => {});
  else await AsyncStorage.removeItem(K_OVERRIDE).catch(() => {});
}

/**
 * Apply an in-game globe pick. `null` clears the pick (back to the equipped
 * globe); picking the globe already equipped clears the override instead of
 * pinning it, so a later equip in the shop still follows through.
 */
export async function chooseGameGlobe(key: string | null, pref: GameGlobePref): Promise<void> {
  await setGameGlobeOverride(key === null || key === pref.equipped ? null : key);
}

/** Warm the equipped-world cache from a freshly loaded/saved avatar config. */
export async function cacheEquippedGlobe(config: AvatarConfig | null | undefined): Promise<void> {
  if (!config) return;
  await AsyncStorage.setItem(K_CONFIG, JSON.stringify(normalizeConfig(config))).catch(() => {});
}

/** Which style the games wear: the in-game pick, else the equipped globe
 *  (the free classic Earth when nothing is known). Never null. */
export function resolveSkinKey(pref: GameGlobePref): string {
  return pref.override ?? pref.equipped;
}

/** Once per session: the shop/editor write the cache directly whenever it changes. */
let refreshedThisSession = false;

/** Refresh the equipped cache from the server (fire-and-forget, never awaited by a game). */
async function refreshEquippedCache(): Promise<void> {
  if (refreshedThisSession) return;
  refreshedThisSession = true;
  try {
    const { data } = await supabase.auth.getUser();
    const id = data.user?.id;
    if (!id) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_config')
      .eq('id', id)
      .single();
    if (profile?.avatar_config) {
      await cacheEquippedGlobe(profile.avatar_config as unknown as AvatarConfig);
    }
  } catch {
    /* offline / logged out — the cached key stays in charge */
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface GameGlobeReady {
  status: 'ready';
  /** Worn globe style, or null for the classic theme globe (no cosmetic). */
  key: string | null;
  skin: GameGlobeSkin | null;
  /**
   * three.js source when the WebGL builder should be used, null for the legacy
   * Canvas-2D one. A worn globe always brings WebGL — it is a texture and a
   * relief, which a canvas cannot draw.
   */
  threeSrc: string | null;
}

export type GameGlobeSkinState = { status: 'pending' } | GameGlobeReady;

/**
 * Longest a caller may sit on `pending` (= an empty globe box), then it expires
 * onto the stock look. Generous with the rig: on native the ~1.2 MB relief GLB
 * is read off disk and base64-encoded (once per session — the URIs are cached).
 */
const RESOLVE_TIMEOUT_MS = 2500;
const RESOLVE_TIMEOUT_RIG_MS = 8000;

/**
 * Everything a gameplay globe needs to mount: the worn planet (with its cosmos
 * and satellite) AND the renderer that can draw it. Resolved together, once,
 * BEFORE the WebView mounts — the page must never hot-swap mid-round, which
 * would reload the frame and lose the round's state.
 *
 * `choose()` is the in-game picker: it persists the pick and re-resolves, so the
 * caller gets a fresh page. Fails closed onto the classic theme globe.
 */
export function useGameGlobeSkin(
  opts: { withRig?: boolean } = {},
): GameGlobeSkinState & {
  choose: (key: string | null) => void;
  /** The board renderer in use, and the in-game switch (re-resolves the page). */
  renderer: GlobeRenderer;
  setRenderer: (r: GlobeRenderer) => void;
} {
  const withRig = opts.withRig !== false;
  const [state, setState] = useState<GameGlobeSkinState>({ status: 'pending' });
  const [renderer, setRendererState] = useState<GlobeRenderer>('3d');
  // Bumped by choose()/setRenderer(): re-runs the whole resolution.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    let settled = false;
    const settle = (next: GameGlobeSkinState) => {
      if (settled || !alive) return;
      settled = true;
      setState(next);
    };
    const bare: GameGlobeReady = { status: 'ready', key: null, skin: null, threeSrc: null };
    const timer = setTimeout(
      () => settle(bare),
      withRig ? RESOLVE_TIMEOUT_RIG_MS : RESOLVE_TIMEOUT_MS,
    );
    (async () => {
      try {
        const [pref, reduceMotion, wanted] = await Promise.all([
          loadGameGlobePref(),
          AccessibilityInfo.isReduceMotionEnabled().catch(() => false),
          loadGameGlobeRenderer(),
        ]);
        if (alive) setRendererState(wanted);
        const key = resolveSkinKey(pref);
        // Reduce-motion and the « basic » switch keep the proven flat renderer;
        // the skin then degrades to its palette alone (see skinMapPalette),
        // which is still its colours.
        if (reduceMotion || wanted === 'basic') {
          settle({ status: 'ready', key, skin: null, threeSrc: null });
          return;
        }
        // A worn globe always brings WebGL (it is a texture and a relief, which
        // a canvas cannot draw) — and a globe is always worn now, so the
        // `globe_3d` flag no longer gates the games; reduce-motion above is
        // the only way back to the flat renderer.
        const [skin, three] = await Promise.all([
          loadSkinForKey(key, { withRig, config: pref.config }),
          import('../vendor/threeSource'),
        ]);
        settle({
          status: 'ready',
          key: skin ? key : null,
          skin,
          threeSrc: three.THREE_SRC,
        });
      } catch {
        settle(bare);
      } finally {
        clearTimeout(timer);
      }
    })();
    // Keep the cache fresh for the NEXT game (never for this one — swapping the
    // world under a running round would reload the WebView).
    void refreshEquippedCache();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [withRig, nonce]);

  const choose = useCallback((key: string | null) => {
    (async () => {
      const pref = await loadGameGlobePref();
      await chooseGameGlobe(key, pref);
      setState({ status: 'pending' });
      setNonce((n) => n + 1);
    })();
  }, []);

  const setRenderer = useCallback((r: GlobeRenderer) => {
    setRendererState(r);
    (async () => {
      await setGameGlobeRenderer(r);
      setState({ status: 'pending' });
      setNonce((n) => n + 1);
    })();
  }, []);

  return { ...state, choose, renderer, setRenderer };
}

/**
 * Resolve the whole worn world into WebView-loadable URIs: the globe's rig
 * (equirect texture + shared continent relief) plus the cosmos backdrop and the
 * orbiting satellite taken from `config`.
 *
 * `withRig: false` keeps just the texture and sky: Borders may not draw the
 * continents at all (anti-cheat), and the ~1.2 MB relief GLB would be pure
 * payload there. `withProps` adds the style's props GLB (volcanoes, ice
 * blocks, crown…) — decorative surfaces only (menu): on a board they stand in
 * front of the countries the player has to see and tap (Paul, 19/09/2026).
 */
export async function loadSkinForKey(
  key: string | null,
  { withRig = true, withProps = false, config = null }:
    { withRig?: boolean; withProps?: boolean; config?: AvatarConfig | null } = {},
): Promise<GameGlobeSkin | null> {
  if (!key) return null;
  const texMod = GLOBE_TEXTURES[key];
  if (!texMod) return null;
  const uri = (mod: number | undefined) =>
    mod ? moduleToWebViewUri(mod).catch(() => null) : Promise.resolve(null);
  try {
    // cosmos_bluenight is the free procedural backdrop — it ships no texture, so
    // the globe simply keeps the theme background under it.
    const cosmosId = config?.layers?.cosmos?.id;
    const satId = config?.layers?.satellite?.id;
    const [texture, landModel, propsModel, cosmos, satModel] = await Promise.all([
      moduleToWebViewUri(texMod),
      uri(withRig ? COSMETIC_MODELS.globe_land : undefined),
      uri(withRig && withProps ? COSMETIC_MODELS[`globe_${key}_props`] : undefined),
      uri(cosmosId ? COSMETIC_LAYERS[cosmosId]?.main : undefined),
      uri(satId ? COSMETIC_MODELS[satId] : undefined),
    ]);
    return buildGameGlobeSkin(key, texture, {
      landModel,
      propsModel,
      cosmos,
      satellite: satId && satModel ? { id: satId, model: satModel } : null,
    });
  } catch {
    return null;
  }
}
