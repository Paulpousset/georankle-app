/**
 * Le contenu éditorial de `/play`, sous le jeu.
 *
 * POURQUOI. Jusqu'au 05/09/2026 `/play` était une coquille : dix mots de
 * contenu, et pourtant la destination du bouton « Jouer » de 46 des 96 pages du
 * site. Un examinateur AdSense qui suivait l'appel à l'action principal
 * atterrissait donc sur une page vide — exactement le motif du refus du 16/08
 * (« annonces diffusées sur des pages ou écrans sans contenu d'éditeur »), et
 * la source la plus probable des refus « contenu à faible valeur informative »
 * qui ont suivi. Cette page est aussi celle que les joueurs partagent : leur
 * donner les règles, le barème et la liste des modes est utile en soi.
 *
 * CE QUE ÇA CHANGE POUR L'APP. Deux états, portés par la classe `pd-reading`
 * sur `<html>` :
 *   - MODE JEU (défaut) : la page est verrouillée (`body` en position:fixed),
 *     le jeu occupe l'écran moins la barre de site, le texte est dans le flux
 *     (donc lu par les robots) mais hors d'atteinte du défilement ;
 *   - MODE LECTURE : le lien « Règles et FAQ » de la barre bascule la page en
 *     document ordinaire qui défile ; le jeu est mis de côté sans être démonté
 *     (visibility:hidden, dimensions gardées, partie conservée) et le même
 *     lien, devenu « Retour au jeu », ramène en mode jeu.
 *
 * ⚠️ POURQUOI position:fixed ET PAS overflow:hidden. Du 05/09 au 16/09/2026 la
 * page se contentait d'`overflow:hidden` sur `body` (celui de la coquille Expo,
 * qui l'emportait d'ailleurs sur nos règles, chargées AVANT lui). Sur ordinateur
 * cela figeait bien la page — d'où la note « le défilement ne s'enchaîne pas,
 * scrollY reste à 0 » — mais iOS Safari ignore ce verrou au toucher : sur
 * iPhone, toute la page (jeu + 5 000 px de texte) défilait sous le doigt, le
 * jeu partait hors écran et devenait injouable. Le corps en position:fixed est
 * le seul verrou que Safari respecte. Nos règles sont maintenant injectées en
 * FIN de `<head>`, après la feuille Expo (site/build.mjs).
 *
 * D'OÙ VIENT LE TEXTE. Le français et l'anglais sont écrits à la main, ici, et
 * ne redisent pas la page d'accueil : ils parlent de la partie en cours (défi
 * du jour, barème, commandes, compte). Les quatorze langues générées assemblent
 * leurs phrases déjà traduites — accroche d'accueil, règles de chaque mode
 * issues des catalogues de l'app, FAQ. ⚠️ Elles recoupent donc leur propre page
 * d'accueil : à reprendre à la main avant d'ouvrir ces langues au public.
 */
import { MODES } from './modes.mjs';
import { href } from './routes.mjs';
import { strings } from './strings.mjs';
import { localeData } from './siteLocales.mjs';
import { t } from './i18n.mjs';
import { MODE_COPY, APP_MODE } from './generated.mjs';
import { COUNTRY_COUNT, MODE_COUNT } from './constants.mjs';

function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Les deux seules directives que les phrases traduites peuvent contenir. La
 * coquille ne passe pas par `interpolate()` : sans ce remplacement, `/de/play`
 * afficherait « Die {{modes}} Spielmodi » en toutes lettres.
 */
function fill(text) {
  return String(text)
    .replace(/\{\{countries\}\}/g, String(COUNTRY_COUNT))
    .replace(/\{\{modes\}\}/g, String(MODE_COUNT));
}

/**
 * Le style du bloc, embarqué dans la coquille.
 *
 * Autonome et préfixé `.play-doc` : la feuille du site (`guides.css`) redéfinit
 * `body` et les polices, la charger ici repeindrait l'application. Les couleurs
 * suivent le thème du navigateur, comme l'app.
 */
