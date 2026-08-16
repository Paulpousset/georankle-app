/**
 * Emplacements publicitaires des pages éditoriales (guides, à propos, contact).
 *
 * RÈGLE ABSOLUE : aucune annonce en dessous de MIN_WIDTH. Pas de bandeau
 * mobile, pas d'ancre en bas d'écran, rien. Sur téléphone et tablette, ce
 * script ne crée aucun élément et ne pousse rien dans la file adsbygoogle.
 *
 * C'est pour cette raison que les unités sont injectées ici, en JavaScript,
 * plutôt que laissées aux « Auto ads » d'AdSense : les Auto ads décident
 * seules des formats et placent en priorité des bandeaux d'ancrage sur mobile,
 * ce qu'on refuse. Les Auto ads doivent rester DÉSACTIVÉES dans la console.
 *
 * Les unités sont volontairement hors du flux de lecture :
 *   - deux rails verticaux dans les gouttières vides de part et d'autre de
 *     l'article (760px centré), jamais par-dessus le texte ;
 *   - un pavé entre deux sections, au milieu de l'article.
 * Une unité dont le slot id n'est pas renseigné est simplement ignorée.
 */
(function () {
  'use strict';

  var CLIENT = 'ca-pub-2429865520138981';

  /* Slot ids AdSense. ⚠️ À vérifier dans la console : ces deux ids viennent du
     22/07/2026 et n'ont jamais servi une impression. `inArticle` attend une
     troisième unité (format « In-article »). */
  var SLOTS = {
    railLeft: '2383979543',
    railRight: '7231760353',
    inArticle: '',
  };

  /* En dessous : aucune publicité, quelle que soit la page. L'article fait
     760px ; à 1120px il reste 180px de gouttière de chaque côté, de quoi loger
     un 160×600 sans jamais toucher le texte. */
  var MIN_WIDTH = 1120;
  var MIN_HEIGHT = 660;
  var WIDE_WIDTH = 1520; // au-delà, la gouttière accepte un 300×600

  function railSize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    if (h < MIN_HEIGHT || w < MIN_WIDTH) return null;
    return { width: w >= WIDE_WIDTH ? 300 : 160, height: 600 };
  }

  /** Une unité AdSense prête à être remplie, ou null si le slot est vide. */
  function unit(slot, width, height) {
    if (!slot) return null;
    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.style.width = width + 'px';
    ins.style.height = height + 'px';
    ins.setAttribute('data-ad-client', CLIENT);
    ins.setAttribute('data-ad-slot', slot);
    return ins;
  }

  function fill(ins) {
    if (!ins) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      /* bloqueur de pub ou script indisponible : l'<ins> vide est invisible */
    }
  }

  /* La bibliothèque AdSense n'est chargée que sur grand écran. C'est la
     garantie la plus solide du « jamais sur mobile » : sur téléphone, le script
     adsbygoogle n'existe pas dans la page, donc même des Auto ads activées par
     erreur dans la console n'ont rien à quoi s'accrocher. */
  function loadLibrary() {
    if (document.querySelector('script[data-geog-adsense]')) return;
    var s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + CLIENT;
    s.setAttribute('data-geog-adsense', '1');
    document.head.appendChild(s);
  }

  function mount() {
    var size = railSize();
    if (!size) return; // mobile et petits écrans : on s'arrête ici, définitivement

    var article = document.querySelector('article');
    if (!article) return;

    loadLibrary();

    /* --- rails latéraux --- */
    ['left', 'right'].forEach(function (side) {
      var ins = unit(side === 'left' ? SLOTS.railLeft : SLOTS.railRight, size.width, size.height);
      if (!ins) return;
      var box = document.createElement('div');
      box.className = 'ad-rail';
      box.style.cssText =
        'position:fixed;top:50%;transform:translateY(-50%);' +
        side +
        ':24px;width:' +
        size.width +
        'px;height:' +
        size.height +
        'px;overflow:hidden;z-index:1;';
      box.appendChild(ins);
      document.body.appendChild(box);
      fill(ins);
    });

    /* --- pavé au milieu de l'article, entre deux sections --- */
    var sections = article.querySelectorAll('h2');
    if (sections.length >= 3 && SLOTS.inArticle) {
      var anchor = sections[Math.floor(sections.length / 2)];
      var ins = unit(SLOTS.inArticle, 336, 280);
      var wrap = document.createElement('div');
      wrap.className = 'ad-inarticle';
      wrap.style.cssText = 'display:flex;justify-content:center;margin:34px 0;';
      wrap.appendChild(ins);
      anchor.parentNode.insertBefore(wrap, anchor);
      fill(ins);
    }
  }

  /* Un changement de taille de fenêtre ne fait pas apparaître de publicité :
     seul un rechargement le fera. C'est volontaire — AdSense ne remplit un
     <ins> qu'une fois, et on préfère zéro annonce à une annonce mal placée. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
