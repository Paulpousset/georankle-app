# Pubs sur le web — guide d'activation (2026-07-22)

Le code est **déjà en place et déployable sans risque** : tout est éteint tant
que le flag `web_ads` est OFF (il a été créé OFF en prod). Ce guide liste ce
que toi seul peux faire (console AdSense), puis comment activer.

## Ce qui a été codé

1. **Pubs de l'app portées sur web** (`src/lib/adsWeb.ts` + branches web dans
   `monetization.ts`) via l'Ad Placement API de Google ("H5 Games Ads") :
   - **Rewarded** : le bouton « Regarder une pub » (Boutique, quêtes, fin de
     partie solo) et le multiplicateur de pièces marchent sur web — même claim
     serveur (`claim_rewarded_ad` / `claim_coin_multiplier`), même plafond 5/jour.
   - **Interstitiel** : même point d'entrée `maybeShowInterstitial()`, même
     gate de fréquence (1 pub / 3 parties, max 4/jour). Toujours derrière le
     flag `interstitial_ads` (OFF aujourd'hui).
2. **Rails latéraux non bloquants** (`SideRailAds.web.tsx`, monté dans
   App.tsx) : deux unités display fixées dans les gouttières vides à gauche et
   à droite du contenu (centré ≤600px). Visibles uniquement si l'écran est
   assez large (≥1120px → 160×600 ; ≥1520px → 300×600 ; masqués si hauteur
   <660px). **Jamais par-dessus le jeu**, jamais sur mobile.
3. `public/ads.txt` déployé avec `pub-2429865520138981`.
4. Flag serveur `web_ads` (web_ads.sql, **appliqué en prod**, OFF) : double
   porte pour tout le web — rien ne s'affiche tant qu'il est OFF, même si
   `rewarded_ads` est ON (c'est déjà le cas en prod !).

## À faire par Paul (console AdSense)

1. **AdSense** : https://adsense.google.com — le compte existe normalement déjà
   (créé avec AdMob, même identifiant `pub-2429865520138981` ; vérifie dans
   Compte → Paramètres). Sinon, crée-le avec le même compte Google qu'AdMob.
2. **Ajouter le site** : Sites → Ajouter → `playgeog.com` → demander la
   validation. L'`ads.txt` déjà déployé sert de vérification. L'approbation
   prend de quelques jours à 2 semaines.
3. **Créer 2 unités display** : Annonces → Par bloc d'annonces → Display,
   nommées p.ex. `web-rail-left` et `web-rail-right` (taille responsive, peu
   importe — la taille est fixée côté code). Copier les deux `data-ad-slot`
   dans `WEB_SIDE_RAIL_SLOTS` dans [src/lib/adsWeb.ts](src/lib/adsWeb.ts).
4. **RGPD** : AdSense → Confidentialité et messages → créer le message de
   consentement (comme fait/à faire pour AdMob). Sans lui, pubs non
   personnalisées en UE seulement.
5. **Déployer le web** (Vercel) après avoir collé les slot ids.
6. **Activer** : dans le SQL editor Supabase —
   `UPDATE public.feature_flags SET enabled = true WHERE key = 'web_ads';`
   → rewarded + rails visibles sur web dans les 5 min (cache flags).
   L'interstitiel web suivra automatiquement le jour où tu flippes
   `interstitial_ads` (commun mobile+web).

## Tester avant l'approbation AdSense

En dev (`npm run web`), le script est injecté avec `data-adbreak-test="on"` →
les ad breaks rewarded/interstitiel montrent des fausses pubs Google (aucun
risque policy). Pour tester sur un preview Vercel, mets temporairement
`FORCE_ADBREAK_TEST = true` dans adsWeb.ts (et remets false avant la prod).
Les rails display, eux, ne servent rien tant que le site n'est pas approuvé —
c'est normal (l'`<ins>` reste vide et invisible).

## Sécurité / réversibilité

- Kill-switch instantané : repasser `web_ads` à false coupe tout le web.
- Les claims restent 100% côté serveur (flag re-vérifié dans les RPC).
- Adblockers : timeout 15s → toast « Pub indisponible », pas de blocage.
