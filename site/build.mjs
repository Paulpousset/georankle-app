/**
 * Génère le site public dans `dist/`, après `expo export --platform web`.
 *
 * Remplace l'ancien `scripts/postbuild-web.mjs`, qui ne faisait que rattraper
 * la coquille de la SPA. Le site est passé de quinze pages écrites à la main à
 * une soixantaine dans deux langues : le `<head>`, les `hreflang`, le fil
 * d'Ariane, les données structurées et le sitemap sont désormais construits
 * une fois pour toutes, à partir de `site/lib/routes.mjs`.
 *
 * Trois étapes :
 *   1. la coquille Expo devient `app.html` (+ `app-en.html`), avec un vrai
 *      `<head>` et un `<noscript>` qui décrit le jeu — aucune URL du site n'est
 *      jamais une page blanche, c'est ce qui avait fait échouer la revue AdSense ;
 *   2. chaque route publiée est rendue depuis son fragment de contenu ;
 *   3. sitemap, robots et contrôles SEO (réciprocité des hreflang, canonicals,
 *      liens morts, titres dupliqués) — le build échoue plutôt que de publier.
 *
 * Il est idempotent et échoue bruyamment.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { DIST, ORIGIN, ROOT } from './lib/paths.mjs';
import {
  LOCALES,
  LOCALE_META,
  DEFAULT_LOCALE,
  ROUTES,
  alternates,
  href,
  routesIn,
} from './lib/routes.mjs';
import { renderPage, attr, ADSENSE_HEAD } from './lib/layout.mjs';
import { loadPage, interpolate, extractFaq } from './lib/content.mjs';
import { playDoc, playBar, PLAY_DOC_CSS, PLAY_DOC_HEAD_SCRIPT, PLAY_DOC_SCRIPT } from './lib/playDoc.mjs';
import { article, faqPage, videoGame, render as renderJsonLd } from './lib/jsonld.mjs';
import { buildSitemap } from './lib/sitemap.mjs';
import { validate } from './lib/validate.mjs';
import { strings } from './lib/strings.mjs';
import { COUNTRY_COUNT, MODE_COUNT } from './lib/constants.mjs';
import { assertPartition } from './lib/continents.mjs';
import { localeData } from './lib/siteLocales.mjs';
import { INVITE_COPY, inviteFile, renderInvite } from './lib/invite.mjs';

function fail(message) {
  console.error(`\n[site] ${message}\n`);
  process.exit(1);
}

/**
 * `--check` rend toutes les pages en mémoire et lance les contrôles SEO, sans
 * `dist/` et sans rien écrire. C'est ce que la CI exécute : une réciprocité de
 * hreflang cassée ou un lien mort ne doit pas attendre le déploiement pour se
 * voir, et l'export Expo prend plusieurs minutes.
 */
const CHECK_ONLY = process.argv.includes('--check');

