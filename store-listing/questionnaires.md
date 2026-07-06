# GeoG — Réponses aux questionnaires Google Play (à cocher telles quelles)

> Console → Politique > Contenu de l'application. Chaque section ci-dessous correspond à un formulaire.

---

## 1. Sécurité des données (Data safety)

**L'app collecte-t-elle ou partage-t-elle des données utilisateur ?** → **Oui, collecte** / **Non, ne partage pas**
(PostHog et Sentry sont des sous-traitants qui traitent pour notre compte, hébergés en UE — ce n'est pas du « partage » au sens de Google.)

**Toutes les données sont-elles chiffrées en transit ?** → **Oui** (HTTPS partout : Supabase, PostHog, Sentry)

**Proposez-vous un moyen de demander la suppression des données ?** → **Oui**
- Suppression in-app : Profil → « Supprimer mon compte »
- URL à renseigner : `https://geogames-mu.vercel.app/privacy.html` (la procédure y est décrite)

### Types de données à déclarer

| Catégorie | Donnée | Collectée ? | Facultative ? | Finalité |
|---|---|---|---|---|
| Informations personnelles | Adresse e-mail | Oui | Non (requis pour compte en ligne) | Fonctionnement de l'app, gestion du compte |
| Informations personnelles | ID utilisateur (pseudo, id de compte) | Oui | Non | Fonctionnement de l'app (classements, amis) |
| Photos et vidéos | Photos | Oui | **Oui** (avatar choisi volontairement) | Fonctionnement de l'app (photo de profil) |
| Activité dans l'app | Interactions dans l'app | Oui | Non | Analyse (PostHog, hébergé UE) |
| Informations et performances de l'app | Journaux de plantage | Oui | Non | Analyse / stabilité (Sentry, hébergé UE) |
| Informations et performances de l'app | Diagnostics | Oui | Non | Analyse / stabilité |

**Ne PAS déclarer** : localisation (jamais collectée), contacts, micro (permission bloquée au build), historique web, infos financières (aucun achat), santé, messages.

> Toutes les lignes : « Traitement éphémère : Non », « Partagée : Non ».

---

## 2. Classification du contenu (IARC)

- **Adresse e-mail** : paul.pousset@gmail.com
- **Catégorie** : Jeu
- Violence : **Non** (à toutes les questions)
- Contenu sexuel : **Non**
- Langage grossier : **Non**
- Substances contrôlées : **Non**
- Jeux d'argent (réels ou simulés) : **Non**
- **Interactions entre utilisateurs : OUI** (multijoueur en ligne, pseudos visibles, invitations entre amis — pas de chat libre)
- Partage de la position : **Non**
- Achats numériques : **Non** (aucun achat intégré actif)
- Résultat attendu : **PEGI 3 / ESRB Everyone** avec mention « interactions en ligne »

---

## 3. Autres déclarations « Contenu de l'application »

| Formulaire | Réponse |
|---|---|
| Public cible | **13 ans et plus** (évite le programme « Familles » et ses contraintes ; l'app ne cible pas les enfants) |
| L'app est-elle destinée aux enfants ? | Non |
| Contient-elle des publicités ? | **Non** (AdMob désactivé par feature flag, aucune pub affichée) |
| Accès à l'app (app access) | Compte **non requis** pour jouer en solo → cocher « Toutes les fonctionnalités sont disponibles sans conditions particulières » MAIS le multijoueur demande un compte : fournir un **compte de test** (créer un compte dédié, ex. `test.google@…` + mot de passe) et les instructions : « Se connecter via l'écran Profil pour accéder au multijoueur » |
| Application d'actualités | Non |
| App de traçage COVID | Non |
| Fonctionnalités financières | Aucune |
| App gouvernementale | Non |
| Sécurité des enfants (CSAE) | Déclarations standards : pas de contenu généré par des mineurs, signalement via e-mail de contact |

---

## 4. Rappels importants

- **Piste de départ** : Test interne (déjà configurée dans `eas.json` → `track: "internal"`). Ajoute ton propre e-mail Google dans la liste des testeurs internes pour installer l'app immédiatement.
- **Exigence « 12 testeurs / 14 jours »** : si ton compte personnel a été créé après le 13 nov. 2023, Google exige un test fermé avec ≥ 12 testeurs actifs pendant 14 jours avant de pouvoir demander l'accès à la production. Le bandeau sur le tableau de bord de la console te le dira.
- **Déclaration publicité = Non** : si un jour AdMob est activé (flag ON), il faudra mettre à jour Data safety (ID publicitaire) + la déclaration « Contient des annonces » AVANT la release correspondante.
- **Compte de test pour la review Google** : crée un compte jetable (pas paul@paul.fr l'admin !) et mets-le dans « App access ».
