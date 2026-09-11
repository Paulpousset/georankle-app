// Playwright n'est pas une dépendance de l'app : il vit dans le pipeline vidéo
// marketing, sorti du dépôt le 2026-09-11 (`../videos-pub/video-pipeline/`, à
// côté du dépôt), qui sert déjà à filmer les mêmes écrans. On le résout depuis
// là (ou depuis PLAYWRIGHT_DIR), avec un repli sur une installation globale.
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try {
  const dir = process.env.PLAYWRIGHT_DIR || join(ROOT, '..', 'videos-pub', 'video-pipeline', 'node_modules', 'playwright');
  ({ chromium } = require(join(dir, 'index.js')));
} catch {
  ({ chromium } = require('playwright'));
}

const URL = process.env.SHOT_URL || 'http://localhost:5577';
// DEVICE=ipad -> iPad Pro 13" (2048x2732); DEVICE=iphone65 -> 6.5" (1284x2778);
// default iPhone 6.7/6.9" (1290x2796)
const BASE = process.env.SHOT_OUT || join(ROOT, 'store-screenshots');
const PRESETS = {
  ipad: { viewport: { width: 1024, height: 1366 }, dsf: 2, out: `${BASE}/ipad-13` },
  iphone65: { viewport: { width: 428, height: 926 }, dsf: 3, out: `${BASE}/iphone-65` },
  default: { viewport: { width: 430, height: 932 }, dsf: 3, out: BASE },
};
const preset = PRESETS[process.env.DEVICE] ?? PRESETS.default;
const OUT = preset.out;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: preset.viewport,
  deviceScaleFactor: preset.dsf,
  isMobile: true,
  hasTouch: true,
  locale: 'fr-FR',
});

// Suppress first-launch overlays: onboarding tour + per-mode intro popups.
// AsyncStorage on web writes straight to localStorage with the same keys.
const MODES = ['classic','streak','versus','guess','globe','regions','challenge','quiz-capital','quiz-flag','higherlower','silhouette','borders','local-builder'];
await ctx.addInitScript(({ modes }) => {
  try {
    localStorage.setItem('tutorial:seen:v2', 'true');
    for (const m of modes) localStorage.setItem(`modeIntro:seen:v2:${m}`, 'true');
  } catch {}
}, { modes: MODES });

const page = await ctx.newPage();
const log = (...a) => console.log('•', ...a);

const fresh = async () => {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
};
const tap = async (label, wait = 1500) => {
  const el = page.getByText(label, { exact: true }).first();
  await el.waitFor({ state: 'visible', timeout: 9000 });
  await el.click();
  await page.waitForTimeout(wait);
};
const tapIfVisible = async (label, wait = 2500) => {
  const el = page.getByText(label, { exact: true }).first();
  try {
    await el.waitFor({ state: 'visible', timeout: 3000 });
    await el.click();
    await page.waitForTimeout(wait);
    return true;
  } catch { return false; }
};
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); log('shot', name); };

// 1. Home menu
await fresh();
await shot('01-menu-home');

// 2. Solo modes grid
await fresh();
await tap('Solo');
await shot('02-modes');

// 3..N each solo mode — fresh nav each time; tap JOUER when a lobby screen shows
const modes = [
  ['Rankle', '03-rankle', 3000],
  ['Globe Géo', '04-globe', 6000],
  ['Capitales', '05-capitales', 3000],
  ['Silhouette', '07-silhouette', 3000],
  ['Frontières', '08-frontieres', 4000],
  ['Plus ou Moins', '09-plusoumoins', 3000],
  ['Drapeaux', '10-drapeaux', 3000],
  ['Défis Pays', '11-defis-pays', 3000],
];
for (const [label, name, wait] of modes) {
  try {
    await fresh();
    await tap('Solo');
    await tap(label, wait);
    await tapIfVisible('JOUER', wait);
    await shot(name);
  } catch (e) { log('FAIL', label, '-', e.message.split('\n')[0]); }
}

// Devinez le Pays — type a first guess so the clue board is populated
try {
  await fresh();
  await tap('Solo');
  await tap('Devinez le Pays', 2500);
  await tapIfVisible('JOUER');
  const input = page.getByPlaceholder(/Tapez un pays/).first();
  await input.waitFor({ state: 'visible', timeout: 9000 });
  await input.fill('France');
  await page.waitForTimeout(800);
  // Click the autocomplete row (Enter doesn't submit) so the comparison grid fills in.
  await page.getByText('France', { exact: true }).last().click();
  await page.waitForTimeout(2500);
  await shot('06-devine');
} catch (e) { log('devine FAIL', e.message.split('\n')[0]); }

// Défi du Jour hub
try {
  await fresh();
  await tap('Défi du Jour', 3000);
  await shot('12-defi-du-jour');
} catch (e) { log('daily FAIL', e.message.split('\n')[0]); }

await browser.close();
log('done ->', OUT);
