# GeoG — Passage au niveau professionnel

Ce qui a été fait en code (✅) et ce qui reste à faire par toi (🔑 = nécessite un compte/clé externe).

## ✅ Fait dans cette session

- **ELO serveur-autoritaire** — `apply_ranked_result()` (RPC `SECURITY DEFINER`, idempotente,
  row-locked). Le client ne peut plus écrire son propre ELO ; les policies INSERT/UPDATE sur
  `player_ratings` ont été supprimées. Code : `App.tsx` → `updateRankedRating`. SQL : `server_authoritative.sql`.
- **Suppression de compte** (App Store 5.1.1(v)) — RPC `delete_user_account()` + bouton dans
  `Profile.tsx` (« Supprimer mon compte ») avec confirmation. Lien Politique de confidentialité ajouté.
- **Alertes sécurité Supabase corrigées** — `rls_auto_enable` execute révoqué ; bucket `avatars`
  ne permet plus le listing.
- **Politique de confidentialité** — `public/privacy.html` mise à jour (suppression in-app mentionnée).
- **Qualité** — `userInterfaceStyle: automatic` (respect du thème système) ; `alert()` → `Alert.alert` ;
  `.gitignore` durci (`*.ipa/*.aab/*.apk`).

## 🔑 À faire par toi (réglages console, non automatisables)

1. **Activer la protection des mots de passe compromis** (Supabase) :
   Dashboard → Authentication → Policies → *Leaked password protection* → ON.
2. **Vérifier le domaine de la privacy policy** : le lien dans `Profile.tsx` pointe vers
   `https://geogames.vercel.app/privacy.html`. Si ton domaine de prod diffère, corrige-le.
3. **Redéployer le web** (`npm run build:web` puis push Vercel) pour publier la nouvelle privacy.html.

## 🚧 Chantiers recommandés (non commencés — nécessitent des choix/comptes)

### Monitoring & analytics (prérequis à la monétisation)
- **Sentry** : `npx @sentry/wizard -i reactNative` → crée le projet, fournit le DSN, wrappe l'app.
- **Analytics produit** : PostHog ou Amplitude (SDK Expo). Mesurer rétention J1/J7 et funnel de conversion.

### Notifications push (invitations multijoueur hors-ligne)
- `expo-notifications` + Expo Push. Aujourd'hui les invites passent uniquement par Realtime
  quand l'app est ouverte (`App.tsx:96`). Stocker le push token dans `profiles`, envoyer via une
  Edge Function sur INSERT dans `matches`.

### Monétisation (par ordre de ROI)
1. **Pub (AdMob)** 🔑 compte AdMob — `react-native-google-mobile-ads` (plugin Expo). Interstitiel
   entre rounds solo + rewarded (indice/vie en Streak).
2. **Abonnement Premium** 🔑 compte **RevenueCat** + produits App Store/Play Console — sans pub,
   classé illimité, stats avancées, skins de globe exclusifs (~4,99 €/mois).
3. **Cosmétiques IAP** — skins de `RankGlobe`, badges de rang.
4. **Saisons classées / battle pass** — reset ELO saisonnier + récompenses (rétention + revenu).
5. **Licence éducation (B2B)** — « mode classe » bâti sur le builder de parcours local.

### Dette technique
- Migrer le routing manuel de `App.tsx` (~20 useState + if-chains) vers `react-navigation`.
- Découper `VersusCapitals.tsx` (1365 l.) et `ClassicGame.tsx` (963 l.).
- Ajouter des tests (Jest + React Native Testing Library) et une CI (GitHub Actions).
- Nettoyer le dossier parent `rankle/` (scripts Python, `.db`, `venv`, `geog.ipa`) — non versionné mais encombrant.
