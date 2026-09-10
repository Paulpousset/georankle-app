// La visite. Ce que le doigt fait, dans l'ordre, et pourquoi.
//
// Chaque scène est autonome : elle part du menu, fait une chose, et revient au
// menu. Trois raisons à ce découpage rigide :
//
//  • une scène qui casse ne fait pas tomber la prise, elle se signale et la
//    visite continue — un mode qui change de libellé ne coûte plus une soirée ;
//  • le manifeste note la position EXACTE (à l'image) de chaque scène dans le
//    fichier rendu, donc le montage peut recouper sans réenregistrer ;
//  • on peut ne filmer qu'une scène (`SCENES=globe,silhouette`) quand on
//    retouche un seul écran.
//
// Les libellés visés sont ceux de `accessibilityLabel`, pas le texte affiché :
// ce sont les mêmes chaînes que celles que lit un lecteur d'écran, elles sont
// déjà traduites, et elles ne bougent pas quand la maquette bouge.

/**
 * Ce qu'on ne considère jamais comme une réponse de jeu.
 *
 * Les deux dernières lignes ont été ajoutées après avoir vu le doigt appuyer,
 * dans « Plus ou Moins », sur une LIGNE DU RÉCAPITULATIF de fin de partie —
 * « Azerbaïdjan / Irlande, raté. Ta réponse… ». Le récapitulatif est fait de
 * boutons, comme les propositions, et rien ne les distingue par le rôle.
 */
const CHROME = [
  /^Menu/i, /^Retour/i, /^Quitter/i, /^Changer de langue$/i, /mode sombre/i,
  /thème sombre/i, /^Classement/i, /^Comment jouer/i, /^Infos sur/i,
  /^Changer de globe$/i, /^Masquer$/i, /^Voir les règles$/i,
  /raté|Ta réponse|Bonne réponse|Mauvaise réponse/i,
  /^Partager|^Rejouer|^Recommencer|^S'inscrire$|^Connexion$|^Se connecter$/i,
];

/**
 * Une proposition de jeu est courte : un nom de pays, un thème, une capitale.
 * Au-delà, c'est une phrase — donc du récapitulatif, de l'aide ou une bannière.
 */
const MAX_ANSWER = 42;

const isChrome = (label) => label.length > MAX_ANSWER || CHROME.some((re) => re.test(label));

/** Les libellés de tous les boutons actuellement à l'écran. */
async function buttonLabels(page) {
  return page.getByRole('button').evaluateAll((els) =>
    els.map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim()).filter(Boolean),
  );
}

/**
 * Le verdict de la question qui vient d'être jouée.
 *
 * Les écrans de jeu étiquettent leur bandeau de résultat pour le lecteur
 * d'écran (`a11yImage`, dans SilhouetteGame, ChallengeQuiz et LanguagesGame).
 * On lit donc la même chose qu'un lecteur d'écran plutôt que de chercher un
 * « DOMMAGE… » à l'écran : le libellé est stable, et il est déjà traduit.
 *
 * @returns {Promise<boolean|null>} `null` si le mode n'annonce pas de verdict.
 */
async function outcome(page, timeout = 4000) {
  const good = page.getByRole('img', { name: 'Bonne réponse', exact: true }).first();
  const bad = page.getByRole('img', { name: 'Mauvaise réponse', exact: true }).first();
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await good.count()) return true;
    if (await bad.count()) return false;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

/**
 * Répondre à une question sans rien savoir du mode.
 *
 * L'astuce : on relève les boutons AVANT de choisir la difficulté, puis APRÈS.
 * Les boutons apparus entre-temps sont les propositions — ça marche pour
 * Silhouette, Capitales et Drapeaux sans coder un sélecteur par écran, et ça
 * survit à l'ajout d'un mode.
 *
 * Le pipeline n'a pas la vérité terrain : il répond au hasard, puis relève le
 * verdict. C'est délibéré, et c'est ce qui rend le montage possible — on joue
 * PLUSIEURS questions par mode, le manifeste dit lesquelles sont bonnes, et le
 * monteur coupe sur une bonne. Comme le hasard est à graine fixe, `SEED=…`
 * rejoue une autre partie à l'identique quand aucune ne convient.
 */
