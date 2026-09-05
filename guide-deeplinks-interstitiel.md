# Guide — Activer l'interstitiel + les Universal Links

Deux chantiers manuels, indépendants. Valeurs réelles de ton projet pré-remplies.

Repères :
- Compte AdMob : `pub-2429865520138981`
- App AdMob Android : `ca-app-pub-2429865520138981~4674653851`
- App AdMob iOS : `ca-app-pub-2429865520138981~8202835323`
- Package / bundle : `com.paulpousset.geog` · Apple Team : `HAMS39CUCG`
- Domaine web : `playgeog.com` (projet Vercel « geogames »)

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

## B. Ouvrir l'app depuis un lien partagé (parrainage + ligue)

But : `https://playgeog.com/invite.html?code=XXXX` (parrainage) et
`https://playgeog.com/play?league=XXXX` (ligue) doivent **ouvrir l'app** quand
elle est installée. Sans ça le joueur reste sur le web : le code n'est jamais
crédité, la ligue jamais rejointe.

Trois chemins, du plus fluide au plus manuel — les deux premiers sont câblés,
le troisième marche **déjà en prod dès le prochain déploiement web** :

1. **Universal / App Links** (système, aucun clic) — demande un build store.
2. **Redirection Android `intent://`** ([public/open-in-app.js](public/open-in-app.js)) —
   pur web. Si l'app manque, Chrome repart sur `browser_fallback_url` = la même
   page avec `web=1` : jamais de cul-de-sac, jamais de détour par le Play Store.
3. **Barre « Ouvrir dans l'app »** sur les coquilles `/play` (16 langues) et les
   boutons de `invite.html` — un geste utilisateur, seule façon fiable de lancer
   `geog://` sur iOS, et la seule qui marche depuis les navigateurs intégrés
   (Instagram, Facebook, Snapchat) qui ignorent les universal links.

`web=1` coupe les trois : c'est le drapeau « ce joueur a choisi le navigateur »
(bouton « jouer sans installer », ou retour d'un `intent://` sans app installée).

### B1. Ce qui est déjà fait dans le dépôt
- `app.json` : `ios.associatedDomains = ["applinks:playgeog.com"]` (il manquait
  complètement depuis le passage à playgeog.com → **aucun** universal link iOS
  ne fonctionnait) et `android.intentFilters` couvre désormais `/invite.html`,
  `/play`, `/daily` et les quinze `/xx/play`.
- `public/.well-known/apple-app-site-association` : mêmes chemins, au format
  `components`, avec une exclusion sur `?web=1`.
- `public/open-in-app.js` + injection dans les seize coquilles d'app
  (`site/build.mjs`, textes traduits dans `site/lib/strings.mjs` et
  `site/content/i18n/*.json`). Le build échoue si une langue perd ses textes.
- `assetlinks.json` : porte **les deux** empreintes — la clé de signature Play
  `AD:C3:EE:…` (celle qui signe ce que les joueurs installent, sans elle la
  vérification Android échoue) et le keystore d'importation EAS `F1:0E:D4:…`
  (builds internes, APK sideload). La seconde était seule jusqu'ici : c'est
  pour ça que les App Links n'étaient jamais vérifiés en production.

### B2. Ce qui reste à faire (toi)
1. **Déployer le web** (`git push master` = déploiement auto). Ça active les
   chemins 2 et 3 immédiatement, sans build store.
2. ~~Vérifier l'empreinte Android~~ — **fait** (Play Console → *Tester et
   publier → Configuration → Intégrité de l'application*). Après déploiement,
   contrôler que Google voit bien la nouvelle empreinte :
   ```sh
   curl -s -G https://digitalassetlinks.googleapis.com/v1/assetlinks:check \
     --data-urlencode "source.web.site=https://playgeog.com" \
     --data-urlencode "relation=delegate_permission/common.handle_all_urls" \
     --data-urlencode "target.android_app.package_name=com.paulpousset.geog" \
     --data-urlencode "target.android_app.certificate.sha256_fingerprint=AD:C3:EE:E2:BF:2C:39:E6:5D:5E:20:30:24:C9:9A:4B:2B:5D:16:12:E3:75:02:42:BD:83:9C:DD:5D:21:0F:7F"
   # attendu : "linked": true
   ```
   Et côté console : *Accroître le nombre d'utilisateurs → Liens profonds*.
3. **Rebuild + soumission iOS et Android**. Côté iOS, EAS ajoute tout seul la
   capacité *Associated Domains* à l'App ID au moment du build (il peut demander
   de resynchroniser les credentials).
4. **Vérifier après coup** :
   ```sh
   curl -sI https://playgeog.com/.well-known/apple-app-site-association | grep -i content-type
   adb shell am start -a android.intent.action.VIEW \
     -d "https://playgeog.com/play?league=TEST" com.paulpousset.geog
   ```
   iOS : colle le lien dans Notes/iMessage (un lien tapé dans Safari ne
   déclenche jamais un universal link, c'est normal).
