# Vidéos réseaux sociaux — tournage automatique de l'app native

> Objectif : sortir chaque semaine des shorts TikTok / Reels / Shorts filmés sur
> **la vraie app mobile**, sans tenir le téléphone, pour faire venir des joueurs
> sur iOS et Android.

## Pourquoi ce dossier

L'ancien pipeline (`~/rankle/videos-pub/video-pipeline`, hors dépôt) filme le
**build web** dans Playwright avec un viewport de téléphone. Ça se voit : pas de
barre d'état, polices et animations du navigateur, globe en WebGL du web. Pour
une campagne qui vend l'app mobile, il faut des images de l'app mobile.

Ce dossier filme l'app native dans un simulateur iOS ou un émulateur Android,
pilotée par [Maestro](https://maestro.dev), puis la monte en vidéo verticale
avec [Remotion](https://www.remotion.dev).

```
build EAS « recording »  →  flows Maestro  →  out/raw/*.mp4
                                                   │
                     hooks.json  →  plan.mjs  →  out/episodes/*.json
                                                   │
                                  render.mjs  →  out/final/*.mp4 + *.txt
```

## Les pièces

| Pièce | Rôle |
|---|---|
| `src/lib/recordingMode.ts` (app) | Mode tournage, actif seulement dans le build `recording` : pas de tutoriel, pas de popup de règles, pas de pub, pas de demande de note. Les réponses portent un testID `rec-correct` / `rec-wrong`. |
| `eas.json` → profil `recording` | Build simulateur iOS + APK Android, canal EAS `recording` (jamais touché par les mises à jour OTA de production), sans clés PostHog ni Sentry : les parties filmées ne faussent pas les chiffres. |
| `maestro/*.yaml` | Un flow = une vidéo. Il lance l'app, choisit la langue, entre dans le mode, **démarre l'enregistrement sur la première question**, joue une partie écrite d'avance (N bonnes réponses, puis une erreur pour la chute), garde l'écran de fin à l'image. Pause « réflexion » entre deux taps pour que ça ne fasse pas robot. |
| `record.sh` | Barre d'état propre (9:41, batterie pleine), puis chaque flow dans chaque langue. |
| `hooks.json` | Accroches, sous-titres, appel à l'action et texte de publication, par flow et par langue. |
| `composer/` | Projet Remotion. `plan.mjs` fait une fiche de montage par vidéo et par accroche, `render.mjs` sort un MP4 1080×1920 H.264 et le texte à coller sous la vidéo. |
| `.github/workflows/social-video.yml` | Tout le circuit Android dans GitHub Actions, déclenché à la main ; les shorts arrivent en artefact du run. |

## Flows disponibles

| Flow | Ce qu'on voit | Variables utiles |
|---|---|---|
| `higher-lower` | « Plus ou Moins » : série de bonnes réponses puis la chute | `STREAK` (8), `FAIL` (1), `THINK_MS` (1300) |
| `flags` | 6 drapeaux en CARRÉ, sans faute | `ROUNDS` (6), `FAIL` (0) |
| `capitals` | 6 capitales en CARRÉ, sans faute | `ROUNDS` (6), `FAIL` (0) |

⚠️ Ces flows ont été écrits à partir du code des écrans ; ils n'ont pas encore
tourné sur un appareil. Le premier passage sur le Mac servira à ajuster les
sélecteurs (voir « Avec Claude Code » plus bas, c'est fait pour ça).

## Sur le Mac (iOS, la meilleure image)

Une fois :

```bash
curl -fsSL https://get.maestro.mobile.dev | bash   # Maestro
eas build --platform ios --profile recording        # build simulateur (~15 min sur EAS)
```

Télécharger le `.tar.gz` depuis expo.dev, l'extraire, puis :

```bash
xcrun simctl boot "iPhone 16 Pro"
open -a Simulator
xcrun simctl install booted GeoG.app
```

Ensuite, à chaque fournée :

```bash
./social-video/record.sh ios                       # tous les flows, fr + en
LANGS="fr en es" ./social-video/record.sh ios flags
cd social-video/composer && npm ci
node plan.mjs --variants 2                         # 2 accroches par vidéo
node render.mjs                                    # → social-video/out/final/
npm run studio                                     # retoucher un montage à l'œil
```

Sans passer par EAS : `EXPO_PUBLIC_RECORDING_MODE=1 npx expo run:ios --configuration Release`.

## Dans GitHub Actions (Android, sans le Mac)

Actions → « Vidéos réseaux sociaux » → Run workflow. Le build `recording`
existant est réutilisé ; cocher « rebuild » après un changement d'écran.
L'émulateur tourne en rendu logiciel : l'image est bonne pour les modes 2D
(Plus ou Moins, Drapeaux, Capitales), moins pour le globe 3D, qu'il vaut mieux
filmer sur le Mac.

## Avec Claude Code : piloter l'app par MCP

Maestro embarque un serveur MCP. Sur le Mac, une fois :

```bash
claude mcp add maestro -- maestro mcp
```

Claude Code voit alors le simulateur : il lit la hiérarchie de l'écran, tape,
fait des captures et lance des flows. C'est la façon la plus rapide de :

- **corriger un flow** qui casse après un changement d'écran (« lance
  higher-lower.yaml, regarde où il bloque, corrige le sélecteur ») ;
- **écrire un nouveau flow** en jouant le mode une fois avec lui, puis en
  figeant les étapes en YAML ;
- **tourner une idée de vidéo** sur demande (« filme une partie de Silhouette où
  je trouve en 2 essais »).

Autres serveurs MCP utiles pour le mobile, si Maestro ne suffit pas :
[mobile-mcp](https://github.com/mobile-next/mobile-mcp) (iOS et Android, vrais
appareils compris) et [XcodeBuildMCP](https://github.com/cameroncooke/XcodeBuildMCP)
(builds Xcode et simulateurs).

## Ajouter un mode

1. Dans l'écran du mode, mettre `testID={recAnswerId(estLaBonneRéponse)}` sur
   chaque réponse (`src/lib/recordingMode.ts`). Hors build `recording`, la
   valeur est `undefined` : rien ne change pour les joueurs.
2. Copier `maestro/higher-lower.yaml`, changer `MODE_TITLE` et la boucle.
3. Ajouter ses accroches dans `hooks.json` (au moins `fr` et `en`).

## Ce qui reste manuel, exprès

- **Publier.** Les shorts et leur texte sont prêts ; c'est toi qui postes, avec
  un son tendance ajouté dans TikTok / Instagram (le montage est muet pour ça :
  un son du moment porte plus qu'une musique figée). La publication automatique
  est possible ensuite (YouTube Data API pour les Shorts, Instagram Graph API
  pour les Reels d'un compte pro ; l'API TikTok exige un audit de l'app avant de
  publier en public), mais seulement une fois qu'on sait quelles accroches
  marchent.
- **Juger.** Comparer les vues des deux accroches d'une même vidéo, garder les
  gagnantes dans `hooks.json`, retirer les autres.
