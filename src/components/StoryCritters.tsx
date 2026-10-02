/**
 * Wildlife of the story map — pre-rendered 3D animals (Quaternius CC0 models
 * re-shaded with the Cartoon HD toon + ink outline, see
 * asset-pipeline/render_critters.py) playing their real walk / swim / fly
 * cycles, and moving around each biome band: walkers pace along the banks,
 * fish and dolphins leap out of the river, whales and mantas cruise the
 * archipelago, astronauts drift through the Cosmos.
 *
 * A clip is ONE horizontal webp strip; `Sprite` steps through its frames by
 * translating the strip inside a clipping box, with a stepped interpolation so
 * it runs on the native driver. Placement is deterministic per tier; walkers
 * pick a row where the river swings to the far side, so they never wade in.
 */
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';

import { CRITTER_ART, type CritterKey } from '../data/storyCritters.gen';
import { BAND_OBSTACLES } from '../data/storyBandProps.gen';
import { findFreePoint, planWander, track, type Keyframe } from '../lib/critterPaths';

const NATIVE = Platform.OS !== 'web';

// ── Animation primitives ──────────────────────────────────────────────────────

/** 0→1 linear run, then a rest, forever (first run after `delay`). */
function useCycle(duration: number, rest: number, delay: number): Animated.Value {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: NATIVE }),
          Animated.delay(rest),
        ]),
      ),
    ]);
    anim.start();
    return () => anim.stop();
  }, [v, duration, rest, delay]);
  return v;
}

/** 0→1→0 sine ping-pong (bobbing, wobbling). */
function usePingPong(duration: number): Animated.Value {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [v, duration]);
  return v;
}

function spriteWidth(kind: CritterKey, height: number): number {
  const a = CRITTER_ART[kind];
  return (a.w / a.h) * height;
}

/** Plays a critter's frame strip in a loop at `fps`, `height` logical px tall. */
function Sprite({ kind, height, fps = 14 }: { kind: CritterKey; height: number; fps?: number }) {
  const art = CRITTER_ART[kind];
  const fw = spriteWidth(kind, height);
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (art.frames <= 1) return;
    const anim = Animated.loop(
      Animated.timing(t, {
        toValue: art.frames,
        duration: (art.frames / fps) * 1000,
        easing: Easing.linear,
        useNativeDriver: NATIVE,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [t, art.frames, fps]);
  // Stepped: hold each frame, then jump — never slide between frames.
  const tx = useMemo(() => {
    if (art.frames <= 1) return 0;
    const input: number[] = [];
    const output: number[] = [];
    for (let i = 0; i < art.frames; i++) {
      input.push(i, i + 0.999);
      output.push(-i * fw, -i * fw);
    }
    return t.interpolate({ inputRange: input, outputRange: output, extrapolate: 'clamp' });
  }, [t, art.frames, fw]);
  return (
    <View style={{ width: fw, height, overflow: 'hidden' }}>
      <Animated.Image
        source={art.src}
        fadeDuration={0}
        style={{ width: fw * art.frames, height, transform: [{ translateX: tx }] }}
      />
    </View>
  );
}

// ── Critters ──────────────────────────────────────────────────────────────────

/**
 * An animal strolling a planned loop (lib/critterPaths): curves over the free
 * ground, turns to face where it goes, and at some waypoints stops and plays
 * its idle clip (grazing, sniffing, sitting) — both strips share one camera,
 * so the swap is seamless. Swimmers use it too, with ripples above them.
 */
function Wanderer({
  kind, idle, height, frames, fps, delay, ripples = false,
}: {
  kind: CritterKey; idle?: CritterKey; height: number; frames: Keyframe[]; fps: number; delay: number; ripples?: boolean;
}) {
  const total = frames[frames.length - 1].t;
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(Animated.timing(t, { toValue: total, duration: total, easing: Easing.linear, useNativeDriver: NATIVE })),
    ]);
    anim.start();
    return () => anim.stop();
  }, [t, total, delay]);
  const anim = useMemo(() => ({
    x: t.interpolate({ ...track(frames, (k) => k.x), extrapolate: 'clamp' }),
    y: t.interpolate({ ...track(frames, (k) => k.y), extrapolate: 'clamp' }),
    face: t.interpolate({ ...track(frames, (k) => k.face, true), extrapolate: 'clamp' }),
    walk: t.interpolate({ ...track(frames, (k) => (k.moving || !idle ? 1 : 0), true), extrapolate: 'clamp' }),
    rest: t.interpolate({ ...track(frames, (k) => (k.moving || !idle ? 0 : 1), true), extrapolate: 'clamp' }),
  }), [t, frames, idle]);
  const bob = usePingPong(1700);
  const ripple = useCycle(1800, 400, 0);
  const w = spriteWidth(kind, height);
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', left: -w / 2, top: -height, transform: [{ translateX: anim.x }, { translateY: anim.y }] }}
    >
      {ripples ? null : (
        <View style={{ position: 'absolute', top: height - 7, left: w * 0.15, width: w * 0.7, height: 10, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.2)' }} />
      )}
      <Animated.View
        style={{
          transform: [
            { scaleX: anim.face },
            ...(ripples ? [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [-3, 3] }) }] : []),
          ],
        }}
      >
        <Animated.View style={{ opacity: anim.walk }}>
          <Sprite kind={kind} height={height} fps={fps} />
        </Animated.View>
        {idle ? (
          <Animated.View style={{ position: 'absolute', left: 0, top: 0, opacity: anim.rest }}>
            <Sprite kind={idle} height={height} fps={10} />
          </Animated.View>
        ) : null}
      </Animated.View>
      {ripples ? (
        <Animated.View
          style={{
            position: 'absolute', left: w * 0.25, top: height * 0.25, width: w * 0.5, height: height * 0.35,
            borderRadius: w, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)',
            opacity: ripple.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.55, 0] }),
            transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.5] }) }],
          }}
        />
      ) : null}
    </Animated.View>
  );
}

