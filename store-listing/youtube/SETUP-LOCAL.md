# Relancer en local avec Claude in Chrome

La session cloud (claude.ai/code) n'a **pas** accès à Chrome : elle tourne dans un conteneur
isolé, sans extension navigateur et sans ta session Google. Pour que Claude remplisse
YouTube Studio lui-même, il faut une session **locale**, sur ta machine, avec l'extension
Claude in Chrome connectée.

---

## 1. Prérequis

| Élément | Comment vérifier |
|---|---|
| **Chrome ouvert** | L'extension ne répond que si Chrome tourne. |
| **Extension Claude in Chrome installée et connectée** | Icône Claude dans la barre d'extensions. Si tu ne l'as pas : https://claude.ai/chrome |
| **Connecté à YouTube Studio dans Chrome** | Ouvre `studio.youtube.com` et vérifie que tu tombes bien sur la chaîne GeoG (UCZ9tRff3_emxT38vWnnfRDg) et pas sur un autre compte Google. |
| **Claude Code installé** | `claude --version`. Sinon : `npm install -g @anthropic-ai/claude-code` |
| **Node ≥ 18** | `node --version` |

> ⚠️ Le piège le plus fréquent : plusieurs comptes Google dans Chrome. L'extension utilise
> le **profil Chrome actif**. Si ta chaîne est sur un compte secondaire, ouvre d'abord
> le bon profil Chrome, sinon Claude va piloter la mauvaise chaîne.

## 2. Récupérer la branche

```sh
cd ~/chemin/vers/georankle-app
git fetch origin claude/compassionate-meitner-b75dqs
git checkout claude/compassionate-meitner-b75dqs
ls store-listing/youtube/     # tu dois voir les 4 fichiers .md
```

Si tu n'as pas encore le repo en local :

```sh
git clone https://github.com/Paulpousset/georankle-app.git
cd georankle-app
git checkout claude/compassionate-meitner-b75dqs
```

## 3. Lancer

```sh
cd ~/chemin/vers/georankle-app
claude
```

Puis colle le contenu de `prompt-claude-chrome-youtube.md` (dans ce dossier).

## 4. Vérifier que Chrome est bien branché

Avant de lancer le vrai travail, demande simplement :

> Liste mes onglets Chrome ouverts.

- **Ça marche** → Claude te liste tes onglets. Les outils `mcp__claude-in-chrome__*` sont actifs.
- **Ça ne marche pas** → Claude te dira que l'extension n'est pas connectée. Dans ce cas :
  1. Clique sur l'icône de l'extension dans Chrome et vérifie qu'elle est active
  2. Relance `claude` après avoir ouvert Chrome (l'ordre compte)
  3. Vérifie les autorisations de site : l'extension demande une permission **par domaine**.
     Il faudra autoriser `studio.youtube.com` au premier accès.

## 5. Alternative sans Claude Code

Si tu ne veux pas installer le CLI, tu peux ouvrir l'extension Claude directement dans Chrome
(panneau latéral) et y coller le prompt — comme tu l'avais fait pour la config OAuth Google.

La différence : dans ce mode, Claude **ne lit pas le repo**. Il faudra donc lui coller aussi
le contenu de `descriptions-shorts.md` et `descriptions-longues.md`, ou ouvrir ces fichiers
sur GitHub dans un onglet pour qu'il les lise depuis la page.

Le mode Claude Code est nettement plus confortable : il lit les 4 fichiers tout seul et peut
les corriger au fur et à mesure de ce qu'il voit dans Studio.

## 6. Autorisations à prévoir

Claude in Chrome demande ton accord **par site**. Tu verras une demande pour :

- `studio.youtube.com` — obligatoire

Refuse tout ce qui sort de ce domaine. Le prompt fourni interdit explicitement à Claude
d'aller ailleurs, mais la permission est ta dernière barrière — autant t'en servir.

## 7. Ce que Claude ne pourra pas faire, même en local

- **Uploader les vidéos.** Sélectionner un fichier dans une boîte de dialogue système
  (le sélecteur de fichiers de l'OS) est hors de portée de l'extension navigateur.
  → Uploade les vidéos toi-même, laisse-les en **brouillon**, puis Claude remplit
  les métadonnées de chaque brouillon.
- **Générer les miniatures.** Il peut les uploader si tu lui donnes le chemin via l'interface,
  mais pas les créer.
- **Publier sans toi.** Le prompt lui demande de s'arrêter avant publication.
