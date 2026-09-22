# Journal de croissance

> Tenu par les Routines Claude (voir `PLAN_PROMOTION.md`, niveau A5). Chaque
> entrée est datée ; les plus récentes en haut. Les chiffres viennent de
> PostHog quand la clé est disponible, sinon de ce qui est mesurable sans elle.

## File d'attente éditoriale (Routine « Contenu SEO »)

Les sujets, par ordre de priorité. La Routine prend les deux premiers non
cochés chaque lundi, les écrit en FR et EN (≥ 600 mots originaux, un tableau
propre, une FAQ, un bouton « Jouer » vers le mode concerné), puis les coche.

**Règle absolue : jamais de page mince.** Le site a perdu 196 pages générées
quasi vides après cinq refus AdSense (commit `aa5e5be`). Une page qui ne peut
pas être écrite sérieusement n'est pas publiée.

- [ ] Quiz capitales d'Europe — les 44 capitales, pièges (Suisse, Pays-Bas, Australie hors périmètre), méthode de mémorisation par blocs
- [ ] Les drapeaux les plus difficiles du monde — lesquels, pourquoi (paires, tricolores), comment les distinguer
- [ ] Classement des pays par population — le top 30 avec les chiffres du jeu, ce qui change d'ici 2050
- [ ] Classement des pays par superficie — top 30, les surprises (Kazakhstan, Algérie, RDC)
- [ ] Pays les plus petits du monde — micro-États et leur histoire, lien vers le guide micro-États
- [ ] Capitales d'Afrique — 54 pays, les capitales qui ne sont pas la plus grande ville
- [ ] Capitales d'Asie — 48 pays, les capitales déplacées (Nur-Sultan/Astana, Naypyidaw, Nusantara)
- [ ] Capitales d'Amérique du Sud — 12 pays, Sucre/La Paz, Brasília
- [ ] Drapeaux d'Afrique — couleurs panafricaines, comment reconnaître les familles
- [ ] Drapeaux nordiques — la croix scandinave et ses variantes
- [ ] Combien de pays en Europe — le débat (44 à 51), la liste du jeu
- [ ] Pays qui ont deux capitales (ou plus) — Bolivie, Afrique du Sud, Pays-Bas, Malaisie…
- [ ] Le jeu du globe : apprendre à situer les pays d'Asie centrale
- [ ] Frontières : les pays qui touchent le plus de voisins (Chine, Russie, Brésil)
- [ ] Devinez le pays : comment lire les indices (superficie, population, PIB) comme un géographe

### Fiches pays (195, à raison de 10 à 20 par semaine)

Non commencées. La première semaine construit le gabarit (`site/lib/routes.mjs`
kind `country`, URL `/pays/<slug>/` et `/en/country/<slug>/`, données lues dans
`assets/countries_stats.json`, tableau des voisins, drapeau, capitale, bouton
« Jouer » vers Devinez le pays) puis livre les 10 premières, par ordre de
population décroissante. Chaque fiche porte 200 à 400 mots ORIGINAUX par
langue ; un garde-fou dans `site/lib/validate.mjs` refuse toute fiche sous le
seuil.

## Entrées

### 2026-09-22 — mise en place

- Infrastructure : EAS Update (mise à jour à chaud du JS), workflows
  `release.yml`, `eas-update.yml`, `migrate.yml`.
- A1 : « Défier un ami » sur toutes les fins de partie solo ; relance
  parrainage (après 3 parties, une fois par semaine) ; `daily_completed` porte
  `streak` et `signed_in` ; le bonus de série est tracé sur le chemin de
  synchronisation aussi.
- A2 : notification « série en danger » (20 h locales ou 3 h avant minuit UTC) ;
  bonus de retour après 7 jours (30 pièces, RPC `claim_comeback`) ; demande de
  note après une victoire en classé ; deux campagnes push (absents 14 j,
  jamais joué en ligne).
- A3 : Smart App Banner iOS et cartes Twitter sur `/play` ; bouton
  « Installer l'app » sur les fins de partie web.
- À mesurer dès la semaine prochaine : `solo_shared / game_completed`,
  `referral_shared` par `source`, `install_cta_pressed`, `comeback_granted`.