async function answerQuestion(h, page, { difficulty = 'CARRÉ, 3 points', note } = {}) {
  const before = await buttonLabels(page);

  const diff = page.getByRole('button', { name: difficulty, exact: true }).first();
  if (await diff.count()) {
    await h.read('read'); // on regarde la question avant de miser
    await h.tap(diff, { label: difficulty, after: 'glance' });
  }

  const after = await buttonLabels(page);
  const choices = after.filter((l) => !before.includes(l) && !isChrome(l));
  if (!choices.length) return null;

  const pick = choices[Math.floor(h.rnd() * choices.length)];
  await h.read('read'); // on réfléchit
  await h.tap(page.getByRole('button', { name: pick, exact: true }).first(), { label: pick, after: 'glance' });

  const correct = await outcome(page);
  note?.({ kind: 'answer', pick, correct });
  await h.read(correct === false ? 'read' : 'study'); // on savoure moins une erreur

  // Passer à la suite quand l'écran de verdict l'exige.
  const next = await firstOf(page, ['Suivant', 'SUIVANT', 'Question suivante']);
  if (next) await h.tap(next.locator, { label: next.name, after: 'glance' });
  return { pick, correct };
}

/** Attrape la première cible existante parmi plusieurs libellés possibles. */
async function firstOf(page, names) {
  for (const n of names) {
    const b = page.getByRole('button', { name: n, exact: true }).first();
    if (await b.count()) return { locator: b, name: n };
  }
  return null;
}

/**
 * Revenir au menu, quel que soit l'écran et quel que soit le libellé du dos.
 *
 * On referme D'ABORD ce qui est ouvert par-dessus. Sans cette étape, une
 * modale — sélecteur de langue, zone de jeu, connexion — restait ouverte d'une
 * scène à l'autre : le bouton « Solo » du menu restait visible DERRIÈRE elle,
 * donc la fonction se croyait arrivée et rendait la main. La scène suivante se
 * jouait alors sous un voile, et la bascule vers le thème sombre a bel et bien
 * été filmée derrière la fenêtre de connexion. Toutes les modales de l'app
 * étiquettent leur croix « Fermer » — c'est ce qui rend le nettoyage général.
 */
export async function goHome(h, page) {
  for (let i = 0; i < 3; i++) {
    const close = page.getByRole('button', { name: 'Fermer', exact: true }).first();
    if (!(await close.count())) break;
    await h.tap(close, { label: 'Fermer', before: 320, after: 'glance' });
  }

  for (let i = 0; i < 5; i++) {
    if (await page.getByRole('button', { name: 'Solo', exact: true }).first().count()) return;
    const back = await firstOf(page, ['Menu', 'Menu principal', 'Retour au menu', 'Quitter vers le menu', 'Retour']);
    if (!back) break;
    await h.tap(back.locator, { label: back.name, before: 260, after: 'glance' });
  }
  // Dernier recours : on recharge. Visible à l'image, donc réservé aux ratés —
  // le manifeste dira que la scène précédente a mal fini.
  if (!(await page.getByRole('button', { name: 'Solo', exact: true }).first().count())) {
    await page.reload({ waitUntil: 'load' });
    await h.pause(4000);
  }
}

/** Ouvre un mode depuis le menu, salon compris. */
async function enterMode(h, page, name, { rounds } = {}) {
  await h.tapButton(name, { after: 'read' });

  if (rounds) {
    const r = page.getByRole('button', { name: `${rounds} tours par manche`, exact: true }).first();
    if (await r.count()) await h.tap(r, { label: `${rounds} tours`, after: 'glance' });
  }
  const start = await firstOf(page, ['Commencer la partie', 'JOUER']);
  if (start) await h.tap(start.locator, { label: start.name, after: 'study' });
}

// ── Les scènes ──────────────────────────────────────────────────────────────