/** A fish or dolphin arcing out of the river and splashing back in. */
function Leaper({
  kind, height, x, y, delay, dir, big,
}: {
  kind: CritterKey; height: number; x: number; y: number; delay: number; dir: 1 | -1; big?: boolean;
}) {
  const t = useCycle(big ? 1500 : 1050, big ? 4200 : 3300, delay);
  const span = big ? 70 : 40;
  const rise = big ? 58 : 38;
  const tx = t.interpolate({ inputRange: [0, 1], outputRange: [0, span * dir] });
  const ty = t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -rise * 0.75, -rise, -rise * 0.75, 0] });
  const rot = t.interpolate({ inputRange: [0, 1], outputRange: [`${-50 * dir}deg`, `${50 * dir}deg`] });
  const op = t.interpolate({ inputRange: [0, 0.06, 0.94, 1], outputRange: [0, 1, 1, 0] });
  const ring = (at: number) => ({
    opacity: t.interpolate({ inputRange: [at, at + 0.02, at + 0.3, Math.min(1, at + 0.31)], outputRange: [0, 0.85, 0, 0], extrapolate: 'clamp' as const }),
    transform: [{ scale: t.interpolate({ inputRange: [at, at + 0.3], outputRange: [0.4, 1.7], extrapolate: 'clamp' as const }) }],
  });
  const w = spriteWidth(kind, height);
  const splash = { position: 'absolute' as const, top: -5, width: 26, height: 10, borderRadius: 13, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' };
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x, top: y }}>
      <Animated.View style={[splash, { left: -13 }, ring(0)]} />
      <Animated.View style={[splash, { left: span * dir - 13 }, ring(0.66)]} />
      <Animated.View
        style={{ position: 'absolute', left: -w / 2, top: -height / 2, opacity: op, transform: [{ translateX: tx }, { translateY: ty }, { rotate: rot }, { scaleX: dir }] }}
      >
        <Sprite kind={kind} height={height} fps={16} />
      </Animated.View>
    </View>
  );
}

/** A flying insect crossing the band on a wavy path. */
function Flyer({ kind, height, y, width, delay, rtl }: { kind: CritterKey; height: number; y: number; width: number; delay: number; rtl: boolean }) {
  const w = spriteWidth(kind, height);
  const t = useCycle(9000, 4000, delay);
  const tx = t.interpolate({ inputRange: [0, 1], outputRange: rtl ? [width + 10, -w - 10] : [-w - 10, width + 10] });
  const ty = t.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0, -22, 6, -18, 10, 0] });
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: y, transform: [{ translateX: tx }, { translateY: ty }, { scaleX: rtl ? -1 : 1 }] }}>
      <Sprite kind={kind} height={height} fps={18} />
    </Animated.View>
  );
}

/** Cosmos: something floating in zero-g — slow drift and tumble. */
function Floater({
  kind, height, x, y, delay, spin, drift,
}: {
  kind: CritterKey; height: number; x: number; y: number; delay: number; spin: number; drift: number;
}) {
  const t = useCycle(18000, 0, delay);
  const tx = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, drift, 0] });
  const ty = t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -16, 0, 16, 0] });
  const rot = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', `${spin}deg`, '0deg'] });
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: x, top: y, transform: [{ translateX: tx }, { translateY: ty }, { rotate: rot }] }}>
      <Sprite kind={kind} height={height} fps={12} />
    </Animated.View>
  );
}

