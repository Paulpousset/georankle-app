/**
 * Le gabarit unique des pages de contenu.
 *
 * Avant ce fichier, le `<head>`, la barre de navigation, le fil d'Ariane et le
 * pied de page étaient recopiés à la main dans quinze fichiers HTML. Le site en
 * compte maintenant une soixantaine, dans deux langues, avec des `hreflang`
 * réciproques : le copier-coller n'était plus tenable, et une erreur de
 * réciprocité est silencieuse — elle annule le bénéfice du bloc entier sans
 * jamais rien casser visiblement.
 *
 * Le rendu est volontairement du HTML identique à celui écrit à la main
 * jusqu'ici : aucun changement de design n'est demandé par le plan, et
 * `guides.css` n'a pas bougé.
 */
import { ORIGIN } from './paths.mjs';
import {
  LOCALES,
  LOCALE_META,
  DEFAULT_LOCALE,
  alternates,
  href,
  route,
  exists,
} from './routes.mjs';
import { strings } from './strings.mjs';
import { render as renderJsonLd, breadcrumbList } from './jsonld.mjs';

/** Échappe le texte destiné à un attribut HTML. */
export function attr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Les polices, auto-hébergées.
 *
 * La feuille `fonts.googleapis.com` bloquait le rendu ~780 ms sur chaque page,
 * et l'élément LCP de l'accueil est le `<h1>` : ce tiers en chemin critique
 * *était* le LCP à 6 s. En local, un seul `preload` sur la police du titre et
 * une feuille same-origin de 4 Ko suffisent. `preload` uniquement sur les deux
 * fichiers réellement utilisés au-dessus de la ligne de flottaison — précharger
 * les huit annulerait le gain.
 */
const FONTS = `  <link rel="preload" href="/fonts/playfair-display-700-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="/fonts/space-mono-400-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="/fonts/fonts.css" />`;

/**
 * Le code AdSense, dans le `<head>` de toutes les pages qui ont le droit
 * d'afficher des annonces.
 *
 * ⚠️ Il DOIT être ici, et pas seulement dans `ads-content.js`.
 * Jusqu'au 05/09/2026 la bibliothèque n'était chargée qu'au-dessus de 1120 px
 * de large. Or Googlebot rend les pages en ~412 px (mobile) et ~1024 px
 * (ordinateur) : les deux passent sous le seuil. Autrement dit, aucun robot de
 * Google n'a jamais vu une seule ligne de code AdSense sur playgeog.com — ce
 * qui rendait chaque demande d'examen invérifiable. Le site a été refusé
 * quatre fois.
 *
 * Charger la bibliothèque ne crée AUCUNE annonce par elle-même : les
 * emplacements restent décidés par `public/ads-content.js`, qui continue de
 * n'injecter aucune unité en dessous de 1120 px. La règle produit « jamais de
 * bandeau sur mobile » tient donc toujours — mais elle repose désormais sur UN
 * SEUL garde-fou de plus : les **Auto ads doivent rester désactivées** dans la
 * console AdSense, sinon Google placera de lui-même des ancres en bas des
 * écrans mobiles. Voir guide-pubs-web.md.
 */
export const AD_CLIENT = 'ca-pub-2429865520138981';

export const ADSENSE_HEAD = `  <meta name="google-adsense-account" content="${AD_CLIENT}" />
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}" crossorigin="anonymous"></script>`;

/**
 * Le bloc `<link rel="alternate">` d'une page.
 *
 * Trois règles, toutes vérifiées par `site/lib/validate.mjs` après génération :
 * auto-référence présente, réciprocité totale, et jamais de lien vers une page
 * qui n'existe pas dans cette langue.
 */
function hreflangBlock(routeId) {
  return alternates(routeId)
    .map((a) => `  <link rel="alternate" hreflang="${a.hreflang}" href="${ORIGIN}${a.path}" />`)
    .join('\n');
}

/** Les `og:locale` : celle de la page, puis les autres langues publiées. */
function ogLocales(routeId, locale) {
  const others = LOCALES.filter((l) => l !== locale && exists(routeId, l));
  return [
    `  <meta property="og:locale" content="${LOCALE_META[locale].ogLocale}" />`,
    ...others.map(
      (l) => `  <meta property="og:locale:alternate" content="${LOCALE_META[l].ogLocale}" />`,
    ),
  ].join('\n');
}

