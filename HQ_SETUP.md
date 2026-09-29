# GeoG HQ — tableau de bord privé

**URL :** https://playgeog.com/hq/ (sur iPhone : Safari → Partager → « Sur l'écran d'accueil »).
Connexion avec le compte admin GeoG (`profiles.is_admin = true`). Si tu es déjà connecté sur
playgeog.com/play dans le même navigateur, la session est reprise automatiquement.

- Page : `public/hq/index.html` (statique, copiée dans `dist/` par `expo export`).
- API : `api/hq.mjs` → `GET /api/hq?source=<nom>&days=7|28|90`, vérifie le jeton Supabase + `is_admin`,
  cache 5 min par instance. Une source par module dans `api/_hq/`.
- Rien n'est indexé (`noindex` en en-tête + meta), aucun secret n'arrive au navigateur.

Chaque source non branchée affiche « À connecter » avec les variables manquantes : le reste marche.
Toutes les variables vont dans **Vercel → geogames → Settings → Environment Variables (Production)**,
ou en CLI : `vercel env add NOM production`. Il faut **redéployer** après ajout.

## État des sources

| Source | Ce qu'elle donne | Variables | État |
|---|---|---|---|
| Supabase | comptes, actifs, parties par mode, défi du jour, en ligne, Histoire, économie, crons, push, flags | `SUPABASE_SERVICE_ROLE_KEY` | ✅ |
| PostHog | visiteurs, DAU par plateforme, rétention J1/J7, étapes clés, trafic web, pays, langues, versions, Web Vitals | `POSTHOG_PERSONAL_API_KEY` | ✅ |
| App Store (public) | note moyenne par vitrine, version en ligne | — | ✅ |
| Santé du site | ping playgeog.com, /play, app-ads.txt | — | ✅ |
| Google Play | avis | `GOOGLE_SA_JSON` | ✅ (compte de service) |
| Google Play vitals | taux de crash / ANR | idem + API à activer | ⏳ 1 clic |
| Search Console | clics, impressions, CTR, position, requêtes, pages, pays, sitemaps | idem + API à activer + ajout utilisateur | ⏳ 2 min |
| Sentry | erreurs ouvertes, nouvelles, crash-free, erreurs/jour | `SENTRY_AUTH_TOKEN` | ⏳ |
| Vercel | derniers déploiements | `VERCEL_API_TOKEN` | ⏳ |
| EAS | builds iOS/Android, mises à jour OTA | `EXPO_TOKEN` | ⏳ |
| AdMob | revenus, impressions, eCPM, remplissage, par format/pays | `GOOGLE_OAUTH_*` | ⏳ 5 min |
| AdSense | revenus web, état du compte, alertes | `GOOGLE_OAUTH_*` | ⏳ (même étape) |
| App Store Connect | téléchargements/jour, avis | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY`, `ASC_VENDOR_NUMBER` | ⏳ |

## Étapes

### 1. Search Console + Play vitals (compte de service `was-submit@geog-play.iam.gserviceaccount.com`)
1. Activer les API dans le projet GCP geog-play :
   - https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=4015161892
   - https://console.developers.google.com/apis/api/playdeveloperreporting.googleapis.com/overview?project=4015161892
2. Search Console → propriété playgeog.com → Paramètres → Utilisateurs et autorisations → Ajouter
   `was-submit@geog-play.iam.gserviceaccount.com` en **Restreint**.
3. (Play vitals) Play Console → Utilisateurs et autorisations → le compte de service a déjà accès à l'app ;
   vérifier qu'il a « Afficher les informations de l'application ».

> Alternative : l'étape 5 (OAuth) couvre aussi Search Console et Play, sans ajouter le compte de service.

### 2. Sentry
sentry.io → Settings → Auth Tokens (ou « Personal Tokens ») → portées `org:read`, `project:read`,
`event:read` → `SENTRY_AUTH_TOKEN`. (Org par défaut : `tita-30`, sinon `SENTRY_ORG`.)

### 3. Vercel
vercel.com/account/tokens → jeton limité à l'équipe du projet, lecture suffit → `VERCEL_API_TOKEN`.

### 4. EAS
expo.dev → Account settings → Access tokens → `EXPO_TOKEN`.

### 5. AdMob + AdSense (compte Google perso, obligatoire pour ces deux API)
1. Activer les API AdMob et AdSense Management dans geog-play :
   - https://console.developers.google.com/apis/api/admob.googleapis.com/overview?project=4015161892
   - https://console.developers.google.com/apis/api/adsense.googleapis.com/overview?project=4015161892
2. Google Auth Platform (écran de consentement) : type Externe, ajouter ton adresse,
   puis **Publier l'application** (« En production »). En mode « Test » le jeton expire au bout de 7 jours.
   L'écran « application non validée » est normal : Paramètres avancés → continuer.
3. Clients → Créer un client OAuth → **Application de bureau**.
4. `node scripts/hq_google_oauth.mjs <CLIENT_ID> <CLIENT_SECRET>` → se connecter avec le compte
   qui possède AdMob/AdSense → le script affiche `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
   `GOOGLE_OAUTH_REFRESH_TOKEN`.

Quand ces trois variables existent, Search Console et Play passent aussi par ce compte.

### 6. App Store Connect
1. App Store Connect → Utilisateurs et accès → Intégrations → Clés d'API de l'équipe → rôle **Ventes**
   (ou Finances) → télécharger le `.p8`.
2. `ASC_KEY_ID` (ID de la clé), `ASC_ISSUER_ID` (en haut de la page),
   `ASC_PRIVATE_KEY` = contenu du `.p8` (retours à la ligne gardés, ou remplacés par `\n`).
3. `ASC_VENDOR_NUMBER` : Paiements et rapports financiers, en haut à gauche.

## Ajouter une source
Nouveau module `api/_hq/<nom>.mjs` qui exporte `async function <nom>({ days })` et renvoie
`settle({ cle: async () => … })` (une sous-requête en erreur n'efface pas les autres ; `need([...])`
signale les variables manquantes). L'enregistrer dans `SOURCES` de `api/hq.mjs` et dans `SOURCES`
de la page, puis ajouter les cartes dans la vue voulue.
