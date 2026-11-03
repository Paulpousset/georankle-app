#!/usr/bin/env node
/**
 * Build de GeoG pour les portails de jeux web — un zip prêt à déposer.
 *
 *   npm run build:portal -- crazygames
 *   npm run build:portal -- gamedistribution --gd-id <GAME_ID>
 *   options : --url <page publique du jeu sur le portail> (liens de partage)
 *
 * Sortie : dist-portal/<portail>/ (le dossier) et dist-portal/geog-<portail>.zip.
 *
 * Ce que fait le script, dans l'ordre :
 *  1. `expo export --platform web` avec EXPO_PUBLIC_PORTAL=<portail> : c'est
 *     cette variable qui active le mode portail (src/lib/portal.ts) — pubs du
 *     SDK du portail, jeu en invité, pas de lien vers l'app ni vers playgeog.com.
 *  2. Chemins RELATIFS. Le portail sert le jeu dans un sous-dossier de son CDN
 *     (CrazyGames refuse les chemins absolus). Expo, lui, écrit `/_expo/…` et
 *     `/assets/…`. On réécrit :
 *       - index.html : `/_expo/…` → `_expo/…` ;
 *       - le bundle : les chemins des morceaux chargés à la demande (`paths`)
 *         deviennent relatifs (résolus contre location.pathname par Expo), et
 *         chaque URL d'asset `"/assets/…"` devient
 *         `(globalThis.__GEOG_BASE__||"/")+"assets/…"`, où __GEOG_BASE__ est
 *         l'URL absolue du dossier du jeu, calculée par un <script> inline
 *         d'index.html. Une URL absolue passe telle quelle dans expo-asset ET
 *         dans Image / FontFace ; un chemin relatif, lui, se faisait recoller à
 *         la racine du domaine par expo-asset.
 *     Le script échoue si le nombre de remplacements sort de ce qu'on attend :
 *     mieux vaut un build cassé bruyamment qu'un zip qui affiche un écran blanc.
 *  3. index.html : SDK du portail, `user-select: none` (exigé par CrazyGames),
 *     titre. Pas d'AdSense : seules les pubs du SDK du portail sont permises.
 *  4. Ménage : les fichiers du site (public/ : guides, hq, ads.txt…) n'ont
 *     rien à faire dans le zip.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PORTALS = ['crazygames', 'gamedistribution'];

function fail(msg) {
  console.error(`\n✖ build-portal : ${msg}\n`);
  process.exit(1);
}

// ── Arguments ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const portal = args.find((a) => !a.startsWith('--'));
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!PORTALS.includes(portal)) fail(`portail attendu : ${PORTALS.join(' | ')} (reçu : ${portal ?? 'rien'})`);
const gdId = opt('gd-id') ?? process.env.GD_GAME_ID ?? '';
if (portal === 'gamedistribution' && !/^[0-9a-f]{32}$/i.test(gdId)) {
  fail(
    'GameDistribution exige le « Game ID » de ton jeu (32 caractères hexadécimaux, dans ' +
      'ton tableau de bord GameDistribution) : --gd-id <ID>',
  );
}
const gameUrl = opt('url') ?? '';

const OUT = join(ROOT, 'dist-portal', portal);
const ZIP = join(ROOT, 'dist-portal', `geog-${portal}.zip`);

function productionEnv() {
  try {
    const eas = JSON.parse(readFileSync(join(ROOT, 'eas.json'), 'utf8'));
    return eas.build?.production?.env ?? {};
  } catch {
    return {};
  }
}

// ── 1. Export Expo ──────────────────────────────────────────────────────────
rmSync(OUT, { recursive: true, force: true });
rmSync(ZIP, { force: true });
console.log(`› expo export (portail : ${portal})…`);
execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', OUT, '--clear'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    // Les clés publiques de production (Supabase anon, PostHog, Sentry) : celles
    // d'eas.json, pour que le build marche sans .env. Un .env ou une variable
    // d'environnement garde la priorité.
    ...productionEnv(),
    ...process.env,
    EXPO_PUBLIC_PORTAL: portal,
    EXPO_PUBLIC_PORTAL_GAME_URL: gameUrl,
  },
});

// ── 2. Chemins relatifs ─────────────────────────────────────────────────────
const jsDir = join(OUT, '_expo', 'static', 'js', 'web');
const bundles = readdirSync(jsDir).filter((f) => f.endsWith('.js'));
const main = bundles.find((f) => f.startsWith('index-'));
if (!main) fail(`bundle principal introuvable dans ${relative(ROOT, jsDir)}`);

let assetRewrites = 0;
let chunkRewrites = 0;
for (const f of bundles) {
  const p = join(jsDir, f);
  let js = readFileSync(p, 'utf8');
  // Morceaux chargés à la demande : `"paths":{"3612":"/_expo/static/js/web/x.js"}`.
  // Expo les résout contre location.origin + location.pathname : relatifs, ils
  // tombent dans le dossier du jeu.
  js = js.replace(/"\/_expo\/static\/js\/web\//g, () => {
    chunkRewrites++;
    return '"_expo/static/js/web/';
  });
  // URLs d'assets : uniquement en position de valeur (`exports=` ou `uri:`).
  js = js.replace(/(exports=|uri:)"\/assets\//g, (_m, head) => {
    assetRewrites++;
    return `${head}(globalThis.__GEOG_BASE__||"/")+"assets/`;
  });
  if (/"\/_expo\//.test(js)) fail(`chemin "/_expo/" absolu restant dans ${f}`);
  writeFileSync(p, js);
}
const leftover = readdirSync(jsDir)
  .map((f) => readFileSync(join(jsDir, f), 'utf8').match(/"\/assets\//g)?.length ?? 0)
  .reduce((a, b) => a + b, 0);
if (assetRewrites < 50) fail(`seulement ${assetRewrites} URL d'assets réécrites — le format du bundle a changé ?`);
if (leftover > 0) fail(`${leftover} URL "/assets/…" absolues restantes dans le bundle`);
console.log(`› chemins relatifs : ${assetRewrites} assets, ${chunkRewrites} morceaux`);

// ── 3. index.html ───────────────────────────────────────────────────────────
const indexPath = join(OUT, 'index.html');
let html = readFileSync(indexPath, 'utf8');
const replaceOnce = (from, to, what) => {
  if (!html.includes(from)) fail(`index.html : ${what} introuvable (template Expo changé ?)`);
  html = html.replace(from, to);
};
replaceOnce('src="/_expo/', 'src="_expo/', 'script du bundle');
replaceOnce('<title>GeoG</title>', '<title>GeoG — Geography Games</title>', 'balise title');

const sdk =
  portal === 'crazygames'
    ? `    <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>`
    : // GD_OPTIONS doit exister AVANT le SDK. Les événements sont relayés vers
      // l'app (window.__gdOnEvent, posé par src/lib/portal.ts) et mis en file
      // tant qu'elle n'est pas chargée.
      `    <script>
      window.__gdEvents = [];
      window.GD_OPTIONS = {
        gameId: ${JSON.stringify(gdId)},
        onEvent: function (event) {
          if (window.__gdOnEvent) window.__gdOnEvent(event.name);
          else window.__gdEvents.push(event.name);
        },
      };
      (function (d, s, id) {
        var js, fjs = d.getElementsByTagName(s)[0];
        if (d.getElementById(id)) return;
        js = d.createElement(s);
        js.id = id;
        js.src = 'https://html5.api.gamedistribution.com/main.min.js';
        fjs.parentNode.insertBefore(js, fjs);
      })(document, 'script', 'gamedistribution-jssdk');
    </script>`;

const head = `
    <!-- Build portail (${portal}) — scripts/build-portal.mjs -->
    <script>
      // Dossier du jeu, en URL absolue : la base de toutes les URLs d'assets.
      window.__GEOG_BASE__ = new URL('./', location.href).href;
    </script>
${sdk}
    <style>
      body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
      input, textarea { -webkit-user-select: text; user-select: text; }
    </style>
  </head>`;
replaceOnce('</head>', head, 'fin du head');
writeFileSync(indexPath, html);

// ── 4. Ménage ───────────────────────────────────────────────────────────────
// Tout ce que public/ a copié à la racine, sauf ce dont le jeu se sert.
const KEEP = new Set(['index.html', '_expo', 'assets', 'metadata.json', 'favicon.ico']);
for (const name of readdirSync(OUT)) {
  if (!KEEP.has(name)) rmSync(join(OUT, name), { recursive: true, force: true });
}

// ── Bilan + zip ─────────────────────────────────────────────────────────────
function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(OUT);
const total = files.reduce((a, p) => a + statSync(p).size, 0);
const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} Mo`;
console.log(`› ${files.length} fichiers, ${mb(total)} (limites CrazyGames : 1 500 fichiers, 250 Mo)`);
if (files.length > 1500) fail('plus de 1 500 fichiers');

if (process.platform !== 'win32') {
  execFileSync('zip', ['-qr', ZIP, '.'], { cwd: OUT, stdio: 'inherit' });
  console.log(`✔ ${relative(ROOT, ZIP)} (${mb(statSync(ZIP).size)})`);
} else {
  console.log(`✔ ${relative(ROOT, OUT)} — zippe le CONTENU du dossier (index.html à la racine du zip).`);
}
