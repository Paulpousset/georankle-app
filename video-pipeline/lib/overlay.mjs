// Le calque qui rend le doigt visible.
//
// Sans lui, une capture d'app mobile est incompréhensible : l'écran change
// sans qu'on voie pourquoi. Un rond au point de contact et une onde qui s'en
// échappe suffisent — c'est le vocabulaire qu'Apple et Google utilisent dans
// leurs propres démos, et il ne détourne pas le regard du jeu.
//
// Le calque est injecté par `addInitScript`, donc présent avant la première
// image de l'app : aucune prise ne peut commencer avec un doigt invisible.

/** Les modes dont l'écran d'introduction s'affiche une fois, à neutraliser. */
const MODES = [
  'classic', 'streak', 'versus', 'guess', 'globe', 'regions', 'challenge',
  'quiz-capital', 'quiz-flag', 'higherlower', 'silhouette', 'borders',
  'languages', 'local-builder',
];

export const overlayInit = ({ modes = MODES } = {}) => `
(() => {
  // ── Les popups de première ouverture ─────────────────────────────────────
  // AsyncStorage écrit dans localStorage sur le web, avec les mêmes clés que
  // l'app. On se déclare « déjà vu » pour que la visite ne soit pas hachée par
  // le tutoriel et les intros de mode.
  try {
    localStorage.setItem('tutorial:seen:v2', 'true');
    for (const m of ${JSON.stringify(modes)}) {
      localStorage.setItem('modeIntro:seen:v2:' + m, 'true');
    }
  } catch (e) {}

  const CSS = \`
    #__demo { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
    /* Le doigt est en deux couches : l'enveloppe porte le DÉPLACEMENT, le
       noyau porte l'apparition et l'écrasement. Deux transformations sur le
       même élément se seraient écrasées l'une l'autre. */
    #__demo .dot { position: absolute; left: 0; top: 0; will-change: transform; }
    #__demo .dot > i {
      display: block; width: 42px; height: 42px; margin: -21px 0 0 -21px;
      border-radius: 50%; background: rgba(255,255,255,.30);
      box-shadow: 0 0 0 1.5px rgba(0,0,0,.22), inset 0 0 0 1px rgba(255,255,255,.55);
      backdrop-filter: saturate(1.2) brightness(1.06);
    }
    #__demo .ring {
      position: absolute; width: 42px; height: 42px; margin: -21px 0 0 -21px;
      border-radius: 50%; border: 2.5px solid rgba(255,255,255,.75);
      box-shadow: 0 0 0 1.5px rgba(0,0,0,.18);
    }
    /* Une barre de défilement dans une vidéo de store, c'est un bug visuel. */
    ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
    * { -webkit-tap-highlight-color: transparent !important; }
  \`;

  const boot = () => {
    if (document.getElementById('__demo')) return;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const layer = document.createElement('div');
    layer.id = '__demo';
    document.body.appendChild(layer);

    let finger = null;

    const place = (el, x, y) => { el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)'; };

    const ensure = (x, y) => {
      if (!finger) {
        finger = document.createElement('div');
        finger.className = 'dot';
        finger.appendChild(document.createElement('i'));
        layer.appendChild(finger);
      }
      place(finger, x, y);
      return finger;
    };

    /** Le doigt se pose : un rond plein qui apparaît et grossit un peu. */
    window.__demoDown = (x, y) => {
      const f = ensure(x, y);
      f.firstChild.animate(
        [{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 110, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'forwards' },
      );
    };

    /** Le doigt glisse, une position à la fois. */
    window.__demoMove = (x, y) => { if (finger) place(finger, x, y); };

    /**
     * Le glissement ENTIER, joué par le navigateur lui-même.
     *
     * C'est la seule façon de filmer un geste sur un écran chargé : envoyer
     * une position par image demanderait un aller-retour par pas, et sur le
     * globe 3D — rendu en logiciel, thread principal saturé — chacun coûte des
     * centaines de millisecondes. Une scène de trente secondes en prenait
     * deux cents. Ici, un seul appel décrit toute la trajectoire, et
     * l'animation se déroule côté page pendant que les événements tactiles
     * partent de leur côté.
     */
    window.__demoDrag = (x0, y0, x1, y1, ms) => {
      const f = ensure(x0, y0);
      f.firstChild.animate(
        [{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 110, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'forwards' },
      );
      f.animate(
        [
          { transform: 'translate3d(' + x0 + 'px,' + y0 + 'px,0)' },
          { transform: 'translate3d(' + x1 + 'px,' + y1 + 'px,0)' },
        ],
        { duration: ms, easing: 'cubic-bezier(.42,0,.58,1)', fill: 'forwards' },
      );
    };

    /** Le doigt se lève : le rond s'efface, une onde part du point de contact. */
    window.__demoUp = (x, y) => {
      if (finger) {
        const f = finger; finger = null;
        f.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-out', fill: 'forwards' })
          .finished.then(() => f.remove(), () => f.remove());
      }
      const ring = document.createElement('div');
      ring.className = 'ring';
      ring.style.left = x + 'px';
      ring.style.top = y + 'px';
      layer.appendChild(ring);
      ring.animate(
        [{ opacity: .85, transform: 'scale(.7)' }, { opacity: 0, transform: 'scale(2.1)' }],
        { duration: 480, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'forwards' },
      ).finished.then(() => ring.remove(), () => ring.remove());
    };

    /**
     * Le doigt se lève SANS onde : c'est la fin d'un glissement, pas d'un
     * appui. L'onde est le vocabulaire du « j'ai appuyé » — la mettre ici
     * ferait croire à un appui sur ce qui passe sous le doigt.
     */
    window.__demoLift = () => {
      if (!finger) return;
      const f = finger; finger = null;
      f.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out', fill: 'forwards' })
        .finished.then(() => f.remove(), () => f.remove());
    };

    window.__demoReady = true;
  };

  const watch = () => {
    boot();
    // L'app monte son arbre React après coup et peut remplacer le body : on
    // remet le calque si jamais il disparaît.
    new MutationObserver(() => { if (!document.getElementById('__demo')) boot(); })
      .observe(document.documentElement, { childList: true, subtree: false });
  };

  // Le script d'init s'exécute avant que le document existe : « documentElement »
  // est alors nul et l'observateur refuserait de démarrer.
  if (document.body) watch();
  else document.addEventListener('DOMContentLoaded', watch, { once: true });
})();
`;
