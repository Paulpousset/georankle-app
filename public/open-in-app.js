/**
 * Le pont web → application, pour tous les liens partagés.
 *
 * Un lien de parrainage (`?code=`) ou d'invitation de ligue (`?league=`) ouvre
 * d'abord une page web : c'est ce qui permet à quelqu'un sans l'app de jouer
 * quand même. Mais quand l'app EST installée, rester dans le navigateur est une
 * impasse — le code n'est jamais crédité, la ligue jamais rejointe.
 *
 * Trois chemins, du plus fluide au plus manuel :
 *   1. universal link / app link (iOS `associatedDomains`, Android `autoVerify`)
 *      — le système ouvre l'app avant même cette page. Rien à faire ici, mais
 *      cela demande un build store, et ne marche pas depuis les navigateurs
 *      intégrés (Instagram, Facebook, Snapchat) ;
 *   2. Android : redirection automatique en `intent://`. Si l'app manque, Chrome
 *      part sur `browser_fallback_url` — la même page avec `web=1`, donc jamais
 *      de cul-de-sac ni de détour par le Play Store ;
 *   3. partout : une barre « Ouvrir dans l'app » (un geste utilisateur, seule
 *      façon fiable de lancer le schéma `geog://` sur iOS).
 *
 * `web=1` coupe tout : c'est le drapeau qui dit « ce joueur a choisi le
 * navigateur » (bouton « jouer sans installer », ou retour d'un intent raté).
 * Le script est volontairement chargé de façon bloquante en tête du `<head>` :
 * la redirection Android doit partir avant le bundle de jeu, pas après.
 */