/**
 * Le sélecteur de langue.
 *
 * Jamais de redirection automatique sur `Accept-Language` ou sur l'IP : Googlebot
 * explore depuis les États-Unis, une redirection l'enfermerait dans la version
 * anglaise et les autres ne seraient jamais indexées. Ce sont donc de vrais
 * `<a href>`, explorables, et le visiteur choisit.
 *
 * Rendu vide quand la page n'existe pas dans une autre langue — proposer un
 * drapeau qui mène à une 404 est pire que ne rien proposer.
 */
export function languageSwitch(routeId, locale, className) {
  const others = LOCALES.filter((l) => l !== locale && exists(routeId, l));
  if (!others.length) return '';
  const linkOf = (l) =>
    `<a class="lang-link" href="${href(routeId, l)}" hreflang="${LOCALE_META[l].hreflang}" lang="${LOCALE_META[l].htmlLang}" rel="alternate">${LOCALE_META[l].label}</a>`;
  const label = attr(strings(locale).languageLabel);

  // Pied de page : la liste à plat, qui passe à la ligne.
  if (className.includes('lang-switch-foot')) {
    return `<span class="${className}" role="group" aria-label="${label}">${others.map(linkOf).join('')}</span>`;
  }

  // Barre de navigation : un menu déroulant. Seize langues à plat ne tiennent
  // dans aucune barre — le 10/09/2026 elles poussaient le bouton « Jouer »
  // hors de l'écran et le sélecteur était inutilisable. `<details>` s'ouvre
  // sans JavaScript, les liens restent de vrais `<a>` explorables, et la
  // langue courante figure dans la liste (marquée) pour se repérer.
  const items = LOCALES.filter((l) => l === locale || exists(routeId, l))
    .map((l) =>
      l === locale
        ? `<span class="lang-link lang-current" aria-current="true" lang="${LOCALE_META[l].htmlLang}">${LOCALE_META[l].label}</span>`
        : linkOf(l),
    )
    .join('');
  return `<details class="lang-menu">
          <summary aria-label="${label}"><span>${LOCALE_META[locale].label}</span></summary>
          <div class="lang-menu-list" role="group" aria-label="${label}">${items}</div>
        </details>`;
}

/**
 * Un lien de navigation — vide si la route n'existe pas dans cette langue.
 *
 * Les dix-huit guides et l'atlas ne sont écrits qu'en français et en anglais :
 * sans ce garde-fou, la barre de navigation espagnole enverrait vers l'article
 * français, ce qui est un lien mort pour le lecteur comme pour le moteur.
 */
function link(id, locale, label) {
  return exists(id, locale) ? `<a href="${href(id, locale)}">${label}</a>` : '';
}

/** Referme le menu des langues quand on clique ailleurs (confort ; le menu marche sans). */
export const LANG_MENU_SCRIPT =
  'document.addEventListener("click",function(e){document.querySelectorAll("details.lang-menu[open]").forEach(function(d){if(!d.contains(e.target))d.removeAttribute("open")})});';

/** La barre de navigation commune aux pages de contenu. */
function nav(routeId, locale) {
  const s = strings(locale);
  return `  <nav>
    <div class="nav-in">
      <a class="nav-logo" href="${href('home', locale)}">
        <img src="/logo-mark.png" alt="" width="30" height="30" />
        <b>GeoG</b>
      </a>
      <div class="nav-links">
        ${link('guides', locale, s.guides)}
        ${link('about', locale, s.about)}
        ${languageSwitch(routeId, locale, 'lang-switch')}
        <a class="nav-cta" href="${href('play', locale)}">${s.play}</a>
      </div>
    </div>
  </nav>
  <script>${LANG_MENU_SCRIPT}</script>`;
}

/** Le pied de page commun. */
function footer(routeId, locale) {
  const s = strings(locale);
  const switcher = languageSwitch(routeId, locale, 'lang-switch lang-switch-foot');
  return `  <footer>
    <div class="f-links">
      ${link('home', locale, s.home)}
      ${link('guides', locale, s.guides)}
      ${link('play', locale, s.play)}
      ${link('about', locale, s.about)}
      ${link('contact', locale, s.contact)}
      ${link('privacy', locale, s.privacy)}
    </div>
    ${switcher ? `<p class="f-lang">${switcher}</p>` : ''}
    <p>${s.footerTagline}</p>
    <p style="opacity:.7;">${s.footerCoords}</p>
  </footer>`;
}

