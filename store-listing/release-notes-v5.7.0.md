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
👋 Bonus de retour après une semaine d'absence.
🎁 Parrainage en fin de partie (50 pièces chacun).
🏆 Défi du Jour : classement général.
🌍 Globes 3D plus beaux, Israël redessiné, régions mieux cadrées.
🗺️ Mode Histoire : vies, portails d'étoiles, 500 niveaux.
🏁 Capitales et Drapeaux : même écran de fin que les autres modes.</fr-FR>

<en-US>⚔️ Challenge a friend: share your score, they play in their browser.
🔥 Evening reminder if your streak is at risk.
👋 Welcome-back bonus after a week away.
🎁 Referral link at the end of a game (50 coins each).
🏆 Daily Challenge: overall ranking.
🌍 Nicer 3D globes, redrawn Israel, better framed regions.
🗺️ Story mode: lives, star gates, 500 levels.
🏁 Capitals and Flags: same end screen as the other modes.</en-US>

<es-ES>⚔️ Reta a un amigo: comparte tu puntuación y jugará en su navegador.
🔥 Aviso nocturno si tu racha corre peligro.
👋 Bono de regreso tras una semana sin jugar.
🎁 Enlace de invitación al final de la partida (50 monedas cada uno).
🏆 Reto diario: clasificación general.
🌍 Globos 3D más bonitos, Israel redibujado, regiones mejor encuadradas.
🗺️ Modo Historia: vidas, portales de estrellas, 500 niveles.
🏁 Capitales y Banderas: misma pantalla final que los demás modos.</es-ES>

<pt-PT>⚔️ Desafia um amigo: partilha a pontuação e ele joga no browser.
🔥 Lembrete à noite se a tua sequência estiver em risco.
👋 Bónus de regresso após uma semana de ausência.
🎁 Link de convite no fim do jogo (50 moedas cada).
🏆 Desafio diário: classificação geral.
🌍 Globos 3D mais bonitos, Israel redesenhado, regiões melhor enquadradas.
🗺️ Modo História: vidas, portais de estrelas, 500 níveis.
🏁 Capitais e Bandeiras: mesmo ecrã final dos outros modos.</pt-PT>

<de-DE>⚔️ Fordere Freunde heraus: Score teilen, sie spielen im Browser.
🔥 Abenderinnerung, wenn deine Tagesserie in Gefahr ist.
👋 Willkommen-zurück-Bonus nach einer Woche Pause.
🎁 Einladungslink am Spielende (je 50 Münzen).
🏆 Tagesaufgabe: Gesamtwertung.
🌍 Schönere 3D-Globen, neu gezeichnetes Israel, besser gerahmte Regionen.
🗺️ Story-Modus: Leben, Sternentore, 500 Level.
🏁 Hauptstädte und Flaggen: gleicher Endbildschirm wie die anderen Modi.</de-DE>

<it-IT>⚔️ Sfida un amico: condividi il punteggio, giocherà nel browser.
🔥 Promemoria serale se la tua serie è a rischio.
👋 Bonus di ritorno dopo una settimana di assenza.
🎁 Link d'invito a fine partita (50 monete ciascuno).
🏆 Sfida del giorno: classifica generale.
🌍 Globi 3D più belli, Israele ridisegnato, regioni meglio inquadrate.
🗺️ Modalità Storia: vite, portali, 500 livelli.
🏁 Capitali e Bandiere: stessa schermata finale degli altri modi.</it-IT>