export const PLAY_DOC_CSS = `    <style id="play-doc-style">
      /* ── Mode jeu (défaut) ─────────────────────────────────────────────
         Le corps est verrouillé en position:fixed : c'est le seul verrou que
         iOS Safari respecte au toucher (overflow:hidden ne suffit pas, voir
         l'en-tête du module). Le texte reste dans le flux, clippé. */
      html, body { height: 100%; overflow: hidden; overscroll-behavior: none; }
      body { position: fixed; inset: 0; width: 100%; background: #f2e8d0; }
      /* Le jeu occupe l'écran MOINS la barre. Mesuré : ni le menu, ni le défi
         du jour, ni le globe ne débordent — ils se dimensionnent à leur boîte,
         pas à la hauteur de la fenêtre. Le !important est assumé :
         react-native-web pose sa propre classe sur la racine au démarrage, et
         sa hauteur l'emporterait. */
      #root {
        height: calc(100vh - 46px) !important;
        height: calc(100dvh - 46px) !important;
        min-height: 0 !important;
        flex: none !important;
      }
      /* ── Mode lecture (html.pd-reading) ────────────────────────────────
         La page redevient un document qui défile ; le jeu est mis de côté
         sans être démonté (dimensions gardées, partie conservée). */
      html.pd-reading, html.pd-reading body {
        position: static; height: auto; min-height: 100%; overflow: visible;
      }
      html.pd-reading body { overflow-x: hidden; }
      html.pd-reading #root {
        position: fixed; left: 0; top: 46px; width: 100%;
        visibility: hidden; pointer-events: none;
      }
      html.pd-reading .pd-bar { position: sticky; top: 0; z-index: 10; }
      .pd-jump-back { display: none; }
      html.pd-reading .pd-jump-go { display: none; }
      html.pd-reading .pd-jump-back { display: inline; }
      .pd-bar {
        height: 46px; box-sizing: border-box;
        display: flex; align-items: center; gap: 16px;
        padding: 0 16px;
        background: #f8f2e3; border-bottom: 2px solid #c4a87a;
        font-family: Georgia, "Times New Roman", serif; font-size: 14px;
        color: #7a5c38;
        overflow-x: auto; scrollbar-width: none;
      }
      .pd-bar::-webkit-scrollbar { display: none; }
      .pd-bar a { color: #7a5c38; text-decoration: none; white-space: nowrap; }
      .pd-bar a:hover { text-decoration: underline; }
      .pd-bar .pd-brand { font-weight: 700; color: #2c1810; font-size: 16px; }
      .pd-bar .pd-jump { margin-left: auto; color: #c04a1a; font-weight: 700; }
      @media (prefers-color-scheme: dark) {
        .pd-bar {
          background: #132040; border-bottom-color: #2d4a70; color: #7aa0c4;
        }
        .pd-bar a { color: #7aa0c4; }
        .pd-bar .pd-brand { color: #d8e8f4; }
        .pd-bar .pd-jump { color: #e8825a; }
      }
      /* ── Barre masquée (html.pd-nobar) ─────────────────────────────────
         La croix de la barre la replie : le jeu reprend toute la hauteur,
         moins une poignée de 20px qui permet de la rouvrir. Le choix est
         mémorisé (localStorage, voir PLAY_DOC_HEAD_SCRIPT). Le mode lecture
         la remontre quoi qu'il arrive : c'est elle qui ramène au jeu. */
      .pd-bar .pd-hide {
        background: none; border: 0; padding: 0 2px; margin-left: 4px;
        font: inherit; font-size: 16px; line-height: 1; color: inherit;
        cursor: pointer; opacity: 0.7;
      }
      .pd-bar .pd-hide:hover { opacity: 1; }
      .pd-show { display: none; }
      html.pd-nobar:not(.pd-reading) .pd-bar { display: none; }
      html.pd-nobar:not(.pd-reading) .pd-show {
        display: flex; align-items: center; justify-content: center;
        height: 20px; box-sizing: border-box;
        background: #f8f2e3; border-bottom: 1px solid #c4a87a;
        font-family: Georgia, "Times New Roman", serif; font-size: 11px;
        font-weight: 700; letter-spacing: 0.5px; color: #7a5c38;
        text-decoration: none; cursor: pointer; user-select: none;
      }
      html.pd-nobar:not(.pd-reading) .pd-show:hover { color: #2c1810; }
      html.pd-nobar:not(.pd-reading) #root {
        height: calc(100vh - 20px) !important;
        height: calc(100dvh - 20px) !important;
      }
      @media (prefers-color-scheme: dark) {
        html.pd-nobar:not(.pd-reading) .pd-show {
          background: #132040; border-bottom-color: #2d4a70; color: #7aa0c4;
        }
        html.pd-nobar:not(.pd-reading) .pd-show:hover { color: #d8e8f4; }
      }
      #regles { scroll-margin-top: 46px; }
      .play-doc {
        --pd-bg: #f2e8d0; --pd-surface: #f8f2e3; --pd-ink: #2c1810;
        --pd-muted: #7a5c38; --pd-rule: #c4a87a; --pd-link: #c04a1a;
        background: var(--pd-bg); color: var(--pd-ink);
        border-top: 2px solid var(--pd-rule);
        font-family: Georgia, "Times New Roman", serif;
        font-size: 17px; line-height: 1.68;
      }
      .play-doc-in { max-width: 760px; margin: 0 auto; padding: 54px 24px 72px; }
      .play-doc h1 { font-size: 30px; line-height: 1.25; margin: 0 0 14px; }
      .play-doc h2 {
        font-size: 21px; margin: 40px 0 12px; padding-top: 18px;
        border-top: 1px solid var(--pd-rule);
      }
      .play-doc p { margin: 0 0 14px; }
      .play-doc .pd-lead { font-size: 19px; color: var(--pd-muted); margin-bottom: 26px; }
      .play-doc a { color: var(--pd-link); }
      .play-doc ul { margin: 0 0 14px; padding-left: 22px; }
      .play-doc li { margin-bottom: 9px; }
      .play-doc details {
        border-bottom: 1px solid var(--pd-rule); padding: 12px 0;
      }
      .play-doc summary { cursor: pointer; font-weight: 700; }
      .play-doc details p { margin: 10px 0 0; color: var(--pd-muted); }
      .pd-nav {
        margin-top: 40px; padding-top: 18px; border-top: 2px solid var(--pd-rule);
        font-size: 15px; color: var(--pd-muted);
      }
      .pd-nav a { margin-right: 14px; white-space: nowrap; }
      .pd-back {
        display: inline-block; margin: 34px 0 0; padding: 12px 18px;
        border: 2px solid var(--pd-link); border-radius: 10px;
        font-weight: 700; text-decoration: none;
      }
      @media (prefers-color-scheme: dark) {
        body { background: #0a1628; }
        .play-doc {
          --pd-bg: #0a1628; --pd-surface: #132040; --pd-ink: #d8e8f4;
          --pd-muted: #7aa0c4; --pd-rule: #2d4a70; --pd-link: #e8825a;
        }
      }
      @media (max-width: 640px) {
        .play-doc { font-size: 16px; }
        .play-doc-in { padding: 40px 20px 56px; }
        .play-doc h1 { font-size: 25px; }
      }
    </style>`;

