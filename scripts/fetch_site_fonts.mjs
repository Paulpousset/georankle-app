/**
 * Rapatrie en local les polices du site (Playfair Display + Space Mono).
 *
 * Pourquoi : la feuille `fonts.googleapis.com` bloquait le rendu ~780 ms sur
 * CHAQUE page, et l'élément LCP de la page d'accueil est le `<h1>` — donc son
 * LCP à 6,0 s était, littéralement, l'attente de Playfair Display. Un tiers en
 * chemin critique coûte DNS + TLS + CSS + fichier de police ; auto-hébergées,
 * les polices partent en même 1er round-trip que le HTML et se préchargent.
 *
 * Les deux familles sont sous licence SIL Open Font License : l'auto-hébergement
 * est explicitement autorisé.
 *
 * Outil de développement, pas de build : on le relance à la main quand on
 * change de graisse ou de famille. `public/fonts/` est versionné.
 *
 *   node scripts/fetch_site_fonts.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS_URL =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Space+Mono:wght@400;700&display=swap';

// UA moderne : sans lui, Google sert du woff (2× plus lourd) au lieu du woff2.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Les seuls sous-ensembles utiles : le site est en alphabet latin. */
const WANTED = {
  'U+0000-00FF': 'latin',
  'U+0100-02BA': 'latin-ext',
};

const OUT = join(process.cwd(), 'public', 'fonts');
mkdirSync(OUT, { recursive: true });

const css = await (await fetch(CSS_URL, { headers: { 'User-Agent': UA } })).text();

/** Découpe la feuille Google en blocs @font-face exploitables. */
const faces = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g)].map(
  ([, subset, body]) => ({
    subset,
    family: body.match(/font-family:\s*'([^']+)'/)[1],
    style: body.match(/font-style:\s*(\w+)/)[1],
    weight: body.match(/font-weight:\s*(\d+)/)[1],
    url: body.match(/src:\s*url\(([^)]+)\)/)[1],
    range: body.match(/unicode-range:\s*([^;]+);/)[1].trim(),
  }),
);

if (!faces.length) throw new Error('aucun @font-face reconnu — le format de la feuille Google a changé');

const kept = faces.filter((f) => Object.values(WANTED).includes(f.subset));
const rules = [];

// Playfair sert le MÊME fichier pour les graisses 700 et 900 (police variable) :
// on ne le télécharge qu'une fois et les deux @font-face pointent dessus. Le
// navigateur ne fait alors qu'une requête, l'URL étant identique.
const byUrl = new Map();

for (const face of kept) {
  let slug = byUrl.get(face.url);
  if (!slug) {
    slug = `${face.family.toLowerCase().replace(/\s+/g, '-')}-${face.weight}${face.style === 'italic' ? 'i' : ''}-${face.subset}.woff2`;
    const bytes = Buffer.from(await (await fetch(face.url)).arrayBuffer());
    writeFileSync(join(OUT, slug), bytes);
    byUrl.set(face.url, slug);
    console.log(`  ${slug} — ${(bytes.length / 1024).toFixed(1)} Ko`);
  }
  rules.push(
    `@font-face {\n` +
      `  font-family: '${face.family}';\n` +
      `  font-style: ${face.style};\n` +
      `  font-weight: ${face.weight};\n` +
      `  font-display: swap;\n` +
      `  src: url(/fonts/${slug}) format('woff2');\n` +
      `  unicode-range: ${face.range};\n` +
      `}`,
  );
}

writeFileSync(
  join(OUT, 'fonts.css'),
  `/* Généré par scripts/fetch_site_fonts.mjs — ne pas éditer à la main.\n` +
    `   Playfair Display & Space Mono, SIL Open Font License 1.1.\n` +
    `   Sous-ensembles latin + latin-ext uniquement. */\n\n` +
    rules.join('\n\n') +
    '\n',
  'utf8',
);

console.log(`\n${byUrl.size} fichiers (${kept.length} @font-face) + fonts.css écrits dans public/fonts/`);
