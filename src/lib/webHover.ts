/**
 * Survol à la souris — le retour visuel qui manquait au web sur ordinateur.
 *
 * Le jeu est dessiné pour le doigt : un bouton ne réagit qu'au `press` (l'opacité
 * que descend TouchableOpacity). À la souris, ça donne une interface morte —
 * rien ne s'allume au passage du curseur, on ne sait pas ce qui est cliquable
 * avant d'avoir cliqué.
 *
 * Comme pour l'agrandissement desktop (voir lib/uiScale.ts), on refuse de
 * repasser sur les ~350 `TouchableOpacity` de l'app pour leur coller un
 * `onHoverIn` : on pose UNE feuille de style qui vise ce que react-native-web
 * marque déjà comme cliquable. RNW donne à tout Touchable/Pressable ACTIF (et
 * seulement à eux : un bouton `disabled` ne l'a pas) une classe atomique pour
 * `cursor: pointer` — c'est notre sélecteur, gratuit et exhaustif.
 *
 * Trois garde-fous :
 *  - `@media (hover: hover) and (pointer: fine)` : rien de tout ça n'existe sur
 *    téléphone ou tablette, où un « survol » collerait au dernier élément touché ;
 *  - la teinte du survol dépend du thème (`--rk-hover-brightness`, posée par
 *    WebHoverStyles) : on éclaircit les cartes nuit, on assombrit le parchemin —
 *    dans les deux cas le bouton se détache PLUS du fond ;
 *  - un `:has()` empêche la carte parente de s'allumer en même temps que le
 *    petit bouton « ? » qu'elle contient : seul l'élément le plus intérieur
 *    réagit (navigateur sans `:has()` : les deux s'allument, sans gravité).
 */
import { Platform } from 'react-native';

/** `id` de la balise <style> injectée (une seule, réutilisée). */
export const HOVER_STYLE_ID = 'rk-hover-styles';

/** Variable CSS portant le facteur de luminosité du survol, suivie au thème. */
export const HOVER_BRIGHTNESS_VAR = '--rk-hover-brightness';

/**
 * Classes atomiques de react-native-web pour `cursor: pointer`. Le hachage
 * (1loqt21) est dérivé du couple propriété/valeur, donc stable d'une version à
 * l'autre — mais RNW garde le nom de la propriété en développement et le
 * supprime une fois minifié, d'où les deux formes. Ce n'est qu'un repli :
 * WebHoverStyles lit d'abord la classe dans la feuille réellement produite.
 */
export const POINTER_CLASSES = ['r-1loqt21', 'r-cursor-1loqt21'];

/** Attribut posé par {@link hoverLift} sur les éléments à effet renforcé. */
export const LIFT_ATTR = 'data-hover';

/**
 * Facteur de luminosité appliqué au survol.
 *
 * Nuit : les cartes (#132040) sont plus claires que le fond (#0a1628), on
 * éclaircit. Jour : les cartes (#e8d9b8) sont plus sombres que le parchemin
 * (#f2e8d0), on assombrit. Volontairement discret — 350 boutons qui clignotent
 * fatiguent vite.
 */
export function hoverBrightness(isDarkMode: boolean): string {
  return isDarkMode ? '1.25' : '0.92';
}

/**
 * La feuille de style du survol, pour les classes « cliquables » données. Pure —
 * testée unitairement.
 */
export function buildHoverCss(pointerClasses: string[]): string {
  // Un sélecteur composé : `:is()` garde les règles lisibles quand la classe
  // détectée et son repli cohabitent.
  const hot = `:is(${pointerClasses.map((c) => `.${c}`).join(', ')})`;
  const lift = `[${LIFT_ATTR}='lift']`;
  return `
@media (hover: hover) and (pointer: fine) {
  ${hot}, ${lift} {
    /* !important : TouchableOpacity pose sa durée de transition en style INLINE
       (0s au repos), qui gagnerait sinon sur toute règle de feuille. On garde
       'opacity' dans la liste pour ne pas casser son fondu au clic. */
    transition-property: filter, opacity !important;
    transition-duration: 120ms !important;
    transition-timing-function: ease-out !important;
  }
  ${hot}:hover, ${lift}:hover {
    filter: brightness(var(${HOVER_BRIGHTNESS_VAR}, 1.25));
  }
  ${lift} {
    transition-property: filter, opacity, transform, box-shadow !important;
  }
  ${lift}:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
  }
  /* Le survol appartient au plus petit élément cliquable sous le curseur : une
     carte dont on survole le bouton « ? » ne s'allume pas, elle. */
  ${hot}:has(${hot}:hover), ${lift}:has(${hot}:hover) {
    filter: none;
    transform: none;
    box-shadow: none;
  }
  /* Un contrôle désactivé garde l'air désactivé (RNW retire déjà le curseur
     pointer aux Touchables disabled, ceci couvre les états ARIA). */
  [aria-disabled='true'] {
    filter: none !important;
    transform: none !important;
  }
}
`.trim();
}

/**
 * Props à étaler sur un élément qui mérite plus qu'un changement de teinte :
 * il se soulève de 2 px avec une ombre portée. Réservé aux grandes tuiles du
 * menu, où le geste « la carte vient vers moi » se lit ; sur une ligne de liste
 * pleine largeur, ça ne ferait que du bruit.
 *
 * Inerte hors web : `dataSet` n'a aucun sens sur natif, on ne l'y envoie pas.
 */
export const hoverLift: { dataSet?: { hover: string } } =
  Platform.OS === 'web' ? { dataSet: { hover: 'lift' } } : {};
