// Les gestes. Tout ce qui sépare une macro d'une main.
//
// Trois idées y suffisent :
//
//  1. **On vise mal.** Un doigt ne tombe jamais au pixel central d'un bouton.
//     Chaque appui est décentré d'un tirage gaussien borné par la taille de la
//     cible, donc plus un bouton est gros, plus la dispersion est large.
//  2. **On hésite avant, on lit après.** Le temps mort AVANT l'appui, c'est
//     l'œil qui trouve la cible ; celui d'APRÈS, c'est le joueur qui lit ce qui
//     vient d'apparaître. Les deux sont explicites : une vidéo qui enchaîne
//     sans respirer est illisible, et c'est le défaut n°1 des captures
//     automatiques.
//  3. **Tout est rejouable.** Le hasard vient d'un générateur à graine fixe
//     (`SEED`), donc deux prises sont identiques à l'image près. Sans ça, on ne
//     saurait jamais si un montage a bougé parce qu'on l'a changé ou parce que
//     le doigt a tremblé autrement.
//
// Les appuis passent par `Input.dispatchTouchEvent` (CDP) et non par la souris :
// l'app est en émulation tactile, et un `click` de souris ne déclenche pas les
// mêmes gestionnaires que `touchstart`/`touchend` dans react-native-web. On
// veut filmer le chemin qu'un vrai joueur emprunte, pas un chemin voisin.

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** PRNG à graine — même suite de « hasard » d'une prise à l'autre. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Interpolation douce : départ et arrivée sans à-coup. */
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Human {
  /**
   * @param {import('playwright').Page} page
   * @param {import('playwright').CDPSession} cdp
   */
  constructor(page, cdp, { seed = 1, tempo = 1, log = () => {} } = {}) {
    this.page = page;
    this.cdp = cdp;
    this.rnd = mulberry32(seed);
    this.tempo = tempo;
    this.log = log;
    this.x = null;
    this.y = null;
  }

  // ── Hasard ────────────────────────────────────────────────────────────────

  /** Uniforme dans [min, max]. */
  between(min, max) {
    return min + this.rnd() * (max - min);
  }

  /** Gaussienne centrée, coupée à ±2σ pour qu'aucun geste ne parte au loin. */
  gauss(sigma) {
    const u = Math.max(this.rnd(), 1e-9);
    const v = this.rnd();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(-2, Math.min(2, g)) * sigma;
  }

  chance(p) {
    return this.rnd() < p;
  }

  // ── Temps ─────────────────────────────────────────────────────────────────

  /** Une pause, avec sa part de flottement. `tempo` étire ou serre le tout. */
  pause(ms, spread = 0.18) {
    return sleep(ms * (1 + this.gauss(spread / 2)) * this.tempo);
  }

  /**
   * Le temps de comprendre l'écran. Nommer l'intention plutôt que des
   * millisecondes garde le scénario lisible et permet de re-régler le rythme
   * de toute la vidéo en un seul endroit.
   */
  read(kind = 'read') {
    const ms = { glance: 900, read: 1900, study: 3200, savour: 4200 }[kind] ?? kind;
    return this.pause(ms);
  }

  // ── Gestes ────────────────────────────────────────────────────────────────

  #touch(type, x, y) {
    return this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints:
        type === 'touchEnd'
          ? []
          : [{ x: Math.round(x), y: Math.round(y), radiusX: 12, radiusY: 12, force: 1 }],
    });
  }

  async #down(x, y) {
    this.x = x;
    this.y = y;
    await this.page.evaluate(([a, b]) => window.__demoDown?.(a, b), [x, y]);
    await this.#touch('touchStart', x, y);
  }

  /**
   * Un pas de glissement — et la promesse qui va avec, **délibérément pas
   * attendue** par l'appelant.
   *
   * Deux économies s'y jouent. Le doigt dessiné n'est pas rafraîchi ici : sa
   * trajectoire entière a été confiée à la page en un seul appel (`#drag`). Et
   * `Input.dispatchTouchEvent` ne rend la main qu'une fois l'événement traité
   * par le moteur de rendu ; sur le globe 3D en WebGL logiciel, cette réponse
   * coûte des secondes, et un glissement de dix-huit pas mettait trois
   * minutes. Les messages CDP partent dans l'ordre sur la même socket : la
   * trajectoire reste exacte, seul l'accusé de réception est différé, et le
   * rythme du geste vient des pauses entre les envois.
   */
  #move(x, y) {
    this.x = x;
    this.y = y;
    return this.#touch('touchMove', x, y);
  }

  /** Confie à la page l'animation complète du doigt entre deux points. */
  #drag(x0, y0, x1, y1, ms) {
    return this.page.evaluate(
      ([a, b, c, d, e]) => window.__demoDrag?.(a, b, c, d, e),
      [x0, y0, x1, y1, ms],
    );
  }

  async #up() {
    const [x, y] = [this.x, this.y];
    await this.#touch('touchEnd', x, y);
    await this.page.evaluate(([a, b]) => window.__demoUp?.(a, b), [x, y]);
  }

  /**
   * Amène la cible dans l'écran si elle n'y est pas — en faisant défiler comme
   * un humain, pas en téléportant la page comme le ferait `scrollIntoView`.
   */
  async ensureVisible(locator) {
    const vh = this.page.viewportSize().height;
    for (let i = 0; i < 8; i++) {
      const box = await locator.boundingBox();
      if (!box) throw new Error('cible introuvable à l’écran');
      // Une marge de 90 px en bas : un bouton à demi caché par le bord ne se
      // tape pas, et il ne se filme pas non plus.
      if (box.y >= 70 && box.y + box.height <= vh - 90) return box;
      const delta = box.y < 70 ? box.y - vh * 0.35 : box.y + box.height - vh * 0.72;
      await this.scroll(delta);
      await this.pause(320);
    }
    return locator.boundingBox();
  }

  /**
   * Appuyer sur quelque chose. C'est le geste de base, et il est délibérément
   * lent : hésitation, contact franc, temps de relâche, puis le temps de voir
   * ce que ça a fait.
   *
   * @param {import('playwright').Locator} locator
   * @param {{ label?: string, before?: number, hold?: number, after?: number|string }} opts
   */
  async tap(locator, { label = '', before, hold, after = 'read' } = {}) {
    await locator.first().waitFor({ state: 'visible', timeout: 15000 });
    const box = await this.ensureVisible(locator.first());

    // Le point d'impact : centre + écart gaussien proportionnel à la cible,
    // borné pour rester franchement dans le bouton.
    const jx = Math.max(-box.width / 3, Math.min(box.width / 3, this.gauss(box.width / 7)));
    const jy = Math.max(-box.height / 3, Math.min(box.height / 3, this.gauss(box.height / 7)));
    const x = box.x + box.width / 2 + jx;
    const y = box.y + box.height / 2 + jy;

    await this.pause(before ?? this.between(340, 760)); // l'œil trouve la cible
    await this.#down(x, y);
    await this.pause(hold ?? this.between(75, 145)); // le contact
    await this.#up();
    this.log(`tap ${label || (await locator.first().getAttribute('aria-label')) || ''}`);
    if (after != null) await this.read(after);
  }

  /**
   * Appuyer à un endroit précis de l'écran, sans cible DOM — sur le globe 3D,
   * une carte, un canevas.
   *
   * `before` est délibérément long par défaut. Un appui qui suit de trop près
   * le geste précédent est lu comme un DOUBLE-TAP : c'est ce qui a fait zoomer
   * le globe à fond au milieu d'une prise, rendant la moitié de la scène
   * inutilisable — pour un plan parfaitement silencieux, sans la moindre
   * erreur dans le journal.
   */
  async tapAt(x, y, { label = 'écran', before = 1400, hold, after = 'read' } = {}) {
    await this.pause(before);
    await this.#down(x + this.gauss(3), y + this.gauss(3));
    await this.pause(hold ?? this.between(75, 145));
    await this.#up();
    this.log(`tap ${label} (${Math.round(x)}, ${Math.round(y)})`);
    if (after != null) await this.read(after);
  }

  /** Appuyer sur un bouton par son libellé d'accessibilité. */
  tapButton(name, opts = {}) {
    return this.tap(this.page.getByRole('button', { name, exact: true }), { label: name, ...opts });
  }

  /** Appuyer sur un texte affiché — repli quand le bouton n'est pas étiqueté. */
  tapText(text, opts = {}) {
    return this.tap(this.page.getByText(text, { exact: true }), { label: text, ...opts });
  }

  /**
   * Écrire. Lentement, irrégulièrement, avec des respirations aux espaces et de
   * vraies hésitations : un champ qui se remplit d'un bloc trahit la machine
   * plus sûrement que n'importe quel autre détail.
   *
   * @param {{ cps?: number, typo?: boolean }} opts `cps` = caractères/seconde visé.
   */
  async type(locator, text, { cps = 6, typo = false, after = 'glance' } = {}) {
    await this.tap(locator, { label: `champ « ${text} »`, after: 320 });
    const base = 1000 / cps;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      // Une faute, puis la correction. Très humain à l'image, mais à réserver
      // aux formats sociaux : sur une fiche store, ça se lit comme un bug.
      if (typo && i > 1 && this.chance(0.05)) {
        const wrong = 'azertyuiop'[Math.floor(this.rnd() * 10)];
        await this.page.keyboard.type(wrong);
        await this.pause(this.between(260, 520));
        await this.page.keyboard.press('Backspace');
        await this.pause(this.between(180, 340));
      }

      await this.page.keyboard.type(ch);
      let d = base * (1 + this.gauss(0.3));
      if (ch === ' ') d += this.between(160, 380); // on respire entre les mots
      if (this.chance(0.07)) d += this.between(300, 650); // on cherche la suite
      await sleep(Math.max(45, d) * this.tempo);
    }
    if (after != null) await this.read(after);
  }

  /**
   * Faire défiler.
   *
   * Deux pièges, tous deux découverts à l'image :
   *
   *  • **La roulette n'agit que sous le curseur.** Chrome dirige l'événement
   *    vers l'élément survolé, et le curseur d'une page fraîche est en (0,0),
   *    hors de la liste. Sans le `mouse.move` ci-dessous, `scroll()` ne fait
   *    rien du tout — et une prise entière peut se terminer sans qu'aucune
   *    page n'ait bougé, sans la moindre erreur.
   *  • **Un vrai glissement tactile ne suffit pas.** `Input.dispatchTouchEvent`
   *    ne déclenche qu'un panoramique partiel dans le compositeur ; la course
   *    obtenue vaut le dixième du geste. La roulette, elle, est exacte.
   *
   * On garde donc la roulette pour le mouvement et on dessine le doigt qui
   * lui correspond : le geste montré est celui que le joueur ferait, et il
   * remonte quand le contenu remonte.
   */
  async scroll(dy, { steps = 18, ms = 700, finger = true } = {}) {
    const { width, height } = this.page.viewportSize();
    const cx = width / 2 + this.gauss(10);
    await this.page.mouse.move(cx, height * 0.55);

    // Le doigt part du bas pour descendre, du haut pour remonter, et sa course
    // reste dans l'écran même quand le défilement demandé est long.
    const travel = Math.min(Math.abs(dy), height * 0.42);
    const fy0 = dy > 0 ? height * 0.74 : height * 0.3;
    if (finger) await this.#drag(cx, fy0, cx, fy0 - Math.sign(dy) * travel, ms * this.tempo);

    // Comme pour les glissements : on envoie sans attendre l'accusé de
    // réception. `mouse.wheel` ne rend la main qu'une fois la molette traitée
    // par le moteur de rendu, et sur un écran 3D cette réponse coûte des
    // secondes — « Mode Histoire », qui ne fait pourtant que défiler, mettait
    // trois minutes. Le rythme vient des pauses entre les envois, pas des
    // réponses.
    const sent = [];
    let done = 0;
    for (let i = 1; i <= steps; i++) {
      const t = easeInOut(i / steps);
      sent.push(this.page.mouse.wheel(0, dy * t - done));
      done = dy * t;
      await sleep((ms / steps) * this.tempo);
    }
    await Promise.all(sent);
    // `__demoLift` et non `__demoUp` : pas d'onde, ce n'était pas un appui.
    if (finger) await this.page.evaluate(() => window.__demoLift?.());
    await this.pause(280); // l'inertie retombe
  }

  /**
   * Où en est le défilement, et jusqu'où il peut aller.
   *
   * react-native-web ne fait pas défiler la fenêtre : chaque `ScrollView` est
   * un `div` à débordement. On repère donc le plus grand conteneur défilable
   * de l'écran — c'est toujours celui que le joueur manipule — et on retombe
   * sur la fenêtre si l'écran n'en a aucun.
   */
  scrollState() {
    return this.page.evaluate(() => {
      let best = null;
      for (const e of document.querySelectorAll('*')) {
        if (e.scrollHeight > e.clientHeight + 20 && e.clientHeight > 200) {
          if (!best || e.clientHeight > best.clientHeight) best = e;
        }
      }
      return best
        ? { top: best.scrollTop, max: best.scrollHeight - best.clientHeight }
        : { top: window.scrollY, max: document.documentElement.scrollHeight - innerHeight };
    });
  }

  /**
   * Parcourir un écran de bout en bout, puis revenir en haut.
   *
   * On ne défile pas d'un nombre de pixels décidé à l'avance : une liste de
   * quarante pays et un menu de dix cartes n'ont pas la même hauteur, et un
   * défilement trop court laisserait la moitié de l'écran hors du film pendant
   * qu'un défilement trop long ferait battre la page contre sa butée. On
   * avance donc par écrans et on s'arrête quand plus rien ne bouge.
   *
   * @returns {Promise<number>} le nombre d'écrans réellement parcourus.
   */
  async browse({ dwell = 'read', max = 6, back = true } = {}) {
    const step = this.page.viewportSize().height * 0.72;
    let moved = 0;
    // On relit l'état une fois par palier, pas deux : l'état d'arrivée d'un
    // palier est l'état de départ du suivant, et chaque lecture est un
    // aller-retour de plus dans une page déjà occupée à rendre.
    let state = await this.scrollState();

    for (let i = 0; i < max; i++) {
      if (state.top >= state.max - 4) break; // déjà en bas
      await this.scroll(step);
      const after = await this.scrollState();
      const progressed = after.top - state.top >= 8;
      state = after;
      if (!progressed) break; // rien n'a bougé : inutile d'insister
      moved++;
      await this.read(dwell);
    }

    if (back && moved) {
      // La remontée est plus vive que la descente : on ne relit pas ce qu'on
      // vient de lire, et un retour au ralenti se voit comme un temps mort.
      await this.scroll(-step * moved, { steps: 22, ms: 520 + 120 * moved });
      await this.pause(420);
    }
    return moved;
  }

  /**
   * Glisser le doigt : rotation du globe, cartes qu'on tire. Le tracé suit la
   * même courbe douce que le défilement, avec un léger tremblement latéral.
   */
  async swipe(from, to, { ms = 900, steps = 18 } = {}) {
    await this.pause(this.between(300, 620));
    this.x = from.x;
    this.y = from.y;
    await this.#drag(from.x, from.y, to.x, to.y, ms * this.tempo);
    await this.#touch('touchStart', from.x, from.y);
    await this.pause(60);
    const sent = [];
    for (let i = 1; i <= steps; i++) {
      const t = easeInOut(i / steps);
      sent.push(
        this.#move(
          from.x + (to.x - from.x) * t + this.gauss(1.2),
          from.y + (to.y - from.y) * t + this.gauss(1.2),
        ),
      );
      await sleep((ms / steps) * this.tempo);
    }
    await Promise.all(sent); // le doigt ne se lève pas avant d'avoir tout posé
    await this.pause(90);
    await this.#up();
    await this.pause(500);
  }

  /** Un glissement relatif au centre de l'écran — pour faire tourner le globe. */
  swipeCenter(dx, dy, opts) {
    const { width, height } = this.page.viewportSize();
    const from = { x: width / 2 - dx / 2, y: height / 2 - dy / 2 };
    return this.swipe(from, { x: from.x + dx, y: from.y + dy }, opts);
  }
}
