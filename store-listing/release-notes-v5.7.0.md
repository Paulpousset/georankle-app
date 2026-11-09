# GeoG v5.7.0 — Texte promotionnel & Nouveautés (FR / EN)

Où coller, dans App Store Connect → la version 5.7.0 → chaque localisation :
- **Texte promotionnel** (170 car. max) — modifiable sans nouvelle review.
- **Nouveautés de cette version** (4000 car. max) — figé une fois la version publiée.

Les mêmes textes tiennent en < 500 caractères → ils servent aussi de
**notes de version Play**.

Premier build produit par `release.yml` (tag `v5.7.0`). C'est aussi le premier
binaire avec `expo-updates` : à partir de lui, les corrections JavaScript
arrivent à chaud sans repasser par les stores.

---

## 1. Texte promotionnel

**🇫🇷 Français :**
```
Défie tes amis sur n'importe quelle partie, garde ta série grâce au rappel du soir, et reviens gagner des pièces 🌍 Drapeaux, capitales, globe 3D, duels en ligne.
```

**🇬🇧 English:**
```
Challenge friends on any game, keep your streak with the evening reminder, and come back to earn coins 🌍 Flags, capitals, 3D globe, online duels.
```

---

## 2. Nouveautés de cette version

**🇫🇷 Français :**
```
⚔️ Défie un ami
Chaque fin de partie propose maintenant de partager ton score avec un lien : ton ami joue le même mode directement dans son navigateur, sans rien installer.

🔥 Ta série est protégée
Si tu n'as pas encore joué le défi du jour en fin de journée, un rappel te dit combien de temps il te reste pour garder ta série.

👋 Bonus de retour
Absent une semaine ou plus ? Tu es accueilli avec des pièces offertes.

🎁 Parrainage plus visible
Ton lien d'invitation est proposé en fin de partie : vous gagnez chacun 50 pièces.

🏆 Défi du Jour : classement général avec podium (+20/+10/+5 pièces).

🌍 Globes 3D plus beaux : Mars refait, globe glacé, et les petits pays changent enfin de couleur.
🗺️ Mode Histoire : recharge de vies, portails d'étoiles, 1000 niveaux et animaux 3D sur la carte.

📏 Nouveau mode « À l'échelle » et ✂️ « Partage équitable » (couper une zone en parts de population égales).
🎃 Halloween : un défi « pays fantômes » par jour jusqu'au 31/10.
🎨 12 nouveaux cosmétiques (globes, fonds cosmos).

🔊 Bouton son flottant et bouton de langue plus clair.

🛠️ Revanche en ligne corrigée ; les matchs ne comptent plus dans les classements solo.

🛠️ Sous le capot
Les prochaines corrections arriveront sans mise à jour du store.
```

**🇬🇧 English:**
```
⚔️ Challenge a friend
Every end screen now lets you share your score with a link: your friend plays the same mode straight in their browser, nothing to install.

🔥 Your streak is protected
If you have not played today's challenge by the evening, a reminder tells you how long you have left to keep your streak.

👋 Welcome-back bonus
Away for a week or more? You are greeted with free coins.

🎁 Referral, easier to find
Your invite link is offered at the end of a game: you both earn 50 coins.

🏆 Daily Challenge: overall ranking with podium (+20/+10/+5 coins).

🌍 Nicer 3D globes: redone Mars, icy globe, and small countries finally change color.
🗺️ Story mode: life refills, star gates, 1000 levels and 3D animals on the map.

📏 New "To Scale" mode and ✂️ "Fair Share" (cut an area into equal population shares).
🎃 Halloween: one "ghost countries" challenge a day until 10/31.
🎨 12 new cosmetics (globes, cosmos backgrounds).

🔊 Floating sound button and a clearer language button.

🛠️ Online rematch fixed; matches no longer count in solo leaderboards.

🛠️ Under the hood
Upcoming fixes will arrive without a store update.
```

---