/** Écrit un fichier dans `dist`, en créant les dossiers manquants. */
function emit(path, contents) {
  if (CHECK_ONLY) return;
  const target = join(DIST, path.replace(/^\//, ''));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents, 'utf8');
}

/** L'URL `/guides/x/` devient `guides/x/index.html` ; `/privacy.html` reste tel quel. */
function fileFor(path) {
  if (path.endsWith('.html')) return path;
  return `${path.replace(/\/$/, '')}/index.html`.replace(/^\/index\.html$/, '/index.html');
}

if (!CHECK_ONLY && !existsSync(DIST)) {
  fail('dist/ introuvable — `expo export --platform web` a-t-il tourné ?');
}
assertPartition();

// ── 1. La coquille de l'application ───────────────────────────────────────────

const shellPath = join(DIST, 'index.html');

/**
 * La coquille brute d'Expo, mise de côté hors de `dist`.
 *
 * Le générateur consomme `dist/index.html` (il devient `app.html`) puis écrit la
 * page d'accueil à sa place : relancer le build sans réexporter ne retrouverait
 * plus la coquille. En CI ce cas n'existe pas — `dist` est neuf à chaque fois —
 * mais en rédaction on relance le générateur des dizaines de fois. La copie vit
 * dans `node_modules/.cache`, donc jamais déployée et jamais versionnée.
 */
const STASH = join(ROOT, 'node_modules', '.cache', 'geog-site', 'expo-shell.html');

function readShell() {
  if (existsSync(shellPath)) {
    const raw = readFileSync(shellPath, 'utf8');
    if (raw.includes('<title>GeoG</title>')) {
      mkdirSync(dirname(STASH), { recursive: true });
      writeFileSync(STASH, raw, 'utf8');
      return raw;
    }
  }
  if (existsSync(STASH)) {
    console.log('[site] coquille Expo reprise du cache (dist/index.html déjà généré)');
    return readFileSync(STASH, 'utf8');
  }
  fail('coquille Expo introuvable — lance `npm run build:web` avant le générateur.');
  return '';
}

/** En `--check`, une coquille minimale suffit : on ne valide que le `<head>`. */
const FAKE_SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
    <title>GeoG</title>
</head>
<body><div id="root"></div><noscript>
      You need to enable JavaScript to run this app.
    </noscript></body>
</html>`;

const shellSource = CHECK_ONLY ? FAKE_SHELL : readShell();

function replaceOnce(haystack, needle, replacement, label) {
  if (!haystack.includes(needle)) fail(`template Expo inattendu : ${label} introuvable`);
  return haystack.replace(needle, replacement);
}

/**
 * Habille la coquille pour une langue donnée.
 *
 * `/play` et `/en/play` servent le MÊME bundle : seul le `<head>` change, pour
 * que les deux URL soient canoniques d'elles-mêmes et se déclarent alternates.
 */
function buildAppShell(locale) {
  const s = strings(locale);
  const canonical = `${ORIGIN}${href('play', locale)}`;
  const meta = LOCALE_META[locale];
  const generated = localeData(locale);
  const copy = generated
    ? {
        // Les quatorze langues générées reprennent l'accroche de leur page
        // d'accueil : une seule source par langue, et la coquille du jeu ne
        // dérive pas du reste du site.
        title: `${generated.chrome.play} — ${generated.home.ogTitle}`,
        description: generated.home.description,
        ogTitle: `${generated.chrome.play} — GeoG`,
        ogDescription: generated.home.standfirst.replace(/\{\{modes\}\}/g, String(MODE_COUNT)),
        h1: generated.home.ogTitle,
        intro: generated.home.howBody,
        pitch: generated.home.standfirst
          .replace(/\{\{countries\}\}/g, String(COUNTRY_COUNT))
          .replace(/\{\{modes\}\}/g, String(MODE_COUNT)),
        lead: generated.home.modesIntro,
        all: generated.chrome.modes,
      }
    : locale === 'fr'
      ? {
          title: 'Jouer au défi du jour — GeoG, jeu de géographie',
          description: `Le défi du jour de GeoG : drapeaux, capitales, globe 3D et silhouettes, une série identique pour tous les joueurs du monde. Gratuit, sans compte, directement dans le navigateur.`,
          ogTitle: 'Jouer au défi du jour — GeoG',
          ogDescription:
            'Drapeaux, capitales, globe 3D : le défi de géographie du jour, gratuit et sans compte.',
          h1: 'GeoG — le jeu de géographie',
          intro: `Le jeu se joue directement dans le navigateur et nécessite JavaScript. Activez-le pour lancer le défi du jour, ou installez l'application sur`,
          pitch: `GeoG propose ${MODE_COUNT} modes de jeu couvrant les ${COUNTRY_COUNT} pays du monde : reconnaître les drapeaux, retrouver les capitales, localiser un pays sur un globe en 3D, identifier une silhouette, relier deux pays de frontière en frontière, et un défi quotidien identique pour tous les joueurs.`,
          lead: 'En attendant, nos guides de géographie se lisent sans JavaScript :',
          all: 'Tous les guides',
        }
      : {
          title: 'Play the daily challenge — GeoG, the geography game',
          description: `GeoG's daily challenge: flags, capitals, 3D globe and country shapes — the same run for every player in the world. Free, no account, straight in your browser.`,
          ogTitle: 'Play the daily challenge — GeoG',
          ogDescription: 'Flags, capitals, 3D globe: today’s geography challenge, free and account-free.',
          h1: 'GeoG — the geography game',
          intro: `The game runs in your browser and needs JavaScript. Turn it on to start the daily challenge, or install the app on`,
          pitch: `GeoG has ${MODE_COUNT} game modes covering the world's ${COUNTRY_COUNT} countries: recognising flags, recalling capitals, locating a country on a 3D globe, identifying a silhouette, hopping from border to border, and a daily challenge shared by every player.`,
          lead: 'In the meantime, our geography guides read fine without JavaScript:',
          all: 'All guides',
        };

  let html = replaceOnce(shellSource, '<html lang="en">', `<html lang="${meta.htmlLang}">`, 'attribut lang');

  const head = `<title>${attr(copy.title)}</title>
    <meta name="description" content="${attr(copy.description)}" />
    <link rel="canonical" href="${canonical}" />
${alternates('play')
  .map((a) => `    <link rel="alternate" hreflang="${a.hreflang}" href="${ORIGIN}${a.path}" />`)
  .join('\n')}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="GeoG" />
    <meta property="og:title" content="${attr(copy.ogTitle)}" />
    <meta property="og:description" content="${attr(copy.ogDescription)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${ORIGIN}/og-invite.png" />
    <meta property="og:locale" content="${meta.ogLocale}" />
${LOCALES.filter((l) => l !== locale)
  .map((l) => `    <meta property="og:locale:alternate" content="${LOCALE_META[l].ogLocale}" />`)
  .join('\n')}
${ADSENSE_HEAD}
    <!-- Le pont web → app. Un lien de parrainage (?code=) ou d'invitation de
         ligue (?league=) atterrit ici : si l'application est installée, elle
         doit prendre le relais, sinon le code n'est jamais crédité ni la ligue
         rejointe. Chargé avant le bundle de jeu pour que la redirection Android
         parte tout de suite ; inerte sans ces paramètres, et inerte aussi avec
         web=1 (le joueur a choisi le navigateur). Voir public/open-in-app.js. -->
    <script>window.GEOG_APP_LINK=${JSON.stringify({ have: s.haveApp, open: s.openInApp, close: s.dismiss })};</script>
    <script src="/open-in-app.js"></script>`;

  html = replaceOnce(html, '<title>GeoG</title>', head, 'balise title');

  // Le style du site vient en FIN de <head>, APRÈS la feuille « expo-reset » :
  // à spécificité égale c'est l'ordre qui tranche, et placé avant, notre
  // verrou de page perdait contre le `body { overflow:hidden }` d'Expo.
  html = replaceOnce(html, '</head>', `${PLAY_DOC_CSS}\n${PLAY_DOC_HEAD_SCRIPT}\n  </head>`, 'fin du head');

  // Sans JavaScript, on propose ce qui existe VRAIMENT dans cette langue : les
  // guides pour le français et l'anglais, les pages de mode pour les autres —
  // envoyer un lecteur grec sur un guide français serait pire que rien.
  const fallbackLinks = generated
    ? ['mode-flags', 'mode-capitals', 'mode-globe', 'mode-daily']
        .map(
          (id) =>
            `          <li><a href="${href(id, locale)}">${attr(generated.modes[id].name)}</a></li>`,
        )
        .join('\n')
    : ['guide-countries-count', 'guide-flags', 'guide-capitals', 'guide-borders']
        .map((id) => {
          const page = loadPage(locale, id) || loadPage('fr', id);
          const target = href(id, locale);
          return `          <li><a href="${target}">${attr(page.meta.linkTitle || page.meta.title)}</a></li>`;
        })
        .join('\n');

  const noscript = `<noscript>
      <div style="max-width:640px;margin:60px auto;padding:0 24px;font-family:Georgia,serif;line-height:1.7;color:#2c1810;">
        <h1 style="font-size:32px;margin-bottom:16px;">${copy.h1}</h1>
        <p style="margin-bottom:16px;">${copy.intro}
          <a href="https://apps.apple.com/app/id6779650018">iPhone</a> ${locale === 'fr' ? 'et' : 'and'}
          <a href="https://play.google.com/store/apps/details?id=com.paulpousset.geog">Android</a>.</p>
        <p style="margin-bottom:16px;">${copy.pitch}</p>
        <p>${copy.lead}</p>
        <ul>
${fallbackLinks}
          <li>${generated ? '' : `<a href="${href('guides', locale)}">${copy.all}</a> · `}<a href="${href('about', locale)}">${strings(locale).about}</a> · <a href="${href('contact', locale)}">${strings(locale).contact}</a></li>
        </ul>
      </div>
    </noscript>`;

  html = replaceOnce(
    html,
    '<noscript>\n      You need to enable JavaScript to run this app.\n    </noscript>',
    noscript,
    'bloc noscript',
  );

  // Le contenu éditorial vient APRÈS `#root` : le jeu garde un écran plein et
  // le texte se lit en mode lecture (bascule par la barre). Voir
  // site/lib/playDoc.mjs pour le pourquoi.
  html = replaceOnce(
    html,
    '<div id="root"></div>',
    `${playBar(locale)}\n  <div id="root"></div>\n${playDoc(locale)}\n${PLAY_DOC_SCRIPT}`,
    'racine React',
  );
  return html;
}

