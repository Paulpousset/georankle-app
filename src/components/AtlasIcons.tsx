/**
 * Atlas icon set — "Trait fin" (direction A).
 *
 * On-brand line icons (~1.8px round stroke) that replace the emoji used as
 * semantic icons across the app. Drop-in compatible with the lucide-react-native
 * icons already used in the UI: every component takes `{ color, size }`, so it can
 * be passed as `icon={AtlasFlag}` or rendered inline as `<AtlasFlag color size />`.
 *
 * Style chosen by the user from scratchpad/icones-propositions.html.
 */
import React from 'react';
import Svg, { Path, Circle, Rect, Ellipse } from 'react-native-svg';

export interface AtlasIconProps {
  color?: string;
  size?: number;
}

/** Shared stroke props for the thin-line set. */
const line = (color: string, w = 1.8) =>
  ({
    stroke: color,
    strokeWidth: w,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  }) as const;

function Base({ size = 24, children }: { size?: number; children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {children}
    </Svg>
  );
}

// ── Score & rewards ────────────────────────────────────────────────────────

/** 🔥 série / streak */
export function AtlasFlame({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path
        d="M12 3c.5 3-2.5 4-2.5 7a2.5 2.5 0 0 0 5 0c0-1 .8-1.6.8-1.6 1.4 1.2 2.2 3 2.2 4.6a5.5 5.5 0 0 1-11 0C6.5 9 12 7.5 12 3Z"
        {...line(color)}
      />
    </Base>
  );
}

/** ⭐ score / étoiles */
export function AtlasStar({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path
        d="M12 3.5l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.9 6.9 18.9 8 13.3 3.8 9.4l5.7-.7Z"
        {...line(color)}
      />
    </Base>
  );
}

/** 🏆 victoire (trophée) */
export function AtlasTrophy({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M7 4h10v3a5 5 0 0 1-10 0Z" {...line(color)} />
      <Path
        d="M7 5H4.5a2.5 2.5 0 0 0 3 2.4M17 5h2.5a2.5 2.5 0 0 1-3 2.4M10 12.5h4M9 20h6M12 14v4"
        {...line(color)}
      />
    </Base>
  );
}

/** 🪙 pièces (économie avatars) */
export function AtlasCoin({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Circle cx={12} cy={12} r={8.5} {...line(color)} />
      <Circle cx={12} cy={12} r={5.5} {...line(color, 1.3)} opacity={0.6} />
      <Path d="M12 9.5v5M10.5 11h2.2a1.2 1.2 0 0 1 0 2.4H10.5" {...line(color, 1.3)} />
    </Base>
  );
}

// ── In-game feedback ───────────────────────────────────────────────────────

/** ✅ / ✓ bonne réponse */
export function AtlasCheck({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M5 12.5l4.5 4.5L19 7" {...line(color)} />
    </Base>
  );
}

/** ❌ / ✕ mauvaise réponse / fermer */
export function AtlasCross({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...line(color)} />
    </Base>
  );
}

/** 🎉 gagné — fanion planté */
export function AtlasWin({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M7 21V4M7 5h10l-2.5 3L17 11H7" {...line(color)} />
    </Base>
  );
}

/** 😔 perdu — fanion en berne */
export function AtlasLose({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M7 21V4M7 16h8l-2-2.5L15 11H7" {...line(color)} />
    </Base>
  );
}

// ── Game modes ─────────────────────────────────────────────────────────────

/** 🌍 globe (find country) */
export function AtlasGlobe({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Circle cx={12} cy={12} r={9} {...line(color)} />
      <Path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" {...line(color)} />
    </Base>
  );
}

/** 🗺️ régions */
export function AtlasMap({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z" {...line(color)} />
      <Path d="M9 4v14M15 6v14" {...line(color)} />
    </Base>
  );
}

/** 🏛️ capitales — colonnade */
export function AtlasCapital({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M4 9 12 4l8 5M5 9v8M9 9v8M15 9v8M19 9v8M3.5 20h17M5 17h14" {...line(color)} />
    </Base>
  );
}

/** 🚩 drapeaux */
export function AtlasFlag({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M6 21V4M6 5h12l-3 4 3 4H6" {...line(color)} />
    </Base>
  );
}

