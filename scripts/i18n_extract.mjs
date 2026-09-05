/**
 * Recense (et normalise) toutes les chaînes traduisibles de `src/`.
 *
 * Deux familles de sources :
 *   1. les appels `t(fr, en)` / `tr(language, fr, en)` — l'écrasante majorité ;
 *   2. les littéraux `{ fr: '…', en: '…' }` des fichiers de données
 *      (`src/data/*`, `src/i18n/themeDescriptions.ts`), lus par `pickLabel`.
 *
 * Avec `--write`, le script **réécrit** les appels dont un argument est un
 * gabarit interpolé : `t(\`Bonjour ${nom}\`, \`Hi ${nom}\`)` devient
 * `t('Bonjour {0}', 'Hi {0}', [nom])`. C'est indispensable : une chaîne
 * construite à l'exécution ne peut pas servir de clé de catalogue. L'ordre des
 * arguments suit le français ; si l'anglais réutilise une expression déjà vue,
 * il reprend son index (les deux langues n'ordonnent pas toujours pareil).
 *
 * Sortie : `src/i18n/keys.json`, la liste des clés (l'anglais fait la clé) avec
 * leur français, leur fréquence et les fichiers où elles vivent. C'est la
 * source des catalogues `src/i18n/catalog/<langue>.json`.
 *
 * Les éditions sont appliquées de la fin vers le début du fichier pour que les
 * positions restent valides, et le script est idempotent : relancé, il ne
 * retouche rien (les gabarits ont disparu au premier passage).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const WRITE = process.argv.includes('--write');

/** Tous les .ts/.tsx de `src/`, tests exclus (leurs chaînes ne s'affichent pas). */
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

/** Le texte d'un littéral, ou `null` si ce n'en est pas un. */
function plain(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/**
 * `\`reste ${n} vies\`` → `{ text: 'reste {0} vies', exprs: ['n'] }`.
 *
 * `shared` porte les expressions déjà numérotées par l'argument précédent :
 * l'anglais d'un même appel doit réutiliser les mêmes index que le français.
 */
function templateToPattern(node, source, shared) {
  let text = node.head.text;
  for (const span of node.templateSpans) {
    const code = source.slice(span.expression.pos, span.expression.end).trim();
    let index = shared.indexOf(code);
    if (index === -1) {
      shared.push(code);
      index = shared.length - 1;
    }
    text += `{${index}}` + span.literal.text;
  }
  return text;
}

/** Un littéral JS simple quote, prêt à être recollé dans le source. */
function quote(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

/**
 * Les tables `Record<…, [string, string]>` dont le couple est un [fr, en].
 * Elles sont lues par `tr(language, table[x][0], table[x][1])` : l'AST ne peut
 * pas le deviner, et toutes les tables de ce type n'en sont pas (les
 * départements français ou les dégradés des biomes en sont aussi).
 */
const TUPLE_TABLES = new Set([
  'CATEGORY_LABELS',
  'MODE_LABELS',
  'QUEST_LABELS',
  'COUNTRY_LABELS',
  'labels',
]);

const keys = new Map();
const skipped = [];
let rewritten = 0;

/** Enregistre une paire fr/en dans la table des clés. */
function record(fr, en, file, kind) {
  if (!en && !fr) return;
  const key = en || fr;
  const hit = keys.get(key) ?? { key, fr, en, count: 0, files: new Set(), kinds: new Set(), variants: new Set() };
  hit.count += 1;
  hit.files.add(file);
  hit.kinds.add(kind);
  // Même anglais, français différent : le catalogue devra désambiguïser.
  if (hit.fr !== fr) hit.variants.add(fr);
  keys.set(key, hit);
}

for (const file of sources(SRC)) {
  const source = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rel = relative(ROOT, file);
  const edits = [];

  const visit = (node) => {
    // ── 1. les appels t(fr, en) / tr(language, fr, en) ────────────────────────
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      const offset = name === 'tr' ? 1 : 0;
      // 2 arguments (3 pour `tr`), ou un de plus quand la chaîne porte des
      // trous `{0}` et reçoit déjà son tableau d'arguments.
      const expected = 2 + offset;
      const arity = node.arguments.length;
      if ((name === 't' || name === 'tr') && (arity === expected || arity === expected + 1)) {
        const [frNode, enNode] = node.arguments.slice(offset);
        const frText = plain(frNode);
        const enText = plain(enNode);

        if (frText !== null && enText !== null) {
          record(frText, enText, rel, 'call');
        } else if (
          (ts.isTemplateExpression(frNode) || frText !== null) &&
          (ts.isTemplateExpression(enNode) || enText !== null)
        ) {
          // Au moins un gabarit interpolé : on le paramètre.
          const shared = [];
          const fr = frText !== null ? frText : templateToPattern(frNode, source, shared);
          const en = enText !== null ? enText : templateToPattern(enNode, source, shared);
          record(fr, en, rel, 'call');
          edits.push({
            start: frNode.pos,
            end: enNode.end,
            text: ` ${quote(fr)}, ${quote(en)}, [${shared.join(', ')}]`,
          });
          rewritten += 1;
        } else {
          skipped.push(`${rel}: ${source.slice(node.pos, node.end).trim().slice(0, 90)}`);
        }
      }
    }

    // ── 2. les littéraux de données : { fr, en } et { xFr, xEn } ─────────────
    // `pickLabel` et les `tr(language, def.fr, def.en)` des écrans lisent ces
    // objets ; la chaîne anglaise qui en sort doit exister dans le catalogue.
    if (ts.isObjectLiteralExpression(node)) {
      const props = new Map();
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop) || !prop.name) continue;
        const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
        if (key) props.set(key, prop.initializer);
      }
      for (const [name, value] of props) {
        const enName = name === 'fr' ? 'en' : /Fr$/.test(name) ? name.replace(/Fr$/, 'En') : null;
        if (!enName || !props.has(enName)) continue;
        const fr = plain(value);
        const en = plain(props.get(enName));
        if (fr !== null && en !== null) record(fr, en, rel, 'label');
      }
    }

    // ── 3. les tables de couples [fr, en] ────────────────────────────────────
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      TUPLE_TABLES.has(node.name.text) &&
      node.initializer
    ) {
      const walk = (child) => {
        if (ts.isArrayLiteralExpression(child) && child.elements.length === 2) {
          const fr = plain(child.elements[0]);
          const en = plain(child.elements[1]);
          if (fr !== null && en !== null) record(fr, en, rel, 'label');
        }
        ts.forEachChild(child, walk);
      };
      walk(node.initializer);
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (WRITE && edits.length) {
    let out = source;
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    }
    writeFileSync(file, out, 'utf8');
  }
}

