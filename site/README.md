# `site/` — le site public de playgeog.com

Le générateur des pages publiques (`/`, `/guides/…`, les pages de mode) et leur
contenu. Il tourne **après** `expo export --platform web`, écrit dans `dist/`,
et remplace l'ancien `scripts/postbuild-web.mjs`.

```
npm run build:web && npm run build:site   # = ce que fait Vercel
npm run site:check                        # rend tout en mémoire et valide, sans dist
```

## Pourquoi un générateur

Le site était quinze pages de HTML écrites à la main, avec le `<head>`, la
barre de navigation, le fil d'Ariane et le pied de page recopiés dans chacune.
Il en compte aujourd'hui **96, dans deux langues à parité, avec des `hreflang`
réciproques**. Le copier-coller n'était plus tenable, et une erreur de
réciprocité est silencieuse : elle annule le bénéfice du bloc entier sans
jamais rien casser visiblement.

## Structure

| Chemin | Rôle |
|---|---|
| `build.mjs` | Point d'entrée. Habille la coquille Expo (`/play`), rend les pages, écrit sitemap et robots, valide. `--check` fait tout en mémoire. |
| `lib/routes.mjs` | **La table des URL.** Source unique des `hreflang`, du `canonical`, du sélecteur de langue, du sitemap et des liens internes. |
| `lib/constants.mjs` | Les chiffres affichés (195 pays, 41 thèmes, 300 niveaux, 12 modes), **dérivés des sources du jeu**, jamais saisis. |
| `lib/tables.mjs` | Les tableaux de référence générés depuis `assets/` : drapeaux, capitales, voisins, superficies, sous-régions… |
| `lib/layout.mjs` | Le gabarit unique : `<head>`, nav, fil d'Ariane, pied de page. |
| `lib/jsonld.mjs` | `VideoGame`, `Article`, `FAQPage`, `BreadcrumbList`, `ItemList`. |
| `lib/validate.mjs` | Réciprocité des `hreflang`, canonicals, titres dupliqués, liens morts, ressources statiques absentes. Fait échouer le build. |
| `content/<langue>/<route>.html` | Le contenu : un entête `clé: valeur`, puis le corps HTML. |
| `tools/sync-home-en.mjs` | Régénère l'accueil anglais depuis le français. |

## Écrire une page

1. déclarer la route dans `lib/routes.mjs` ;
2. créer `content/<langue>/<id>.html` avec au minimum `title`, `description`
   et `modified` (`published` en plus pour un guide) ;
3. `npm run site:check`.

### Les directives disponibles dans un fragment

```
{{countries}} {{themes}} {{modes}} {{storyLevels}}   les chiffres du jeu
{{link:guide-flags}}                                 l'URL d'une route, dans la langue de la page
{{play}} · {{play:mode-globe}}                       le lien de jeu, mode présélectionné
{{table:capitals:europe}}                            un tableau de référence
{{count:oceanie}}                                    le nombre de pays d'un continent
{{t:readNext}}                                       un texte d'habillage traduit
{{langswitch}} · {{langswitch:foot}}                 le sélecteur de langue
```

Une directive inconnue **arrête le build** : mieux vaut un déploiement raté
qu'une page publiée avec `{{countries}}` en toutes lettres.

## Deux règles à ne pas casser

- **Le français reste à la racine.** Pas de préfixe `/fr/`, pas de redirection
  des URL françaises existantes.
- **Une langue absente n'apparaît pas dans les alternates.** Un `hreflang` vers
  une 404 annule le bénéfice de tout le bloc. `routes.mjs` s'en charge, et
  `validate.mjs` le vérifie.

## Ce que le site ne fait pas

Il n'y a **pas de redirection automatique** sur `Accept-Language` ni sur l'IP.
Googlebot explore depuis les États-Unis : une redirection l'enfermerait dans la
version anglaise et les autres ne seraient jamais indexées. Le choix de la
langue passe par de vrais liens, dans la barre de navigation et le pied de page.