/** 🎲 mixte — dé */
export function AtlasMix({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Rect x={4.5} y={4.5} width={15} height={15} rx={3} {...line(color)} />
      <Circle cx={9} cy={9} r={1.1} fill={color} />
      <Circle cx={15} cy={9} r={1.1} fill={color} />
      <Circle cx={12} cy={12} r={1.1} fill={color} />
      <Circle cx={9} cy={15} r={1.1} fill={color} />
      <Circle cx={15} cy={15} r={1.1} fill={color} />
    </Base>
  );
}

// ── Ranked ─────────────────────────────────────────────────────────────────

/** ⬆ promotion */
export function AtlasPromote({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" {...line(color)} />
    </Base>
  );
}

/** ⬇ rétrogradation */
export function AtlasDemote({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M12 5v13M6.5 12.5 12 18l5.5-5.5" {...line(color)} />
    </Base>
  );
}

// ── Guess category tiles (rendered white on a colored tile) ─────────────────

/** 🧭 direction — rose des vents */
export function AtlasCompass({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path
        d="M12 2.5 13.6 10.4 21.5 12 13.6 13.6 12 21.5 10.4 13.6 2.5 12 10.4 10.4Z"
        {...line(color)}
      />
      <Circle cx={12} cy={12} r={1.3} fill={color} />
    </Base>
  );
}

/** 📏 distance — deux points reliés */
export function AtlasDistance({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Circle cx={6} cy={7} r={2.3} {...line(color)} />
      <Circle cx={18} cy={17} r={2.3} {...line(color)} />
      <Path d="M7.6 8.6 16.4 15.4" {...line(color, 1.6)} strokeDasharray="2.4 2.2" />
    </Base>
  );
}

/** 👥 population — duo */
export function AtlasPopulation({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Circle cx={9} cy={8} r={3} {...line(color)} />
      <Path d="M3.5 18.5a5.5 5.5 0 0 1 11 0" {...line(color)} />
      <Path d="M16 5.4a3 3 0 0 1 0 5.6M20.5 18.5a5 5 0 0 0-3.8-4.8" {...line(color, 1.4)} />
    </Base>
  );
}

/** 📐 superficie — cadre + équerre */
export function AtlasArea({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Rect x={4} y={6} width={16} height={12} rx={1.2} {...line(color)} />
      <Path d="M4 10.5h2.6M4 14h2.6M9 6v2.6M13 6v2.6" {...line(color, 1.4)} />
    </Base>
  );
}

/** 🏖️ côtes — littoral + vagues */
export function AtlasCoastline({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M3 7c3 0 4 2.6 7 2.6S15 7 18 7" {...line(color)} />
      <Path
        d="M3.5 13q2-1.6 4 0t4 0 4 0 4 0M3.5 17q2-1.6 4 0t4 0 4 0 4 0"
        {...line(color, 1.4)}
      />
    </Base>
  );
}

/** ❤️ espérance de vie — cœur + battement */
export function AtlasLifeExp({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path
        d="M12 20s-7-4.4-7-9.3A3.9 3.9 0 0 1 12 7.2 3.9 3.9 0 0 1 19 10.7C19 15.6 12 20 12 20Z"
        {...line(color)}
      />
      <Path d="M6.5 12h2l1.4-2.6 1.8 4.4 1.3-2.6 1.1 1.8h2.6" {...line(color, 1.4)} />
    </Base>
  );
}

/** 🗺️ frontières — carte + limite pointillée */
export function AtlasBorders({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M5 5 9.5 3.6l5 2 4.5-1.4v13.2l-4.5 1.4-5-2L5 18.2Z" {...line(color)} />
      <Path d="M11 4v15" {...line(color, 1.6)} strokeDasharray="2.4 2.2" />
    </Base>
  );
}

/** 🎯 cible — pays trouvé (valeur de la tuile direction) */
export function AtlasTarget({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Circle cx={12} cy={12} r={8.5} {...line(color)} />
      <Circle cx={12} cy={12} r={4.6} {...line(color, 1.4)} />
      <Circle cx={12} cy={12} r={1.3} fill={color} />
    </Base>
  );
}

// ── Ranking themes (ClassicGame / StreakGame metrics) ───────────────────────

/** 🧱 densité de population — points serrés */
export function AtlasDensity({ color = '#000', size = 24 }: AtlasIconProps) {
  const coords = [8.5, 12, 15.5];
  const dots = coords.flatMap((cy) => coords.map((cx) => ({ cx, cy })));
  return (
    <Base size={size}>
      <Rect x={4} y={4} width={16} height={16} rx={2.4} {...line(color)} />
      {dots.map(({ cx, cy }) => (
        <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.1} fill={color} />
      ))}
    </Base>
  );
}

