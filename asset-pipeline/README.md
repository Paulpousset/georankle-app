# asset-pipeline — production des visuels 3D (cosmétiques, textures, three.js)

> **Direction artistique (Paul, 24/07/2026) : PRO CARTOON, pas photoréaliste.**
> Rig Blender = matériaux toon/cel-shading (Shader to RGB / ColorRamp à paliers,
> contours épais type Freestyle/inverted-hull, couleurs saturées), cohérents avec
> le rendu three.js in-app (MeshToonMaterial, halo côtier blanc, contours foncés).
> Les textures NASA restent dispo pour un éventuel cosmétique « photo » premium.

Chaîne hors-app : rien ici n'est bundlé par Metro/EAS. Les sorties versionnées
sont `src/vendor/threeSource.ts`, `src/data/cosmeticLayers.gen.ts`,
`assets/cosmetics/*.webp`, `assets/textures/*.webp`.

## Installation (une fois)

```bash
cd asset-pipeline && npm install
```

Pour la partie Blender (rendu des cosmétiques) :

```bash
brew install --cask blender     # Blender 4.x
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

- `rigbuild/common.py` : matériaux toon émission pure (bandes ColorRamp CONSTANT,
  direction de lumière cuite depuis rig.json → rendu identique Cycles/EEVEE,
  vue `Standard` obligatoire), contours = copie gonflée le long des normales +
  matériau backfacing-only (fiable en Cycles, contrairement à Solidify),
  primitives bmesh (lathe/torus à arcs, strut, ngon_prism…), plant/ombre/holdout.
- `rigbuild/builders_{emblems,sats,orbits,globes}.py` : un builder par item.
- Orbites : anneau construit entier puis COUPÉ au plan y=0 en `<id>__back` /
  `<id>__front` (léger recouvrement anti-couture) — l'arc arrière est
  réellement rendu, contrairement à l'ancien pipeline.
- Emblèmes : passe composite (planté lat 52 + ombre de contact + holdout) puis
  passe sprite (`<id>_sprite.png`, monument droit, cadrage auto) pour le
  billboard cylindrique de la preview live.
- Boucle de dev : `blender -b -P rigbuild/dev_render.py -- --item emblem_eiffel
  [--zoom] [--upright] [--with-globe] --out /tmp/x.png`.
- Piège appris : tout élément posé sur une surface doit dépasser l'épaisseur du
  contour de son support, sinon la coque le masque (cadran Big Ben, neige Fuji).

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
- Sorties : 512×512 RGBA (256 pour les satellites), fond transparent.
- Pas de rendu pour `*_none` ni `cosmos_bluenight` (reste procédural, teintable).

## Licences

- Textures NASA : domaine public. three.js : MIT. Solar System Scope : CC BY 4.0
  (attribution dans `assets/textures/CREDITS.md`).
- Monuments générés : consigner la source/licence de chaque modèle dans
  `monuments/SOURCES.md` avant tout ship.