/**
 * La liste des modes, chacun renvoyant à sa page, avec sa règle en une phrase.
 *
 * ⚠️ `t()` ne traduit que les quatorze langues qui ont un catalogue : la clé
 * EST la phrase anglaise, donc `t('fr', …)` rend de l'anglais. Le français lit
 * `bodyFr`, exporté exprès depuis src/data/modeIntros.ts.
 */
function modeList(locale) {
  const data = localeData(locale);
  return MODES.map((mode) => {
    const name = data ? data.modes[mode.id].name : mode[locale].name;
    const copy = MODE_COPY[APP_MODE[mode.id]];
    const rule = locale === 'fr' ? copy.bodyFr : t(locale, copy.body);
    return `        <li><a href="${href(mode.id, locale)}"><b>${esc(name)}</b></a> — ${esc(fill(rule))}</li>`;
  }).join('\n');
}

/**
 * Posé en FIN de <head>, juste après le style : relit le choix « barre
 * masquée » AVANT le premier rendu, sinon la barre apparaîtrait un instant à
 * chaque rechargement avant de se replier. Clé partagée avec PLAY_DOC_SCRIPT.
 */
export const PLAY_DOC_HEAD_SCRIPT = `    <script>
      try {
        if (localStorage.getItem('geog.playBar') === 'hidden') {
          document.documentElement.classList.add('pd-nobar');
        }
      } catch (e) {}
    </script>`;