// ── 4. les données de jeu embarquées ────────────────────────────────────────
// Les libellés et unités des 41 thèmes, et les 45 noms de langues du mode
// « Langues », vivent dans des JSON — l'AST de `src/` ne les voit pas, alors
// qu'ils s'affichent autant que le reste.
const gameData = JSON.parse(readFileSync(join(ROOT, 'assets/game_data.json'), 'utf8'));
for (const theme of Object.values(gameData.themes)) {
  if (theme.label?.fr && theme.label?.en) record(theme.label.fr, theme.label.en, 'assets/game_data.json', 'theme');
  if (theme.unit?.fr && theme.unit?.en) record(theme.unit.fr, theme.unit.en, 'assets/game_data.json', 'unit');
}
const corpus = JSON.parse(readFileSync(join(ROOT, 'assets/languages.json'), 'utf8'));
for (const language of corpus.languages) {
  if (language.nameFr && language.nameEn) record(language.nameFr, language.nameEn, 'assets/languages.json', 'label');
}

const list = [...keys.values()]
  .sort((a, b) => (a.key < b.key ? -1 : 1))
  .map((entry) => ({
    key: entry.key,
    fr: entry.fr,
    en: entry.en,
    count: entry.count,
    kinds: [...entry.kinds],
    files: [...entry.files].sort(),
    ...(entry.variants.size ? { frVariants: [...entry.variants] } : {}),
  }));

if (WRITE) writeFileSync(join(SRC, 'i18n/keys.json'), JSON.stringify(list, null, 2) + '\n', 'utf8');

const chars = list.reduce((sum, entry) => sum + entry.key.length, 0);
console.log(`clés : ${list.length} (${chars} caractères d'anglais)`);
console.log(`gabarits paramétrés : ${rewritten}${WRITE ? '' : ' (à écrire avec --write)'}`);
console.log(`appels non littéraux, laissés tels quels : ${skipped.length}`);
const ambiguous = list.filter((entry) => entry.frVariants);
if (ambiguous.length) console.log(`clés anglaises ambiguës (plusieurs français) : ${ambiguous.length}`);
if (process.argv.includes('--verbose')) {
  for (const line of skipped) console.log('  · ' + line);
  for (const entry of ambiguous) console.log('  ~ ' + entry.key + ' → ' + [entry.fr, ...entry.frVariants].join(' / '));
}
