// Texture équirect de MARS, procédurale — remplace le Mars « dégradé + disques »
// de gen_globe_textures.mjs (retour Paul 24/09/2026 : « le rendu est trop basique »).
//
// Tout est calculé SUR LA SPHÈRE (bruit 3D, distances angulaires) : aucune
// couture à ±180°, aucun cratère étiré en ellipse vers les pôles, des calottes
// qui sont des calottes. Les grands reliefs sont à leur vraie place aréographique
// (longitude est) : Tharsis et ses quatre volcans, Valles Marineris, Hellas,
// Argyre, Syrtis Major, la dichotomie nord/sud… Registre Cartoon HD : formes
// lisibles, relief ombré doux, palette chaude — le shader toon du jeu pose
// l'éclairage global par-dessus.
//
//   cd asset-pipeline && node gen_mars_texture.mjs [--out textures_globe/mars.png] [--w 4096]
//   puis node gen_models_manifest.mjs (→ assets/globes/globe_mars.webp)
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const W = Number(arg('--w', 4096));
const H = W / 2;
const OUT = arg('--out', join(here, 'textures_globe', 'mars.png'));
const D2R = Math.PI / 180;

// ── Bruit de simplex 3D (Gustavson), graine fixe ────────────────────────────
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const rand = rng(1976); // Viking 1
const perm = new Uint8Array(512);
{
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const G3 = [1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1];
function simplex(x, y, z) {
  const F = 1 / 3, G = 1 / 6;
  const s = (x + y + z) * F;
  const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
  const t = (i + j + k) * G;
  const x0 = x - i + t, y0 = y - j + t, z0 = z - k + t;
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
  } else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
  else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
  else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
  const x1 = x0 - i1 + G, y1 = y0 - j1 + G, z1 = z0 - k1 + G;
  const x2 = x0 - i2 + 2 * G, y2 = y0 - j2 + 2 * G, z2 = z0 - k2 + 2 * G;
  const x3 = x0 - 1 + 0.5, y3 = y0 - 1 + 0.5, z3 = z0 - 1 + 0.5;
  const ii = i & 255, jj = j & 255, kk = k & 255;
  let n = 0;
  const corner = (tx, ty, tz, gi) => {
    let tt = 0.6 - tx * tx - ty * ty - tz * tz;
    if (tt < 0) return 0;
    tt *= tt;
    const g = (gi % 12) * 3;
    return tt * tt * (G3[g] * tx + G3[g + 1] * ty + G3[g + 2] * tz);
  };
  n += corner(x0, y0, z0, perm[ii + perm[jj + perm[kk]]]);
  n += corner(x1, y1, z1, perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]]);
  n += corner(x2, y2, z2, perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]]);
  n += corner(x3, y3, z3, perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]]);
  return 32 * n; // ≈ [-1, 1]
}
function fbm(x, y, z, oct, off = 0) {
  let a = 0.5, f = 1, s = 0;
  for (let o = 0; o < oct; o++) {
    s += a * simplex(x * f + off, y * f + off * 1.7, z * f - off);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}
function ridged(x, y, z, oct, off = 0) {
  let a = 0.5, f = 1, s = 0;
  for (let o = 0; o < oct; o++) {
    const n = 1 - Math.abs(simplex(x * f + off, y * f - off, z * f + off * 0.3));
    s += a * n * n;
    f *= 2.1;
    a *= 0.5;
  }
  return s;
}

// ── Géométrie sphérique ─────────────────────────────────────────────────────
const vec = (lat, lon) => [Math.cos(lat * D2R) * Math.cos(lon * D2R), Math.sin(lat * D2R), Math.cos(lat * D2R) * Math.sin(lon * D2R)];
/** Distance angulaire en degrés entre un point (px,py,pz) et un site. */
function ang(px, py, pz, s) {
  const d = px * s[0] + py * s[1] + pz * s[2];
  return Math.acos(d > 1 ? 1 : d < -1 ? -1 : d) / D2R;
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const gauss = (d, r) => Math.exp(-(d * d) / (r * r));

// Grands ensembles (lat, lon est, rayon °) — positions aréographiques réelles.
const site = (lat, lon, r, k) => ({ v: vec(lat, lon), r, k });
const BASINS = [
  site(-42, 70, 21, -0.95),  // Hellas
  site(-50, -43, 11, -0.6),  // Argyre
  site(13, 88, 9, -0.4),     // Isidis
  site(46, 118, 18, -0.3),   // Utopia
];
const BULGES = [
  site(2, -108, 32, 0.55),   // Tharsis
  site(25, 147, 13, 0.3),    // Elysium
];
// Volcans boucliers : pente douce, escarpement au pied, caldeira au sommet.
const VOLCANOES = [
  { ...site(18.6, -134, 8.5, 1.25), cal: 0.16 }, // Olympus Mons
  { ...site(-8.3, -120.5, 4.6, 0.8), cal: 0.2 },  // Arsia Mons
  { ...site(0.8, -113.4, 4.0, 0.72), cal: 0.18 }, // Pavonis Mons
  { ...site(11.8, -104.5, 4.3, 0.78), cal: 0.2 }, // Ascraeus Mons
  { ...site(40.5, -109.6, 9, 0.28), cal: 0.12 },  // Alba Mons (très plat)
  { ...site(24.8, 146.9, 3.6, 0.5), cal: 0.16 },  // Elysium Mons
];
// Taches d'albédo sombres (roches basaltiques) : rayon ° et force.
const DARK = [
  site(9, 70, 11, 0.8),      // Syrtis Major
  site(46, -28, 15, 0.6),    // Mare Acidalium
  site(-24, -40, 15, 0.55),  // Mare Erythraeum
  site(-3, 2, 9, 0.6),       // Sinus Meridiani
  site(-5, 25, 8, 0.45),     // Sinus Sabaeus
  site(-18, 105, 13, 0.55),  // Mare Tyrrhenum
  site(-24, 145, 15, 0.6),   // Mare Cimmerium
  site(-32, -155, 13, 0.55), // Mare Sirenum
  site(50, 118, 13, 0.35),   // Utopia
  site(-26, -88, 6, 0.55),   // Solis Lacus (« l'œil de Mars »)
  site(-14, -50, 7, 0.4),    // Aurorae Sinus
  site(-62, 30, 16, 0.35),   // Mare Australe
];
const BRIGHT = [
  site(-42, 70, 14, 0.55),   // fond de Hellas, poudré
  site(22, 5, 20, 0.35),     // Arabia Terra
  site(15, -150, 22, 0.4),   // Amazonis / Tharsis poussiéreux
  site(-50, -43, 8, 0.3),    // Argyre
  site(20, 155, 12, 0.25),   // Elysium
];

// Valles Marineris (+ Noctis Labyrinthus → chenaux vers Chryse), polyligne lat/lon.
const VALLES = [
  [-7, -102], [-6.5, -96], [-8, -88], [-10, -80], [-11, -72], [-10.5, -64],
  [-9, -57], [-7, -50], [-3, -44], [2, -40], [8, -38], [14, -36],
];
function vallesDist(lat, lon) {
  let best = 1e9, along = 0, acc = 0;
  const cl = Math.cos(lat * D2R);
  for (let i = 0; i < VALLES.length - 1; i++) {
    const [a0, o0] = VALLES[i], [a1, o1] = VALLES[i + 1];
    const ax = (o1 - o0) * cl, ay = a1 - a0;
    const px = (lon - o0) * cl, py = lat - a0;
    const L2 = ax * ax + ay * ay;
    const t = Math.max(0, Math.min(1, (px * ax + py * ay) / L2));
    const dx = px - ax * t, dy = py - ay * t;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best) { best = d; along = acc + t * Math.sqrt(L2); }
    acc += Math.sqrt(L2);
  }
  return { d: best, u: along / acc };
}

// ── Cratères : loi de puissance, moins nombreux sur les terrains jeunes ─────
const craters = [];
{
  const r = rng(4242);
  const youngAt = (v) => {
    // Plaines du nord et Tharsis sont jeunes : moins de cratères.
    const lat = Math.asin(v[1]) / D2R;
    let y = smooth(15, 40, lat) * 0.75;
    y = Math.max(y, gauss(ang(v[0], v[1], v[2], BULGES[0].v), 28) * 0.8);
    return y;
  };
  let tries = 0;
  while (craters.length < 1400 && tries < 40000) {
    tries++;
    const z = r() * 2 - 1, a = r() * Math.PI * 2;
    const q = Math.sqrt(1 - z * z);
    const v = [q * Math.cos(a), z, q * Math.sin(a)];
    if (r() < youngAt(v) * 1.2) continue;
    // Rayon (°) : beaucoup de petits, quelques grands.
    const R = 0.12 + 5.6 * Math.pow(r(), 8);
    craters.push({ v, lat: Math.asin(z) / D2R, lon: Math.atan2(v[2], v[0]) / D2R, R, fresh: r() });
  }
  // Quelques grands cratères nommés, pour la silhouette.
  for (const [lat, lon, R] of [[-5.4, 137.8, 1.9], [18.4, 77.5, 1.1], [-2, -5, 1.6],
    [-41, -3, 2.6], [-24, 115, 2], [30, 30, 2.3], [-60, 150, 2.8], [-45, -150, 2.4]]) {
    const v = vec(lat, lon);
    craters.push({ v, lat, lon, R, fresh: 0.9 });
  }
}

// ── Passe 1 : hauteur + albédo ──────────────────────────────────────────────
const h = new Float32Array(W * H);
const alb = new Float32Array(W * H); // 0 sombre → 1 clair
const polar = new Float32Array(W * H); // couverture de glace 0..1
const t0 = Date.now();
for (let y = 0; y < H; y++) {
  const lat = 90 - ((y + 0.5) / H) * 180;
  const cl = Math.cos(lat * D2R), sl = Math.sin(lat * D2R);
  for (let x = 0; x < W; x++) {
    const lon = ((x + 0.5) / W) * 360 - 180;
    const px = cl * Math.cos(lon * D2R), py = sl, pz = cl * Math.sin(lon * D2R);
    const i = y * W + x;
    // Continents larges + dichotomie : hautes terres cratérisées au sud,
    // plaines basses et lisses au nord, frontière irrégulière.
    const warp = fbm(px * 1.3, py * 1.3, pz * 1.3, 3, 7.1);
    let e = fbm(px * 1.8, py * 1.8, pz * 1.8, 5) * 0.45;
    const north = smooth(-8, 28, lat + warp * 26);
    e -= north * 0.42;
    for (const b of BASINS) {
      const d = ang(px, py, pz, b.v);
      if (d < b.r * 1.8) e += b.k * gauss(d, b.r * 0.8) + Math.abs(b.k) * 0.28 * gauss(d - b.r, b.r * 0.22);
    }
    for (const b of BULGES) {
      const d = ang(px, py, pz, b.v);
      if (d < b.r * 2) e += b.k * gauss(d, b.r * 0.9);
    }
    for (const v of VOLCANOES) {
      const d = ang(px, py, pz, v.v) / v.r;
      if (d < 1.35) {
        const shield = d < 1 ? Math.pow(1 - d, 0.85) : 0;
        const scarp = smooth(1.12, 0.96, d);             // falaise au pied
        const cal = v.cal ? gauss(d, v.cal) * 0.55 : 0;  // caldeira
        e += v.k * (0.82 * shield + 0.18 * scarp - cal * (shield > 0 ? 1 : 0));
      }
    }
    // Détail : collines, crêtes de vent, chaos.
    e += fbm(px * 7, py * 7, pz * 7, 4, 3.3) * 0.12 * (1 - north * 0.6);
    e += (ridged(px * 16, py * 16, pz * 16, 3, 9.1) - 0.45) * 0.05;
    // Valles Marineris : une entaille profonde aux parois nettes.
    let canyon = 0;
    if (lat > -20 && lat < 22 && lon > -110 && lon < -30) {
      const { d, u } = vallesDist(lat, lon);
      const width = (1.8 + 1.6 * smooth(0.02, 0.2, u) - 1.4 * smooth(0.62, 0.8, u)) + fbm(px * 20, py * 20, pz * 20, 2, 1.1) * 0.45;
      canyon = smooth(width, width * 0.35, d) * (1 - 0.65 * smooth(0.62, 0.8, u)) * smooth(0, 0.07, u) * smooth(1, 0.9, u);
      e -= canyon * 1.1;
    }
    h[i] = e;
    // Albédo : poussière claire, basaltes sombres aux contours déchiquetés.
    let a = 0.62 + fbm(px * 3.2, py * 3.2, pz * 3.2, 4, 5.5) * 0.28;
    const nd = fbm(px * 5, py * 5, pz * 5, 4, 2.2);
    for (const s of DARK) {
      const d = ang(px, py, pz, s.v);
      if (d < s.r * 2.4) a -= s.k * 0.6 * smooth(1.5, 0.2, d / s.r + nd * 0.9);
    }
    for (const s of BRIGHT) {
      const d = ang(px, py, pz, s.v);
      if (d < s.r * 2) a += s.k * gauss(d, s.r) ;
    }
    for (const v of VOLCANOES) {
      if (v.k < 0.4) continue;
      const d = ang(px, py, pz, v.v) / v.r;
      if (d < 1.15) {
        // Coulées rayonnantes : bruit étiré le long du rayon.
        const flows = ridged(px * 40 + v.v[0] * 3, py * 40, pz * 40, 2, v.k * 10);
        // Flancs de lave un peu plus sombres vers le pied, poussière claire au
        // sommet, caldeira sombre : un bouclier, pas un bouton.
        a -= (0.12 + 0.14 * (flows - 0.5)) * smooth(1.1, 0.55, d) * smooth(0.15, 0.6, d);
        a += 0.1 * smooth(0.45, 0.15, d);
        a -= 0.22 * gauss(d, v.cal * 0.9);
      }
    }
    a -= north * 0.08;
    a -= canyon * 0.08;
    // Stries de vent : traînées claires derrière les reliefs.
    a += (ridged(px * 9, py * 25, pz * 9, 2, 4.4) - 0.55) * 0.08;
    alb[i] = a;
    // Calottes polaires : nord étendue avec creux en spirale, sud petite et
    // décentrée (la calotte résiduelle réelle est à ~-87°, -45°E).
    const cn = fbm(px * 6, py * 6, pz * 6, 3, 8.8);
    let ice = smooth(78.5, 81.5, lat + cn * 3.2);
    const frostN = smooth(66, 79, lat + cn * 5) * 0.35;
    const ds = ang(px, py, pz, vec(-87, -45));
    ice = Math.max(ice, smooth(6.5, 4.2, ds + cn * 2.2));
    const frostS = smooth(16, 7, ds + cn * 3) * 0.3;
    if (ice > 0 && lat > 0) {
      // Creux spiralés (Chasma Boreale & co) : bandes suivant lon + k·colat.
      const sp = Math.sin((lon * D2R) * 3 + (90 - lat) * 0.55 + cn * 2.5);
      ice *= 1 - 0.55 * smooth(0.55, 0.92, sp) * smooth(89.2, 84, lat);
    }
    polar[i] = Math.min(1, ice + Math.max(frostN, frostS) * (1 - ice));
  }
  if (y % 256 === 0) process.stdout.write(`\rrelief ${Math.round((y / H) * 100)} %`);
}
console.log(`\rrelief OK (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

// Cratères par-dessus : bol, rempart, pic central pour les grands, éjectas.
for (const c of craters) {
  const reach = c.R * 1.9;
  const y0 = Math.max(0, Math.floor(((90 - (c.lat + reach)) / 180) * H));
  const y1 = Math.min(H - 1, Math.ceil(((90 - (c.lat - reach)) / 180) * H));
  const cosl = Math.max(0.05, Math.cos(c.lat * D2R));
  const spanLon = Math.min(180, reach / cosl);
  const xa = Math.floor(((c.lon - spanLon + 180) / 360) * W);
  const xb = Math.ceil(((c.lon + spanLon + 180) / 360) * W);
  const depth = Math.min(0.4, 0.03 + 0.085 * c.R);
  for (let y = y0; y <= y1; y++) {
    const lat = 90 - ((y + 0.5) / H) * 180;
    const cl = Math.cos(lat * D2R), sl = Math.sin(lat * D2R);
    for (let xx = xa; xx <= xb; xx++) {
      const x = ((xx % W) + W) % W;
      const lon = ((x + 0.5) / W) * 360 - 180;
      const px = cl * Math.cos(lon * D2R), pz = cl * Math.sin(lon * D2R);
      const d = ang(px, sl, pz, c.v) / c.R;
      if (d > 1.9) continue;
      const i = y * W + x;
      let dh = 0;
      if (d < 1) dh -= depth * (1 - d * d);
      dh += depth * 0.55 * gauss(d - 1, 0.16);
      if (c.R > 1.3 && d < 0.2) dh += depth * 0.5 * gauss(d, 0.1);
      h[i] += dh;
      // Fond poudré de poussière claire, éjectas clairs pour les cratères frais.
      if (d < 0.85) alb[i] -= 0.03;
      if (c.fresh > 0.75 && d > 1 && d < 1.8) alb[i] += 0.07 * (1 - (d - 1) / 0.8);
    }
  }
}
console.log(`cratères OK (${craters.length})`);

// ── Passe 2 : ombrage + couleur ─────────────────────────────────────────────
// Palette Cartoon HD : du basalte chocolat au caramel poussiéreux.
const RAMP = [
  [0.0, [72, 30, 20]],
  [0.25, [124, 48, 26]],
  [0.45, [180, 76, 36]],
  [0.62, [216, 110, 56]],
  [0.8, [236, 148, 84]],
  [1.0, [248, 192, 128]],
];
function ramp(t) {
  t = Math.min(1, Math.max(0, t));
  for (let k = 1; k < RAMP.length; k++) {
    if (t <= RAMP[k][0]) {
      const [a0, c0] = RAMP[k - 1], [a1, c1] = RAMP[k];
      const u = (t - a0) / (a1 - a0);
      const s = u * u * (3 - 2 * u);
      return [c0[0] + (c1[0] - c0[0]) * s, c0[1] + (c1[1] - c0[1]) * s, c0[2] + (c1[2] - c0[2]) * s];
    }
  }
  return RAMP[RAMP.length - 1][1];
}
const ICE = [248, 243, 236], ICE_SH = [196, 206, 222];
const out = Buffer.alloc(W * H * 3);
// Lumière rasante venue du nord-ouest : le relief se lit sans contredire le
// soleil du shader (qui éclaire la face entière).
const Lx = -0.55, Ly = 0.62, Lz = 0.56;
const RELIEF = 85; // exagération des pentes
const pxDeg = 360 / W;
for (let y = 0; y < H; y++) {
  const lat = 90 - ((y + 0.5) / H) * 180;
  const cl = Math.max(0.02, Math.cos(lat * D2R));
  const yu = Math.max(0, y - 1), yd = Math.min(H - 1, y + 1);
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const xl = (x - 1 + W) % W, xr = (x + 1) % W;
    const dx = (h[y * W + xr] - h[y * W + xl]) / (2 * pxDeg * cl) * RELIEF * 0.01745;
    const dy = (h[yu * W + x] - h[yd * W + x]) / (2 * pxDeg) * RELIEF * 0.01745;
    const nl = 1 / Math.sqrt(dx * dx + dy * dy + 1);
    const lit = (-dx * Lx - dy * Ly + Lz) * nl; // normale (-dx, -dy, 1), repère est/nord/haut
    const shade = Math.min(1.25, Math.max(0.35, 0.72 + 0.55 * (lit - Lz)));
    // Les creux (cratères, canyon, bassins) sont légèrement plus sombres :
    // occlusion ambiante « cartoon », lisible même sous un éclairage plat.
    const ao = 1 - Math.min(0.25, Math.max(0, -h[i] - 0.15) * 0.35);
    let [r, g, b] = ramp(alb[i]);
    r *= shade * ao; g *= shade * ao; b *= shade * ao;
    const p = polar[i];
    if (p > 0) {
      const s = Math.min(1, Math.max(0, (shade - 0.4) / 0.4));
      const ic = [ICE_SH[0] + (ICE[0] - ICE_SH[0]) * s,
        ICE_SH[1] + (ICE[1] - ICE_SH[1]) * s,
        ICE_SH[2] + (ICE[2] - ICE_SH[2]) * s];
      r += (ic[0] - r) * p; g += (ic[1] - g) * p; b += (ic[2] - b) * p;
    }
    const o = i * 3;
    out[o] = Math.min(255, Math.max(0, r));
    out[o + 1] = Math.min(255, Math.max(0, g));
    out[o + 2] = Math.min(255, Math.max(0, b));
  }
}
await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9 }).toFile(OUT);
console.log(`→ ${OUT} (${W}×${H}, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
