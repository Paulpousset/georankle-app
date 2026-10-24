// Fonds COSMOS du pack cosmétique — backdrops carrés, rendus finaux (pas de
// passage Blender : ce sont des 2D). DA cartoon pro : dégradés riches, étoiles,
// effets par style. Dessinés sur une grille d'auteur 512², sortis en deux tailles :
//   out/<id>.png     512²  → couche des vignettes/listes (<WorldAvatar3D>)
//   out/<id>_hd.png 2048²  → fond plein cadre des scènes three.js (héros du
//                            profil, globe de jeu) : un 512² y était agrandi ~5×,
//                            flou et pixelisé (retour Paul 24/10/2026).
//   cd asset-pipeline && node gen_cosmos_textures.mjs
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const S = 512;
/** HD rasterisation multiplier over the 512 authoring grid (see the density call below). */
const HD_SCALE = 4;

function rngFactory(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const star = (x, y, r, o, c = '#ffffff') =>
  `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${c}" opacity="${o.toFixed(2)}"/>`;

function stars(rnd, n, alpha = 0.9, c = '#ffffff') {
  let out = '';
  for (let i = 0; i < n; i++) out += star(rnd() * S, rnd() * S, 0.6 + rnd() * 1.8, alpha * (0.3 + rnd() * 0.7), c);
  return out;
}

function radial(id, cx, cy, r, stops) {
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops
    .map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op != null ? ` stop-opacity="${op}"` : ''}/>`)
    .join('')}</radialGradient>`;
}

