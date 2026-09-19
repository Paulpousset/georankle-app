# Plan — migration des visuels 3D vers la charte « Cartoon HD »

Rédigé le 19/09/2026 en fin de session, pour la session suivante. Paul a validé
la direction sur planches (« les visuels sont excellents »). Ce document est la
source de vérité du chantier : lis-le en entier avant de toucher au code.

## 0. Où on en est

> **Avancement (19/09/2026, session suivante) :** Phases 0 à 3 FAITES —
> 4 commits d'assainissement, rig migré (ToonHD + 5 lumières + EEVEE, pack de
> 112 couches et 53 GLB régénérés), 5 articles remodelés (+ astéroïdes ronds,
> volcans/calottes grossis), scène live (`toonHdSource.ts` partagé par
> `buildAvatarHtml.ts` ET `buildEarthHtml.ts` : profil, boutique, Globe Géo,
> Point sur le Globe, Frontières, Régions, menu) avec bloom vendorisé.
> Périmètre élargi par Paul : le globe de jeu 3D est INCLUS (charte appliquée
> à l'océan, à la couche de continents éclairée à 55 %, aux skins et aux props).
> Reste : validation de Paul sur la page avant/après, sons, ship.

### Décision artistique (validée)

La DA « pro cartoon » du 24/07 (cel-shading en émission pure, bandes dures,
contours épais, aucune lumière réelle) est **abandonnée** : Paul la trouve
« trop simple, trop faite main ». Une v1 réaliste/PBR (Blender Cycles, textures
NASA) a été **refusée** (« pas assez cartoon »). La v2 **Cartoon HD** est
**validée** : registre Fortnite / Pixar.

La recette exacte, telle que rendue et validée :

- formes rondes, **aucun contour noir** (les coques `_ol` du rig sont masquées) ;
- ombrage **à trois bandes douces** (Diffuse → Shader‑to‑RGB → ColorRamp EASE :
  0.06 → teinte ombre `#3a3f8a`, 0.26 → gris 0.62, 0.42 → blanc, 0.9 → 1.12)
  qui **garde les vraies ombres portées** ;
- point **spéculaire net** (Glossy → Shader‑to‑RGB → seuil EASE 0.35–0.6, force 0.45) ;
- **contre‑jour** (Layer Weight facing^3.5 × cyan `#7fe8ff` × 0.55) ;
- éclairage studio 5 lumières (area) : clé chaude `#fff1d6` (−35°, 32°),
  remplissage `#9ec7ff` (60°, −8°), rim droit cyan `#66f0ff` (150°, 25°),
  rim gauche violet `#c66bff` (−150°, 15°), plafonnier blanc (0°, 82°) ;
- continents **en relief** (globe_land.glb) avec la **texture du style** projetée
  (arctan2 en espace objet), arêtes adoucies (Bevel node 0.025) ;
- **nuages en volumes** (grappes de 3–5 sphères, r 0.05–0.11, écrasées 0.7 en Y)
  sur les styles « vivants » seulement (classic, pastel, gaia, satellite, political, vintage) ;
- atmosphère = coquille r 1.035, émission cyan facing^6 × 3 ;
- **bloom** (compositeur Glare « Bloom », seuil 1.0, force 0.3 ; 0.5 pour les
  anneaux lumineux) ;
- styles sombres (night, eclipse, lava, cyber, hologram, biolum, st_fractured,
  st_galaxy) : texture **auto‑éclairée** (émissif 0.9) pour rester lisibles ;
- fond monde : dégradé violet `#1a0f4a` → marine `#0c2a66`, étoiles Voronoi
  douces ; vue `Standard` (pas AgX : il désature le cartoon).

Références visuelles à garder sous les yeux :
`~/rankle/cartoon_hd_propositions.html` (héros + 4 planches de 10 articles) et
`https://claude.ai/artifact/LEiYsgVn9u84idnVPSZXQ6`. Les rendus source sont dans
le scratchpad de l'ancienne session (`…/scratchpad/hifi/c/out/*.png`), à
considérer comme perdus : **tout se régénère avec les scripts ci‑dessous**.

### Scripts de la preuve de concept (dans le dépôt, non commités)

- `asset-pipeline/poc_cartoon.py` — la recette complète, Blender 5.2 headless,
  EEVEE. `--item globe:<style> | emblem:<id> | sat:<id> | orbit:<id> | hero:x`.
  Contient : matériau `toon_hd(...)`, projection `style_texture_socket(...)`,
  `restyle_glb(...)` (masque les coques, applique la couleur `ggHex`), nuages,
  atmosphère, lumières `studio_lights(...)`, `bloom(...)` (API compositeur
  Blender 5), caméra rig + gros plans emblèmes/satellites.
- `asset-pipeline/poc_cartoon_sheets.mjs` — planches contact (sharp), 5 colonnes.
- `asset-pipeline/poc_hifi.py` — la v1 refusée (Cycles/PBR). À garder comme
  référence pour les styles « photo » éventuels, ne pas repartir dessus.

Commande type :
```
/Applications/Blender.app/Contents/MacOS/Blender -b -P asset-pipeline/poc_cartoon.py -- --item globe:lava --res 480 --samples 40 --out /tmp/x.png
```
(`blender` n'est pas dans le PATH ; Blender 5.2 LTS ; GPU Metal OK.)

### État du dépôt (87 fichiers modifiés, RIEN n'est commité)

Trois chantiers indépendants sont mélangés dans l'arbre de travail. Les
séparer en trois commits avant toute chose (voir Phase 0) :

1. **Mode « Point sur le Globe » (pinpoint)** — session du 17/09 matin :
   `src/lib/pinpoint.ts`, `src/screens/PinpointGame.tsx`, `pinpoint_mode.sql`
   (déjà APPLIQUÉ en prod), `src/lib/__tests__/pinpoint.test.ts`, plus les
   retouches de modes/ligue/daily/i18n qui vont avec (bot.ts, league.ts,
   daily.ts, score.ts, share.ts, soloScope.ts, MainMenu, Router, catalogues…).
   Voir la mémoire `pinpoint-mode`.
2. **Vitrine du profil** (validée par Paul) :
   `src/components/ProfileHero.tsx`, `EquippedChips.tsx`, `ChallengeModeSheet.tsx`,
   `AvatarPreview3D.tsx` (props width/height), `src/lib/profileHint.ts` (+ test),
   `src/data/cosmetics.ts` (`getEquippedParts`, + test), `Profile.tsx`,
   `PlayerProfile.tsx` (bug corrigé : le profil des autres montrait l'ancien
   globe SVG), `Router.tsx`, `useNavigationStack.ts` (`shop.itemId`,
   `matchmaking.inviteFriendId/inviteUsername`), `Matchmaking.tsx` (invitation
   directe « Envoyer le défi »), `Shop.tsx` (`initialItemId`),
   `analyticsEvents.ts` (`player_challenge_started`), 12 clés i18n traduites
   dans les 14 catalogues, `src/components/ResultGrid.tsx` (d'une session
   antérieure, clé `{0} correct out of {1}` traduite au passage).
3. **Globe de la carte Histoire** : prop `transparent` sur `WorldAvatar.tsx` et
   `WorldAvatar3D.tsx` (+ test), `StoryMap.tsx` (`PLAYER_GLOBE_FRAME` 88 px,
   `TOP_PAD` 124, copie de la bande art du palier 1 au‑dessus, bannière 200 px).

Tests : 968 verts (`npx jest`), `npx tsc --noEmit` propre, lint sans erreur.
Vérifié sur build web (Playwright, compte démo) : profil, profil d'un autre,
feuille Défier, matchmaking en invitation, boutique sur article, ordinateur, carte Histoire.

## 1. Objectif de la prochaine session

Migrer **tout le catalogue 3D** (20 globes, 13 orbites, 15 satellites,
19 emblèmes) et la **scène live three.js** vers la charte Cartoon HD, avec
parité pack/live, sans régression de perf, et une planche avant/après validée
par Paul à chaque étape. Estimation donnée à Paul : ≈ 6,5 jours.

Règle de travail de Paul : **propositions visuelles d'abord**, il dit oui/non.
Donc : à chaque phase, une planche (image) avant de basculer le pack.

## 2. Phases

### Phase 0 — Assainir (½ h)

1. `git status` → trois commits séparés (pinpoint / vitrine profil / globe Histoire),
   messages en français, sans pousser tant que Paul ne le demande pas.
   Attribution : `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
2. Relancer `npx jest` et `npx tsc --noEmit` après chaque commit.
3. Ajouter `poc_cartoon.py` et `poc_cartoon_sheets.mjs` dans un 4e commit
   « asset‑pipeline : preuve de concept Cartoon HD ».

### Phase 1 — Le matériau et les lumières dans le rig (≈ 2 j)

But : le pack pré‑rendu (`assets/cosmetics/*.webp`, 112 couches) ressemble aux planches.

Fichiers : `asset-pipeline/rigbuild/common.py`, `render_layers.py`, `rig.json`,
`README.md`, `qa_sheets.mjs`.

1. **Matériau** : dans `common.py`, remplacer `toon_material` (émission pure à
   paliers, direction de lumière cuite) par le `toon_hd` de `poc_cartoon.py`
   (Shader‑to‑RGB → EEVEE obligatoire). Garder la signature et les extras
   `ggKind`/`ggHex` : `export_glb.py` et `remapMaterials` côté three.js en dépendent.
   `outline_material` : ne plus le générer, ou marquer `hide_render` sur les
   coques `_ol` (les GLB exportés doivent aussi ne plus contenir de coque,
   sinon la scène live les affiche).
2. **Lumières** : les 3 lumières de `rig.json` deviennent les 5 area lights de
   la recette ; mettre à jour `rig.json` (azimuts, élévations, couleurs,
   puissances, tailles) — c'est la source de vérité partagée avec three.js.
3. **Moteur** : `render_layers.py` passe de Cycles à `BLENDER_EEVEE`
   (`taa_render_samples` 64, `use_shadows`, `use_raytracing`, `use_fast_gi`),
   film transparent conservé. Vérifier que Shader‑to‑RGB + émission composent
   bien sur alpha (couches empilées dans `WorldAvatar3D`). Le bloom ne se cuit
   **pas** dans les couches (il déborderait sur l'alpha) : il vit dans la scène live.
4. **Couches** : nuages et atmosphère sont de nouvelles couches du globe
   (les intégrer dans `globe_<style>.webp` est le plus simple : le satellite et
   les anneaux passent devant/derrière comme aujourd'hui). Les continents en
   relief remplacent la sphère texturée dans la passe globe.
5. **Vue** : `Standard`, pas AgX. Saturation +20 % sur les textures de style
   (déjà dans `style_texture_socket`).
6. **Boucle** : `blender -b -P rigbuild/dev_render.py -- --item <id>` pour
   itérer, puis `build_all.py` → `render_layers.py --ids all` → `convert.mjs`
   → `npm run manifest` → `npm run check`. Planche : `node qa_sheets.mjs <DOSSIER_DESTINATION>`
   (⚠️ l'argument est la **destination**, pas la source ; ne jamais passer `../assets/cosmetics`).
7. **Livrable** : planche avant/après des 4 catégories → oui/non de Paul avant
   de remplacer `assets/cosmetics`.

### Phase 2 — Remodeler les cinq articles faibles (≈ 2 j)

Le matériau ne suffit pas pour : **lucioles** (blobs → cœurs nets + halo),
**anneau glacé** (éclats plats → prismes hexagonaux sur anneau givré),
**lauriers** (tirets → vraies feuilles par paires + ruban), **couronne**
(minuscule → ×2,5, or à joyaux, ombre de contact), **cristaux de glace**
(pics hors silhouette → arrondis, à l'intérieur). Plus, dans le registre
cartoon : grossir les props (volcans, calottes), arrondir les astéroïdes.

Fichiers : `rigbuild/builders_orbits.py`, `builders_globes.py`. Un builder par
article, `dev_render.py` pour itérer, GLB réexportés (`export_glb.py`) pour la
scène live. Planche avant/après → validation.

### Phase 3 — La scène live three.js (≈ 2 j)

Fichier : `src/lib/avatar3d/buildAvatarHtml.ts` (≈ 1000 lignes de JS inline),
`src/vendor/threeSource.ts` (three r180 vendorisé, **sans** EffectComposer ni
UnrealBloomPass), `src/data/cosmeticModels.gen.ts`.

1. **Shader toon HD** : remplacer `MeshToonMaterial` + `GRAD` (3 valeurs dures)
   par un `ShaderMaterial` maison ou `MeshToonMaterial.onBeforeCompile` :
   NdotL → smoothstep à 3 bandes douces (mêmes positions que la ColorRamp),
   teinte d'ombre `#3a3f8a`, point spéculaire seuillé, rim fresnel cyan.
   Les ombres portées (emblème sur le globe) : `castShadow`/`receiveShadow`
   avec une seule lumière à ombre (la clé) pour rester léger.
2. **Lumières** : lire les 5 lumières depuis `rig.json` (parité), supprimer
   `LIGHT_SCALE` (c'était la cause de la « perte d'éclat » signalée par Paul :
   la scène live était volontairement plus terne que le pack Blender).
3. **Bloom** : vendoriser `EffectComposer` + `UnrealBloomPass` (≈ 30 Ko) via
   `vendor-three.mjs`, ou bloom maison (rendu émissif sur RT basse résolution
   + flou séparable additif). Seuil 1.0, force 0.3.
4. **Nuages** : instanciation de sphères (`InstancedMesh`) avec la même graine
   que Blender (seed 11) pour que placeholder et live coïncident ; atmosphère =
   coquille fresnel déjà présente (à recolorer).
5. **Continents** : `globe_land.glb` déjà chargé (landModel) ; appliquer la
   texture du style par la même projection (UV = arctan2/asin en espace objet)
   ou par les UV du GLB si elles existent.
6. **Parité** : `AvatarPreview3D` fond la scène live sur le placeholder
   `WorldAvatar3D` ; les deux doivent être superposables (même caméra, mêmes
   lumières, même orientation `defaultFace` lat 15 / lng 10).
7. **Perf** : mesurer sur un Android d'entrée de gamme et sur web ordinateur ;
   garder le repli « couches pré‑rendues » (déjà le comportement quand la scène
   n'est pas prête). Le drapeau `avatar_3d` reste le coupe‑circuit.

### Phase 4 — Vignettes, QA, livraison (≈ ½ j)

1. Passe **vignettes 26–44 px** (listes, amis, classement, carte Histoire) :
   contraste et lisibilité du pack à petite taille ; si besoin une variante
   `_thumb` plus contrastée dans le manifeste.
2. `npm run check` (asset‑pipeline), `npx jest`, build web + captures Playwright
   (script de l'ancienne session : login démo `demo.video@geogames.app` /
   mot de passe dans `scripts/audit.mjs`, serveur `npx serve dist -l 5577`,
   Playwright à `/Users/paulpousset/.npm/_npx/e41f203b7505f1fb/node_modules/playwright`).
3. Page **avant/après** pour Paul (même gabarit parchemin que les pages de
   propositions) → validation → commit → ship (voir mémoire `ship-v5-6-0`
   pour la procédure web/Android/iOS).

### Hors périmètre (à ne pas ouvrir sans Paul)

Le globe de jeu 3D (`buildEarthHtml.ts`, modes Globe / Point sur le Globe / Frontières),
la carte Histoire (déjà cartoon, cohérente), les icônes de rang (`RankGlobe`).

## 3. Pièges appris (ne pas les repayer)

- **Axes glTF** : après import Blender, « haut » glTF (+Y) devient +Z local et
  la face avant est −Y local. Pour la caméra du rig (+Z vers la caméra, +Y haut) :
  `UP_FIX = Rot(−90°, X)` sur l'objet, puis l'inclinaison des anneaux (22° X).
  Les GLB du rig **ne** contiennent **pas** l'inclinaison.
- **Projection de texture** en espace objet : `u = atan2(x, −y)/2π + 0.5`,
  `v = asin(z)/π + 0.5` (après `UP_FIX`). Sphère UV Blender : appliquer aussi `UP_FIX`.
- Les **nuages livrés** (`assets/textures/earth_clouds_1k.webp`) sont blancs
  avec la couverture dans l'**alpha** : lire `Alpha`, pas `Color`.
- **Blender 5.2** : compositeur = `scene.compositing_node_group` (node group
  `CompositorNodeTree` + `NodeGroupOutput`), Glare : `inputs['Type'] = 'Bloom'`.
  `scene.eevee` n'a plus `use_bloom` ni `use_gtao`. `BLENDER_EEVEE` = EEVEE Next.
  `Material.use_nodes` déprécié (avertissement seulement).
- **Shader‑to‑RGB** n'existe qu'en EEVEE : pas de Cycles pour la charte.
- `qa_sheets.mjs <arg>` : l'argument est la **destination** (source figée =
  `asset-pipeline/out`). Une planche écrite dans `assets/cosmetics` casserait `check`.
- Le **MCP Blender** est configuré pour le dossier `georankle-app` seulement,
  et le README interdit d'éditer `avatar_rig.blend` à la main ou via MCP :
  tout passe par `rigbuild/*.py` + Blender headless.
- Les textures three.js (`earth_specular_2048.jpg`, `earth_normal_2048.jpg`,
  `earth_lights_2048.png`) téléchargées pour la v1 sont dans le scratchpad
  perdu ; URLs dans `fetch_textures.mjs`. Inutiles pour Cartoon HD.
- `Metro` ignore un `.web.tsx` créé après démarrage (`--clear`). `useUiScale` :
  px de mise en page ≠ px CSS sur web ordinateur.

## 4. Questions ouvertes pour Paul (à poser en début de session)

1. Nuages : sur quels styles exactement ? (proposé : classic, pastel, gaia,
   satellite, political, vintage ; aucun sur les planètes minérales et sombres.)
2. Bloom : uniquement dans la scène live (recommandé), ou aussi cuit dans les
   couches des anneaux lumineux ?
3. Les coques de contour disparaissent partout (recommandé) ou restent sur les
   vignettes < 30 px pour la lisibilité ?
4. Ordre de livraison : tout d'un bloc, ou d'abord globes + orbites (visibles
   au profil), puis satellites + emblèmes ?
5. Faut‑il livrer la vitrine du profil et le globe Histoire (déjà prêts) dans
   une v5.7.0 avant la migration 3D, ou tout ensemble ?

## 5. Aide‑mémoire commandes

```
# tests / types / lint
cd ~/rankle/georankle-app && npx jest && npx tsc --noEmit && npx eslint src

# rendu d'un article en Cartoon HD (preuve de concept)
/Applications/Blender.app/Contents/MacOS/Blender -b -P asset-pipeline/poc_cartoon.py -- --item orbit:fire --res 480 --samples 40 --out /tmp/fire.png

# planches contact de la preuve de concept (attend les PNG dans …/c/out, adapter DIR dans le script)
node asset-pipeline/poc_cartoon_sheets.mjs

# pipeline officiel du rig
cd asset-pipeline && npm run ids
blender -b -P rigbuild/dev_render.py -- --item emblem_eiffel --with-globe --out /tmp/x.png
blender -b -P rigbuild/build_all.py
blender -b avatar_rig.blend -P render_layers.py -- --ids all --out ./out
node convert.mjs --dir ./out ../assets/cosmetics && npm run manifest && npm run check
node qa_sheets.mjs /tmp/qa      # planches du pack (destination !)

# vérification web
npm run build:web && npx serve dist -l 5577   # puis Playwright (voir scripts/audit.mjs)
```

## 6. Fichiers à lire en premier

1. Ce plan, puis `asset-pipeline/README.md` (pipeline, conventions du rig).
2. `asset-pipeline/poc_cartoon.py` (la recette validée, à porter).
3. `asset-pipeline/rigbuild/common.py` (matériaux actuels à remplacer),
   `render_layers.py`, `rig.json`.
4. `src/lib/avatar3d/buildAvatarHtml.ts` (scène live), `src/components/WorldAvatar3D.tsx`
   (composition des couches), `src/components/AvatarPreview3D.tsx` (fondu placeholder → live).
5. Mémoires : `cosmetics-3d-rework-audit`, `profile-globe-showcase`,
   `visuals-3d-overhaul`, `icon-proposal-workflow`.
