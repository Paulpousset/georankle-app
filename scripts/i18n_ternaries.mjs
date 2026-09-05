/**
 * Convertit les ternaires `language === 'fr' ? '…' : '…'` en `tr(language, …)`.
 *
 * Tant que l'app ne parlait que deux langues, le ternaire et `tr` étaient
 * équivalents. Avec seize langues, le ternaire renvoie l'anglais à tout le
 * monde : seul `tr` consulte le catalogue. Ce script fait la bascule pour les
 * ternaires dont **les deux branches sont des littéraux** — les autres
 * (`c.name : c.name_en`, du JSX, des styles) sont laissés tels quels, leur
 * repli anglais étant le bon comportement.
 *
 * Les gabarits interpolés sont paramétrés comme dans `i18n_extract.mjs`
 * (`{0}`, `{1}` + tableau d'arguments), et l'import de `tr` est ajouté au
 * besoin, avec le bon chemin relatif.
 *
 *   node scripts/i18n_ternaries.mjs           # inventaire
 *   node scripts/i18n_ternaries.mjs --write   # réécriture
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const WRITE = process.argv.includes('--write');

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

function plain(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

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

function quote(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

/** L'expression de langue testée par `x === 'fr'`, ou `null`. */
function languageOperand(condition) {
  if (!ts.isBinaryExpression(condition)) return null;
  const kind = condition.operatorToken.kind;
  const equals = kind === ts.SyntaxKind.EqualsEqualsEqualsToken;
  const differs = kind === ts.SyntaxKind.ExclamationEqualsEqualsToken;
  if (!equals && !differs) return null;
  const literal = plain(condition.right);
  if (literal !== 'fr' && literal !== 'en') return null;
  // `x === 'fr'` et `x !== 'en'` mettent le français en première branche.
  const frenchFirst = (literal === 'fr') === equals;
  return { operand: condition.left, frenchFirst };
}

let converted = 0;
let leftAlone = 0;
const touched = [];

for (const file of sources(SRC)) {
  const source = readFileSync(file, 'utf8');
  if (!/[=!]== 'fr'|[=!]== 'en'/.test(source)) continue;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];

  const visit = (node) => {
    if (ts.isConditionalExpression(node)) {
      const test = languageOperand(node.condition);
      if (test) {
        const [frNode, enNode] = test.frenchFirst
          ? [node.whenTrue, node.whenFalse]
          : [node.whenFalse, node.whenTrue];
        const frLiteral = plain(frNode) !== null || ts.isTemplateExpression(frNode);
        const enLiteral = plain(enNode) !== null || ts.isTemplateExpression(enNode);
        if (frLiteral && enLiteral) {
          const shared = [];
          const fr = plain(frNode) ?? templateToPattern(frNode, source, shared);
          const en = plain(enNode) ?? templateToPattern(enNode, source, shared);
          const lang = source.slice(test.operand.pos, test.operand.end).trim();
          const args = shared.length ? `, [${shared.join(', ')}]` : '';
          edits.push({
            start: node.getStart(sf),
            end: node.end,
            text: `tr(${lang}, ${quote(fr)}, ${quote(en)}${args})`,
          });
          converted += 1;
        } else {
          leftAlone += 1;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (!edits.length) continue;
  touched.push(relative(ROOT, file));
  if (!WRITE) continue;

  let out = source;
  // Un ternaire peut en contenir un autre : on écrit de la fin vers le début et
  // on ignore les éditions imbriquées dans une édition déjà appliquée.
  let lastStart = Infinity;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    if (edit.end > lastStart) continue;
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    lastStart = edit.start;
  }
  // `tr` doit être importé — le chemin dépend de la profondeur du fichier.
  if (!/\bimport\s*\{[^}]*\btr\b[^}]*\}\s*from\s*'[^']*i18n'/.test(out)) {
    const rel = relative(dirname(file), join(SRC, 'i18n')).replace(/\\/g, '/');
    const spec = rel.startsWith('.') ? rel : `./${rel}`;
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

console.log(`ternaires convertis : ${converted}${WRITE ? '' : ' (à écrire avec --write)'}`);
console.log(`ternaires non littéraux, laissés tels quels : ${leftAlone}`);
console.log(`fichiers touchés : ${touched.length}`);
