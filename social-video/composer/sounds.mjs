// Fabrique la musique et les bruitages des shorts dans public/sfx/, par synthèse :
// aucun son téléchargé, donc aucun droit à gérer ni réseau nécessaire au rendu.
//
//   node sounds.mjs
//
// - music.wav : boucle pop 112 BPM (la mineur, Am–F–C–G), kick, clap, charleston,
//   basse et arpège, avec un léger effet de pompe sous le kick, ~70 s ;
// - whoosh.wav, pop.wav, ding.wav, boom.wav, riser.wav, tick.wav ;
// - style « mème » : vineboom.wav, airhorn.wav, scratch.wav, trombone.wav, snap.wav ;
// - style « suspense » : tension.wav (nappe sombre ~70 s), heartbeat.wav,
//   drumroll.wav, hit.wav ;
// - style « arcade » : chiptune.wav (~70 s), coin1..8.wav (de plus en plus
//   aigus), gameover.wav, powerup.wav, zap.wav.
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

// --- Style « mème » ------------------------------------------------------------

const saw = (f, t) => 2 * ((f * t) % 1) - 1;
const square = (f, t, duty = 0.5) => ((f * t) % 1 < duty ? 1 : -1);

function vineboom() {
  const d = 1.6;
  const out = buffer(d);
  add(out, 0, d, (t) => Math.tanh(3 * Math.sin(TAU * (48 * t + (90 / 8) * (1 - Math.exp(-t * 8)))) * Math.exp(-t * 2.2)));
  add(out, 0, 0.03, (t) => noise() * Math.exp(-t * 80), 0.5);
  return lowpass(out, 700);
}

function airhorn() {
  const d = 1.1;
  const out = buffer(d);
  for (const f of [466, 587, 698]) {
    add(out, 0, d, (t) => saw(f * (1 + 0.006 * Math.sin(TAU * 6 * t)), t) * Math.min(1, t * 40) * (t > d - 0.1 ? (d - t) * 10 : 1), 0.3);
  }
  return lowpass(out, 3500);
}

function scratch() {
  const d = 0.45;
  const out = buffer(d);
  let ph = 0;
  add(out, 0, d, (t) => {
    const speed = Math.sin(TAU * 7 * t);
    ph += (300 + 900 * Math.abs(speed)) / SR;
    return (noise() * 0.6 + saw(1, ph)) * Math.abs(speed);
  });
  return lowpass(highpass(out, 400), 3000);
}

function trombone() {
  const notes = [[58, 0, 0.45], [57, 0.5, 0.45], [56, 1.0, 0.45], [55, 1.5, 1.2]];
  const out = buffer(2.8);
  for (const [n, at, d] of notes) {
    add(out, at, d, (t) => saw(hz(n) * (1 + (at >= 1.5 ? 0.02 * Math.sin(TAU * 5 * t) : 0)), t) * Math.min(1, t * 20) * Math.min(1, (d - t) * 8), 0.6);
  }
  return lowpass(out, (t) => 600 + 900 * Math.abs(Math.sin(TAU * 1 * t)));
}

function snap() {
  const out = buffer(0.15);
  add(out, 0, 0.15, (t) => noise() * Math.exp(-t * 60));
  add(out, 0.02, 0.1, (t) => noise() * Math.exp(-t * 90), 0.6);
  return highpass(out, 1500);
}

// --- Style « suspense » ----------------------------------------------------------

function tension(seconds) {
  const out = buffer(seconds);
  // Nappe grave (ré mineur) qui respire + pulsation de basse à 60 BPM.
  for (const [n, g] of [[38, 0.5], [45, 0.3], [50, 0.25], [53, 0.18]]) {
    add(out, 0, seconds, (t) => saw(hz(n) * (1 + 0.003 * Math.sin(TAU * 0.2 * t + n)), t) * (0.6 + 0.4 * Math.sin(TAU * 0.07 * t + n)), g);
  }
  lowpass(out, (t) => 350 + 250 * Math.sin(TAU * 0.05 * t));
  for (let b = 0; b < seconds; b += 1) add(out, b, 0.6, (t) => Math.sin(TAU * 41 * t) * Math.exp(-t * 6), 0.6);
  // Cliquetis aigus discrets.
  for (let b = 0.5; b < seconds; b += 1) add(out, b, 0.05, (t) => Math.sin(TAU * 3200 * t) * Math.exp(-t * 150), 0.08);
  return out;
}

function heartbeat() {
  const out = buffer(0.9);
  const thump = (t) => Math.sin(TAU * (40 + 50 * Math.exp(-t * 25)) * t) * Math.exp(-t * 14);
  add(out, 0, 0.3, thump, 1);
  add(out, 0.22, 0.3, thump, 0.7);
  return lowpass(out, 200);
}