/** 🌲 couverture forestière — pin */
export function AtlasForest({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M12 3 7.5 10.5h2.6L6.5 16h11l-3.6-5.5h2.6Z" {...line(color)} />
      <Path d="M12 16v4" {...line(color)} />
    </Base>
  );
}

/** 🌾 terres agricoles — épi de blé */
export function AtlasAgriculture({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M12 21V8" {...line(color)} />
      <Path
        d="M12 8c-2.2-.3-3.4-2-3.4-2s1.3-1 3.4 0M12 8c2.2-.3 3.4-2 3.4-2s-1.3-1-3.4 0M12 12.5c-2.2-.3-3.4-2-3.4-2s1.3-1 3.4 0M12 12.5c2.2-.3 3.4-2 3.4-2s-1.3-1-3.4 0M12 17c-2.2-.3-3.4-2-3.4-2s1.3-1 3.4 0M12 17c2.2-.3 3.4-2 3.4-2s-1.3-1-3.4 0"
        {...line(color, 1.4)}
      />
    </Base>
  );
}

/** 🌿 énergie renouvelable — feuille */
export function AtlasLeaf({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14Z" {...line(color)} />
      <Path d="M12 12 7.5 16.5" {...line(color, 1.4)} />
    </Base>
  );
}

/** 🏭 CO₂ par habitant — usine */
export function AtlasFactory({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M3 21V10l5 3V10l5 3V7l6 3.5V21Z" {...line(color)} />
      <Path d="M3 21h18" {...line(color)} />
      <Path d="M6.5 16.5v2M11.5 16.5v2M16.5 16v2" {...line(color, 1.4)} />
      <Path d="M16.5 6.5c0-1 1-1 1-2" {...line(color, 1.4)} />
    </Base>
  );
}

/** 💰 PIB total — pile de pièces */
export function AtlasCoinStack({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Ellipse cx={12} cy={7} rx={7} ry={2.4} {...line(color)} />
      <Path
        d="M5 7v3.2c0 1.3 3.1 2.4 7 2.4s7-1.1 7-2.4V7M5 11.5v3.2c0 1.3 3.1 2.4 7 2.4s7-1.1 7-2.4v-3.2"
        {...line(color)}
      />
    </Base>
  );
}

/** 📊 croissance du PIB — barres */
export function AtlasBarChart({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M3 20h18" {...line(color)} />
      <Rect x={5} y={13} width={3} height={6} {...line(color)} />
      <Rect x={10.5} y={9.5} width={3} height={9.5} {...line(color)} />
      <Rect x={16} y={6} width={3} height={13} {...line(color)} />
    </Base>
  );
}

/** 📈 inflation — courbe ascendante */
export function AtlasTrendUp({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M3 16 9 10l3.5 3.5L20 6" {...line(color)} />
      <Path d="M20 6h-4M20 6v4" {...line(color)} />
    </Base>
  );
}

/** 💼 taux de chômage — mallette */
export function AtlasBriefcase({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Rect x={3} y={8} width={18} height={11} rx={2} {...line(color)} />
      <Path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" {...line(color)} />
    </Base>
  );
}

/** 🎖️ dépenses militaires — médaille */
export function AtlasMedal({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M9 3l2.2 5.5M15 3l-2.2 5.5" {...line(color, 1.4)} />
      <Circle cx={12} cy={15} r={5} {...line(color)} />
      <Path d="M12 12.4l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2L9.1 14.6l2-.3Z" {...line(color, 1.4)} />
    </Base>
  );
}

/** 👶 taux de natalité — visage de bébé */
export function AtlasBaby({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Circle cx={12} cy={12} r={8.5} {...line(color)} />
      <Circle cx={9.7} cy={11.3} r={0.7} fill={color} />
      <Circle cx={14.3} cy={11.3} r={0.7} fill={color} />
      <Path d="M9.6 15c1.5 1.2 3.3 1.2 4.8 0" {...line(color, 1.4)} />
      <Path d="M12 3.5q1.3 0 1.6 1.6" {...line(color, 1.4)} />
    </Base>
  );
}

/** 📚 alphabétisation — livre ouvert */
export function AtlasBook({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path
        d="M12 6c-2-1.4-5-1.4-8-1v13c3-.4 6-.4 8 1 2-1.4 5-1.4 8-1V5c-3-.4-6-.4-8 1Z"
        {...line(color)}
      />
      <Path d="M12 6v13" {...line(color, 1.4)} />
    </Base>
  );
}

