/**
 * "How to play" copy shown the first time a player opens each game mode.
 *
 * One entry per playable GameMode (the `menu` pseudo-mode has none). Icons and
 * accent colours mirror the mode cards on the main menu so the popup feels like
 * a continuation of the card the player just tapped. `tips` are the 2-3 rules
 * that actually matter, rendered as a short checklist under the blurb.
 */
import type { ComponentType } from 'react';
import { Flag, Globe, Info, LayoutGrid, Map, Monitor, Puzzle, Route, Swords, TrendingUp, Zap } from 'lucide-react-native';

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
    bodyFr: 'On vous présente 8 pays, un par un, et 8 thèmes (population, superficie, PIB…). Pour chaque pays, choisissez le thème où il se classe le mieux — là où son rang est le plus proche de la 1ʳᵉ place.',
    bodyEn: 'You’re shown 8 countries, one at a time, and 8 themes (population, area, GDP…). For each country, pick the theme where it ranks best — closest to the No. 1 spot.',
    tips: [
      { fr: 'Pour le pays affiché, tapez le thème qui lui correspond le mieux.', en: 'For the country shown, tap the theme that fits it best.' },
      { fr: 'Chaque thème ne sert qu’une fois : répartissez les 8 pays sur les 8 thèmes.', en: 'Each theme is used only once: spread the 8 countries across the 8 themes.' },
      { fr: 'À la fin, votre total est comparé au placement optimal : visez 100 % d’efficacité.', en: 'At the end, your total is compared to the optimal placement — aim for 100% efficiency.' },
    ],
  },
  streak: {
    icon: Zap,
    accent: PALETTE.sand,
    titleFr: 'Mode Streak',
    titleEn: 'Streak Mode',
    bodyFr: 'Un pays s’affiche avec 4 thèmes (population, superficie, PIB…). Choisissez le thème où ce pays est le mieux classé — le plus proche de la 1ʳᵉ place — et enchaînez le plus longtemps possible.',
    bodyEn: 'A country appears with 4 themes (population, area, GDP…). Pick the theme where that country ranks best — closest to No. 1 — and keep your run going as long as you can.',
    tips: [
      { fr: 'Tapez le thème où le pays affiché se classe le mieux.', en: 'Tap the theme where the shown country ranks best.' },
      { fr: 'Chaque bonne réponse allonge votre série.', en: 'Each correct answer extends your streak.' },
      { fr: 'Une seule erreur et la partie s’arrête : visez la plus longue série !', en: 'A single mistake ends the game — go for the longest streak!' },
    ],
  },
  higherlower: {
    icon: TrendingUp,
    accent: PALETTE.chartBlue,
    titleFr: 'Plus ou Moins',
    titleEn: 'Higher or Lower',
    bodyFr: 'Deux pays, un thème (population, tourisme, PIB…) : tapez celui qui est au-dessus. Le gagnant reste, un nouveau pays arrive, et la chaîne continue jusqu’à la première erreur.',
    bodyEn: 'Two countries, one theme (population, tourism, GDP…): tap the higher one. A new country steps in each round, and the chain runs until your first mistake.',
    tips: [
      { fr: 'Tapez le pays qui a la valeur la plus élevée sur le thème affiché.', en: 'Tap the country with the higher value on the shown theme.' },
      { fr: 'Le thème change à chaque question — restez attentif !', en: 'The theme changes every question — stay sharp!' },
      { fr: 'Une seule erreur met fin à la série : visez la plus longue chaîne !', en: 'One mistake ends the run — go for the longest chain!' },
    ],
  },
  silhouette: {
    icon: Puzzle,
    accent: PALETTE.forestGreen,
    titleFr: 'Silhouette',
    titleEn: 'Silhouette',
    bodyFr: 'La forme d’un pays s’affiche, sans nom ni frontières voisines. Choisissez votre difficulté à chaque question — DUO (2 choix), CARRÉ (4 choix) ou CASH (à écrire) — pour marquer plus de points.',
    bodyEn: 'A country’s outline appears with no name and no neighbours. Pick a difficulty each question — DUO (2 options), CARRÉ (4 options) or CASH (type it) — to score more.',
    tips: [
      { fr: 'Observez les côtes, les péninsules et les îles : ce sont les meilleurs indices.', en: 'Look at coastlines, peninsulas and islands — they are the best clues.' },
      { fr: 'DUO = 1 pt, CARRÉ = 3 pts, CASH = 5 pts : plus c’est risqué, plus ça rapporte.', en: 'DUO = 1 pt, CARRÉ = 3 pts, CASH = 5 pts: the riskier the call, the bigger the reward.' },
      { fr: 'Les mauvaises réponses viennent souvent du même continent : méfiez-vous des voisins !', en: 'Wrong options often come from the same continent — beware of neighbours!' },
    ],
  },
  borders: {
    icon: Route,
    accent: PALETTE.sand,
    titleFr: 'Frontières',
    titleEn: 'Borders',
    bodyFr: 'Deux pays s’affichent : reliez-les en tapant des pays voisins, frontière après frontière. Chaque pays proposé doit toucher le dernier de votre chaîne. Moins d’étapes = plus de points !',
    bodyEn: 'Two countries appear: link them by typing neighbouring countries, border after border. Each guess must touch the last country in your chain. Fewer steps = more points!',
    tips: [
      { fr: 'Le globe met en surbrillance votre chaîne : pivotez et zoomez pour repérer les voisins.', en: 'The globe highlights your chain: rotate and zoom to spot the neighbours.' },
      { fr: 'Chaque pays saisi doit partager une frontière terrestre avec le dernier de la chaîne.', en: 'Each typed country must share a land border with the last one in the chain.' },
      { fr: 'Un pays non voisin coûte une vie (3 vies par trajet) : réfléchissez bien, on ne peut pas revenir en arrière.', en: 'A non-neighbouring country costs a life (3 lives per route): think it through — you can’t undo a step.' },
    ],
  },
  guess: {
    icon: Info,
    accent: PALETTE.vermilion,
    titleFr: 'Devinez le Pays',
    titleEn: 'Guess the Country',
    bodyFr: 'Un pays mystère est caché. À chaque essai, vous proposez un pays et le jeu vous montre ce qui le rapproche de la cible : bon continent, distance et direction, population, superficie… Identifiez-le en le moins d’essais possible.',
    bodyEn: 'A mystery country is hidden. With each try you name a country and the game shows how it compares to the target: right continent, distance and direction, population, area… Identify it in as few guesses as possible.',
    tips: [
      { fr: 'Tapez un pays pour proposer une réponse.', en: 'Tap a country to make a guess.' },
      { fr: 'Chaque essai révèle des indices (continent, distance, direction…) vers le pays mystère.', en: 'Each guess reveals clues (continent, distance, direction…) toward the mystery country.' },
      { fr: 'Moins vous faites d’essais, plus vous marquez de points.', en: 'The fewer guesses you use, the more points you score.' },
    ],
  },
  globe: {
    icon: Globe,
    accent: PALETTE.vermilion,
    titleFr: 'Globe Géo',
    titleEn: 'Geo Globe',
    bodyFr: 'Un nom de pays s’affiche. Faites tourner le globe 3D et tapez sur le bon pays pour le localiser.',
    bodyEn: 'A country name appears. Spin the 3D globe and tap the right country to find it.',
    tips: [
      { fr: 'Faites pivoter le globe avec un doigt, zoomez avec deux.', en: 'Rotate the globe with one finger, zoom with two.' },
      { fr: 'Tapez le pays demandé le plus précisément possible.', en: 'Tap the requested country as precisely as you can.' },
      { fr: 'Trouvez-le vite et juste pour le score maximal.', en: 'Find it quickly and accurately for the highest score.' },
    ],
  },
  regions: {
    icon: Map,
    accent: PALETTE.sand,
    titleFr: 'Défis Pays',
    titleEn: 'Country Challenges',
    bodyFr: 'On vous nomme une région, un état ou une province (départements français, états américains…). Placez-la au bon endroit sur la carte.',
    bodyEn: 'You are named a region, state or province (French departments, US states…). Place it in the right spot on the map.',
    tips: [
      { fr: 'Tapez la zone de la carte qui correspond au nom affiché.', en: 'Tap the map area that matches the name shown.' },
      { fr: 'Zoomez et déplacez la carte pour viser juste.', en: 'Zoom and pan the map to aim precisely.' },
      { fr: 'Enchaînez les bonnes réponses pour un score parfait.', en: 'Chain correct answers for a perfect score.' },
    ],
  },
  'quiz-capital': {
    icon: Flag,
    accent: PALETTE.sand,
    titleFr: 'Capitales',
    titleEn: 'Capitals',
    bodyFr: 'Un pays s’affiche : retrouvez sa capitale parmi quatre propositions.',
    bodyEn: 'A country is shown: find its capital among four choices.',
    tips: [
      { fr: 'Tapez la réponse que vous pensez correcte.', en: 'Tap the answer you think is correct.' },
      { fr: 'Répondez vite : la rapidité compte dans le score.', en: 'Answer fast — speed counts toward your score.' },
      { fr: 'Une bonne série de réponses fait grimper votre total.', en: 'A good run of answers pushes your total up.' },
    ],
  },
  'quiz-flag': {
    icon: Flag,
    accent: PALETTE.vermilion,
    titleFr: 'Drapeaux',
    titleEn: 'Flags',
    bodyFr: 'Un drapeau s’affiche : devinez à quel pays il appartient, parmi les propositions.',
    bodyEn: 'A flag is shown: guess which country it belongs to, from the options.',
    tips: [
      { fr: 'Tapez le pays qui correspond au drapeau.', en: 'Tap the country that matches the flag.' },
      { fr: 'Observez bien les couleurs et les symboles.', en: 'Look closely at the colors and symbols.' },
      { fr: 'Rapidité et précision augmentent votre score.', en: 'Speed and accuracy raise your score.' },
    ],
  },
  versus: {
    icon: Swords,
    accent: PALETTE.vermilion,
    titleFr: 'Mode Versus',
    titleEn: 'Versus Mode',
    bodyFr: 'Un duel en ligne : vous et votre adversaire répondez aux mêmes questions (capitales, drapeaux…), chacun de votre côté. Le meilleur score remporte la manche.',
    bodyEn: 'A live duel: you and your opponent answer the same questions (capitals, flags…), each on your side. The higher score wins the round.',
    tips: [
      { fr: 'Vous jouez exactement les mêmes questions que l’adversaire.', en: 'You play exactly the same questions as your opponent.' },
      { fr: 'Répondez juste et vite pour prendre l’avantage.', en: 'Answer accurately and quickly to gain the edge.' },
      { fr: 'Remportez le plus de manches pour gagner le duel.', en: 'Win the most rounds to win the duel.' },
    ],
  },
  'local-builder': {
    icon: Monitor,
    accent: PALETTE.oceanBlue,
    titleFr: 'Partie Locale',
    titleEn: 'Local Game',
    bodyFr: 'Construisez votre partie à plusieurs : choisissez les jeux et le nombre de manches, puis passez le téléphone de joueur en joueur.',
    bodyEn: 'Build a game for several players: pick the games and the number of rounds, then pass the phone from player to player.',
    tips: [
      { fr: 'Sélectionnez un ou plusieurs modes pour composer la partie.', en: 'Select one or more modes to build the game.' },
      { fr: 'Chaque joueur joue à tour de rôle sur le même téléphone.', en: 'Each player takes a turn on the same phone.' },
      { fr: 'Le meilleur score total à la fin remporte la partie.', en: 'The best total score at the end wins.' },
    ],
  },
};
