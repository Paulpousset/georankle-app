/**
 * Extrait de `src/data/modeIntros.ts` la description et les conseils de chaque
 * mode, pour que le site puisse les republier dans les seize langues.
 *
 * Les pages « mode de jeu » du site racontent exactement ce que raconte la
 * pop-up « comment jouer » de l'app. Ces phrases sont déjà traduites dans les
 * catalogues : plutôt que d'en réécrire quatorze versions pour le site, on
 * exporte ici leur version anglaise — qui est la clé de traduction — et le
 * générateur du site les traduit au moment du rendu.
 *
 * Le français fait exception : il n'a pas de catalogue (`src/i18n/catalog/` ne
 * contient que les quatorze langues traduites, la clé étant l'anglais). On
 * exporte donc aussi `titleFr` / `bodyFr` / `tipsFr`, sans quoi les surfaces
 * françaises du site afficheraient les phrases en anglais.
 *
 * Sortie : `site/lib/modeCopy.gen.json`, versionné (le build du site ne compile
 * pas de TypeScript).
 *
 *   node scripts/gen_site_mode_copy.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = join(ROOT, 'src/data/modeIntros.ts');

const source = readFileSync(FILE, 'utf8');
const sf = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/** La valeur d'une propriété littérale, ou `null`. */
function text(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}

/** La table `{ clé: valeur }` d'un objet littéral. */
function props(node) {
  const out = new Map();
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop) || !prop.name) continue;
    const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
    if (key) out.set(key, prop.initializer);
  }
  return out;
}

let intros = null;
const visit = (node) => {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === 'MODE_INTROS' &&
    node.initializer
  ) {
    const literal = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
    if (ts.isObjectLiteralExpression(literal)) intros = literal;
  }
  ts.forEachChild(node, visit);
};
visit(sf);

if (!intros) {
  console.error('[modeCopy] MODE_INTROS introuvable dans src/data/modeIntros.ts');
  process.exit(1);
}

const out = {};
for (const [mode, value] of props(intros)) {
  if (!ts.isObjectLiteralExpression(value)) continue;
  const entry = props(value);
  const tips = [];
  const tipsFr = [];
  const tipsNode = entry.get('tips');
  if (tipsNode && ts.isArrayLiteralExpression(tipsNode)) {
    for (const tip of tipsNode.elements) {
      if (!ts.isObjectLiteralExpression(tip)) continue;
      const pair = props(tip);
      const en = text(pair.get('en'));
      if (en) {
        tips.push(en);
        tipsFr.push(text(pair.get('fr')) || en);
      }
    }
  }
  out[mode] = {
    title: text(entry.get('titleEn')),
    body: text(entry.get('bodyEn')),
    tips,
    titleFr: text(entry.get('titleFr')),
    bodyFr: text(entry.get('bodyFr')),
    tipsFr,
  };
}

writeFileSync(join(ROOT, 'site/lib/modeCopy.gen.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`site/lib/modeCopy.gen.json : ${Object.keys(out).length} modes`);