/**
 * La barre de site posée AU-DESSUS du jeu.
 *
 * Deux rôles : donner le seul chemin fiable vers le texte (le lien « Règles et
 * FAQ », puisque le défilement n'enchaîne pas depuis le jeu), et montrer à un
 * visiteur — ou à un examinateur AdSense — que `/play` appartient à un site.
 *
 * La croix à droite la replie (html.pd-nobar) : elle reste dans le DOM — les
 * robots la voient toujours — et une poignée « GeoG ⌄ » de 20px la rouvre.
 */
export function playBar(locale) {
  const s = strings(locale);
  const data = localeData(locale);
  const labels = jumpLabels(locale);
  const dismiss = data ? data.chrome.dismiss : s.dismiss;
  const links = [[href('home', locale), data ? data.chrome.home : s.home]];
  if (!data) links.push([href('guides', locale), s.guides]);
  links.push([href('about', locale), data ? data.chrome.about : s.about]);
  return `  <nav class="pd-bar">
    <a class="pd-brand" href="${href('home', locale)}">GeoG</a>
${links.map(([url, label]) => `    <a href="${url}">${esc(label)}</a>`).join('\n')}
    <a class="pd-jump" href="#regles"><span class="pd-jump-go">↓ ${esc(labels.go)}</span><span class="pd-jump-back">↑ ${esc(labels.back)}</span></a>
    <button class="pd-hide" type="button" data-pd-hide title="${esc(dismiss)}" aria-label="${esc(dismiss)}">✕</button>
  </nav>
  <a class="pd-show" href="#" data-pd-show aria-label="GeoG">GeoG ⌄</a>`;
}

/**
 * Les deux libellés du lien de bascule. Les quatorze langues générées n'ont pas
 * de phrase « retour au jeu » : elles reprennent leur « Jouer », qui dit la
 * même chose à cet endroit.
 */
function jumpLabels(locale) {
  const data = localeData(locale);
  if (locale === 'fr') return { go: 'Règles et FAQ', back: 'Retour au jeu' };
  if (locale === 'en') return { go: 'Rules and FAQ', back: 'Back to the game' };
  return { go: data?.chrome.faq ?? 'FAQ', back: data?.chrome.play ?? 'Play' };
}

/**
 * Le script de bascule jeu ⇄ lecture, injecté après le texte par build.mjs.
 * Sans JavaScript le lien reste une ancre vers #regles : rien ne casse, mais
 * la page ne défile pas — c'est l'état d'avant, et il ne concerne que les
 * robots, qui lisent le DOM sans défiler.
 */
