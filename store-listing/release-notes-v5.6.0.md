# GeoG v5.6.0 — Texte promotionnel & Nouveautés (FR / EN)

Où coller, dans App Store Connect → la version 5.6.0 → chaque localisation :
- **Texte promotionnel** (170 car. max) — modifiable sans nouvelle review.
- **Nouveautés de cette version** (4000 car. max) — figé une fois la version publiée.

Les mêmes textes tiennent en < 500 caractères → ils servent aussi de
**notes de version Play** pour la vc21.

Build iOS : 47 (le 46 a échoué au signing) · Android : version code 21 · commit 47d4ca4 (16/09/2026).

---

## 1. Texte promotionnel

**🇫🇷 Français :**
```
Fins de partie animées, podium en ligne, invitations dans 16 langues 🌍 Duels, défi du jour, ligue et 300 niveaux d'aventure : la géo du monde entier, dans ta langue.
```

**🇬🇧 English:**
```
Animated end screens, online podium, invites in 16 languages 🌍 Duels, daily challenge, league and 300 story levels: world geography, in your own language.
```

---

## 2. Nouveautés de cette version

**🇫🇷 Français :**
```
🎉 Nouvelles fins de partie
Étoiles qui tombent en mode Histoire, série et record perso sur le défi du jour, duel qui bascule, podium en mêlée générale : chaque fin de partie a désormais son animation.

🏆 Record personnel
Ton meilleur score s'affiche et se met à jour à la fin de chaque défi.

🔗 Invitations
Le lien envoyé à un ami s'ouvre dans sa langue (16 langues) et mène directement au store.

🛠️ Corrections
La boutique d'avatars affiche bien ta tenue et ton globe dès l'enregistrement, et le partage de résultats fonctionne à nouveau.
```

**🇬🇧 English:**
```
🎉 New end-of-game screens
Falling stars in Story mode, streak and personal best on the daily challenge, swinging duels, a podium for free-for-all: every ending now has its own animation.

🏆 Personal best
Your top score is shown and updated at the end of every challenge.

🔗 Invites
The link you send a friend opens in their language (16 languages) and goes straight to the store.

🛠️ Fixes
The avatar shop now shows your outfit and globe right after saving, and sharing your results works again.
```

---

## 3. Blocs pour `scripts/play_promote.mjs --notes` (Play, < 500 car.)

<fr-FR>🎉 Nouvelles fins de partie : étoiles en mode Histoire, série et record perso sur le défi du jour, podium en mêlée générale.
🏆 Record personnel affiché à la fin de chaque défi.
🔗 Les invitations s'ouvrent dans la langue de l'ami (16 langues) et mènent au store.
📱 Version web mobile plus stable, corrections sur la boutique d'avatars.</fr-FR>

<en-US>🎉 New end-of-game screens: stars in Story mode, streak and personal best on the daily challenge, a podium for free-for-all.
🏆 Personal best shown at the end of every challenge.
🔗 Invites open in your friend's language (16 languages) and go straight to the store.
📱 Steadier mobile web version, fixes in the avatar shop.</en-US>