/** Cosmos: a spaceship gliding across with a gentle wobble. */
function Glider({ kind, height, y, width, delay }: { kind: CritterKey; height: number; y: number; width: number; delay: number }) {
  const w = spriteWidth(kind, height);
  const t = useCycle(14000, 5000, delay);
  const wob = usePingPong(900);
  const tx = t.interpolate({ inputRange: [0, 1], outputRange: [-w - 20, width + 20] });
  const ty = wob.interpolate({ inputRange: [0, 1], outputRange: [-4, 4] });
  const rot = wob.interpolate({ inputRange: [0, 1], outputRange: ['-5deg', '5deg'] });
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: y, transform: [{ translateX: tx }, { translateY: ty }, { rotate: rot }] }}>
      <Sprite kind={kind} height={height} />
    </Animated.View>
  );
}

// ── Casting per biome ─────────────────────────────────────────────────────────

type Rng = () => number;

interface CastProps {
  biomeKey: string;
  tier: number;
  /** Band top in absolute map y (riverX takes absolute y). */
  top: number;
  height: number;
  width: number;
  riverX: (y: number) => number;
  riverW: number;
  rng: Rng;
  /** Maps the band art's px (390-wide, y from the image top) onto this band. */
  art?: { left: number; k: number; top: number };
}

type Box = [number, number, number, number];

/** Scenery footprints in band-local px (empty when the band isn't baked art). */
function obstaclesOf(p: CastProps, minSize = 0): Box[] {
  if (!p.art) return [];
  const { left, k, top } = p.art;
  return (BAND_OBSTACLES[p.biomeKey] ?? [])
    .filter(([x0, y0, x1, y1]) => Math.max(x1 - x0, y1 - y0) >= minSize)
    .map(([x0, y0, x1, y1]) => [left + x0 * k, top + y0, left + x1 * k, top + y1] as Box);
}


/** Walkers per biome: [sprite, height px, speed px/s, frame rate]. */
const K = 1.45; // on-map scale of every critter
const WALKERS: Record<string, [CritterKey, number, number, number][]> = {
  prairie: [['fox', 42 * K, 30, 13], ['deer', 58 * K, 24, 12]],
  desert: [['alpaca', 58 * K, 20, 11], ['snake_sand', 32 * K, 16, 12]],
  volcan: [['trex', 70 * K, 20, 11], ['triceratops', 52 * K, 12, 9], ['raptor', 44 * K, 60, 16]],
  glace: [['husky', 46 * K, 28, 13], ['arctic_wolf', 44 * K, 26, 13], ['stag', 64 * K, 20, 11]],
  jungle: [['frog', 34 * K, 30, 14], ['snake', 32 * K, 16, 12]],
  savane: [['buffalo', 54 * K, 16, 11], ['horse', 60 * K, 24, 12], ['donkey', 50 * K, 18, 11]],
};

/** Does a sprite of w×h with its feet at (x, y) touch any footprint? */
function hits(obstacles: Box[], x: number, y: number, w: number, h: number, bodyK = 0.55): boolean {
  const l = x - w / 2;
  const r = x + w / 2;
  const top = y - h * bodyK;
  return obstacles.some(([ox0, oy0, ox1, oy1]) => ox1 > l && ox0 < r && oy1 > top && oy0 < y + 4);
}