export const PLAY_DOC_SCRIPT = `  <script>
    (function () {
      var html = document.documentElement;
      function set(on) {
        html.classList.toggle('pd-reading', on);
        window.scrollTo(0, 0);
        if (!on && location.hash === '#regles') {
          history.replaceState(null, '', location.pathname + location.search);
        }
      }
      var jump = document.querySelector('.pd-jump');
      if (jump) jump.addEventListener('click', function (e) {
        e.preventDefault();
        set(!html.classList.contains('pd-reading'));
      });
      var backs = document.querySelectorAll('[data-pd-back]');
      for (var i = 0; i < backs.length; i++) backs[i].addEventListener('click', function (e) {
        e.preventDefault();
        set(false);
      });
      function bar(shown) {
        html.classList.toggle('pd-nobar', !shown);
        try {
          if (shown) localStorage.removeItem('geog.playBar');
          else localStorage.setItem('geog.playBar', 'hidden');
        } catch (e) {}
      }
      var hide = document.querySelector('[data-pd-hide]');
      if (hide) hide.addEventListener('click', function () { bar(false); });
      var show = document.querySelector('[data-pd-show]');
      if (show) show.addEventListener('click', function (e) {
        e.preventDefault();
        bar(true);
      });
      if (location.hash === '#regles') set(true);
      window.addEventListener('hashchange', function () {
        if (location.hash === '#regles') set(true);
      });
    })();
  </script>`;

/** Le pied de page du bloc : les liens que tout site éditorial doit exposer. */
function docNav(locale) {
  const s = strings(locale);
  const data = localeData(locale);
  const links = [[href('home', locale), data ? data.chrome.home : s.home]];
  // Les guides n'existent qu'en français et en anglais : n'y envoyer personne
  // d'autre. Les autres langues repartent vers leur liste de modes.
  if (!data) links.push([href('guides', locale), s.guides]);
  links.push([href('about', locale), data ? data.chrome.about : s.about]);
  links.push([href('contact', locale), data ? data.chrome.contact : s.contact]);
  links.push([href('privacy', locale), data ? data.chrome.privacy : s.privacy]);
  return `      <a class="pd-back" href="#" data-pd-back>↑ ${esc(jumpLabels(locale).back)}</a>
      <nav class="pd-nav">
${links.map(([url, label]) => `        <a href="${url}">${esc(label)}</a>`).join('\n')}
      </nav>`;
}

function faqBlock(items, heading) {
  if (!items?.length) return '';
  return `      <h2>${esc(heading)}</h2>
${items
  .map(
    (item) => `      <details>
        <summary>${esc(fill(item.q))}</summary>
        <p>${esc(fill(item.a))}</p>
      </details>`,
  )
  .join('\n')}`;
}

