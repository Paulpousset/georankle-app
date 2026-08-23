/**
 * Les chiffres affichés sur le site, dérivés des sources du jeu.
 *
 * Règle du plan SEO : « tout chiffre affiché vient d'une constante unique,
 * jamais d'une valeur en dur dans un template ». Avant ce fichier, la landing
 * annonçait 197 pays quand le jeu en contient 195 — pas une incohérence, une
 * erreur, que notre propre guide « combien de pays dans le monde » contredisait.
 *
 * Rien n'est saisi ici : tout est lu dans `assets/` ou dans les sources de
 * l'app, et le build s'arrête si une lecture échoue. Un pays ajouté au jeu
 * met donc le site à jour tout seul.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.mjs';
import { MODES } from './modes.mjs';

/** Lit un JSON d'`assets/`, ou arrête le build. */
function asset(name) {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'assets', name), 'utf8'));
  } catch (err) {
    throw new Error(`assets/${name} illisible — le site ne peut pas dériver ses chiffres (${err.message})`);
  }
}

/**
 * Extrait une valeur d'une source TypeScript de l'app par expression régulière.
 * Volontairement rustique : importer du TS depuis un script Node demanderait un
 * transpileur pour une seule constante. Si la regex ne matche plus, le build
 * échoue au lieu d'afficher un chiffre faux.
 */
function fromSource(file, regex, label) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const m = src.match(regex);
  if (!m) throw new Error(`${label} introuvable dans ${file} — la source a changé, mets à jour la regex`);
  return m[1];
}

const stats = asset('countries_stats.json');
const gameData = asset('game_data.json');

/** Nombre de pays du jeu : 193 membres de l'ONU + 2 observateurs. */
export const COUNTRY_COUNT = stats.length;

/** Nombre de thèmes de classement (Rankle, Streak, Plus ou Moins). */
export const THEME_COUNT = Object.keys(gameData.themes).length;

/** Niveaux du mode Histoire. */
export const STORY_LEVEL_COUNT = Number(
  fromSource('src/data/story.ts', /export const STORY_LEVEL_COUNT = (\d+)/, 'STORY_LEVEL_COUNT'),
);

/** Modes de jeu présentés au public (une page par mode en phase 2). */
export const MODE_COUNT = MODES.length;

/** Langues réellement parlées par l'app — PAS les langues du site. */
export const APP_LANGUAGES = fromSource(
  'src/types/index.ts',
  /export type Language = ([^;]+);/,
  'type Language',
)
  .split('|')
  .map((s) => s.trim().replace(/'/g, ''));

if (!Number.isInteger(COUNTRY_COUNT) || COUNTRY_COUNT < 100) {
  throw new Error(`COUNTRY_COUNT aberrant (${COUNTRY_COUNT})`);
}

/** Les valeurs interpolables dans les fragments via `{{nom}}`. */
export const PLACEHOLDERS = {
  countries: String(COUNTRY_COUNT),
  themes: String(THEME_COUNT),
  storyLevels: String(STORY_LEVEL_COUNT),
  modes: String(MODE_COUNT),
};
