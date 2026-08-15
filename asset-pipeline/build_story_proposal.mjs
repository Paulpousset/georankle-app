// Assemble the story-mode 3D proposal page: converts the Blender renders to
// webp data-URIs and writes a self-contained HTML file.
// Run from georankle-app/asset-pipeline:  node build_page.mjs <out.html>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/Users/paulpousset/rankle/georankle-app/asset-pipeline/package.json');
const sharp = require('sharp');

const OUT = '/Users/paulpousset/rankle/georankle-app/asset-pipeline/out/story';
const dest = process.argv[2] || '/tmp/story_propositions_3d.html';

const BIOMES = [
  ['prairie', 'Prairie'], ['desert', 'Désert'], ['volcan', 'Volcan'], ['glace', 'Toundra'],
  ['jungle', 'Jungle'], ['archipel', 'Archipel'], ['savane', 'Savane'], ['cosmos', 'Cosmos'],
];

async function toDataUri(file, { width, quality = 82 } = {}) {
  let img = sharp(path.join(OUT, file));
  if (width) img = img.resize({ width });
  const buf = await img.webp({ quality }).toBuffer();
  return { uri: `data:image/webp;base64,${buf.toString('base64')}`, kb: buf.length / 1024 };
}

const img = {}; const kb = {};
for (const [key] of BIOMES) {
  const r = await toDataUri(`band_${key}.png`, { quality: 80 });
  img['band_' + key] = r.uri; kb['band_' + key] = r.kb;
}
img.band_prairie_soft = (await toDataUri('band_prairie_soft.png', { quality: 80 })).uri;
for (const [key] of BIOMES) img['coin_' + key] = (await toDataUri(`coin_${key}.png`, { width: 220, quality: 88 })).uri;
img.coin_locked = (await toDataUri('coin_locked.png', { width: 220, quality: 88 })).uri;
for (const s of ['star_gold', 'star_empty', 'heart', 'chest', 'lock']) {
  img[s] = (await toDataUri(s + '.png', { width: 200, quality: 88 })).uri;
}
img.globe = (await toDataUri('../globe_classic.png', { width: 160, quality: 88 })).uri;

