/**
 * Les pages des quatorze langues générées : accueil, modes, à-propos, contact,
 * confidentialité.
 *
 * Elles sortent d'ici sous exactement la même forme qu'un fragment écrit à la
 * main — `{ meta, body }` avec des directives `{{…}}` — et repartent ensuite
 * dans la chaîne normale : interpolation, gabarit, hreflang, sitemap, contrôles.
 * Le générateur ne court-circuite rien.
 *
 * Ce que chaque page raconte vient de deux endroits :
 *   - `site/content/i18n/<langue>.json` pour ce qui est propre au site (titres,
 *     accroches, FAQ, mentions légales) ;
 *   - les catalogues de l'app pour la description et les conseils de chaque
 *     mode — les mêmes phrases que la pop-up « comment jouer ».
 *
 * Un fichier déposé dans `site/content/<langue>/<id>.html` reprend toujours la
 * main sur la page générée : traduire une page à la main reste possible sans
 * rien débrancher.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE } from './paths.mjs';
import { MODES } from './modes.mjs';
import { localeData } from './siteLocales.mjs';
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

/** La liste des autres modes, en liens internes. */
function modeLinks(locale, exceptId) {
  const data = localeData(locale);
  return MODES.filter((mode) => mode.id !== exceptId)
    .map(
      (mode) =>
        `          <li><a href="{{link:${mode.id}}}">${esc(data.modes[mode.id].name)}</a></li>`,
    )
    .join('\n');
}

/** La page d'accueil d'une langue générée. */
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
    `          <li><a href="{{link:${mode.id}}}"><b>${esc(data.modes[mode.id].name)}</b></a> — ${esc(
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

/** Une page de mode de jeu. */
function modePage(locale, routeId) {
  const data = localeData(locale);
  const mode = data.modes[routeId];
  const copy = MODE_COPY[APP_MODE[routeId]];
  const rules = t(locale, copy.body);
  const tips = copy.tips.map((tip) => t(locale, tip));

  const body = `    <article>
      <header>
        <h1>${esc(mode.name)} — ${esc(data.mode.titleSuffix)}</h1>
        <p class="standfirst">${esc(rules)}</p>
      </header>

      <div class="play-cta">
        <h3>${esc(data.mode.ctaTitle)}</h3>
        <p>${esc(data.mode.descriptionTail)}</p>
        <a class="btn" href="{{play:${routeId}}}">{{t:playNow}}</a>
      </div>

      <section>
        <h2>${esc(data.mode.howHeading)}</h2>
        <p>${esc(rules)}</p>
      </section>

      <section>
        <h2>${esc(data.mode.tipsHeading)}</h2>
        <ul>
${tips.map((tip) => `          <li>${esc(tip)}</li>`).join('\n')}
        </ul>
      </section>

      <section>
        <h2>${esc(data.mode.otherModes)}</h2>
        <ul class="mode-list">
${modeLinks(locale, routeId)}
        </ul>
      </section>
    </article>`;

  return {
    meta: {
      title: `${mode.name} — ${data.mode.titleSuffix} | GeoG`,
      description: `${rules} ${data.mode.descriptionTail}`,
      ogTitle: `${mode.name} — GeoG`,
      breadcrumb: mode.name,
      modified: today(),
    },
    body,
  };
}

/** Une page institutionnelle (à-propos, contact, confidentialité). */
function textPage(locale, routeId) {
  const data = localeData(locale);
  const copy = data[routeId];
  const paragraphs = ['p1', 'p2', 'p3']
    .map((key) => copy[key])
    .filter(Boolean)
    .map((text) => `      <p>${esc(text)}</p>`)
    .join('\n');

  return {
    meta: {
      title: copy.title,
      description: copy.description,
      breadcrumb: copy.h1,
      modified: today(),
    },
    body: `    <article>
      <header>
        <h1>${esc(copy.h1)}</h1>
      </header>
${paragraphs}
    </article>`,
  };
}

/**
 * La page générée d'une route, ou `null` si cette route ne se génère pas
 * (les guides et l'atlas restent du français et de l'anglais écrits à la main).
 */
export function generatedPage(locale, routeId) {
  if (!localeData(locale)) return null;
  if (routeId === 'home') return withFile(locale, routeId, home(locale));
  if (routeId in APP_MODE) return withFile(locale, routeId, modePage(locale, routeId));
  if (routeId === 'about' || routeId === 'contact' || routeId === 'privacy') {
    return withFile(locale, routeId, textPage(locale, routeId));
  }
  return null;
}

/** Ajoute le `file` attendu par le reste du build (messages d'erreur, JSON-LD). */
function withFile(locale, routeId, page) {
  return { ...page, file: `généré: ${locale}/${routeId}`, raw: frontMatter(page.meta) };
}
