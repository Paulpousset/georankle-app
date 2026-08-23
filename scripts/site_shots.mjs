/**
 * Regénère les captures d'écran des pages de mode du site.
 *
 * Les pages de mode (`/jeu-drapeaux/`, `/en/flag-game/`…) montrent une capture
 * du mode en question, dans la langue de la page. Ce script les produit toutes,
 * en français et en anglais, à la taille exacte utilisée par `.shot`
 * (480 × 1040), en WebP avec un PNG de repli.
 *
 * Il tire parti des deep links `?mode=` ajoutés à `src/lib/webEntry.ts` : plus
 * besoin de naviguer dans les menus, on entre directement dans le mode voulu.
 * Le menu principal, lui, n'est pas adressable par URL sur le web — on y
 * remonte depuis un mode solo, par son bouton « accueil ».
 *
 * Outil de développement, pas de build. Prérequis :
 *
 *   npm run build:web && npm run build:site
 *   npx serve dist -l 5599        (ou n'importe quel serveur statique)
 *   node scripts/site_shots.mjs
 *
 * Puis, pour chaque capture produite dans public/shots/ :
 *   sips --resampleWidth 480 --out /tmp/x.png x.png
 *   cwebp -q 82 /tmp/x.png -o x-480.webp && cp /tmp/x.png x-480.png
 *
 * ⚠️ Les modes Classé, Histoire et En ligne ne sont pas capturés : ils
 * demandent un compte et une progression, que ce harnais n'a pas.
 */
import { chromium } from 'playwright';

const URL = process.env.SHOT_URL || 'http://localhost:5599';
const OUT = new URL('../public/shots/', import.meta.url).pathname;

/** Les popups de première partie, neutralisées avant chargement. */
const MODES = [
  'classic', 'streak', 'versus', 'guess', 'globe', 'regions', 'challenge',
  'quiz-capital', 'quiz-flag', 'higherlower', 'silhouette', 'borders',
  'local-builder', 'languages',
];

/** `[mode bootable, nom de fichier, libellés à taper pour entrer en partie]`. */
const SOLO = [
  ['quiz-flag', '10-drapeaux', ['JOUER', 'PLAY']],
  ['quiz-capital', '20-capitales', ['JOUER', 'PLAY']],
  ['globe', '04-globe', []],
  ['silhouette', '21-silhouettes', []],
  ['borders', '08-frontieres', []],
  ['guess', '22-devine', []],
  ['classic', '03-rankle', []],
  ['higherlower', '23-plus-ou-moins', []],
];

const browser = await chromium.launch();

for (const lang of ['fr', 'en']) {
  const suffix = lang === 'fr' ? '' : '-en';
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: lang === 'fr' ? 'fr-FR' : 'en-GB',
  });
  await ctx.addInitScript(
    ({ modes, language }) => {
      try {
        localStorage.setItem('tutorial:seen:v2', 'true');
        localStorage.setItem('lang:v1', language);
        for (const m of modes) localStorage.setItem(`modeIntro:seen:v2:${m}`, 'true');
      } catch {
        /* stockage indisponible : les popups s'afficheront, c'est tout */
      }
    },
    { modes: MODES, language: lang },
  );
  const page = await ctx.newPage();

  const tapIf = async (label) => {
    try {
      const el = page.getByText(label, { exact: true }).first();
      await el.waitFor({ state: 'visible', timeout: 5000 });
      await el.click();
      await page.waitForTimeout(2500);
      return true;
    } catch {
      return false;
    }
  };

  // `networkidle` ne survient jamais sur les modes à globe : ils animent en
  // continu. On attend donc un délai fixe après le DOM.
  const open = async (path) => {
    await page.goto(URL + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(7000);
  };

  for (const [mode, name, clicks] of SOLO) {
    await open(`/play?mode=${mode}`);
    for (const c of clicks) if (await tapIf(c)) break;
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}${name}${suffix}.png` });
    console.log(`  ${name}${suffix}`);
  }

  // Le hub du défi du jour est ce que `/play` sert par défaut.
  await open('/play');
  await page.screenshot({ path: `${OUT}12-defi-du-jour${suffix}.png` });
  console.log(`  12-defi-du-jour${suffix}`);

  // Le menu principal : on entre dans un mode solo puis on remonte par l'accueil.
  await open('/play?mode=globe');
  const home = page.locator('[aria-label*="ccueil" i], [aria-label*="home" i], [aria-label*="menu" i]').first();
  await home.click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}01-menu-home${suffix}.png` });
  console.log(`  01-menu-home${suffix}`);

  await ctx.close();
}

await browser.close();
console.log('\nCaptures brutes écrites. Redimensionne-les en 480 px avant de les référencer.');
