/**
 * Hand-built SVG silhouettes for the cosmetic emblems (world landmarks, drawn
 * standing ON the globe at their real country) and satellites (icons riding the
 * orbit). Designs were iterated against a headless render harness. Each builder
 * draws in a unit system (base at (bx,by), +y up) and is rendered inside the
 * parent <Svg> of <WorldAvatar>.
 */
import React from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect } from 'react-native-svg';

import type { CosmeticCategory } from '../types';

// Monument palette (reads on any globe style).
const LIGHT = '#f6efe0';
const MID = '#dccfb4';
const SHADOW = '#a8916e';
const DARK = '#4f4636';
const GOLD = '#e8c45a';

/** Real-world coordinates [lon, lat] of each landmark — the globe is recentred
 *  here so the monument stands on its own country. `compass` has none (stays on
 *  the default Earth face). */
export const EMBLEM_COORD: Record<string, [number, number]> = {
  emblem_eiffel: [2.29, 48.86],
  emblem_pyramids: [31.13, 29.98],
  emblem_liberty: [-74.04, 40.69],
  emblem_bigben: [-0.12, 51.5],
  emblem_fuji: [138.73, 35.36],
  emblem_christ: [-43.21, -22.95],
  emblem_taj: [78.04, 27.17],
  emblem_colosseum: [12.49, 41.89],
  // ── Boutique 2.0 ──
  emblem_windmill: [4.9, 52.4],       // Pays-Bas (Zaanse Schans)
  emblem_pisa: [10.4, 43.72],         // Italie
  emblem_moai: [-109.37, -27.13],     // Île de Pâques
  emblem_goldengate: [-122.48, 37.82], // États-Unis (San Francisco)
  emblem_sydney: [151.21, -33.86],    // Australie
  emblem_greatwall: [116.57, 40.43],  // Chine (Badaling)
};

// ── Emblems — stand on the globe. base point (bx, by), height h (px) ─────────

interface EmblemProps { id: string; bx: number; by: number; h: number; }

