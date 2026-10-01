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

🌍 Globes 3D plus beaux : Mars refait, globe glacé, régions plus lisibles.

🔊 Bouton son flottant et bouton de langue plus clair.

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

🌍 Nicer 3D globes: redone Mars, icy globe, clearer regions.

🔊 Floating sound button and a clearer language button.

🛠️ Under the hood
Upcoming fixes will arrive without a store update.
```

---

## 3. Blocs pour `scripts/play_promote.mjs --notes` (Play, < 500 car.)

<fr-FR>⚔️ Défie un ami : partage ton score en fin de partie, il joue le même mode dans son navigateur.
🔥 Rappel du soir si ta série du défi du jour est en danger.
👋 Bonus de retour : des pièces offertes après une semaine d'absence.
🎁 Ton lien de parrainage proposé en fin de partie (50 pièces chacun).
🏆 Défi du Jour : classement général et podium (+20/+10/+5 pièces).
🌍 Globes 3D plus beaux : Mars refait, globe glacé, régions plus lisibles.
🔊 Bouton son flottant et bouton de langue plus clair.</fr-FR>

<en-US>⚔️ Challenge a friend: share your score at the end of a game, they play the same mode in their browser.
🔥 Evening reminder when your daily streak is at risk.
👋 Welcome-back bonus: free coins after a week away.
🎁 Your referral link offered at the end of a game (50 coins each).
🏆 Daily Challenge: overall ranking and podium (+20/+10/+5 coins).
🌍 Nicer 3D globes: redone Mars, icy globe, clearer regions.
🔊 Floating sound button and a clearer language button.</en-US>

<es-ES>⚔️ Reta a un amigo: comparte tu puntuación al final de la partida y jugará el mismo modo en su navegador.
🔥 Recordatorio por la tarde si tu racha del reto diario está en peligro.
👋 Bono de regreso: monedas de regalo tras una semana sin jugar.
🎁 Tu enlace de invitación al final de la partida (50 monedas cada uno).
🏆 Reto diario: clasificación general y podio (+20/+10/+5 monedas).
🌍 Globos 3D más bonitos: Marte renovado, globo helado.
🔊 Botón de sonido flotante e idioma más claro.</es-ES>

<pt-PT>⚔️ Desafia um amigo: partilha a tua pontuação no fim do jogo e ele joga o mesmo modo no browser.
🔥 Lembrete ao fim do dia se a tua sequência do desafio diário estiver em risco.
👋 Bónus de regresso: moedas oferecidas após uma semana de ausência.
🎁 O teu link de convite no fim do jogo (50 moedas para cada um).
🏆 Desafio diário: classificação geral e pódio (+20/+10/+5 moedas).
🌍 Globos 3D mais bonitos: Marte renovado, globo gelado.
🔊 Botão de som flutuante e idioma mais claro.</pt-PT>

<de-DE>⚔️ Fordere Freunde heraus: Teile deinen Punktestand am Spielende, sie spielen denselben Modus im Browser.
🔥 Abenderinnerung, wenn deine Serie der Tagesaufgabe in Gefahr ist.
👋 Willkommen-zurück-Bonus: Gratis-Münzen nach einer Woche Pause.
🎁 Dein Einladungslink am Spielende (je 50 Münzen).
🏆 Tagesaufgabe: Gesamtwertung und Podium (+20/+10/+5 Münzen).
🌍 Schönere 3D-Globen: neuer Mars, Eisglobus, klarere Regionen.
🔊 Schwebender Sound-Button und klarerer Sprach-Button.</de-DE>

<it-IT>⚔️ Sfida un amico: condividi il punteggio a fine partita, giocherà la stessa modalità nel browser.
🔥 Promemoria serale se la tua serie della sfida del giorno è a rischio.
👋 Bonus di ritorno: monete in regalo dopo una settimana di assenza.
🎁 Il tuo link d'invito a fine partita (50 monete ciascuno).
🏆 Sfida del giorno: classifica generale e podio (+20/+10/+5 monete).
🌍 Globi 3D più belli: Marte rifatto, globo ghiacciato, regioni più chiare.
🔊 Pulsante audio mobile e pulsante lingua più chiaro.</it-IT>
