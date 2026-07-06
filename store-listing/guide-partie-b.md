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

## Étape 4 — Service account : donner la clé à Claude (~10 min, une fois)

> Permet `eas submit` automatique pour toutes les mises à jour futures.

1. https://console.cloud.google.com → crée (ou choisis) un projet, ex. `geog-play`
2. **IAM et administration > Comptes de service** → **Créer un compte de service** → nom `eas-submit` → Créer → (pas de rôle projet nécessaire) → OK
3. Sur le compte créé : **Clés > Ajouter une clé > JSON** → un fichier `.json` se télécharge
4. Play Console → **Utilisateurs et autorisations** → **Inviter un utilisateur** → colle l'e-mail du compte de service (`eas-submit@geog-play.iam.gserviceaccount.com`) → Autorisations de l'app : GeoG → coche **« Gérer les releases en test »** (et « Publier en production » si tu veux automatiser jusqu'au bout) → Inviter
5. Renomme le fichier téléchargé en `google-service-account.json` et mets-le dans `georankle-app/` (il est gitignoré). Dis-le à Claude.

## Étape 5 — Firebase : activer les push Android (~10 min, une fois)

> Sans ça, l'app marche mais les notifs sociales/campagnes n'arrivent pas sur Android.

1. https://console.firebase.google.com → **Ajouter un projet** → nom `GeoG` (Analytics : désactive, on a PostHog)
2. Dans le projet : **Ajouter une application > Android** → package : `com.paulpousset.geog` → Enregistrer
3. Télécharge **`google-services.json`** → mets-le dans `georankle-app/` → dis-le à Claude (il branchera `app.json` et rebuildera)
4. **Paramètres du projet (roue dentée) > Comptes de service** → **Générer une nouvelle clé privée** (Firebase Admin SDK) → garde ce `.json` de côté → donne-le à Claude (il l'uploadera dans les credentials EAS pour FCM V1 : `eas credentials`)

## Étape 6 — Passage en production (quand tu es prêt)

1. Si l'exigence des 12 testeurs s'applique : **Tests > Tests fermés** → release (Claude peut la soumettre) → 12 testeurs inscrits et actifs 14 jours → bouton **« Demander l'accès à la production »**
2. Sinon : dis à Claude de passer `track` à `production` dans `eas.json` et de soumettre — la première release de production part en **review Google (quelques heures à 7 jours)**.