export function EmblemGlyph({ id, bx, by, h }: EmblemProps) {
  const X = (u: number) => bx + u * h;
  const Y = (u: number) => by - u * h;
  const poly = (pts: [number, number][]) => pts.map(([a, b]) => `${X(a).toFixed(2)},${Y(b).toFixed(2)}`).join(' ');
  const sw = h * 0.01;

  switch (id) {
    case 'emblem_eiffel': {
      const L = '#8a7359', LD = '#5d4c39', LL = '#a8906f', DK = '#3c3024';
      const lat = [];
      for (let i = 1; i <= 5; i++) {
        const y = 0.04 + i * 0.045, w = 0.30 - i * 0.03;
        lat.push(<Line key={i} x1={X(-w)} y1={Y(y)} x2={X(w)} y2={Y(y)} stroke={LD} strokeWidth={h * 0.006} opacity={0.5} />);
      }
      return (
        <G>
          <Polygon
            points={poly([
              [-0.355, 0], [-0.27, 0.12], [-0.20, 0.24], [-0.165, 0.335], [-0.115, 0.50], [-0.082, 0.63],
              [-0.05, 0.85], [-0.028, 1.04], [-0.016, 1.16], [0, 1.36],
              [0.016, 1.16], [0.028, 1.04], [0.05, 0.85], [0.082, 0.63], [0.115, 0.50], [0.165, 0.335],
              [0.20, 0.24], [0.27, 0.12], [0.355, 0],
              [0.235, 0], [0.16, 0.16], [0.085, 0.25], [0, 0.165], [-0.085, 0.25], [-0.16, 0.16], [-0.235, 0],
            ])}
            fill={L} stroke={DK} strokeWidth={sw} strokeLinejoin="round"
          />
          <Polygon points={poly([[0, 1.36], [0.016, 1.16], [0.028, 1.04], [0.05, 0.85], [0.082, 0.63], [0.115, 0.50], [0.165, 0.335], [0.20, 0.24], [0.27, 0.12], [0.355, 0], [0.235, 0], [0.16, 0.16], [0.085, 0.25], [0, 0.165]])} fill={LD} opacity={0.3} />
          {lat}
          <Rect x={X(-0.175)} y={Y(0.355)} width={0.35 * h} height={h * 0.045} fill={LL} stroke={DK} strokeWidth={sw} />
          <Rect x={X(-0.105)} y={Y(0.645)} width={0.21 * h} height={h * 0.035} fill={LL} stroke={DK} strokeWidth={sw} />
          <Line x1={X(0)} y1={Y(0.68)} x2={X(0)} y2={Y(1.34)} stroke={LD} strokeWidth={h * 0.01} opacity={0.6} />
          {/* summit beacon (v2 polish) */}
          <Circle cx={X(0)} cy={Y(1.36)} r={h * 0.06} fill="#ffe27a" opacity={0.3} />
          <Circle cx={X(0)} cy={Y(1.36)} r={h * 0.022} fill="#ffe27a" />
          <Circle cx={X(0)} cy={Y(1.30)} r={h * 0.018} fill={DK} />
        </G>
      );
    }

    case 'emblem_pyramids': {
      const S = '#e0c485', SD = '#b1925d', SH = '#8f7144', BASE = '#c9a86e';
      const blocks = [];
      for (let i = 1; i < 7; i++) {
        const t = i / 7, y = 0.80 * t;
        blocks.push(<Line key={i} x1={X(-0.50 * (1 - t))} y1={Y(y)} x2={X(0.40 * (1 - t))} y2={Y(y)} stroke={SH} strokeWidth={h * 0.005} opacity={0.35} />);
      }
      return (
        <G>
          <Polygon points={poly([[0.10, 0], [0.66, 0], [0.38, 0.50]])} fill={SD} stroke={SH} strokeWidth={sw} />
          <Polygon points={poly([[0.38, 0.50], [0.66, 0], [0.38, 0]])} fill={SH} opacity={0.45} />
          <Polygon points={poly([[-0.62, 0], [-0.30, 0], [-0.46, 0.30]])} fill={SD} stroke={SH} strokeWidth={sw} />
          <Polygon points={poly([[-0.50, 0], [0.40, 0], [-0.05, 0.80]])} fill={S} stroke={SH} strokeWidth={sw} strokeLinejoin="round" />
          <Polygon points={poly([[-0.05, 0.80], [0.40, 0], [-0.05, 0]])} fill={SH} opacity={0.4} />
          {/* gilded benben capstone (v2 polish) */}
          <Polygon points={poly([[-0.115, 0.685], [0.011, 0.685], [-0.05, 0.80]])} fill="#ffd97a" stroke="#c9a13a" strokeWidth={sw * 0.8} />
          {blocks}
          <Rect x={X(-0.66)} y={Y(0)} width={1.32 * h} height={h * 0.03} fill={BASE} opacity={0.7} />
        </G>
      );
    }

    case 'emblem_liberty': {
      const G2 = '#7cb6a0', GD = '#56947c', GL = '#9ed0bc', PED = '#d8cdb4', PEDD = '#b6a888', DK = '#2f5a4a';
      return (
        <G>
          <Polygon points={poly([[-0.17, 0], [0.17, 0], [0.14, 0.12], [-0.14, 0.12]])} fill={PEDD} />
          <Polygon points={poly([[-0.145, 0.12], [0.145, 0.12], [0.115, 0.30], [-0.115, 0.30]])} fill={PED} stroke={DK} strokeWidth={sw} />
          <Polygon points={poly([[-0.10, 0.30], [0.10, 0.30], [0.075, 0.84], [-0.085, 0.84]])} fill={G2} stroke={DK} strokeWidth={sw} strokeLinejoin="round" />
          <Polygon points={poly([[0, 0.30], [0.10, 0.30], [0.075, 0.84], [0, 0.84]])} fill={GD} opacity={0.5} />
          <Line x1={X(-0.03)} y1={Y(0.34)} x2={X(-0.05)} y2={Y(0.80)} stroke={GD} strokeWidth={h * 0.01} opacity={0.6} />
          <Line x1={X(0.04)} y1={Y(0.34)} x2={X(0.03)} y2={Y(0.80)} stroke={GD} strokeWidth={h * 0.01} opacity={0.5} />
          <Polygon points={poly([[-0.10, 0.55], [-0.20, 0.48], [-0.185, 0.40], [-0.085, 0.46]])} fill={GL} stroke={DK} strokeWidth={sw} />
          <Polygon points={poly([[0.05, 0.80], [0.095, 0.78], [0.20, 1.06], [0.14, 1.09]])} fill={G2} stroke={DK} strokeWidth={sw} />
          <Circle cx={X(0.175)} cy={Y(1.14)} r={h * 0.15} fill="#ffcf63" opacity={0.16} />
          <Circle cx={X(0.175)} cy={Y(1.14)} r={h * 0.09} fill="#ffcf63" opacity={0.35} />
          <Circle cx={X(0.175)} cy={Y(1.14)} r={h * 0.05} fill="#ffcf63" />
          <Polygon points={poly([[0.155, 1.16], [0.195, 1.16], [0.175, 1.27]])} fill="#ffe39a" />
          <Circle cx={X(0)} cy={Y(0.92)} r={h * 0.06} fill={GL} stroke={DK} strokeWidth={sw} />
          {[-0.075, -0.05, -0.025, 0, 0.025, 0.05, 0.075].map((dx, i) => (
            <Line key={i} x1={X(dx)} y1={Y(0.97)} x2={X(dx * 2.3)} y2={Y(1.07)} stroke={G2} strokeWidth={h * 0.013} strokeLinecap="round" />
          ))}
        </G>
      );
    }

    case 'emblem_bigben': {
      const H = '#cdab6a', HD = '#a07d44', HL = '#e2c890', DK = '#574321', G3 = '#e8c45a';
      return (
        <G>
          <Polygon points={poly([[-0.105, 0], [0.105, 0], [0.092, 0.66], [-0.092, 0.66]])} fill={H} stroke={DK} strokeWidth={sw} />
          <Polygon points={poly([[0, 0], [0.105, 0], [0.092, 0.66], [0, 0.66]])} fill={HD} opacity={0.35} />
          <Rect x={X(-0.10)} y={Y(0.405)} width={0.20 * h} height={0.045 * h} fill={HL} />
          {/* illuminated clock halo (v2 polish) */}
          <Circle cx={X(0)} cy={Y(0.50)} r={h * 0.105} fill="#ffe9b0" opacity={0.28} />
          <Circle cx={X(0)} cy={Y(0.50)} r={h * 0.072} fill="#fbf6e8" stroke={G3} strokeWidth={h * 0.014} />
          <Circle cx={X(0)} cy={Y(0.50)} r={h * 0.072} fill="none" stroke={DK} strokeWidth={h * 0.006} />
          <Line x1={X(0)} y1={Y(0.50)} x2={X(0)} y2={Y(0.55)} stroke={DK} strokeWidth={h * 0.009} strokeLinecap="round" />
          <Line x1={X(0)} y1={Y(0.50)} x2={X(0.032)} y2={Y(0.51)} stroke={DK} strokeWidth={h * 0.009} strokeLinecap="round" />
          <Polygon points={poly([[-0.105, 0.66], [0.105, 0.66], [0.115, 0.74], [-0.115, 0.74]])} fill={HL} stroke={DK} strokeWidth={sw} />
          <Rect x={X(-0.075)} y={Y(0.90)} width={0.15 * h} height={0.16 * h} fill={H} stroke={DK} strokeWidth={sw} />
          <Line x1={X(-0.025)} y1={Y(0.76)} x2={X(-0.025)} y2={Y(0.90)} stroke={DK} strokeWidth={h * 0.006} opacity={0.5} />
          <Line x1={X(0.025)} y1={Y(0.76)} x2={X(0.025)} y2={Y(0.90)} stroke={DK} strokeWidth={h * 0.006} opacity={0.5} />
          <Polygon points={poly([[-0.095, 0.90], [0.095, 0.90], [0, 1.34]])} fill={HL} stroke={DK} strokeWidth={sw} strokeLinejoin="round" />
          <Polygon points={poly([[0, 0.90], [0.095, 0.90], [0, 1.34]])} fill={HD} opacity={0.4} />
          <Circle cx={X(0)} cy={Y(1.20)} r={h * 0.02} fill={G3} />
          {[-0.095, 0.095].map((dx, i) => (
            <Polygon key={i} points={poly([[dx - 0.022, 0.90], [dx + 0.022, 0.90], [dx, 1.02]])} fill={HL} stroke={DK} strokeWidth={h * 0.006} />
          ))}
        </G>
      );
    }

    case 'emblem_fuji': {
      const A = '#7793b5', B = '#566f8f', DK = '#3f5572';
      return (
        <G>
          <Polygon points={poly([[-0.52, 0], [-0.17, 0.58], [-0.085, 0.80], [0.085, 0.80], [0.17, 0.58], [0.52, 0]])} fill={A} stroke={DK} strokeWidth={sw} />
          <Polygon points={poly([[-0.52, 0], [-0.17, 0.58], [-0.05, 0.46], [-0.30, 0]])} fill={B} opacity={0.6} />
          <Polygon points={poly([[-0.215, 0.565], [-0.085, 0.80], [0.085, 0.80], [0.215, 0.565], [0.12, 0.66], [0.05, 0.585], [0, 0.64], [-0.05, 0.585], [-0.12, 0.66]])} fill="#fcfdff" />
          {/* alpenglow tint on the snowcap (v2 polish) */}
          <Polygon points={poly([[-0.215, 0.565], [-0.13, 0.72], [-0.05, 0.585], [-0.12, 0.66]])} fill="#ffc8d8" opacity={0.45} />
          <Polygon points={poly([[0.215, 0.565], [0.085, 0.80], [0.05, 0.66]])} fill="#d8e4f0" opacity={0.8} />
          <Path d={`M${X(-0.085)},${Y(0.80)} L${X(-0.13)},${Y(0.50)} M${X(0.02)},${Y(0.80)} L${X(0)},${Y(0.46)} M${X(0.09)},${Y(0.78)} L${X(0.13)},${Y(0.52)}`} stroke="#fcfdff" strokeWidth={h * 0.012} strokeLinecap="round" opacity={0.85} />
        </G>
      );
    }

    case 'emblem_christ': {
      const G4 = '#dcdcd6', GD = '#a9a9a3', GL = '#eeeeea', DK = '#73736d';
      return (
        <G>
          <Polygon points={poly([[-0.16, 0], [0.16, 0], [0.115, 0.20], [-0.115, 0.20]])} fill="#b0ac9c" stroke={DK} strokeWidth={sw} />
          <Path d={`M${X(-0.09)},${Y(0.78)} L${X(-0.155)},${Y(0.20)} L${X(0.155)},${Y(0.20)} L${X(0.09)},${Y(0.78)} Z`} fill={G4} stroke={DK} strokeWidth={sw} strokeLinejoin="round" />
          <Path d={`M${X(-0.45)},${Y(0.84)} Q${X(0)},${Y(0.93)} ${X(0.45)},${Y(0.84)} L${X(0.45)},${Y(0.785)} Q${X(0.20)},${Y(0.78)} ${X(0.115)},${Y(0.82)} L${X(-0.115)},${Y(0.82)} Q${X(-0.20)},${Y(0.78)} ${X(-0.45)},${Y(0.785)} Z`} fill={G4} stroke={DK} strokeWidth={sw} strokeLinejoin="round" />
          <Path d={`M${X(-0.115)},${Y(0.78)} Q${X(0)},${Y(0.74)} ${X(0.115)},${Y(0.78)} L${X(0.10)},${Y(0.86)} Q${X(0)},${Y(0.83)} ${X(-0.10)},${Y(0.86)} Z`} fill={G4} stroke={DK} strokeWidth={sw} />
          <Rect x={X(-0.035)} y={Y(0.94)} width={0.07 * h} height={0.06 * h} fill={G4} />
          {/* soft halo behind the head (v2 polish) */}
          <Circle cx={X(0)} cy={Y(0.97)} r={h * 0.11} fill="#fff6d8" opacity={0.22} />
          <Circle cx={X(0)} cy={Y(0.97)} r={h * 0.062} fill={GL} stroke={DK} strokeWidth={sw} />
          <Path d={`M${X(0)},${Y(0.20)} L${X(0.155)},${Y(0.20)} L${X(0.09)},${Y(0.78)} L${X(0)},${Y(0.78)} Z`} fill={GD} opacity={0.5} />
          <Path d={`M${X(0.115)},${Y(0.815)} L${X(0.45)},${Y(0.785)} L${X(0.45)},${Y(0.84)} Q${X(0.20)},${Y(0.86)} ${X(0.115)},${Y(0.82)} Z`} fill={GD} opacity={0.45} />
          <Line x1={X(0)} y1={Y(0.22)} x2={X(0)} y2={Y(0.74)} stroke={GD} strokeWidth={h * 0.006} opacity={0.5} />
          <Line x1={X(-0.07)} y1={Y(0.24)} x2={X(-0.085)} y2={Y(0.74)} stroke={GD} strokeWidth={h * 0.005} opacity={0.4} />
          <Line x1={X(0.07)} y1={Y(0.24)} x2={X(0.085)} y2={Y(0.74)} stroke={GD} strokeWidth={h * 0.005} opacity={0.4} />
        </G>
      );
    }

    case 'emblem_taj': {
      const W = '#f5f0e7', WD = '#dccdb8', WL = '#ffffff', DK = '#9c8e78', ARCH = '#8a7c66', G5 = '#d8b24a';
      const minaret = (mx: number, key: number) => (
        <G key={key}>
          <Rect x={X(mx - 0.028)} y={Y(0.62)} width={0.056 * h} height={0.62 * h} fill={W} stroke={DK} strokeWidth={h * 0.006} />
          <Rect x={X(mx - 0.034)} y={Y(0.40)} width={0.068 * h} height={0.012 * h} fill={WD} />
          <Rect x={X(mx - 0.034)} y={Y(0.20)} width={0.068 * h} height={0.012 * h} fill={WD} />
          <Path d={`M${X(mx - 0.04)},${Y(0.64)} Q${X(mx)},${Y(0.74)} ${X(mx + 0.04)},${Y(0.64)} Z`} fill={W} stroke={DK} strokeWidth={h * 0.006} />
          <Line x1={X(mx)} y1={Y(0.72)} x2={X(mx)} y2={Y(0.80)} stroke={G5} strokeWidth={h * 0.014} strokeLinecap="round" />
        </G>
      );
      const chattri = (dx: number, key: number) => (
        <G key={key}>
          <Path d={`M${X(dx - 0.06)},${Y(0.56)} Q${X(dx - 0.06)},${Y(0.70)} ${X(dx)},${Y(0.72)} Q${X(dx + 0.06)},${Y(0.70)} ${X(dx + 0.06)},${Y(0.56)} Z`} fill={W} stroke={DK} strokeWidth={h * 0.006} />
          <Rect x={X(dx - 0.06)} y={Y(0.56)} width={0.12 * h} height={0.02 * h} fill={WD} />
        </G>
      );
      return (
        <G>
          <Rect x={X(-0.48)} y={Y(0.10)} width={0.96 * h} height={0.10 * h} fill={WD} stroke={DK} strokeWidth={h * 0.006} />
          {minaret(-0.38, 1)}{minaret(0.38, 2)}
          <Rect x={X(-0.22)} y={Y(0.56)} width={0.44 * h} height={0.46 * h} fill={W} stroke={DK} strokeWidth={sw} />
          <Path d={`M${X(-0.09)},${Y(0.10)} L${X(-0.09)},${Y(0.34)} Q${X(0)},${Y(0.46)} ${X(0.09)},${Y(0.34)} L${X(0.09)},${Y(0.10)} Z`} fill={ARCH} />
          {chattri(-0.15, 3)}{chattri(0.15, 4)}
          <Rect x={X(-0.165)} y={Y(0.60)} width={0.33 * h} height={0.04 * h} fill={WD} />
          <Path d={`M${X(-0.165)},${Y(0.56)} C${X(-0.165)},${Y(0.84)} ${X(-0.075)},${Y(0.96)} ${X(0)},${Y(0.98)} C${X(0.075)},${Y(0.96)} ${X(0.165)},${Y(0.84)} ${X(0.165)},${Y(0.56)} Z`} fill={WL} stroke={DK} strokeWidth={sw} />
          <Path d={`M${X(0)},${Y(0.56)} C${X(0.075)},${Y(0.96)} ${X(0.075)},${Y(0.96)} ${X(0)},${Y(0.98)} C${X(0.075)},${Y(0.96)} ${X(0.165)},${Y(0.84)} ${X(0.165)},${Y(0.56)} Z`} fill={WD} opacity={0.4} />
          {/* gilded finial glint (v2 polish) */}
          <Circle cx={X(0)} cy={Y(1.05)} r={h * 0.055} fill="#ffe9a0" opacity={0.3} />
          <Circle cx={X(0)} cy={Y(1.0)} r={h * 0.022} fill={G5} />
          <Line x1={X(0)} y1={Y(0.98)} x2={X(0)} y2={Y(1.10)} stroke={G5} strokeWidth={h * 0.018} strokeLinecap="round" />
        </G>
      );
    }

    case 'emblem_colosseum': {
      const T = '#e6d3ad', TD = '#bda478', TL = '#f3e6c8', DK = '#7a6644', ARCH = '#5b4a30';
      const archRow = (yLo: number, yHi: number, n: number, w: number, tag: string) =>
        Array.from({ length: n }).map((_, i) => {
          const ax = -0.40 + (i / (n - 1)) * 0.80;
          return <Rect key={`${tag}${i}`} x={X(ax - w / 2)} y={Y(yHi)} width={w * h} height={(yHi - yLo) * h} rx={w * h * 0.45} fill={ARCH} opacity={0.55} />;
        });
      return (
        <G>
          <Path d={`M${X(-0.47)},${Y(0.04)} L${X(-0.43)},${Y(0.46)} Q${X(0)},${Y(0.60)} ${X(0.43)},${Y(0.46)} L${X(0.47)},${Y(0.04)} Q${X(0)},${Y(-0.07)} ${X(-0.47)},${Y(0.04)} Z`} fill={T} stroke={DK} strokeWidth={sw} strokeLinejoin="round" />
          <Path d={`M${X(0.10)},${Y(0.555)} Q${X(0.43)},${Y(0.46)} ${X(0.47)},${Y(0.04)} L${X(0.30)},${Y(0.02)} Q${X(0.30)},${Y(0.43)} ${X(0.10)},${Y(0.52)} Z`} fill={TD} opacity={0.35} />
          <Path d={`M${X(-0.47)},${Y(0.30)} Q${X(0)},${Y(0.44)} ${X(0.43)},${Y(0.30)}`} fill="none" stroke={DK} strokeWidth={h * 0.008} opacity={0.5} />
          <Path d={`M${X(-0.45)},${Y(0.16)} Q${X(0)},${Y(0.30)} ${X(0.45)},${Y(0.16)}`} fill="none" stroke={DK} strokeWidth={h * 0.008} opacity={0.5} />
          {/* warm interior glow through the arches (v2 polish) */}
          <Ellipse cx={X(0)} cy={Y(0.30)} rx={h * 0.34} ry={h * 0.14} fill="#ffb45a" opacity={0.13} />
          {archRow(0.32, 0.46, 9, 0.055, 'a')}
          {archRow(0.17, 0.28, 9, 0.05, 'b')}
          {archRow(0.03, 0.13, 9, 0.045, 'c')}
          <Polygon points={poly([[-0.47, 0.04], [-0.30, 0.46], [-0.20, 0.50], [-0.40, 0.05]])} fill={TL} opacity={0.4} />
        </G>
      );
    }

    case 'emblem_windmill': {
      const B = '#8a5a3a', BD = '#5e3a22', W = '#f0e8d8', R3 = '#a84a3a';
      const sails = [];
      for (let i = 0; i < 4; i++) {
        const a = ((45 + i * 90) * Math.PI) / 180;
        const x2 = Math.cos(a) * 0.42, y2 = 0.68 + Math.sin(a) * 0.42;
        const px = Math.cos(a), py = Math.sin(a), nx = -py * 0.09, ny = px * 0.09;
        sails.push(
          <G key={i}>
            <Line x1={X(0)} y1={Y(0.68)} x2={X(x2)} y2={Y(y2)} stroke={BD} strokeWidth={h * 0.022} />
            <Polygon points={poly([[px * 0.1, 0.68 + py * 0.1], [x2, y2], [x2 + nx, y2 + ny], [px * 0.1 + nx, 0.68 + py * 0.1 + ny]])} fill={W} fillOpacity={0.9} stroke={BD} strokeWidth={sw * 0.8} />
          </G>,
        );
      }
      return (
        <G>
          <Polygon points={poly([[-0.22, 0], [0.22, 0], [0.13, 0.62], [-0.13, 0.62]])} fill={B} stroke={BD} strokeWidth={sw} />
          <Polygon points={poly([[0, 0], [0.22, 0], [0.13, 0.62], [0, 0.62]])} fill={BD} opacity={0.35} />
          <Path d={`M${X(-0.15)},${Y(0.62)} Q${X(0)},${Y(0.82)} ${X(0.15)},${Y(0.62)} Z`} fill={R3} stroke={BD} strokeWidth={sw} />
          <Rect x={X(-0.045)} y={Y(0.18)} width={0.09 * h} height={0.18 * h} fill={BD} rx={h * 0.03} />
          {sails}
          <Circle cx={X(0)} cy={Y(0.68)} r={h * 0.035} fill="#3f2a18" />
        </G>
      );
    }

    case 'emblem_pisa': {
      const W = '#f2ead8', WD = '#cfc4a8', DK = '#8a8068';
      const floors = [];
      for (let i = 0; i < 6; i++) {
        const y0 = 0.14 + i * 0.14;
        floors.push(<Rect key={`f${i}`} x={X(-0.105)} y={Y(y0 + 0.14)} width={0.21 * h} height={0.14 * h} fill={W} stroke={DK} strokeWidth={sw * 0.8} />);
        for (let c2 = 0; c2 < 5; c2++) {
          floors.push(<Rect key={`c${i}_${c2}`} x={X(-0.09 + c2 * 0.045)} y={Y(y0 + 0.115)} width={0.018 * h} height={0.09 * h} fill={WD} rx={h * 0.009} />);
        }
      }
      return (
        // authentic ~8° lean around the base
        <G rotation={-8} originX={X(0)} originY={Y(0)}>
          <Polygon points={poly([[-0.13, 0], [0.13, 0], [0.11, 0.14], [-0.11, 0.14]])} fill={WD} stroke={DK} strokeWidth={sw} />
          {floors}
          <Path d={`M${X(-0.08)},${Y(0.98)} Q${X(0)},${Y(1.12)} ${X(0.08)},${Y(0.98)} L${X(0.08)},${Y(1.02)} L${X(-0.08)},${Y(1.02)} Z`} fill={W} stroke={DK} strokeWidth={sw} />
        </G>
      );
    }

    case 'emblem_moai': {
      const S1 = '#8a8f96', S2 = '#6a7078', S3 = '#a8adb4', DK = '#3f444c';
      return (
        <G>
          <Polygon points={poly([[-0.3, 0], [0.3, 0], [0.24, 0.1], [-0.24, 0.1]])} fill="#7a6a4a" stroke={DK} strokeWidth={sw} />
          <Path d={`M${X(-0.2)},${Y(0.1)} L${X(-0.23)},${Y(0.62)} Q${X(-0.23)},${Y(0.94)} ${X(-0.1)},${Y(1.02)} L${X(0.1)},${Y(1.02)} Q${X(0.22)},${Y(0.94)} ${X(0.21)},${Y(0.62)} L${X(0.19)},${Y(0.1)} Z`} fill={S1} stroke={DK} strokeWidth={sw} />
          <Path d={`M${X(0)},${Y(0.1)} L${X(0.19)},${Y(0.1)} L${X(0.21)},${Y(0.62)} Q${X(0.22)},${Y(0.94)} ${X(0.1)},${Y(1.02)} L${X(0)},${Y(1.02)} Z`} fill={S2} opacity={0.55} />
          {/* brow ridge */}
          <Path d={`M${X(-0.23)},${Y(0.72)} L${X(-0.06)},${Y(0.78)} L${X(-0.05)},${Y(0.72)} L${X(-0.22)},${Y(0.65)} Z`} fill={S3} />
          <Path d={`M${X(0.04)},${Y(0.78)} L${X(0.21)},${Y(0.72)} L${X(0.2)},${Y(0.65)} L${X(0.05)},${Y(0.72)} Z`} fill={S3} />
          {/* long nose */}
          <Polygon points={poly([[-0.05, 0.72], [0.04, 0.72], [0.05, 0.42], [-0.04, 0.42]])} fill={S3} stroke={DK} strokeWidth={sw * 0.7} />
          <Line x1={X(-0.14)} y1={Y(0.3)} x2={X(0.12)} y2={Y(0.3)} stroke={DK} strokeWidth={h * 0.014} opacity={0.7} />
          <Line x1={X(-0.23)} y1={Y(0.56)} x2={X(-0.16)} y2={Y(0.5)} stroke={DK} strokeWidth={sw} opacity={0.5} />
        </G>
      );
    }

    case 'emblem_goldengate': {
      const R2 = '#d1493a', RD = '#9a2f24';
      const tower = (tx: number, key: number) => (
        <G key={key}>
          <Rect x={X(tx - 0.035)} y={Y(0.95)} width={0.07 * h} height={0.95 * h} fill={R2} stroke={RD} strokeWidth={sw} />
          {[0.38, 0.62, 0.84].map((yy, i) => (
            <Rect key={i} x={X(tx - 0.05)} y={Y(yy)} width={0.1 * h} height={0.03 * h} fill={RD} />
          ))}
        </G>
      );
      const suspenders = [];
      for (let i = 1; i < 8; i++) {
        const t = i / 8, xx = -0.3 + t * 0.6;
        const cableY = (1 - t) * (1 - t) * 0.92 + 2 * t * (1 - t) * 0.42 + t * t * 0.92; // Bézier point on the cable
        suspenders.push(<Line key={i} x1={X(xx)} y1={Y(cableY)} x2={X(xx)} y2={Y(0.215)} stroke={R2} strokeWidth={h * 0.008} opacity={0.8} />);
      }
      return (
        <G>
          <Rect x={X(-0.62)} y={Y(0.215)} width={1.24 * h} height={0.035 * h} fill={R2} stroke={RD} strokeWidth={sw} />
          {tower(-0.3, 1)}{tower(0.3, 2)}
          <Path d={`M${X(-0.62)},${Y(0.55)} L${X(-0.3)},${Y(0.92)} Q${X(0)},${Y(0.42)} ${X(0.3)},${Y(0.92)} L${X(0.62)},${Y(0.55)}`} fill="none" stroke={R2} strokeWidth={h * 0.022} />
          {suspenders}
        </G>
      );
    }

    case 'emblem_sydney': {
      const W = '#f6f2e8', WD = '#d8cfc0', DK = '#8a8070';
      const shell = (x0: number, x1: number, hh: number, flip: boolean, key: number) => {
        const mid = (x0 + x1) / 2;
        const peak = flip ? x0 : mid;
        return (
          <G key={key}>
            <Path d={`M${X(x0)},${Y(0.09)} Q${X(peak)},${Y(hh)} ${X(x1)},${Y(0.09)} Z`} fill={W} stroke={DK} strokeWidth={sw} />
            <Path d={`M${X(x0)},${Y(0.09)} Q${X(peak)},${Y(hh)} ${X(x1)},${Y(0.09)} L${X(x1 - 0.04)},${Y(0.09)} Q${X(flip ? x0 + 0.03 : mid)},${Y(hh * 0.82)} ${X(x0 + 0.02)},${Y(0.09)} Z`} fill={WD} opacity={0.7} />
          </G>
        );
      };
      return (
        <G>
          <Polygon points={poly([[-0.62, 0], [0.62, 0], [0.56, 0.09], [-0.56, 0.09]])} fill="#c8bfa8" stroke={DK} strokeWidth={sw} />
          {shell(-0.55, -0.12, 0.72, false, 1)}
          {shell(-0.38, 0.02, 0.55, false, 2)}
          {shell(0.02, 0.5, 0.85, true, 3)}
          {shell(0.14, 0.56, 0.6, true, 4)}
        </G>
      );
    }

    case 'emblem_greatwall': {
      const W1 = '#b9a888', W2 = '#94805e', DK = '#5a4c34';
      const merlons = [];
      for (let i = 0; i < 11; i++) {
        const t = -0.55 + i * 0.11;
        const yy = 0.12 + Math.sin((t + 0.6) * 2.6) * 0.11;
        merlons.push(<Rect key={i} x={X(t)} y={Y(yy + 0.05)} width={0.035 * h} height={0.045 * h} fill={W2} />);
      }
      return (
        <G>
          {/* wall snaking over the ridge */}
          <Path d={`M${X(-0.6)},${Y(0.12)} Q${X(-0.3)},${Y(0.34)} ${X(0)},${Y(0.22)} Q${X(0.3)},${Y(0.1)} ${X(0.6)},${Y(0.3)} L${X(0.6)},${Y(0.02)} Q${X(0.3)},${Y(-0.14)} ${X(0)},${Y(-0.02)} Q${X(-0.3)},${Y(0.1)} ${X(-0.6)},${Y(-0.1)} Z`} fill={W1} stroke={DK} strokeWidth={sw} />
          <Path d={`M${X(-0.6)},${Y(0.12)} Q${X(-0.3)},${Y(0.34)} ${X(0)},${Y(0.22)} Q${X(0.3)},${Y(0.1)} ${X(0.6)},${Y(0.3)}`} fill="none" stroke={DK} strokeWidth={h * 0.012} />
          {merlons}
          {/* watchtower */}
          <Rect x={X(-0.09)} y={Y(0.62)} width={0.18 * h} height={0.42 * h} fill={W1} stroke={DK} strokeWidth={sw} />
          <Rect x={X(-0.12)} y={Y(0.7)} width={0.24 * h} height={0.09 * h} fill={W2} stroke={DK} strokeWidth={sw} />
          <Path d={`M${X(-0.12)},${Y(0.7)} Q${X(0)},${Y(0.82)} ${X(0.12)},${Y(0.7)} Z`} fill="#8a4a3a" stroke={DK} strokeWidth={sw} />
          <Rect x={X(-0.028)} y={Y(0.38)} width={0.056 * h} height={0.16 * h} fill={DK} opacity={0.6} rx={h * 0.02} />
        </G>
      );
    }

    // ── Mode Histoire : emblèmes EXCLUSIFS (héraldiques, sur la face par défaut) ──
    case 'emblem_st_star': {
      const G6 = '#e8c45a'; const ccy = by - h * 0.5;
      const pts: [number, number][] = [];
      for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8 - Math.PI / 2; const rr = i % 2 ? 0.24 : 0.5; pts.push([Math.cos(a) * rr, 0.5 + Math.sin(a) * rr]); }
      return (
        <G>
          <Circle cx={bx} cy={ccy} r={h * 0.58} fill="#ffe9a8" opacity={0.12} />
          <Polygon points={poly(pts)} fill={G6} stroke="#8a5a12" strokeWidth={sw} strokeLinejoin="round" />
          <Circle cx={bx} cy={ccy} r={h * 0.2} fill="#12203a" stroke={G6} strokeWidth={h * 0.022} />
          <Circle cx={bx} cy={ccy} r={h * 0.06} fill="#c0341a" />
        </G>
      );
    }
    case 'emblem_st_summit': {
      const R3 = '#c0341a';
      return (
        <G>
          <Polygon points={poly([[-0.46, 0], [-0.06, 0.72], [0.1, 0.5], [0.46, 0]])} fill="#5a6b7a" stroke="#3f4c5a" strokeWidth={sw} strokeLinejoin="round" />
          <Polygon points={poly([[-0.06, 0.72], [0.1, 0.5], [0.46, 0], [0.18, 0]])} fill="#455360" opacity={0.6} />
          <Polygon points={poly([[-0.20, 0.42], [-0.06, 0.72], [0.05, 0.55], [-0.02, 0.48]])} fill="#eef4fa" />
          <Line x1={X(-0.06)} y1={Y(0.72)} x2={X(-0.06)} y2={Y(1.2)} stroke="#8a5a12" strokeWidth={h * 0.028} strokeLinecap="round" />
          <Polygon points={poly([[-0.06, 1.18], [0.3, 1.06], [-0.06, 0.92]])} fill={R3} stroke="#8a2a1e" strokeWidth={sw} strokeLinejoin="round" />
        </G>
      );
    }
    case 'emblem_st_worldtree': {
      const TR = '#6a4a24', LEAF = ['#2e6e2a', '#357a2f', '#4fae5a'];
      const canopy = [];
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const rr = h * (0.12 + (i % 3) * 0.05); canopy.push(<Circle key={i} cx={X(Math.cos(a) * 0.28)} cy={Y(1.0 + Math.sin(a) * 0.22)} r={rr} fill={LEAF[i % 3]} />); }
      return (
        <G>
          <Circle cx={X(0)} cy={Y(1.0)} r={h * 0.42} fill="#1f6b3a" opacity={0.18} />
          <Path d={`M${X(-0.05)},${Y(0)} L${X(-0.05)},${Y(0.78)} M${X(0.05)},${Y(0)} L${X(0.05)},${Y(0.78)} M${X(0)},${Y(0.5)} L${X(-0.22)},${Y(0.72)} M${X(0)},${Y(0.5)} L${X(0.22)},${Y(0.72)}`} stroke={TR} strokeWidth={h * 0.05} fill="none" strokeLinecap="round" />
          {canopy}
          <Path d={`M${X(-0.18)},${Y(0)} Q${X(0)},${Y(0.14)} ${X(0.18)},${Y(0)}`} stroke={TR} strokeWidth={h * 0.03} fill="none" opacity={0.6} />
        </G>
      );
    }
    case 'emblem_st_laurel': {
      const branch = (dir: number) => Array.from({ length: 6 }).map((_, i) => {
        const t = 0.1 + i * 0.15;
        const bx2 = dir * (0.36 - t * 0.18), by2 = t;
        const rot = dir > 0 ? -50 + i * 6 : 230 - i * 6;
        return <Ellipse key={`${dir}${i}`} cx={X(bx2)} cy={Y(by2)} rx={h * 0.09} ry={h * 0.04} fill="#4fae5a" stroke="#2f7a3a" strokeWidth={sw * 0.8} rotation={rot} originX={X(bx2)} originY={Y(by2)} />;
      });
      return (
        <G>
          <Path d={`M${X(-0.34)},${Y(0)} Q${X(-0.2)},${Y(0.9)} ${X(0)},${Y(1.0)} Q${X(0.2)},${Y(0.9)} ${X(0.34)},${Y(0)}`} fill="none" stroke="#3f8a4a" strokeWidth={h * 0.02} />
          {branch(-1)}{branch(1)}
          <Polygon points={poly([[0, 1.28], [0.08, 1.02], [0, 0.78], [-0.08, 1.02]])} fill="#ffcf4a" stroke="#8a5a12" strokeWidth={sw} />
        </G>
      );
    }

    case 'emblem_compass':
    default: {
      const ccy = by - h * 0.5; const G6 = '#e8c45a';
      return (
        <G>
          <Circle cx={bx} cy={ccy} r={h * 0.5} fill="#1d2740" stroke={G6} strokeWidth={h * 0.05} />
          <Circle cx={bx} cy={ccy} r={h * 0.40} fill="none" stroke={G6} strokeWidth={h * 0.012} opacity={0.6} />
          {[45, 135, 225, 315].map((d, i) => {
            const a = (d * Math.PI) / 180;
            return <Line key={i} x1={bx} y1={ccy} x2={bx + Math.cos(a) * h * 0.34} y2={ccy + Math.sin(a) * h * 0.34} stroke={G6} strokeWidth={h * 0.01} opacity={0.5} />;
          })}
          <Polygon points={poly([[-0.40, 0.5], [0, 0.58], [0.40, 0.5], [0, 0.42]])} fill={G6} opacity={0.85} />
          <Polygon points={poly([[0, 0.92], [0.09, 0.5], [0, 0.08], [-0.09, 0.5]])} fill="#f6efe0" />
          <Polygon points={poly([[0, 0.92], [0.06, 0.5], [-0.06, 0.5]])} fill="#d24b3a" />
          <Circle cx={bx} cy={ccy} r={h * 0.04} fill="#fff" />
        </G>
      );
    }
  }
}