/**
 * Un fichier de coquille par langue : `/es/play` doit servir un `<head>` en
 * espagnol, canonique de lui-même. Le bundle JavaScript, lui, est le même pour
 * tout le monde — c'est l'app qui choisit sa langue au démarrage.
 */
const SHELL_FILES = {
  fr: 'app.html',
  en: 'app-en.html',
  ...Object.fromEntries(LOCALES.filter((l) => l !== 'fr' && l !== 'en').map((l) => [l, `app-${l}.html`])),
};
const shells = {};
for (const locale of LOCALES) {
  shells[locale] = buildAppShell(locale);
  emit(SHELL_FILES[locale], shells[locale]);
}
if (!CHECK_ONLY && existsSync(shellPath)) rmSync(shellPath);

/**
 * Le pont web → app doit être dans CHAQUE coquille, textes traduits compris.
 * Une langue ajoutée sans ses trois phrases afficherait une barre « undefined »
 * aux joueurs qui arrivent par un lien de parrainage ou de ligue.
 */
for (const locale of LOCALES) {
  const s = strings(locale);
  for (const key of ['haveApp', 'openInApp', 'dismiss']) {
    if (!s[key]) fail(`${locale} : texte « ${key} » manquant (barre « ouvrir dans l'app »)`);
  }
  if (!shells[locale].includes('/open-in-app.js')) {
    fail(`${locale} : coquille sans le pont web → app (public/open-in-app.js)`);
  }
}