/** Le texte écrit à la main du français et de l'anglais. */
const HANDWRITTEN = {
  fr: {
    h1: 'Jouer à GeoG dans le navigateur',
    lead: `Le jeu tourne juste au-dessus de ce texte : rien à installer, aucun compte à créer. Cette page explique ce qu'on y trouve — le défi du jour, les ${MODE_COUNT} modes, la façon dont les points sont comptés et les commandes.`,
    sections: [
      {
        h: 'Le défi du jour',
        p: [
          `À minuit UTC, une nouvelle série est tirée : les mêmes questions, dans le même ordre, pour tous les joueurs de la planète. C'est ce qui rend le score comparable — un ami qui ouvre la même page joue exactement la partie que vous venez de jouer, et la grille de résultats se partage en un tap, sans révéler les réponses.`,
          `Le défi se joue une fois par jour et compte une série : jouer chaque jour la fait grandir, sauter un jour la remet à zéro. Il est accessible sans compte, comme tous les modes solo.`,
        ],
      },
      {
        h: `Les ${MODE_COUNT} modes de jeu`,
        p: [
          `Tous couvrent les ${COUNTRY_COUNT} États membres de l'ONU — pas seulement la trentaine de pays que tout le monde connaît. Chaque mode a sa page, avec ses règles détaillées et ses conseils.`,
        ],
        list: true,
      },
      {
        h: 'Comment les points sont comptés',
        p: [
          `Chaque manche vaut de 0 à 1000 points, sur la même échelle dans tous les modes. Deux choses entrent dans le calcul : la justesse d'abord — la bonne réponse, ou la distance à la bonne réponse quand le mode le permet — puis la rapidité, qui départage.`,
          `Une échelle commune est ce qui permet de comparer une partie de Drapeaux et une partie de Globe 3D, d'additionner les manches d'une série multi-modes, et de tenir un classement unique. Les parties jouées sans compte comptent pour le plaisir ; seules celles d'un compte connecté remontent au classement.`,
        ],
      },
      {
        h: 'Les commandes',
        p: [
          `Sur ordinateur : la souris pour désigner, la molette pour zoomer sur le globe, un cliquer-glisser pour le faire tourner. Au clavier, on tape le nom d'un pays et la touche Entrée valide — utile dans Frontières, où l'on enchaîne les réponses.`,
          `Sur mobile et tablette : un doigt fait tourner le globe, deux le zooment, un tap désigne. Les micro-États — Monaco, Saint-Marin, le Vatican, Nauru, Tuvalu et quelques autres — sont trop petits pour être touchés à l'échelle du globe et apparaissent sous forme de point cliquable dès qu'on zoome.`,
        ],
      },
      {
        h: 'Avec ou sans compte',
        p: [
          `Les modes solo et le défi du jour se jouent sans rien créer. Le compte, gratuit, sert à trois choses : garder la progression d'un appareil à l'autre, jouer les duels et le mode classé contre d'autres joueurs, et apparaître dans les classements.`,
          `Le jeu existe aussi en application iPhone et Android, avec le même compte et la même progression. La version web ne demande aucune installation.`,
        ],
      },
    ],
    faqHeading: 'Questions fréquentes',
    faq: [
      {
        q: 'Faut-il un compte pour jouer ?',
        a: `Non. Tous les modes solo et le défi du jour se lancent sans compte. Le compte gratuit ne sert qu'à sauvegarder la progression, jouer en ligne et apparaître dans les classements.`,
      },
      {
        q: 'Le jeu est-il gratuit ?',
        a: `Oui, entièrement. Il n'y a rien à acheter pour accéder aux ${MODE_COUNT} modes ni au défi du jour.`,
      },
      {
        q: 'Le défi du jour est-il le même pour tout le monde ?',
        a: `Oui. Chaque jour à minuit UTC, tous les joueurs du monde reçoivent la même série de questions dans le même ordre.`,
      },
      {
        q: 'Combien de pays le jeu contient-il ?',
        a: `Les ${COUNTRY_COUNT} États membres de l'ONU, micro-États et îles compris. Les données (capitales, drapeaux, frontières, superficies, populations) sont détaillées dans la page à propos.`,
      },
      {
        q: 'Faut-il installer quelque chose ?',
        a: `Non, la page suffit — le jeu tourne dans le navigateur. Les applications iPhone et Android existent pour ceux qui préfèrent une icône sur l'écran d'accueil.`,
      },
    ],
  },
  en: {
    h1: 'Playing GeoG in your browser',
    lead: `The game is running right above this text: nothing to install, no account to create. This page explains what you are playing — the daily challenge, the ${MODE_COUNT} game modes, how points are counted and which controls do what.`,
    sections: [
      {
        h: 'The daily challenge',
        p: [
          `At midnight UTC a new run is drawn: the same questions, in the same order, for every player on the planet. That is what makes the score comparable — a friend opening the same page plays exactly the run you just played, and the result grid shares in one tap without giving the answers away.`,
          `The challenge is played once a day and keeps a streak: playing every day grows it, skipping a day resets it. It needs no account, like every solo mode.`,
        ],
      },
      {
        h: `The ${MODE_COUNT} game modes`,
        p: [
          `All of them cover the ${COUNTRY_COUNT} UN member states — not just the thirty everybody knows. Each mode has its own page with the full rules and a few tips.`,
        ],
        list: true,
      },
      {
        h: 'How points are counted',
        p: [
          `Every round is worth 0 to 1000 points, on the same scale in every mode. Two things go into it: accuracy first — the right answer, or how close you got when the mode allows a near miss — then speed, which breaks the tie.`,
          `A shared scale is what makes a game of Flags comparable to a game of 3D Globe, lets the rounds of a multi-mode run add up, and keeps a single leaderboard. Games played signed out count for fun only; leaderboards read from a signed-in account.`,
        ],
      },
      {
        h: 'Controls',
        p: [
          `On a computer: the mouse points, the wheel zooms the globe, click and drag spins it. On the keyboard you type a country name and Enter submits — handy in Borders, where answers come one after another.`,
          `On phone and tablet: one finger spins the globe, two zoom it, a tap points. Microstates — Monaco, San Marino, the Vatican, Nauru, Tuvalu and a few more — are too small to hit at globe scale and show up as a tappable dot once you zoom in.`,
        ],
      },
      {
        h: 'With or without an account',
        p: [
          `Solo modes and the daily challenge run without signing up for anything. The free account does three things: it carries your progress from one device to another, it unlocks online duels and ranked play, and it puts you on the leaderboards.`,
          `The game also exists as an iPhone and Android app, with the same account and the same progress. The web version needs no install at all.`,
        ],
      },
    ],
    faqHeading: 'Frequently asked questions',
    faq: [
      {
        q: 'Do I need an account to play?',
        a: `No. Every solo mode and the daily challenge start without one. The free account only saves progress, unlocks online play and puts you on the leaderboards.`,
      },
      {
        q: 'Is the game free?',
        a: `Yes, entirely. There is nothing to buy to reach the ${MODE_COUNT} modes or the daily challenge.`,
      },
      {
        q: 'Is the daily challenge the same for everyone?',
        a: `Yes. Every day at midnight UTC, players worldwide get the same questions in the same order.`,
      },
      {
        q: 'How many countries are in the game?',
        a: `The ${COUNTRY_COUNT} UN member states, microstates and islands included. The data behind them (capitals, flags, borders, areas, populations) is described on the about page.`,
      },
      {
        q: 'Do I have to install anything?',
        a: `No, the page is enough — the game runs in the browser. The iPhone and Android apps are there for anyone who prefers an icon on their home screen.`,
      },
    ],
  },
};

