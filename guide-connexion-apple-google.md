# Connexion avec Apple & Google

État : **tout le code est shippé dormant** (flags `social_login_apple` / `social_login_google` créés OFF en prod). Il reste uniquement la configuration des consoles Apple / Google / Supabase, puis flipper les flags. Aucune de ces étapes ne demande de re-toucher le code (sauf 2 valeurs à coller, voir ⚙️).

## Ce qui est en place (code)

- **Natif (iOS/Android)** : `src/lib/socialAuth.ts` — SDK du fournisseur → `signInWithIdToken` Supabase (pas de navigateur). Apple via `expo-apple-authentication` (iOS seulement), Google via `@react-native-google-signin/google-signin`.
- **Web** : `src/lib/socialAuth.web.ts` — `signInWithOAuth` avec redirection vers l'URL courante (`/play`, `/es/play`…). `detectSessionInUrl` est désormais activé côté web dans `src/lib/supabase.ts`.
- **UI** : boutons « Continuer avec Apple / Google » sur l'écran Auth (connexion **et** inscription), séparateur « ou », logos officiels (`src/components/SocialLogos.tsx`), traduits dans les 16 langues.
- **Gating** : chaque bouton = son flag serveur **ET** faisabilité locale (bouton Apple caché sur Android ; bouton Google caché si `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` absent).
- **Après connexion** : la session arrive par `onAuthStateChange` → `AuthContext` crée la ligne `profiles`, et `UsernameGate` force le choix d'un pseudo au premier login (les comptes OAuth n'en ont pas).
- **app.json** : `usesAppleSignIn: true` + plugins ajoutés. `social_login.sql` déjà appliqué en prod.
- **Analytics** : événement `oauth_login_started` (prop `provider`).
- **Tests** : `src/lib/__tests__/socialAuth.test.ts` (11 cas) verrouille la dormance (pas de client ID → bouton caché) et l'annulation silencieuse (refermer la feuille ne doit jamais afficher d'alerte d'erreur).
- **Outillage** : `scripts/setup_social_auth.mjs` câble le dépôt et fabrique le secret Apple (voir §4).

## Pourquoi ça ne peut pas s'automatiser entièrement

Deux verrous, tous deux côté fournisseur, pas côté outillage :

- **Google n'expose aucune API de création de client OAuth** — ni `gcloud`, ni REST, ni Terraform (demande ouverte de longue date). L'étape 2 est irréductiblement de la console.
- **Apple n'expose ni les Services IDs ni les clés Sign in with Apple** dans l'App Store Connect API, et le `.p8` n'est téléchargeable qu'une fois.

En revanche l'App Store Connect API **sait** activer la capability sur un bundle ID (endpoint `bundleIdCapabilities`, type `SIGN_IN_WITH_APPLE`) : l'étape 1.1 est automatisable avec une clé d'API ASC **et son Issuer ID** (un UUID visible seulement dans *Users and Access → Integrations*, non déductible du `.p8`).

## Checklist Paul

### 1. Apple (developer.apple.com)

1. **Identifiers → App ID `com.paulpousset.geog`** : cocher la capability **Sign in with Apple**.
   ⚠️ Cocher une capability **réinvalide le profil de provisioning**, y compris celui régénéré le 05/09 pour les Associated Domains (build 45). `eas build` le régénère tout seul, mais te redemandera le login Apple interactif une fois (compte `polo.pousset@gmail.com`) — c'est un prompt, pas un blocage.
   💡 Automatisable : fournis une clé d'API App Store Connect (rôle Admin ou App Manager) **+ son Issuer ID** et cette étape se fait par API, sans console.
2. **Identifiers → nouveau Services ID** (pour le web), ex. `com.paulpousset.geog.web` :
   - activer Sign in with Apple, configurer :
   - Domains : `playgeog.com`
   - Return URLs : `https://exwfggaytrywnfzcqpel.supabase.co/auth/v1/callback`
