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
🗺️ Mode Histoire : recharge de vies, portails d'étoiles, 500 niveaux et animaux 3D sur la carte.

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
🗺️ Story mode: life refills, star gates, 500 levels and 3D animals on the map.

🔊 Floating sound button and a clearer language button.

🛠️ Online rematch fixed; matches no longer count in solo leaderboards.

🛠️ Under the hood
Upcoming fixes will arrive without a store update.
```

---

## 3. Blocs pour `scripts/play_promote.mjs --notes` (Play, < 500 car.)

<fr-FR>⚔️ Défie un ami : partage ton score, il joue dans son navigateur.
🔥 Rappel du soir si ta série est menacée.
👋 Bonus de retour : pièces offertes après une semaine d'absence.
🎁 Lien de parrainage en fin de partie (50 pièces chacun).
🏆 Défi du Jour : classement général.
🌍 Globes 3D plus beaux ; les petits pays changent enfin de couleur.
🗺️ Mode Histoire : recharge de vies, portails d'étoiles, 500 niveaux, animaux 3D.
🔊 Bouton son flottant.
🛠️ Revanche en ligne et classements solo corrigés.</fr-FR>

<en-US>⚔️ Challenge a friend: share your score, they play in their browser.
🔥 Evening reminder if your streak is at risk.
👋 Welcome-back bonus: free coins after a week away.
🎁 Your referral link offered at the end of a game (50 coins each).
🏆 Daily Challenge: overall ranking and podium (+20/+10/+5 coins).
🌍 Nicer 3D globes; small countries finally change color.
🗺️ Story mode: life refills, star gates, 500 levels, 3D animals.
🔊 Floating sound button.
🛠️ Online rematch and solo leaderboards fixed.</en-US>

<es-ES>⚔️ Reta a un amigo: comparte tu puntuación y jugará en su navegador.
🔥 Aviso nocturno si tu racha corre peligro.
👋 Bono de regreso: monedas tras una semana sin jugar.
🎁 Tu enlace de invitación al final de la partida (50 monedas cada uno).
🏆 Reto diario: clasificación general y podio.
🌍 Globos 3D más bonitos; los países pequeños cambian de color.
🗺️ Modo Historia: recarga de vidas, portales, 500 niveles y animales 3D.
🔊 Botón de sonido flotante.
🛠️ Revancha en línea y rankings corregidos.</es-ES>

<pt-PT>⚔️ Desafia um amigo: partilha a pontuação e ele joga no browser.
🔥 Lembrete à noite se a tua sequência estiver em risco.
👋 Bónus de regresso: moedas após uma semana de ausência.
🎁 O teu link de convite no fim do jogo (50 moedas cada).
🏆 Desafio diário: classificação geral e pódio (+20/+10/+5).
🌍 Globos 3D mais bonitos; países pequenos mudam de cor.
🗺️ Modo História: recarga de vidas, portais, 500 níveis e animais 3D.
🔊 Botão de som flutuante.
🛠️ Desforra online e rankings corrigidos.</pt-PT>

<de-DE>⚔️ Fordere Freunde heraus: Score teilen, sie spielen im Browser.
🔥 Abenderinnerung, wenn deine Tagesserie in Gefahr ist.
👋 Willkommen-zurück-Bonus: Gratis-Münzen nach einer Woche Pause.
🎁 Dein Einladungslink am Spielende (je 50 Münzen).
🏆 Tagesaufgabe: Gesamtwertung und Podium (+20/+10/+5).
🌍 Schönere 3D-Globen; kleine Länder wechseln die Farbe.
🗺️ Story-Modus: Leben aufladen, Sternentore, 500 Level, 3D-Tiere.
🔊 Schwebender Sound-Button.
🛠️ Online-Revanche und Solo-Ranglisten repariert.</de-DE>

<it-IT>⚔️ Sfida un amico: condividi il punteggio, giocherà nel browser.
🔥 Promemoria serale se la tua serie giornaliera è a rischio.
👋 Bonus di ritorno: monete dopo una settimana di assenza.
🎁 Il tuo link d'invito a fine partita (50 monete ciascuno).
🏆 Sfida del giorno: classifica generale e podio (+20/+10/+5).
🌍 Globi 3D più belli; i paesi piccoli cambiano colore.
🗺️ Modalità Storia: ricarica vite, portali, 500 livelli e animali 3D.
🔊 Pulsante audio mobile.
🛠️ Rivincita online e classifiche corrette.</it-IT>
