# Guide Pubs AdMob — ce que Paul doit faire (tout est gratuit)

Le code est **terminé et testé** (pubs récompensées : bouton « +5 pièces », plafond 5/jour, serveur-autoritaire). Il tourne sur les **IDs de test Google** et le flag serveur `rewarded_ads` est **OFF** : rien n'est visible pour les joueurs tant qu'on ne bascule pas.

Il ne manque que l'administratif ci-dessous. Étapes A+B = ~30 min et débloquent tout le reste.

---

## A. Créer le compte AdMob (~15 min) — LE bloquant
1. Va sur https://admob.google.com et connecte-toi avec **le même compte Google que ta future Play Console**.
2. Pays : France · devise EUR · accepte les conditions.
3. **Ignore la partie paiement/fiscal pour l'instant** — Google ne la demande qu'avant le premier versement (seuil 70 €).

## B. Déclarer les 2 apps + créer les blocs rewarded (~15 min)
1. AdMob → **Applications → Ajouter une application** → plateforme **Android** → « Non, l'app n'est pas encore publiée » → nom : GeoRankle.
2. Pour **iOS** : l'app est **déjà sur l'App Store** → réponds « Oui, l'app est publiée », cherche-la par son nom et **lie directement la fiche App Store**. Avantage : AdMob vérifie l'app tout de suite (pas de statut « préparation » à débloquer plus tard côté iOS).
3. Dans chaque app : **Blocs d'annonces → Ajouter un bloc → Avec récompense** (laisse la récompense par défaut — c'est notre serveur qui décide des 5 pièces). Nom suggéré : `rewarded_coins`.
4. **Envoie-moi les 4 IDs** :

   | Quoi | Format | Où le trouver |
   |---|---|---|
   | APPLICATION_ID Android | `ca-app-pub-XXXX~YYYY` (tilde) | Paramètres de l'app |
   | APPLICATION_ID iOS | `ca-app-pub-XXXX~YYYY` | Paramètres de l'app |
   | Bloc rewarded Android | `ca-app-pub-XXXX/ZZZZ` (slash) | Page du bloc d'annonces |
   | Bloc rewarded iOS | `ca-app-pub-XXXX/ZZZZ` | Page du bloc d'annonces |

   → Je les intègre (2 endroits : `app.json` + `REWARDED_AD_UNIT_IDS` dans `src/lib/monetization.ts`), je rebuild, on smoke-teste, puis activation par `UPDATE public.feature_flags SET enabled = true WHERE key = 'rewarded_ads';` (désactivable à tout moment de la même façon — kill-switch sans rebuild).

## C. Message de consentement RGPD (~5 min, dans AdMob)
1. AdMob → **Confidentialité et messages → Message RGPD** → créer, choisir tes apps, publier.
2. Optionnel : le message « États américains » si tu vises les US.
3. Rien à coder : l'app appelle déjà `gatherConsent()` — le formulaire s'affichera tout seul dès que le message est publié.

## D. app-ads.txt (~10 min, après l'étape A)
1. AdMob te donne une ligne du type `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`.
2. Elle doit être servie sur `https://<ton-domaine-développeur>/app-ads.txt` — pour iOS c'est le domaine de l'**URL marketing/développeur déjà renseignée sur ta fiche App Store** (celui qu'AdMob crawle) ; pour Android, celui que tu déclareras sur la fiche Play.
3. Envoie-moi la ligne + le domaine : **je peux créer et déployer le fichier** (Vercel/GitHub Pages, gratuit).

## E. Au moment de la soumission aux stores
### Play Console (déjà sur ta liste pour la release Android)
- Contenu de l'application → **Annonces : « Oui, contient des annonces »**.
- **Data Safety**, déclarer pour AdMob : collecte « Identifiants d'appareil ou autres ID » + « Interactions avec l'application » ; finalité « Publicité ou marketing » ; données non partageables à la demande ; chiffrées en transit. (Je te préparerai les réponses champ par champ au moment du questionnaire.)
- Après publication : AdMob → ton app → **associer à la fiche Play Store** (nécessaire pour sortir du statut « préparation » et avoir un vrai taux de remplissage).

### App Store Connect (⚠️ AVANT de soumettre la prochaine mise à jour iOS)
L'app est déjà en ligne : la version actuelle n'a pas le SDK, rien à faire dessus. Mais la **première mise à jour qui embarque le SDK pubs** doit passer la review avec :
- **App Privacy** (fiche → App Privacy, modifiable à tout moment) : déclarer « Identifiers (Device ID) » + « Advertising Data », usage « Third-Party Advertising », **tracking = oui**. À faire avant de soumettre, sinon rejet quasi certain (le binaire contiendra le prompt ATT).
- Le prompt ATT est déjà dans le code (affiché avant la première pub).
- L'app AdMob iOS sera déjà liée à la fiche (étape B) — rien d'autre à faire.

## F. Argent & structure juridique (rien à faire aujourd'hui)
1. **Seuil** : Google verse à partir de **70 €** de solde, par virement (RIB à renseigner à ce moment-là + vérification d'identité, parfois PIN postal — gratuit mais long, anticipe de ~1 mois).
2. **Structure** : quand ton solde approche 70 €, crée une **micro-entreprise** (gratuit, ~15 min sur procedures.inpi.fr, activation 1-2 semaines). 0 € de revenus = 0 € de cotisations ; ensuite ~21-26 % du CA encaissé (classification BIC/BNC à confirmer avec l'URSSAF). CFE exonérée si CA ≤ 5 000 €/an. Pas de comptable, pas de compte pro sous 10 k€/an.
3. À l'activation des paiements : formulaire fiscal US (W-8BEN, 5 min en ligne dans le profil de paiement) + demander un **n° de TVA intracommunautaire** à ton SIE (gratuit — Google paie depuis l'Irlande) et déposer une **DES** les mois où Google te verse.
4. SASU/EURL : inutiles à ce stade (≈ 1 000 €+/an de frais).

---

## Récap des dépendances
| Étape | Qui | Débloque |
|---|---|---|
| Code + tests + build (IDs test) | ✅ fait | — |
| A+B : compte AdMob + 4 IDs | **Paul (~30 min)** | vraies pubs (revenus) |
| C : message RGPD | **Paul (~5 min)** | revenus zone UE |
| D : app-ads.txt | Paul (ligne+domaine) → moi (déploiement) | taux de remplissage |
| E : déclarations stores + liaison fiches | Paul (à la soumission) | pubs servies à 100 % |
| Flip du flag `rewarded_ads` | moi (1 SQL, réversible) | visibilité joueurs |
| F : micro-entreprise + RIB | Paul (à ~70 € de solde) | encaisser |