## 3. Blocs pour `scripts/play_promote.mjs --notes` (Play, < 500 car.)

<fr-FR>📏 Nouveau mode « À l'échelle » : compare la taille des pays.
✂️ Nouveau mode « Partage équitable » : coupe une zone en parts de population égales.
🎃 Halloween : un défi « pays fantômes » par jour jusqu'au 31/10.
🗺️ Mode Histoire : 1000 niveaux.
🌍 12 nouveaux cosmétiques, fonds 3D plus nets.
⚔️ Défie un ami : partage ton score, il joue dans son navigateur.
🔥 Rappel du soir si ta série est menacée, bonus de retour après une semaine.
🎁 Parrainage en fin de partie (50 pièces chacun).</fr-FR>

<en-US>📏 New "To Scale" mode: compare the size of countries.
✂️ New "Fair Share" mode: cut an area into equal population shares.
🎃 Halloween: one "ghost countries" challenge a day until 10/31.
🗺️ Story mode: 1000 levels.
🌍 12 new cosmetics, sharper 3D backgrounds.
⚔️ Challenge a friend: share your score, they play in their browser.
🔥 Evening reminder if your streak is at risk, welcome-back bonus after a week.
🎁 Referral link at the end of a game (50 coins each).</en-US>

<es-ES>📏 Nuevo modo «A escala»: compara el tamaño de los países.
✂️ Nuevo modo «Reparto justo»: divide una zona en partes iguales de población.
🎃 Halloween: un reto de «países fantasma» al día hasta el 31/10.
🗺️ Modo Historia: 1000 niveles.
🌍 12 nuevos cosméticos, fondos 3D más nítidos.
⚔️ Reta a un amigo: comparte tu puntuación y jugará en su navegador.
🔥 Aviso nocturno si tu racha corre peligro, bono de regreso tras una semana.
🎁 Enlace de invitación al final de la partida (50 monedas cada uno).</es-ES>

<pt-PT>📏 Novo modo «À escala»: compara o tamanho dos países.
✂️ Novo modo «Partilha justa»: divide uma zona em partes iguais de população.
🎃 Halloween: um desafio de «países fantasma» por dia até 31/10.
🗺️ Modo História: 1000 níveis.
🌍 12 novos cosméticos, fundos 3D mais nítidos.
⚔️ Desafia um amigo: partilha a pontuação e ele joga no browser.
🔥 Lembrete à noite se a sequência estiver em risco, bónus de regresso após uma semana.
🎁 Link de convite no fim do jogo (50 moedas cada).</pt-PT>

<de-DE>📏 Neuer Modus „Im Maßstab": vergleiche die Größe von Ländern.
✂️ Neuer Modus „Fair geteilt": teile ein Gebiet in gleich große Bevölkerungsanteile.
🎃 Halloween: täglich eine „Geisterländer"-Aufgabe bis 31.10.
🗺️ Story-Modus: 1000 Level.
🌍 12 neue Kosmetika, schärfere 3D-Hintergründe.
⚔️ Fordere Freunde heraus: Score teilen, sie spielen im Browser.
🔥 Abenderinnerung bei gefährdeter Serie, Willkommen-zurück-Bonus nach einer Woche.
🎁 Einladungslink am Spielende (je 50 Münzen).</de-DE>

<it-IT>📏 Nuova modalità «In scala»: confronta la dimensione dei paesi.
✂️ Nuova modalità «Divisione equa»: dividi un'area in parti uguali di popolazione.
🎃 Halloween: una sfida «paesi fantasma» al giorno fino al 31/10.
🗺️ Modalità Storia: 1000 livelli.
🌍 12 nuovi cosmetici, sfondi 3D più nitidi.
⚔️ Sfida un amico: condividi il punteggio, giocherà nel browser.
🔥 Promemoria serale se la serie è a rischio, bonus di ritorno dopo una settimana.
🎁 Link d'invito a fine partita (50 monete ciascuno).</it-IT>
