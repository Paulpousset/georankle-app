/**
 * Post-traitement du build web, appelé par le buildCommand de vercel.json.
 *
 * `expo export --platform web` produit un dist/index.html qui est la coquille
 * de la SPA : titre « GeoG », aucune description, et un <noscript> qui dit
 * seulement « You need to enable JavaScript to run this app. » C'est cette
 * page que le relecteur AdSense a vue en juillet 2026 — d'où le refus pour
 * « écrans sans contenu d'éditeur ».
 *
 * Ce script fait trois choses :
 *   1. renomme la coquille en app.html (les rewrites de /play pointent dessus) ;
 *   2. lui donne un vrai <head> et un <noscript> qui décrit le jeu et renvoie
 *      vers les pages de contenu, pour qu'aucune URL du site ne soit jamais
 *      une page blanche ;
 *   3. installe la landing (public/landing.html) comme page d'accueil ;
 *   4. injecte /site-analytics.js dans chaque page de contenu — sans quoi
 *      tout le trafic SEO du site (landing, guides, à-propos…) est invisible
 *      dans PostHog, l'app étant la seule surface instrumentée.
 *
 * Il est idempotent et échoue bruyamment : si la structure du template Expo
 * change, le build s'arrête au lieu de déployer une coquille non traitée.
 */
import { readFileSync, writeFileSync, rmSync, copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const shell = join(DIST, 'index.html');
const appHtml = join(DIST, 'app.html');
const landing = join(DIST, 'landing.html');

function fail(message) {
  console.error(`[postbuild-web] ${message}`);
  process.exit(1);
}

if (!existsSync(shell)) fail('dist/index.html introuvable — le build web a-t-il tourné ?');
if (!existsSync(landing)) fail('dist/landing.html introuvable — public/landing.html a-t-il été copié ?');

let html = readFileSync(shell, 'utf8');

/** Remplace `needle` une fois, ou arrête le build si le template a changé. */
function replaceOnce(haystack, needle, replacement, label) {
  if (!haystack.includes(needle)) fail(`template Expo inattendu : ${label} introuvable`);
  return haystack.replace(needle, replacement);
}

html = replaceOnce(html, '<html lang="en">', '<html lang="fr">', 'attribut lang');

const head = `<title>Jouer au défi du jour — GeoG, jeu de géographie</title>
    <meta name="description" content="Le défi du jour de GeoG : drapeaux, capitales, globe 3D et silhouettes, une série identique pour tous les joueurs du monde. Gratuit, sans compte, directement dans le navigateur." />
    <link rel="canonical" href="https://playgeog.com/play" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="GeoG" />
    <meta property="og:title" content="Jouer au défi du jour — GeoG" />
    <meta property="og:description" content="Drapeaux, capitales, globe 3D : le défi de géographie du jour, gratuit et sans compte." />
    <meta property="og:url" content="https://playgeog.com/play" />
    <meta property="og:image" content="https://playgeog.com/og-invite.png" />`;

html = replaceOnce(html, '<title>GeoG</title>', head, 'balise title');

// Le <noscript> devient une vraie page de repli : ce que le visiteur (ou un
// robot d'indexation sans JavaScript) voit s'il n'exécute pas le bundle.
const noscript = `<noscript>
      <div style="max-width:640px;margin:60px auto;padding:0 24px;font-family:Georgia,serif;line-height:1.7;color:#2c1810;">
        <h1 style="font-size:32px;margin-bottom:16px;">GeoG — le jeu de géographie</h1>
        <p style="margin-bottom:16px;">Le jeu se joue directement dans le navigateur et nécessite JavaScript. Activez-le pour lancer le défi du jour, ou installez l'application sur
          <a href="https://apps.apple.com/app/id6779650018">iPhone</a> et
          <a href="https://play.google.com/store/apps/details?id=com.paulpousset.geog">Android</a>.</p>
        <p style="margin-bottom:16px;">GeoG propose douze modes de jeu couvrant les 195 pays du monde : reconnaître les drapeaux, retrouver les capitales, localiser un pays sur un globe en 3D, identifier une silhouette, relier deux pays de frontière en frontière, et un défi quotidien identique pour tous les joueurs.</p>
        <p>En attendant, nos guides de géographie se lisent sans JavaScript :</p>
        <ul>
          <li><a href="/guides/combien-de-pays-dans-le-monde/">Combien de pays y a-t-il dans le monde ?</a></li>
          <li><a href="/guides/drapeaux-du-monde/">Les drapeaux du monde : familles, symboles et sosies</a></li>
          <li><a href="/guides/capitales-du-monde/">Les capitales du monde et leurs pièges</a></li>
          <li><a href="/guides/frontieres-terrestres/">Les frontières terrestres : records et curiosités</a></li>
          <li><a href="/guides/">Tous les guides</a> · <a href="/a-propos/">À propos</a> · <a href="/contact/">Contact</a></li>
        </ul>
      </div>
    </noscript>`;

html = replaceOnce(
  html,
  '<noscript>\n      You need to enable JavaScript to run this app.\n    </noscript>',
  noscript,
  'bloc noscript',
);

writeFileSync(appHtml, html, 'utf8');
rmSync(shell);
copyFileSync(landing, shell);

/**
 * Injecte l'analytics du site dans toutes les pages de contenu.
 *
 * app.html est exclu : la SPA embarque déjà posthog-js (src/lib/analytics.web.ts)
 * et un second `init()` sur la même clé dédoublerait les pages vues.
 * L'injection est idempotente — une page qui porte déjà la balise est laissée
 * telle quelle, pour que relancer le postbuild sur un dist existant soit sûr.
 */
const ANALYTICS_TAG = '<script defer src="/site-analytics.js"></script>';
const SKIP = new Set(['app.html']);

if (!existsSync(join(DIST, 'site-analytics.js'))) {
  fail('dist/site-analytics.js introuvable — public/site-analytics.js a-t-il été copié ?');
}

/** Toutes les pages .html de dist, récursivement (les guides sont en sous-dossiers). */
function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    // _expo contient le bundle JS, jamais de page à instrumenter.
    if (entry === '_expo' || entry === 'assets') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

let injected = 0;
for (const file of htmlFiles(DIST)) {
  if (SKIP.has(file.slice(DIST.length + 1))) continue;
  const page = readFileSync(file, 'utf8');
  if (page.includes('/site-analytics.js')) continue;
  if (!page.includes('</head>')) fail(`page sans </head> : ${file}`);
  writeFileSync(file, page.replace('</head>', `  ${ANALYTICS_TAG}\n</head>`), 'utf8');
  injected += 1;
}

console.log(
  `[postbuild-web] app.html enrichi, landing installée en page d'accueil, analytics injectée dans ${injected} page(s)`,
);
