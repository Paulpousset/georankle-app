// Trois ambiances sonores complètes (musique + bruitages), synthétisées comme
// sounds.mjs (aucun droit, aucun réseau). Lancé par sounds.mjs ; les
// compositions les prennent avec la prop `sound` ('lofi', 'hype', 'tele').
// Fichiers : public/sfx/<pack>-{music,hit,whoosh,tick,step1..8,found,stamp,submit,roll,good,fail,win}.wav
const SR = 44100;
const TAU = Math.PI * 2;
let seed = 424242;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const noise = () => rand() * 2 - 1;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const buffer = (s) => new Float32Array(Math.ceil(s * SR));
function add(out, start, dur, fn, gain = 1) {
  const s0 = Math.floor(start * SR);
  const n = Math.floor(dur * SR);
  for (let i = 0; i < n && s0 + i < out.length; i++) if (s0 + i >= 0) out[s0 + i] += fn(i / SR) * gain;
}
function lowpass(d, fc) {
  let y = 0;
  for (let i = 0; i < d.length; i++) {
    const c = typeof fc === 'function' ? fc(i / SR) : fc;
    y += (1 - Math.exp((-TAU * c) / SR)) * (d[i] - y);
    d[i] = y;
  }
  return d;
}
function highpass(d, fc) {
  const lo = lowpass(Float32Array.from(d), fc);
  for (let i = 0; i < d.length; i++) d[i] -= lo[i];
  return d;
}
// Réverbération simple (4 filtres en peigne amortis + 1 passe-tout), mélange `wet`.
function reverb(d, wet = 0.25, size = 1) {
  const out = Float32Array.from(d);
  const combs = [1557, 1617, 1491, 1422].map((n) => Math.round(n * size));
  const acc = new Float32Array(d.length);
  for (const n of combs) {
    const buf = new Float32Array(n);
    let k = 0;
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const y = buf[k];
      lp = y * 0.7 + lp * 0.3;
      buf[k] = d[i] + lp * 0.8;
      acc[i] += y / combs.length;
      k = (k + 1) % n;
    }
  }
  const ap = new Float32Array(556);
  let k = 0;
  for (let i = 0; i < d.length; i++) {
    const b = ap[k];
    const y = -acc[i] + b;
    ap[k] = acc[i] + b * 0.5;
    k = (k + 1) % ap.length;
    out[i] = d[i] * (1 - wet * 0.5) + y * wet;
  }
  return out;
}
const mix = (len, ...parts) => {
  const out = buffer(len);
  for (const [p, g] of parts) for (let i = 0; i < out.length && i < p.length; i++) out[i] += p[i] * g;
  return out;
};
const saw = (f, t) => 2 * ((f * t) % 1) - 1;
const sq = (f, t, duty = 0.5) => ((f * t) % 1 < duty ? 1 : -1);
const tri = (f, t) => (2 / Math.PI) * Math.asin(Math.sin(TAU * f * t));

// ── Instruments ──
const kick = (depth = 110, decay = 7, base = 45) => (t) => Math.sin(TAU * (base * t + (depth / 30) * (1 - Math.exp(-t * 30)))) * Math.exp(-t * decay);
const snare = (t) => noise() * Math.exp(-t * 22) * 0.8 + Math.sin(TAU * 190 * t) * Math.exp(-t * 30) * 0.5;
const hat = (decay = 90) => (t) => noise() * Math.exp(-t * decay);
// Piano électrique : FM, modulateur qui s'éteint plus vite que la note.
const rhodes = (f, decay = 1.6) => (t) => Math.sin(TAU * f * t + 1.4 * Math.exp(-t * 6) * Math.sin(TAU * f * t)) * Math.exp(-t * decay) * Math.min(1, t * 300);
const marimba = (f) => (t) => (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * f * 4 * t) * Math.exp(-t * 30)) * Math.exp(-t * 9) * Math.min(1, t * 800);
const bell = (f, decay = 3) => (t) => (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t * 4) + 0.25 * Math.sin(TAU * f * 5.4 * t) * Math.exp(-t * 8)) * Math.exp(-t * decay) * Math.min(1, t * 1000);
const xylo = (f) => (t) => (Math.sin(TAU * f * t) + 0.4 * Math.sin(TAU * f * 3 * t) * Math.exp(-t * 25)) * Math.exp(-t * 14) * Math.min(1, t * 1500);
const sub = (f, decay = 2) => (t) => (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2 * t)) * Math.exp(-t * decay) * Math.min(1, t * 200);
const brass = (f, len) => (t) => {
  const env = Math.min(1, t * 25) * (t < len ? 1 : Math.exp(-(t - len) * 18));
  return (saw(f, t) + saw(f * 1.005, t) + 0.5 * saw(f / 2, t)) * env * 0.4;
};

