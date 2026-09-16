# Prompt à coller dans Claude pour Chrome

Couvre **uniquement** les étapes A (Google Cloud) et B (Supabase côté Google) du
`guide-connexion-apple-google.md`. Les étapes Apple (D/E) sont volontairement
exclues : 2FA, clé privée `.p8` non re-téléchargeable, et une capability dont
la modification invalide les profils de provisioning.

**Avant de lancer** : sois connecté dans Chrome à ton compte Google Cloud
(projet GeoG / celui du service account Play) et à Supabase.

---

Tu vas configurer la connexion Google pour mon app mobile "GeoG". Reste
strictement dans les consoles Google Cloud et Supabase. Ne touche à AUCUNE
autre configuration existante, ne supprime rien, et ne va sur aucun site Apple.
Montre-moi chaque écran avant de valider une création.

Valeurs exactes à utiliser (ne les invente pas, ne les devine pas) :
- Bundle ID iOS et package Android : com.paulpousset.geog
- Domaine : playgeog.com
- Redirect URI Supabase : https://exwfggaytrywnfzcqpel.supabase.co/auth/v1/callback
- Projet Supabase : exwfggaytrywnfzcqpel

ÉTAPE 1 — console.cloud.google.com, écran de consentement OAuth
(APIs & Services → OAuth consent screen / Google Auth Platform → Branding) :
- Type External, nom de l'app "GeoG", email de support = mon adresse.
- Authorized domain : playgeog.com
- N'ajoute AUCUN logo (un logo déclenche une vérification manuelle Google).
- N'ajoute aucun scope supplémentaire.
- Publie l'écran (statut "In production").

ÉTAPE 2 — APIs & Services → Credentials → Create credentials → OAuth client ID.
Crée TROIS clients et donne-moi les IDs à la fin :
a) Type "Web application", nom "GeoG Web (Supabase)".
   Authorized redirect URI : https://exwfggaytrywnfzcqpel.supabase.co/auth/v1/callback
   → note le client ID ET le client secret.
b) Type "iOS", bundle ID : com.paulpousset.geog
   → note le client ID et le "iOS URL scheme" affiché (com.googleusercontent.apps.xxx).
c) Type "Android", package : com.paulpousset.geog
   Pour le SHA-1 : demande-le-moi, je te le fournirai (deux empreintes à venir,
   donc il faudra créer un deuxième client Android identique avec la seconde).

ÉTAPE 3 — supabase.com/dashboard/project/exwfggaytrywnfzcqpel/auth/providers
→ provider Google :
- Enable ON
- Client ID / Client Secret = ceux du client WEB uniquement
- Champ "Authorized Client IDs" : colle TOUS les client IDs séparés par des
  virgules (web + iOS + les clients Android). Ce champ est ce qui fait accepter
  les connexions natives — ne l'oublie pas et ne mets pas le secret dedans.

ÉTAPE 4 — .../auth/url-configuration → Redirect URLs, ajoute ces deux entrées
sans toucher aux existantes :
- https://playgeog.com/**
- http://localhost:8081/**

À LA FIN, donne-moi un récapitulatif copiable :
- client ID web + secret
- client ID iOS + son URL scheme
- client ID(s) Android
- confirmation que le provider Google Supabase est ON et que les 2 redirect URLs sont ajoutées
