/**
 * Le chargement des fragments de contenu et l'interpolation de leurs directives.
 *
 * Un fragment est du HTML lisible et modifiable à la main — c'est ce qui compte
 * pour de l'éditorial — précédé d'un petit entête de métadonnées. Tout ce qui ne
 * doit PAS être écrit à la main y passe par une directive :
 *
 *   {{countries}}              → 195, lu dans les données du jeu
 *   {{link:guide-flags}}       → l'URL du guide dans la langue de la page
 *   {{play}} / {{play:globe}}  → le lien de jeu, avec le mode présélectionné
 *   {{playmode:streak}}        → le lien de jeu vers un mode de l'app qui n'a
 *                                pas de page de mode (liste blanche de webEntry)
 *   {{ranklenav}}              → le bloc « Tout sur Rankle » (la grappe, sauf
 *                                la page courante), titres lus dans les entêtes
 *   {{rankle:greedy}}          → un chiffre de la grille d'exemple (voir tables)
 *   {{table:capitals:europe}}  → un tableau de référence généré
 *   {{count:europe}}           → le nombre de pays d'un continent
 *   {{t:readNext}}             → un texte d'habillage traduit
 *   {{langswitch}}             → le sélecteur de langue, vide s'il n'y a pas
 *                                de traduction de CETTE page
 *
 * Une directive inconnue arrête le build : mieux vaut un déploiement raté qu'une
 * page publiée avec « {{countries}} » en toutes lettres.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT } from './paths.mjs';
import { PLACEHOLDERS } from './constants.mjs';
import { href, RANKLE_IDS } from './routes.mjs';
import { strings } from './strings.mjs';
import { TABLES, rankleExample } from './tables.mjs';
import { countriesOf } from './continents.mjs';
import { countryName } from './data.mjs';
import { modeById } from './modes.mjs';
import { itemList } from './jsonld.mjs';
import { languageSwitch } from './layout.mjs';
import { generatedPage } from './generated.mjs';
import { BOOTABLE_MODES } from './data.mjs';

/** Sépare l'entête `clé: valeur` du corps HTML. */
function splitFrontMatter(raw, file) {
  const parts = raw.split(/^---\s*$/m);
  if (parts.length < 2) throw new Error(`${file} : entête manquant (séparateur « --- » absent)`);
  const meta = {};
  for (const line of parts[0].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) throw new Error(`${file} : ligne d'entête invalide « ${trimmed} »`);
    meta[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return { meta, body: parts.slice(1).join('---').replace(/^\n/, '') };
}

/**
 * Remplace les directives d'un fragment.
 *
 * Renvoie aussi les `ItemList` collectées : une page qui expose un tableau de
 * référence le déclare en données structurées, comme demandé par le plan §4.
 */
export function interpolate(body, { locale, file, routeId }) {
  const lists = [];
  const s = strings(locale);

  const out = body.replace(/\{\{([a-zA-Z0-9_:-]+)\}\}/g, (match, directive) => {
    const [verb, ...args] = directive.split(':');

    if (!args.length && verb in PLACEHOLDERS) return PLACEHOLDERS[verb];

    switch (verb) {
      case 'link': {
        return href(args[0], locale);
      }
      case 'play': {
        const base = href('play', locale);
        if (!args.length) return base;
        const mode = modeById(args[0]);
        if (!mode) throw new Error(`${file} : mode inconnu dans ${match}`);
        return mode.appMode ? `${base}?mode=${mode.appMode}` : base;
      }
      case 'playmode': {
        // L'identifiant technique de l'app (`streak`, `classic`…), pas l'id de
        // page. Vérifié contre la liste blanche de src/lib/webEntry.ts : hors
        // liste, l'app ignorerait le paramètre et ouvrirait le défi du jour.
        if (!BOOTABLE_MODES.has(args[0])) throw new Error(`${file} : mode non démarrable dans ${match}`);
        return `${href('play', locale)}?mode=${args[0]}`;
      }
      case 't': {
        if (!(args[0] in s)) throw new Error(`${file} : texte d'habillage inconnu dans ${match}`);
        return s[args[0]];
      }
      case 'langswitch': {
        // `{{langswitch:foot}}` = la variante discrète du pied de page.
        const cls = args[0] === 'foot' ? 'lang-switch lang-switch-foot' : 'lang-switch';
        return languageSwitch(routeId, locale, cls);
      }
      case 'count': {
        return String(countriesOf(args[0]).length);
      }
      case 'ranklenav': {
        return rankleNav(routeId, locale);
      }
      case 'rankle': {
        // Les chiffres de la grille d'exemple, pour que le commentaire de la
        // page d'astuces reste vrai si les données du jeu changent.
        const ex = rankleExample(locale);
        const names = (assignment) =>
          ex.countries
            .map((c, i) => (assignment[i] === ex.optimal.assignment[i] ? null : countryName(c, locale)))
            .filter(Boolean);
        switch (args[0]) {
          case 'optimal':
            return String(ex.optimal.total);
          case 'greedy':
            return String(ex.greedy.total);
          case 'greedy-efficiency':
            return String(ex.greedyEfficiency);
          case 'greedy-misplaced':
            return String(names(ex.greedy.assignment).length);
          case 'theme-of': {
            // {{rankle:theme-of:RUS}} → le critère que l'optimum donne à ce pays.
            const i = ex.countries.findIndex((c) => c.cca3 === args[1]);
            if (i === -1) throw new Error(`${file} : pays hors grille dans ${match}`);
            return ex.themes[ex.optimal.assignment[i]].label;
          }
          case 'rank': {
            // {{rankle:rank:RUS:area}} → le rang mondial de ce pays sur ce critère.
            const i = ex.countries.findIndex((c) => c.cca3 === args[1]);
            const j = ex.themes.findIndex((t) => t.id === args[2]);
            if (i === -1 || j === -1) throw new Error(`${file} : pays ou critère hors grille dans ${match}`);
            return String(ex.matrix[i][j]);
          }
          case 'name': {
            // {{rankle:name:RUS}} → le nom du pays dans la langue de la page.
            const c = ex.countries.find((x) => x.cca3 === args[1]);
            if (!c) throw new Error(`${file} : pays hors grille dans ${match}`);
            return countryName(c, locale);
          }
          default:
            throw new Error(`${file} : chiffre inconnu dans ${match}`);
        }
      }
      case 'table': {
        const [family, scope = 'all'] = args;
        const build = TABLES[family];
        if (!build) throw new Error(`${file} : famille de tableau inconnue dans ${match}`);
        const result = build(scope, locale);
        lists.push(itemList({ name: result.name, items: result.items }));
        return result.html;
      }
      default:
        throw new Error(`${file} : directive inconnue ${match}`);
    }
  });

  if (/\{\{|\}\}/.test(out)) {
    throw new Error(`${file} : accolades résiduelles — directive mal formée ?`);
  }
  return { html: out, lists };
}

/**
 * Le bloc « Tout sur Rankle » : la page de mode puis la grappe, sans la page
 * courante. Les libellés viennent de l'entête `linkTitle` (sinon `breadcrumb`)
 * de chaque fragment, dans la langue de la page : une page renommée se renomme
 * partout où elle est citée.
 */
function rankleNav(routeId, locale) {
  const s = strings(locale);
  const items = ['mode-rankle', ...RANKLE_IDS]
    .filter((id) => id !== routeId)
    .map((id) => {
      const page = loadPage(locale, id);
      if (!page) throw new Error(`{{ranklenav}} : fragment ${locale}/${id}.html introuvable`);
      const label = page.meta.linkTitle || page.meta.breadcrumb || page.meta.title;
      return `        <li><a href="${href(id, locale)}">${label}</a></li>`;
    });
  const heading = locale === 'fr' ? 'Tout sur Rankle' : 'Everything about Rankle';
  void s;
  return `<h2>${heading}</h2>
      <ul class="rankle-nav">
${items.join('\n')}
      </ul>`;
}

/**
 * Extrait la FAQ affichée sur la page pour en faire le JSON-LD.
 *
 * Volontairement dérivé du HTML plutôt que saisi à part : sur l'ancienne page
 * d'accueil, le `FAQPage` déclarait trois questions quand la page en affichait
 * cinq. Une FAQ structurée qui ne correspond pas à la page est au mieux ignorée,
 * au pire une raison de perdre le rich result.
 */
export function extractFaq(html) {
  const items = [...html.matchAll(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<div class="faq-body">([\s\S]*?)<\/div>/g)].map(
    ([, q, a]) => ({ q: text(q), a: text(a) }),
  );
  return items.length ? items : null;
}

/** Réduit un fragment HTML à son texte, pour le JSON-LD. */
function text(fragment) {
  return fragment
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/** Charge un fragment, ou `null` si la page n'existe pas dans cette langue. */
export function loadPage(locale, id) {
  const file = join(CONTENT, locale, `${id}.html`);
  if (!existsSync(file)) {
    // Pas de fragment écrit à la main : les quatorze langues générées
    // construisent la page à la volée (voir generated.mjs). Le fichier, quand
    // il existe, gagne toujours — traduire une page à la main reste possible.
    return generatedPage(locale, id);
  }
  const raw = readFileSync(file, 'utf8');
  const { meta, body } = splitFrontMatter(raw, `${locale}/${id}.html`);
  for (const key of ['title', 'description']) {
    if (!meta[key]) throw new Error(`${locale}/${id}.html : « ${key} » manquant dans l'entête`);
  }
  return { meta, body, file: `site/content/${locale}/${id}.html` };
}