/**
 * La page d'invitation, une coquille par langue (`/invite-xx.html`) : les
 * aperçus de lien lisent les balises Open Graph sans exécuter de script, le
 * titre de la carte doit donc déjà être dans la langue du parrain. Servie sur
 * `/invite.html?lang=xx` par les réécritures de vercel.json (voir
 * checkVercelRoutes). Sans `?lang=`, la version française — les liens déjà
 * partagés avant cette page — qui renvoie côté client sur la bonne langue.
 */
for (const locale of LOCALES) {
  if (!INVITE_COPY[locale]) fail(`${locale} : page d'invitation sans texte (site/lib/invite.mjs)`);
  const html = renderInvite(locale);
  if (!html.includes('/open-in-app.js')) fail(`${locale} : page d'invitation sans le pont web → app`);
  emit(inviteFile(locale), html);
}

// ── 2. Les pages de contenu ───────────────────────────────────────────────────

const pages = [];
const missing = [];

for (const locale of LOCALES) {
  for (const r of routesIn(locale)) {
    if (r.kind === 'app') {
      // La coquille est déjà écrite ; on la référence pour le sitemap et les
      // contrôles de réciprocité, sans la re-rendre.
      pages.push({
        routeId: r.id,
        locale,
        path: r.paths[locale],
        title: `play:${locale}`,
        html: shells[locale],
        lastmod: todayFromRoutes(),
        changefreq: r.changefreq,
        priority: r.priority,
        indexable: true,
      });
      continue;
    }

    const page = loadPage(locale, r.id);
    if (!page) {
      // On collecte au lieu d'arrêter : quand plusieurs pages manquent, la liste
      // complète est plus utile que la première.
      missing.push(`site/content/${locale}/${r.id}.html`);
      continue;
    }
    if (!page.meta.modified) fail(`${page.file} : « modified » manquant (sert au sitemap et au JSON-LD)`);

    const { html: bodyRaw, lists } = interpolate(page.body, { locale, file: page.file, routeId: r.id });
    // L'accueil français et anglais est une landing sur mesure (son propre
    // `<style>`, sa propre mise en page). Les quatorze langues générées passent
    // par le gabarit commun : même barre de navigation, même pied de page, même
    // fil d'Ariane que leurs pages de mode — cohérent, et rien à maintenir en
    // double.
    const isLanding = r.kind === 'landing' && !localeData(locale);
    const [headExtra, body] = isLanding ? splitLanding(bodyRaw, page.file) : ['', bodyRaw];

    const url = `${ORIGIN}${r.paths[locale]}`;
    const faq = extractFaq(bodyRaw);
    const jsonLd = [...lists];
    if (faq) jsonLd.push(faqPage(faq));
    if (isLanding) jsonLd.push(videoGame({ description: page.meta.description }));
    if (r.kind === 'guide' || r.kind === 'atlas') {
      if (!page.meta.published) fail(`${page.file} : « published » manquant pour un article`);
      jsonLd.push(
        article({
          headline: page.meta.ogTitle || page.meta.title,
          description: page.meta.description,
          url,
          locale,
          published: page.meta.published,
          modified: page.meta.modified,
          image: page.meta.image,
        }),
      );
    }

    const html = isLanding
      ? renderLanding({ routeId: r.id, locale, meta: page.meta, headExtra, body, jsonLd })
      : renderPage({
          routeId: r.id,
          locale,
          title: page.meta.title,
          description: page.meta.description,
          ogTitle: page.meta.ogTitle,
          ogDescription: page.meta.ogDescription,
          ogType: r.kind === 'guide' || r.kind === 'atlas' ? 'article' : 'website',
          image: page.meta.image,
          breadcrumbLabel: page.meta.breadcrumb,
          jsonLd,
          body,
          ads: page.meta.ads !== 'false',
        });

    emit(fileFor(r.paths[locale]), html);
    pages.push({
      routeId: r.id,
      locale,
      path: r.paths[locale],
      title: page.meta.title,
      html,
      lastmod: page.meta.modified,
      changefreq: r.changefreq,
      priority: r.priority,
      indexable: page.meta.noindex !== 'true',
    });
  }
}