/**
 * Le bloc éditorial de `/play` dans une langue. Rendu final : la coquille ne
 * passe pas par `interpolate()`, donc plus aucune directive `{{…}}` ici.
 */
export function playDoc(locale) {
  const hand = HANDWRITTEN[locale];
  if (hand) {
    const sections = hand.sections
      .map(
        (section) => `      <h2>${esc(section.h)}</h2>
${section.p.map((para) => `      <p>${esc(para)}</p>`).join('\n')}${
          section.list
            ? `
      <ul>
${modeList(locale)}
      </ul>`
            : ''
        }`,
      )
      .join('\n\n');

    return `  <article class="play-doc" id="regles">
    <div class="play-doc-in">
      <h1>${esc(hand.h1)}</h1>
      <p class="pd-lead">${esc(hand.lead)}</p>

${sections}

${faqBlock(hand.faq, hand.faqHeading)}

${docNav(locale)}
    </div>
  </article>`;
  }

  // Les quatorze langues générées : phrases déjà traduites, rien d'inventé.
  const data = localeData(locale);
  const copy = data.home;

  return `  <article class="play-doc" id="regles">
    <div class="play-doc-in">
      <h1>${esc(fill(copy.h1))}</h1>
      <p class="pd-lead">${esc(fill(copy.standfirst))}</p>

      <h2>${esc(fill(copy.howHeading))}</h2>
      <p>${esc(fill(copy.howBody))}</p>

      <h2>${esc(fill(copy.modesHeading))}</h2>
      <p>${esc(fill(copy.modesIntro))}</p>
      <ul>
${modeList(locale)}
      </ul>

${faqBlock(copy.faq, data.chrome.faq)}

${docNav(locale)}
    </div>
  </article>`;
}
