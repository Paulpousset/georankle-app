# GeoG — playgeog.com

Le jeu de géographie : quiz de drapeaux, capitales et pays du monde, défi du jour,
duels en ligne et mode classé. Expo / React Native (iOS · Android · Web) + Supabase.

**Site & jeu web :** https://playgeog.com — défi du jour jouable sur https://playgeog.com/play

## Stack

- **App** : Expo SDK (React Native, New Architecture), TypeScript, `react-native-web` pour l'export web.
- **Backend** : Supabase (Postgres + RLS + Edge Functions + Realtime). Toute la logique sensible
  (économie de pièces, ELO, quotas) est server-authoritative via des RPC `SECURITY DEFINER`.
- **Analytics / crash** : PostHog (EU) + Sentry.
- **Monétisation** : AdMob rewarded (opt-in) + interstitiel (câblé, flag off) via
  `react-native-google-mobile-ads` ; kill-switches dans `feature_flags`.
- **Déploiement** : builds mobiles via **EAS**, web via **Vercel** (projet `geogames`).

## Développement

```sh
npm install
npm run start        # Metro (Expo Go / dev client)
npm run web          # app dans le navigateur
npm test             # suite Jest (jest-expo)
npx tsc --noEmit     # typecheck
npx eslint .         # lint
```

Variables d'env (`EXPO_PUBLIC_*` : Supabase, PostHog, Sentry) : en local dans `.env.local`
(gitignoré), en CI/build dans `eas.json` et les env vars du projet Vercel.

## Structure

- `src/screens/` — écrans (jeux solo, multijoueur, boutique, profil, daily…).
- `src/components/` — composants partagés.
- `src/lib/` — logique pure et testée (scoring, daily, coins, monétisation, parrainage, liens…).
- `src/hooks/`, `src/contexts/` — état applicatif (auth, thème, langue, navigation, match engine).
- `src/types/database.ts` — types générés depuis Supabase.
- `*.sql` — migrations (à appliquer via Supabase MCP / SQL editor, puis régénérer les types).
- `public/` — actifs web servis par Vercel (landing SEO, `/invite`, `.well-known`, sitemap…).
- `store-listing/`, `store-screenshots/` — fiches et captures store (FR/EN + localisations ES/PT/DE/IT).

## Croissance (boucle virale)

- **Parrainage** : `referral.sql` + `src/lib/referral.ts` — parrain & filleul gagnent des pièces.
- **Web daily zéro-friction** : `/play` ouvre le défi du jour dans le navigateur (jouable déconnecté) ;
  les résultats partagés pointent vers `playgeog.com/play?code=…`.
- **Domaine de marque** unique via la constante `SITE_DOMAIN` (`src/lib/links.ts`).

## Build & déploiement

```sh
# Web (Vercel)
npx vercel --prod

# Mobile (EAS)
eas build --profile production --platform ios
eas build --profile production --platform android
eas submit --profile production --platform ios      # App Store
eas submit --profile production --platform android   # nécessite google-service-account.json
```

### Automatisé (GitHub Actions, secrets à poser une fois)

- **`eas-update.yml`** — quand la CI est verte sur `master`, publie le JS à chaud sur le canal
  `production` (`expo-updates`, `runtimeVersion` = version de l'app). Une dépendance native ou un
  changement d'`app.json` exige un build : incrémenter `expo.version` isole les anciens binaires.
  Secret : `EXPO_TOKEN`.
- **`release.yml`** — un tag `vX.Y.Z` (ou « Run workflow » dans l'onglet Actions : les sessions
  Claude ne peuvent pas pousser de tag) lance le build iOS + Android et l'envoi aux stores.
  Secrets : `EXPO_TOKEN`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `ASC_KEY_ID`, `ASC_ISSUER_ID`,
  `ASC_PRIVATE_KEY`.
- **`migrate.yml`** — applique `supabase/migrations/*.sql` (une fois chacune, table
  `ci_migrations`) à l'arrivée sur `master`. Secret : `SUPABASE_DB_URL`. Les `*.sql` à la racine
  restent appliqués à la main.

Plan de croissance et journal : `PLAN_PROMOTION.md`, `GROWTH_LOG.md`.

Guides : `guide-deeplinks-interstitiel.md` (universal links + interstitiel), `guide-pubs-admob.md`,
`store-listing/` (fiches), `ANALYTICS_FUNNELS.md` (funnels PostHog).
