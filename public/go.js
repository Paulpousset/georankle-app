/**
 * Lien de bio traçable : playgeog.com/tiktok, /instagram, /youtube.
 *
 * Avant ce fichier, aucun canal marketing n'était mesurable : un pic de 12
 * inscriptions le 31/08/2026 est resté inexplicable. Chaque page /<source>/
 * charge ce script, enregistre UN événement PostHog `campaign_link_opened`
 * (source + OS), puis renvoie vers le store du téléphone — avec des paramètres
 * de campagne que les consoles Apple/Google savent lire — ou vers /play sur
 * ordinateur, avec des UTM que posthog-js dans l'app attache à la personne.
 */
(function () {
  var source = (location.pathname.split('/').filter(Boolean)[0] || 'link').toLowerCase();
  var ua = navigator.userAgent || '';
  var ios =
    /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var android = /Android/.test(ua);
  var os = ios ? 'ios' : android ? 'android' : 'desktop';

  var utm = 'utm_source=' + source + '&utm_medium=social&utm_campaign=bio';
  // App Store Connect → Analytics → Sources → Campaigns : le « provider token »
  // (pt=) est obligatoire pour qu'Apple attribue le trafic à ct=<source>.
  // Tant qu'il est vide, l'install reste comptée dans « App Referrer / Web Referrer ».
  var APPLE_PT = '';
  var iosUrl =
    'https://apps.apple.com/app/id6779650018' +
    (APPLE_PT ? '?pt=' + APPLE_PT + '&ct=' + source + '&mt=8' : '');
  // Google Play lit `referrer=` et l'expose dans Console → Acquisition → UTM.
  var androidUrl =
    'https://play.google.com/store/apps/details?id=com.paulpousset.geog&referrer=' +
    encodeURIComponent(utm);
  var webUrl = '/play?' + utm;
  var target = ios ? iosUrl : android ? androidUrl : webUrl;

  var link = document.getElementById('go');
  if (link) link.setAttribute('href', target);

  var left = false;
  function go() {
    if (left) return;
    left = true;
    location.replace(target);
  }

  // site-analytics.js charge posthog-js en asynchrone : on attend qu'il soit là
  // (au plus ~1,5 s), on capture, puis on part. Sans PostHog, on part quand même.
  var tries = 0;
  (function wait() {
    var ph = window.posthog;
    if (ph && typeof ph.capture === 'function' && ph.__loaded) {
      // posthog-js met les events en file et n'envoie qu'après ~3 s : ici on
      // quitte la page tout de suite, donc envoi immédiat, par beacon (survit
      // à la navigation). Vérifié en prod : sans ça, aucun event ne partait.
      ph.capture(
        'campaign_link_opened',
        {
          source: source,
          target_os: os,
          utm_source: source,
          utm_medium: 'social',
          utm_campaign: 'bio',
          $set: { utm_source: source },
        },
        { send_instantly: true, transport: 'sendBeacon' },
      );
      setTimeout(go, 350);
      return;
    }
    if (++tries > 30) return go();
    setTimeout(wait, 50);
  })();
  setTimeout(go, 2500);
})();