3. **Keys → nouvelle clé** avec Sign in with Apple → télécharger le `.p8`, noter le **Key ID** et le **Team ID**.
4. **Supabase dashboard → Authentication → Providers → Apple** :
   - Enable ON
   - Client IDs : `com.paulpousset.geog.web,com.paulpousset.geog` (Services ID pour le web + bundle ID pour le natif — l'`aud` du token natif est le bundle ID)
   - Secret Key : un JWT ES256 signé avec le `.p8` — **`scripts/setup_social_auth.mjs` le fabrique** (voir §4), le Team ID est repris automatiquement d'`eas.json`. ⚠️ Il expire à 180 jours : passé cette date la connexion Apple **web** casse silencieusement (le natif iOS continue). Mettre un rappel.

### 2. Google (console.cloud.google.com)

Dans un projet Google Cloud (celui du service account Play fait l'affaire) :

1. **OAuth consent screen** : External, nom « GeoG », domaine `playgeog.com`, logo — puis publier (pas besoin de vérification pour les scopes de base email/profile).
2. **Credentials → 3 clients OAuth** :
   - **Web application** : Authorized redirect URI = `https://exwfggaytrywnfzcqpel.supabase.co/auth/v1/callback` → noter **client ID + secret**. Ce client ID est aussi `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
   - **iOS** : bundle `com.paulpousset.geog` → noter le client ID iOS.
   - **Android** : package `com.paulpousset.geog` + **deux SHA-1**, soit **deux clients** (la console n'accepte qu'une empreinte par client) :
     - keystore EAS (builds de test) — ✅ **déjà extraite**, à copier telle quelle :
       `CD:F8:11:EA:52:46:9C:71:92:FD:F7:C4:79:32:71:7B:34:B0:FB:49`
       (lue dans `store-listing/GeoG-v5.0.0-production.aab` avec `keytool -printcert -jarfile`. À revérifier via `eas credentials -p android` si le keystore a été régénéré depuis juillet 2026.)
     - clé de signature Play (l'app du store) : Play Console → GeoG → *Test and release → Setup → App signing* → « App signing key certificate » → SHA-1. Exposée par aucune API, passage par la console obligatoire.
3. **Supabase dashboard → Authentication → Providers → Google** :
   - Enable ON, Client ID + Secret = ceux du client **Web**
   - **Authorized Client IDs** (aussi nommé "Skip nonce check / additional client IDs") : ajouter le client ID **Web** + le client ID **iOS** + le(s) client ID(s) **Android** — c'est ce qui fait accepter les id_tokens natifs par `signInWithIdToken`.

### 3. Supabase — URLs de redirection (pour le web)

Dashboard → Authentication → URL Configuration → Redirect URLs : ajouter `https://playgeog.com/**` (couvre `/play` et les 15 déclinaisons `/xx/play`).

### 4. ⚙️ Câbler le dépôt — une commande

Pas d'édition manuelle : `scripts/setup_social_auth.mjs` place les valeurs aux quatre endroits du dépôt et fabrique le client secret Apple.

```bash
node scripts/setup_social_auth.mjs \
  --google-web-client-id 1234-abc.apps.googleusercontent.com \
  --google-ios-scheme com.googleusercontent.apps.1234-def \
  --apple-p8 ~/Downloads/AuthKey_XXXXXX.p8 \
  --apple-key-id XXXXXX
```

Chaque bloc est indépendant (lance-le avec ce que tu as, relance-le pour le reste), il est idempotent, et `--check` affiche l'état sans rien écrire. Ce qu'il fait :

- `.env` + les deux profils d'`eas.json` → `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` ;
- `app.json` → `iosUrlScheme` du plugin google-signin ;
- affiche le **client secret Apple** à coller dans Supabase (jamais écrit sur disque) avec sa date d'expiration et les Client IDs qui l'accompagnent.

### 5. Builds & activation

1. **Rebuild natif obligatoire** (nouveaux modules natifs) : `eas build` iOS + Android, bump version. Le web part tout seul au prochain deploy Vercel.
2. Tester (voir matrice ci-dessous) **avant** d'allumer.
3. **Activation** = SQL editor : `UPDATE public.feature_flags SET enabled = true WHERE key IN ('social_login_apple','social_login_google');` — chaque flag est indépendant (ex. allumer Google seul tant qu'Apple bloque sur le profil iOS). Effet immédiat, sans build (cache client 5 min).

### Matrice de test

| Surface | Google | Apple |
|---|---|---|
| iOS (TestFlight) | feuille native → session → UsernameGate | feuille Apple → session → UsernameGate |
| Android (internal) | account picker → session | (bouton caché — attendu) |
| Web `/play` + une langue `/es/play` | redirection aller-retour, retour sur la même page, connecté | idem |
| Compte existant email+mdp avec le même email | doit se connecter au **même** compte (identité liée) | idem, sauf « Masquer mon adresse » (voir pièges) |

### Pièges connus

- **App Store 4.8** : dès qu'on propose Google sur iOS, Sign in with Apple est **obligatoire** — c'est pour ça que les deux arrivent ensemble. Ne jamais allumer `social_login_google` sur une build iOS sans qu'Apple marche aussi.
- **Apple « Masquer mon adresse »** : crée un email relais `@privaterelay.appleid.com` → si le joueur avait déjà un compte email classique, ça fera un **second compte** (pas de fusion possible par email). Rien à corriger, juste à savoir pour le support.
- **Fusion par email** : Supabase lie automatiquement l'identité OAuth à un compte existant **si l'email est vérifié** des deux côtés.
- **`DEVELOPER_ERROR` Google sur Android** = SHA-1 manquant/mauvais (debug vs EAS vs Play signing) — vérifier les 3 empreintes.
- **Secret Apple** : le client secret JWT expire (≤ 6 mois) → le login Apple **web** casse silencieusement à l'expiration. Mettre un rappel.
