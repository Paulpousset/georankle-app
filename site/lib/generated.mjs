/**
 * Les pages des quatorze langues générées : l'accueil et la politique de
 * confidentialité. Rien d'autre.
 *
 * Elles sortent d'ici sous exactement la même forme qu'un fragment écrit à la
 * main — `{ meta, body }` avec des directives `{{…}}` — et repartent ensuite
 * dans la chaîne normale : interpolation, gabarit, hreflang, sitemap, contrôles.
 * Le générateur ne court-circuite rien.
 *
 * Ce que chaque page raconte vient de deux endroits :
 *   - `site/content/i18n/<langue>.json` pour ce qui est propre au site (titres,
 *     accroches, FAQ, mentions légales) ;
 *   - les catalogues de l'app pour la description de chaque mode — les mêmes
 *     phrases que la pop-up « comment jouer ».
 *
 * Jusqu'au 20/09/2026 ce module générait aussi douze pages de mode, une page
 * à-propos et une page contact par langue : 196 pages de 50 à 110 mots, toutes
 * avec le script AdSense — le motif « contenu à faible valeur informative » du
 * cinquième refus. Elles n'existent plus : les modes de l'accueil mènent droit
 * au jeu (`/xx/play?mode=…`), à-propos et contact sont des sections de
 * l'accueil, et les anciennes URL redirigent (`retiredRedirects`, recopié dans
 * vercel.json et vérifié au build). Pour rouvrir une page par langue, il faut
 * un vrai contenu écrit dans cette langue, déposé dans
 * `site/content/<langue>/<id>.html` — un fichier gagne toujours sur le
 * générateur.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE } from './paths.mjs';
import { MODES } from './modes.mjs';
import { SITE_LOCALES, localeData } from './siteLocales.mjs';
import { t } from './i18n.mjs';

export const MODE_COPY = JSON.parse(readFileSync(join(SITE, 'lib', 'modeCopy.gen.json'), 'utf8'));

/**
 * Le mode de l'app derrière chaque page du site.
 *
 * Trois pages n'ont pas d'équivalent direct : le défi du jour, les duels et le
 * mode classé sont des enveloppes autour de plusieurs modes. Elles empruntent
 * la copie du mode qui les représente le mieux.
 */
export const APP_MODE = {
  'mode-flags': 'quiz-flag',
  'mode-capitals': 'quiz-capital',
  'mode-globe': 'globe',
  'mode-silhouettes': 'silhouette',
  'mode-borders': 'borders',
  'mode-guess': 'guess',
  'mode-rankle': 'classic',
  'mode-higherlower': 'higherlower',
  'mode-daily': 'challenge',
  'mode-online': 'versus',
  'mode-ranked': 'versus',
  'mode-story': 'classic',
};

/** Échappe le texte destiné au HTML. */
function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** L'entête `clé: valeur` d'un fragment. Les valeurs sont sur une seule ligne. */
function frontMatter(meta) {
  return Object.entries(meta)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${String(value).replace(/\s+/g, ' ').trim()}`)
    .join('\n');
}

/** La date du jour, pour `modified` — le contenu suit les catalogues. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Le bloc FAQ, dans le format que `extractFaq` sait relire. */
function faqBlock(items, heading) {
  if (!items?.length) return '';
  return `      <section class="faq">
        <h2>${esc(heading)}</h2>
${items
  .map(
    (item) => `        <details>
          <summary>${esc(item.q)}</summary>
          <p>${esc(item.a)}</p>
        </details>`,
  )
  .join('\n')}
      </section>`;
}

/** Les paragraphes `p1`, `p2`, `p3`… d'un bloc de texte du JSON. */
function paragraphs(copy) {
  return ['p1', 'p2', 'p3', 'p4']
    .map((key) => copy[key])
    .filter(Boolean)
    .map((text) => `        <p>${esc(text)}</p>`)
    .join('\n');
}

/**
 * La page d'accueil d'une langue générée.
 *
 * Chaque mode mène directement au jeu, mode présélectionné ; à-propos et
 * contact sont des sections de cette page (ids `#about` et `#contact`, cibles
 * des redirections des anciennes URL).
 */
