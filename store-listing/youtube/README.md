# Kit YouTube GeoG — Shorts & vidéos longues (16 langues)

Métadonnées prêtes à coller dans YouTube Studio pour la chaîne GeoG.
Couvre les 16 langues de l'app (`src/i18n/locales.ts`), au format Short **et** vidéo longue.

- `blocs-communs.md` — liens, hashtags, commentaire épinglé, chapitres, checklist Studio
- `descriptions-shorts.md` — titres + descriptions Shorts, 16 langues
- `descriptions-longues.md` — titres + descriptions longues, 16 langues

## Comment s'en servir dans YouTube Studio

1. **Langue par défaut de la vidéo** : Studio → vidéo → Détails → *Plus d'options* → « Langue de la vidéo ».
   Mets la langue dans laquelle tu parles / écris le titre principal.
2. **Traductions** : Studio → Sous-titres → *Ajouter une langue* → « Titre et description ».
   C'est là que tu colles les 15 autres langues. YouTube sert alors automatiquement le titre
   et la description dans la langue du spectateur — c'est le levier le plus rentable pour une
   app dispo dans 16 langues, et quasiment personne ne le fait.
3. **Short vs long** : un Short n'affiche que les ~1re ligne + les hashtags avant le « … ».
   Donc l'accroche et le lien doivent être dans les 100 premiers caractères.
4. **3 hashtags max** visibles. Au-delà de 15, YouTube les ignore tous.
5. **Lien cliquable** : les liens dans les descriptions de Shorts sont cliquables sur mobile,
   mais pas mis en avant. Double-les avec le commentaire épinglé (voir `blocs-communs.md`).

## Choix éditoriaux

- **Un seul CTA par vidéo** : `playgeog.com/play`. Le défi du jour est jouable dans le
  navigateur, sans compte, sans téléchargement — c'est la friction la plus basse possible.
  Les liens stores viennent en second.
- **Le mode Rankle est mis en avant** sur les Shorts (dossier `/rankle`) : c'est le mode le
  plus « scroll-stopping » — on voit un pays, on doit choisir le thème où il se classe le
  mieux. Le spectateur peut jouer dans sa tête en 3 secondes. C'est ça qui fait le watch time.
- **Pas de clickbait mensonger** : les titres promettent un défi, pas un « 99 % échouent ».
