// GeoGames — automated QA sweep of the web build on :5577.
// Plays every mode + hub screens across 4 configs (mobile fr light/dark,
// mobile en light, desktop fr light) while recording console errors, page
// errors, failed/4xx requests, layout overflow and untranslated FR strings.
//
//   npm run build:web && npx serve dist -l 5577
//   node scripts/audit.mjs                 # full matrix
//   CONFIG=mobile-fr-light node scripts/audit.mjs
//   ONLY=globe,capitales node scripts/audit.mjs
//
// Output: $AUDIT_OUT (default scratchpad)/<config>/*.png + report-<config>.json
import pw from '/Users/paulpousset/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
import { mkdirSync, writeFileSync } from 'fs';
import {
  shortestBorderPath, frToCca3, cca3ToFr, ALL_FR_NAMES,
} from '/Users/paulpousset/rankle/videos-pub/clips/borders-solver.mjs';
import {
  capitalFor, countryForFlag, geoFor,
} from '/Users/paulpousset/rankle/videos-pub/clips/quiz-data.mjs';

const { chromium } = pw;
const URL = process.env.AUDIT_URL || 'http://localhost:5577';
const OUT_BASE = process.env.AUDIT_OUT
  || '/private/tmp/claude-501/-Users-paulpousset-rankle/b4d0b9e0-7c28-428d-b433-f231f0d4d4c2/scratchpad/audit';
const MODES = ['classic', 'streak', 'versus', 'guess', 'globe', 'regions', 'challenge',
  'quiz-capital', 'quiz-flag', 'higherlower', 'silhouette', 'borders', 'local-builder'];