export const SCENES = [
  {
    id: 'accueil',
    title: "L'accueil",
    async run(h, page, note) {
      await h.read('savour'); // le globe se lève derrière le titre : on le laisse jouer
      // On range la bannière d'inscription : c'est le premier geste de
      // n'importe quel joueur, et le cadre est plus net après.
      const hide = page.getByRole('button', { name: 'Masquer', exact: true }).first();
      if (await hide.count()) await h.tap(hide, { label: 'Masquer', after: 'glance' });
      await h.read('read');
      await h.browse({ dwell: 'read' }); // le menu complet, jusqu'au dernier mode
      await h.read('glance');
    },
  },

  {
    id: 'daily',
    title: 'Le défi du jour',
    async run(h, page, note) {
      await h.tapButton('Défi du Jour', { after: 'study' });
      await h.browse({ dwell: 'read' }); // les douze puzzles du jour
      await h.read('glance');
    },
  },

  {
    id: 'globe',
    title: 'Globe Géo — le globe 3D',
    async run(h, page, note) {
      await enterMode(h, page, 'Globe Géo');
      await h.read('savour'); // la planète met un instant à se poser
      // On fait tourner : c'est le geste qui vend le mode, et il n'existe que
      // sur mobile. Trois glissements, dans deux directions.
      await h.swipeCenter(-150, 0, { ms: 900 });
      await h.read('glance');
      await h.swipeCenter(120, -60, { ms: 800 });
      await h.read('read');
      // On pose le doigt sur une terre visible, puis on valide si l'app le
      // demande. Le point est décalé vers la gauche pour tomber sur un
      // continent plutôt qu'au milieu d'un océan, et l'attente avant l'appui
      // le sépare franchement du glissement précédent — sinon le globe
      // comprend un double-tap et zoome à fond.
      const { width, height } = page.viewportSize();
      await h.tapAt(width * 0.42, height * 0.46, { label: 'un pays', after: 'read' });
      const validate = await firstOf(page, ['Valider', 'VALIDER', 'Confirmer']);
      if (validate) await h.tap(validate.locator, { label: validate.name, after: 'study' });
      else await h.read('read');
    },
  },

  {
    id: 'silhouette',
    title: 'Silhouette',
    async run(h, page, note) {
      await enterMode(h, page, 'Silhouette');
      // Trois questions, trois mises différentes : on montre le choix de
      // difficulté, ET on se donne trois chances d'avoir une bonne réponse à
      // couper. Une seule question filmée, c'est une question à refaire.
      await answerQuestion(h, page, { difficulty: 'CARRÉ, 3 points', note });
      await answerQuestion(h, page, { difficulty: 'DUO, 1 point', note });
      await answerQuestion(h, page, { difficulty: 'CARRÉ, 3 points', note });
    },
  },

  {
    id: 'capitales',
    title: 'Capitales',
    async run(h, page, note) {
      await enterMode(h, page, 'Capitales', { rounds: 10 });
      await answerQuestion(h, page, { difficulty: 'CARRÉ, 3 points', note });
      await answerQuestion(h, page, { difficulty: 'DUO, 1 point', note });
      await answerQuestion(h, page, { difficulty: 'CARRÉ, 3 points', note });
    },
  },

  {
    id: 'drapeaux',
    title: 'Drapeaux',
    async run(h, page, note) {
      await enterMode(h, page, 'Drapeaux', { rounds: 5 });
      await answerQuestion(h, page, { difficulty: 'CARRÉ, 3 points', note });
      await answerQuestion(h, page, { difficulty: 'DUO, 1 point', note });
      await answerQuestion(h, page, { difficulty: 'CARRÉ, 3 points', note });
    },
  },

  {
    id: 'langues',
    title: 'Langues — la question qui s’écoute',
    async run(h, page, note) {
      // Le mode est encore sous drapeau : s'il n'est pas dans la grille, la
      // scène ne casse pas la visite, elle se retire.
      const card = page.getByRole('button', { name: 'Langues', exact: true }).first();
      if (!(await card.count())) return;
      await enterMode(h, page, 'Langues');
      await answerQuestion(h, page, { difficulty: 'CARRÉ, 3 points', note });
      await answerQuestion(h, page, { difficulty: 'DUO, 1 point', note });
    },
  },

  {
    id: 'rankle',
    title: 'Rankle — le mode signature',
    async run(h, page, note) {
      await enterMode(h, page, 'Rankle');
      await h.read('study'); // huit thèmes à lire : c'est un mode qui demande à réfléchir
      for (let i = 0; i < 2; i++) {
        const labels = (await buttonLabels(page)).filter((l) => !isChrome(l));
        if (!labels.length) break;
        const pick = labels[Math.floor(h.rnd() * labels.length)];
        await h.tap(page.getByRole('button', { name: pick, exact: true }).first(), { label: pick, after: 'study' });
        note?.({ kind: 'pick', pick });
      }
    },
  },

  {
    id: 'streak',
    title: 'Mode Streak',
    async run(h, page, note) {
      await enterMode(h, page, 'Mode Streak');
      const labels = (await buttonLabels(page)).filter((l) => !isChrome(l));
      if (labels.length) {
        const pick = labels[Math.floor(h.rnd() * labels.length)];
        await h.tap(page.getByRole('button', { name: pick, exact: true }).first(), { label: pick, after: 'study' });
      }
    },
  },

  {
    id: 'plusoumoins',
    title: 'Plus ou Moins',
    async run(h, page, note) {
      await enterMode(h, page, 'Plus ou Moins');
      for (let i = 0; i < 2; i++) {
        const labels = (await buttonLabels(page)).filter((l) => !isChrome(l));
        if (!labels.length) break;
        await h.read('read'); // on pèse les deux pays
        const pick = labels[Math.floor(h.rnd() * labels.length)];
        await h.tap(page.getByRole('button', { name: pick, exact: true }).first(), { label: pick, after: 'study' });
      }
    },
  },

  {
    id: 'devine',
    title: 'Devinez le Pays — la frappe',
    async run(h, page, note) {
      await enterMode(h, page, 'Devinez le Pays');
      await h.read('study'); // la grille des indices, encore vide
      const field = page.getByPlaceholder(/Tapez un pays/).first();
      // Lentement : c'est la scène où l'on voit qu'une main tape, pas un script.
      await h.type(field, 'France', { cps: 3.2, after: 'read' });
      // La suggestion, pas Entrée : c'est le chemin que l'app impose.
      const suggestion = page.getByText('France', { exact: true }).last();
      await h.tap(suggestion, { label: 'suggestion France', after: 'savour' });
      await h.browse({ dwell: 'study', max: 3 }); // la grille d'indices se remplit
    },
  },

  {
    id: 'frontieres',
    title: 'Frontières',
    async run(h, page, note) {
      await enterMode(h, page, 'Frontières');
      await h.read('study'); // il faut lire les deux pays à relier
      const field = page.getByPlaceholder(/Rechercher un pays/).first();
      if (await field.count()) {
        await h.type(field, 'Éthiopie', { cps: 3.2, after: 'read' });
        const first = page.getByRole('button', { name: /Éthiopie/ }).first();
        if (await first.count()) await h.tap(first, { label: 'Éthiopie', after: 'study' });
      }
    },
  },

  {
    id: 'defis-pays',
    title: 'Défis Pays',
    async run(h, page, note) {
      await h.tapButton('Défis Pays', { after: 'read' });
      await h.browse({ dwell: 'glance', max: 3 }); // trente pays découpés en régions
      const field = page.getByPlaceholder(/Rechercher un pays/).first();
      if (await field.count()) await h.type(field, 'Japon', { cps: 3.2, after: 'read' });
      const jp = page.getByRole('button', { name: /^Japon/ }).first();
      if (await jp.count()) await h.tap(jp, { label: 'Japon', after: 'study' });
      const start = await firstOf(page, ['Commencer la partie', 'JOUER']);
      if (start) await h.tap(start.locator, { label: start.name, after: 'savour' });
    },
  },

  {
    id: 'histoire',
    title: 'Mode Histoire',
    async run(h, page, note) {
      await h.tapButton('Mode Histoire', { after: 'study' });
      await h.browse({ dwell: 'read' });
    },
  },

  {
    id: 'local',
    title: 'Le jeu à deux, sur un seul téléphone',
    async run(h, page, note) {
      await h.tapButton('Local', { after: 'read' });
      await h.browse({ dwell: 'study' });
    },
  },

  {
    id: 'en-ligne',
    title: 'Les modes en ligne',
    async run(h, page, note) {
      await h.tapButton('En Ligne', { after: 'read' });
      await h.browse({ dwell: 'read' });
      await h.tapButton('Solo', { after: 'glance' }); // on repose l'onglet par défaut
    },
  },

  {
    id: 'zone',
    title: 'La zone de jeu',
    async run(h, page, note) {
      const zone = page.getByRole('button', { name: /^Zone de jeu/ }).first();
      if (!(await zone.count())) return;
      await h.tap(zone, { label: 'zone de jeu', after: 'study' });
      await h.browse({ dwell: 'read', max: 3 });
    },
  },

  {
    id: 'langue',
    title: 'Seize langues',
    async run(h, page, note) {
      await h.tapButton('Changer de langue', { after: 'study' });
      // Chaque langue est écrite dans sa propre langue : c'est le détail qui
      // dit « cette app est vraiment traduite », et il ne se voit qu'en défilant.
      await h.browse({ dwell: 'study', max: 4 });
      await h.read('glance');
    },
  },

  {
    id: 'compte',
    title: 'Le compte',
    async run(h, page, note) {
      // On ouvre l'écran, on ne s'y connecte pas : une prise ne doit jamais
      // faire transiter d'identifiants, et un compte de démo se voit à l'image.
      const login = await firstOf(page, ['Connexion', 'Se connecter']);
      if (!login) return;
      await h.tap(login.locator, { label: login.name, after: 'study' });
      await h.browse({ dwell: 'read', max: 2 });
    },
  },

  {
    id: 'theme',
    title: 'Le thème sombre',
    async run(h, page, note) {
      // Le basculement clair → sombre est le plan le plus rentable d'une bande-
      // annonce : un seul appui, tout l'écran répond. On le garde pour la fin,
      // et on laisse le temps de voir.
      const dark = await firstOf(page, ['Passer en thème sombre', 'Activer le mode sombre', 'Mode sombre']);
      if (!dark) return;
      await h.tap(dark.locator, { label: dark.name, after: 'savour' });
      await h.browse({ dwell: 'study' });
      const light = await firstOf(page, ['Passer en thème clair', 'Activer le mode clair', 'Mode clair']);
      if (light) await h.tap(light.locator, { label: light.name, after: 'read' });
    },
  },
];

