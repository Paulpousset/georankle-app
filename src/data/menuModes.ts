/**
 * Le catalogue des modes tel que le menu principal le présente.
 *
 * Avant, chaque tuile du menu était écrite à la main, deux fois (liste Solo et
 * liste En ligne), sans ordre lisible. Le menu en onglets range désormais les
 * modes en trois familles, et l'onglet « Jouer » filtre et cherche dedans :
 * une seule source de vérité, que les onglets Jouer, Duel et Accueil
 * (« À essayer ») lisent tous.
 *
 * Ajouter un mode = ajouter une ligne ici (et son icône dans MainMenu).
 */
import type { GameMode, MatchMode } from '../types';

export type ModeFamily = 'map' | 'recognize' | 'compare';

export interface MenuModeDef {
  /** Le mode solo lancé par la tuile. */
  mode: GameMode;
  family: ModeFamily;
  titleFr: string;
  titleEn: string;
  subtitleFr: string;
  subtitleEn: string;
  /** Mode en ligne correspondant (absent = pas jouable en duel). */
  online?: MatchMode;
  onlineSubtitleFr?: string;
  onlineSubtitleEn?: string;
  /** Pastille « NOUVEAU » sur la tuile et priorité dans « À essayer ». */
  isNew?: boolean;
  /** Mode masqué tant que ce drapeau distant est éteint. */
  featureFlag?: 'languages_mode';
}

export const MODE_FAMILIES: { id: ModeFamily; fr: string; en: string }[] = [
  { id: 'map', fr: 'Sur la carte', en: 'On the map' },
  { id: 'recognize', fr: 'Reconnaître', en: 'Recognize' },
  { id: 'compare', fr: 'Comparer', en: 'Compare' },
];