/**
 * Le fil d'Ariane HTML, et son équivalent JSON-LD.
 *
 * Le fil existait déjà en HTML sur les pages de guides mais n'était reflété
 * nulle part en données structurées — c'est le gain le plus gratuit de la
 * phase 4 : la donnée est là, il suffisait de la déclarer.
 */
function breadcrumb(trail) {
  if (!trail || trail.length < 2) return { html: '', jsonLd: null };
  const html =
    '    <p class="breadcrumb">' +
    trail
      .map((step, i) =>
        i === trail.length - 1 ? step.name : `<a href="${step.path}">${step.name}</a>`,
      )
      .join(' › ') +
    '</p>';
  return { html, jsonLd: breadcrumbList(trail) };
}

/**
 * Construit le fil d'Ariane d'une route à partir de sa place dans la
 * hiérarchie : accueil › (guides) › page. Rien n'est saisi page par page.
 */
export function trailFor(routeId, locale, label) {
  const s = strings(locale);
  const r = route(routeId);
  const trail = [{ name: s.home, path: href('home', locale) }];
  const underGuides = href(routeId, locale).includes('/guides/') && routeId !== 'guides';
  if (underGuides) trail.push({ name: s.guides, path: href('guides', locale) });
  if (routeId !== 'home') trail.push({ name: label || r.id, path: null });
  return trail;
}

/**
 * Rend une page complète.
 *
 * `body` est le fragment de contenu (l'intérieur de `.wrap`), déjà interpolé.
 */
export function renderPage({
  routeId,
  locale,
  title,
  description,
  ogTitle,
  ogDescription,
  ogType = 'website',
  image = '/og-invite.png',
  bodyClass = '',
  breadcrumbLabel,
  jsonLd = [],
  body,
  ads = true,
}) {
  const s = strings(locale);
  const meta = LOCALE_META[locale];
  const canonical = `${ORIGIN}${href(routeId, locale)}`;
  const crumb = breadcrumb(breadcrumbLabel ? trailFor(routeId, locale, breadcrumbLabel) : null);
  const blocks = renderJsonLd([...jsonLd, crumb.jsonLd]);

  return `<!DOCTYPE html>
<html lang="${meta.htmlLang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${attr(title)}</title>
  <meta name="description" content="${attr(description)}" />
  <link rel="canonical" href="${canonical}" />
${hreflangBlock(routeId)}
  <link rel="icon" href="/favicon.ico" />
  <meta name="theme-color" content="#f2e8d0" />
  <meta property="og:type" content="${ogType}" />
  <meta property="og:site_name" content="GeoG" />
  <meta property="og:title" content="${attr(ogTitle || title)}" />
  <meta property="og:description" content="${attr(ogDescription || description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${ORIGIN}${image}" />
${ogLocales(routeId, locale)}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${attr(ogTitle || title)}" />
  <meta name="twitter:description" content="${attr(ogDescription || description)}" />
  <meta name="twitter:image" content="${ORIGIN}${image}" />
${FONTS}
  <link rel="stylesheet" href="/guides.css" />
${blocks}
  <script defer src="/site-analytics.js"></script>${
    ads
      ? `
${ADSENSE_HEAD}
  <!-- Emplacements injectés par ads-content.js, uniquement au-dessus de 1120px.
       Aucune annonce sur mobile : la bibliothèque ci-dessus est chargée partout
       (pour que Googlebot la voie), mais aucune unité n'est créée en dessous du
       seuil. Les Auto ads doivent rester DÉSACTIVÉES dans la console. -->
  <script defer src="/ads-content.js"></script>`
      : ''
  }
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>

  <a class="skip-link" href="#contenu">${s.skipToContent}</a>

${nav(routeId, locale)}

  <div class="wrap" id="contenu">
${crumb.html}

${body}
  </div>

${footer(routeId, locale)}

</body>
</html>
`;
}

export { DEFAULT_LOCALE, LOCALES };