export { answerQuestion, buttonLabels, isChrome, firstOf, enterMode, outcome };

// ── Les scènes connectées ───────────────────────────────────────────────────
//
// Elles n'existent que si `RECORD_EMAIL` et `RECORD_PASSWORD` sont dans
// l'environnement : sans compte, la visite s'arrête aux modes solo. Les
// identifiants ne sont jamais écrits — ni dans le manifeste, ni dans le journal,
// ni à l'écran autrement que par les points du champ « Mot de passe ».
//
// Ces scènes ont été écrites d'après les libellés d'accessibilité du code
// source, pas d'après une prise : le conteneur qui a servi à la prise solo ne
// peut pas joindre Supabase. Chaque cible passe donc par `firstOf` avec des
// variantes, et une scène qui ne trouve pas son écran se retire au lieu de
// casser la visite. La première prise sur une machine connectée dira ce qui
// reste à ajuster — c'est ce que `explore.mjs` sert à relever vite.

export const LOGGED_SCENES = [
  {
    id: 'connexion',
    title: 'La connexion — la frappe',
    async run(h, page, note, ctx) {
      const login = await firstOf(page, ['Connexion', 'Se connecter']);
      if (!login) return;
      await h.tap(login.locator, { label: login.name, after: 'study' });
      // L'adresse d'abord, lentement : c'est une des rares scènes où l'on voit
      // qu'une main tape. Le mot de passe s'affiche en points, on peut aller
      // un peu plus vite sans que ça se voie.
      await h.type(page.getByLabel('Email').first(), ctx.email, { cps: 3.4, after: 'glance' });
      await h.type(page.getByLabel('Mot de passe').first(), ctx.password, { cps: 4.5, after: 'read' });
      await h.tapButton('Se connecter', { after: 'glance' });
      // La modale se ferme d'elle-même quand la session est ouverte ; le
      // bouton d'en-tête passe de « Connexion » à « Profil ».
      await page.getByRole('button', { name: 'Profil', exact: true }).first().waitFor({ timeout: 30000 });
      note?.({ kind: 'login', ok: true });
      await h.read('savour'); // l'accueil se repeuple : pièces, pseudo, notifications
    },
  },

  {
    id: 'profil',
    title: 'Le profil',
    async run(h, page) {
      await h.tapButton('Profil', { after: 'study' });
      await h.browse({ dwell: 'read', max: 4 });
      const custom = await firstOf(page, ["Personnaliser l'avatar", 'Personnaliser']);
      if (custom) {
        await h.tap(custom.locator, { label: custom.name, after: 'study' });
        await h.browse({ dwell: 'read', max: 3 });
        const back = await firstOf(page, ['Retour', 'Fermer']);
        if (back) await h.tap(back.locator, { label: back.name, after: 'glance' });
      }
    },
  },

  {
    id: 'boutique',
    title: 'La boutique',
    async run(h, page) {
      const shop = await firstOf(page, ['Boutique']);
      if (!shop) return;
      await h.tap(shop.locator, { label: 'Boutique', after: 'study' });
      await h.browse({ dwell: 'study', max: 5 }); // les globes, les thèmes, les prix
      const tryIt = await firstOf(page, ['Essayer les globes en jeu', 'Personnaliser mon monde']);
      if (tryIt) await h.tap(tryIt.locator, { label: tryIt.name, after: 'study' });
    },
  },

  {
    id: 'amis',
    title: 'Les amis',
    async run(h, page, note, ctx) {
      const friends = await firstOf(page, ['Amis']);
      if (!friends) return;
      await h.tap(friends.locator, { label: 'Amis', after: 'study' });
      await h.browse({ dwell: 'read', max: 3 });
      const field = page.getByPlaceholder(/Rechercher un pseudo/).first();
      if (await field.count()) {
        // On cherche le pseudo du partenaire quand on le connaît, sinon un
        // préfixe : ce qui compte à l'image, c'est la liste qui se remplit.
        await h.type(field, ctx.sparringName || 'test', { cps: 3.4, after: 'read' });
        await h.tapButton('Rechercher', { after: 'study' });
      }
    },
  },

  {
    id: 'classement',
    title: 'Le classement mondial',
    async run(h, page) {
      await h.tapButton('Classement', { after: 'study' });
      await h.browse({ dwell: 'read', max: 4 });
    },
  },

  {
    id: 'ligues',
    title: 'Les ligues',
    async run(h, page) {
      await h.tapButton('En Ligne', { after: 'read' });
      const league = await firstOf(page, ['Ligue', 'Ligues']);
      if (!league) return;
      await h.tap(league.locator, { label: league.name, after: 'study' });
      await h.browse({ dwell: 'read', max: 3 });
      const open = page.getByRole('button', { name: /^Ouvrir cette ligue/ }).first();
      if (await open.count()) {
        await h.tap(open, { label: 'une ligue', after: 'study' });
        await h.browse({ dwell: 'read', max: 3 });
      }
    },
  },

  {
    id: 'classe',
    title: 'Le mode classé — un vrai duel',
    async run(h, page, note, ctx) {
      await h.tapButton('En Ligne', { after: 'read' });
      await h.tapButton('Mode Classé', { after: 'study' }); // rang, saison, format
      // Le partenaire entre dans la file un instant AVANT nous : c'est lui qui
      // attend, pas le héros — une recherche qui dure à l'image est un plan
      // qu'on coupe.
      if (ctx.sparring) {
        await ctx.sparring.queueRanked();
        ctx.sparring.playAlong().catch(() => {}); // hors champ, jusqu'à la fin du match
      }
      await h.tapButton('Trouver une partie classée', { after: 'glance' });
      note?.({ kind: 'queue' });
      // « Annuler la recherche » disparaît quand l'adversaire est trouvé.
      const searching = page.getByRole('button', { name: 'Annuler la recherche', exact: true }).first();
      try {
        await searching.waitFor({ state: 'hidden', timeout: 90000 });
        note?.({ kind: 'matched' });
      } catch {
        note?.({ kind: 'no-match' });
        await h.tap(searching, { label: 'Annuler la recherche', after: 'read' });
        return;
      }
      await h.read('savour'); // l'écran de présentation des deux joueurs
      for (let i = 0; i < 4; i++) {
        const played = await answerQuestion(h, page, { difficulty: 'CARRÉ, 3 points', note });
        if (!played) break;
      }
      await h.read('savour'); // le score final, le delta de points classés
    },
  },

  {
    id: 'deconnexion',
    title: 'La déconnexion',
    async run(h, page) {
      // On rend le téléphone comme on l'a pris : la prochaine prise doit
      // pouvoir commencer sur l'écran de connexion.
      await h.tapButton('Profil', { after: 'read' });
      const out = await firstOf(page, ['Déconnexion']);
      if (!out) return;
      await h.tap(out.locator, { label: 'Déconnexion', after: 'read' });
      const confirm = await firstOf(page, ['Déconnexion', 'Confirmer', 'Oui']);
      if (confirm) await h.tap(confirm.locator, { label: confirm.name, after: 'study' });
    },
  },
];