/** 👨‍⚕️ médecins — croix médicale */
export function AtlasMedical({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Rect x={4} y={4} width={16} height={16} rx={4.5} {...line(color)} />
      <Path d="M12 8.5v7M8.5 12h7" {...line(color)} />
    </Base>
  );
}

/** 💊 dépense de santé — gélule */
export function AtlasCapsule({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M14.5 4.5 4.5 14.5a3.5 3.5 0 0 0 5 5l10-10a3.5 3.5 0 0 0-5-5Z" {...line(color)} />
      <Path d="M9.5 9.5 14.5 14.5" {...line(color, 1.4)} />
    </Base>
  );
}

/** 🍷 conso. d'alcool — verre de vin */
export function AtlasWine({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M8 4h8l-1 6a3 3 0 0 1-6 0Z" {...line(color)} />
      <Path d="M12 13v5M9 21h6" {...line(color)} />
    </Base>
  );
}

/** 🍔 taux d'obésité — burger */
export function AtlasBurger({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M5 9.5a7 3.5 0 0 1 14 0Z" {...line(color)} />
      <Path d="M4.5 13h15" {...line(color)} />
      <Path d="M5 16h14a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z" {...line(color)} />
    </Base>
  );
}

/** 🧠 taux de suicide — cerveau (santé mentale) */
export function AtlasBrain({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path
        d="M12 5.2a2.5 2.5 0 0 0-4.5 1.1A2.7 2.7 0 0 0 5 9a2.7 2.7 0 0 0 .6 4.4A2.6 2.6 0 0 0 8 17.8a2.4 2.4 0 0 0 4 .5Z"
        {...line(color, 1.4)}
      />
      <Path
        d="M12 5.2a2.5 2.5 0 0 1 4.5 1.1A2.7 2.7 0 0 1 19 9a2.7 2.7 0 0 1-.6 4.4A2.6 2.6 0 0 1 16 17.8a2.4 2.4 0 0 1-4 .5Z"
        {...line(color, 1.4)}
      />
      <Path d="M12 5.2v13.1" {...line(color, 1.4)} />
    </Base>
  );
}

/** 🔪 taux d'homicides — bouclier alerte */
export function AtlasShield({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M12 3 5 6v5c0 4.2 3 7.3 7 8.5 4-1.2 7-4.3 7-8.5V6Z" {...line(color)} />
      <Path d="M12 8.5v3.5M12 15h.01" {...line(color)} />
    </Base>
  );
}

/** 🏙️ population urbaine — gratte-ciels */
export function AtlasSkyline({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path d="M3 20h18" {...line(color)} />
      <Path d="M5 20V9l4-2v13M13 20V5l5 2.5V20" {...line(color)} />
      <Path d="M6.5 11h1M6.5 14h1M15 10h1M15 13h1M15 16h1" {...line(color, 1.4)} />
    </Base>
  );
}

/** 💡 accès à l'électricité — ampoule */
export function AtlasBulb({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path
        d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.3 1.1 2.2h5c.1-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"
        {...line(color)}
      />
      <Path d="M9.5 19h5M10.5 21.5h3" {...line(color)} />
    </Base>
  );
}

/** 📱 abonnements mobiles — smartphone */
export function AtlasPhone({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Rect x={7} y={3} width={10} height={18} rx={2.5} {...line(color)} />
      <Path d="M10.5 18h3" {...line(color, 1.4)} />
    </Base>
  );
}

/** ✈️ arrivées de touristes — avion */
export function AtlasPlane({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Path
        d="M21 14.5 14 12.8V7.2a2 2 0 0 0-4 0v5.6L3 14.5v1.7l7-1.3v3.3l-2 1.4v1.3l4-1 4 1v-1.3l-2-1.4v-3.3l7 1.3Z"
        {...line(color)}
      />
    </Base>
  );
}

/** 🛂 puissance du passeport — livret + globe */
export function AtlasPassport({ color = '#000', size = 24 }: AtlasIconProps) {
  return (
    <Base size={size}>
      <Rect x={5} y={3} width={14} height={18} rx={2} {...line(color)} />
      <Circle cx={12} cy={10} r={3} {...line(color, 1.4)} />
      <Path d="M9 10h6M12 7v6" {...line(color, 1.4)} />
      <Path d="M9 17h6" {...line(color, 1.4)} />
    </Base>
  );
}