/** La coquille du jeu n'a pas d'entête de contenu : elle suit la home. */
function todayFromRoutes() {
  const home = loadPage('fr', 'home');
  return home?.meta.modified || '2026-08-23';
}

/**
 * La page d'accueil garde son gabarit sur mesure (canvas, animations, styles
 * propres) : le plan interdit tout changement de design. On lui injecte
 * seulement le `<head>` partagé. Le fragment sépare les deux par `<!--body-->`.
 */
function splitLanding(raw, file) {
  const idx = raw.indexOf('<!--body-->');
  if (idx === -1) fail(`${file} : marqueur <!--body--> absent`);
  return [raw.slice(0, idx), raw.slice(idx + '<!--body-->'.length)];
}

function renderLanding({ routeId, locale, meta, headExtra, body, jsonLd }) {
  const m = LOCALE_META[locale];
  const canonical = `${ORIGIN}${href(routeId, locale)}`;
  return `<!DOCTYPE html>
<html lang="${m.htmlLang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${attr(meta.title)}</title>
  <meta name="description" content="${attr(meta.description)}" />
  <link rel="canonical" href="${canonical}" />
${alternates(routeId)
  .map((a) => `  <link rel="alternate" hreflang="${a.hreflang}" href="${ORIGIN}${a.path}" />`)
  .join('\n')}
  <link rel="icon" href="/favicon.ico" />
  <meta name="theme-color" content="#f2e8d0" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="GeoG" />
  <meta property="og:title" content="${attr(meta.ogTitle || meta.title)}" />
  <meta property="og:description" content="${attr(meta.ogDescription || meta.description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${ORIGIN}/og-invite.png" />
  <meta property="og:locale" content="${m.ogLocale}" />
${LOCALES.filter((l) => l !== locale)
  .map((l) => `  <meta property="og:locale:alternate" content="${LOCALE_META[l].ogLocale}" />`)
  .join('\n')}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${attr(meta.ogTitle || meta.title)}" />
  <meta name="twitter:description" content="${attr(meta.ogDescription || meta.description)}" />
  <meta name="twitter:image" content="${ORIGIN}/og-invite.png" />
  <link rel="preload" href="/fonts/playfair-display-700-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="/fonts/space-mono-400-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="/fonts/fonts.css" />
${renderJsonLd(jsonLd)}
  <script defer src="/site-analytics.js"></script>
${ADSENSE_HEAD}
${headExtra.trimEnd()}
</head>
${body}
</html>
`;
}

// ── 3. Sitemap, robots, contrôles ─────────────────────────────────────────────

// En rédaction, `SITE_ALLOW_MISSING=1` laisse prévisualiser le site partiel ;
// en production, un fragment manquant arrête le déploiement.
if (missing.length) {
  const list = `${missing.length} fragment(s) de contenu manquant(s) :\n  - ${missing.join('\n  - ')}`;
  if (process.env.SITE_ALLOW_MISSING === '1') console.warn(`[site] ${list}\n`);
  else fail(list);
}