function drumroll() {
  const d = 1.6;
  const out = buffer(d);
  for (let t0 = 0; t0 < d; t0 += 0.045) {
    const g = 0.3 + 0.7 * (t0 / d) ** 2;
    add(out, t0, 0.06, (t) => noise() * Math.exp(-t * 60), g);
  }
  return lowpass(highpass(out, 300), 6000);
}

function hit() {
  const d = 2;
  const out = buffer(d);
  for (const [n, g] of [[38, 1], [45, 0.7], [50, 0.6], [53, 0.5], [57, 0.4]]) {
    add(out, 0, d, (t) => saw(hz(n), t) * Math.exp(-t * 2.5), g * 0.4);
  }
  add(out, 0, 0.8, kick, 1.2);
  add(out, 0, 0.4, (t) => noise() * Math.exp(-t * 10), 0.5);
  return lowpass(out, (t) => 400 + 3000 * Math.exp(-t * 3));
}

// --- Style « arcade » --------------------------------------------------------------

function chiptune(seconds) {
  const bpm = 140;
  const beat = 60 / bpm;
  const out = buffer(seconds + 1);
  const prog = [[57, [69, 72, 76]], [53, [69, 72, 77]], [48, [67, 72, 76]], [55, [67, 71, 74]]];
  const lead = [0, 2, 1, 2, 0, 1, 2, 1];
  const bars = Math.ceil(seconds / (beat * 4));
  for (let bar = 0; bar < bars; bar++) {
    const [root, notes] = prog[bar % 4];
    const t0 = bar * 4 * beat;
    for (let e = 0; e < 8; e++) add(out, t0 + (e * beat) / 2, beat / 2 - 0.01, (t) => square(hz(root - 12 + (e % 2 ? 12 : 0)), t) * 0.25);
    for (let s = 0; s < 16; s++) add(out, t0 + (s * beat) / 4, beat / 4 - 0.01, (t) => square(hz(notes[lead[s % 8]]), t, 0.25) * 0.12 * Math.exp(-t * 6));
    for (let b = 0; b < 4; b++) {
      add(out, t0 + b * beat, 0.12, (t) => square(110 * Math.exp(-t * 20) + 40, t) * Math.exp(-t * 20), 0.35);
      if (b % 2) add(out, t0 + b * beat, 0.1, (t) => noise() * Math.exp(-t * 30), 0.2);
      add(out, t0 + b * beat + beat / 2, 0.03, (t) => noise() * Math.exp(-t * 120), 0.08);
    }
  }
  return lowpass(out, 7000).slice(0, Math.ceil(seconds * SR));
}

function coin(level) {
  const base = hz(83 + level);
  const out = buffer(0.45);
  add(out, 0, 0.07, (t) => square(base, t) * 0.5);
  add(out, 0.07, 0.38, (t) => square(base * 1.335, t) * 0.5 * Math.exp(-t * 7));
  return out;
}

function gameover() {
  const notes = [72, 67, 64, 60, 55, 52, 48];
  const out = buffer(notes.length * 0.16 + 0.6);
  notes.forEach((n, i) => add(out, i * 0.16, i === notes.length - 1 ? 0.7 : 0.15, (t) => square(hz(n), t) * 0.4 * Math.exp(-t * (i === notes.length - 1 ? 3 : 8))));
  return out;
}

function powerup() {
  const d = 0.6;
  const out = buffer(d);
  let ph = 0;
  add(out, 0, d, (t) => {
    ph += (300 * 2 ** (t * 6) * (1 + 0.1 * Math.sign(Math.sin(TAU * 30 * t)))) / SR;
    return (ph % 1 < 0.5 ? 1 : -1) * 0.35 * Math.min(1, (d - t) * 10);
  });
  return out;
}

function zap() {
  const d = 0.25;
  const out = buffer(d);
  let ph = 0;
  add(out, 0, d, (t) => {
    ph += (2000 * Math.exp(-t * 18) + 100) / SR;
    return (ph % 1 < 0.5 ? 1 : -1) * 0.4 * (1 - t / d);
  });
  return out;
}

mkdirSync(OUT, { recursive: true });
writeWav('music.wav', music(70));
writeWav('whoosh.wav', whoosh());
writeWav('pop.wav', pop());
writeWav('ding.wav', ding());
writeWav('boom.wav', boom());
writeWav('riser.wav', riser());
writeWav('vineboom.wav', vineboom());
writeWav('airhorn.wav', airhorn());
writeWav('scratch.wav', scratch());
writeWav('trombone.wav', trombone());
writeWav('snap.wav', snap());
writeWav('tension.wav', tension(70));
writeWav('heartbeat.wav', heartbeat());
writeWav('drumroll.wav', drumroll());
writeWav('hit.wav', hit());
writeWav('chiptune.wav', chiptune(70));
for (let i = 1; i <= 8; i++) writeWav(`coin${i}.wav`, coin(i));
writeWav('gameover.wav', gameover());
writeWav('powerup.wav', powerup());
writeWav('zap.wav', zap());
writeWav('tick.wav', tick());