(function () {
  'use strict';

  var SCHEME = 'geog';
  var PACKAGE = 'com.paulpousset.geog';
  var STORE_IOS = 'https://apps.apple.com/app/id6779650018';
  var STORE_ANDROID = 'https://play.google.com/store/apps/details?id=' + PACKAGE;
  var TRIED_KEY = 'geog_open_in_app_tried';
  var HIDDEN_KEY = 'geog_open_in_app_hidden';

  // Dans une iframe (aperçus, previews), on ne détourne jamais la navigation.
  try {
    if (window.top !== window.self) return;
  } catch (e) {
    return;
  }

  var params = new URLSearchParams(location.search);
  var clean = function (v) {
    return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  };
  var code = clean(params.get('code') || params.get('ref'));
  var league = clean(params.get('league'));
  var stayOnWeb = params.get('web') === '1';
  if (!code && !league) return;

  var ua = navigator.userAgent || '';
  var isAndroid = /android/i.test(ua);
  var isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (/Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1);
  if (!isAndroid && !isIOS) return;

  function remember(key) {
    try {
      sessionStorage.setItem(key, '1');
    } catch (e) {
      /* navigation privée : tant pis, on retentera */
    }
  }
  function remembered(key) {
    try {
      return sessionStorage.getItem(key) === '1';
    } catch (e) {
      return false;
    }
  }

  // `geog://play?league=…` et `geog://invite?code=…` : les deux formes que
  // src/lib/links.ts sait relire (parseReferralCode / parseLeagueCode).
  var query = [];
  if (code) query.push('code=' + code);
  if (league) query.push('league=' + league);
  var target = (league ? 'play' : 'invite') + (query.length ? '?' + query.join('&') : '');
  var schemeUrl = SCHEME + '://' + target;

  /** La même page, marquée « le joueur reste sur le web ». */
  function webFallbackUrl() {
    var u = new URL(location.href);
    u.searchParams.set('web', '1');
    return u.toString();
  }

  /** L'URL `intent://` de Chrome Android, avec sa porte de sortie. */
  function intentUrl(fallback) {
    return (
      'intent://' +
      target +
      '#Intent;scheme=' + SCHEME +
      ';package=' + PACKAGE +
      ';S.browser_fallback_url=' + encodeURIComponent(fallback) +
      ';end'
    );
  }

  /**
   * Ouvre l'app depuis un geste utilisateur : ici le magasin est la bonne
   * retombée — la personne vient de dire qu'elle veut l'application.
   */
  function openApp() {
    if (isAndroid) {
      location.href = intentUrl(STORE_ANDROID);
      return;
    }
    // iOS : le schéma custom ne dit pas s'il a marché. On part au magasin si la
    // page est toujours au premier plan une seconde et demie plus tard.
    var timer = setTimeout(function () {
      location.href = STORE_IOS;
    }, 1500);
    var cancel = function () {
      if (document.visibilityState === 'hidden') clearTimeout(timer);
    };
    document.addEventListener('visibilitychange', cancel);
    window.addEventListener('pagehide', function () {
      clearTimeout(timer);
    });
    location.href = schemeUrl;
  }

  // Exposé pour la page d'invitation et pour les tests de bout en bout.
  window.GeogOpenInApp = { open: openApp, schemeUrl: schemeUrl, intentUrl: intentUrl };

  // ── 1. Android : la tentative automatique, une seule fois par session ───────
  if (isAndroid && !stayOnWeb && !remembered(TRIED_KEY)) {
    remember(TRIED_KEY);
    location.href = intentUrl(webFallbackUrl());
    return;
  }

  // ── 2. La barre « Ouvrir dans l'app » ──────────────────────────────────────
  // Inutile quand le joueur a explicitement choisi le navigateur (`web=1`) :
  // sur Android cela signifie même que l'app n'est pas installée.
  if (stayOnWeb || remembered(HIDDEN_KEY)) return;

  // Les textes viennent de la page (une langue par coquille) ; le repli sert aux
  // pages qui n'en fournissent pas.
  var copy = window.GEOG_APP_LINK || {};
  var isFr = (document.documentElement.lang || '').indexOf('fr') === 0;
  var haveText = copy.have || (isFr ? "Tu as déjà l'application ?" : 'Already have the app?');
  var openText = copy.open || (isFr ? "Ouvrir dans l'app" : 'Open in the app');
  var closeLabel = copy.close || (isFr ? 'Fermer' : 'Dismiss');

  function mount() {
    // La page d'invitation a déjà ses propres boutons : on s'y branche au lieu
    // d'empiler une barre par-dessus.
    var existing = document.querySelectorAll('[data-geog-open]');
    if (existing.length) {
      for (var i = 0; i < existing.length; i++) {
        existing[i].addEventListener('click', function (ev) {
          ev.preventDefault();
          openApp();
        });
      }
      return;
    }

    var style = document.createElement('style');
    style.textContent =
      '#geog-open-bar{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;' +
      'display:flex;align-items:center;gap:12px;padding:12px 14px;' +
      'padding-bottom:calc(12px + env(safe-area-inset-bottom));' +
      'background:#fffaf0;color:#1e2a22;border-top:1px solid #e2d6b8;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;' +
      'font-size:15px;line-height:1.3;box-shadow:0 -6px 24px rgba(0,0,0,.14)}' +
      '#geog-open-bar span{flex:1}' +
      '#geog-open-bar button{font:inherit;font-weight:700;border:0;border-radius:12px;' +
      'padding:11px 16px;background:#2a6e3f;color:#fff;cursor:pointer}' +
      '#geog-open-bar .geog-close{background:transparent;color:#5a6b5f;font-weight:400;padding:11px 6px}' +
      '@media (prefers-color-scheme:dark){#geog-open-bar{background:#1c2b23;color:#f2ede0;border-top-color:#2c3d33}' +
      '#geog-open-bar button{background:#4fae6f;color:#08130c}' +
      '#geog-open-bar .geog-close{background:transparent;color:#a7b6ab}}';
    document.head.appendChild(style);

    var bar = document.createElement('div');
    bar.id = 'geog-open-bar';
    var label = document.createElement('span');
    label.textContent = haveText;
    var open = document.createElement('button');
    open.type = 'button';
    open.textContent = openText;
    open.addEventListener('click', openApp);
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'geog-close';
    close.setAttribute('aria-label', closeLabel);
    close.textContent = '✕';
    close.addEventListener('click', function () {
      remember(HIDDEN_KEY);
      bar.remove();
    });
    bar.appendChild(label);
    bar.appendChild(open);
    bar.appendChild(close);
    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