export const MENU_MODES: MenuModeDef[] = [
  // ── Sur la carte ──────────────────────────────────────────────────────────
  {
    mode: 'globe',
    family: 'map',
    titleFr: 'Globe Géo',
    titleEn: 'Geo Globe',
    subtitleFr: 'Trouvez les pays sur le globe',
    subtitleEn: 'Find countries on the globe',
    online: 'globe',
    onlineSubtitleFr: 'Trouvez les pays sur le globe',
    onlineSubtitleEn: 'Find countries on the globe',
  },
  {
    mode: 'borders',
    family: 'map',
    titleFr: 'Frontières',
    titleEn: 'Borders',
    subtitleFr: 'Reliez deux pays par leurs frontières',
    subtitleEn: 'Link two countries through borders',
    online: 'borders',
    onlineSubtitleFr: 'Le même trajet pour les deux joueurs',
    onlineSubtitleEn: 'Same route for both players',
  },
  {
    mode: 'split',
    family: 'map',
    titleFr: 'Partage équitable',
    titleEn: 'Fair Split',
    subtitleFr: 'Coupez un pays en parts de population égales',
    subtitleEn: 'Cut a country into equal population shares',
    online: 'split',
    onlineSubtitleFr: 'Les mêmes cartes pour les deux joueurs',
    onlineSubtitleEn: 'Same maps for both players',
    isNew: true,
  },
  {
    mode: 'scale',
    family: 'map',
    titleFr: 'À l’échelle',
    titleEn: 'To Scale',
    subtitleFr: 'Mettez deux pays à la même échelle',
    subtitleEn: 'Put two countries at the same scale',
    online: 'scale',
    onlineSubtitleFr: 'Les mêmes paires pour les deux joueurs',
    onlineSubtitleEn: 'Same pairs for both players',
  },
  {
    mode: 'pinpoint',
    family: 'map',
    titleFr: 'Point sur le Globe',
    titleEn: 'Pin on the Globe',
    subtitleFr: 'Un point, un globe sans frontières : quel pays ?',
    subtitleEn: 'A point on a borderless globe: which country?',
    online: 'pinpoint',
    onlineSubtitleFr: 'Les mêmes points pour les deux joueurs',
    onlineSubtitleEn: 'Same points for both players',
  },
  {
    mode: 'regions',
    family: 'map',
    titleFr: 'Défis Pays',
    titleEn: 'Country Challenges',
    subtitleFr: 'Des jeux variés pour un pays',
    subtitleEn: 'Diverse games for one country',
    online: 'regions',
    onlineSubtitleFr: "Placez les régions d'un pays, à 2",
    onlineSubtitleEn: "Place a country's regions, head-to-head",
  },
  // ── Reconnaître ───────────────────────────────────────────────────────────
  {
    mode: 'guess',
    family: 'recognize',
    titleFr: 'Devinez le Pays',
    titleEn: 'Guess Country',
    subtitleFr: 'Identifiez le pays depuis ses infos',
    subtitleEn: 'Identify the country from clues',
    online: 'guess',
    onlineSubtitleFr: 'Même pays mystère pour les deux',
    onlineSubtitleEn: 'Same mystery country for both',
  },
  {
    mode: 'silhouette',
    family: 'recognize',
    titleFr: 'Silhouette',
    titleEn: 'Silhouette',
    subtitleFr: 'Devinez le pays à sa forme',
    subtitleEn: 'Guess the country by its shape',
    online: 'silhouette',
    onlineSubtitleFr: 'Les mêmes formes pour les deux joueurs',
    onlineSubtitleEn: 'Same shapes for both players',
  },
  {
    mode: 'quiz-flag',
    family: 'recognize',
    titleFr: 'Drapeaux',
    titleEn: 'Flags',
    subtitleFr: 'Identifiez les drapeaux des pays',
    subtitleEn: 'Identify country flags',
  },
  {
    mode: 'quiz-capital',
    family: 'recognize',
    titleFr: 'Capitales',
    titleEn: 'Capitals',
    subtitleFr: 'Retrouvez les capitales du monde',
    subtitleEn: 'Find the world capitals',
    // Capitales et Drapeaux se jouent en ligne dans le « Mode Versus »,
    // que l'onglet Duel affiche à part.
  },
  {
    mode: 'languages',
    family: 'recognize',
    titleFr: 'Langues',
    titleEn: 'Languages',
    subtitleFr: 'De quelle langue vient cette phrase ?',
    subtitleEn: 'Which language is this phrase?',
    online: 'languages',
    onlineSubtitleFr: 'Les mêmes phrases pour les deux joueurs',
    onlineSubtitleEn: 'Same phrases for both players',
    featureFlag: 'languages_mode',
  },
  // ── Comparer ──────────────────────────────────────────────────────────────
  {
    mode: 'classic',
    family: 'compare',
    titleFr: 'Rankle',
    titleEn: 'Rankle',
    subtitleFr: 'Associez chaque pays à un thème',
    subtitleEn: 'Match each country to a theme',
    online: 'classic',
    onlineSubtitleFr: 'Associez chaque pays à un thème',
    onlineSubtitleEn: 'Match each country to a theme',
  },
  {
    mode: 'higherlower',
    family: 'compare',
    titleFr: 'Plus ou Moins',
    titleEn: 'Higher or Lower',
    subtitleFr: 'Quel pays est au-dessus ?',
    subtitleEn: 'Which country is higher?',
    online: 'higherlower',
    onlineSubtitleFr: 'La même chaîne pour les deux joueurs',
    onlineSubtitleEn: 'Same chain for both players',
  },
  {
    mode: 'streak',
    family: 'compare',
    titleFr: 'Mode Streak',
    titleEn: 'Streak Mode',
    subtitleFr: 'Enchaînez les bonnes réponses',
    subtitleEn: 'Chain correct answers',
    online: 'streak',
    onlineSubtitleFr: 'Enchaînez les bonnes réponses',
    onlineSubtitleEn: 'Chain correct answers',
  },
];

/** Normalise pour la recherche : minuscules, sans accents. */
export function foldForSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Le mode correspond-il à la recherche (titre ou sous-titre, FR ou EN) ? */
export function matchesQuery(def: MenuModeDef, query: string): boolean {
  const q = foldForSearch(query);
  if (!q) return true;
  return [def.titleFr, def.titleEn, def.subtitleFr, def.subtitleEn].some((s) =>
    foldForSearch(s).includes(q),
  );
}