const CONFIGS = [
  { name: 'mobile-fr-light', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fr-FR', colorScheme: 'light' },
  { name: 'mobile-fr-dark', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fr-FR', colorScheme: 'dark' },
  { name: 'mobile-en-light', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-US', colorScheme: 'light', en: true },
  { name: 'desktop-fr-light', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, locale: 'fr-FR', colorScheme: 'light' },
];

// Console noise that is expected on react-native-web and not actionable.
const CONSOLE_ALLOW = [
  /Download the React DevTools/i,
  /useNativeDriver/i,
  /"shadow\w*" style props are deprecated/i,
  /props\.pointerEvents is deprecated/i,
  /aria-hidden/i,
  /AsyncStorage has been extracted/i,
  /expo-notifications.*web/i,
  /React DevTools/i,
  /Sentry Logger/i,
  /\[PostHog/i,
];
// Requests that legitimately fail (analytics blocked, aborted navigations).
const REQ_ALLOW = [/posthog/i, /sentry/i, /ERR_ABORTED/i];
// FR words that must not appear in the EN config (word-boundary checked).
const FR_SENTINELS = ['JOUER', 'Retour', 'Boutique', 'Connexion', 'Choisissez',
  'Défi du Jour', 'En Ligne', 'Classement', 'Amis', 'Jouez'];

const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const wantScenario = (n) => !ONLY || ONLY.includes(n);
const CONFIG = process.env.CONFIG ? process.env.CONFIG.split(',') : null;
const wantConfig = (n) => !CONFIG || CONFIG.includes(n);

const browser = await chromium.launch({ channel: 'chrome' });

const seed = ({ modes }) => {
  try {
    localStorage.setItem('tutorial:seen:v2', 'true');
    for (const m of modes) localStorage.setItem(`modeIntro:seen:v2:${m}`, 'true');
  } catch {}
};

// ── one shared demo-account login, reused by every config ──────────────────
async function makeAuthState() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  await ctx.addInitScript(seed, { modes: MODES });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.getByText('Connexion', { exact: true }).first().click();
  await page.getByPlaceholder('email@address.com').first().fill('demo.video@geogames.app');
  await page.locator('input[type="password"]').first().fill('DemoVideo2026!');
  await page.getByText('Se connecter', { exact: true }).last().click();
  await page.waitForTimeout(6000);
  const st = await ctx.storageState();
  await ctx.close();
  return st;
}

// ── per-config runner ───────────────────────────────────────────────────────
async function runConfig(cfg, authState) {
  const outDir = `${OUT_BASE}/${cfg.name}`;
  mkdirSync(outDir, { recursive: true });
  const report = [];
  const statuses = [];
  let scenario = 'boot';
  let step = 0;
  let offlineOn = false;

  const ctx = await browser.newContext({
    viewport: cfg.viewport, isMobile: cfg.isMobile, hasTouch: cfg.hasTouch,
    locale: cfg.locale, colorScheme: cfg.colorScheme, storageState: authState ?? undefined,
    deviceScaleFactor: cfg.isMobile ? 2 : 1,
  });
  await ctx.addInitScript(seed, { modes: MODES });
  const page = await ctx.newPage();

  const push = (kind, text, extra = {}) => report.push({ config: cfg.name, scenario, kind, text: String(text).slice(0, 500), url: page.url(), ...extra });
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const t = m.text();
    if (CONSOLE_ALLOW.some((rx) => rx.test(t))) return;
    push(`console.${m.type()}`, t);
  });
  page.on('pageerror', (e) => push('pageerror', e.message));
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText || '';
    if (offlineOn) return; // expected while the offline scenario runs
    if (REQ_ALLOW.some((rx) => rx.test(r.url()) || rx.test(err))) return;
    push('requestfailed', `${err} ${r.url()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !REQ_ALLOW.some((rx) => rx.test(r.url()))) {
      push(`http${r.status()}`, r.url());
    }
  });

  const w = (ms) => page.waitForTimeout(ms);
  const tap = async (label, ms = 1200) => {
    const el = page.getByText(label, { exact: true }).first();
    await el.waitFor({ state: 'visible', timeout: 9000 });
    await el.click();
    await w(ms);
  };
  const tapIf = async (label, ms = 1200) => {
    try {
      const el = page.getByText(label, { exact: true }).first();
      await el.waitFor({ state: 'visible', timeout: 2500 });
      await el.click();
      await w(ms);
      return true;
    } catch { return false; }
  };
  const tapAria = async (label, ms = 1500) => {
    const el = page.locator(`[aria-label="${label}"]`).first();
    await el.waitFor({ state: 'visible', timeout: 9000 });
    await el.click();
    await w(ms);
  };
  const bodyText = () => page.evaluate(() => document.body.innerText);

  // Language now persists (AsyncStorage), so only toggle when the UI is still in
  // French — a blind toggle every reload would flip a restored EN back to FR.
  const toEnglish = async () => {
    const inFrench = await page.locator('[aria-label="Changer de langue"]').first().isVisible().catch(() => false);
    if (!inFrench) return; // already English (label reads "Change language")
    await tapAria('Changer de langue', 900).catch(() => {});
  };
  const fresh = async () => {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    await w(2600);
    if (cfg.en) await toEnglish();
  };

  const checkOverflow = () => page.evaluate(() => {
    const bad = [];
    const vw = document.documentElement.clientWidth;
    const inHorizontalScroller = (el) => {
      for (let a = el.parentElement; a; a = a.parentElement) {
        if (a.scrollWidth > a.clientWidth + 2) {
          const ox = getComputedStyle(a).overflowX;
          if (ox === 'auto' || ox === 'scroll') return true; // carousel/chips row
        }
      }
      return false;
    };
    for (const el of document.querySelectorAll('body *')) {
      if (!(el instanceof HTMLElement)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 4 && r.height > 4 && (r.right > vw + 3 || r.left < -3) && !inHorizontalScroller(el)) {
        const t = (el.innerText || el.tagName).slice(0, 60).replace(/\n/g, ' ');
        bad.push(`${Math.round(r.left)}..${Math.round(r.right)}/${vw}: ${t}`);
      }
    }
    return [...new Set(bad)].slice(0, 12);
  });

  // Generic gameplay pokes must stay below the header, otherwise they hit the
  // home / language / theme buttons and corrupt the scenario (seen run 1:
  // "EN" config flipped back to FR by a poke on the language chip).
  const pokeButtons = async (count, { fromEnd = false } = {}) => {
    for (let k = 0; k < count; k++) {
      const btns = await page.getByRole('button').all();
      const eligible = [];
      for (const b of btns) {
        const box = await b.boundingBox().catch(() => null);
        if (box && box.y > 140) eligible.push(b);
      }
      if (!eligible.length) return;
      const pick = fromEnd ? eligible[eligible.length - 1] : eligible[0];
      await pick.click().catch(() => {});
      await w(1800);
    }
  };

  const checkpoint = async (name) => {
    step += 1;
    const file = `${outDir}/${String(step).padStart(2, '0')}-${scenario}-${name}.png`;
    await page.screenshot({ path: file }).catch(() => {});
    const over = await checkOverflow().catch(() => []);
    for (const o of over) push('overflow', o, { shot: file });
    if (cfg.en) {
      const txt = await bodyText().catch(() => '');
      for (const s of FR_SENTINELS) {
        if (new RegExp(`(^|\\W)${s}(\\W|$)`).test(txt)) push('fr-in-en', `"${s}" visible`, { shot: file });
      }
    }
  };

  const enterSolo = async (label, ms = 3000) => {
    await fresh();
    await tap('Solo', 1200);
    await tap(label, ms);
    await tapIf('JOUER', 2500) || await tapIf('PLAY', 2500);
  };

  // ── scenarios ─────────────────────────────────────────────────────────────
  const scenarios = {
    home: async () => {
      await fresh();
      await checkpoint('loaded');
      const txt = await bodyText();
      if (!/Solo/.test(txt)) push('assert', 'home: bouton Solo introuvable');
    },

    soloGrid: async () => {
      await fresh();
      await tap('Solo', 1500);
      await checkpoint('grid');
      console.log(`  [${cfg.name}] tuiles solo: ${(await bodyText()).split('\n').filter(Boolean).slice(0, 40).join(' | ')}`);
    },

    classic: async () => {
      await enterSolo(cfg.en ? 'Rankle' : 'Rankle');
      await checkpoint('start');
      await pokeButtons(3); // tap country/category rows, never the header
      await checkpoint('poked');
    },

    globe: async () => {
      await enterSolo(cfg.en ? 'Geo Globe' : 'Globe Géo', 5000);
      await checkpoint('start');
      for (let r = 0; r < 2; r++) {
        const L = (await bodyText()).split('\n').map((s) => s.trim()).filter(Boolean);
        const i = L.findIndex((l) => /Trouve ce pays|Find this country/i.test(l));
        const target = i >= 0 ? (/:\s*\S/.test(L[i]) ? L[i].replace(/.*:\s*/, '') : L[i + 1]) : null;
        const g = target && geoFor(target);
        const frame = page.frames().find((f) => f.url() === 'about:srcdoc');
        if (!g || !frame) { push('assert', `globe: cible introuvable round ${r} (target=${target})`); break; }
        await frame.evaluate((cca3) => {
          /* eslint-disable no-undef, no-empty */
          try { sel = cca3; } catch {}
          (window.parent !== window ? window.parent : window).postMessage({ type: 'COUNTRY_SELECTED', cca3 }, '*');
        }, g.cca3).catch(() => {});
        await w(900);
        await tapIf('Valider', 2000) || await tapIf('Confirm', 2000);
        await checkpoint(`round${r}`);
        await tapIf('Suivant', 1500) || await tapIf('Next', 1500);
      }
    },

    capitales: async () => {
      await enterSolo(cfg.en ? 'Capitals' : 'Capitales');
      for (let k = 0; k < 3; k++) {
        const carre = page.getByText(cfg.en ? 'SQUARE' : 'CARRÉ', { exact: true }).first();
        if (!(await carre.isVisible().catch(() => false))) break;
        const L = (await bodyText()).split('\n').map((s) => s.trim()).filter(Boolean);
        const qi = L.findIndex((l) => /Quelle est la capitale|What is the capital/i.test(l));
        const cap = qi > 0 ? capitalFor(L[qi - 1]) : null;
        await carre.click(); await w(1100);
        if (cap) {
          const btn = page.getByRole('button', { name: cap, exact: true }).first();
          if (await btn.isVisible().catch(() => false)) await btn.click();
          else await page.getByText(cap, { exact: true }).last().click().catch(() => {});
        }
        await w(1600);
        if (k === 0) await checkpoint('answered');
      }
      await checkpoint('end');
    },

    drapeaux: async () => {
      await enterSolo(cfg.en ? 'Flags' : 'Drapeaux');
      for (let k = 0; k < 3; k++) {
        const carre = page.getByText(cfg.en ? 'SQUARE' : 'CARRÉ', { exact: true }).first();
        if (!(await carre.isVisible().catch(() => false))) break;
        const srcs = await page.evaluate(() => [...document.querySelectorAll('img')].map((i) => i.src).filter((s) => /flagcdn/.test(s)));
        const m = (srcs[0] || '').match(/\/([a-z]{2})\.png/);
        const name = m && countryForFlag(m[1]); // FR name — only reliable in FR configs
        await carre.click(); await w(1100);
        if (name && !cfg.en) {
          const btn = page.getByRole('button', { name, exact: true }).first();
          if (await btn.isVisible().catch(() => false)) await btn.click();
          else await page.getByText(name, { exact: true }).last().click().catch(() => {});
        } else {
          await page.getByRole('button').last().click().catch(() => {});
        }
        await w(1600);
        if (k === 0) await checkpoint('answered');
      }
      await checkpoint('end');
    },

    frontieres: async () => {
      await enterSolo(cfg.en ? 'Borders' : 'Frontières', 3500);
      const label = page.getByText(/Un pays qui touche|A country bordering/).first();
      await label.waitFor({ state: 'visible', timeout: 12000 });
      await checkpoint('start');
      if (cfg.en) return; // solver data is FR-only; start-screen checks suffice here
      const tip = ((await label.textContent()) || '').replace(/.*touche\s+/i, '').trim();
      const start = frToCca3(tip);
      const names = await bodyText();
      const present = ALL_FR_NAMES.filter((n) => names.includes(n));
      const target = present.map(frToCca3).find((c) => c && c !== start);
      const path = shortestBorderPath(start, target);
      if (!path) { push('assert', `frontieres: pas de chemin ${tip} -> ${cca3ToFr(target)}`); return; }
      const search = page.getByPlaceholder(/Rechercher un pays/).first();
      for (const cca3 of path.slice(1, -1)) {
        const fr = cca3ToFr(cca3);
        await search.click();
        await search.fill(fr);
        await w(800);
        const row = page.getByText(fr, { exact: true }).last();
        await row.waitFor({ state: 'visible', timeout: 6000 });
        await row.click();
        await w(1200);
      }
      await w(1500);
      await checkpoint('end');
      const done = await bodyText();
      if (!/RELIÉ|BRAVO|VICTOIRE/i.test(done)) push('assert', 'frontieres: chaîne complétée mais pas d’écran de victoire détecté');
    },

    guess: async () => {
      await enterSolo(cfg.en ? 'Guess Country' : 'Devinez le Pays', 2500);
      const input = page.getByPlaceholder(/Tapez un pays|Type a country/).first();
      await input.waitFor({ state: 'visible', timeout: 9000 });
      for (const c of cfg.en ? ['France', 'Brazil'] : ['France', 'Brésil']) {
        await input.fill(c);
        await w(800);
        await page.getByText(c, { exact: true }).last().click().catch(() => {});
        await w(1500);
      }
      await checkpoint('two-guesses');
    },

    higherlower: async () => {
      await enterSolo(cfg.en ? 'Higher or Lower' : 'Plus ou Moins');
      await checkpoint('start');
      for (let k = 0; k < 3; k++) {
        const plus = page.getByText(/^(PLUS|HIGHER)/i).first();
        const moins = page.getByText(/^(MOINS|LOWER)/i).first();
        const pick = (k % 2 === 0) ? plus : moins;
        if (!(await pick.isVisible().catch(() => false))) break;
        await pick.click();
        await w(2200);
      }
      await checkpoint('after3');
    },

    streak: async () => {
      await enterSolo(cfg.en ? 'Streak Mode' : 'Mode Streak');
      await checkpoint('start');
      await pokeButtons(3, { fromEnd: true });
      await checkpoint('after3');
    },

    silhouette: async () => {
      await enterSolo('Silhouette');
      await checkpoint('start');
      await pokeButtons(2, { fromEnd: true });
      await checkpoint('after2');
    },

    challenge: async () => {
      await enterSolo(cfg.en ? 'Country Challenges' : 'Défis Pays', 2500);
      await checkpoint('hub');
      // open the first challenge card, then answer 2 questions generically
      await pokeButtons(1);
      await tapIf('JOUER', 2500) || await tapIf('PLAY', 2500);
      await checkpoint('in-challenge');
      await pokeButtons(2, { fromEnd: true });
      await checkpoint('answered');
    },

    daily: async () => {
      await fresh();
      await tap(cfg.en ? 'Daily Challenge' : 'Défi du Jour', 3000);
      await checkpoint('hub');
      await pokeButtons(1);
      await checkpoint('first-card');
    },

    localBuilder: async () => {
      await fresh();
      await tap('Local', 1800);
      await checkpoint('builder');
      await tapIf(cfg.en ? 'Borders' : 'Frontières', 900);
      await tapIf(cfg.en ? 'Flags' : 'Drapeaux', 900);
      await page.mouse.move(195, 520);
      for (let d = 0; d < 900; d += 16) { await page.mouse.wheel(0, 16); await w(20); }
      await w(500);
      const started = await tapIf('LANCER LA PARTIE', 2200) || await tapIf('START GAME', 2200);
      if (started) { await tapIf('COMMENCER', 2200) || await tapIf('START', 2200); }
      await checkpoint('started');
    },

    shop: async () => {
      await fresh();
      try { await tapAria('Boutique', 3200); } catch { await tapAria('Shop', 3200); }
      await checkpoint('top');
      await page.mouse.move(195, 520);
      for (let d = 0; d < 900; d += 14) { await page.mouse.wheel(0, 14); await w(20); }
      await checkpoint('scrolled');
    },

    leaderboard: async () => {
      await fresh();
      try { await tapAria('Classement', 2800); } catch { await tapAria('Leaderboard', 2800); }
      await checkpoint('solo');
      await tapIf('En ligne', 2000) || await tapIf('Online', 2000);
      await checkpoint('online');
    },

    profile: async () => {
      await fresh();
      try { await tapAria('Profil', 2800); } catch { await tapAria('Profile', 2800); }
      await checkpoint('top');
      await page.mouse.move(195, 520);
      for (let d = 0; d < 700; d += 14) { await page.mouse.wheel(0, 14); await w(20); }
      await checkpoint('scrolled');
    },

    friends: async () => {
      await fresh();
      const label = (await bodyText()).match(/demandes d.amis en attente/) ? 'Amis' : 'Amis';
      try { await tapAria(label, 2500); } catch { await tapAria('Friends', 2500); }
      await checkpoint('list');
    },

    onlineTab: async () => {
      await fresh();
      await tap(cfg.en ? 'Online' : 'En Ligne', 2200);
      await checkpoint('modes');
      // enter the first online mode's matchmaking, then bail out cleanly
      await pokeButtons(1);
      await checkpoint('matchmaking');
      await tapIf('Annuler', 1500) || await tapIf('Cancel', 1500) || await tapIf('Retour', 1500) || await tapIf('Back', 1500);
      await w(4000); // linger: any realtime callback firing after leave shows up in the console log
      await checkpoint('after-cancel');
    },

    authError: async () => {
      // fresh logged-OUT context check happens only in the no-auth run; with
      // storageState we validate the logout + wrong-password path instead.
      await fresh();
      const txt = await bodyText();
      if (/Connexion|Login/.test(txt)) {
        await tapIf('Connexion', 1500) || await tapIf('Login', 1500);
        await page.getByPlaceholder('email@address.com').first().fill('demo.video@geogames.app');
        await page.locator('input[type="password"]').first().fill('mauvais-mdp-123');
        await (page.getByText('Se connecter', { exact: true }).last().click().catch(() => page.getByText('Sign in', { exact: true }).last().click()));
        await w(4000);
        await checkpoint('bad-password');
        const after = await bodyText();
        if (!/incorrect|invalide|invalid|erreur|error|credentials/i.test(after)) {
          push('assert', 'auth: aucun message d’erreur visible après mot de passe erroné');
        }
      }
    },

    offline: async () => {
      await fresh();
      offlineOn = true;
      await ctx.setOffline(true);
      await w(3000);
      await checkpoint('banner');
      const txt = await bodyText();
      if (!/hors.?ligne|offline/i.test(txt)) push('assert', 'offline: aucun bandeau/indicateur hors-ligne détecté');
      await tap('Solo', 1500).catch(() => {});
      await tapIf(cfg.en ? 'Capitals' : 'Capitales', 2500);
      await tapIf('JOUER', 2000) || await tapIf('PLAY', 2000);
      await checkpoint('solo-offline');
      const inGame = await bodyText();
      if (!/CARRÉ|SQUARE|DUO|CASH/i.test(inGame)) push('assert', 'offline: le quiz Capitales ne démarre pas hors-ligne');
      await ctx.setOffline(false);
      offlineOn = false;
      await w(2500);
    },

    reloadMidGame: async () => {
      await enterSolo(cfg.en ? 'Capitals' : 'Capitales');
      await w(1500);
      await page.reload({ waitUntil: 'networkidle' });
      await w(3000);
      await checkpoint('after-reload');
      const txt = await bodyText();
      if (!/Solo/.test(txt)) push('assert', 'reload: pas revenu à un état sain (home introuvable)');
      const blank = (txt.trim().length < 20);
      if (blank) push('assert', 'reload: écran quasi vide après reload');
    },
  };

  for (const [name, fn] of Object.entries(scenarios)) {
    if (!wantScenario(name)) continue;
    scenario = name;
    const t0 = Date.now();
    try {
      await fn();
      statuses.push({ config: cfg.name, scenario: name, ok: true, ms: Date.now() - t0 });
      console.log(`  ✓ [${cfg.name}] ${name}`);
    } catch (e) {
      statuses.push({ config: cfg.name, scenario: name, ok: false, ms: Date.now() - t0, error: e.message.split('\n')[0] });
      push('scenario-fail', e.message.split('\n')[0]);
      await checkpoint('FAIL').catch(() => {});
      console.log(`  ✗ [${cfg.name}] ${name}: ${e.message.split('\n')[0]}`);
    }
  }

  await ctx.close();
  writeFileSync(`${outDir}/report-${cfg.name}.json`, JSON.stringify({ statuses, report }, null, 2));
  return { statuses, report };
}

// ── main ────────────────────────────────────────────────────────────────────
mkdirSync(OUT_BASE, { recursive: true });
console.log('Login démo…');
let auth = null;
try { auth = await makeAuthState(); } catch (e) { console.log('  auth failed:', e.message.split('\n')[0]); }

const all = { statuses: [], report: [] };
for (const cfg of CONFIGS) {
  if (!wantConfig(cfg.name)) continue;
  console.log(`\n=== ${cfg.name} ===`);
  const r = await runConfig(cfg, auth);
  all.statuses.push(...r.statuses);
  all.report.push(...r.report);
}

writeFileSync(`${OUT_BASE}/report-all.json`, JSON.stringify(all, null, 2));
const fails = all.statuses.filter((s) => !s.ok);
const byKind = {};
for (const r of all.report) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
console.log(`\nScénarios: ${all.statuses.length - fails.length}/${all.statuses.length} OK`);
console.log('Anomalies par type:', JSON.stringify(byKind));
if (fails.length) console.log('Échecs:', fails.map((f) => `${f.config}/${f.scenario}`).join(', '));
await browser.close();
