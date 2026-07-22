# Guide — Activer l'interstitiel + les Universal Links

Deux chantiers manuels, indépendants. Valeurs réelles de ton projet pré-remplies.

Repères :
- Compte AdMob : `pub-2429865520138981`
- App AdMob Android : `ca-app-pub-2429865520138981~4674653851`
- App AdMob iOS : `ca-app-pub-2429865520138981~8202835323`
- Package / bundle : `com.paulpousset.geog` · Apple Team : `HAMS39CUCG`
- Domaine web : `geogames-mu.vercel.app` (projet Vercel « geogames »)

---

## A. Interstitiel — créer l'unité, coller les ids, tester, activer

### A1. Créer l'unité dans AdMob (2 unités : une par app)
1. https://apps.admob.com → **Apps** → sélectionne **GeoG (Android)**.
2. **Unités publicitaires** → **Ajouter une unité** → type **Interstitiel**.
3. Nomme-la p.ex. `GeoG Android — Interstitiel fin de partie` → **Créer**.
4. Copie l'**ID de bloc** : `ca-app-pub-2429865520138981/XXXXXXXXXX`.
5. **Répète pour l'app GeoG (iOS)** → tu obtiens un 2e id.

> Astuce : une seule unité « fin de partie » suffit pour démarrer. Tu peux affiner plus tard (une par emplacement).

### A2. Coller les ids dans le code
Fichier [src/lib/monetization.ts](src/lib/monetization.ts), objet `INTERSTITIAL_AD_UNIT_IDS` :
```ts
const INTERSTITIAL_AD_UNIT_IDS: Record<string, string> = {
  android: 'ca-app-pub-2429865520138981/XXXXXXXXXX', // ← ton id Android
  ios:     'ca-app-pub-2429865520138981/YYYYYYYYYY', // ← ton id iOS
};
```
Tant que ces champs sont vides, le code retombe sur les **TestIds Google** (pubs de test) — pratique pour tester, à NE PAS laisser en prod.

### A3. Tester le timing (avant d'activer en prod)
Le déclenchement est câblé à **la sortie du défi quotidien** ([Router.tsx](src/Router.tsx), `DailyGameHost onExit`), avec la règle de [interstitialGate.ts](src/lib/interstitialGate.ts) : **1 pub / 3 parties finies, max 4/jour**, jamais en plein match.
1. Build de test : `eas build --profile preview --platform android` (ou iOS).
2. Pour forcer l'affichage pendant le test, mets temporairement `interstitial_ads` à `true` (voir A4) **avec les TestIds** (ids vides) → tu verras une pub de test.
3. Joue le **défi du jour 3 fois** → l'interstitiel doit apparaître à la 3e sortie. Vérifie : pas d'apparition en plein jeu, pas plus de 4/jour.
4. Remets le flag à `false` le temps de finir A2 avec les vrais ids + rebuild.

### A4. Activer en prod (le flip)
⚠️ **Ordre impératif** : vrais ids collés (A2) → **rebuild + soumission** → *ensuite* flip. Sinon tu sers des pubs de test à de vrais utilisateurs.

Le flag vit dans `public.feature_flags`. Deux options :
- **Via SQL (dashboard Supabase → SQL editor)** :
  ```sql
  update public.feature_flags set enabled = true, updated_at = now()
  where key = 'interstitial_ads';
  ```
- **Ou demande-moi** de le flipper (MCP Supabase authentifiée).

Le cache client des flags a un TTL de 5 min → effet quasi immédiat, **sans nouveau build**.

### A5. Déclarations store (à faire avant la soumission avec pubs)
L'interstitiel utilise le même SDK/données que le rewarded (déjà déclaré). Vérifie quand même :
- **iOS** : App Privacy déjà à jour pour la pub → rien de neuf normalement. ATT déjà en place.
- **Android** : Data safety déjà déclaré pub → OK.
- `app-ads.txt` : déjà en prod sur le domaine, inchangé.

---

## B. Universal Links — déployer .well-known + le bon SHA-256

But : qu'un lien `https://geogames-mu.vercel.app/invite.html?code=XXXX` **ouvre l'app** (au lieu du navigateur) quand elle est installée. Sans ça, le lien ouvre la landing (qui marche déjà, avec bouton « ouvrir l'app » via le scheme `geog://`) — mais l'ouverture directe est plus fluide.

### B1. Déployer les fichiers (le plus simple est déjà fait côté build)
- ✅ `public/.well-known/apple-app-site-association` et `assetlinks.json` existent, et **le build web les copie bien dans `dist/`** (vérifié).
- ✅ [vercel.json](vercel.json) force maintenant le `Content-Type: application/json` sur l'AASA.
- **Action** : redeploie le web → `npx vercel --prod` (ou push git si auto-deploy).
- **Vérifie** ensuite (doit renvoyer du JSON, pas du HTML) :
  ```sh
  curl -sI https://geogames-mu.vercel.app/.well-known/apple-app-site-association | grep -i content-type
  curl -s  https://geogames-mu.vercel.app/.well-known/assetlinks.json
  ```

### B2. iOS — rien à changer dans l'AASA
`public/.well-known/apple-app-site-association` contient déjà le bon `appID` :
`HAMS39CUCG.com.paulpousset.geog`. `app.json` a déjà `associatedDomains: applinks:geogames-mu.vercel.app`. Il suffit d'un **rebuild iOS + soumission** : Apple récupère l'AASA automatiquement.

### B3. Android — remplacer le SHA-256 placeholder (le piège)
`assetlinks.json` contient un placeholder. Le fingerprint doit être celui de la clé qui **signe réellement l'APK installé** :

- **Cas normal (distribution Google Play avec Play App Signing)** → utilise le **certificat de signature d'app Google** :
  Play Console → ton app → **Test and release → App integrity → App signing** → copie le **SHA-256** du « App signing key certificate ».
  Play te propose même directement un **snippet `assetlinks.json` prêt à copier** dans cette page (« Digital Asset Links JSON »).
  ⚠️ Ce certificat n'existe **qu'après** la création de l'app dans Play Console + 1er bundle uploadé (cf. le blocage Play Console de la note Android).

- **Pour les builds EAS internes / APK sideload** → utilise le SHA-256 du keystore EAS :
  ```sh
  eas credentials      # → Android → production → Keystore → lit le "SHA256 Fingerprint"
  ```

**Recommandé : mets les DEUX empreintes** (clé de signature Play *et* keystore EAS/upload) dans le tableau `sha256_cert_fingerprints`, pour couvrir tous les canaux :
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.paulpousset.geog",
      "sha256_cert_fingerprints": [
        "AA:BB:… (Play App Signing)",
        "CC:DD:… (keystore EAS)"
      ]
    }
  }
]
```
Puis **redeploie le web** (B1) et **rebuild Android**. `app.json` a déjà l'`intentFilter` `autoVerify` sur `/invite.html`.

### B4. Vérifier
- iOS : sur un iPhone avec l'app installée, colle le lien invite dans Notes/iMessage → il doit ouvrir l'app.
- Android : `adb shell am start -a android.intent.action.VIEW -d "https://geogames-mu.vercel.app/invite.html?code=TEST" com.paulpousset.geog` → ouvre l'app. Ou le validateur : https://developers.google.com/digital-asset-links/tools/generator

> Tant que B3 n'est pas fait, **la boucle fonctionne déjà** via la landing `invite.html` (bouton « ouvrir l'app » = scheme `geog://`, et boutons store). Les universal links ne font qu'améliorer la fluidité.
