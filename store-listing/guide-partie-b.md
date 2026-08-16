# GeoG — Ta partie du travail (navigateur, ~45 min + review Google)

Tout ce qui suit se fait dans un navigateur avec ton compte Google. Les fichiers dont tu as besoin sont prêts :

| Quoi | Où |
|---|---|
| App bundle à uploader | `.aab` (chemin donné par Claude après le build production) |
| Icône 512×512 | `georankle-app/store-listing/icon-512.png` |
| Feature graphic | `georankle-app/store-listing/feature-graphic-1024x500.png` |
| Screenshots | `georankle-app/store-screenshots/` (+ `ipad-13/` pour tablette) |
| Textes FR/EN à coller | `georankle-app/store-listing/fiche-store.md` |
| Réponses questionnaires | `georankle-app/store-listing/questionnaires.md` |

---

## Étape 1 — Créer l'app dans la Play Console (~5 min)

1. https://play.google.com/console → **Créer une application**
2. Nom : `GeoG` · Langue par défaut : `Français (France)` · **Jeu** · **Gratuit**
3. Coche les deux déclarations (règles + lois d'exportation US) → Créer
4. ⚠️ Regarde le tableau de bord : si un bandeau parle d'une **exigence de test fermé (12 testeurs pendant 14 jours)**, préviens Claude — ça change le calendrier mais pas la méthode.

## Étape 2 — Premier upload manuel du .aab (~5 min)

> Obligatoire une seule fois : Google refuse le tout premier upload via l'API. Ensuite, tout est automatisé côté Claude.

1. Menu **Tests > Tests internes** → **Créer une release**
2. Signature : accepte **la signature d'application gérée par Google** (recommandé)
3. Glisse le fichier `.aab` → nom de release auto → **Enregistrer** puis **Examiner la release** → **Déployer**
4. Onglet **Testeurs** : crée une liste avec **ton propre e-mail** → enregistre → copie le **lien d'inscription** et ouvre-le sur ton/un téléphone Android pour installer l'app.

## Étape 3 — Remplir la fiche et les questionnaires (~20 min)

1. **Croissance > Fiche principale du Play Store** : colle les textes de `fiche-store.md` (FR par défaut, puis « Ajouter une traduction » → anglais), uploade icône 512, feature graphic et screenshots.
2. **Politique > Contenu de l'application** : déroule chaque formulaire avec les réponses de `questionnaires.md` (Data safety, IARC, public cible 13+, pas de pub, app access avec compte de test…).
3. **Croissance > Paramètres de la fiche** : catégorie **Quiz**, e-mail de contact, URL de confidentialité `https://geogames-mu.vercel.app/privacy.html`.

## Étape 4 — Service account : automatiser l'envoi sur Play (~10 min, une fois)

> Tant que ce n'est pas fait, chaque release Android se termine par un upload **manuel** du `.aab`
> dans la Play Console (c'est le cas depuis la v5.2.0). Une fois la clé en place,
> `eas build --auto-submit` envoie tout seul, comme iOS.

1. https://console.cloud.google.com/projectcreate → crée (ou choisis) un projet, ex. `geog-play`
2. **IAM et administration > Comptes de service** → **Créer un compte de service** → nom `eas-submit`
   → Créer → **aucun rôle projet n'est nécessaire** (les droits viennent de la Play Console, étape 5) → OK
3. Sur le compte créé : **Gérer les clés > Ajouter une clé > Créer une clé > JSON** → un `.json` se télécharge.
   **Copie aussi l'e-mail du compte** (`eas-submit@geog-play.iam.gserviceaccount.com`) — il sert à l'étape 5.
4. ⚠️ **Étape la plus souvent oubliée** — active l'API, sinon l'envoi échoue en 403 :
   https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com → **Activer**
   (vérifie que le projet sélectionné en haut est bien `geog-play`).
5. Play Console → **Utilisateurs et autorisations** → **Inviter un utilisateur** → colle l'e-mail du compte
   de service → **Autorisations de l'app : GeoG**, puis coche :
   - *Accès à l'app* : **Afficher les informations sur l'application (lecture seule)**
   - *Applications en brouillon* : **Modifier et supprimer les brouillons**
   - *Releases* : **Gérer les releases sur les canaux de test** (+ **Publier en production** seulement si tu
     veux qu'`eas submit` puisse pousser en prod ; `eas.json` vise `internal` aujourd'hui)
   - *Présence sur le Store* : **Gérer la présence sur le Store**

   → **Inviter l'utilisateur**.
6. Donne la clé à EAS — **une des deux** options :
   - **Recommandé — clé stockée chez EAS** (rien sur le disque, marche depuis n'importe quelle machine) :
     `eas credentials --platform android` → profil `production` → *Google Service Account* →
     *Upload a Google Service Account Key* → chemin du `.json`.
     Puis **retire** la ligne `"serviceAccountKeyPath"` de `eas.json` (sinon elle a la priorité et EAS
     cherchera un fichier local).
   - **Fichier local** (ce que `eas.json` attend actuellement) : renomme le `.json` en
     `google-service-account.json` et mets-le dans `georankle-app/`. Il est gitignoré — **ne le commite
     jamais**, c'est une clé de publication.

**Fait le 16/08/2026** — le compte en place est **`was-submit@geog-play.iam.gserviceaccount.com`**
(projet Cloud `geog-play`, n° `4015161892`). Le `was-` est une faute de frappe à la création : sans
importance, mais c'est bien cet e-mail-là qu'il faut inviter si tu refais la manip.

**Vérifier que ça marche** (sans refaire de build) :
`eas submit --platform android --profile production --latest`

### Si ça échoue : « The service account is missing the necessary permissions »

Ce message du CLI couvre **trois causes différentes** et ne dit pas laquelle :
API `androidpublisher` désactivée · projet Cloud non lié au compte développeur · droits manquants dans
la Play Console. Pour trancher en 10 secondes au lieu de tout re-vérifier au hasard, appelle l'API
directement — le script `play_diag.py` (voir l'historique de la session du 16/08) signe un JWT avec la
clé, l'échange contre un jeton, puis tente d'ouvrir un edit sur l'app :

- **échec dès l'échange du jeton** → la clé est mauvaise ou révoquée ;
- **jeton OK, puis `403 PERMISSION_DENIED` sur l'edit** → clé et API sont bonnes, c'est la Play Console
  (droits de l'app ou projet Cloud non lié) ;
- **erreur mentionnant `SERVICE_DISABLED`** → l'API de l'étape 4 n'est pas activée.

Deux pages à vérifier dans ce cas : **Utilisateurs et autorisations** (le compte doit être *Actif*, avec
GeoG listé dans *Autorisations de l'app* — l'écran a deux niveaux et il faut valider par **Inviter
l'utilisateur** tout en bas, sinon rien n'est enregistré) et **Paramètres > Accès à l'API** (le projet
Cloud `geog-play` doit y figurer comme projet lié).

⚠️ Ce n'est **pas** un problème de propagation : les droits Play prennent effet en quelques secondes.
Si ça refuse encore après 2-3 minutes, c'est qu'il manque vraiment quelque chose.

## Étape 5 — Firebase : activer les push Android (~10 min, une fois)

> Sans ça, l'app marche mais les notifs sociales/campagnes n'arrivent pas sur Android.

1. https://console.firebase.google.com → **Ajouter un projet** → nom `GeoG` (Analytics : désactive, on a PostHog)
2. Dans le projet : **Ajouter une application > Android** → package : `com.paulpousset.geog` → Enregistrer
3. Télécharge **`google-services.json`** → mets-le dans `georankle-app/` → dis-le à Claude (il branchera `app.json` et rebuildera)
4. **Paramètres du projet (roue dentée) > Comptes de service** → **Générer une nouvelle clé privée** (Firebase Admin SDK) → garde ce `.json` de côté → donne-le à Claude (il l'uploadera dans les credentials EAS pour FCM V1 : `eas credentials`)

## Étape 6 — Passage en production (quand tu es prêt)

1. Si l'exigence des 12 testeurs s'applique : **Tests > Tests fermés** → release (Claude peut la soumettre) → 12 testeurs inscrits et actifs 14 jours → bouton **« Demander l'accès à la production »**
2. Sinon : dis à Claude de passer `track` à `production` dans `eas.json` et de soumettre — la première release de production part en **review Google (quelques heures à 7 jours)**.
