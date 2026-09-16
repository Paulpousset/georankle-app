# GeoG v5.5.0 — Texte promotionnel & Nouveautés (FR / EN)

Où coller, dans App Store Connect → la version 5.5.0 → chaque localisation :
- **Texte promotionnel** (170 car. max) — modifiable sans nouvelle review.
- **Nouveautés de cette version** (4000 car. max) — figé une fois la version publiée.

Les mêmes textes tiennent en < 500 caractères → ils servent aussi de
**notes de version Play** pour la vc20.

---

## 1. Texte promotionnel

**🇫🇷 Français (151/170) :**
```
GeoG parle maintenant 16 langues 🌍 Duels en ligne, défi du jour, revanche immédiate et 300 niveaux d'aventure : la géo du monde entier, dans ta langue.
```

**🇬🇧 English (142/170):**
```
GeoG now speaks 16 languages 🌍 Online duels, a daily challenge, instant rematches and 300 story levels: world geography, in your own language.
```

---

## 2. Nouveautés de cette version

### Version principale — à utiliser si la 5.4.0 est bien passée en review

**🇫🇷 Français (430/500) :**
```
🌍 GeoG parle 16 langues !
Français, anglais, espagnol, portugais, allemand, italien, russe, turc, polonais, néerlandais, indonésien, vietnamien, thaï, ukrainien, roumain et grec — jeu, pays et capitales compris.

⚔️ Revanche en ligne : à la fin d'un duel, un tap suffit pour repartir contre le même adversaire.

🔗 Les invitations d'amis et de ligue ouvrent enfin l'app directement.

🖥️ Version web sur ordinateur : affichage revu.
```

**🇬🇧 English (419/500):**
```
🌍 GeoG now speaks 16 languages!
English, French, Spanish, Portuguese, German, Italian, Russian, Turkish, Polish, Dutch, Indonesian, Vietnamese, Thai, Ukrainian, Romanian and Greek — game, country and capital names included.

⚔️ Online rematch: after a duel, one tap sends you straight back in against the same opponent.

🔗 Friend and league invites now open the app directly.

🖥️ Desktop web version: redesigned layout.
```

### Version longue — à utiliser si la 5.4.0 n'a JAMAIS été publiée sur l'App Store

(La build 38 de la 5.4.0 était sur ASC mais la version restait à créer à la main.
Vérifie dans App Store Connect quelle est la dernière version « Prête à la vente » :
si c'est une 5.3.x, prends ce texte-là, sinon le précédent.)

**🇫🇷 Français :**
```
🌍 GeoG parle 16 langues !
Français, anglais, espagnol, portugais, allemand, italien, russe, turc, polonais, néerlandais, indonésien, vietnamien, thaï, ukrainien, roumain et grec — jeu, pays et capitales compris.

⚔️ Revanche en ligne : à la fin d'un duel, un tap suffit pour repartir contre le même adversaire.

🎬 Débuts et fins de partie repensés : ton globe en vedette avant de jouer, récapitulatif complet à l'arrivée, et « rejouer la même partie » en un tap.

📚 Solo apprentissage : fiche du pays à la fin de chaque partie, révision de tes erreurs et mode entraînement.

🗺️ Choisis ton continent sur 8 modes de jeu.

🎨 Tes globes de la boutique s'affichent enfin en jeu, dans Globe Géo, Régions et Frontières.

🏆 41 thèmes pour Rankle, Streak et Plus ou Moins : football, JO, UNESCO, sommets, températures…

🔗 Les invitations d'amis et de ligue ouvrent enfin l'app directement.

Bon voyage !
```

**🇬🇧 English:**
```
🌍 GeoG now speaks 16 languages!
English, French, Spanish, Portuguese, German, Italian, Russian, Turkish, Polish, Dutch, Indonesian, Vietnamese, Thai, Ukrainian, Romanian and Greek — game, country and capital names included.

⚔️ Online rematch: after a duel, one tap sends you straight back in against the same opponent.

🎬 Redesigned game starts and endings: your globe takes the stage before you play, a full recap when you finish, and "play the same game again" in one tap.

📚 Learning solo: a country card at the end of every game, a review of your own mistakes and a practice mode.

🗺️ Pick your continent in 8 game modes.

🎨 The globes you buy in the shop now show up in game, in Geo Globe, Regions and Borders.

🏆 41 themes for Rankle, Streak and Higher or Lower: football, Olympics, UNESCO, peaks, temperatures…

🔗 Friend and league invites now open the app directly.

Enjoy the trip!
```

---

## 3. Rappels avant de soumettre

- **App Privacy** doit être à jour AVANT la soumission (AdMob lié, ATT) — cf. `ios-app-store-status`.
- La build iOS de la 5.5.0 exige un **login Apple interactif** (capability Associated
  Domains absente du profil) : `npx eas build --platform ios --profile production --auto-submit`
  avec le compte `polo.pousset@gmail.com`.
- Les mêmes textes courts (< 500 car.) servent de notes de version Play pour la vc20.