// ════════════ LO-FI : 84 BPM, piano électrique, craquements de vinyle ════════════
function lofiMusic(seconds) {
  const beat = 60 / 84;
  const L = seconds + 1;
  const drums = buffer(L), keys = buffer(L), low = buffer(L), hats = buffer(L), vinyl = buffer(L);
  // Fmaj7 – Em7 – Dm7 – Cmaj7 (fondamentale, accord)
  const prog = [[41, [57, 60, 64, 65]], [40, [55, 59, 62, 64]], [38, [53, 57, 60, 62]], [36, [52, 55, 59, 60]]];
  const swing = beat * 0.58;
  const bars = Math.ceil(seconds / (4 * beat));
  for (let bar = 0; bar < bars; bar++) {
    const [root, notes] = prog[bar % 4];
    const t0 = bar * 4 * beat;
    notes.forEach((n, i) => add(keys, t0 + i * 0.025, 4 * beat, rhodes(hz(n), 0.9), 0.22));
    if (bar % 2) notes.slice(1).forEach((n, i) => add(keys, t0 + 2.5 * beat + i * 0.02, 1.5 * beat, rhodes(hz(n + 12), 2.5), 0.08));
    // Mélodie pentatonique douce une mesure sur deux.
    const mel = [72, 69, 67, 69, 72, 74, 72, 67];
    if (bar % 2 === 0 && bar >= 2) for (let s = 0; s < 4; s++) add(keys, t0 + s * beat + (s % 2) * 0.08, beat, marimba(hz(mel[(bar + s) % 8])), 0.09);
    add(low, t0, 2 * beat, sub(hz(root - 12), 1.2), 0.6);
    add(low, t0 + 2.5 * beat, 1.5 * beat, sub(hz(root - 12), 1.5), 0.45);
    if (bar >= 1) {
      add(drums, t0, 0.5, kick(70, 9, 50), 0.9);
      add(drums, t0 + 2.5 * beat, 0.5, kick(70, 9, 50), 0.7);
      add(drums, t0 + beat, 0.3, snare, 0.35);
      add(drums, t0 + 3 * beat, 0.3, snare, 0.35);
    }
    for (let b = 0; b < 4; b++) {
      add(hats, t0 + b * beat, 0.05, hat(70), 0.12);
      add(hats, t0 + b * beat + swing, 0.04, hat(90), 0.07);
    }
  }
  for (let i = 0; i < vinyl.length; i++) if (rand() < 0.0006) add(vinyl, i / SR, 0.004, (t) => noise() * Math.exp(-t * 900), 0.5 * rand());
  add(vinyl, 0, L, () => noise() * 0.012);
  lowpass(keys, 3200);
  lowpass(drums, 5000);
  highpass(hats, 5000);
  lowpass(low, 400);
  const wetKeys = reverb(keys, 0.35, 1.2);
  const out = mix(seconds, [drums, 1], [wetKeys, 1], [low, 1], [hats, 1], [lowpass(vinyl, 4000), 1]);
  for (let i = 0; i < out.length; i++) {
    const pos = ((i / SR) % (4 * beat)) / beat;
    out[i] *= 1 + 0.003 * Math.sin(TAU * 0.5 * (i / SR)); // léger « wow » de bande
    if (pos < 0.0001) out[i] *= 1;
  }
  return lowpass(out, 6500);
}
function lofiSfx() {
  const s = {};
  // Bloc de bois.
  s.tick = buffer(0.15);
  add(s.tick, 0, 0.15, (t) => (Math.sin(TAU * 1050 * t) * 0.8 + Math.sin(TAU * 2600 * t) * 0.3) * Math.exp(-t * 55));
  // Pas : marimba qui monte la gamme pentatonique pays après pays.
  const pent = [67, 69, 72, 74, 76, 79, 81, 84];
  pent.forEach((n, i) => {
    const b = buffer(0.8);
    add(b, 0, 0.8, marimba(hz(n)), 1);
    add(b, 0, 0.8, marimba(hz(n + 12)), 0.25);
    s[`step${i + 1}`] = reverb(b, 0.3);
  });
  // Trouvé : arpège de cloches majeur.
  s.found = buffer(2.2);
  [72, 76, 79, 84].forEach((n, i) => add(s.found, i * 0.07, 2, bell(hz(n), 2.2), 0.5));
  s.found = reverb(s.found, 0.35);
  // Tampon : bruit sourd de papier + grave.
  s.stamp = buffer(0.6);
  add(s.stamp, 0, 0.5, kick(80, 14, 55), 1);
  add(s.stamp, 0, 0.12, (t) => noise() * Math.exp(-t * 35), 0.5);
  s.stamp = lowpass(s.stamp, 1800);
  // Souffle doux.
  s.whoosh = buffer(0.7);
  add(s.whoosh, 0, 0.7, (t) => noise() * Math.sin((Math.PI * t) / 0.7) ** 3);
  s.whoosh = lowpass(s.whoosh, (t) => 200 + 1800 * Math.sin((Math.PI * t) / 0.7));
  // Ouverture : accord de piano électrique.
  s.hit = buffer(2.5);
  [53, 57, 60, 64, 69].forEach((n, i) => add(s.hit, i * 0.03, 2.5, rhodes(hz(n), 1.2), 0.3));
  add(s.hit, 0, 0.6, kick(70, 8, 48), 0.6);
  s.hit = reverb(lowpass(s.hit, 3500), 0.35);
  s.submit = buffer(0.2);
  add(s.submit, 0, 0.2, (t) => Math.sin(TAU * 700 * t) * Math.exp(-t * 40));
  // Attente du résultat : trémolo de marimba qui monte.
  s.roll = buffer(1.0);
  for (let k = 0; k < 14; k++) add(s.roll, k * 0.065, 0.2, marimba(hz(67 + Math.floor(k / 3.5) * 2)), 0.3 + k * 0.04);
  s.good = buffer(1.6);
  [76, 79, 84].forEach((n, i) => add(s.good, i * 0.09, 1.4, bell(hz(n), 3), 0.5));
  s.good = reverb(s.good, 0.3);
  // Raté : deux notes de marimba qui tombent.
  s.fail = buffer(1.4);
  add(s.fail, 0, 0.7, marimba(hz(64)), 0.8);
  add(s.fail, 0.22, 1.0, marimba(hz(57)), 0.8);
  add(s.fail, 0.22, 1.0, sub(hz(45), 3), 0.5);
  s.fail = reverb(s.fail, 0.3);
  s.win = buffer(3);
  [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => add(s.win, i * 0.06, 2.5, bell(hz(n), 2), 0.35));
  s.win = reverb(s.win, 0.4);
  return s;
}

