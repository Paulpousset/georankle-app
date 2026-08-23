# SEO — Audit préalable (Phase 0)

> **État du 23/08/2026, avant travaux.** Ce document est le constat de départ ;
> il est conservé tel quel pour que les mesures « avant » restent lisibles.
> **Ce qui a été livré depuis figure dans [SEO-LIVRAISON.md](SEO-LIVRAISON.md).**
>
> Mesures Lighthouse faites sur la **prod live** (playgeog.com), pas sur un build local.

---

## 1. La stack

**Il n'y a pas de framework de site.** C'est le point structurant de tout le plan.

| Élément | Réalité |
|---|---|
| Framework | Aucun côté site. Le jeu est une app **Expo / React Native Web** (`expo ~54`, `react-native-web`) |
| Build | `npm run build:web` (`expo export --platform web`) puis `node scripts/postbuild-web.mjs` |
| Sortie | `dist/` (gitignoré) |
| Hébergement | Vercel, config dans [vercel.json](vercel.json) |
| Pages du site | **HTML statique écrit à la main** dans [public/](public/), copié tel quel dans `dist/` par l'export Expo |
| Contenu des guides | HTML brut, un `<div>` par section. **Pas de Markdown, pas de MDX, pas de collection, pas de front-matter** |
| CSS du site | [public/guides.css](public/guides.css) (6 Ko) + `<style>` inline dans `landing.html` |
| Templating | **Aucun.** Le `<head>`, le header, le footer et le fil d'Ariane sont dupliqués à la main dans chacune des 15 pages |

### Ce que fait `postbuild-web.mjs`

C'est le seul endroit du dépôt qui ressemble à un pipeline de site :

