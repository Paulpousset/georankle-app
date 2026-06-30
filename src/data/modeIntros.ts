/**
 * "How to play" copy shown the first time a player opens each game mode.
 *
 * One entry per playable GameMode (the `menu` pseudo-mode has none). Icons and
 * accent colours mirror the mode cards on the main menu so the popup feels like
 * a continuation of the card the player just tapped. `tips` are the 2-3 rules
 * that actually matter, rendered as a short checklist under the blurb.
 */
import type { ComponentType } from 'react';
import { Flag, Globe, Info, LayoutGrid, Map, Monitor, Swords, Zap } from 'lucide-react-native';

import { PALETTE } from '../theme/colors';
import type { GameMode } from '../types';

export interface ModeIntro {
  icon: ComponentType<{ color: string; size: number }>;
  accent: string;
  titleFr: string;
  titleEn: string;
  bodyFr: string;
  bodyEn: string;
  tips: { fr: string; en: string }[];
}

export const MODE_INTROS: Partial<Record<GameMode, ModeIntro>> = {
  classic: {
    icon: LayoutGrid,
    accent: PALETTE.forestGreen,
    titleFr: 'Rankle',
    titleEn: 'Rankle',
    bodyFr: 'Plusieurs pays vous sont proposés. Classez-les du plus grand au plus petit selon le thème affiché (population, superficie, PIB…).',
    bodyEn: 'You get a handful of countries. Put them in order from highest to lowest for the theme shown (population, area, GDP…).',
    tips: [
      { fr: 'Glissez les pays pour les réordonner.', en: 'Drag the countries to reorder them.' },
      { fr: 'Plus votre ordre est proche du vrai, plus vous marquez.', en: 'The closer your order is to the truth, the more you score.' },
    ],
  },
  streak: {
    icon: Zap,
    accent: PALETTE.sand,
    titleFr: 'Mode Streak',
    titleEn: 'Streak Mode',
    bodyFr: 'Deux pays s’affichent. Choisissez celui qui a la plus grande valeur pour le thème en cours, et enchaînez le plus longtemps possible.',
    bodyEn: 'Two countries appear. Pick the one with the higher value for the current theme, and keep your run going as long as you can.',
    tips: [
      { fr: 'Chaque bonne réponse allonge votre série.', en: 'Each correct answer extends your streak.' },
      { fr: 'Une seule erreur et la partie est terminée.', en: 'A single wrong answer ends the game.' },
    ],
  },
  guess: {
    icon: Info,
    accent: PALETTE.vermilion,
    titleFr: 'Devinez le Pays',
    titleEn: 'Guess the Country',
    bodyFr: 'Un pays mystère se cache. Découvrez des indices (continent, population, drapeau…) et identifiez-le en le moins d’essais possible.',
    bodyEn: 'A mystery country is hidden. Reveal clues (continent, population, flag…) and name it in as few guesses as possible.',
    tips: [
      { fr: 'Chaque mauvais essai dévoile un nouvel indice.', en: 'Each wrong guess reveals a new clue.' },
      { fr: 'Moins vous devinez, plus vous marquez de points.', en: 'The fewer guesses you use, the more you score.' },
    ],
  },
  globe: {
    icon: Globe,
    accent: PALETTE.vermilion,
    titleFr: 'Globe Géo',
    titleEn: 'Geo Globe',
    bodyFr: 'Un nom de pays apparaît. Faites tourner le globe 3D et tapez sur le bon pays pour le localiser.',
    bodyEn: 'A country name appears. Spin the 3D globe and tap the right country to find it.',
    tips: [
      { fr: 'Pivotez et zoomez le globe avec vos doigts.', en: 'Rotate and zoom the globe with your fingers.' },
      { fr: 'Trouvez-le en peu d’essais pour le score maximal.', en: 'Find it in few tries for the highest score.' },
    ],
  },
  regions: {
    icon: Map,
    accent: PALETTE.sand,
    titleFr: 'Défis Pays',
    titleEn: 'Country Challenges',
    bodyFr: 'On vous nomme une région, un état ou une province d’un pays. Placez-la au bon endroit sur la carte.',
    bodyEn: 'You are given a region, state or province of a country. Place it in the right spot on the map.',
    tips: [
      { fr: 'Tapez la zone correspondant au nom affiché.', en: 'Tap the area matching the name shown.' },
      { fr: 'Enchaînez les bonnes réponses pour le score parfait.', en: 'Chain correct answers for a perfect score.' },
    ],
  },
  'quiz-capital': {
    icon: Flag,
    accent: PALETTE.sand,
    titleFr: 'Capitales',
    titleEn: 'Capitals',
    bodyFr: 'Un pays s’affiche : retrouvez sa capitale parmi les propositions.',
    bodyEn: 'A country is shown: pick its capital from the choices.',
    tips: [
      { fr: 'Choisissez la bonne réponse parmi quatre.', en: 'Choose the right answer out of four.' },
      { fr: 'Répondez vite et juste pour grimper au classement.', en: 'Answer fast and right to climb the leaderboard.' },
    ],
  },
  'quiz-flag': {
    icon: Flag,
    accent: PALETTE.vermilion,
    titleFr: 'Drapeaux',
    titleEn: 'Flags',
    bodyFr: 'Un drapeau s’affiche : devinez à quel pays il appartient.',
    bodyEn: 'A flag is shown: guess which country it belongs to.',
    tips: [
      { fr: 'Choisissez le bon pays parmi les propositions.', en: 'Choose the right country from the options.' },
      { fr: 'Rapidité et précision font monter votre score.', en: 'Speed and accuracy push your score up.' },
    ],
  },
  versus: {
    icon: Swords,
    accent: PALETTE.vermilion,
    titleFr: 'Mode Versus',
    titleEn: 'Versus Mode',
    bodyFr: 'Un duel en ligne : vous et votre adversaire répondez à la même série de questions (capitales, drapeaux…). Le meilleur score remporte la manche.',
    bodyEn: 'A live duel: you and your opponent answer the same set of questions (capitals, flags…). The higher score wins the round.',
    tips: [
      { fr: 'Vous jouez les mêmes questions, chacun de son côté.', en: 'You both play the same questions, each on your side.' },
      { fr: 'Visez juste et vite pour battre l’adversaire.', en: 'Be accurate and quick to beat your opponent.' },
    ],
  },
  'local-builder': {
    icon: Monitor,
    accent: PALETTE.oceanBlue,
    titleFr: 'Partie Locale',
    titleEn: 'Local Game',
    bodyFr: 'Construisez votre partie : choisissez les modes et le nombre de manches, puis passez l’appareil de joueur en joueur.',
    bodyEn: 'Build your game: pick the modes and number of rounds, then pass the device from player to player.',
    tips: [
      { fr: 'Chaque joueur joue à tour de rôle sur le même appareil.', en: 'Each player takes a turn on the same device.' },
      { fr: 'Le meilleur score à la fin remporte la partie.', en: 'The best score at the end wins the game.' },
    ],
  },
};