// ── Satellites — ride the orbit. centre (cx, cy), scale s (px) ───────────────

interface SatelliteProps { id: string; cx: number; cy: number; s: number; }

export function SatelliteGlyph({ id, cx, cy, s }: SatelliteProps) {
  const X = (u: number) => cx + u * s;
  const Y = (u: number) => cy + u * s;
  const poly = (pts: [number, number][]) => pts.map(([a, b]) => `${X(a).toFixed(1)},${Y(b).toFixed(1)}`).join(' ');

  switch (id) {
    case 'sat_moon':
      return (
        <G>
          <Circle cx={cx} cy={cy} r={s * 0.5} fill="#e2e4ec" />
          <Path d={`M${X(0)},${Y(-0.5)} A${s * 0.5},${s * 0.5} 0 0 1 ${X(0)},${Y(0.5)} A${s * 0.32},${s * 0.5} 0 0 0 ${X(0)},${Y(-0.5)} Z`} fill="#c2c5d2" opacity={0.6} />
          <Circle cx={X(-0.16)} cy={Y(-0.12)} r={s * 0.11} fill="#c2c5d2" />
          <Circle cx={X(-0.16)} cy={Y(-0.12)} r={s * 0.07} fill="#b3b6c4" />
          <Circle cx={X(0.14)} cy={Y(0.14)} r={s * 0.08} fill="#bcbfcd" />
          <Circle cx={X(0.04)} cy={Y(-0.28)} r={s * 0.05} fill="#bcbfcd" />
          <Circle cx={X(-0.02)} cy={Y(0.30)} r={s * 0.045} fill="#bcbfcd" />
        </G>
      );

    case 'sat_plane': {
      const body = '#f2f5fa', wing = '#c4cedd', dk = '#7c8596', acc = '#3f74c4', win = '#22405e';
      return (
        <G>
          <Polygon points={poly([[-0.085, -0.04], [-0.52, 0.20], [-0.52, 0.30], [-0.07, 0.12]])} fill={wing} stroke={dk} strokeWidth={s * 0.012} />
          <Polygon points={poly([[0.085, -0.04], [0.52, 0.20], [0.52, 0.30], [0.07, 0.12]])} fill={wing} stroke={dk} strokeWidth={s * 0.012} />
          <Polygon points={poly([[-0.05, 0.34], [-0.27, 0.46], [-0.27, 0.52], [-0.04, 0.44]])} fill={wing} stroke={dk} strokeWidth={s * 0.01} />
          <Polygon points={poly([[0.05, 0.34], [0.27, 0.46], [0.27, 0.52], [0.04, 0.44]])} fill={wing} stroke={dk} strokeWidth={s * 0.01} />
          <Ellipse cx={X(-0.28)} cy={Y(0.20)} rx={s * 0.045} ry={s * 0.10} fill="#9aa4b4" stroke={dk} strokeWidth={s * 0.01} />
          <Ellipse cx={X(0.28)} cy={Y(0.20)} rx={s * 0.045} ry={s * 0.10} fill="#9aa4b4" stroke={dk} strokeWidth={s * 0.01} />
          <Path d={`M${X(0)},${Y(-0.56)} C${X(0.092)},${Y(-0.42)} ${X(0.10)},${Y(0.34)} ${X(0.072)},${Y(0.52)} Q${X(0)},${Y(0.60)} ${X(-0.072)},${Y(0.52)} C${X(-0.10)},${Y(0.34)} ${X(-0.092)},${Y(-0.42)} ${X(0)},${Y(-0.56)} Z`} fill={body} stroke={dk} strokeWidth={s * 0.018} />
          <Path d={`M${X(0)},${Y(-0.56)} C${X(0.055)},${Y(-0.49)} ${X(0.055)},${Y(-0.42)} ${X(0)},${Y(-0.40)} C${X(-0.055)},${Y(-0.42)} ${X(-0.055)},${Y(-0.49)} ${X(0)},${Y(-0.56)} Z`} fill={win} />
          <Rect x={X(-0.015)} y={Y(-0.32)} width={0.03 * s} height={0.5 * s} fill={acc} opacity={0.45} />
          {[-0.30, -0.18, -0.06, 0.06, 0.18].map((yy, i) => (
            <Circle key={i} cx={cx} cy={Y(yy)} r={s * 0.018} fill={win} />
          ))}
        </G>
      );
    }

    case 'sat_balloon': {
      const A = '#e8584e', B = '#f4c542', AD = '#c2413a', seam = '#9a3b34', basket = '#7a4d24';
      const env = `M${X(0)},${Y(0.30)} C${X(-0.47)},${Y(0.14)} ${X(-0.48)},${Y(-0.48)} ${X(0)},${Y(-0.62)} C${X(0.48)},${Y(-0.48)} ${X(0.47)},${Y(0.14)} ${X(0)},${Y(0.30)} Z`;
      const goreC = `M${X(0)},${Y(0.30)} C${X(-0.15)},${Y(0.12)} ${X(-0.155)},${Y(-0.46)} ${X(0)},${Y(-0.62)} C${X(0.155)},${Y(-0.46)} ${X(0.15)},${Y(0.12)} ${X(0)},${Y(0.30)} Z`;
      const goreL = `M${X(-0.135)},${Y(0.235)} C${X(-0.34)},${Y(0.10)} ${X(-0.40)},${Y(-0.34)} ${X(-0.265)},${Y(-0.535)} C${X(-0.27)},${Y(-0.28)} ${X(-0.25)},${Y(0.02)} ${X(-0.135)},${Y(0.235)} Z`;
      const goreR = `M${X(0.135)},${Y(0.235)} C${X(0.34)},${Y(0.10)} ${X(0.40)},${Y(-0.34)} ${X(0.265)},${Y(-0.535)} C${X(0.27)},${Y(-0.28)} ${X(0.25)},${Y(0.02)} ${X(0.135)},${Y(0.235)} Z`;
      return (
        <G>
          <Path d={env} fill={A} stroke={seam} strokeWidth={s * 0.01} />
          <Path d={goreC} fill={B} />
          <Path d={goreL} fill={B} />
          <Path d={goreR} fill={B} />
          <Path d={`M${X(0)},${Y(0.30)} C${X(-0.30)},${Y(0.16)} ${X(-0.34)},${Y(-0.18)} ${X(-0.30)},${Y(-0.30)} C${X(-0.12)},${Y(0.06)} ${X(0.12)},${Y(0.06)} ${X(0.30)},${Y(-0.30)} C${X(0.34)},${Y(-0.18)} ${X(0.30)},${Y(0.16)} ${X(0)},${Y(0.30)} Z`} fill={AD} opacity={0.28} />
          <Path d={`M${X(0)},${Y(-0.62)} C${X(-0.155)},${Y(-0.46)} ${X(-0.15)},${Y(0.12)} ${X(0)},${Y(0.30)}`} fill="none" stroke={seam} strokeWidth={s * 0.007} opacity={0.5} />
          <Path d={`M${X(0)},${Y(-0.62)} C${X(0.155)},${Y(-0.46)} ${X(0.15)},${Y(0.12)} ${X(0)},${Y(0.30)}`} fill="none" stroke={seam} strokeWidth={s * 0.007} opacity={0.5} />
          <Ellipse cx={cx} cy={Y(-0.605)} rx={s * 0.055} ry={s * 0.022} fill={AD} />
          <Path d={`M${X(-0.13)},${Y(0.30)} L${X(0.13)},${Y(0.30)} L${X(0.075)},${Y(0.42)} L${X(-0.075)},${Y(0.42)} Z`} fill="#caa15a" />
          <Polygon points={poly([[-0.045, 0.42], [0.045, 0.42], [0.015, 0.53], [-0.015, 0.53]])} fill="#ff9d3a" />
          <Line x1={X(-0.115)} y1={Y(0.31)} x2={X(-0.06)} y2={Y(0.56)} stroke={basket} strokeWidth={s * 0.015} />
          <Line x1={X(0.115)} y1={Y(0.31)} x2={X(0.06)} y2={Y(0.56)} stroke={basket} strokeWidth={s * 0.015} />
          <Rect x={X(-0.07)} y={Y(0.56)} width={0.14 * s} height={0.12 * s} rx={s * 0.02} fill={basket} stroke="#5a3a1a" strokeWidth={s * 0.01} />
        </G>
      );
    }

    case 'sat_satellite': {
      const panelCells = (px: number, tag: string) => {
        const out: React.ReactElement[] = [];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
          out.push(<Rect key={`${tag}${i}${j}`} x={X(px + i * 0.1)} y={Y(-0.16 + j * 0.16)} width={0.09 * s} height={0.15 * s} fill="#4f88d8" opacity={0.5} />);
        }
        return out;
      };
      return (
        <G>
          <Rect x={X(-0.52)} y={Y(-0.18)} width={0.30 * s} height={0.36 * s} fill="#2f63b4" stroke="#1b3a66" strokeWidth={s * 0.02} />
          <Rect x={X(0.22)} y={Y(-0.18)} width={0.30 * s} height={0.36 * s} fill="#2f63b4" stroke="#1b3a66" strokeWidth={s * 0.02} />
          {panelCells(-0.50, 'l')}{panelCells(0.24, 'r')}
          <Line x1={X(-0.22)} y1={cy} x2={X(-0.13)} y2={cy} stroke="#a8842e" strokeWidth={s * 0.03} />
          <Line x1={X(0.22)} y1={cy} x2={X(0.13)} y2={cy} stroke="#a8842e" strokeWidth={s * 0.03} />
          <Rect x={X(-0.13)} y={Y(-0.22)} width={0.26 * s} height={0.44 * s} rx={s * 0.03} fill="#dcb24a" stroke="#a8842e" strokeWidth={s * 0.02} />
          <Line x1={X(-0.13)} y1={cy} x2={X(0.13)} y2={cy} stroke="#a8842e" strokeWidth={s * 0.012} />
          <Path d={`M${X(-0.10)},${Y(-0.40)} Q${X(0)},${Y(-0.20)} ${X(0.10)},${Y(-0.40)} Z`} fill="#d7dde8" stroke="#1b3a66" strokeWidth={s * 0.015} />
          <Line x1={cx} y1={Y(-0.22)} x2={cx} y2={Y(-0.32)} stroke="#d7dde8" strokeWidth={s * 0.02} />
        </G>
      );
    }

    case 'sat_iss': {
      const arr = (px: number, key: number) => (
        <G key={key}>
          <Rect x={X(px)} y={Y(-0.46)} width={0.26 * s} height={0.34 * s} fill="#2f63b4" stroke="#1b3a66" strokeWidth={s * 0.015} />
          <Rect x={X(px)} y={Y(0.12)} width={0.26 * s} height={0.34 * s} fill="#2f63b4" stroke="#1b3a66" strokeWidth={s * 0.015} />
          <Line x1={X(px + 0.13)} y1={Y(-0.46)} x2={X(px + 0.13)} y2={Y(-0.12)} stroke="#4f88d8" strokeWidth={s * 0.01} />
          <Line x1={X(px + 0.13)} y1={Y(0.12)} x2={X(px + 0.13)} y2={Y(0.46)} stroke="#4f88d8" strokeWidth={s * 0.01} />
        </G>
      );
      return (
        <G>
          <Rect x={X(-0.58)} y={Y(-0.05)} width={1.16 * s} height={0.10 * s} fill="#b9c0cc" stroke="#1b3a66" strokeWidth={s * 0.012} />
          {arr(-0.56, 1)}{arr(-0.13, 2)}{arr(0.30, 3)}
          <Rect x={X(-0.12)} y={Y(-0.16)} width={0.24 * s} height={0.32 * s} rx={s * 0.05} fill="#d7dde8" stroke="#1b3a66" strokeWidth={s * 0.015} />
          <Rect x={X(-0.05)} y={Y(-0.30)} width={0.10 * s} height={0.16 * s} rx={s * 0.03} fill="#d7dde8" />
        </G>
      );
    }

    case 'sat_rocket':
      return (
        <G>
          <Path d={`M${X(0)},${Y(-0.55)} C${X(0.16)},${Y(-0.3)} ${X(0.15)},${Y(0.1)} ${X(0.1)},${Y(0.3)} L${X(-0.1)},${Y(0.3)} C${X(-0.15)},${Y(0.1)} ${X(-0.16)},${Y(-0.3)} ${X(0)},${Y(-0.55)} Z`} fill="#e8ecf2" stroke="#7c8596" strokeWidth={s * 0.02} />
          <Circle cx={X(0)} cy={Y(-0.14)} r={s * 0.085} fill="#22405e" stroke="#4f8ef7" strokeWidth={s * 0.018} />
          <Polygon points={poly([[-0.1, 0.1], [-0.26, 0.38], [-0.1, 0.32]])} fill="#d24b3a" stroke="#8a2a1e" strokeWidth={s * 0.015} />
          <Polygon points={poly([[0.1, 0.1], [0.26, 0.38], [0.1, 0.32]])} fill="#d24b3a" stroke="#8a2a1e" strokeWidth={s * 0.015} />
          <Polygon points={poly([[-0.06, 0.3], [0.06, 0.3], [0, 0.42]])} fill="#c4cedd" />
          <Polygon points={poly([[-0.05, 0.42], [0.05, 0.42], [0, 0.62]])} fill="#ffb03a" />
          <Polygon points={poly([[-0.025, 0.42], [0.025, 0.42], [0, 0.54]])} fill="#ffe27a" />
        </G>
      );

    case 'sat_ufo':
      return (
        <G>
          <Path d={`M${X(-0.2)},${Y(-0.14)} A${s * 0.2},${s * 0.16} 0 0 1 ${X(0.2)},${Y(-0.14)} Z`} fill="#9fd8e8" fillOpacity={0.85} stroke="#5fa8c8" strokeWidth={s * 0.015} />
          <Polygon points={poly([[-0.14, 0.1], [0.14, 0.1], [0.26, 0.55], [-0.26, 0.55]])} fill="#aef8a0" fillOpacity={0.22} />
          <Ellipse cx={X(0)} cy={Y(-0.02)} rx={s * 0.5} ry={s * 0.16} fill="#b8c4d8" stroke="#5a6478" strokeWidth={s * 0.02} />
          <Ellipse cx={X(0)} cy={Y(-0.07)} rx={s * 0.34} ry={s * 0.09} fill="#dce4f0" />
          {[-0.34, -0.12, 0.12, 0.34].map((dx, i) => (
            <Circle key={i} cx={X(dx)} cy={Y(0.02)} r={s * 0.035} fill="#ffe27a" stroke="#a8842e" strokeWidth={s * 0.008} />
          ))}
        </G>
      );

    case 'sat_paperplane':
      return (
        <G>
          <Polygon points={poly([[-0.5, 0.28], [0.55, -0.4], [0.05, 0.42]])} fill="#f4f7fc" stroke="#8a94a8" strokeWidth={s * 0.02} />
          <Polygon points={poly([[-0.5, 0.28], [0.55, -0.4], [-0.12, 0.16]])} fill="#d8e0ec" stroke="#8a94a8" strokeWidth={s * 0.02} />
          <Polygon points={poly([[-0.12, 0.16], [0.05, 0.42], [-0.02, 0.16]])} fill="#b8c2d4" />
        </G>
      );

    case 'sat_bird':
      return (
        <G>
          <Path d={`M${X(-0.5)},${Y(-0.05)} Q${X(-0.25)},${Y(-0.32)} ${X(0)},${Y(-0.05)} Q${X(0.25)},${Y(-0.32)} ${X(0.5)},${Y(-0.05)}`} fill="none" stroke="#e8ecf6" strokeWidth={s * 0.05} strokeLinecap="round" />
          <Path d={`M${X(-0.28)},${Y(0.22)} Q${X(-0.12)},${Y(0.05)} ${X(0.04)},${Y(0.22)} Q${X(0.2)},${Y(0.05)} ${X(0.36)},${Y(0.22)}`} fill="none" stroke="#aab6cc" strokeWidth={s * 0.04} strokeLinecap="round" />
        </G>
      );

    case 'sat_shootingstar': {
      const s2 = s * 0.26;
      return (
        <G>
          {/* fading golden trail (layered strokes stand in for a gradient) */}
          <Polygon points={poly([[0, -0.06], [-1.5, -0.22], [-1.5, 0.16], [0, 0.08]])} fill="#ffd700" fillOpacity={0.16} />
          <Polygon points={poly([[0, -0.04], [-1.05, -0.14], [-1.05, 0.1], [0, 0.06]])} fill="#ffd700" fillOpacity={0.3} />
          <Polygon points={poly([[0, -0.03], [-0.6, -0.08], [-0.6, 0.06], [0, 0.04]])} fill="#ffe27a" fillOpacity={0.55} />
          <Path d={`M${cx},${cy - s2} L${cx + s2 * 0.35},${cy - s2 * 0.35} L${cx + s2},${cy} L${cx + s2 * 0.35},${cy + s2 * 0.35} L${cx},${cy + s2} L${cx - s2 * 0.35},${cy + s2 * 0.35} L${cx - s2},${cy} L${cx - s2 * 0.35},${cy - s2 * 0.35} Z`} fill="#ffd700" stroke="#fff2b8" strokeWidth={s * 0.02} />
          <Circle cx={cx} cy={cy} r={s * 0.09} fill="#fffbe8" />
        </G>
      );
    }

    // ── Mode Histoire : satellites EXCLUSIFS ──
    case 'sat_st_moon':
      return (
        <G>
          <Circle cx={cx} cy={cy} r={s * 0.5} fill="#e2e4ec" />
          <Path d={`M${X(0)},${Y(-0.5)} A${s * 0.5},${s * 0.5} 0 0 1 ${X(0)},${Y(0.5)} A${s * 0.32},${s * 0.5} 0 0 0 ${X(0)},${Y(-0.5)} Z`} fill="#c2c5d2" opacity={0.55} />
          <Circle cx={X(-0.16)} cy={Y(-0.12)} r={s * 0.1} fill="#b3b6c4" />
          <Circle cx={X(0.14)} cy={Y(0.16)} r={s * 0.07} fill="#bcbfcd" />
          {/* golden trophy star */}
          <Path d={`M${X(0)},${Y(-0.02)} l${s * 0.06},${s * 0.12} l${s * 0.13},${s * 0.01} l${-s * 0.1},${s * 0.09} l${s * 0.04},${s * 0.13} l${-s * 0.13},${-s * 0.07} l${-s * 0.13},${s * 0.07} l${s * 0.04},${-s * 0.13} l${-s * 0.1},${-s * 0.09} l${s * 0.13},${-s * 0.01} Z`} fill="#ffcf4a" stroke="#c99a1a" strokeWidth={s * 0.01} />
        </G>
      );
    case 'sat_st_ship':
      return (
        <G>
          {/* hull */}
          <Path d={`M${X(-0.34)},${Y(-0.02)} L${X(0.34)},${Y(-0.02)} L${X(0.2)},${Y(0.24)} L${X(-0.2)},${Y(0.24)} Z`} fill="#8a5a2a" stroke="#5a3a1a" strokeWidth={s * 0.02} />
          <Rect x={X(-0.34)} y={Y(0.02)} width={0.68 * s} height={0.05 * s} fill="#caa15a" />
          {/* mast + sail */}
          <Line x1={cx} y1={Y(0.24)} x2={cx} y2={Y(0.62)} stroke="#5a3a1a" strokeWidth={s * 0.03} />
          <Path d={`M${X(0.02)},${Y(0.58)} Q${X(0.34)},${Y(0.4)} ${X(0.04)},${Y(0.26)} Z`} fill="#f0e8d8" stroke="#c4b898" strokeWidth={s * 0.012} />
          <Path d={`M${X(-0.02)},${Y(0.56)} Q${X(-0.28)},${Y(0.4)} ${X(-0.04)},${Y(0.28)} Z`} fill="#dfe6ef" stroke="#c4b898" strokeWidth={s * 0.012} />
          <Polygon points={poly([[0, 0.62], [0.14, 0.58], [0, 0.54]])} fill="#c0341a" />
        </G>
      );
    case 'sat_st_comet':
      return (
        <G>
          <Polygon points={poly([[0, 0], [1.55, -0.34], [1.75, 0.06], [1.2, 0.40]])} fill="#ffe9a8" fillOpacity={0.2} />
          <Polygon points={poly([[0, 0], [1.35, -0.20], [1.5, 0.06], [1.05, 0.28]])} fill="#ffd97a" fillOpacity={0.4} />
          <Polygon points={poly([[0, 0], [1.05, -0.09], [1.15, 0.05], [0.85, 0.17]])} fill="#fff2c8" fillOpacity={0.75} />
          <Circle cx={cx} cy={cy} r={s * 0.32} fill="#ffe9a8" fillOpacity={0.5} />
          <Circle cx={cx} cy={cy} r={s * 0.2} fill="#ffd700" />
          <Circle cx={cx} cy={cy} r={s * 0.1} fill="#fffbe8" />
        </G>
      );

    case 'sat_comet':
    default:
      return (
        <G>
          <Polygon points={poly([[0, 0], [1.55, -0.34], [1.75, 0.06], [1.2, 0.40]])} fill="#9fd4ff" fillOpacity={0.18} />
          <Polygon points={poly([[0, 0], [1.35, -0.20], [1.5, 0.06], [1.05, 0.28]])} fill="#bfe6ff" fillOpacity={0.35} />
          <Polygon points={poly([[0, 0], [1.05, -0.09], [1.15, 0.05], [0.85, 0.17]])} fill="#eaf6ff" fillOpacity={0.7} />
          <Circle cx={cx} cy={cy} r={s * 0.34} fill="#bfe6ff" fillOpacity={0.5} />
          <Circle cx={cx} cy={cy} r={s * 0.22} fill="#eaf6ff" />
          <Circle cx={cx} cy={cy} r={s * 0.13} fill="#ffffff" />
        </G>
      );
  }
}

