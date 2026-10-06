// Fabrique la musique et les bruitages des shorts dans public/sfx/, par synthèse :
// aucun son téléchargé, donc aucun droit à gérer ni réseau nécessaire au rendu.
//
//   node sounds.mjs
//
// - music.wav : boucle pop 112 BPM (la mineur, Am–F–C–G), kick, clap, charleston,
//   basse et arpège, avec un léger effet de pompe sous le kick, ~70 s ;
// - whoosh.wav, pop.wav, ding.wav, boom.wav, riser.wav, tick.wav.
//
// Déterministe (graine fixe) : relancer donne les mêmes fichiers.
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'public', 'sfx');
const SR = 44100;

let seed = 1234567;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const noise = () => rand() * 2 - 1;
const TAU = Math.PI * 2;

function writeWav(name, data) {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.89 / peak : 1;
  const buf = Buffer.alloc(44 + data.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + data.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(data.length * 2, 40);
  data.forEach((v, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * gain)) * 32767), 44 + i * 2));
  writeFileSync(join(OUT, name), buf);
  console.log('•', name, `${(data.length / SR).toFixed(2)} s`);
}

const buffer = (seconds) => new Float32Array(Math.ceil(seconds * SR));

// Ajoute `fn(t)` (t en secondes depuis `start`) pendant `dur` secondes.
function add(out, start, dur, fn, gain = 1) {
  const s0 = Math.floor(start * SR);
  const n = Math.floor(dur * SR);
  for (let i = 0; i < n && s0 + i < out.length; i++) out[s0 + i] += fn(i / SR) * gain;
}

// Passe-bas un pôle, coupure variable dans le temps.
function lowpass(data, cutoff) {
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    const fc = typeof cutoff === 'function' ? cutoff(i / SR) : cutoff;
    const a = 1 - Math.exp((-TAU * fc) / SR);
    y += a * (data[i] - y);
    data[i] = y;
  }
  return data;
}
function highpass(data, cutoff) {
  const low = lowpass(Float32Array.from(data), cutoff);
  for (let i = 0; i < data.length; i++) data[i] -= low[i];
  return data;
}

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// --- Instruments --------------------------------------------------------------

const kick = (t) => {
  const f = 45 + 110 * Math.exp(-t * 30);
  const phase = TAU * (45 * t + (110 / 30) * (1 - Math.exp(-t * 30)));
  return Math.sin(phase) * Math.exp(-t * 7) + (t < 0.004 ? noise() * 0.3 : 0) * (f > 0 ? 1 : 0);
};
const clap = (t) => noise() * (Math.exp(-t * 28) + 0.6 * Math.exp(-Math.max(0, t - 0.012) * 22) * (t > 0.012 ? 1 : 0));
const hat = (t) => noise() * Math.exp(-t * 90);
const pluck = (f) => (t) => {
  const tri = (2 / Math.PI) * Math.asin(Math.sin(TAU * f * t));
  return (tri + 0.3 * Math.sin(TAU * f * 2 * t)) * Math.exp(-t * 9);
};
const bass = (f) => (t) =>
  (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2 * t) + 0.25 * Math.sin(TAU * f * 3 * t)) *
  Math.min(1, t * 200) * Math.exp(-t * 3);

// --- Musique ------------------------------------------------------------------

