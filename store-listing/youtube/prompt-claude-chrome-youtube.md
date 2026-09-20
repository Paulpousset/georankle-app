# Prompt à coller dans Claude Code (session locale, Chrome connecté)

> Avant de coller : Chrome ouvert, extension Claude active, connecté au compte Google
> qui possède la chaîne GeoG. Lance `claude` depuis la racine du repo.

---

Tu vas remplir les métadonnées de mes vidéos YouTube via Claude in Chrome.

**Périmètre strict.** Tu ne travailles que sur `studio.youtube.com`. Tu ne vas sur aucun
autre site. Tu ne touches à aucune vidéo déjà publiée sans me demander d'abord. Tu ne
publies rien : tu t'arrêtes avant, et c'est moi qui appuie sur Publier.

**Le contenu à utiliser est déjà écrit**, dans ce repo :
- `store-listing/youtube/descriptions-shorts.md` — 3 titres + description, 16 langues
- `store-listing/youtube/descriptions-longues.md` — titre + description, 16 langues
- `store-listing/youtube/blocs-communs.md` — hashtags, commentaire épinglé, chapitres, checklist

Lis ces trois fichiers avant de commencer. N'invente pas de texte : si quelque chose manque
pour une vidéo précise, demande-le-moi.

## ÉTAPE 0 — vérification

1. Liste mes onglets Chrome ouverts.
2. Ouvre un **nouvel onglet** sur :
   https://studio.youtube.com/channel/UCZ9tRff3_emxT38vWnnfRDg/videos/short
3. Confirme-moi que tu es bien sur la chaîne **GeoG** et dis-moi combien de vidéos tu vois,
   combien sont publiées et combien sont en brouillon. **Ne modifie rien à ce stade.**

## ÉTAPE 1 — inventaire

Fais-moi un tableau de toutes les vidéos de la chaîne :

| # | Titre actuel | Short / Long | Statut | Vues | Description actuelle (vide ou non) |

Puis attends ma validation avant de modifier quoi que ce soit.

## ÉTAPE 2 — une vidéo à la fois

Pour chaque vidéo que je te désigne :

1. **Regarde la miniature et le titre** et dis-moi de quel mode de jeu il s'agit
   (Rankle, Globe Géo, Drapeaux, Capitales, Devinez le Pays, Plus ou Moins, Streak,
   Défis Pays, ou multijoueur). Si tu n'arrives pas à trancher, demande-moi.
2. **Propose-moi** le titre (parmi les variantes A/B/C du fichier) et la description
   qui correspondent, en français d'abord. Montre-moi ce que tu vas coller.
3. Après mon OK : Détails → colle le titre et la description.
4. **Plus d'options → Langue de la vidéo** : mets `Français`.
5. **Playlist** : assigne la playlist du mode correspondant. Si elle n'existe pas,
   demande-moi avant d'en créer une.
6. Enregistre. **Ne publie pas.**

## ÉTAPE 3 — les 15 traductions

Une fois le français en place sur une vidéo :

1. Va dans **Sous-titres** (menu de gauche de la vidéo) → **Ajouter une langue**.
2. Pour chacune des 15 autres langues (en, es, pt, de, it, ru, tr, pl, nl, id, vi, th,
   uk, ro, el) : clique sur « Titre et description » → colle le titre et la description
   de cette langue depuis le fichier correspondant → Publier la traduction.
3. Attention : n'ajoute **pas** de fichier de sous-titres, uniquement « Titre et description ».
4. Dis-moi quand les 16 langues sont en place pour cette vidéo.

C'est long et répétitif. Enchaîne sans me redemander confirmation à chaque langue —
préviens-moi seulement si une langue est refusée ou si l'interface change.

## ÉTAPE 4 — commentaire épinglé

Pour chaque vidéo **publiée** (pas les brouillons) : poste le commentaire épinglé de
`blocs-communs.md` dans la langue de la vidéo, puis épingle-le.
Montre-moi le texte avant de poster.

## ÉTAPE 5 — récapitulatif

À la fin, donne-moi :
- la liste des vidéos traitées, avec pour chacune : titre FR retenu, nombre de langues posées,
  playlist assignée, commentaire épinglé oui/non
- ce qui reste à faire de mon côté (publication, miniatures, vidéos non traitées)
- toute incohérence que tu as repérée dans les fichiers de description

## Règles

- **Montre avant de coller.** Un aperçu du texte, pas juste « c'est fait ».
- **Ne clique jamais sur Supprimer, Rendre privé, ou Publier.**
- Si un élément de l'interface ne répond pas après 2 ou 3 essais, arrête-toi et dis-le-moi
  plutôt que de réessayer en boucle.
- Si YouTube affiche une boîte de dialogue modale, préviens-moi : ça bloque l'extension.
- Si tu constates que mes vidéos ne correspondent pas aux descriptions préparées (par exemple
  ce ne sont pas des captures de gameplay), **arrête-toi et dis-le-moi** au lieu de coller
  un texte qui ne colle pas au contenu.