// ════════════ HYPE : 150 BPM, 808 et charleston en rafale ════════════
const k808 = (f, len) => (t) => Math.sin(TAU * (f * t + (f * 2.5 / 18) * (1 - Math.exp(-t * 18)))) * (t < len ? 1 : Math.exp(-(t - len) * 12)) * Math.min(1, t * 300);
function hypeMusic(seconds) {
  const beat = 60 / 150;
  const L = seconds + 1;
  const drums = buffer(L), bass = buffer(L), lead = buffer(L), hats = buffer(L), pad = buffer(L);
  const roots = [45, 45, 41, 43]; // la mineur sombre
  const bellMel = [[81, 0], [79, 0.75], [76, 1.5], [74, 2.5], [76, 3]];
  const bars = Math.ceil(seconds / (4 * beat));
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * beat;
    const root = roots[bar % 4];
    for (const [n, at] of bellMel) add(lead, t0 + at * beat, 1, bell(hz(n - (bar % 4 === 2 ? 2 : 0)), 5), 0.25);
    add(pad, t0, 4 * beat, (t) => (saw(hz(root + 12), t) + saw(hz(root + 15), t) + saw(hz(root + 19), t)) * 0.08, 1);
    if (bar === 0) continue; // l'accroche respire sans percussions
    add(bass, t0, 1.4 * beat, k808(hz(root - 12), 1.2 * beat), 0.9);
    add(bass, t0 + 1.5 * beat, 1 * beat, k808(hz(root - 12), 0.8 * beat), 0.7);
    add(bass, t0 + 2.75 * beat, 1.2 * beat, k808(hz(root - 5), 1 * beat), 0.7);
    add(drums, t0, 0.3, kick(140, 12, 55), 0.8);
    add(drums, t0 + 2.75 * beat, 0.3, kick(140, 12, 55), 0.6);
    add(drums, t0 + 2 * beat, 0.25, (t) => noise() * (Math.exp(-t * 25) + 0.5 * Math.exp(-Math.max(0, t - 0.01) * 20)), 0.55);
    // Charleston : croches, avec des rafales en triolets / doubles.
    for (let e = 0; e < 8; e++) {
      const at = t0 + (e * beat) / 2;
      if ((bar % 2 && e === 6) || e === 3) for (let r = 0; r < 4; r++) add(hats, at + (r * beat) / 8, 0.03, hat(140), 0.12 + r * 0.03);
      else add(hats, at, 0.04, hat(110), e % 2 ? 0.1 : 0.16);
    }
  }
  highpass(hats, 7000);
  lowpass(bass, 300);
  lowpass(pad, 900);
  const out = mix(seconds, [drums, 1], [bass, 1.1], [reverb(lead, 0.4, 1.3), 1], [hats, 1], [pad, 0.7]);
  return out;
}
function hypeSfx() {
  const s = {};
  s.tick = buffer(0.12);
  add(s.tick, 0, 0.12, (t) => noise() * Math.exp(-t * 60) * 0.5 + Math.sin(TAU * 1800 * t) * Math.exp(-t * 50));
  s.tick = highpass(s.tick, 600);
  // Pas : « pew » laser de plus en plus aigu.
  for (let i = 0; i < 8; i++) {
    const b = buffer(0.35);
    const f0 = 900 + i * 180;
    let ph = 0;
    add(b, 0, 0.3, (t) => {
      ph += (f0 * Math.exp(-t * 9) + 200) / SR;
      return Math.sin(TAU * ph) * Math.exp(-t * 8);
    });
    add(b, 0, 0.3, k808(hz(33 + i), 0.05), 0.4);
    s[`step${i + 1}`] = b;
  }
  // Trouvé : montée puis impact.
  s.found = buffer(1.6);
  add(s.found, 0, 0.5, (t) => noise() * (t / 0.5) ** 2 * 0.5);
  add(s.found, 0.5, 1.1, k808(hz(33), 0.4), 1);
  add(s.found, 0.5, 0.4, (t) => noise() * Math.exp(-t * 12), 0.6);
  s.found = lowpass(s.found, (t) => (t < 0.5 ? 800 + 8000 * (t / 0.5) ** 2 : 6000));
  s.stamp = buffer(1.4);
  add(s.stamp, 0, 1.3, k808(hz(31), 0.5), 1.1);
  add(s.stamp, 0, 0.3, (t) => noise() * Math.exp(-t * 14), 0.8);
  add(s.stamp, 0, 0.4, kick(200, 10, 50), 0.8);
  s.stamp = reverb(lowpass(s.stamp, 4000), 0.25);
  // Cymbale inversée.
  s.whoosh = buffer(0.8);
  add(s.whoosh, 0, 0.8, (t) => noise() * (t / 0.8) ** 3);
  s.whoosh = highpass(s.whoosh, 2500);
  s.hit = buffer(2.5);
  add(s.hit, 0, 2.2, k808(hz(33), 1.2), 1.2);
  add(s.hit, 0, 0.5, (t) => noise() * Math.exp(-t * 8), 0.6);
  [69, 72, 76].forEach((n) => add(s.hit, 0, 2, bell(hz(n + 12), 2.5), 0.3));
  s.hit = reverb(s.hit, 0.3);
  s.submit = buffer(0.25);
  add(s.submit, 0, 0.25, kick(200, 18, 60), 1);
  s.roll = buffer(1.0);
  for (let k = 0; k < 24; k++) add(s.roll, k * 0.04, 0.05, (t) => noise() * Math.exp(-t * 60), 0.25 + 0.7 * (k / 24) ** 2);
  add(s.roll, 0, 1, (t) => Math.sin(TAU * (200 * t + 300 * t * t)) * (t / 1) ** 2, 0.25);
  s.roll = highpass(s.roll, 400);
  s.good = buffer(1.5);
  [76, 81, 88].forEach((n, i) => add(s.good, i * 0.06, 1.3, bell(hz(n), 3.5), 0.45));
  add(s.good, 0, 0.8, k808(hz(45), 0.3), 0.6);
  s.good = reverb(s.good, 0.3);
  // Raté : scratch de vinyle + chute grave.
  s.fail = buffer(1.6);
  let ph = 0;
  add(s.fail, 0, 0.35, (t) => {
    const sp = Math.sin(TAU * 5 * t);
    ph += (300 + 900 * sp) / SR;
    return (noise() * 0.6 + Math.sin(TAU * ph)) * 0.6;
  });
  add(s.fail, 0.35, 1.2, (t) => Math.sin(TAU * (120 * t - 40 * t * t)) * Math.exp(-t * 2.5), 0.9);
  s.fail = lowpass(s.fail, 3000);
  s.win = buffer(3);
  [69, 72, 76, 81, 84, 88].forEach((n, i) => add(s.win, i * 0.05, 2.5, bell(hz(n), 2), 0.3));
  add(s.win, 0, 2.5, k808(hz(33), 1), 0.9);
  s.win = reverb(s.win, 0.35);
  return s;
}