function music(seconds) {
  const bpm = 112;
  const beat = 60 / bpm;
  const bars = Math.ceil(seconds / (beat * 4));
  // Am, F, C, G : fondamentale (MIDI) et notes de l'accord.
  const chords = [
    [45, [57, 60, 64]],
    [41, [53, 57, 60]],
    [48, [55, 60, 64]],
    [43, [55, 59, 62]],
  ];
  const drums = buffer(seconds + 1);
  const claps = buffer(seconds + 1);
  const hats = buffer(seconds + 1);
  const low = buffer(seconds + 1);
  const keys = buffer(seconds + 1);
  for (let bar = 0; bar < bars; bar++) {
    const [root, notes] = chords[bar % 4];
    const t0 = bar * 4 * beat;
    // Les 2 premières mesures sans kick : l'accroche respire.
    for (let b = 0; b < 4; b++) {
      if (bar >= 2) add(drums, t0 + b * beat, 0.5, kick, 1);
      if (b % 2 === 1) add(claps, t0 + b * beat, 0.3, clap, 0.5);
      add(hats, t0 + b * beat + beat / 2, 0.08, hat, 0.25);
      if (bar >= 2) add(hats, t0 + b * beat + (beat / 4) * 3, 0.05, hat, 0.1);
    }
    for (let e = 0; e < 8; e++) {
      add(low, t0 + (e * beat) / 2, beat / 2, bass(hz(root - 12 + (e === 7 ? 12 : 0))), 0.55);
    }
    const arp = [0, 1, 2, 1, 0, 2, 1, 2];
    for (let s = 0; s < 16; s++) {
      const n = notes[arp[s % 8]] + (s >= 8 && bar % 2 ? 12 : 0);
      add(keys, t0 + (s * beat) / 4, 0.35, pluck(hz(n + 12)), 0.22);
    }
  }
  highpass(hats, 6000);
  highpass(drums, 30);
  lowpass(highpass(claps, 900), 4500).forEach((v, i) => (drums[i] += v));
  lowpass(low, 900);
  const out = buffer(seconds);
  for (let i = 0; i < out.length; i++) {
    // Pompe : basse et arpège baissent juste après chaque temps.
    const pos = ((i / SR) % beat) / beat;
    const duck = 0.55 + 0.45 * Math.min(1, pos * 4);
    out[i] = drums[i] + hats[i] + (low[i] + keys[i]) * duck;
  }
  return out;
}

// --- Bruitages ----------------------------------------------------------------

function whoosh() {
  const d = 0.6;
  const out = buffer(d);
  add(out, 0, d, (t) => noise() * Math.sin((Math.PI * t) / d) ** 2);
  return lowpass(out, (t) => 300 + 5000 * Math.sin((Math.PI * t) / d));
}

function pop() {
  const out = buffer(0.12);
  add(out, 0, 0.12, (t) => Math.sin(TAU * (500 * t + 4000 * t * t)) * Math.exp(-t * 40));
  return out;
}

function ding() {
  const out = buffer(1.4);
  for (const [f, g] of [[1318.5, 1], [2637, 0.5], [3955.5, 0.25], [1975.5, 0.35]]) {
    add(out, 0, 1.4, (t) => Math.sin(TAU * f * t) * Math.exp(-t * 4) * Math.min(1, t * 400), g);
  }
  return out;
}

function boom() {
  const out = buffer(1.2);
  add(out, 0, 1.2, (t) => Math.sin(TAU * (35 * t + (60 / 6) * (1 - Math.exp(-t * 6)))) * Math.exp(-t * 3));
  add(out, 0, 0.15, (t) => noise() * Math.exp(-t * 30), 0.4);
  return lowpass(out, 400);
}

function riser() {
  const d = 1.2;
  const out = buffer(d);
  add(out, 0, d, (t) => noise() * (t / d) ** 2, 0.7);
  add(out, 0, d, (t) => Math.sin(TAU * (200 * t + (900 / (2 * d)) * t * t)) * (t / d) ** 2, 0.4);
  return lowpass(out, (t) => 500 + 7000 * (t / d) ** 2);
}

function tick() {
  const out = buffer(0.05);
  add(out, 0, 0.05, (t) => Math.sin(TAU * 2200 * t) * Math.exp(-t * 120));
  return out;
}

mkdirSync(OUT, { recursive: true });
writeWav('music.wav', music(70));
writeWav('whoosh.wav', whoosh());
writeWav('pop.wav', pop());
writeWav('ding.wav', ding());
writeWav('boom.wav', boom());
writeWav('riser.wav', riser());
writeWav('tick.wav', tick());
