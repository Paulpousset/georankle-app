/**
 * Deuxième passe sur les ternaires de langue : ceux dont les branches ne sont
 * pas des littéraux mais des **champs de données** — `part.nameFr : part.nameEn`,
 * `label.fr : label.en`, `rank.nameFr : rank.name`.
 *
 * `x === 'fr' ? A : B` et `tr(x, A, B)` rendaient la même chose à deux langues.
 * À seize, seul `tr` consulte le catalogue : ces libellés (cosmétiques de la
 * boutique, rangs, titres de défis, thèmes, noms de modes) sont justement ceux
 * que `i18n_extract.mjs` a déjà relevés dans les fichiers de données.
 *
 * Ne sont PAS convertis :
 *   - les branches qui ne sont pas du texte (tableaux `WEEKDAYS_FR`,
 *     sélection d'un nom de champ) — la liste `SKIP` ci-dessous ;
 *   - les fichiers qui *implémentent* la traduction (`src/i18n`, `geoNames`),
 *     où le ternaire est le cas de base et non un appel.
 *
 *   node scripts/i18n_data_ternaries.mjs [--write]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const WRITE = process.argv.includes('--write');

/** Les ternaires à ne pas toucher, repérés par un fragment de leur source. */
const SKIP = ['WEEKDAYS_FR', 'DAYS_FR'];

/** Les fichiers qui définissent la traduction plutôt que de l'utiliser. */
const EXCLUDED = ['src/i18n/index.ts', 'src/lib/geoNames.ts', 'src/lib/themeDisplay.ts'];

function sources(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === '__tests__') continue;
      sources(path, out);
    } else if (/\.tsx?$/.test(entry) && !entry.endsWith('.d.ts')) {
      out.push(path);
    }
  }
  return out;
}

let converted = 0;
const report = [];

for (const file of sources(SRC)) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  if (EXCLUDED.includes(rel)) continue;
  const source = readFileSync(file, 'utf8');
  if (!/[=!]== 'fr'/.test(source)) continue;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];

  const visit = (node) => {
    if (ts.isConditionalExpression(node) && ts.isBinaryExpression(node.condition)) {
      const { condition } = node;
      const equals = condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken;
      const differs = condition.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken;
      const literal =
        ts.isStringLiteral(condition.right) || ts.isNoSubstitutionTemplateLiteral(condition.right)
          ? condition.right.text
          : null;
      if ((equals || differs) && (literal === 'fr' || literal === 'en')) {
        const frenchFirst = (literal === 'fr') === equals;
        const [frNode, enNode] = frenchFirst
          ? [node.whenTrue, node.whenFalse]
          : [node.whenFalse, node.whenTrue];
        const text = source.slice(node.getStart(sf), node.end);
        if (!SKIP.some((needle) => text.includes(needle))) {
          const lang = source.slice(condition.left.getStart(sf), condition.left.end);
          const fr = source.slice(frNode.getStart(sf), frNode.end);
          const en = source.slice(enNode.getStart(sf), enNode.end);
          edits.push({ start: node.getStart(sf), end: node.end, text: `tr(${lang}, ${fr}, ${en})` });
          report.push(`${rel}: ${text.replace(/\s+/g, ' ').slice(0, 80)}`);
          converted += 1;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (!edits.length || !WRITE) continue;

  let out = source;
  let lastStart = Infinity;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    if (edit.end > lastStart) continue;
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    lastStart = edit.start;
  }
  if (!/\bimport\s*\{[^}]*\btr\b[^}]*\}\s*from\s*'[^']*i18n'/.test(out)) {
    const spec = (() => {
      const path = relative(dirname(file), join(SRC, 'i18n')).replace(/\\/g, '/');
      return path.startsWith('.') ? path : `./${path}`;
    })();
    const existing = out.match(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'${spec}';`));
    if (existing) {
      out = out.replace(existing[0], `import {${existing[1].replace(/\s+$/, '')}, tr } from '${spec}';`);
    } else {
      const lastImport = [...out.matchAll(/^import .*?;$/gms)].pop();
      const at = lastImport ? lastImport.index + lastImport[0].length : 0;
      out = out.slice(0, at) + `\nimport { tr } from '${spec}';` + out.slice(at);
    }
  }
  writeFileSync(file, out, 'utf8');
}

console.log(`ternaires de données convertis : ${converted}${WRITE ? '' : ' (à écrire avec --write)'}`);
if (process.argv.includes('--verbose')) for (const line of report) console.log('  · ' + line);