// ════════════ JEU TÉLÉ : 126 BPM, cuivres, basse qui marche, xylophone ════════════
function teleMusic(seconds) {
  const beat = 60 / 126;
  const L = seconds + 1;
  const drums = buffer(L), bass = buffer(L), stabs = buffer(L), xy = buffer(L);
  // C – Am – F – G, cuivres sur les contretemps.
  const prog = [[48, [60, 64, 67]], [45, [60, 64, 69]], [41, [60, 65, 69]], [43, [59, 62, 67]]];
  const walk = [0, 4, 7, 9];
  const bars = Math.ceil(seconds / (4 * beat));
  for (let bar = 0; bar < bars; bar++) {
    const [root, notes] = prog[bar % 4];
    const t0 = bar * 4 * beat;
    for (let b = 0; b < 4; b++) add(bass, t0 + b * beat, beat * 0.9, (t) => (tri(hz(root - 12 + walk[b]), t) + 0.4 * Math.sin(TAU * hz(root + walk[b]) * t)) * Math.exp(-t * 4), 0.6);
    for (const at of [0.5, 1.5, 2.5, 3.5]) notes.forEach((n) => add(stabs, t0 + at * beat, 0.3, brass(hz(n), 0.12), 0.18));
    if (bar % 4 === 3) [72, 74, 76, 79].forEach((n, i) => add(xy, t0 + (2 + i * 0.5) * beat, 0.6, xylo(hz(n)), 0.4));
    if (bar === 0) continue;
    for (let b = 0; b < 4; b++) {
      add(drums, t0 + b * beat, 0.35, kick(110, 10, 50), 0.7);
      if (b % 2) add(drums, t0 + b * beat, 0.25, snare, 0.4);
      add(drums, t0 + b * beat + beat / 2, 0.05, hat(70), 0.12);
    }
  }
  lowpass(stabs, 2600);
  lowpass(bass, 700);
  return mix(seconds, [drums, 1], [bass, 1], [reverb(stabs, 0.25), 1], [reverb(xy, 0.3), 1]);
}
function teleSfx() {
  const s = {};
  // Horloge : tic.
  s.tick = buffer(0.1);
  add(s.tick, 0, 0.1, (t) => (Math.sin(TAU * 2900 * t) * 0.6 + noise() * 0.4) * Math.exp(-t * 90));
  s.tick = highpass(s.tick, 1200);
  // Pas : xylophone qui monte la gamme de do.
  [72, 74, 76, 77, 79, 81, 83, 84].forEach((n, i) => {
    const b = buffer(0.6);
    add(b, 0, 0.6, xylo(hz(n)), 1);
    s[`step${i + 1}`] = reverb(b, 0.2);
  });
  // Trouvé : « ding ding ding » de plateau.
  s.found = buffer(1.6);
  [0, 0.14, 0.28].forEach((at) => add(s.found, at, 1.2, bell(hz(88), 4), 0.5));
  s.found = reverb(s.found, 0.25);
  // Tampon : coup de cuivres « ta-da ».
  s.stamp = buffer(1.4);
  [60, 64, 67, 72].forEach((n) => add(s.stamp, 0, 0.18, brass(hz(n), 0.1), 0.35));
  [60, 64, 67, 72].forEach((n) => add(s.stamp, 0.2, 1.1, brass(hz(n + 5), 0.7), 0.35));
  add(s.stamp, 0, 0.4, kick(110, 10, 50), 0.6);
  s.stamp = reverb(lowpass(s.stamp, 3500), 0.25);
  // Sifflet à coulisse vers le haut.
  s.whoosh = buffer(0.5);
  let ph = 0;
  add(s.whoosh, 0, 0.45, (t) => {
    ph += (700 + 1600 * (t / 0.45)) / SR;
    return Math.sin(TAU * ph) * Math.sin((Math.PI * t) / 0.45) * (1 + 0.1 * Math.sin(TAU * 6 * t));
  });
  s.hit = buffer(2);
  [60, 64, 67, 72].forEach((n, i) => add(s.hit, i * 0.08, 0.15, brass(hz(n), 0.08), 0.35));
  [60, 64, 67, 72].forEach((n) => add(s.hit, 0.34, 1.3, brass(hz(n + 12), 0.9), 0.3));
  add(s.hit, 0.34, 0.5, kick(110, 8, 50), 0.6);
  s.hit = reverb(lowpass(s.hit, 3500), 0.3);
  s.submit = buffer(0.25);
  add(s.submit, 0, 0.25, (t) => sq(880, t, 0.3) * Math.exp(-t * 20) * 0.5);
  // Roulement de caisse claire.
  s.roll = buffer(1.0);
  for (let k = 0; k < 28; k++) add(s.roll, k * 0.035, 0.06, (t) => noise() * Math.exp(-t * 50), 0.3 + 0.6 * (k / 28) ** 2);
  s.roll = lowpass(highpass(s.roll, 300), 6000);
  s.good = buffer(1.6);
  [72, 76, 79, 84].forEach((n, i) => add(s.good, i * 0.08, 1.2, xylo(hz(n)), 0.6));
  [72, 76, 79].forEach((n) => add(s.good, 0.35, 1.0, brass(hz(n), 0.5), 0.2));
  s.good = reverb(s.good, 0.25);
  // Raté : buzzer de plateau.
  s.fail = buffer(1.0);
  add(s.fail, 0, 0.8, (t) => (sq(120, t) + sq(127, t)) * 0.4 * Math.min(1, (0.8 - t) * 20));
  s.fail = lowpass(s.fail, 2500);
  s.win = buffer(3);
  [60, 64, 67, 72].forEach((n, i) => add(s.win, i * 0.1, 0.2, brass(hz(n), 0.1), 0.35));
  [64, 67, 72, 76].forEach((n) => add(s.win, 0.45, 2, brass(hz(n), 1.4), 0.3));
  [84, 88, 91, 96].forEach((n, i) => add(s.win, 0.45 + i * 0.06, 1.5, bell(hz(n), 3), 0.15));
  s.win = reverb(lowpass(s.win, 4000), 0.35);
  return s;
}

export function buildPacks(writeWav, seconds = 70) {
  const packs = { lofi: [lofiMusic, lofiSfx], hype: [hypeMusic, hypeSfx], tele: [teleMusic, teleSfx] };
  for (const [name, [music, fx]] of Object.entries(packs)) {
    writeWav(`${name}-music.wav`, music(seconds));
    for (const [k, v] of Object.entries(fx())) writeWav(`${name}-${k}.wav`, v);
  }
}