function castBand(p: CastProps): React.ReactNode[] {
  const { rng, width, height } = p;
  const out: React.ReactNode[] = [];
  const obstacles = obstaclesOf(p);
  // Each animal's roaming area joins the obstacles of the next one, so two
  // animals never walk through each other.
  const territories: Box[] = [];

  for (const [kind, h, speed, fps] of WALKERS[p.biomeKey] ?? []) {
    const w = spriteWidth(kind, h);
    // Free ground: inside the band, off the river (at the feet and the body),
    // clear of every prop — and not on top of another animal's start.
    const isFree = (x: number, y: number) => {
      if (x < w / 2 + 8 || x > width - w / 2 - 8 || y < h + 20 || y > height - 12) return false;
      const clear = p.riverW / 2 + 16 + w / 2;
      if (Math.abs(x - p.riverX(p.top + y)) < clear || Math.abs(x - p.riverX(p.top + y - h * 0.5)) < clear) return false;
      return !hits(obstacles, x, y, w, h) && !hits(territories, x, y, w, h, 1);
    };
    const start = findFreePoint({ isFree, rng, bounds: { x0: 0, y0: 0, x1: width, y1: height } }, 120);
    if (!start) continue;
    const frames = planWander(start, { isFree, rng, bounds: { x0: 0, y0: 0, x1: width, y1: height }, speed, stops: 6 });
    if (!frames) continue;
    const xs = frames.map((f) => f.x);
    const ys = frames.map((f) => f.y);
    territories.push([Math.min(...xs) - w / 2 - 6, Math.min(...ys) - h - 6, Math.max(...xs) + w / 2 + 6, Math.max(...ys) + 6]);
    const idle = `${kind}_idle` as CritterKey;
    out.push(
      <Wanderer
        key={`w_${kind}`}
        kind={kind}
        idle={idle in CRITTER_ART ? idle : undefined}
        height={h}
        frames={frames}
        fps={fps}
        delay={rng() * 2000}
      />,
    );
  }

  const leaper = (kind: CritterKey, h: number, big = false) => {
    const y = 90 + rng() * (height - 180);
    out.push(
      <Leaper key={`l_${kind}`} kind={kind} height={h} x={p.riverX(p.top + y)} y={y} delay={rng() * 3000} dir={rng() < 0.5 ? 1 : -1} big={big} />,
    );
  };

  switch (p.biomeKey) {
    case 'prairie':
    case 'glace':
      leaper('koi', 28 * K);
      break;
    case 'jungle':
      leaper('piranha', 28 * K);
      out.push(<Flyer key="wasp" kind="wasp" height={36 * K} y={60 + rng() * height * 0.6} width={width} delay={rng() * 4000} rtl={rng() < 0.5} />);
      break;
    case 'archipel': {
      leaper('dolphin', 40 * K, true);
      // Open-water stretches: the whole row minus the islands — each swimmer
      // paces one, never crossing land.
      // foam and clouds are wide but flat — islands (and their palms) are tall
      const islands = obstaclesOf(p).filter(([, y0, , y1]) => y1 - y0 >= 40);
      // Swimmers roam the open water between the islands, curving and turning,
      // never over land.
      const swim = (key: string, kind: CritterKey, h: number, speed: number) => {
        const w = spriteWidth(kind, h);
        const isFree = (x: number, y: number) =>
          x > w / 2 && x < width - w / 2 && y > h + 10 && y < height - 10 && !hits(islands, x, y, w, h, 1);
        const bounds = { x0: 0, y0: 0, x1: width, y1: height };
        const start = findFreePoint({ isFree, rng, bounds }, 120);
        const frames = start && planWander(start, { isFree, rng, bounds, speed, stops: 5, step: [60, 150], pauseChance: 0, vertical: 0.8 });
        if (frames) out.push(<Wanderer key={key} kind={kind} height={h} frames={frames} fps={10} delay={rng() * 3000} ripples />);
      };
      swim('whale', 'whale', 58 * K, 14);
      swim('manta', 'manta', 50 * K, 18);
      swim('clown1', 'clownfish', 22 * K, 26);
      swim('clown2', 'clownfish', 20 * K, 28);
      break;
    }
    case 'cosmos':
      out.push(<Floater key="afrog" kind="astro_frog" height={64 * K} x={16 + rng() * (width * 0.3)} y={height * (0.15 + rng() * 0.2)} delay={0} spin={-24} drift={40} />);
      out.push(<Floater key="abee" kind="astro_bee" height={58 * K} x={width * 0.55 + rng() * (width * 0.2)} y={height * (0.6 + rng() * 0.2)} delay={3000} spin={30} drift={-36} />);
      out.push(<Glider key="saucer" kind="saucer" height={40 * K} y={height * (0.4 + rng() * 0.1)} width={width} delay={rng() * 5000} />);
      break;
  }
  return out;
}

/** Makes a biome band come alive. Nothing is rendered with reduce-motion on. */
export function StoryCritters(props: Omit<CastProps, 'rng'> & { seed: number; enabled: boolean }) {
  const { biomeKey, tier, top, height, width, riverX, riverW, seed, enabled } = props;
  // by value: the caller rebuilds this object on every render, and recasting
  // would restart every animal's animation mid-scroll
  const artLeft = props.art?.left;
  const artK = props.art?.k;
  const artTop = props.art?.top;
  const critters = useMemo(() => {
    if (!enabled) return null;
    let s = (seed >>> 0) || 1;
    const rng = () => (s = Math.imul(s ^ (s >>> 15), 0x2c9277b5) >>> 0) / 4294967296;
    const art = artK == null ? undefined : { left: artLeft ?? 0, k: artK, top: artTop ?? 0 };
    return castBand({ biomeKey, tier, top, height, width, riverX, riverW, rng, art });
  }, [biomeKey, tier, top, height, width, riverX, riverW, seed, enabled, artLeft, artK, artTop]);
  if (!critters) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width, height }}>
      {critters}
    </View>
  );
}
