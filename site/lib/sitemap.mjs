/**
 * Le sitemap, généré au build.
 *
 * L'ancien était écrit à la main, avec `lastmod` figé au 2026-08-16 sur ses
 * douze entrées — y compris `/play` déclaré `changefreq: daily`. Un signal faux
 * est un signal ignoré, et douze entrées à la main n'auraient pas survécu au
 * passage à une soixantaine de pages.
 *
 * `lastmod` vient de la date `modified:` déclarée dans l'entête du fragment,
 * pas de la date du fichier : sur Vercel, tous les fichiers portent l'horodatage
 * du clone, ce qui redaterait le site entier à chaque déploiement.
 *
 * Chaque URL porte ses `<xhtml:link rel="alternate">`, en plus des `hreflang`
 * du `<head>` : c'est redondant, et c'est exactement ce que Google recommande —
 * les deux canaux se confirment l'un l'autre.
 */
import { ORIGIN } from './paths.mjs';
import { alternates } from './routes.mjs';

export function buildSitemap(pages) {
  const entries = pages
    .filter((p) => p.indexable)
    .map((p) => {
      const alts = alternates(p.routeId)
        .filter((a) => a.hreflang !== 'x-default')
        .map(
          (a) =>
            `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${ORIGIN}${a.path}" />`,
        )
        .join('\n');
      return [
        '  <url>',
        `    <loc>${ORIGIN}${p.path}</loc>`,
        alts,
        `    <lastmod>${p.lastmod}</lastmod>`,
        `    <changefreq>${p.changefreq}</changefreq>`,
        `    <priority>${p.priority.toFixed(1)}</priority>`,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n');
    });

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n' +
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    entries.join('\n') +
    '\n</urlset>\n'
  );
}