function home(locale) {
  const data = localeData(locale);
  const copy = data.home;
  const body = `    <article>
      <header>
        <h1>${esc(copy.h1)}</h1>
        <p class="standfirst">${esc(copy.standfirst)}</p>
      </header>

      <div class="play-cta">
        <h3>${esc(copy.ctaTitle)}</h3>
        <p>${esc(copy.ctaText)}</p>
        <a class="btn" href="{{play}}">{{t:playNow}}</a>
      </div>

      <section>
        <h2>${esc(copy.modesHeading)}</h2>
        <p>${esc(copy.modesIntro)}</p>
        <ul class="mode-list">
${MODES.map(
  (mode) =>
    `          <li><a href="{{play:${mode.id}}}"><b>${esc(data.modes[mode.id].name)}</b></a> — ${esc(
      t(locale, MODE_COPY[APP_MODE[mode.id]].body),
    )}</li>`,
).join('\n')}
        </ul>
      </section>

      <section>
        <h2>${esc(copy.howHeading)}</h2>
        <p>${esc(copy.howBody)}</p>
      </section>

${faqBlock(copy.faq, data.chrome.faq)}

      <section id="about">
        <h2>${esc(data.about.h1)}</h2>
${paragraphs(data.about)}
      </section>

      <section id="contact">
        <h2>${esc(data.contact.h1)}</h2>
${paragraphs(data.contact)}
      </section>
    </article>`;

  return {
    meta: {
      title: copy.title,
      description: copy.description,
      ogTitle: copy.ogTitle,
      breadcrumb: data.chrome.home,
      modified: today(),
    },
    body,
  };
}

/** La politique de confidentialité — page légale, sans script publicitaire. */
function privacy(locale) {
  const data = localeData(locale);
  const copy = data.privacy;
  return {
    meta: {
      title: copy.title,
      description: copy.description,
      breadcrumb: copy.h1,
      modified: today(),
      ads: 'false',
    },
    body: `    <article>
      <header>
        <h1>${esc(copy.h1)}</h1>
      </header>
${paragraphs(copy)}
    </article>`,
  };
}

/**
 * La page générée d'une route, ou `null` si cette route ne se génère pas
 * (guides, atlas, modes, à-propos et contact restent du français et de
 * l'anglais écrits à la main).
 */
export function generatedPage(locale, routeId) {
  if (!localeData(locale)) return null;
  if (routeId === 'home') return withFile(locale, routeId, home(locale));
  if (routeId === 'privacy') return withFile(locale, routeId, privacy(locale));
  return null;
}

/** Ajoute le `file` attendu par le reste du build (messages d'erreur, JSON-LD). */
function withFile(locale, routeId, page) {
  return { ...page, file: `généré: ${locale}/${routeId}`, raw: frontMatter(page.meta) };
}

/**
 * Les redirections des pages retirées le 20/09/2026, à recopier telles quelles
 * dans `vercel.json` (`checkVercelRoutes` refuse le build si elles n'y sont
 * pas). Une règle par mode, toutes langues regroupées : `/es/juego-de-banderas/`,
 * `/de/flaggen-quiz/`… → `/:locale/play?mode=quiz-flag`. Les enveloppes sans
 * mode démarrable (défi du jour, duels, classé, histoire) mènent au jeu tel
 * quel ; à-propos et contact mènent à la section de l'accueil.
 *
 * Deux règles par cible, avec et sans barre finale : Vercel ne normalise pas
 * la barre, et les deux formes ont pu être partagées.
 */
export function retiredRedirects() {
  const locales = SITE_LOCALES.join('|');
  const rules = [];
  const push = (slugs, destination) => {
    const uniq = [...new Set(slugs)].sort();
    for (const tail of ['/', '']) {
      rules.push({
        source: `/:locale(${locales})/:slug(${uniq.join('|')})${tail}`,
        destination,
        permanent: true,
      });
    }
  };
  for (const mode of MODES) {
    const slugs = SITE_LOCALES.map((l) => localeData(l).modes[mode.id].slug);
    push(slugs, mode.appMode ? `/:locale/play?mode=${mode.appMode}` : '/:locale/play');
  }
  for (const section of ['about', 'contact']) {
    push(
      SITE_LOCALES.map((l) => localeData(l).slugs[section]),
      `/:locale/#${section}`,
    );
  }
  return rules;
}