1. renomme `dist/index.html` (la coquille SPA d'Expo) en `dist/app.html` ;
2. lui injecte un `<head>` complet et un `<noscript>` de repli riche ;
3. installe `public/landing.html` comme `dist/index.html` ;
4. injecte `<script defer src="/site-analytics.js">` dans **toutes** les pages HTML de `dist` sauf `app.html`.

Il est idempotent et échoue bruyamment. **C'est le point d'accroche naturel pour tout
ce que les phases 1 à 4 demandent de générer** (hreflang, JSON-LD, sitemap, header/footer
partagés) — plutôt que d'introduire un framework.

### Conséquence directe sur le plan

Le plan demande à plusieurs reprises un « helper/composant unique » (§1.2 hreflang,
§3.3 maillage, §4 JSON-LD réutilisable). **Rien de tel n'existe et rien ne peut
l'accueillir en l'état.** Avant la phase 1, il faut trancher :

- **(A)** un générateur maison en Node (`scripts/build-site.mjs`) : les pages deviennent des
  fichiers de données + un template JS, rendus au build. ~200 lignes, aucune dépendance,
  s'insère avant `postbuild-web.mjs`. **Recommandé** — c'est proportionné à 15 pages qui
  vont devenir ~80, et ça ne touche pas au build de l'app.
- **(B)** garder le HTML à la main. Tenable pour 15 pages, ingérable pour 6 langues × 36 pages
  (216 fichiers avec chacun 6 balises hreflang à tenir réciproques à la main). À exclure.
- **(C)** introduire Astro/Eleventy à côté d'Expo. Deux builds à composer sur une seule
  sortie Vercel — coût d'intégration réel pour un bénéfice faible ici.

---

## 2. ⚠️ Le jeu n'est PAS traduit en 6 langues

Le brief pose en prémisse que « le jeu est déjà traduit en 6 langues : FR, EN, ES, PT, DE, IT ».
**C'est inexact.** Vérification :

```ts
// src/types/index.ts:9
export type Language = 'fr' | 'en';
```

```ts
// src/i18n/index.ts
export function tr(language: Language, fr: string, en: string): string {
  return language === 'fr' ? fr : en;
}
```

- Toute l'i18n de l'app repose sur ce ternaire `fr`/`en` et sur des paires `{ fr, en }`
  (`LocalizedLabel`). Il n'y a **aucun** fichier de traduction ES/PT/DE/IT dans `src/`.
- Les données de jeu (`assets/game_data.json`, `countries_stats.json`) portent
  `name`/`name_en`, `capital`/`capital_fr`, `display_fr`/`display_en` : **deux langues, pas six**.
- Ce qui existe en 6 langues, ce sont **les fiches des stores** :
  [store-listing/fiche-store-localized.md](store-listing/fiche-store-localized.md)
  (ES / PT-BR / DE / IT) — du texte marketing, jamais chargé par l'app.

**Impact sur la phase 1.** L'ordre d'exécution du plan reste bon, mais la nature du travail change :

| Langue | Coût réel |
|---|---|
| **EN** | Le site est à traduire (rédaction), mais le CTA « Jouer » mène à une app **qui parle déjà anglais**. Le parcours est cohérent de bout en bout. C'est bien le chantier n°1, et il est propre. |
| **ES / PT / DE / IT** | Traduire le site amène un visiteur hispanophone sur une app **en français ou en anglais**. Rebond quasi certain, et signal qualité négatif. Il faut d'abord étendre `Language` à 6 valeurs, traduire l'UI (~toutes les chaînes passent par `tr()`, donc c'est mécanique mais massif), et surtout **traduire les noms de pays et de capitales** dans les données — ce que `build_game_data.py` ne produit pas aujourd'hui. |

**Recommandation** : faire la phase 1 pour EN comme prévu. Avant d'engager ES/PT/DE/IT,
traiter l'i18n de l'app comme un chantier à part entière, et le chiffrer séparément.
Le plan mesure déjà les résultats EN sur 4–6 semaines avant d'aller plus loin (§1.4) —
cette décision tombe naturellement à ce moment-là.

---

## 3. URLs actuellement indexables

15 pages HTML dans `public/`, dont **11 indexables** :

| URL | Fichier | Mots (texte visible) | Dans le sitemap |
|---|---|---|---|
| `/` | [public/landing.html](public/landing.html) | ~3 745 | ✅ |
| `/guides/` | [public/guides/index.html](public/guides/index.html) | ~355 | ✅ |
| `/guides/combien-de-pays-dans-le-monde/` | " | ~1 328 | ✅ |
| `/guides/drapeaux-du-monde/` | " | ~1 233 | ✅ |
| `/guides/capitales-du-monde/` | " | ~1 166 | ✅ |
| `/guides/frontieres-terrestres/` | " | ~1 274 | ✅ |
| `/guides/memoriser-les-drapeaux/` | " | ~1 285 | ✅ |
| `/guides/reviser-la-geographie/` | " | ~1 399 | ✅ |
| `/a-propos/` | " | ~826 | ✅ |
| `/contact/` | " | ~394 | ✅ |
| `/play` (+ `/play/`, `/daily`, `/daily/`) | rewrite → `app.html` | noscript ~180 | ✅ (`/play` seul) |
| `/privacy.html` | " | ~690 | ✅ |

Non indexables ou hors sitemap :
`/404.html` (`noindex`), `/reset-password.html` (`noindex`), `/confirmed.html` (ni canonical
ni noindex, orpheline), `/invite.html` (ni canonical ni noindex, cible des liens de parrainage),
`/app.html` (`Disallow` dans robots.txt).

**Total ≈ 14 500 mots** de contenu réel. Cohérent avec les ~7 000 mots annoncés à la création
des guides : la landing pèse pour un quart du site à elle seule.

### Doublons d'URL constatés en prod

```
/guides   → 200, contenu identique à /guides/   (aucune redirection)
/guides/  → 200
/landing.html → 200, contenu identique à /       (aucune redirection)
```

Vercel ne redirige pas les chemins de répertoire sans slash final, et `landing.html`
reste servi à son emplacement d'origine. **Les deux cas sont neutralisés par le
`canonical`** (qui pointe vers la forme avec slash / vers `/`), donc ce n'est pas urgent —
mais c'est du budget de crawl gaspillé et ça se règle avec deux `redirects` dans `vercel.json`.

⚠️ Piège connu sur ce projet (cf. le fix `62bd68a`) : `"source": "/:path*"` dans `vercel.json`
**perd le slash final**. Toute règle de redirection ajoutée ici doit être vérifiée en prod
sur une URL à slash.

---

## 4. Ce qui existe déjà en JSON-LD

Présent dans 7 pages sur 15. Inventaire exhaustif :

| Type | Où | État |
|---|---|---|
| `SoftwareApplication` | `landing.html` | Complet (`offers`, `inLanguage` 6 langues, `downloadUrl` iOS+Android). **Mais le plan §4 demande `VideoGame`** — plus spécifique, et non exclusif : les deux peuvent coexister ou fusionner via `@type: ["VideoGame","SoftwareApplication"]`. Pas d'`aggregateRating` (correct : rien d'inventé). |
| `FAQPage` | `landing.html` | 3 questions. La FAQ HTML de la page en contient davantage → décalage à combler. |
| `Article` | les 6 guides | **Sans `datePublished` ni `dateModified`.** C'est le manque le plus net : le plan §4 les exige, et ce sont les deux champs qui pèsent le plus pour un contenu éditorial. `author`/`publisher` sont des `Organization` « GeoG » sans `url` ni `logo`. |
| `HowTo` (+ 4 `HowToStep`) | `memoriser-les-drapeaux` | Correct. |
| `BreadcrumbList` | **nulle part** | Alors que le fil d'Ariane **HTML existe déjà** sur les 9 pages de contenu (`<p class="breadcrumb">`). Le plan §4 a raison : c'est du gain gratuit. |
| `WebSite` / `SearchAction` | absent | Correct — il n'y a pas de recherche interne. Ne pas l'ajouter. |
| `ItemList` | absent | À poser sur les tableaux des phases 2 et 3. |

---

## 5. Sitemap, robots, vérification des moteurs

### `public/sitemap.xml` — manuel

- **Écrit à la main**, jamais généré. 12 URLs.
- `lastmod` : **`2026-08-16` en dur sur les 12 entrées**, y compris `/play` déclaré
  `changefreq: daily`. Aucun lien avec la date réelle des fichiers → le signal est faux
  et sera ignoré par Google.
- Aucune balise `<xhtml:link>` (rien à déclarer aujourd'hui, mais rien n'est prévu non plus).
- Ne survivra pas à l'ajout de 30 pages (phases 2 et 3) sans génération automatique.
- ✅ Toutes les pages indexables y sont, et rien d'inutile.

### `public/robots.txt` — sain

```
User-agent: *
Allow: /
Disallow: /app.html
Sitemap: https://playgeog.com/sitemap.xml
```

- Aucun `Disallow` sur `/play` ✅ (le `Disallow: /app.html` ne bloque pas `/play` : c'est
  une réécriture interne, donc une URL distincte du point de vue du crawler).
- Aucun blocage d'assets, aucun blocage d'images ✅.
- Pas de directive spécifique aux crawlers d'images — inutile ici, `Allow: /` couvre tout.
- Vérifié en prod : le fichier servi est bien celui du dépôt.

### Search Console / Bing — non configurés (ou pas depuis ce dépôt)

Recherche exhaustive dans le dépôt : **aucun** fichier `google*.html`, **aucune** balise
`google-site-verification`, **aucun** `msvalidate.01`, **aucune** note de configuration DNS.

La propriété a pu être vérifiée par enregistrement DNS chez Cloudflare (le domaine y est
enregistré, cf. l'historique du projet) — ce qui ne laisserait aucune trace ici. **À confirmer
par Paul directement dans la console**, c'est la seule vérification que le dépôt ne permet pas.

Le plan §5.5 recommande la vérification par **domaine entier** plutôt que par préfixe d'URL :
c'est le bon choix ici, puisque la phase 1 va ajouter des préfixes de chemin.

---

## 6. Cohérence des chiffres (Phase 5.1)

Le plan signale « 197 sur la home, 195 sur `/play` ». La source de vérité tranche :

```
assets/game_data.json      → countries = 195   (+ 41 thèmes)
assets/countries_stats.json → 195 entrées
src/data/continents.ts     → « les 195 pays du pool », Afrique 54 · Asie 47 · Europe 45 · Amériques 35 · Océanie 14
```

**Le jeu contient 195 pays. Les trois occurrences de « 197 » dans `landing.html` sont donc
factuellement fausses**, et pas seulement incohérentes :

- `landing.html:511` — `🚩 197 pays`
- `landing.html:538` — « chacun des 197 drapeaux du monde »
- `landing.html:645` — `<b>197</b> pays`

Le reste du site dit déjà 195 (`a-propos`, `guides/drapeaux-du-monde`, le `noscript` de `/play`),
et [le guide dédié](public/guides/combien-de-pays-dans-le-monde/index.html) explique
explicitement que **GeoG retient 195** (193 membres ONU + 2 observateurs) — la home le contredit
donc frontalement, sur un sujet qui est justement un de nos contenus piliers.

Autres chiffres à centraliser au passage (mêmes symptômes possibles) :
**12 modes** (`a-propos`, `noscript`) — la landing n'en présente que 11 cartes,
et le mode Langues est expédié mais dormant (flag `languages_mode` à `false`) ;
**300 niveaux** du mode Histoire ; **41 thèmes**.

⚠️ Contrainte technique : ces chiffres vivent dans du HTML statique, pas dans un template.
Une « constante unique référencée partout » (règle générale du plan) **suppose l'option (A)
du §1**. Sans générateur, on ne peut que corriger les valeurs à la main — ce qui règle
l'incohérence d'aujourd'hui sans empêcher celle de demain.

---

## 7. Performance / Core Web Vitals (Phase 5.4)

Lighthouse 12, **mobile**, throttling par défaut, sur la prod live.

| | `/` | `/guides/drapeaux-du-monde/` |
|---|---|---|
| **Performance** | **66** | **84** |
| Accessibilité | 94 | 93 |
| Bonnes pratiques | 100 | 100 |
| SEO | 100 | 100 |
| FCP | 3,2 s | 2,7 s |
| **LCP** | **6,0 s** | **3,6 s** |
| TBT | 80 ms | 100 ms |
| CLS | 0,002 | 0 |
| Speed Index | 6,5 s | 3,6 s |
| Poids total | 1 053 Ko | 359 Ko |

### Ce qui coûte, par ordre d'impact

1. **La feuille Google Fonts bloque le rendu : ~780 ms sur les deux pages.**
   L'élément LCP de la home est **le `<h1>` lui-même** — donc le LCP à 6,0 s est
   *directement* causé par l'attente de Playfair Display. `display=swap` est déjà présent,
   `preconnect` aussi : ce qui manque est le **préchargement de la seule police du `<h1>`**
   et un sous-ensemble de caractères. Exactement le diagnostic anticipé au §5.4 du plan.

2. **Les images de la home : ~940 ms (dimensionnement) + 780 ms (format).**
   - `shots/04-globe.png` — 302 Ko, servi en 640×1387 pour un affichage bien plus petit → 213 Ko gaspillés, 271 Ko de plus en WebP/AVIF
   - `shots/08-frontieres.png` — 202 Ko → 143 Ko gaspillés
   - `shots/01-menu-home.png` — 125 Ko → 89 Ko gaspillés
   - **`icon-512.png` — 161 Ko, affiché en 30×30 px dans le header de _toutes_ les pages du site** → 159 Ko gaspillés à chaque vue. C'est le pire rapport coût/bénéfice du site et le plus simple à corriger.

   Bon point déjà acquis : `width`/`height` explicites partout et `loading="lazy"` hors
   première vue → **CLS quasi nul (0,002 et 0)**.

3. **PostHog : ~80 Ko de JS dont ~73 Ko inutilisés sur une page de guide.**
   `array.js` (84 Ko, 46 Ko inutilisés) et surtout **`surveys.js` (33,5 Ko, 27 Ko inutilisés)**
   alors qu'aucun sondage n'est utilisé. `disable_surveys: true` dans
   [public/site-analytics.js](public/site-analytics.js) supprime le second entièrement.

4. ✅ **Le bundle du jeu n'est pas chargé sur les pages de contenu.** La contrainte §5.4
   du plan est déjà respectée par construction : `landing.html` et les guides sont du HTML
   autonome, la SPA vit dans `app.html`. Rien à faire.

5. **Contraste insuffisant** (a11y, sur les deux pages) et **`label-content-name-mismatch`**
   sur la home. Hors périmètre SEO, mais 94/93 sont des scores qu'on peut monter à 100
   pour pas cher, et le plan interdit de toucher au design — donc à traiter séparément,
   avec Paul, puisque ça touche la palette.

---

## 8. Données disponibles pour les phases 2 et 3

Bonne nouvelle : **tout ce que les phases 2 et 3 demandent de tabuler existe déjà**, dans
une source unique et versionnée. Aucune saisie manuelle n'est nécessaire.

[assets/countries_stats.json](assets/countries_stats.json) — 195 entrées :
```
name · name_en · cca3 · capital · capital_fr · region · subregion
lat · lng · coastline · languages_count · borders_count · population · area
```

Couverture des tableaux demandés au §2.2 :

| Page | Donnée | Disponible |
|---|---|---|
| `/quiz-capitales/` | pays → capitale, filtrable par continent | ✅ `capital_fr` + `region` |
| `/jeu-frontieres/` | pays → nombre de voisins | ✅ `borders_count` (+ [src/data/borders.ts](src/data/borders.ts) pour la liste nominative) |
| `/globe-3d/` | pays par continent | ✅ `region` |
| `/jeu-drapeaux/` | les 195 drapeaux | ✅ via `getFlagUrl()` → `https://flagcdn.com/w160/{cca2}.png`. ⚠️ **CDN externe** : 195 images tierces sur une page. Prévoir `loading="lazy"` + `width`/`height`, ou rapatrier les fichiers. |
| `/plus-ou-moins-pays/` | population / superficie | ✅ `population`, `area` |
| `/rankle/` | les 41 thèmes de classement | ✅ `game_data.json` + [src/i18n/themeDescriptions.ts](src/i18n/themeDescriptions.ts) |

### ⚠️ Découpage par continent (phase 3)

Le plan demande **6 continents**, dont « Amérique du Nord » et « Amérique du Sud » séparées.
Les données en comptent **5** : les Amériques sont un seul bloc (35 pays).

```
Afrique 54 · Asie 47 · Europe 45 · Amériques 35 · Océanie 14
```

Le champ `subregion` permet de trancher proprement — c'est une décision éditoriale, pas technique :

```
Americas / North America      3
Americas / Central America    7
Americas / Caribbean         13
Americas / South America     12
```

Le découpage francophone usuel range Amérique centrale et Caraïbes dans l'Amérique du Nord
(→ 23 / 12). À valider avec Paul avant d'écrire les pages. Ne **pas** modifier
[src/data/continents.ts](src/data/continents.ts) pour autant : les 5 continents y sont un
**périmètre de jeu** (le mode solo « choix du continent »), pas une taxonomie éditoriale.
Un pays qui changerait de zone modifierait des tirages de jeu.

### Deep links par mode (§2.3) — à ouvrir en ticket séparé

[src/lib/webEntry.ts](src/lib/webEntry.ts) ne reconnaît que `/play`, `/daily` et `?play=daily` :

```ts
export type WebIntent = { screen: 'daily' } | null;
```

Les paramètres d'URL existants sont `?code=` / `?ref=` (parrainage) et `?league=` (ligue) —
**il n'y a pas de `?mode=`**. Les CTA des 12 pages de mode mèneront donc tous vers le défi
du jour tant que ce n'est pas ajouté. C'est ~20 lignes dans `webEntry.ts` + le branchement
dans le routeur, mais ça touche l'app, pas le site : conformément au plan, **la phase 2 ne
doit pas attendre**.

---

## 9. Synthèse des contraintes techniques

| # | Contrainte | Bloque |
|---|---|---|
| **C1** | **Aucun moteur de template.** Header, footer, `<head>`, fil d'Ariane dupliqués à la main dans 15 fichiers. | Phases 1, 2, 3, 4 — toute notion de « helper unique » |
| **C2** | **L'app ne parle que FR et EN.** `Language = 'fr' \| 'en'`, données bilingues. | Phase 1 pour ES / PT / DE / IT (EN reste faisable et propre) |
| **C3** | **Sitemap écrit à la main**, `lastmod` en dur. | Phase 5.2, et toute phase qui ajoute des URLs |
| **C4** | **Aucun chiffre centralisé.** 195 / 197 / 12 modes / 300 niveaux en dur dans le HTML. | Phase 5.1 + la règle générale du plan |
| **C5** | **Pas de `?mode=`** dans l'entrée web. | §2.3 (ticket séparé, non bloquant) |
| **C6** | Vercel : `/:path*` **perd le slash final** (piège déjà rencontré, fix `62bd68a`). | Toute redirection ou règle de routage ajoutée |
| **C7** | Les drapeaux viennent d'un **CDN tiers** (`flagcdn.com`). | §2.2, page drapeaux (195 requêtes externes) |
| **C8** | Les Amériques sont **un seul continent** dans les données. | Phase 3, arbitrage éditorial requis |
| **C9** | Vérification GSC / Bing **non traçable depuis le dépôt**. | Phase 5.5, à confirmer hors code |

---

## 10. Écarts avec le plan, à arbitrer avant la phase 1

1. **Les 6 langues du jeu n'existent pas** (§2 ci-dessus). Le plan repose dessus pour justifier
   ES/PT/DE/IT. EN est confirmé comme chantier n°1 ; le reste demande d'abord d'internationaliser
   l'app.
2. **« Un helper/composant unique » suppose un générateur** (§1 ci-dessus). Décision à prendre
   en amont de la phase 1, sinon les phases 1 à 4 produiront exactement la duplication que
   le plan cherche à éviter.
3. **`197` n'est pas une incohérence, c'est une erreur.** La valeur juste est 195, et notre
   propre guide pilier le documente. À corriger dans les quick wins, comme prévu.
4. **6 continents demandés, 5 dans les données** (§8 ci-dessus). Arbitrage éditorial.
5. **`SoftwareApplication` existe déjà** là où le plan demande `VideoGame`. Ce n'est pas un
   remplacement obligatoire — à décider en phase 4.
6. **Le déploiement web est en retard sur le dépôt.** Plusieurs chantiers récents (échelle UI
   desktop, refonte Rankle web) sont notés « web pas redéployé ». Les mesures ci-dessus portent
   sur ce qui est **réellement en ligne**, ce qui est le bon référentiel SEO — mais il faut
   savoir que `dist` local et prod peuvent diverger.

---

## 11. Prochaine étape

Le plan enchaîne sur **Phase 5.1 + 5.2 + 5.3 + 5.5** (quick wins, une session). L'audit confirme
que c'est le bon ordre, avec un ajustement :

- **5.1** — remplacer les 3 occurrences de `197` par `195` dans `landing.html`. Immédiat.
- **5.2** — générer le sitemap au build (`lastmod` = `mtime` du fichier source). C'est aussi
  le plus petit prétexte utile pour poser la brique **(A)** du §1 et la valider avant la phase 1.
- **5.3** — `robots.txt` est déjà sain, **rien à faire**. Éventuellement, deux `redirects` pour
  les doublons `/guides` et `/landing.html`.
- **5.5** — hors code : à confirmer par Paul dans Search Console.
- **Bonus à coût quasi nul**, mesuré ci-dessus et non listé au plan : redimensionner
  `icon-512.png` (−159 Ko sur **chaque** page du site) et passer `disable_surveys: true`
  dans `site-analytics.js` (−27 Ko de JS inutilisé). Les deux relèvent de 5.4 mais tiennent
  dans la même session.
