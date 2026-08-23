/**
 * Régénère la page d'accueil anglaise depuis la française.
 *
 *   node site/tools/sync-home-en.mjs
 *
 * ⚠️ Écrase `site/content/en/home.html`. Toute correction anglaise doit donc
 * être faite ICI, dans la table de traduction, pas dans le fichier produit.
 * En contrepartie, le script échoue bruyamment dès qu'une chaîne française
 * bouge : la version anglaise ne peut pas dériver en silence.
 *
 * Elle reprend le fragment français à l'identique — même balisage, même feuille
 * de style, même canvas — et n'en traduit que les chaînes visibles. Le plan SEO
 * interdit tout changement de design, et une page traduite qui diverge du
 * gabarit d'origine se met à diverger pour de bon au premier correctif.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'site', 'content');
let s = readFileSync(join(DIR, 'fr', 'home.html'), 'utf8');

/** Ordre significatif : les chaînes longues d'abord, pour éviter les collisions. */
const T = [
  // ── entête de page ─────────────────────────────────────────────────────────
  [
    'title: GeoG — Jeu de géographie : quiz, drapeaux et capitales du monde',
    'title: GeoG — Geography Game: world flags, capitals and country quiz',
  ],
  [
    'description: GeoG, le jeu de géographie gratuit : quiz de drapeaux, capitales et pays du monde, défi du jour, duels en ligne et mode classé. Joue dans ton navigateur ou sur iPhone et Android.',
    'description: GeoG, the free geography game: world flag, capital and country quizzes, a daily challenge, live duels and a ranked ladder. Play in your browser, or on iPhone and Android.',
  ],
  [
    'ogTitle: GeoG — Jeu de géographie : quiz, drapeaux et capitales',
    'ogTitle: GeoG — Geography Game: flags, capitals and countries',
  ],
  [
    'ogDescription: Le jeu de géographie gratuit : drapeaux, capitales, pays du monde, défi du jour et duels en ligne. Joue dans ton navigateur ou sur mobile.',
    'ogDescription: The free geography game: flags, capitals, countries of the world, a daily challenge and online duels. Play in your browser or on mobile.',
  ],

  // ── navigation ─────────────────────────────────────────────────────────────
  ['<a href="#modes">Modes</a>', '<a href="#modes">Modes</a>'],
  ['<a href="#enligne">En ligne</a>', '<a href="#enligne">Online</a>'],
  ['<a href="{{link:guides}}">Guides</a>', '<a href="{{link:guides}}">Guides</a>'],
  ['<a class="nav-cta" href="{{play}}">Jouer</a>', '<a class="nav-cta" href="{{play}}">Play</a>'],

  // ── hero ───────────────────────────────────────────────────────────────────
  ['48°51′N · 2°21′E — Expédition n°1', '48°51′N · 2°21′E — Expedition No. 1'],
  ['Le jeu de géographie qui te fait ', 'The geography game that takes you '],
  ['>voyager<', '>travelling<'],
  [
    'Drapeaux, capitales, globe 3D, frontières… <b>{{modes}} modes de jeu</b> dans un atlas au style unique. Un <b>défi du jour</b> identique pour toute la planète, des duels en ligne et un mode classé.',
    'Flags, capitals, a 3D globe, borders… <b>{{modes}} game modes</b> inside an atlas unlike any other. A <b>daily challenge</b> shared by the whole planet, live duels and a ranked ladder.',
  ],
  ['Jouer maintenant', 'Play now'],
  ['<small>Télécharger sur</small>', '<small>Download on the</small>'],
  ['<small>Disponible sur</small>', '<small>Get it on</small>'],
  [
    '<b>✓ Gratuit</b> · sans compte pour le défi du jour · web, iPhone &amp; Android',
    '<b>✓ Free</b> · no account for the daily challenge · web, iPhone &amp; Android',
  ],
  ['🚩 {{countries}} pays', '🚩 {{countries}} countries'],
  ['✦ Style atlas 1850', '✦ 1850 atlas style'],
  [
    'aria-label="Globe terrestre interactif de style atlas ancien — fais-le tourner !"',
    'aria-label="Interactive antique-atlas globe — give it a spin!"',
  ],
  ['>Explorer<', '>Explore<'],

  // ── marquee ────────────────────────────────────────────────────────────────
  [
    '<span>Drapeaux <i>✦</i> Capitales <i>✦</i> Globe 3D <i>✦</i> Rankle <i>✦</i> Frontières <i>✦</i> Devine le pays <i>✦</i> Plus ou moins <i>✦</i> Silhouettes <i>✦</i> Défi du jour <i>✦</i> Duels en ligne <i>✦</i> Mode classé <i>✦</i> Mode histoire <i>✦</i></span>',
    '<span>Flags <i>✦</i> Capitals <i>✦</i> 3D Globe <i>✦</i> Rankle <i>✦</i> Borders <i>✦</i> Guess the Country <i>✦</i> Higher or Lower <i>✦</i> Silhouettes <i>✦</i> Daily Challenge <i>✦</i> Online Duels <i>✦</i> Ranked <i>✦</i> Story Mode <i>✦</i></span>',
  ],

  // ── modes ──────────────────────────────────────────────────────────────────
  ['<p class="overline">{{modes}} modes de jeu</p>', '<p class="overline">{{modes}} game modes</p>'],
  [
    '<h2>Tous les quiz de géographie.<br/>Un seul atlas.</h2>',
    '<h2>Every geography quiz.<br/>One single atlas.</h2>',
  ],
  [
    '<p>Chaque mode se joue en solo, en duel ou en ligne — et chacun a sa version « défi du jour ».</p>',
    '<p>Every mode plays solo, in a duel or online — and each one has its daily-challenge version.</p>',
  ],
  [
    '<h3>Drapeaux</h3><p>Identifie le pays derrière chacun des {{countries}} drapeaux du monde.</p>',
    '<h3>Flags</h3><p>Name the country behind each of the world’s {{countries}} flags.</p>',
  ],
  [
    '<h3>Capitales</h3><p>Retrouve la capitale de chaque pays, des plus connues aux pièges.</p>',
    '<h3>Capitals</h3><p>Find every country’s capital, from the obvious ones to the traps.</p>',
  ],
  [
    '<h3>Globe 3D</h3><p>Localise le pays demandé en faisant tourner un vrai globe.</p>',
    '<h3>3D Globe</h3><p>Locate the country you are given by spinning a real globe.</p>',
  ],
  [
    '<h3>Devine le pays</h3><p>Les indices tombent un à un : trouve le pays le plus vite possible.</p>',
    '<h3>Guess the Country</h3><p>Clues drop one by one — find the country in as few tries as you can.</p>',
  ],
  [
    '<h3>Rankle</h3><p>Classe 5 pays selon un critère mystère : population, PIB, superficie…</p>',
    '<h3>Rankle</h3><p>Sort countries by a hidden criterion: population, GDP, area…</p>',
  ],
  [
    '<h3>Frontières</h3><p>Relie deux pays en traversant leurs frontières terrestres.</p>',
    '<h3>Borders</h3><p>Link two countries by hopping across their land borders.</p>',
  ],
  [
    '<h3>Plus ou moins</h3><p>Ce pays est-il plus peuplé que le précédent ? Enchaîne la série.</p>',
    '<h3>Higher or Lower</h3><p>Is this country bigger than the last one? Keep the chain alive.</p>',
  ],
  [
    '<h3>Silhouettes</h3><p>Reconnais un pays à sa seule forme, sans aucune autre aide.</p>',
    '<h3>Silhouettes</h3><p>Recognise a country from its outline alone, with no other help.</p>',
  ],
  ['Et aussi :\n        <a href="{{link:mode-daily}}">le défi du jour</a> ·\n        <a href="{{link:mode-online}}">les duels en ligne</a> ·\n        <a href="{{link:mode-ranked}}">le mode classé</a> ·\n        <a href="{{link:mode-story}}">le mode histoire</a>',
   'Also: <a href="{{link:mode-daily}}">the daily challenge</a> ·\n        <a href="{{link:mode-online}}">online duels</a> ·\n        <a href="{{link:mode-ranked}}">ranked mode</a> ·\n        <a href="{{link:mode-story}}">story mode</a>'],

  // ── showcase ───────────────────────────────────────────────────────────────
  ['<p class="overline">Style atlas ancien</p>', '<p class="overline">Antique atlas style</p>'],
  [
    '<h2>Une carte d\'explorateur,<br/>pas un quiz de plus.</h2>',
    '<h2>An explorer’s map,<br/>not another quiz app.</h2>',
  ],
  [
    '<p>Parchemin, rose des vents, typographie d\'atlas : GeoG a une identité que tu ne trouveras dans aucun autre jeu de géographie.</p>',
    '<p>Parchment, compass rose, atlas type: GeoG looks like nothing else in the geography-game aisle.</p>',
  ],
  [
    'alt="Mode Globe 3D de GeoG : localiser l\'Uruguay sur un globe de style atlas ancien"',
    'alt="GeoG 3D Globe mode: locating Uruguay on an antique-atlas globe"',
  ],
  [
    'alt="Menu principal de GeoG : défi du jour, mode solo, local et en ligne"',
    'alt="GeoG main menu: daily challenge, solo, local and online modes"',
  ],
  [
    'alt="Mode Frontières de GeoG : relier deux pays par leurs frontières terrestres"',
    'alt="GeoG Borders mode: linking two countries across their land borders"',
  ],
  ['<figcaption class="phone-cap">Globe 3D</figcaption>', '<figcaption class="phone-cap">3D Globe</figcaption>'],
  ['<figcaption class="phone-cap">Menu principal</figcaption>', '<figcaption class="phone-cap">Main menu</figcaption>'],
  ['<figcaption class="phone-cap">Frontières</figcaption>', '<figcaption class="phone-cap">Borders</figcaption>'],

  // ── défi du jour ───────────────────────────────────────────────────────────
  ['>Le rendez-vous quotidien<', '>The daily ritual<'],
  [
    '<h2>Un défi du jour,<br/>toute la planète dessus.</h2>',
    '<h2>One daily challenge,<br/>the whole planet on it.</h2>',
  ],
  [
    'Chaque jour à minuit UTC, un nouveau défi identique pour tous les joueurs du monde. Joue, compare ton score, partage ta grille — et entretiens ta série. 🔥',
    'Every day at midnight UTC, a new challenge — the same one for every player on Earth. Play it, compare your score, share your grid, and keep your streak alive. 🔥',
  ],
  ['>Jouer au défi du jour<', '>Play the daily challenge<'],
  ['Prochain défi dans', 'Next challenge in'],
  ['<small>heures</small>', '<small>hours</small>'],

  // ── en ligne ───────────────────────────────────────────────────────────────
  ['<p class="overline">Carte de nuit — mode en ligne</p>', '<p class="overline">Night chart — online play</p>'],
  [
    '<h2 style="color:#fff;">Joue seul, contre tes amis,<br/>ou contre le monde.</h2>',
    '<h2 style="color:#fff;">Play alone, against friends,<br/>or against the world.</h2>',
  ],
  [
    '<p>Enchaîne les quiz en solo, passe le téléphone à tes amis, ou affronte la planète entière en temps réel.</p>',
    '<p>Run quizzes solo, pass the phone around, or take on the planet in real time.</p>',
  ],
  [
    '<h3>Duels &amp; matchs à 8</h3>\n          <p>Défie un ami en 1 contre 1 ou lance un match jusqu\'à 8 joueurs en temps réel, sur n\'importe quel mode.</p>',
    '<h3>Duels &amp; 8-player matches</h3>\n          <p>Challenge a friend one-on-one, or start a live match for up to eight players, on any mode.</p>',
  ],
  [
    '<h3>Classé &amp; saisons</h3>\n          <p>Grimpe les rangs avec un vrai système ELO, et termine dans le haut du classement avant la fin de la saison.</p>',
    '<h3>Ranked &amp; seasons</h3>\n          <p>Climb the tiers on a real ELO ladder, and finish near the top before the season closes.</p>',
  ],
  [
    '<h3>Mode histoire</h3>\n          <p>{{storyLevels}} niveaux à étoiles autour du monde, du plus connu au plus confidentiel. Jusqu\'où iras-tu ?</p>',
    '<h3>Story mode</h3>\n          <p>{{storyLevels}} starred levels around the world, from the obvious to the obscure. How far can you get?</p>',
  ],
  ['<b>{{countries}}</b> pays</span>', '<b>{{countries}}</b> countries</span>'],
  ['<b>{{modes}}</b> modes</span>', '<b>{{modes}}</b> modes</span>'],
  ['<b>{{storyLevels}}</b> niveaux histoire</span>', '<b>{{storyLevels}}</b> story levels</span>'],
  ['<b>2</b> langues</span>', '<b>2</b> languages</span>'],
  ['<b>1</b> défi du jour</span>', '<b>1</b> daily challenge</span>'],

  // ── guides ─────────────────────────────────────────────────────────────────
  ['<p class="overline">Les guides</p>', '<p class="overline">The guides</p>'],
  ['<h2>Comprendre avant de retenir</h2>', '<h2>Understand first, memorise after</h2>'],
  [
    '<p>Pourquoi le nombre de pays du monde n\'est pas fixe, d\'où viennent les couleurs des drapeaux, comment réviser sans y passer ses soirées : nos guides de géographie, en accès libre.</p>',
    '<p>Why the number of countries in the world isn’t fixed, where flag colours come from, and how to revise without losing your evenings — our geography guides, free to read.</p>',
  ],
  [
    '<h3>Combien de pays dans le monde ?</h3><p>193, 195, 197, 249 : aucun de ces chiffres n\'est faux. Ce que compte chaque source.</p>',
    '<h3>How many countries are there?</h3><p>193, 195, 197, 249: none of these is wrong. What each source actually counts.</p>',
  ],
  [
    '<h3>Les drapeaux du monde</h3><p>Croix nordiques, couleurs panafricaines, croissants : les familles, les sosies et les cas uniques.</p>',
    '<h3>The flags of the world</h3><p>Nordic crosses, pan-African colours, crescents: the families, the lookalikes and the one-offs.</p>',
  ],
  [
    '<h3>Les capitales et leurs pièges</h3><p>Canberra plutôt que Sydney, trois capitales en Afrique du Sud, des villes bâties dans le désert.</p>',
    '<h3>Capitals and their traps</h3><p>Canberra not Sydney, three capitals in South Africa, and cities built from scratch in the desert.</p>',
  ],
  [
    '<h3>Les frontières terrestres</h3><p>14 voisins pour la Chine et la Russie, deux pays doublement enclavés, un village en 30 morceaux.</p>',
    '<h3>Land borders</h3><p>Fourteen neighbours each for China and Russia, two doubly landlocked countries, and a village split into 30 pieces.</p>',
  ],
  [
    '<h3>Mémoriser les drapeaux</h3><p>Familles, rappel actif, répétition espacée : un plan sur 4 semaines, 15 minutes par jour.</p>',
    '<h3>Memorising the flags</h3><p>Families, active recall, spaced repetition: a four-week plan, fifteen minutes a day.</p>',
  ],
  [
    '<h3>Réviser la géographie</h3><p>L\'ordre d\'apprentissage, la mémoire des cartes, et les confusions à traiter en priorité.</p>',
    '<h3>Studying geography</h3><p>What order to learn in, how map memory works, and which confusions to fix first.</p>',
  ],
  [
    'Continent par continent :\n        <a href="{{link:atlas-flags-europe}}">drapeaux d’Europe</a> ·\n        <a href="{{link:atlas-capitals-afrique}}">capitales d’Afrique</a> ·\n        <a href="{{link:atlas-countries-asie}}">pays d’Asie</a>',
    'Continent by continent:\n        <a href="{{link:atlas-flags-europe}}">flags of Europe</a> ·\n        <a href="{{link:atlas-capitals-afrique}}">capitals of Africa</a> ·\n        <a href="{{link:atlas-countries-asie}}">countries of Asia</a>',
  ],
  ['>Voir tous les guides →<', '>See all the guides →<'],

  // ── FAQ ────────────────────────────────────────────────────────────────────
  ['<p class="overline">Questions fréquentes</p>', '<p class="overline">Frequently asked</p>'],
  ['<h2>Tout ce qu\'il faut savoir</h2>', '<h2>Everything worth knowing</h2>'],
  ['<summary>GeoG est-il gratuit ?</summary>', '<summary>Is GeoG free?</summary>'],
  [
    'Oui. Joue gratuitement dans ton navigateur, ou télécharge l\'app sur iPhone et Android. Aucun paiement requis pour jouer.',
    'Yes. Play free in your browser, or download the app on iPhone and Android. No payment is required to play.',
  ],
  [
    '<summary>Peut-on jouer sans installer l\'application ?</summary>',
    '<summary>Can I play without installing the app?</summary>',
  ],
  [
    'Oui — le <a href="{{play}}">défi du jour</a> est jouable directement ici, sans compte et sans installation. L\'app débloque les duels en ligne, le classé et le mode histoire.',
    'Yes — the <a href="{{play}}">daily challenge</a> runs right here, with no account and no install. The app adds online duels, ranked play and story mode.',
  ],
  ['<summary>À quoi joue-t-on dans GeoG ?</summary>', '<summary>What do you actually play in GeoG?</summary>'],
  [
    'À des quiz de géographie : reconnaître les drapeaux, retrouver les capitales, localiser les pays sur un globe 3D, relier des frontières, classer des pays (Rankle), deviner un pays à ses indices… {{modes}} modes en tout.',
    'Geography quizzes: recognising flags, recalling capitals, locating countries on a 3D globe, linking borders, ranking countries (Rankle), guessing a country from clues… {{modes}} modes in total.',
  ],
  ['<summary>Sur quels appareils fonctionne GeoG ?</summary>', '<summary>Which devices does GeoG run on?</summary>'],
  [
    'Sur le web (navigateur), sur iPhone/iPad via l\'<a href="https://apps.apple.com/app/id6779650018">App Store</a>, et sur Android via <a href="https://play.google.com/store/apps/details?id=com.paulpousset.geog">Google Play</a>. Ta progression se synchronise avec un compte gratuit.',
    'The web, iPhone and iPad through the <a href="https://apps.apple.com/app/id6779650018">App Store</a>, and Android through <a href="https://play.google.com/store/apps/details?id=com.paulpousset.geog">Google Play</a>. A free account syncs your progress across all of them.',
  ],
  [
    '<summary>Dans quelles langues le jeu est-il disponible ?</summary>',
    '<summary>What languages is the game available in?</summary>',
  ],
  [
    'Le jeu se joue en français et en anglais : menus, questions et noms de pays sont traduits dans les deux langues. Les fiches de l’App Store et de Google Play sont en outre disponibles en espagnol, portugais, allemand et italien.',
    'The game plays in French and English: menus, questions and country names are translated in both. The App Store and Google Play listings are additionally available in Spanish, Portuguese, German and Italian.',
  ],

  // ── CTA final + pied de page ───────────────────────────────────────────────
  ['<p class="overline">Embarquement immédiat</p>', '<p class="overline">Now boarding</p>'],
  [
    '<h2>Le monde t\'attend.<br/><em>Pars à l\'aventure.</em></h2>',
    '<h2>The world is waiting.<br/><em>Go and find it.</em></h2>',
  ],
  [
    '<p>Gratuit, sans compte, directement dans ton navigateur.</p>',
    '<p>Free, no account, straight in your browser.</p>',
  ],
  ['<a href="{{play}}">Jouer</a>', '<a href="{{play}}">Play</a>'],
  ['<a href="{{link:about}}">À propos</a>', '<a href="{{link:about}}">About</a>'],
  ['<a href="{{link:privacy}}">Confidentialité</a>', '<a href="{{link:privacy}}">Privacy</a>'],
  [
    '<p>GeoG — jeu de géographie gratuit : quiz, drapeaux, capitales et pays du monde.</p>',
    '<p>GeoG — the free geography game: flag, capital and country quizzes.</p>',
  ],
  [
    '47°N 2°E · Fait avec ✦ pour les explorateurs.',
    '47°N 2°E · Made with ✦ for explorers.',
  ],
];


const missing = [];
for (const [fr, en] of T) {
  if (!s.includes(fr)) {
    missing.push(fr.slice(0, 70));
    continue;
  }
  s = s.split(fr).join(en);
}

if (missing.length) {
  console.error(`\n${missing.length} chaîne(s) introuvable(s) — le fragment français a bougé :`);
  for (const m of missing) console.error(`  - ${m}…`);
  process.exit(1);
}

writeFileSync(join(DIR, 'en', 'home.html'), s, 'utf8');
console.log('en/home.html écrit');