// Chaque style = fond dégradé + décor. `base` = [couleur centre, bord].
const COSMOS = {
  cosmos_starfield: (rnd) => ({
    defs: radial('g', '50%', '38%', '80%', [[0, '#101a3e'], [1, '#04060f']]),
    body: stars(rnd, 260),
  }),
  cosmos_sunrise: (rnd) => ({
    defs: radial('g', '50%', '95%', '95%', [[0, '#ffb26b'], [0.35, '#f0894a'], [0.7, '#43305c'], [1, '#131028']]),
    body: stars(rnd, 60, 0.5) +
      `<circle cx="${S / 2}" cy="${S * 0.98}" r="${S * 0.22}" fill="#ffe1b0" opacity="0.95"/>` +
      `<circle cx="${S / 2}" cy="${S * 0.98}" r="${S * 0.30}" fill="#ffcf8a" opacity="0.35"/>`,
  }),
  cosmos_aurora: (rnd) => {
    let curtains = '';
    for (let i = 0; i < 5; i++) {
      const x = S * 0.10 + i * S * 0.18 + (rnd() - 0.5) * 26;
      const w = 26 + rnd() * 40;
      curtains += `<path d="M${x},${S * 0.02} C${x + 70},${S * 0.3} ${x - 50},${S * 0.55} ${x + 30},${S * 0.86} L${x + 30 + w},${S * 0.86} C${x - 50 + w},${S * 0.55} ${x + 70 + w},${S * 0.3} ${x + w},${S * 0.02} Z" fill="url(#a)" opacity="${0.30 + rnd() * 0.25}" filter="url(#ab)"/>`;
    }
    return {
      defs: radial('g', '50%', '40%', '85%', [[0, '#0d2436'], [1, '#03080f']]) +
        `<linearGradient id="a" x1="0" y1="0" x2="0.15" y2="1"><stop offset="0" stop-color="#54ffc4"/><stop offset="0.55" stop-color="#1fae8b" stop-opacity="0.45"/><stop offset="1" stop-color="#3ff0b0" stop-opacity="0"/></linearGradient>` +
        `<filter id="ab" x="-40%" y="-20%" width="180%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>`,
      body: curtains + stars(rnd, 90, 0.55),
    };
  },
  cosmos_milkyway: (rnd) => {
    // étoiles concentrées le long de la bande + cœur chaud
    let bandStars = '';
    for (let i = 0; i < 260; i++) {
      const t = rnd() * 1.5 - 0.25;
      const spread = (rnd() + rnd() + rnd()) / 3 - 0.5; // ~gaussien
      const bx = t * S, by = S * 0.47 + spread * S * 0.30;
      const a = -24 * Math.PI / 180;
      const cx = S / 2 + (bx - S / 2) * Math.cos(a) - (by - S / 2) * Math.sin(a);
      const cy = S / 2 + (bx - S / 2) * Math.sin(a) + (by - S / 2) * Math.cos(a);
      bandStars += star(cx, cy, 0.5 + rnd() * 1.4, 0.35 + rnd() * 0.6,
        rnd() > 0.8 ? '#ffe2c4' : '#ffffff');
    }
    return {
      defs: radial('g', '50%', '45%', '85%', [[0, '#241a52'], [1, '#060312']]) +
        `<linearGradient id="mw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8a8ff" stop-opacity="0"/><stop offset="0.5" stop-color="#e6dcff" stop-opacity="0.34"/><stop offset="1" stop-color="#b8a8ff" stop-opacity="0"/></linearGradient>` +
        `<linearGradient id="mwc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffdcb0" stop-opacity="0"/><stop offset="0.5" stop-color="#ffe8c8" stop-opacity="0.38"/><stop offset="1" stop-color="#ffdcb0" stop-opacity="0"/></linearGradient>`,
      body: `<g transform="rotate(-24 ${S / 2} ${S / 2})">` +
        `<rect x="${-S * 0.3}" y="${S * 0.30}" width="${S * 1.6}" height="${S * 0.36}" fill="url(#mw)"/>` +
        `<rect x="${-S * 0.3}" y="${S * 0.41}" width="${S * 1.6}" height="${S * 0.14}" fill="url(#mwc)"/>` +
        `</g>` + stars(rnd, 140, 0.7) + bandStars,
    };
  },
  cosmos_nebula: (rnd) => {
    let blobs = '';
    const cols = ['#a24ad0', '#3a55c4', '#d0568a'];
    cols.forEach((c, ci) => {
      for (let i = 0; i < 3; i++) {
        const na = rnd() * Math.PI * 2, nd = S * (0.34 + rnd() * 0.24);
        const x = S / 2 + Math.cos(na) * nd, y = S / 2 + Math.sin(na) * nd, r = S * (0.14 + rnd() * 0.18);
        blobs += `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#n${ci})"/>`;
      }
    });
    return {
      defs: radial('g', '50%', '45%', '85%', [[0, '#1c1038'], [1, '#06030f']]) +
        cols.map((c, ci) => radial(`n${ci}`, '50%', '50%', '50%', [[0, c, 0.55], [1, c, 0]])).join(''),
      body: blobs + stars(rnd, 160, 0.8),
    };
  },
  cosmos_meteors: (rnd) => {
    let m = '';
    for (let i = 0; i < 15; i++) {
      const x = S * 0.15 + rnd() * S * 0.8, y = rnd() * S * 0.6, len = 45 + rnd() * 90;
      m += `<line x1="${x}" y1="${y}" x2="${x - len}" y2="${y + len * 0.62}" stroke="url(#mt)" stroke-width="${2 + rnd() * 2}" stroke-linecap="round"/>`;
    }
    return {
      defs: radial('g', '50%', '40%', '85%', [[0, '#131c3c'], [1, '#05070f']]) +
        `<linearGradient id="mt" x1="1" y1="0" x2="0" y2="0.6"><stop offset="0" stop-color="#eef4ff"/><stop offset="1" stop-color="#8fb4ff" stop-opacity="0"/></linearGradient>`,
      body: stars(rnd, 110, 0.6) + m,
    };
  },
  cosmos_constellation: (rnd) => {
    // vraies figures : Grande Ourse, Cassiopée (W), Couronne boréale
    const FIGS = [
      { pts: [[0, 30], [22, 22], [44, 26], [62, 38], [88, 34], [96, 10], [70, 4]],
        closed: false, x: 0.04, y: 0.05, s: 2.2 },
      { pts: [[0, 26], [20, 0], [42, 20], [64, 2], [86, 24]],
        closed: false, x: 0.62, y: 0.06, s: 1.9 },
      { pts: [[0, 6], [16, 22], [38, 30], [60, 24], [74, 6]],
        closed: false, x: 0.04, y: 0.80, s: 1.9 },
      { pts: [[0, 0], [18, 14], [40, 16], [58, 4], [50, 30]],
        closed: false, x: 0.70, y: 0.78, s: 1.7 },
    ];
    let lines = '', nodes = '';
    for (const f of FIGS) {
      const abs = f.pts.map(([x, y]) => [S * f.x + x * f.s, S * f.y + y * f.s]);
      for (let i = 1; i < abs.length; i++)
        lines += `<line x1="${abs[i - 1][0]}" y1="${abs[i - 1][1]}" x2="${abs[i][0]}" y2="${abs[i][1]}" stroke="#9fc0ff" stroke-width="1.6" opacity="0.55"/>`;
      nodes += abs.map(([x, y]) =>
        star(x, y, 3.4, 1.0) + star(x, y, 8, 0.22, '#bcd8ff')).join('');
    }
    return {
      defs: radial('g', '50%', '40%', '85%', [[0, '#0e1834'], [1, '#04060f']]),
      body: stars(rnd, 170, 0.55) + lines + nodes,
    };
  },
  cosmos_goldrain: (rnd) => {
    let m = '';
    for (let i = 0; i < 46; i++) {
      const x = rnd() * S, y = rnd() * S * 0.92, len = 34 + rnd() * 80;
      const w = 1.6 + rnd() * 2.0;
      m += `<line x1="${x}" y1="${y}" x2="${x - len * 0.25}" y2="${y + len}" stroke="url(#gr)" stroke-width="${w}" stroke-linecap="round"/>`;
      // tête brillante de la goutte
      m += star(x, y, w * 1.15, 0.95, '#ffe9a0');
      if (rnd() > 0.6) m += star(x, y, w * 2.6, 0.22, '#ffd25a');
    }
    return {
      defs: radial('g', '50%', '35%', '90%', [[0, '#2a1e48'], [1, '#0c0716']]) +
        `<linearGradient id="gr" x1="0" y1="0" x2="0.25" y2="1"><stop offset="0" stop-color="#ffd25a"/><stop offset="1" stop-color="#ffd25a" stop-opacity="0"/></linearGradient>`,
      body: stars(rnd, 90, 0.5, '#ffe9b0') + m,
    };
  },
  cosmos_galaxy: (rnd) => {
    let arm = '';
    for (let i = 0; i < 560; i++) {
      const a = i * 0.115, r = 2 + i * 0.30;
      const x = S * 0.27 + Math.cos(a) * r, y = S * 0.26 + Math.sin(a) * r * 0.52;
      arm += star(x, y, 0.8 + rnd() * 1.4, Math.max(0.06, 0.9 - i / 640), '#dcCcff'.replace('Cc', 'c8'));
    }
    return {
      defs: radial('g', '50%', '50%', '80%', [[0, '#1a1240'], [1, '#05030e']]) +
        radial('gc', '50%', '50%', '50%', [[0, '#fff3d8', 0.95], [1, '#fff3d8', 0]]),
      body: stars(rnd, 120, 0.5) + arm + `<circle cx="${S * 0.27}" cy="${S * 0.26}" r="${S * 0.07}" fill="url(#gc)"/>`,
    };
  },
  cosmos_solareclipse: (rnd) => ({
    defs: radial('g', '50%', '42%', '90%', [[0, '#2c1c46'], [1, '#0a0612']]) +
      radial('ec', '50%', '50%', '50%', [[0, '#ffdca0', 0], [0.72, '#ffdca0', 0.05], [0.86, '#ffe7bd', 0.9], [1, '#ffdca0', 0]]),
    body: stars(rnd, 110, 0.55) +
      `<circle cx="${S * 0.78}" cy="${S * 0.17}" r="${S * 0.135}" fill="url(#ec)"/>` +
      `<circle cx="${S * 0.78}" cy="${S * 0.17}" r="${S * 0.098}" fill="#0a0710"/>`,
  }),
  cosmos_supernova: (rnd) => {
    // explosion radiante : rayons effilés alternés + onde de choc + débris
    const cx = S * 0.76, cy = S * 0.20;
    let rays = '';
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6 + 0.13;
      const len = S * (i % 2 ? 0.20 : 0.30) * (0.9 + rnd() * 0.2);
      const w = i % 2 ? 7 : 11;
      const px = Math.cos(a), py = Math.sin(a);
      rays += `<path d="M${cx + py * w * 0.5},${cy - px * w * 0.5} L${cx + px * len},${cy + py * len} L${cx - py * w * 0.5},${cy + px * w * 0.5} Z" fill="url(#snray)" transform="rotate(0)" opacity="0.9"/>`;
    }
    let debris = '';
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, d = S * (0.12 + rnd() * 0.20);
      debris += star(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + rnd() * 2.2,
        0.5 + rnd() * 0.5, rnd() > 0.5 ? '#ffcf9a' : '#ffffff');
    }
    return {
      defs: radial('g', '73%', '24%', '95%', [[0, '#3e1a2e'], [0.55, '#1c0e24'], [1, '#080410']]) +
        radial('snray', '50%', '50%', '50%', [[0, '#ffe9cf', 0.95], [1, '#ff7a50', 0]]) +
        radial('snc', '50%', '50%', '50%', [[0, '#fff8ec', 1], [0.45, '#ffcf8a', 0.9], [1, '#ff8a50', 0]]),
      body: stars(rnd, 110, 0.5) +
        `<circle cx="${cx}" cy="${cy}" r="${S * 0.19}" fill="none" stroke="#ff9a6a" stroke-width="2.5" opacity="0.4"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${S * 0.235}" fill="none" stroke="#ff9a6a" stroke-width="1.2" opacity="0.2"/>` +
        rays + debris +
        `<circle cx="${cx}" cy="${cy}" r="${S * 0.13}" fill="url(#snc)"/>`,
    };
  },
  cosmos_blackhole: (rnd) => ({
    defs: radial('g', '50%', '45%', '90%', [[0, '#120e20'], [1, '#020108']]) +
      `<linearGradient id="bh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff9a4a" stop-opacity="0"/><stop offset="0.5" stop-color="#ffc27a"/><stop offset="1" stop-color="#ff9a4a" stop-opacity="0"/></linearGradient>`,
    body: stars(rnd, 160, 0.6) +
      `<g transform="rotate(-20 ${S * 0.79} ${S * 0.18})">` +
      `<ellipse cx="${S * 0.79}" cy="${S * 0.18}" rx="${S * 0.165}" ry="${S * 0.05}" fill="none" stroke="url(#bh)" stroke-width="8"/>` +
      `<circle cx="${S * 0.79}" cy="${S * 0.18}" r="${S * 0.072}" fill="#000000"/>` +
      `<circle cx="${S * 0.79}" cy="${S * 0.18}" r="${S * 0.079}" fill="none" stroke="#ffd9a8" stroke-width="2.5" opacity="0.85"/></g>`,
  }),
  cosmos_st_aurorastorm: (rnd) => {
    let curtains = '';
    for (let i = 0; i < 7; i++) {
      const x = S * 0.03 + i * S * 0.145 + (rnd() - 0.5) * 30;
      const w = 30 + rnd() * 46;
      curtains += `<path d="M${x},${S * 0.0} C${x + 80},${S * 0.34} ${x - 60},${S * 0.62} ${x + 34},${S * 0.99} L${x + 34 + w},${S * 0.99} C${x - 60 + w},${S * 0.62} ${x + 80 + w},${S * 0.34} ${x + w},${S * 0.0} Z" fill="url(#as)" opacity="${0.35 + rnd() * 0.3}" filter="url(#asb)"/>`;
    }
    return {
      defs: radial('g', '50%', '45%', '90%', [[0, '#06344a'], [1, '#020b12']]) +
        `<linearGradient id="as" x1="0" y1="0" x2="0.2" y2="1"><stop offset="0" stop-color="#54ffd0"/><stop offset="0.5" stop-color="#2fd0e8" stop-opacity="0.55"/><stop offset="1" stop-color="#7a5aff" stop-opacity="0"/></linearGradient>` +
        `<filter id="asb" x="-40%" y="-20%" width="180%" height="140%"><feGaussianBlur stdDeviation="8"/></filter>`,
      body: curtains + stars(rnd, 120, 0.6),
    };
  },
  cosmos_st_embersky: (rnd) => {
    let embers = '';
    for (let i = 0; i < 110; i++) {
      const y = S * 0.3 + rnd() * S * 0.7;
      embers += star(rnd() * S, y, 0.8 + rnd() * 2.6, 0.25 + rnd() * 0.65, rnd() > 0.5 ? '#ff9a3a' : '#ffbe5a');
    }
    return {
      defs: radial('g', '50%', '100%', '110%', [[0, '#5a1408'], [0.5, '#2a0a06'], [1, '#0c0304']]),
      body: embers + stars(rnd, 40, 0.3, '#ffd9b0'),
    };
  },
  // ── Vague « Nouveaux mondes » (24/10/2026) ──
  // Les fonds sont recadrés en « cover » dans les scènes 3D : en portrait seul
  // le tiers central reste visible, donc les motifs restent vers x ∈ [0.3, 0.7].
  cosmos_dusk: (rnd) => {
    let clouds = '';
    for (let i = 0; i < 7; i++) {
      const y = S * (0.72 + i * 0.045), x = rnd() * S * 0.6 - S * 0.1;
      clouds += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(S * (0.5 + rnd() * 0.4)).toFixed(0)}" height="${(6 + rnd() * 8).toFixed(0)}" rx="7" fill="#ffd2c8" opacity="${(0.25 + rnd() * 0.3).toFixed(2)}" filter="url(#dc)"/>`;
    }
    return {
      defs: `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1240"/><stop offset="0.45" stop-color="#6a2a6e"/><stop offset="0.78" stop-color="#e0708e"/><stop offset="1" stop-color="#ffb48a"/></linearGradient>` +
        `<filter id="dc" x="-10%" y="-200%" width="120%" height="500%"><feGaussianBlur stdDeviation="3"/></filter>`,
      body: stars(rnd, 70, 0.7).replace(/cy="(\d+)/g, (m, y) => `cy="${Math.round(Number(y) * 0.55)}`) + clouds +
        `<circle cx="${S * 0.64}" cy="${S * 0.15}" r="${S * 0.055}" fill="#fff3e0"/>` +
        `<circle cx="${S * 0.665}" cy="${S * 0.135}" r="${S * 0.05}" fill="#2a1848"/>`,
    };
  },
  cosmos_deepsea: (rnd) => {
    let rays = '', bubbles = '', glow = '';
    for (let i = 0; i < 6; i++) {
      const x = S * (0.15 + i * 0.14 + (rnd() - 0.5) * 0.05), w = S * (0.03 + rnd() * 0.05);
      rays += `<path d="M${x},0 L${x + w},0 L${x + w * 3 + S * 0.08},${S} L${x + S * 0.08},${S} Z" fill="url(#ray)" opacity="${(0.25 + rnd() * 0.25).toFixed(2)}"/>`;
    }
    for (let i = 0; i < 46; i++) {
      const x = rnd() * S, y = rnd() * S, r = 1.5 + rnd() * 5;
      bubbles += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="#bff4ff" stroke-width="1.2" opacity="${(0.25 + rnd() * 0.45).toFixed(2)}"/>`;
    }
    for (let i = 0; i < 18; i++) glow += star(rnd() * S, S * 0.45 + rnd() * S * 0.55, 1 + rnd() * 2.2, 0.4 + rnd() * 0.5, rnd() > 0.5 ? '#5affd8' : '#9a8cff');
    return {
      defs: radial('g', '50%', '0%', '110%', [[0, '#1a7a9e'], [0.45, '#0a3a5a'], [1, '#020a16']]) +
        `<linearGradient id="ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cff6ff" stop-opacity="0.7"/><stop offset="1" stop-color="#cff6ff" stop-opacity="0"/></linearGradient>`,
      body: rays + bubbles + glow,
    };
  },
  cosmos_ringedplanet: (rnd) => {
    const cx = S * 0.6, cy = S * 0.16, r = S * 0.1;
    return {
      defs: radial('g', '50%', '40%', '90%', [[0, '#2a1e56'], [1, '#06040f']]) +
        `<linearGradient id="pl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd7a0"/><stop offset="0.55" stop-color="#e08a5a"/><stop offset="1" stop-color="#5a2a4a"/></linearGradient>` +
        `<linearGradient id="rg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f0d8b0" stop-opacity="0.2"/><stop offset="0.5" stop-color="#fff0d8"/><stop offset="1" stop-color="#f0d8b0" stop-opacity="0.2"/></linearGradient>`,
      body: stars(rnd, 200, 0.75) +
        `<g transform="rotate(-18 ${cx} ${cy})">` +
        `<ellipse cx="${cx}" cy="${cy}" rx="${r * 2.1}" ry="${r * 0.42}" fill="none" stroke="url(#rg)" stroke-width="7" opacity="0.8"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#pl)"/>` +
        `<path d="M${cx - r},${cy - r * 0.25} Q${cx},${cy - r * 0.05} ${cx + r},${cy - r * 0.3}" fill="none" stroke="#b0604a" stroke-width="4" opacity="0.45"/>` +
        `<path d="M${cx - r * 0.95},${cy + r * 0.25} Q${cx},${cy + r * 0.45} ${cx + r * 0.95},${cy + r * 0.2}" fill="none" stroke="#fff0d0" stroke-width="3" opacity="0.35"/>` +
        `<path d="M${cx - r * 2.1},${cy} A${r * 2.1},${r * 0.42} 0 0 0 ${cx + r * 2.1},${cy}" fill="none" stroke="url(#rg)" stroke-width="7"/></g>` +
        star(S * 0.35, S * 0.3, 3, 0.9, '#cfe0ff'),
    };
  },
  cosmos_synthwave: (rnd) => {
    const hy = S * 0.8, sr = S * 0.2;
    let grid = '', stripes = '';
    for (let i = -10; i <= 10; i++) {
      grid += `<line x1="${S / 2 + i * S * 0.04}" y1="${hy}" x2="${S / 2 + i * S * 0.2}" y2="${S}" stroke="#ff4ad8" stroke-width="1.6" opacity="0.8"/>`;
    }
    for (let k = 1; k <= 6; k++) {
      const y = hy + (S - hy) * Math.pow(k / 6, 1.8);
      grid += `<line x1="0" y1="${y.toFixed(1)}" x2="${S}" y2="${y.toFixed(1)}" stroke="#ff4ad8" stroke-width="1.6" opacity="0.8"/>`;
    }
    for (let k = 0; k < 5; k++) {
      const y = hy - sr * (0.08 + k * 0.17);
      stripes += `<rect x="${S / 2 - sr}" y="${y.toFixed(1)}" width="${sr * 2}" height="${(2 + k * 1.4).toFixed(1)}" fill="#2a0a3a"/>`;
    }
    return {
      defs: `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07031a"/><stop offset="0.55" stop-color="#3a0e5a"/><stop offset="0.8" stop-color="#b0306e"/><stop offset="0.801" stop-color="#14041e"/><stop offset="1" stop-color="#2a0a3a"/></linearGradient>` +
        `<linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe45a"/><stop offset="1" stop-color="#ff3a8a"/></linearGradient>` +
        `<clipPath id="hz"><rect x="0" y="0" width="${S}" height="${hy}"/></clipPath>` +
        `<clipPath id="sn"><circle cx="${S / 2}" cy="${hy}" r="${sr}"/></clipPath>`,
      body: stars(rnd, 90, 0.7).replace(/cy="(\d+)/g, (m, y) => `cy="${Math.round(Number(y) * 0.6)}`) +
        `<g clip-path="url(#hz)"><circle cx="${S / 2}" cy="${hy}" r="${sr}" fill="url(#sun)"/><g clip-path="url(#sn)">${stripes}</g></g>` +
        `<rect x="0" y="${hy - 1}" width="${S}" height="2" fill="#ff8ae8"/>` + grid,
    };
  },
  cosmos_st_celestial: (rnd) => {
    const cx = S / 2, cy = S / 2, R = S * 0.44;
    let ring = '';
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6 - Math.PI / 2;
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R, r = 5 + (i % 3) * 1.5;
      // étoile à quatre branches dorée à chaque « maison » du zodiaque
      ring += `<path d="M${x},${y - r * 2} L${x + r * 0.5},${y - r * 0.5} L${x + r * 2},${y} L${x + r * 0.5},${y + r * 0.5} L${x},${y + r * 2} L${x - r * 0.5},${y + r * 0.5} L${x - r * 2},${y} L${x - r * 0.5},${y - r * 0.5} Z" fill="#ffd86a"/>`;
      const a2 = a + Math.PI / 12;
      ring += star(cx + Math.cos(a2) * R, cy + Math.sin(a2) * R, 2, 0.9, '#ffe9a8');
    }
    return {
      defs: radial('g', '50%', '50%', '75%', [[0, '#1c2a62'], [0.6, '#0c1236'], [1, '#03050f']]) +
        radial('halo', '50%', '50%', '50%', [[0.8, '#ffd86a', 0], [0.9, '#ffd86a', 0.22], [1, '#ffd86a', 0]]),
      body: stars(rnd, 260, 0.85) +
        `<circle cx="${cx}" cy="${cy}" r="${R * 1.08}" fill="url(#halo)"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#ffd86a" stroke-width="1.6" opacity="0.75"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${R * 0.93}" fill="none" stroke="#ffd86a" stroke-width="0.8" stroke-dasharray="3,6" opacity="0.6"/>` +
        ring,
    };
  },
};

const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });
for (const [id, build] of Object.entries(COSMOS)) {
  const rnd = rngFactory(20260725);
  const { defs, body } = build(rnd);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><defs>${defs}</defs><rect width="${S}" height="${S}" fill="url(#g)"/>${body}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(join(outDir, `${id}.png`));
  // Same trick as gen_globe_textures: the SVG DPI scales every radius, stroke
  // and blur with the output, so the look is identical — only sharper.
  await sharp(Buffer.from(svg), { density: 72 * HD_SCALE }).png().toFile(join(outDir, `${id}_hd.png`));
  console.log(`${id}.png + ${id}_hd.png OK`);
}