/** Rotation (deg) to apply around the satellite's centre so it faces correctly
 *  while travelling the orbit at screen position angle aDeg (0=right, +clockwise). */
export function satelliteOrient(id: string, aDeg: number): number {
  switch (id) {
    case 'sat_plane': return aDeg + 180;      // nose along travel
    case 'sat_satellite': return aDeg - 90;   // dish faces Earth
    case 'sat_iss': return aDeg + 90;         // panels tangent
    case 'sat_comet': return aDeg - 90;       // tail trails motion
    case 'sat_st_comet': return aDeg - 90;    // golden tail trails motion
    case 'sat_rocket': return aDeg + 180;     // nose along travel
    case 'sat_paperplane': return aDeg + 135; // nose (drawn at ~-45°) along travel
    case 'sat_shootingstar': return aDeg + 90; // tail (drawn at 180°) trails motion
    default: return 0;                         // moon / balloon / bird / ufo / trophy / ship stay upright
  }
}

/** Per-satellite scale so each has a consistent apparent size despite very
 *  different intrinsic extents (the ISS is wide, the comet has a long tail). */
export function satelliteScale(id: string): number {
  switch (id) {
    case 'sat_iss': return 0.72;
    case 'sat_comet': return 0.82;
    case 'sat_moon': return 0.9;
    case 'sat_satellite': return 0.92;
    case 'sat_shootingstar': return 0.85;
    case 'sat_paperplane': return 0.9;
    case 'sat_bird': return 0.95;
    case 'sat_st_comet': return 0.82;
    case 'sat_st_moon': return 0.9;
    default: return 1;
  }
}

// ── Standalone thumbnail (shop / editor tiles) ───────────────────────────────

export function GlyphThumb({ id, category, size }: { id: string; category: CosmeticCategory; size: number }) {
  if (category === 'emblem') {
    const by = size * 0.9, h = size * 0.74;
    return (
      <Svg width={size} height={size}>
        {/* warm ground spotlight + contact shadow (matches WorldAvatar) */}
        <Ellipse cx={size / 2} cy={by} rx={h * 0.46} ry={h * 0.11} fill="#ffce6a" opacity={0.13} />
        <Ellipse cx={size / 2} cy={by} rx={h * 0.34} ry={h * 0.07} fill="#00040a" opacity={0.28} />
        <EmblemGlyph id={id} bx={size / 2} by={by} h={h} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size}>
      <SatelliteGlyph id={id} cx={size / 2} cy={size / 2} s={size * 0.78 * satelliteScale(id)} />
    </Svg>
  );
}
