/**
 * Analytics des pages de contenu (landing, guides, à-propos, contact, 404).
 *
 * Ces pages sont du HTML statique servi hors de l'app React Native : elles
 * n'ont jamais chargé le moindre analytics, donc TOUT le trafic SEO de
 * playgeog.com était invisible dans PostHog. Ce fichier est injecté dans chaque
 * page HTML du site (sauf la coquille du jeu, qui embarque déjà posthog-js)
 * par scripts/postbuild-web.mjs.
 *
 * Le script se charge depuis /ph/static/array.js — le proxy same-origin défini
 * dans vercel.json — pour ne pas être coupé par les bloqueurs de pub, et écrit
 * dans le même stockage que l'app : un visiteur qui lit un guide puis clique
 * « Jouer » garde son distinct_id, donc le funnel contenu → partie est réel.
 */
(function () {
  var KEY = 'phc_tCg2aCyGJxt9mKj8hKZZLwC6MkzZYvAAbj6vU4SRNnit';
  var HOST = window.location.origin + '/ph';

  var script = document.createElement('script');
  script.src = HOST + '/static/array.js';
  script.async = true;
  script.onload = function () {
    if (!window.posthog || !window.posthog.init) return;
    window.posthog.init(KEY, {
      api_host: HOST,
      ui_host: 'https://eu.posthog.com',
      // Ici l'URL est une vraie URL et chaque page est un document : on laisse
      // le SDK compter les pages vues et les sorties tout seul.
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      disable_session_recording: true,
      advanced_disable_feature_flags: true,
      // Aucun sondage n'est utilisé sur le site : sans ce drapeau, le SDK
      // télécharge surveys.js (33 Ko) sur chaque page de contenu, pour rien.
      disable_surveys: true,
      persistence: 'localStorage+cookie',
      person_profiles: 'always',
      loaded: function (ph) {
        // Même sémantique que dans l'app : `platform` sépare les surfaces,
        // `surface` distingue le site de contenu du jeu lui-même.
        ph.register({ platform: 'web', surface: 'content' });
      },
    });
  };
  document.head.appendChild(script);
})();
