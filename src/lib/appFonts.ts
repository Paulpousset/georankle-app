/**
 * Quelles polices charger, selon l'écriture de la langue.
 *
 * Space Mono et Playfair Display font l'identité graphique du jeu, mais elles
 * s'arrêtent au latin étendu : ni cyrillique, ni grec, ni thaï. Une interface
 * russe rendue dans Space Mono, c'est au mieux des carrés vides.
 *
 * La parade tient en une ligne : **ce qui n'est pas enregistré retombe sur la
 * police système**. iOS comme Android rendent une `fontFamily` inconnue avec la
 * police par défaut de l'appareil, qui couvre, elle, toutes les écritures. On ne
 * charge donc que ce qui sait écrire la langue :
 *
 *   - latin           → Space Mono + Playfair Display, le jeu tel qu'il est dessiné ;
 *   - cyrillique      → Playfair Display seule (elle couvre le cyrillique), le
 *                       corps de texte passe en police système ;
 *   - grec, thaï      → aucune, tout en police système.
 *
 * ⚠️ Le choix se fait **au démarrage**, à partir de la langue mémorisée. Changer
 * de langue en cours de session recharge les polices au mieux, mais un moteur
 * natif peut garder la police déjà enregistrée jusqu'au prochain lancement :
 * c'est le seul cas où l'affichage attend un redémarrage.
 */
import {
  PlayfairDisplay_700Bold,
  PlayfairDisplay_900Black,
} from '@expo-google-fonts/playfair-display';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { LOCALES } from '../i18n/locales';
import type { Language } from '../types';

/** Les polices à enregistrer pour cette langue. */
export function fontMapFor(language: Language): Record<string, number> {
  const { script } = LOCALES[language];
  if (script === 'latin') {
    return {
      PlayfairDisplay_700Bold,
      PlayfairDisplay_900Black,
      SpaceMono_400Regular,
      SpaceMono_700Bold,
    };
  }
  if (script === 'cyrillic') {
    return { PlayfairDisplay_700Bold, PlayfairDisplay_900Black };
  }
  return {};
}

/** Deux langues partagent-elles la même écriture — donc les mêmes polices ? */
export function sameScript(a: Language, b: Language): boolean {
  return LOCALES[a].script === LOCALES[b].script;
}
