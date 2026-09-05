// GeoG — playtest des seize langues sur le build web.
//
// La question à laquelle ce script répond est celle posée à l'ajout des
// quatorze langues : « est-ce que toutes les parties sont dispo ? ». Il ouvre
// l'app dans chaque langue, entre dans CHAQUE mode de jeu depuis le menu, et
// vérifie trois choses par écran : la tuile porte bien le libellé traduit (pas
// l'anglais de repli), l'écran s'ouvre sans erreur JavaScript, et il ne reste
// pas de français en dur au milieu d'une interface thaïe.
//
//   npm run build:web:full && npx serve dist -l 5577
//   node scripts/i18n_playtest.mjs                 # les 16 langues
//   LANGS=th,el node scripts/i18n_playtest.mjs     # un sous-ensemble
//
// Sortie : $PLAYTEST_OUT/<langue>/<mode>.png + report.json
import pw from '/Users/paulpousset/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const { chromium } = pw;
const URL_BASE = process.env.PLAYTEST_URL || 'http://localhost:5577';
const OUT = process.env.PLAYTEST_OUT || join(ROOT, '.playtest-i18n');

/** Le registre des langues, relu du TypeScript : une seule source. */
function locales() {
  const src = readFileSync(join(ROOT, 'src/i18n/locales.ts'), 'utf8');
  const body = src.slice(src.indexOf('LOCALES: Record<Language, LocaleMeta> = {'));
  const out = {};
  for (const m of body.matchAll(/^ {2}(\w+): \{ native: '([^']+)'.*?tag: '([^']+)'/gm)) {
    out[m[1]] = { native: m[2], tag: m[3] };
  }
  return out;
}

const LOCALES = locales();
const CODES = process.env.LANGS ? process.env.LANGS.split(',') : Object.keys(LOCALES);

const catalog = (code) =>
  code === 'fr' || code === 'en'
    ? {}
    : JSON.parse(readFileSync(join(ROOT, `src/i18n/catalog/${code}.json`), 'utf8'));

/** Le libellé tel que l'app le rendra : `tr(code, fr, en)`, hors du navigateur. */
const label = (code, fr, en, cat) => (code === 'fr' ? fr : code === 'en' ? en : cat[en] || en);

/**
 * Les entrées du menu, mode par mode. `fr`/`en` sont les deux chaînes écrites
 * dans `MainMenu.tsx` — c'est la clé anglaise qui retrouve la traduction.
 * `tab` : 0 Solo, 1 Local, 2 En ligne. `literal` marque les titres qui ne se
 * traduisent pas (« Rankle », « Silhouette » sont des noms propres).
 */
const ENTRIES = [
  { id: 'globe', tab: 0, fr: 'Globe Géo', en: 'Geo Globe' },
  { id: 'regions', tab: 0, fr: 'Défis Pays', en: 'Country Challenges' },
  { id: 'guess', tab: 0, fr: 'Devinez le Pays', en: 'Guess Country' },
  { id: 'borders', tab: 0, fr: 'Frontières', en: 'Borders' },
  { id: 'silhouette', tab: 0, fr: 'Silhouette', en: 'Silhouette', literal: true },
  { id: 'higherlower', tab: 0, fr: 'Plus ou Moins', en: 'Higher or Lower' },
  { id: 'classic', tab: 0, fr: 'Rankle', en: 'Rankle', literal: true },
  { id: 'streak', tab: 0, fr: 'Mode Streak', en: 'Streak Mode' },
  { id: 'quiz-capital', tab: 0, fr: 'Capitales', en: 'Capitals' },
  { id: 'quiz-flag', tab: 0, fr: 'Drapeaux', en: 'Flags' },
  { id: 'daily', tab: 0, fr: 'Défi du Jour', en: 'Daily Challenge' },
  { id: 'story', tab: 0, fr: 'Mode Histoire', en: 'Story Mode' },
];

/** Les onglets du menu, à ouvrir avant de chercher leurs tuiles. */
const TABS = [null, { fr: 'Local', en: 'Local', literal: true }, { fr: 'En Ligne', en: 'Online' }];

/** Du français qui n'a rien à faire dans une interface étrangère. */
const FR_LEAK = [
  'Défi du Jour', 'Boutique', 'Classement', 'Amis', 'Connexion', 'Retour',
  'Choisissez', 'Rejouer', 'Quitter', 'Chargement',
];
/** L'anglais de repli, visible seulement si une clé manque au catalogue. */
const EN_LEAK = ['Play again', 'Loading', 'Leaderboard', 'Friends', 'Shop', 'Back'];

const CONSOLE_ALLOW = [
  /Download the React DevTools/i, /useNativeDriver/i, /shadow\w*" style props/i,
  /pointerEvents is deprecated/i, /aria-hidden/i, /AsyncStorage has been extracted/i,
  /expo-notifications/i, /Sentry Logger/i, /\[PostHog/i, /React DevTools/i,
];
const REQ_ALLOW = [/posthog/i, /sentry/i, /ERR_ABORTED/i, /supabase/i];

const seed = (code) => {
  try {
    localStorage.setItem('lang:v1', code);
    localStorage.setItem('tutorial:seen:v2', 'true');
    for (const m of ['classic', 'streak', 'versus', 'guess', 'globe', 'regions', 'challenge',
      'quiz-capital', 'quiz-flag', 'higherlower', 'silhouette', 'borders', 'languages']) {
      localStorage.setItem(`modeIntro:seen:v2:${m}`, 'true');
    }
  } catch { /* navigation privée : le test tourne quand même */ }
};

const browser = await chromium.launch({ channel: 'chrome' });
const findings = [];

for (const code of CODES) {
  const meta = LOCALES[code];
  const cat = catalog(code);
  const dir = join(OUT, code);
  mkdirSync(dir, { recursive: true });

  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    locale: meta.tag, deviceScaleFactor: 1,
  });
  await ctx.addInitScript(seed, code);
  const page = await ctx.newPage();

  let where = 'boot';
  const note = (kind, text) =>
    findings.push({ lang: code, where, kind, text: String(text).slice(0, 300) });

  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (CONSOLE_ALLOW.some((rx) => rx.test(m.text()))) return;
    note('console.error', m.text());
  });
  page.on('pageerror', (e) => note('pageerror', e.message));
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText || '';
    if (REQ_ALLOW.some((rx) => rx.test(r.url()) || rx.test(err))) return;
    note('requestfailed', `${err} ${r.url()}`);
  });

  // `serve dist` ne connaît pas les réécritures de vercel.json : on ouvre la
  // coquille de la langue directement, ce que `/es/play` sert en production.
  const shell = code === 'fr' ? '/app.html' : `/app-${code}.html`;
  const boot = async () => {
    await page.goto(URL_BASE + shell, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2600);
  };
  const body = () => page.evaluate(() => document.body.innerText);

  /**
   * Le texte qui déborde de l'écran.
   *
   * C'est le risque propre au multilingue : « Ranglistenmodus » ou
   * « Πρόκληση της ημέρας » ne tiennent pas dans un bouton dessiné pour
   * « Ligue ». On ignore ce qui vit dans un conteneur qui défile de lui-même
   * (carrousels, rangées de puces), légitimement plus large que l'écran.
   */
  const overflow = () => page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const scroller = (el) => {
      for (let a = el.parentElement; a; a = a.parentElement) {
        if (a.scrollWidth > a.clientWidth + 2) {
          const ox = getComputedStyle(a).overflowX;
          if (ox === 'auto' || ox === 'scroll') return true;
        }
      }
      return false;
    };
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!(el instanceof HTMLElement) || !el.innerText) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 4 && r.height > 4 && (r.right > vw + 3 || r.left < -3) && !scroller(el)) {
        out.push(`${Math.round(r.left)}..${Math.round(r.right)}/${vw} ${el.innerText.slice(0, 40).replace(/\n/g, ' ')}`);
      }
    }
    return [...new Set(out)].slice(0, 6);
  });

  await boot();

  // 1. Le menu s'ouvre-t-il dans la bonne langue ?
  const menu = await body();
  if (menu.trim().length < 40) note('vide', 'le menu ne rend aucun texte');
  const leaks = (text) => [
    ...(code === 'fr' ? [] : FR_LEAK.filter((w) => text.includes(w))).map((w) => `fr:${w}`),
    ...(code === 'fr' || code === 'en' ? [] : EN_LEAK.filter((w) => text.includes(w))).map((w) => `en:${w}`),
  ];
  for (const leak of leaks(menu)) note('fuite', `menu : ${leak}`);
  for (const bad of await overflow()) note('débordement', `menu : ${bad}`);
  await page.screenshot({ path: join(dir, 'menu.png') });

  // 2. Chaque mode s'ouvre-t-il, et depuis un libellé réellement traduit ?
  for (const entry of ENTRIES) {
    where = entry.id;
    const title = label(code, entry.fr, entry.en, cat);
    if (!entry.literal && code !== 'fr' && code !== 'en' && title === entry.en) {
      note('non traduit', `tuile « ${entry.en} » : pas de traduction au catalogue`);
    }
    try {
      await boot();
      const tab = TABS[entry.tab];
      if (tab) {
        const tabTitle = tab.literal ? tab.en : label(code, tab.fr, tab.en, cat);
        await page.getByText(tabTitle, { exact: true }).first().click();
        await page.waitForTimeout(700);
      }
      const tile = page.getByText(title, { exact: true }).first();
      await tile.waitFor({ state: 'visible', timeout: 9000 });
      await tile.click();
      await page.waitForTimeout(2800);
      const screen = await body();
      if (screen.trim().length < 20) note('vide', `${entry.id} : écran sans texte`);
      for (const leak of leaks(screen)) note('fuite', `${entry.id} : ${leak}`);
      for (const bad of await overflow()) note('débordement', `${entry.id} : ${bad}`);
      await page.screenshot({ path: join(dir, `${entry.id}.png`) });
    } catch (e) {
      note('injouable', `${entry.id} : ${e.message.split('\n')[0]}`);
    }
  }

  await ctx.close();
  const own = findings.filter((f) => f.lang === code);
  console.log(`${code} (${meta.native}) — ${own.length ? `${own.length} signalement(s)` : 'RAS'}`);
}

await browser.close();
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'report.json'), JSON.stringify(findings, null, 2));
console.log(`\n${findings.length} signalement(s) — détail : ${join(OUT, 'report.json')}`);
if (findings.length) {
  const byKind = {};
  for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  console.log(Object.entries(byKind).map(([k, n]) => `${k}: ${n}`).join(' · '));
  process.exitCode = 1;
}