const packKb = BIOMES.reduce((a, [k]) => a + kb['band_' + k], 0);
const rowsKb = BIOMES.map(([k, name]) =>
  `<tr><td>${name}</td><td class="num">${kb['band_' + k].toFixed(0)} Ko</td></tr>`).join('');

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mode Histoire — Visuels 3D Blender</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
<style>
  :root{
    --parchment:#f2e8d0; --parchment-dark:#e8d9b8; --card-l:#f6eeda; --tan:#c4a87a;
    --night-deep:#0a1628; --night-navy:#132040; --night-border:#2d4a70; --night-faint:#4a6a88;
    --vermilion:#c04a1a; --ocean:#1a4a7a; --forest:#2a6e3f; --sand:#c4872a; --gold:#e0b040;
    --serif:"Playfair Display", Georgia, serif; --mono:"Space Mono", ui-monospace, Menlo, monospace;
    --bg:var(--parchment); --card:var(--card-l); --bd:var(--tan); --ink:#2a2013; --fnt:#7a5c38;
  }
  body.dark{ --bg:var(--night-deep); --card:var(--night-navy); --bd:var(--night-border); --ink:#e8eef8; --fnt:#8aa4c0; }
  *{box-sizing:border-box; margin:0}
  body{background:var(--bg); color:var(--ink); font-family:var(--mono); transition:background .3s, color .3s; padding-bottom:80px}
  .wrap{max-width:1180px; margin:0 auto; padding:0 24px}
  header{padding:44px 0 10px; text-align:center}
  h1{font-family:var(--serif); font-size:clamp(28px,4.4vw,46px); font-weight:900}
  h1 em{color:var(--vermilion); font-style:italic}
  .sub{color:var(--fnt); margin-top:10px; font-size:14px; line-height:1.6}
  .badges{display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:18px}
  .badge{border:1.5px solid var(--bd); border-radius:999px; padding:5px 14px; font-size:12px; color:var(--fnt)}
  .badge b{color:var(--ink)}
  .toggle{position:fixed; top:16px; right:16px; z-index:50; border:1.5px solid var(--bd); background:var(--card);
    color:var(--ink); font-family:var(--mono); font-size:12px; border-radius:999px; padding:7px 14px; cursor:pointer}
  h2{font-family:var(--serif); font-size:clamp(21px,2.6vw,30px); margin:64px 0 6px}
  h2 .no{color:var(--vermilion)}
  .lead{color:var(--fnt); font-size:13.5px; line-height:1.65; max-width:860px; margin-bottom:22px}
  .panel{background:var(--card); border:1.5px solid var(--bd); border-radius:18px; padding:22px}

  /* — phone demo — */
  .demo{display:flex; gap:36px; align-items:flex-start; flex-wrap:wrap}
  .phone{width:414px; max-width:100%; border-radius:38px; border:2px solid var(--bd); background:#000;
    padding:10px; box-shadow:0 24px 60px rgba(0,0,0,.28); flex:none}
  .screen{position:relative; width:390px; max-width:100%; height:740px; border-radius:28px; overflow:hidden; background:#4a7c3a}
  .scroller{position:absolute; inset:0; overflow-y:auto; scrollbar-width:none}
  .scroller::-webkit-scrollbar{display:none}
  .map{position:relative; width:390px}
  .map img.band{display:block; width:390px; height:1180px}
  .node{position:absolute; width:62px; height:62px; margin:-31px 0 0 -31px}
  .node img.coin{width:62px; height:62px; display:block; filter:drop-shadow(0 4px 6px rgba(0,0,0,.35))}
  .node .ic{position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding-bottom:4px}
  .node .ic svg{width:24px; height:24px; stroke:#fff; stroke-width:2.4; fill:none; stroke-linecap:round; stroke-linejoin:round;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))}
  .node.dark-ic .ic svg{stroke:#3a2410}
  .stars{position:absolute; top:-17px; left:0; right:0; display:flex; justify-content:center; gap:1px}
  .stars img{width:17px; height:17px}
  .node.current::before{content:""; position:absolute; inset:-9px; border-radius:50%; border:3px solid #ffd84a;
    animation:pulse 1.6s ease-out infinite}
  @keyframes pulse{0%{transform:scale(.92); opacity:1} 70%{transform:scale(1.14); opacity:.25} 100%{transform:scale(1.2); opacity:0}}
  .me{position:absolute; width:56px; text-align:center; margin-left:-28px; z-index:5; pointer-events:none}
  .me img{width:44px; height:44px; filter:drop-shadow(0 5px 8px rgba(0,0,0,.4)); animation:bob 2.4s ease-in-out infinite}
  @keyframes bob{50%{transform:translateY(-6px)}}
  .me .tag{background:rgba(10,22,40,.85); color:#ffd84a; font-size:10px; border-radius:8px; padding:2px 6px; margin-top:-2px; display:inline-block}
  .chestfloat{position:absolute; width:46px; margin:-58px 0 0 18px; z-index:4; animation:bob 2.8s ease-in-out infinite}
  .chestfloat img{width:46px; filter:drop-shadow(0 4px 6px rgba(0,0,0,.4))}
  .hud{position:absolute; left:0; right:0; top:0; z-index:10; display:flex; align-items:center; gap:10px;
    padding:12px 14px; background:linear-gradient(rgba(10,22,40,.78), rgba(10,22,40,0)); color:#fff}
  .hud .back{font-size:20px; line-height:1}
  .hud .t{font-family:var(--serif); font-weight:700; font-size:17px}
  .hud .lives{margin-left:auto; display:flex; align-items:center; gap:2px}
  .hud .lives img{width:19px; height:19px}
  .hud .lives img.off{filter:grayscale(1) brightness(1.4); opacity:.45}
  .hud .cd{font-size:10px; color:#ffd84a; margin-left:4px}
  .demo-side{flex:1; min-width:280px}
  .demo-side ul{list-style:none; display:flex; flex-direction:column; gap:14px; font-size:13px; line-height:1.6; color:var(--fnt)}
  .demo-side li b{color:var(--ink)}
  .demo-side li::before{content:"◆"; color:var(--vermilion); margin-right:8px; font-size:10px}

  /* — gallery — */
  .gallery{display:flex; gap:14px; overflow-x:auto; padding:6px 2px 14px}
  .bio{flex:none; text-align:center}
  .bio img{width:186px; height:562px; object-fit:cover; border-radius:14px; border:1.5px solid var(--bd); display:block}
  .bio .cap{font-size:12px; margin-top:8px; color:var(--fnt)}
  .bio .cap b{color:var(--ink)}

  /* — variants — */
  .variants{display:flex; gap:22px; flex-wrap:wrap}
  .var{flex:1; min-width:260px; text-align:center}
  .var img{width:100%; max-width:330px; height:500px; object-fit:cover; object-position:center 18%; border-radius:14px; border:1.5px solid var(--bd)}
  .var h3{font-family:var(--serif); margin:12px 0 4px; font-size:18px}
  .var p{font-size:12.5px; color:var(--fnt); line-height:1.55}
  .reco{display:inline-block; background:var(--vermilion); color:#fff; border-radius:999px; font-size:10.5px; padding:3px 10px; margin-left:8px; vertical-align:2px}

  /* — sprites — */
  .sgrid{display:grid; grid-template-columns:repeat(auto-fill, minmax(108px,1fr)); gap:16px}
  .sp{text-align:center}
  .spbox{background:var(--bg); border:1.5px solid var(--bd); border-radius:14px; padding:12px; display:flex;
    align-items:center; justify-content:center; height:104px}
  .sp img{max-width:74px; max-height:80px}
  .sp .cap{font-size:11px; color:var(--fnt); margin-top:7px; line-height:1.4}
  .strip{display:flex; gap:26px; align-items:flex-end; flex-wrap:wrap; margin-top:26px}
  .state{position:relative; width:70px; text-align:center}
  .state .cap{font-size:10.5px; color:var(--fnt); margin-top:22px}

  /* — perf — */
  .cols{display:flex; gap:22px; flex-wrap:wrap; align-items:stretch}
  .col{flex:1; min-width:300px}
  .col h3{font-family:var(--serif); font-size:17px; margin-bottom:12px}
  .col.bad h3{color:var(--vermilion)} .col.good h3{color:var(--forest)}
  body.dark .col.good h3{color:#5fc98a}
  .col ul{list-style:none; font-size:12.5px; color:var(--fnt); line-height:1.7}
  .col li b{color:var(--ink)}
  .col li::before{content:"—"; margin-right:8px}
  table{border-collapse:collapse; font-size:12.5px; margin-top:14px; width:100%; max-width:330px}
  td{border-bottom:1px solid var(--bd); padding:5px 8px; color:var(--fnt)}
  td.num{text-align:right; color:var(--ink)}
  tr.total td{font-weight:700; color:var(--ink)}

  ol.steps{font-size:13px; line-height:1.7; color:var(--fnt); padding-left:22px; display:flex; flex-direction:column; gap:10px}
  ol.steps b{color:var(--ink)}
  code{background:rgba(128,110,70,.14); border-radius:5px; padding:1px 6px; font-size:12px}
  body.dark code{background:rgba(80,120,180,.2)}
  footer{margin-top:70px; text-align:center; color:var(--fnt); font-size:11.5px; line-height:1.8}
</style>
</head>
<body>
<button class="toggle" onclick="document.body.classList.toggle('dark'); this.textContent=document.body.classList.contains('dark')?'☀ Clair':'☾ Sombre'">☾ Sombre</button>

<div class="wrap">
<header>
  <h1>Mode Histoire — <em>carte 3D pré-rendue Blender</em></h1>
  <p class="sub">Chaque biome devient un décor 3D toon rendu dans Blender (rig validé du pack cosmétique) puis aplati en <b>une seule image webp</b>.<br/>
  Plus riche que la carte SVG actuelle… et beaucoup plus léger à l'exécution.</p>
  <div class="badges">
    <span class="badge">DA <b>pro cartoon</b> (contours, 3 paliers)</span>
    <span class="badge"><b>1 image</b> par bande vs ~450 éléments SVG</span>
    <span class="badge">pack 8 biomes <b>${packKb.toFixed(0)} Ko</b> webp</span>
    <span class="badge">géométrie <b>alignée au code</b> (sinusoïde partagée)</span>
  </div>
</header>

<h2><span class="no">01.</span> La carte, en vrai</h2>
<p class="lead">Démo au layout exact de <code>StoryMap</code> : mêmes constantes (nœud 62&nbsp;px, rangée 118&nbsp;px, amplitude 101&nbsp;px), médaillons posés sur la rivière par la même formule que le code. Faites défiler : Prairie → Désert → Volcan, avec la couture de biomes, les étoiles, le niveau courant et le jalon coffre du niveau 30.</p>
<div class="panel demo">
  <div class="phone"><div class="screen">
    <div class="hud">
      <span class="back">‹</span><span class="t">Histoire</span>
      <span class="lives">
        <img src="${img.heart}"/><img src="${img.heart}"/><img src="${img.heart}"/><img src="${img.heart}"/><img class="off" src="${img.heart}"/>
        <span class="cd">+1 · 12:38</span>
      </span>
    </div>
    <div class="scroller" id="scroller"><div class="map" id="map">
      <img class="band" src="${img.band_prairie}" alt=""/>
      <img class="band" src="${img.band_desert}" alt=""/>
      <img class="band" src="${img.band_volcan}" alt=""/>
    </div></div>
  </div></div>
  <div class="demo-side">
    <ul>
      <li><b>Le fond entier est UNE image.</b> Rivière, berges cernées, arbres, ombres portées, volcan : tout est déjà « payé » au rendu Blender — le téléphone ne fait que décoder un webp et le composer sur GPU.</li>
      <li><b>Les médaillons restent des composants</b> (sprite 3D + icône du mode + étoiles), donc tap, verrouillage, étoiles et avatar joueur fonctionnent comme aujourd'hui.</li>
      <li><b>Le fenêtrage actuel est conservé</b> : on ne monte que les bandes visibles ± 400 px, comme depuis la refonte perf du 23/07 — mais chaque bande coûte désormais 1 Image au lieu de centaines de nœuds SVG.</li>
      <li><b>Couture parfaite entre biomes</b> : la sinusoïde fait exactement 2 périodes par bande, la rivière entre et sort au même x. Une harmonisation légère de la formule actuelle (0,8 rad/rangée → 2π/5), décalage purement cosmétique des positions.</li>
    </ul>
  </div>
</div>

<h2><span class="no">02.</span> Les 8 biomes</h2>
<p class="lead">Le cycle complet (un biome par palier de 10 niveaux). Chaque décor reprend la palette exacte de <code>biomes.ts</code> — la rivière est lave au Volcan et voie lactée au Cosmos, comme dans la carte actuelle.</p>
<div class="panel"><div class="gallery">
${BIOMES.map(([k, name], i) => `  <div class="bio"><img loading="lazy" src="${img['band_' + k]}" alt="${name}"/><div class="cap"><b>${name}</b> · paliers ${i + 1}, ${i + 9}, ${i + 17}…</div></div>`).join('\n')}
</div></div>

<h2><span class="no">03.</span> Deux éclairages au choix (Prairie témoin)</h2>
<div class="panel variants">
  <div class="var">
    <img src="${img.band_prairie}" alt="Variante A"/>
    <h3>A · Diorama ensoleillé <span class="reco">recommandé</span></h3>
    <p>Soleil marqué, ombres portées nettes, relief découpé. Les props « sortent » de la carte — le rendu le plus proche des jeux de référence.</p>
  </div>
  <div class="var">
    <img src="${img.band_prairie_soft}" alt="Variante B"/>
    <h3>B · Pastel doux</h3>
    <p>Même scène, lumière diffuse et ombres estompées, relief atténué. Plus calme, moins de contraste — au prix d'une carte moins « pop ».</p>
  </div>
</div>

<h2><span class="no">04.</span> Médaillons &amp; états</h2>
<p class="lead">Un médaillon 3D par biome (jante à la couleur d'accent du biome, comme le <code>rim</code> actuel), plus les états de jeu. L'icône du mode et les étoiles restent des surcouches dynamiques — rien à re-rendre quand un niveau change d'état.</p>
<div class="panel">
  <div class="sgrid">
${BIOMES.map(([k, name]) => `    <div class="sp"><div class="spbox"><img src="${img['coin_' + k]}"/></div><div class="cap">${name}</div></div>`).join('\n')}
  </div>
  <div class="strip">
    <div class="state"><div class="node" style="position:relative; margin:0 auto"><img class="coin" src="${img.coin_prairie}"/><span class="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg></span></div><div class="cap">à jouer<br/>(icône du mode)</div></div>
    <div class="state"><div class="node current" style="position:relative; margin:0 auto"><img class="coin" src="${img.coin_prairie}"/><span class="ic"><svg viewBox="0 0 24 24"><path d="M13 2 4.7 12.6h6L11 22l8.3-10.6h-6z"/></svg></span></div><div class="cap">courant<br/>(anneau pulsé)</div></div>
    <div class="state"><div class="node" style="position:relative; margin:0 auto"><div class="stars"><img src="${img.star_gold}"/><img src="${img.star_gold}"/><img src="${img.star_empty}"/></div><img class="coin" src="${img.coin_prairie}"/><span class="ic"><svg viewBox="0 0 24 24"><path d="M5 21V4h11l-1.5 3.5L16 11H5"/></svg></span></div><div class="cap">réussi ★★</div></div>
    <div class="state"><div class="node" style="position:relative; margin:0 auto"><img class="coin" src="${img.coin_locked}"/></div><div class="cap">verrouillé<br/>(cadenas 3D)</div></div>
    <div class="state"><img src="${img.chest}" style="width:56px"/><div class="cap">jalon Collection<br/>de l'Explorateur</div></div>
    <div class="state"><img src="${img.heart}" style="width:44px"/><div class="cap">vies (HUD<br/>et pub +1)</div></div>
    <div class="state"><img src="${img.lock}" style="width:44px"/><div class="cap">verrou En&nbsp;Ligne<br/>/ popups</div></div>
  </div>
</div>

<h2><span class="no">05.</span> Pourquoi ça lag moins</h2>
<div class="panel cols">
  <div class="col bad">
    <h3>Aujourd'hui (SVG à la volée)</h3>
    <ul>
      <li>Par bande montée : fond dégradé + silhouettes + <b>~40 décors × 3-10 nœuds SVG</b> + 3 passes de rivière ≈ <b>300 à 600 éléments</b> react-native-svg.</li>
      <li>Chaque entrée de bande dans la fenêtre <b>reconstruit et re-rasterise</b> cet arbre sur le thread JS (le cache aide, le premier passage coûte).</li>
      <li>Fling rapide = 3-4 bandes qui montent/démontent → pics JS, c'était la source du lag corrigé de justesse le 23/07.</li>
    </ul>
  </div>
  <div class="col good">
    <h3>Proposé (pré-rendu Blender)</h3>
    <ul>
      <li>Par bande : <b>1 seul &lt;Image&gt;</b> décodé une fois puis composé par le GPU. Le scroll ne touche quasiment plus le thread JS.</li>
      <li><b>8 textures partagées</b> pour 30 paliers (le biome se répète) : mémoire bornée, cache d'images RN gratuit.</li>
      <li>Le décor peut être <b>bien plus riche</b> (ombres réelles, relief, 30+ props) sans aucun coût runtime supplémentaire.</li>
    </ul>
    <table>
      ${rowsKb}
      <tr class="total"><td>Pack 8 biomes (webp q80, @2x)</td><td class="num">${packKb.toFixed(0)} Ko</td></tr>
    </table>
  </div>
</div>

<h2><span class="no">06.</span> Intégration (si tu valides)</h2>
<div class="panel">
  <ol class="steps">
    <li><b>Figer la sinusoïde harmonisée</b> (2 périodes exactes par bande) dans <code>StoryMap</code> — seul le x des médaillons bouge de quelques px, aucune logique touchée.</li>
    <li><b>Batch de rendu</b> : le kit de cette session est déjà pérennisé dans <code>asset-pipeline/render_story_kit.py</code> (+ <code>blender_socket.py</code>) — 8 bandes + sprites reproductibles en ~2 min, variantes par palier possibles en changeant la graine du scatter.</li>
    <li><b>Assets</b> : <code>assets/story/band_*.webp</code> + médaillons, branchés au manifest/check existants du pipeline.</li>
    <li><b>StoryMap</b> : remplacer le painter SVG par bande par un <code>&lt;Image&gt;</code> (fenêtrage, auto-scroll, LevelNode mémoïsés inchangés) ; médaillons = sprite + icône lucide actuelle.</li>
    <li><b>Flag</b> <code>story_map_3d</code> OFF par défaut, comme <code>avatar_3d</code> — bascule sans risque, retour SVG instantané.</li>
  </ol>
</div>

<footer>
  GeoGames — proposition visuelle Mode Histoire · rendus Blender 5.2 (EEVEE, toon Shader-to-RGB, rig du pack cosmétique) · 25 juillet 2026<br/>
  Périmètre : cette page est une maquette de validation — rien n'est branché dans l'app tant que tu n'as pas choisi.
</footer>
</div>

<script>
  const ROW = 118, NODE = 62, AMP = 101.4, CX = 195;
  const riverX = (r) => CX + AMP * Math.sin(2 * Math.PI * r / 5);
  const BANDS = ['prairie', 'desert', 'volcan'];
  const COINS = { prairie: '${img.coin_prairie}', desert: '${img.coin_desert}', volcan: '${img.coin_volcan}' };
  const LOCKED = '${img.coin_locked}';
  const SG = '${img.star_gold}', SE = '${img.star_empty}';
  const ICONS = {
    flag: '<path d="M5 21V4h11l-1.5 3.5L16 11H5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
    zap: '<path d="M13 2 4.7 12.6h6L11 22l8.3-10.6h-6z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    route: '<circle cx="6" cy="19" r="2.6"/><circle cx="18" cy="5" r="2.6"/><path d="M8.5 19h6a4 4 0 0 0 0-8h-5a4 4 0 0 1 0-8"/>',
    up: '<path d="M3 17.5 9.5 11l4 4L21 7M15 7h6v6"/>',
    puzzle: '<path d="M10 3.5a2 2 0 0 1 4 0V5h3a2 2 0 0 1 2 2v3h-1.5a2 2 0 0 0 0 4H19v3a2 2 0 0 1-2 2h-3v-1.5a2 2 0 0 0-4 0V19H7a2 2 0 0 1-2-2v-3h1.5a2 2 0 0 0 0-4H5V7a2 2 0 0 1 2-2h3z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v5"/>',
  };
  const cycle = ['flag', 'globe', 'info', 'grid', 'zap', 'route', 'puzzle', 'up', 'flag', 'globe'];
  const CURRENT = 24, seed = [3,2,3,1,2,3,2,1,3,2, 2,3,1,2,2,3,3,2,1,2, 3,2,2];
  const map = document.getElementById('map');
  for (let b = 0; b < 3; b++) {
    for (let k = 0; k < 10; k++) {
      const level = b * 10 + k + 1;
      const x = riverX(k), y = b * 1180 + (k + 0.5) * ROW;
      const el = document.createElement('div');
      el.className = 'node';
      el.style.left = x + 'px'; el.style.top = y + 'px';
      const done = level < CURRENT, cur = level === CURRENT;
      if (cur) el.classList.add('current');
      el.innerHTML = '<img class="coin" src="' + (level > CURRENT ? LOCKED : COINS[BANDS[b]]) + '"/>' +
        (level <= CURRENT ? '<span class="ic"><svg viewBox="0 0 24 24">' + ICONS[cycle[level % cycle.length]] + '</svg></span>' : '');
      if (done) {
        const n = seed[level - 1];
        el.innerHTML = '<div class="stars">' +
          [0,1,2].map(i => '<img src="' + (i < n ? SG : SE) + '"/>').join('') + '</div>' + el.innerHTML;
      }
      map.appendChild(el);
      if (level === 30) {
        const c = document.createElement('div');
        c.className = 'chestfloat'; c.style.left = (x + 14) + 'px'; c.style.top = y + 'px';
        c.innerHTML = '<img src="${img.chest}"/>';
        map.appendChild(c);
      }
      if (cur) {
        const m = document.createElement('div');
        m.className = 'me'; m.style.left = x + 'px'; m.style.top = (y - 76) + 'px';
        m.innerHTML = '<img src="${img.globe}"/><br/><span class="tag">Paul</span>';
        map.appendChild(m);
      }
    }
  }
  const sc = document.getElementById('scroller');
  const py = 2 * 1180 + 3.5 * ROW;
  sc.scrollTop = py - 400;
</script>
</body>
</html>
`;

fs.writeFileSync(dest, html);
console.log('written', dest, (fs.statSync(dest).size / 1024 / 1024).toFixed(2) + ' MB');
console.log('pack webp total', packKb.toFixed(0), 'Ko');