const report = validate(pages, { lenient: process.env.SITE_ALLOW_MISSING === '1' });

emit('/sitemap.xml', buildSitemap(pages));

emit(
  '/robots.txt',
  `User-agent: *
Allow: /

# Coquilles brutes de l'application (servies via /play, /en/play, /es/play…) :
# sans intérêt pour l'indexation, et c'est le genre de page vide qui fait
# échouer une revue AdSense si elle est explorée directement.
Disallow: /app.html
# Liens de bio traçables (public/go.js) : une redirection, pas une page.
Disallow: /tiktok/
Disallow: /instagram/
Disallow: /youtube/
${LOCALES.filter((l) => l !== DEFAULT_LOCALE)
  .map((l) => `Disallow: /app-${l}.html`)
  .join('\n')}

Sitemap: ${ORIGIN}/sitemap.xml
`,
);

/**
 * Le contrôle des redirections Vercel.
 *
 * Chaque langue a besoin de deux choses côté hébergeur, que le build ne peut
 * pas produire lui-même : la redirection `/xx` → `/xx/` et la réécriture de
 * `/xx/play` vers sa coquille d'application. Ajouter une langue sans les
 * ajouter donne un 404 sur le bouton « Jouer » — le seul lien qui compte. On
 * relit donc `vercel.json` et on refuse de construire s'il manque une entrée.
 */
function checkVercelRoutes() {
  const file = join(ROOT, 'vercel.json');
  const conf = JSON.parse(readFileSync(file, 'utf8'));
  const redirects = new Set((conf.redirects || []).map((r) => r.source));
  const rewrites = new Map((conf.rewrites || []).map((r) => [r.source, r.destination]));
  const holes = [];
  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    if (!redirects.has(`/${locale}`)) holes.push(`redirects: /${locale} → /${locale}/`);
    for (const source of [`/${locale}/play`, `/${locale}/play/`]) {
      if (rewrites.get(source) !== `/app-${locale}.html`) {
        holes.push(`rewrites: ${source} → /app-${locale}.html`);
      }
    }
  }
  // La page d'invitation : `/invite.html?lang=xx` → `/invite-xx.html`, puis le
  // repli sans langue vers le français. Vercel prend la première règle qui
  // correspond, les règles à condition doivent donc précéder le repli.
  const invites = (conf.rewrites || []).filter((r) => r.source === '/invite.html');
  for (const locale of LOCALES) {
    const hit = invites.find(
      (r) =>
        r.destination === inviteFile(locale) &&
        (r.has || []).some((h) => h.type === 'query' && h.key === 'lang' && h.value === locale),
    );
    if (!hit) holes.push(`rewrites: /invite.html?lang=${locale} → ${inviteFile(locale)}`);
  }
  const fallback = invites.findIndex((r) => !r.has);
  if (fallback === -1 || invites[fallback].destination !== inviteFile(DEFAULT_LOCALE)) {
    holes.push(`rewrites: /invite.html (sans lang) → ${inviteFile(DEFAULT_LOCALE)}`);
  } else if (fallback !== invites.length - 1) {
    holes.push('rewrites: le repli /invite.html sans lang doit venir APRÈS les règles à lang');
  }
  if (holes.length) fail(`vercel.json, entrées manquantes :\n  - ${holes.join('\n  - ')}`);
}

checkVercelRoutes();

// La landing n'existe plus comme fichier autonome : son ancienne URL
// /landing.html dupliquait la page d'accueil. Une redirection la remplace
// (voir vercel.json).
if (!CHECK_ONLY) {
  const strayLanding = join(DIST, 'landing.html');
  if (existsSync(strayLanding)) rmSync(strayLanding);
}

const byLocale = LOCALES.map((l) => `${l}: ${pages.filter((p) => p.locale === l).length}`).join(', ');
console.log(
  CHECK_ONLY
    ? `[site] ${report.pages} pages vérifiées (${byLocale}) sur ${ROUTES.length} routes · hreflang, canonicals, titres et liens internes OK`
    : `[site] ${report.pages} pages générées (${byLocale}) sur ${ROUTES.length} routes · sitemap ${pages.filter((p) => p.indexable).length} URL · hreflang, canonicals et liens internes vérifiés`,
);

void copyFileSync;
