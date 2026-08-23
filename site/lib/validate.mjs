/**
 * Les garde-fous exécutés après génération, avant l'écriture du sitemap.
 *
 * Le plan SEO insiste : « les erreurs de réciprocité sont silencieuses et
 * annulent tout le bénéfice ». Un hreflang cassé ne fait pas planter une page,
 * ne se voit pas à l'œil, et ne se découvre que des semaines plus tard dans la
 * Search Console. On les transforme donc en échec de build.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { ORIGIN, ROOT } from './paths.mjs';
import { LOCALES, ROUTES, alternates, href } from './routes.mjs';

/**
 * Réciprocité des `hreflang` : si A déclare B, B doit déclarer A, et chaque
 * page doit s'auto-référencer.
 */
function checkHreflang(published) {
  const errors = [];
  for (const r of ROUTES) {
    const locales = LOCALES.filter((l) => r.paths[l]);
    for (const locale of locales) {
      const key = `${r.id}|${locale}`;
      if (!published.has(key)) {
        errors.push(`route ${r.id} déclarée en ${locale} mais aucune page générée`);
        continue;
      }
      const alts = alternates(r.id);
      const self = alts.find((a) => a.path === r.paths[locale] && a.hreflang !== 'x-default');
      if (!self) errors.push(`${r.id}/${locale} : auto-référence hreflang absente`);
      for (const other of locales) {
        if (!alts.some((a) => a.path === r.paths[other])) {
          errors.push(`${r.id}/${locale} : alternate ${other} manquant`);
        }
      }
    }
    // Une page non traduite ne doit jamais apparaître comme alternate.
    for (const a of alternates(r.id)) {
      if (a.hreflang === 'x-default') continue;
      const target = LOCALES.find((l) => r.paths[l] === a.path);
      if (!target) errors.push(`${r.id} : alternate ${a.hreflang} pointe vers une URL inconnue`);
    }
  }
  return errors;
}

/** Aucun lien interne ne doit pointer vers une URL que le site ne produit pas. */
function checkInternalLinks(pages) {
  const known = new Set(pages.map((p) => p.path));
  // Les pages écrites à la main, hors générateur, restent des cibles valides.
  for (const extra of ['/invite.html', '/reset-password.html', '/confirmed.html', '/404.html']) {
    known.add(extra);
  }
  const errors = [];
  for (const page of pages) {
    const hrefs = [...page.html.matchAll(/href="(\/[^"#?]*)/g)].map(([, h]) => h);
    for (const link of new Set(hrefs)) {
      if (link.startsWith('/fonts/') || link.startsWith('/shots/') || link.startsWith('/assets/')) continue;
      if (/\.(png|jpg|webp|css|js|xml|txt|ico|json)$/.test(link)) continue;
      if (!known.has(link)) errors.push(`${page.path} → lien mort « ${link} »`);
    }
  }
  return errors;
}

/** Deux pages ne doivent pas partager un titre ni une URL. */
function checkUniqueness(pages) {
  const errors = [];
  const seenPath = new Set();
  const seenTitle = new Map();
  for (const page of pages) {
    if (seenPath.has(page.path)) errors.push(`URL générée deux fois : ${page.path}`);
    seenPath.add(page.path);
    const key = `${page.locale}|${page.title}`;
    if (seenTitle.has(key)) {
      errors.push(`titre dupliqué « ${page.title} » : ${seenTitle.get(key)} et ${page.path}`);
    }
    seenTitle.set(key, page.path);
  }
  return errors;
}

/** Le canonical de chaque page doit pointer vers elle-même, jamais ailleurs. */
function checkCanonical(pages) {
  return pages.flatMap((page) => {
    const m = page.html.match(/<link rel="canonical" href="([^"]+)"/);
    if (!m) return [`${page.path} : canonical absent`];
    const expected = `${ORIGIN}${page.path}`;
    return m[1] === expected ? [] : [`${page.path} : canonical vers ${m[1]} au lieu de ${expected}`];
  });
}

/**
 * Toute ressource statique référencée doit exister dans `public/`.
 *
 * Trois cas, tous silencieux en production :
 *   - un `preload` vers une URL absente n'affiche rien de faux — la police de
 *     repli s'applique — on perd juste le gain de LCP qu'on croyait avoir
 *     (Playfair sert le MÊME fichier en 700 et 900 : précharger « 900 »
 *     téléchargeait une 404) ;
 *   - une capture d'écran manquante laisse un cadre vide, sans erreur de page ;
 *   - un `srcset` WebP cassé retombe sur le PNG, donc invisible à l'œil.
 */
function checkAssets(pages) {
  const errors = [];
  const seen = new Set();
  const check = (url, where, what) => {
    if (seen.has(url)) return;
    seen.add(url);
    if (!existsSync(join(ROOT, 'public', url.replace(/^\//, '')))) {
      errors.push(`${what} vers un fichier absent : ${url} (vu sur ${where})`);
    }
  };
  for (const page of pages) {
    for (const [, url] of page.html.matchAll(/<link rel="preload" href="(\/[^"]+)"/g)) {
      check(url, page.path, 'preload');
    }
    for (const [, url] of page.html.matchAll(/<img[^>]+src="(\/(?:shots|fonts)\/[^"]+)"/g)) {
      check(url, page.path, 'image');
    }
    for (const [, url] of page.html.matchAll(/<source[^>]+srcset="(\/(?:shots|fonts)\/[^"]+)"/g)) {
      check(url, page.path, 'srcset');
    }
  }
  return errors;
}

/** Lance tous les contrôles et arrête le build au premier lot d'erreurs. */
export function validate(pages, { lenient = false } = {}) {
  const published = new Set(pages.map((p) => `${p.routeId}|${p.locale}`));
  const errors = [
    ...checkHreflang(published),
    ...checkUniqueness(pages),
    ...checkCanonical(pages),
    ...checkInternalLinks(pages),
    ...checkAssets(pages),
  ];
  if (errors.length) {
    const list = `${errors.length} problème(s) SEO :\n  - ${errors.join('\n  - ')}`;
    // En rédaction (SITE_ALLOW_MISSING), les pages pas encore écrites créent
    // forcément des liens morts : on avertit. En production, on refuse.
    if (!lenient) throw new Error(list);
    console.warn(`[site] ${list}\n`);
  }
  return { pages: pages.length, routes: ROUTES.length };
}

export { href };
