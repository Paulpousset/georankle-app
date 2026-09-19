# asset-pipeline — production des visuels 3D (cosmétiques, textures, three.js)

> **Direction artistique (Paul, 19/09/2026) : CARTOON HD — registre Fortnite / Pixar.**
> Formes rondes SANS contour, ombrage à trois bandes douces qui garde les vraies
> ombres portées (Diffuse → Shader-to-RGB → ColorRamp EASE, EEVEE), point
> spéculaire net, contre-jour cyan, 5 area lights studio (`rig.json` lights),
> continents en relief portant la texture du style, nuages en volumes, atmosphère,
> styles sombres auto-éclairés. Le bloom vit dans les scènes live (jamais cuit
> dans les couches). La scène three.js (`src/lib/globe3d/toonHdSource.ts`) porte
> le même shader depuis les mêmes tables (`rig.json` `toon` + `lights`).
> La preuve de concept validée est `poc_cartoon.py` ; l'ancienne DA « pro
> cartoon » (émission à paliers, contours épais) est abandonnée.

Chaîne hors-app : rien ici n'est bundlé par Metro/EAS. Les sorties versionnées
sont `src/vendor/threeSource.ts`, `src/data/cosmeticLayers.gen.ts`,
`assets/cosmetics/*.webp`, `assets/textures/*.webp`.

## Installation (une fois)

```bash
cd asset-pipeline && npm install
```

Pour la partie Blender (rendu des cosmétiques) :

```bash
brew install --cask blender     # Blender 5.2 LTS (EEVEE Next) — /Applications/Blender.app/Contents/MacOS/Blender
brew install uv
# Addon MCP : télécharger addon.py depuis https://github.com/ahujasid/blender-mcp,
# Blender > Édition > Préférences > Add-ons > Installer, cocher "Interface: Blender MCP",
# puis sidebar (N) > onglet BlenderMCP > Connect to Claude.
claude mcp add blender -- uvx blender-mcp
```

Monuments par IA (optionnel) : clé API Meshy (https://meshy.ai) ou Tripo, avec
crédits payants — sinon modélisation directe via MCP (pyramides, ponts, tours…).

## Commandes

| Commande | Effet |
|---|---|
| `npm run vendor:three` | three.js → `src/vendor/threeSource.ts` (IIFE minifié, offline) |
| `npm run textures` | Télécharge/convertit les textures Terre → `assets/textures/` + CREDITS.md |
| `npm run ids` | Catalogue TS → `ids.json` (consommé par rigbuild + render_layers.py) |
| `blender -b -P rigbuild/build_all.py` | Reconstruit TOUT `avatar_rig.blend` depuis le code |
| `node gen_cosmos_textures.mjs` | Fonds cosmos 2D → `out/cosmos_*.png` |
| `blender -b avatar_rig.blend -P render_layers.py -- --ids all --out ./out` | Rendu batch PNG des couches |
| `node convert.mjs --dir ./out ../assets/cosmetics` | PNG → WebP q80 |
| `npm run manifest` | Régénère `src/data/cosmeticLayers.gen.ts` (require map Metro) |
| `npm run check` | QA : ids catalogue ↔ fichiers (branché dans ship.sh) |
| `node qa_sheets.mjs <dossier>` | Planches contact QA composites (par catégorie + combos) |

## rigbuild/ — la source de vérité du rig (refonte 25/07/2026)

`avatar_rig.blend` est GÉNÉRÉ par `rigbuild/build_all.py` : ne pas l'éditer à la
main (ni via MCP), toute retouche passe par le code Python.

- `rigbuild/common.py` : matériau `toon_hd` (Cartoon HD : Diffuse → Shader-to-RGB
  → rampe EASE 3 bandes × couleur + glossy seuillé + rim, paramètres dans
  `rig.json` `toon`), `toon_material`/`flat_material` conservent leur signature
  (un flat dont le nom évoque une lumière — flame, neon, fly, gem… — devient
  émissif > 1 → bloom en live ; les autres deviennent des toons simples),
  `add_outline`/`outline_all` ne créent PLUS de coque (no-op), `studio_lights`
  (5 area lights, ajoutées au rendu, jamais sauvées dans le .blend),
  `studio_world`, `setup_render` (EEVEE Next, vue Standard, film transparent),
  primitives bmesh (lathe/torus à arcs, strut, ngon_prism…), plant/ombre/holdout.
- `rigbuild/builders_globes.py` : océan + continents extrudés texturés (UV /
  projection espace objet), nuages en volumes (styles de `rig.json`
  `toon.clouds.styles`, graine partagée avec three.js via un Mersenne Twister
  compatible Python), coquille d'atmosphère, props par style.
- Moteur : **EEVEE obligatoire** (Shader-to-RGB n'existe pas en Cycles).
- `rigbuild/builders_{emblems,sats,orbits,globes}.py` : un builder par item.
- Orbites : anneau construit entier puis COUPÉ au plan y=0 en `<id>__back` /
  `<id>__front` (léger recouvrement anti-couture) — l'arc arrière est
  réellement rendu, contrairement à l'ancien pipeline.
- Emblèmes : passe composite (planté lat 52 + ombre de contact + holdout) puis
  passe sprite (`<id>_sprite.png`, monument droit, cadrage auto) pour le
  billboard cylindrique de la preview live.
- Boucle de dev : `blender -b -P rigbuild/dev_render.py -- --item emblem_eiffel
  [--zoom] [--upright] [--with-globe] --out /tmp/x.png`.
- Piège (historique, sans objet depuis Cartoon HD) : un élément posé sur une
  surface devait dépasser l'épaisseur de la coque de contour de son support.
- Blender 5.2 : `scene.compositing_node_group` pour le compositeur, `Material.use_nodes`
  déprécié (avertissement), `BLENDER_EEVEE` = EEVEE Next, le nœud Bevel est ignoré.

## Flux complet après ajout d'un cosmétique au catalogue

1. Ajouter l'item dans `src/data/cosmetics.ts` (comme avant).
2. `npm run ids`, puis écrire son builder dans `rigbuild/builders_<cat>.py`
   (itérer avec `rigbuild/dev_render.py`), et `blender -b -P rigbuild/build_all.py`.
3. Rendu batch + convert + manifest (commandes ci-dessus).
4. `npm run check` doit passer — sinon le build refuse de shipper.

## Conventions du rig (résumé — détail en tête de render_layers.py)

- `rig.json` est LA source de vérité caméra/lumières/anneaux, partagée avec les
  scènes three.js (`src/lib/avatar3d/buildAvatarHtml.ts`) pour que preview live
  et couches pré-rendues restent superposables.
- Collections nommées comme les ids ; `HoldoutSphere` pour l'occlusion ;
  anneaux en deux passes `_back`/`_front` (holdout puis clip arrière).
- Sorties : 512×512 RGBA (256 pour les satellites), fond transparent ; le fond
  monde (`toon.world`) n'est pas rendu mais éclaire l'ambiance.
- Pas de rendu pour `*_none` ni `cosmos_bluenight` (reste procédural, teintable).

## Licences

- Textures NASA : domaine public. three.js : MIT. Solar System Scope : CC BY 4.0
  (attribution dans `assets/textures/CREDITS.md`).
- Monuments générés : consigner la source/licence de chaque modèle dans
  `monuments/SOURCES.md` avant tout ship.
