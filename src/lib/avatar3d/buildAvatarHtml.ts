/**
 * Real-time 3D avatar preview — three.js scene injected into <GlobeWebView>.
 *
 * Rig parity: camera/lights/ring/orbit constants come from asset-pipeline/rig.json,
 * the SAME source render_layers.py applies to the Blender scene, so this live
 * preview stays superposable with the pre-rendered <WorldAvatar3D> layers.
 * Shading: the « Cartoon HD » ToonHD shader (lib/globe3d/toonHdSource — same
 * 3-band ramp, specular dot, rim and 5 studio lights as the rig, plus the
 * bloom the rig cannot bake into its transparent layers). No outlines.
 * Style parity: globe/cosmos/orbit colours come from the SAME tables as the SVG
 * renderer (GLOBE_STYLES / catalog swatches) — one source of truth.
 *
 * Protocol (all JSON-safe):
 *   frame → RN : {type:'ready'}
 *   RN → frame : window.setAvatarConfig(layers)   — instant re-style, no reload
 *   RN → frame : window.setAvatarState(layers, assets) — config + assets in one pass
 *                window.setTextures({day,night,clouds,bump})
 *                window.setSprites({emblem,satellite})  — data/bundle URIs
 *                window.setReduceMotion(bool)
 */
import RIG from '../../../asset-pipeline/rig.json';
import { SKIN_LOOK } from '../globe3d/skinLook';
import { TOON_HD_JS } from '../globe3d/toonHdSource';
import { CITY_LIGHTS, GLOBE_STYLES, POLITICAL_PALETTE } from '../../components/WorldAvatar';
import { EMBLEM_COORD } from '../../components/worldGlyphs';
import { getCategoryParts } from '../../data/cosmetics';
import { WORLD_POLYS } from '../../data/worldPolys';
import type { AvatarConfig } from '../../types';

/** Assets du pack injectés dans la scène live : GLB du rig (vrais modèles 3D),
 *  textures globe/cosmos, et sprites en repli si un GLB manque. */
export interface AvatarLiveAssets {
  emblem?: string | null;
  satellite?: string | null;
  emblemModel?: string | null;
  satModel?: string | null;
  orbitModel?: string | null;
  /** Relief 3D des continents (GLB partagé entre styles, texturé au runtime). */
  landModel?: string | null;
  /** Props 3D du style de globe (volcans lava, calottes ice, cratères mars…). */
  globePropsModel?: string | null;
  globeTex?: string | null;
  cosmosTex?: string | null;
}

export interface BuildAvatarHtmlOptions {
  threeSrc: string;
  config: AvatarConfig;
  /** Asset URIs resolved BEFORE build so the first frame is already centred
   *  on the equipped emblem (no async recentre jump). */
  sprites?: AvatarLiveAssets;
  /** Backdrop behind the scene (transparent canvas over the app's own bg). */
  reduceMotion?: boolean;
  maxDpr?: number;
}

function catalogMeta() {
  const orbit: Record<string, string> = {};
  for (const p of getCategoryParts('orbit')) orbit[p.id] = p.swatch ?? '#c8d0d8';
  const cosmos: Record<string, { style: string; swatch: string }> = {};
  for (const p of getCategoryParts('cosmos')) {
    cosmos[p.id] = { style: p.cosmosStyle ?? 'gradient', swatch: p.swatch ?? '#0b1230' };
  }
  return { orbit, cosmos };
}

export function buildAvatarHtml(opts: BuildAvatarHtmlOptions): string {
  const meta = catalogMeta();
  const payload = {
    rig: RIG,
    styles: GLOBE_STYLES,
    look: SKIN_LOOK,
    polys: WORLD_POLYS,
    cities: CITY_LIGHTS,
    palette: POLITICAL_PALETTE,
    orbitMeta: meta.orbit,
    cosmosMeta: meta.cosmos,
    emblemCoords: EMBLEM_COORD,
    sprites: opts.sprites ?? {},
    config: opts.config.layers,
    reduceMotion: !!opts.reduceMotion,
    maxDpr: opts.maxDpr ?? 2,
  };

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;width:100%;height:100%;touch-action:none}canvas{display:block;touch-action:none}</style>
</head><body>
<script>${opts.threeSrc}</script>
<script>${TOON_HD_JS}</script>
<script>
"use strict";
var D = ${JSON.stringify(payload)};
var RIG = D.rig;

function postMsg(o){var s=JSON.stringify(o);
  if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage)window.ReactNativeWebView.postMessage(s);
  else if(window.parent&&window.parent!==window)window.parent.postMessage(s,'*');}

// ── Renderer / camera / lights (rig.json parity) ─────────────────────────────
var W=window.innerWidth,H=window.innerHeight;
var renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,D.maxDpr));
renderer.setSize(W,H);
// Pas d'ACES : les couleurs cartoon du pack doivent sortir EXACTES (parité webp).
renderer.toneMapping=THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);
var scene=new THREE.Scene();
var camera=new THREE.PerspectiveCamera(RIG.camera.fovDeg,W/H,0.1,100);
camera.position.set(0,0,RIG.camera.distance);
camera.lookAt(0,0,0);
function dirFrom(cfg){var az=cfg.azimuthDeg*Math.PI/180,el=cfg.elevationDeg*Math.PI/180;
  return new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el));}
// Cartoon HD : les 5 lumières studio de rig.json telles quelles (plus de
// facteur d'atténuation — la scène live était volontairement plus terne que le
// pack, la « perte d'éclat » signalée par Paul), la clé porte l'ombre portée,
// bloom HDR sur les émissifs (> 1) — la seule chose que le rig ne cuit pas.
ToonHD.configure(RIG.toon);
ToonHD.enableShadows(renderer);
ToonHD.lights(scene,RIG.lights,{shadow:true,shadowSize:1024,extent:2.4});
var post=ToonHD.bloom(renderer,scene,camera,W,H);

// ── Chargeur GLB + matériaux du rig ──────────────────────────────────────────
var gltfLoader=(typeof THREE.GLTFLoader==='function')?new THREE.GLTFLoader():null;
// Extras Blender (ggKind/ggHex/ggEmis/ggAlpha) -> ToonHD ; landtex (relief des
// continents) reçoit un placeholder, la texture du style est posée par
// setLandStyle(). Les coques de contour d'anciens GLB sont masquées.
function remapMaterials(root){ToonHD.remapMaterials(root);}
function disposeTree(root){root.traverse(function(n){
  if(n.geometry)n.geometry.dispose();
  if(n.material&&n.material.dispose)n.material.dispose();});}

// ── Système d'animation des cosmétiques ──────────────────────────────────────
// Chaque GLB garde la hiérarchie et les NOMS d'objets Blender : on cible les
// pièces par regex (ailes, flammes, pales…) et on anime autour de leur
// transform de repos. Tag par sous-système pour nettoyer au changement d'item.
var animators=[];
function addAnim(tag,fn){animators.push({tag:tag,fn:fn});}
function clearAnims(tag){animators=animators.filter(function(a){return a.tag!==tag;});}
function runAnims(t,dt){
  for(var i=animators.length-1;i>=0;i--){
    if(animators[i].fn(t,dt)===false)animators.splice(i,1);
  }}
function nodesOf(root,re){var out=[];root.traverse(function(n){
  if(n.isMesh&&re.test(n.name))out.push(n);});return out;}
function rest(n){ // transform de repos mémorisée une fois
  if(!n.userData.rest)n.userData.rest={p:n.position.clone(),r:n.rotation.clone(),s:n.scale.clone()};
  return n.userData.rest;}
// Apparition « pop » à l'équipement (easeOutBack)
function spawnPop(obj,tag,dur){
  if(reduceMotion)return;
  var s0=obj.scale.clone(),tt=0;dur=dur||0.5;
  obj.scale.multiplyScalar(0.001);
  addAnim(tag,function(t,dt){tt+=dt;var k=Math.min(1,tt/dur);
    var u=k-1,e=1+2.70158*u*u*u+1.70158*u*u;
    obj.scale.copy(s0).multiplyScalar(Math.max(0.001,e));
    if(k>=1){obj.scale.copy(s0);return false;}
    return true;});}
// Pulse de couleur d'un matériau flat (flammes, néons, gemmes…)
function colorPulse(tag,mesh,hexHot,freq,phase){
  var c0=mesh.material.color.clone(),c1=new THREE.Color(hexHot);
  addAnim(tag,function(t){
    mesh.material.color.copy(c0).lerp(c1,0.5+0.5*Math.sin(t*freq+(phase||0)));
    return true;});}
// Pivot local : re-parente les pièces sous un Group pour les faire tourner
// autour d'un axe précis (pales du moulin, aiguille de boussole).
function makePivot(parts,pos){
  if(!parts.length)return null;
  var par=parts[0].parent,pivot=new THREE.Group();
  par.add(pivot);pivot.position.set(pos[0],pos[1],pos[2]);
  pivot.updateMatrixWorld(true);
  parts.forEach(function(p){pivot.attach(p);});
  return pivot;}

// Comportement d'orbite par satellite : face=oriente le nez dans le sens du
// déplacement (yaw d'ajustement par modèle), sinon spin lent sur soi-même.
var SAT_BEHAV={
  sat_moon:{spin:0.4},sat_st_moon:{spin:0.4},sat_satellite:{spin:0.55},
  sat_iss:{spin:0.3},sat_ufo:{spin:1.5,bob:[2.1,0.030]},
  sat_balloon:{face:1,yaw:0,bob:[1.3,0.05],sway:[0.9,0.10]},
  sat_paperplane:{face:1,yaw:0,roll:[1.9,0.16],bob:[2.4,0.02]},
  sat_plane:{face:1,yaw:0,roll:[1.2,0.09]},
  sat_bird:{face:1,yaw:0,bob:[3.4,0.028]},
  sat_rocket:{face:1,yaw:0,bob:[2.7,0.015]},
  sat_comet:{face:1,yaw:0},sat_shootingstar:{face:1,yaw:0},
  sat_st_comet:{face:1,yaw:0},
  sat_st_ship:{face:1,yaw:Math.PI,rock:[1.1,0.09],bob:[1.5,0.02]},
};
var satBehav=null;
var SAT_SCALE={sat_bird:0.56,sat_plane:0.46,sat_iss:0.48,sat_st_ship:0.47,
  sat_balloon:0.45,sat_satellite:0.44,sat_ufo:0.45,sat_paperplane:0.42,
  sat_comet:0.50,sat_rocket:0.43,sat_shootingstar:0.50,sat_st_comet:0.50,
  sat_moon:0.31,sat_st_moon:0.34};
function setupSatAnims(m,satId){
  nodesOf(m,/^blink/).forEach(function(b){ // balise : clignotement franc
    var c0=b.material.color.clone(),c1=new THREE.Color('#5a1410');
    addAnim('sat',function(t){
      b.material.color.copy(Math.sin(t*4.2)>0?c0:c1);return true;});});
  nodesOf(m,/^flag/).forEach(function(f){ // fanion qui ondule
    var r0=rest(f);
    addAnim('sat',function(t){f.rotation.y=r0.r.y+Math.sin(t*5.2)*0.22;return true;});});
  nodesOf(m,/^dish/).forEach(function(d){ // parabole qui balaie
    if(/_ol/.test(d.name))return;
    var r0=rest(d);
    addAnim('sat',function(t){d.rotation.y=r0.r.y+Math.sin(t*0.7)*0.6;return true;});});
  // pièces vivantes par modèle
  nodesOf(m,/^wing-?1/).forEach(function(w){
    var sy=/wing-1/.test(w.name)?-1:1,r0=rest(w);
    if(satId==='sat_bird'){
      addAnim('sat',function(t){w.rotation.x=r0.r.x+sy*Math.sin(t*7.5)*0.45;return true;});
    }else if(satId==='sat_paperplane'){
      addAnim('sat',function(t){w.rotation.x=r0.r.x+sy*Math.sin(t*3.1)*0.07;return true;});
    }});
  nodesOf(m,/^flame/).forEach(function(f){
    var r0=rest(f);
    addAnim('sat',function(t){
      var k=1+0.22*Math.sin(t*11.3)+0.10*Math.sin(t*17.7);
      f.scale.set(r0.s.x*(2-k)*0.9+r0.s.x*0.1,r0.s.y*k,r0.s.z);
      return true;});});
  nodesOf(m,/^light[0-9]/).forEach(function(l,i){colorPulse('sat',l,'#5a4a10',2.6,i*0.9);});
  nodesOf(m,/^beam/).forEach(function(b){
    b.material.transparent=true;
    addAnim('sat',function(t){b.material.opacity=0.35*(0.55+0.45*Math.sin(t*2.4));return true;});});
  nodesOf(m,/^tail[0-9]/).forEach(function(tl,i){
    var r0=rest(tl);
    addAnim('sat',function(t){tl.scale.set(r0.s.x*(1+0.12*Math.sin(t*5+i*1.7)),r0.s.y,r0.s.z);return true;});});
  // balancements du corps (autour de la pose de repos, dans le groupe orbite)
  var bh=SAT_BEHAV[satId]||{},r0=rest(m);
  if(bh.bob)addAnim('sat',function(t){m.position.y=r0.p.y+Math.sin(t*bh.bob[0])*bh.bob[1];return true;});
  if(bh.roll)addAnim('sat',function(t){m.rotation.z=r0.r.z+Math.sin(t*bh.roll[0])*bh.roll[1];return true;});
  if(bh.rock)addAnim('sat',function(t){m.rotation.x=r0.r.x+Math.sin(t*bh.rock[0])*bh.rock[1];return true;});
  if(bh.sway)addAnim('sat',function(t){m.rotation.z=r0.r.z+Math.sin(t*bh.sway[0])*bh.sway[1];return true;});
}
function setupEmblemAnims(m,emblemId){
  if(emblemId==='emblem_windmill'){
    // pales : pivot à l'axe du moyeu (hub Blender (0,-0.175,0.94) -> glTF)
    var pivot=makePivot(nodesOf(m,/^(sail|panel|rung)/),[0,0.94,0.175]);
    if(pivot)addAnim('emblem',function(t){pivot.rotation.z=t*0.85;return true;});
  }
  if(emblemId==='emblem_compass'){
    var np=makePivot(nodesOf(m,/^needle[NS]/),[0,0.50,0.075]);
    if(np)addAnim('emblem',function(t){np.rotation.z=Math.sin(t*1.1)*0.5+Math.sin(t*2.7)*0.12;return true;});
  }
  nodesOf(m,/^flame/).forEach(function(f){ // torche de la Liberté
    var r0=rest(f);
    addAnim('emblem',function(t){
      var k=1+0.16*Math.sin(t*9.1)+0.08*Math.sin(t*15.3);
      f.scale.set(r0.s.x,r0.s.y,r0.s.z*k);
      return true;});});
  nodesOf(m,/^cl-?[0-9]/).forEach(function(cl,i){ // nuages du Fuji
    var r0=rest(cl);
    addAnim('emblem',function(t){cl.position.x=r0.p.x+Math.sin(t*0.5+i*2.1)*0.05;return true;});});
  if(emblemId==='emblem_st_worldtree'){
    addAnim('emblem',function(t){m.rotation.z=Math.sin(t*1.3)*0.012;return true;});
  }
}
// Rotation propre de l'anneau (éléments discrets qui défilent) + vie locale.
var ORBIT_SPIN={orbit_asteroids:-0.05,orbit_ice:0.04,orbit_fireflies:0.12,
  orbit_st_laurel:0.03,orbit_compass:-0.04,orbit_st_compass:0.04,orbit_fire:0.05};
function setupOrbitAnims(o,orbitId){
  nodesOf(o,/^rock[0-9]/).forEach(function(r,i){
    if(/_ol/.test(r.name))return;
    var r0=rest(r),sp=0.25+((i*37)%10)*0.06;
    addAnim('orbit',function(t){
      r.rotation.x=r0.r.x+t*sp*0.6;r.rotation.y=r0.r.y+t*sp;return true;});});
  nodesOf(o,/^shard[0-9]/).forEach(function(s,i){
    if(/_ol/.test(s.name))return;
    var r0=rest(s);
    addAnim('orbit',function(t){
      s.scale.copy(r0.s).multiplyScalar(1+0.035*Math.sin(t*2.4+i*1.3));return true;});});
  nodesOf(o,/^ember[0-9]/).forEach(function(e,i){
    var r0=rest(e);
    addAnim('orbit',function(t){
      var k=0.6+0.5*(0.5+0.5*Math.sin(t*3.4+i*2.1));
      e.scale.copy(r0.s).multiplyScalar(k);
      e.position.y=r0.p.y+0.025*Math.sin(t*1.8+i);return true;});});
  nodesOf(o,/^flame[0-9]/).forEach(function(f,i){
    var r0=rest(f);
    addAnim('orbit',function(t){
      f.scale.set(r0.s.x,r0.s.y*(1+0.28*Math.sin(t*9+i*2.3)+0.1*Math.sin(t*15+i)),r0.s.z);
      return true;});});
  nodesOf(o,/^(fly|halo)[0-9]/).forEach(function(f,i){
    var r0=rest(f);
    addAnim('orbit',function(t){
      var k=0.7+0.5*(0.5+0.5*Math.sin(t*3.2+i*1.9));
      f.scale.copy(r0.s).multiplyScalar(k);return true;});});
  nodesOf(o,/^spk[0-9]/).forEach(function(s,i){
    var r0=rest(s);
    addAnim('orbit',function(t){
      var k=Math.max(0.25,Math.sin(t*2.6+i*2.2));
      s.scale.copy(r0.s).multiplyScalar(k);return true;});});
  nodesOf(o,/glow/).forEach(function(g){
    if(!g.material.transparent)return;
    var o0=g.material.opacity;
    addAnim('orbit',function(t){g.material.opacity=o0*(0.65+0.35*Math.sin(t*2.8));return true;});});
}
function setupPropsAnims(p,styleId){
  nodesOf(p,/_lv$|_lv[.]/).forEach(function(v,i){colorPulse('props',v,'#ffd23e',2.1,i*1.4);});
  nodesOf(p,/_dp$|_dp[.]/).forEach(function(d,i){
    var r0=rest(d);
    addAnim('props',function(t){
      var k=1+0.18*Math.sin(t*2.4+i);
      d.scale.set(r0.s.x,r0.s.y,r0.s.z*k);return true;});});
  nodesOf(p,/^gprop_fis/).forEach(function(f,i){colorPulse('props',f,'#ffd23e',1.9,i*0.8);});
  nodesOf(p,/crown_gem/).forEach(function(g,i){
    var r0=rest(g);
    addAnim('props',function(t){
      var k=1+0.16*Math.max(0,Math.sin(t*3.1+i*1.1));
      g.scale.copy(r0.s).multiplyScalar(k);return true;});});
  nodesOf(p,/_c[0-9]/).forEach(function(c2,i){ // cristaux de glace
    var r0=rest(c2);
    addAnim('props',function(t){
      var k=1+0.05*Math.sin(t*2.2+i*1.6);
      c2.scale.copy(r0.s).multiplyScalar(k);return true;});});
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function rng(seed){var s=seed>>>0;return function(){s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function shade(hex,amt){var c=hex.replace('#','');if(c.length===3)c=c.split('').map(function(x){return x+x;}).join('');
  var n=parseInt(c,16),t=amt<0?0:255,a=Math.abs(amt);
  var r=Math.round(((n>>16)&255)+(t-((n>>16)&255))*a),g=Math.round(((n>>8)&255)+(t-((n>>8)&255))*a),b=Math.round((n&255)+(t-(n&255))*a);
  return '#'+((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');}
function lonToX(lon,w){return (lon+180)/360*w;}
function latToY(lat,h){return (90-lat)/180*h;}

// ── Globe: canvas-painted equirect texture per style (SVG table parity) ──────
var texUris={},assets=D.sprites||{},sprites=assets,reduceMotion=D.reduceMotion;
var loadedTex={};
function paintGlobeCanvas(styleId){
  var st=D.styles[styleId]||D.styles.classic;
  var w=2048,h=1024,cv=document.createElement('canvas');cv.width=w;cv.height=h;
  var ctx=cv.getContext('2d');
  var g=ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0,st.ocean[0]);g.addColorStop(0.5,st.ocean[1]);g.addColorStop(1,st.ocean[2]);
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle=st.grat;ctx.globalAlpha=0.5;ctx.lineWidth=1.2;
  for(var lon=-150;lon<=180;lon+=30){ctx.beginPath();ctx.moveTo(lonToX(lon,w),0);ctx.lineTo(lonToX(lon,w),h);ctx.stroke();}
  for(var lat=-60;lat<=60;lat+=30){ctx.beginPath();ctx.moveTo(0,latToY(lat,h));ctx.lineTo(w,latToY(lat,h));ctx.stroke();}
  ctx.globalAlpha=1;
  var rnd=rng(1234567);
  if(!st.craters){
    D.polys.forEach(function(ring,i){
      ctx.beginPath();
      ring.forEach(function(pt,j){var x=lonToX(pt[0],w),y=latToY(pt[1],h);j?ctx.lineTo(x,y):ctx.moveTo(x,y);});
      ctx.closePath();
      if(!st.wire&&st.land!=='none'){
        ctx.fillStyle=st.political?D.palette[i%D.palette.length]:st.land;ctx.fill();
      }
      ctx.strokeStyle=st.stroke;ctx.lineWidth=st.wire?2.2:1.6;
      if(st.dash)ctx.setLineDash([8,7]);
      ctx.stroke();ctx.setLineDash([]);
      if(st.cyber&&rnd()<0.7){var p=ring[Math.floor(rnd()*ring.length)];
        ctx.fillStyle=st.grat;ctx.beginPath();ctx.arc(lonToX(p[0],w),latToY(p[1],h),4,0,7);ctx.fill();}
    });
  } else {
    for(var i=0;i<70;i++){var x=rnd()*w,y=h*0.08+rnd()*h*0.84,r=3+rnd()*22;
      ctx.fillStyle='rgba(0,0,0,0.22)';ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();
      ctx.strokeStyle='rgba(255,190,140,0.35)';ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.stroke();}
    ctx.fillStyle='rgba(255,245,235,0.85)';ctx.beginPath();ctx.ellipse(w/2,h*0.03,w*0.3,h*0.07,0,0,7);ctx.fill();
  }
  if(st.night){D.cities.forEach(function(c){var x=lonToX(c[0],w),y=latToY(c[1],h);
    ctx.save();ctx.shadowColor='#ffca7a';ctx.shadowBlur=14;
    ctx.fillStyle='#ffd89a';ctx.beginPath();ctx.arc(x,y,4,0,7);ctx.fill();ctx.restore();});}
  if(st.lava||st.rift){var col=st.riftColor||'#ff7a3a';
    for(var k=0;k<26;k++){ctx.save();ctx.shadowColor=col;ctx.shadowBlur=12;
      ctx.strokeStyle=col;ctx.lineWidth=2.4;ctx.beginPath();
      var x0=rnd()*w,y0=rnd()*h;ctx.moveTo(x0,y0);
      for(var s2=0;s2<5;s2++){x0+=(rnd()-0.5)*180;y0+=(rnd()-0.5)*90;ctx.lineTo(x0,y0);}
      ctx.stroke();ctx.restore();}}
  if(st.biolum){for(var k2=0;k2<200;k2++){ctx.fillStyle='rgba(47,240,192,'+(0.25+rnd()*0.5)+')';
      ctx.beginPath();ctx.arc(rnd()*w,rnd()*h,1+rnd()*2.2,0,7);ctx.fill();}}
  if(st.sparkle){for(var k3=0;k3<40;k3++){var sx=rnd()*w,sy=rnd()*h,sr=2+rnd()*4;
      ctx.strokeStyle='rgba(255,244,200,0.9)';ctx.lineWidth=1.4;
      ctx.beginPath();ctx.moveTo(sx-sr,sy);ctx.lineTo(sx+sr,sy);ctx.moveTo(sx,sy-sr);ctx.lineTo(sx,sy+sr);ctx.stroke();}}
  if(st.galaxy){for(var k4=0;k4<420;k4++){var a=k4*0.16,r2=8+k4*1.1;
      var gx=w/2+Math.cos(a)*r2*1.9,gy=h/2+Math.sin(a)*r2*0.55;
      ctx.fillStyle='rgba(216,200,255,'+(0.9-k4/500)+')';ctx.beginPath();ctx.arc(gx,gy,1.5,0,7);ctx.fill();}}
  if(st.scan){ctx.globalAlpha=0.16;ctx.fillStyle='#5ff0ff';
    for(var yy=0;yy<h;yy+=9)ctx.fillRect(0,yy,w,2);ctx.globalAlpha=1;}
  var tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
  tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
  return tex;
}

var TEXTURED={classic:'day',satellite:'day',relief:'day',gaia:'day',night:'night'};
var globeGroup=new THREE.Group();scene.add(globeGroup);
var globeMesh=new THREE.Mesh(new THREE.SphereGeometry(RIG.globe.radius,64,64),new THREE.MeshPhongMaterial({color:0x224466}));
globeGroup.add(globeMesh);
var cloudMesh=new THREE.Mesh(new THREE.SphereGeometry(RIG.globe.radius*1.015,48,48),
  new THREE.MeshLambertMaterial({transparent:true,opacity:0.5,depthWrite:false}));
cloudMesh.visible=false;globeGroup.add(cloudMesh);
globeMesh.receiveShadow=true;globeMesh.castShadow=true;
// Nuages en volumes du pack (mêmes tirages que le rig) : parqués dans le repère
// caméra à l'orientation « maison » (parité avec la couche pré-rendue), puis
// solidaires de la planète quand on la fait tourner.
var cloudRoot=new THREE.Group();globeGroup.add(cloudRoot);
var toonClouds=null;
function setToonClouds(on){
  if(on&&!toonClouds){toonClouds=ToonHD.clouds();cloudRoot.add(toonClouds);}
  if(toonClouds)toonClouds.visible=on;
  needsRender=true;}
var texLoader=new THREE.TextureLoader();
function loadUri(uri,cb){texLoader.load(uri,function(t){t.colorSpace=THREE.SRGBColorSpace;cb(t);});}
// Styles sombres du pack : texture auto-éclairée (unlit) + rim seul.
var GLOBE_DARK={night:1,lava:1,eclipse:1,biolum:1,hologram:1,cyber:1,st_galaxy:1,st_fractured:1};
// Relief 3D des continents (GLB partagé) ; mars/st_galaxy n'ont pas de continents.
var NO_RELIEF={mars:1,st_galaxy:1};
// Reflet / luminosité / contre-jour par planète (src/lib/globe3d/skinLook.ts).
function lookOf(styleId){var l=D.look[styleId]||{};
  return {sk:l.specK!=null?l.specK:1,sv:l.val!=null?l.val:1,rc:l.rim||undefined};}
function landMat(styleId,tex){var L=lookOf(styleId);
  return ToonHD.material({map:tex,rough:0.5,specK:0.25*L.sk,rimK:0.5,sat:1.25,val:1.02*L.sv,rimColor:L.rc,
    emissive:GLOBE_DARK[styleId]?RIG.toon.darkEmissive:0});}
function sphereMat(styleId,tex){var L=lookOf(styleId);
  return ToonHD.material({map:tex,rough:0.25,specK:0.55*L.sk,rimK:0.6,sat:1.2,val:1.05*L.sv,rimColor:L.rc,
    emissive:GLOBE_DARK[styleId]?RIG.toon.darkEmissive:0});}
// Pièces de relief des props qui portent la texture de la planète (volcans de Mars…).
function dressProps(root,styleId,tex){if(!tex)return;
  root.traverse(function(n){var k=n.isMesh&&n.userData.ggKind;
    if(k==='landtex'||k==='planettex'){
    if(n.material&&n.material.dispose)n.material.dispose();
    n.material=k==='landtex'?landMat(styleId,tex):sphereMat(styleId,tex);n.castShadow=true;n.receiveShadow=true;}});}
var landObj=null,propsObj=null,propsStyle=null;
function setLandStyle(styleId,tex){
  if(!landObj)return;
  landObj.traverse(function(n){
    if(!n.isMesh)return;
    if(n.userData.ggKind==='landtex'){
      var m=landMat(styleId,tex);
      if(n.material&&n.material.dispose)n.material.dispose();
      n.material=m;n.castShadow=true;n.receiveShadow=true;
    }});
  needsRender=true;
}
// Le GLB est exporté en repère géo pur : +90° Y le cale sur la convention UV
// de three.SphereGeometry, et il est parenté au globe (suit la rotation).
function ensureLand(styleId,tex){
  if(NO_RELIEF[styleId]||!assets.landModel||!gltfLoader){
    if(landObj)landObj.visible=false;
  }else if(landObj){
    landObj.visible=true;setLandStyle(styleId,tex);
  }else{
    gltfLoader.load(assets.landModel,function(g){
      if(landObj)return;
      landObj=g.scene;remapMaterials(landObj);
      landObj.rotation.y=Math.PI/2;
      globeGroup.add(landObj);
      var cur=cfg.globe&&cfg.globe.id?cfg.globe.id.replace('globe_',''):'classic';
      if(NO_RELIEF[cur])landObj.visible=false;
      else setLandStyle(cur,(assets.globeTex&&packTexCache[assets.globeTex])||tex);
      needsRender=true;});
  }
  if(propsObj&&propsStyle!==styleId){
    globeGroup.remove(propsObj);disposeTree(propsObj);propsObj=null;
    clearAnims('props');
  }
  propsStyle=styleId;
  if(assets.globePropsModel&&!propsObj&&gltfLoader){
    gltfLoader.load(assets.globePropsModel,function(g){
      if(propsStyle!==styleId||propsObj)return;
      propsObj=g.scene;remapMaterials(propsObj);
      dressProps(propsObj,styleId,(assets.globeTex&&packTexCache[assets.globeTex])||tex);
      propsObj.rotation.y=Math.PI/2;
      globeGroup.add(propsObj);
      setupPropsAnims(propsObj,styleId);
      needsRender=true;});
  }
}
// Textures du pack déjà décodées, indexées par URI (PAS par style : les assets
// arrivent de RN de façon asynchrone, et indexer par style mettait en cache la
// texture du globe PRÉCÉDENT sous le nom du nouveau — d'où un autre globe que
// celui choisi, figé pour toute la session).
var packTexCache={};
var globeReq=0;
function applyGlobeStyle(styleId){
  var st=D.styles[styleId]||D.styles.classic;
  var req=++globeReq;
  // Texture équirect cartoon du PACK (parité exacte avec les couches rendues).
  if(assets.globeTex){
    var texUri=assets.globeTex;
    var usePack=function(t){
      if(req!==globeReq)return; // un style plus récent a été demandé entre-temps
      var m=sphereMat(styleId,t);
      var old=globeMesh.material;globeMesh.material=m;
      if(old&&old.dispose)old.dispose();
      ensureLand(styleId,t);
      needsRender=true;};
    if(packTexCache[texUri])usePack(packTexCache[texUri]);
    else loadUri(texUri,function(t){
      t.wrapS=THREE.RepeatWrapping; // couture ±180° du relief (u>1)
      t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      packTexCache[texUri]=t;usePack(t);});
    cloudMesh.visible=false;
    setToonClouds(RIG.toon.clouds.styles.indexOf(styleId)>=0&&!GLOBE_DARK[styleId]);
    setAtmo(st.atmo||null,!!st.corona);
    return;
  }
  if(!globeMesh.material.isMeshPhongMaterial){
    globeMesh.material.dispose();
    globeMesh.material=new THREE.MeshPhongMaterial({color:0x224466});
  }
  var texKey=TEXTURED[styleId];
  var mat=globeMesh.material;
  mat.map=null;mat.emissiveMap=null;mat.bumpMap=null;mat.color.set(0xffffff);
  mat.emissive.set(0x000000);mat.shininess=18;mat.specular=new THREE.Color(0x333333);
  if(texKey&&loadedTex[texKey]){
    if(styleId==='night'){mat.map=null;mat.color.set(0x0a1020);
      mat.emissiveMap=loadedTex.night;mat.emissive.set(0xffffff);}
    else{mat.map=loadedTex.day;
      if(styleId==='gaia')mat.color.set(0x9fe8c0);
      if(styleId==='relief'&&loadedTex.bump){mat.bumpMap=loadedTex.bump;mat.bumpScale=0.045;}
      mat.specular=new THREE.Color(0x223b4d);mat.shininess=42;}
  } else {
    mat.map=paintGlobeCanvas(styleId);
    if(st.lava||st.biolum||st.scan||st.night||st.rift){mat.emissiveMap=mat.map;mat.emissive.set(0x555555);}
  }
  mat.needsUpdate=true;
  if(mat.map)mat.map.wrapS=THREE.RepeatWrapping;
  ensureLand(styleId,mat.map||null);
  setToonClouds(false);
  cloudMesh.visible=!!(st.clouds&&loadedTex.clouds);
  if(cloudMesh.visible){cloudMesh.material.map=loadedTex.clouds;cloudMesh.material.alphaMap=loadedTex.clouds;cloudMesh.material.needsUpdate=true;}
  setAtmo(st.atmo||null,!!st.corona);
}

// ── Atmosphere (fresnel, additive) ───────────────────────────────────────────
var atmoMesh=null;
function setAtmo(colorHex,corona){
  if(atmoMesh){scene.remove(atmoMesh);atmoMesh.geometry.dispose();atmoMesh.material.dispose();atmoMesh=null;}
  // Toujours une atmosphère (le pack la cuit sur chaque globe) : cyan de la
  // charte par défaut, couleur du style quand il en a une, couronne (éclipse).
  var col=new THREE.Color(colorHex||RIG.toon.atmosphere.color);
  atmoMesh=new THREE.Mesh(new THREE.SphereGeometry(RIG.globe.radius*(corona?1.25:1.09),48,48),
    new THREE.ShaderMaterial({
      uniforms:{c:{value:col},p:{value:corona?2.2:3.4},s:{value:corona?1.6:0.9}},
      vertexShader:'varying vec3 vN;varying vec3 vP;void main(){vN=normalize(normalMatrix*normal);vP=normalize((modelViewMatrix*vec4(position,1.)).xyz);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform vec3 c;uniform float p;uniform float s;varying vec3 vN;varying vec3 vP;void main(){float f=pow(1.0-abs(dot(vN,-vP)),p)*s;gl_FragColor=vec4(c,1.0)*f;}',
      blending:THREE.AdditiveBlending,side:THREE.BackSide,transparent:true,depthWrite:false}));
  scene.add(atmoMesh);
}

// ── Orbit rings ──────────────────────────────────────────────────────────────
var orbitGroup=new THREE.Group();scene.add(orbitGroup);
orbitGroup.rotation.x=RIG.rings.tiltDeg*Math.PI/180;
var pulseMats=[],pointRings=[];
function clearOrbit(){while(orbitGroup.children.length){var c=orbitGroup.children.pop();
  if(c.geometry)c.geometry.dispose();if(c.material)c.material.dispose();}
  pulseMats=[];pointRings=[];}
function torus(radius,tube,color,emissive){
  var m=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,10,120),
    new THREE.MeshPhongMaterial({color:new THREE.Color(color),emissive:new THREE.Color(emissive||'#000000')}));
  m.rotation.x=Math.PI/2;orbitGroup.add(m);return m;}
function ringPoints(count,radius,spread,color,size){
  var pos=new Float32Array(count*3),r=rng(99);
  for(var i=0;i<count;i++){var a=r()*Math.PI*2,rr=radius+(r()-0.5)*spread;
    pos[i*3]=Math.cos(a)*rr;pos[i*3+1]=(r()-0.5)*spread*0.4;pos[i*3+2]=Math.sin(a)*rr;}
  var geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  var mat=new THREE.PointsMaterial({color:new THREE.Color(color),size:size,transparent:true,opacity:0.95,sizeAttenuation:true});
  var pts=new THREE.Points(geo,mat);orbitGroup.add(pts);pointRings.push(pts);return pts;}
var orbitGLB=null,orbitRoot=null;
function clearOrbitGLB(){if(!orbitGLB)return;
  scene.remove(orbitRoot||orbitGLB);
  disposeTree(orbitGLB);orbitGLB=null;orbitRoot=null;}
function applyOrbit(orbitId){
  clearOrbit();clearOrbitGLB();clearAnims('orbit');
  if(!orbitId||orbitId==='orbit_none')return;
  // Anneau GLB du rig (tilt 22° et éléments discrets cuits dans la géométrie).
  if(assets.orbitModel&&gltfLoader){
    gltfLoader.load(assets.orbitModel,function(g){
      if(!cfg.orbit||cfg.orbit.id!==orbitId)return;
      clearOrbitGLB();clearAnims('orbit');
      orbitGLB=g.scene;remapMaterials(orbitGLB);
      var spin=ORBIT_SPIN[orbitId];
      if(spin){
        // rotation DANS le plan de l'anneau : le tilt est cuit dans le GLB,
        // on l'encadre par Rx(tilt)·Ry(ωt)·Rx(-tilt) pour que les éléments
        // défilent le long de l'ellipse au lieu de précesser hors du plan.
        var tl=RIG.rings.tiltDeg*Math.PI/180;
        var outer=new THREE.Group(),mid=new THREE.Group(),inner=new THREE.Group();
        outer.rotation.x=tl;inner.rotation.x=-tl;
        outer.add(mid);mid.add(inner);inner.add(orbitGLB);
        scene.add(outer);orbitRoot=outer;
        addAnim('orbit',function(t){mid.rotation.y=t*spin;return true;});
      }else{
        scene.add(orbitGLB);orbitRoot=orbitGLB;
      }
      setupOrbitAnims(orbitGLB,orbitId);
      spawnPop(orbitGLB,'orbit',0.4);
      needsRender=true;
    },undefined,function(){procOrbit(orbitId);});
    return;
  }
  procOrbit(orbitId);
}
function procOrbit(orbitId){
  var sw=D.orbitMeta[orbitId]||'#c8d0d8';
  var mid=(RIG.rings.innerRadius+RIG.rings.outerRadius)/2;
  if(orbitId==='orbit_saturn'){
    var cv=document.createElement('canvas');cv.width=256;cv.height=8;var cx=cv.getContext('2d');
    for(var x=0;x<256;x++){var t2=x/256,a2=0.25+0.75*Math.abs(Math.sin(t2*22));
      cx.fillStyle='rgba(240,216,168,'+(a2*0.9)+')';cx.fillRect(x,0,1,8);}
    var tex=new THREE.CanvasTexture(cv);
    var ring=new THREE.Mesh(new THREE.RingGeometry(RIG.rings.innerRadius,RIG.rings.outerRadius,140),
      new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,transparent:true}));
    // map the stripe texture radially
    var uv=ring.geometry.attributes.uv,pos=ring.geometry.attributes.position;
    for(var i=0;i<uv.count;i++){var px=pos.getX(i),py=pos.getY(i);
      var rr=(Math.sqrt(px*px+py*py)-RIG.rings.innerRadius)/(RIG.rings.outerRadius-RIG.rings.innerRadius);
      uv.setXY(i,rr,0.5);}
    ring.rotation.x=Math.PI/2;orbitGroup.add(ring);
  } else if(orbitId==='orbit_double'){torus(mid-0.12,0.028,sw);torus(mid+0.12,0.028,sw);}
  else if(orbitId==='orbit_rainbow'){var cols=['#ff5a5a','#ffb02e','#ffe75a','#5ad66a','#5a9aff'];
    for(var j=0;j<5;j++)torus(RIG.rings.innerRadius+j*(RIG.rings.outerRadius-RIG.rings.innerRadius)/5,0.024,cols[j]);}
  else if(orbitId==='orbit_asteroids'){ringPoints(220,mid,0.34,sw,0.10);}
  else if(orbitId==='orbit_ice'){ringPoints(180,mid,0.22,sw,0.09);}
  else if(orbitId==='orbit_fireflies'){var p2=ringPoints(90,mid,0.4,sw,0.12);pulseMats.push(p2.material);}
  else if(orbitId==='orbit_fire'){var p3=ringPoints(240,RIG.rings.innerRadius,0.18,'#ff7a2a',0.11);pulseMats.push(p3.material);}
  else if(orbitId==='orbit_neon'){var t3=torus(mid,0.06,sw,sw);pulseMats.push(t3.material);}
  else{torus(mid,0.034,sw);}
}

// ── Satellite & emblem sprites ───────────────────────────────────────────────
var satObj=null,emblemObj=null;
function applySatellite(satId){
  if(satObj){scene.remove(satObj);satObj=null;}
  clearAnims('sat');satBehav=null;
  if(!satId||satId==='sat_none')return;
  // VRAI modèle 3D du rig, avec sa personnalité d'orbite (cap, roulis, bob…).
  if(assets.satModel&&gltfLoader){
    gltfLoader.load(assets.satModel,function(g){
      if(!cfg.satellite||cfg.satellite.id!==satId)return;
      if(satObj)scene.remove(satObj);
      clearAnims('sat');
      var m=g.scene;remapMaterials(m);
      var box=new THREE.Box3().setFromObject(m);
      var sz=box.getSize(new THREE.Vector3());
      // Échelle par satellite : les modèles fins/détaillés sont grossis pour
      // rester lisibles à l'écran, les sphères pleines (lunes) réduites.
      var mx=Math.max(sz.x,sz.y,sz.z,0.001),mn=Math.max(0.001,Math.min(sz.x,sz.y,sz.z));
      var target=SAT_SCALE[satId]||((mx/mn<1.35)?0.30:0.40);
      var s=target/mx;
      m.scale.setScalar(s);
      m.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(s));
      satObj=new THREE.Group();satObj.add(m);
      satBehav=SAT_BEHAV[satId]||null;
      satObj.userData.spin=(satBehav&&satBehav.spin)||(satBehav?0:0.7);
      setupSatAnims(m,satId);
      scene.add(satObj);
      spawnPop(satObj,'sat',0.45);
      needsRender=true;
    },undefined,function(){spriteSat();});
    return;
  }
  spriteSat();
  function spriteSat(){
    if(sprites.satellite){
      var mat=new THREE.SpriteMaterial({transparent:true});
      loadUri(sprites.satellite,function(t){mat.map=t;mat.needsUpdate=true;});
      satObj=new THREE.Sprite(mat);satObj.scale.set(0.34,0.34,1);
    } else {
      satObj=new THREE.Mesh(new THREE.SphereGeometry(0.07,16,16),
        new THREE.MeshPhongMaterial({color:0xf0f4ff,emissive:0x8899bb}));
    }
    scene.add(satObj);
  }
}
var emblemStand=null,emblemIsSprite=false;
// Gabarit du monument (unités globe, r=1) : hauteur visée et emprise au sol max.
// Calé sur la taille d'authoring Blender (rig.emblem.scale) — la normalisation
// « hauteur seule » gonflait les monuments larges (colisée/muraille/pyramides
// sortaient à 1.12 de large, soit 56% du diamètre du globe). Emprise serrée +
// hauteur légèrement réduite = silhouette lisible sans écraser la planète.
var EMBLEM_H=0.62,EMBLEM_W=0.78;
// Réductions supplémentaires par item : monuments massifs dont la silhouette
// pleine (pas de vide) pèse plus lourd à emprise égale.
var EMBLEM_SCALE_FIX={emblem_colosseum:0.88,emblem_pyramids:0.94};
// Yaw de façade par monument : certains GLB du rig n'ont pas la façade sur +Z.
// Corrections mesurées visuellement (harnais Playwright), en radians.
var YAW_FIX={emblem_christ:Math.PI,emblem_liberty:Math.PI};
// Ombre de contact douce sous le monument : l'assoit sur la sphère.
function contactShadow(w){
  var s=128,cv=document.createElement('canvas');cv.width=cv.height=s;
  var c2=cv.getContext('2d');
  var g2=c2.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g2.addColorStop(0,'rgba(8,14,26,0.40)');g2.addColorStop(0.65,'rgba(8,14,26,0.16)');g2.addColorStop(1,'rgba(8,14,26,0)');
  c2.fillStyle=g2;c2.fillRect(0,0,s,s);
  var t=new THREE.CanvasTexture(cv);
  var m=new THREE.Mesh(new THREE.PlaneGeometry(w,w),
    new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));
  m.rotation.x=-Math.PI/2;m.position.y=0.045;m.renderOrder=2;
  return m;}
// Recentre le PAYS du monument sous l'ancre (solveur numérique : la relation
// lat/rotation X est non linéaire à cause de l'ordre d'Euler — ne pas remettre
// une formule). Pose aussi la vue « maison » du double-tap.
function faceCountry(lon,lat){
  var r=RIG.globe.radius,phi=(90-lat)*Math.PI/180,th=(lon+180)*Math.PI/180;
  var pos=new THREE.Vector3(-r*Math.sin(phi)*Math.cos(th),r*Math.cos(phi),r*Math.sin(phi)*Math.sin(th));
  var targetY=Math.sin(EMBLEM_ELEV*Math.PI/180)*r;
  var lonRad=(-90-lon)*Math.PI/180,best=0,bestErr=1e9;
  for(var rl=-75;rl<=30;rl++){
    var p2=pos.clone().applyEuler(new THREE.Euler(rl*Math.PI/180,lonRad,0,'XYZ'));
    if(p2.z<0.12)continue;
    var err=Math.abs(p2.y-targetY);
    if(err<bestErr){bestErr=err;best=rl;}
  }
  rotLon=lon;rotLat=best;homeLon=lon;homeLat=best;applyRot();
}
function applyEmblem(emblemId){
  if(emblemStand){scene.remove(emblemStand);emblemStand=null;emblemObj=null;}
  clearAnims('emblem');
  emblemIsSprite=false;
  if(!emblemId||emblemId==='emblem_none')return;
  if(!assets.emblemModel&&!sprites.emblem)return;
  // Mise en scène « diorama » : le monument vit à un ancrage FIXE côté caméra
  // — jamais coupé par le cadre, jamais vu de dos, jamais emporté au limbe par
  // la rotation. Le globe tourne librement DESSOUS (la texture défile).
  var r=RIG.globe.radius;
  var elev=EMBLEM_ELEV*Math.PI/180;
  var pos=new THREE.Vector3(0,Math.sin(elev)*r,Math.cos(elev)*r);
  var n=pos.clone().normalize();
  emblemStand=new THREE.Group();
  // Axe redressé d'un tiers vers la verticale écran (moins de plongée sur les
  // toits) ; la base est enfoncée pour garder le contact malgré le redressement.
  var up=n.clone().lerp(new THREE.Vector3(0,1,0),0.30).normalize();
  emblemStand.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),up);
  emblemStand.position.copy(pos).addScaledVector(n,-0.035);
  scene.add(emblemStand);
  if(assets.emblemModel&&gltfLoader){
    // VRAI monument 3D du rig (GLB, toon + coques de contour).
    gltfLoader.load(assets.emblemModel,function(g){
      if(!cfg.emblem||cfg.emblem.id!==emblemId||!emblemStand)return;
      var m=g.scene;remapMaterials(m);
      var box=new THREE.Box3().setFromObject(m);
      var sz=box.getSize(new THREE.Vector3());
      var s2=EMBLEM_H/Math.max(sz.y,0.001);
      if(sz.x*s2>EMBLEM_W)s2=EMBLEM_W/sz.x;
      if(sz.z*s2>EMBLEM_W)s2=EMBLEM_W/sz.z;
      s2*=EMBLEM_SCALE_FIX[emblemId]||1;
      m.scale.setScalar(s2);
      m.position.y=-box.min.y*s2;
      // façade vers la caméra (+ correction par item)
      emblemStand.updateWorldMatrix(true,false);
      var v=emblemStand.worldToLocal(camera.position.clone());v.y=0;
      if(v.lengthSq()>1e-6)m.rotation.y=Math.atan2(v.x,v.z)+(YAW_FIX[emblemId]||0);
      emblemObj=m;emblemStand.add(m);
      emblemStand.add(contactShadow(Math.max(sz.x,sz.z)*s2*1.5));
      setupEmblemAnims(m,emblemId);
      spawnPop(emblemStand,'emblem',0.55);
      needsRender=true;
    });
  } else {
    // Repli sprite : plan face caméra ancré à la base (le stand est fixe côté
    // caméra, une orientation unique suffit).
    emblemIsSprite=true;
    var s=0.74;
    var geo=new THREE.PlaneGeometry(s,s);
    geo.translate(0,s*0.5,0); // origine = centre de la base
    var mat=new THREE.MeshBasicMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,alphaTest:0.01});
    loadUri(sprites.emblem,function(t){mat.map=t;mat.needsUpdate=true;});
    emblemObj=new THREE.Mesh(geo,mat);
    emblemObj.renderOrder=30;
    emblemObj.quaternion.copy(emblemStand.quaternion.clone().invert().multiply(camera.quaternion));
    emblemStand.add(emblemObj);
  }
  // Au boot / à l'équipement : montrer le pays du monument sous l'ancre
  // (cohérence narrative), puis rotation totalement libre.
  var co=D.emblemCoords[emblemId]||[RIG.emblem.anchorLng,RIG.emblem.anchorLat];
  faceCountry(co[0],co[1]);
}

// ── Cosmos backdrop ──────────────────────────────────────────────────────────
function paintCosmos(cosmosId,tint){
  var meta=D.cosmosMeta[cosmosId]||{style:'gradient',swatch:'#0b1230'};
  var base=tint||meta.swatch,style=meta.style;
  var s=512,cv=document.createElement('canvas');cv.width=s;cv.height=s;
  var ctx=cv.getContext('2d'),rnd=rng(4242);
  var g=ctx.createRadialGradient(s/2,s*0.38,s*0.05,s/2,s/2,s*0.75);
  g.addColorStop(0,shade(base,0.18));g.addColorStop(0.55,base);g.addColorStop(1,shade(base,-0.5));
  ctx.fillStyle=g;ctx.fillRect(0,0,s,s);
  function stars(n,alpha){for(var i=0;i<n;i++){ctx.fillStyle='rgba(255,255,255,'+(alpha*(0.3+rnd()*0.7))+')';
    ctx.beginPath();ctx.arc(rnd()*s,rnd()*s,rnd()*1.6+0.3,0,7);ctx.fill();}}
  if(style==='stars'||style==='milkyway'||style==='constellation'||style==='galaxy')stars(240,0.9);
  if(style==='milkyway'){ctx.save();ctx.translate(s/2,s/2);ctx.rotate(-0.6);
    var mg=ctx.createLinearGradient(0,-40,0,40);mg.addColorStop(0,'rgba(255,255,255,0)');
    mg.addColorStop(0.5,'rgba(224,216,255,0.28)');mg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=mg;ctx.fillRect(-s,-40,2*s,80);ctx.restore();}
  if(style==='sunrise'){var sg=ctx.createLinearGradient(0,s,0,s*0.3);
    sg.addColorStop(0,'rgba(240,137,74,0.85)');sg.addColorStop(1,'rgba(240,137,74,0)');
    ctx.fillStyle=sg;ctx.fillRect(0,0,s,s);}
  if(style==='aurora'||style==='st_aurorastorm'){for(var a2=0;a2<5;a2++){
    ctx.save();ctx.globalAlpha=0.22;var ax=s*0.15+a2*s*0.16;
    var ag=ctx.createLinearGradient(ax,s*0.1,ax+40,s*0.8);
    ag.addColorStop(0,'#3ff0b0');ag.addColorStop(1,'rgba(63,240,176,0)');
    ctx.fillStyle=ag;ctx.beginPath();
    ctx.moveTo(ax,s*0.05);ctx.bezierCurveTo(ax+70,s*0.3,ax-50,s*0.6,ax+30,s*0.9);
    ctx.lineTo(ax+80,s*0.9);ctx.bezierCurveTo(ax,s*0.6,ax+120,s*0.3,ax+50,s*0.05);
    ctx.closePath();ctx.fill();ctx.restore();}stars(90,0.5);}
  if(style==='nebula'){['#7a1a6a','#2a3a9a','#a04a2a'].forEach(function(c2){
    for(var n2=0;n2<3;n2++){var nx=rnd()*s,ny=rnd()*s,nr=s*(0.15+rnd()*0.25);
      var ng=ctx.createRadialGradient(nx,ny,0,nx,ny,nr);
      ng.addColorStop(0,c2+'aa');ng.addColorStop(1,c2+'00');
      ctx.fillStyle=ng;ctx.fillRect(0,0,s,s);}});stars(140,0.8);}
  if(style==='meteors'||style==='goldrain'){var mc=style==='goldrain'?'255,208,90':'200,220,255';
    stars(80,0.6);for(var m2=0;m2<14;m2++){var mx=rnd()*s,my=rnd()*s*0.7,len=30+rnd()*70;
      var lg=ctx.createLinearGradient(mx,my,mx-len,my+len*0.6);
      lg.addColorStop(0,'rgba('+mc+',0.95)');lg.addColorStop(1,'rgba('+mc+',0)');
      ctx.strokeStyle=lg;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(mx,my);
      ctx.lineTo(mx-len,my+len*0.6);ctx.stroke();}}
  if(style==='constellation'){var pts2=[];for(var c3=0;c3<9;c3++)pts2.push([rnd()*s,rnd()*s]);
    ctx.strokeStyle='rgba(200,215,255,0.5)';ctx.lineWidth=1;
    for(var c4=1;c4<pts2.length;c4++){ctx.beginPath();ctx.moveTo(pts2[c4-1][0],pts2[c4-1][1]);
      ctx.lineTo(pts2[c4][0],pts2[c4][1]);ctx.stroke();}}
  if(style==='galaxy'){for(var g2=0;g2<500;g2++){var ga=g2*0.11,gr=2+g2*0.42;
    ctx.fillStyle='rgba(216,200,255,'+(0.85-g2/650)+')';
    ctx.beginPath();ctx.arc(s/2+Math.cos(ga)*gr,s/2+Math.sin(ga)*gr*0.5,1.3,0,7);ctx.fill();}}
  if(style==='solareclipse'){ctx.save();ctx.shadowColor='#ffd9a0';ctx.shadowBlur=42;
    ctx.strokeStyle='rgba(255,224,170,0.95)';ctx.lineWidth=5;
    ctx.beginPath();ctx.arc(s/2,s*0.4,s*0.16,0,7);ctx.stroke();ctx.restore();
    ctx.fillStyle='#08060a';ctx.beginPath();ctx.arc(s/2,s*0.4,s*0.15,0,7);ctx.fill();}
  if(style==='supernova'){for(var v2=0;v2<8;v2++){var va=v2*Math.PI/4;
    var vg=ctx.createLinearGradient(s/2,s/2,s/2+Math.cos(va)*s*0.5,s/2+Math.sin(va)*s*0.5);
    vg.addColorStop(0,'rgba(255,230,200,0.9)');vg.addColorStop(1,'rgba(255,120,80,0)');
    ctx.strokeStyle=vg;ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(s/2,s/2);
    ctx.lineTo(s/2+Math.cos(va)*s*0.5,s/2+Math.sin(va)*s*0.5);ctx.stroke();}stars(70,0.7);}
  if(style==='blackhole'){ctx.save();ctx.translate(s/2,s*0.42);ctx.rotate(-0.35);
    ctx.strokeStyle='rgba(255,190,120,0.9)';ctx.lineWidth=7;ctx.shadowColor='#ffb45a';ctx.shadowBlur=26;
    ctx.beginPath();ctx.ellipse(0,0,s*0.24,s*0.07,0,0,7);ctx.stroke();ctx.restore();
    ctx.fillStyle='#000';ctx.beginPath();ctx.arc(s/2,s*0.42,s*0.11,0,7);ctx.fill();stars(120,0.6);}
  if(style==='st_embersky'){for(var e2=0;e2<80;e2++){
    ctx.fillStyle='rgba(255,'+(90+Math.floor(rnd()*90))+',40,'+(0.25+rnd()*0.6)+')';
    ctx.beginPath();ctx.arc(rnd()*s,s*0.45+rnd()*s*0.55,rnd()*2.4+0.6,0,7);ctx.fill();}}
  var tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function applyCosmos(cosmosId,tint){
  // Fond du PACK (webp) quand dispo ; bluenight (teintable) reste procédural.
  if(assets.cosmosTex){
    loadUri(assets.cosmosTex,function(t){
      var o2=scene.background;scene.background=t;
      if(o2&&o2.dispose&&o2!==t)o2.dispose();needsRender=true;});
    return;
  }
  var old=scene.background;
  scene.background=paintCosmos(cosmosId,tint);
  if(old&&old.dispose)old.dispose();
}

// ── Config plumbing ──────────────────────────────────────────────────────────
var cfg=D.config;
function applyAll(){
  applyCosmos(cfg.cosmos&&cfg.cosmos.id,cfg.cosmos&&cfg.cosmos.tint);
  applyGlobeStyle(cfg.globe&&cfg.globe.id?cfg.globe.id.replace('globe_',''):'classic');
  applyOrbit(cfg.orbit&&cfg.orbit.id);
  applySatellite(cfg.satellite&&cfg.satellite.id);
  applyEmblem(cfg.emblem&&cfg.emblem.id);
  needsRender=true;
}
window.setAvatarConfig=function(layers){cfg=layers||cfg;applyAll();};
window.setTextures=function(uris){
  var pending=0;
  Object.keys(uris||{}).forEach(function(k){if(!uris[k])return;pending++;
    loadUri(uris[k],function(t){loadedTex[k]=t;pending--;if(!pending)applyAll();});});
  if(!pending)applyAll();
};
// Assets du pack (sprites + GLB + textures globe/cosmos) : ré-applique tout.
window.setAssets=function(map){assets=map||{};sprites=assets;applyAll();};
window.setSprites=window.setAssets;
// Config + assets d'un coup : une seule passe applyAll, cohérente.
window.setAvatarState=function(layers,map){cfg=layers||cfg;assets=map||{};sprites=assets;applyAll();};
window.setReduceMotion=function(v){reduceMotion=!!v;needsRender=true;};

// ── Interaction : trackball inertiel, pinch-zoom, double-tap recadrage ───────
// Le monument étant à un ancrage fixe côté caméra, le drag ne manipule QUE la
// planète (texture + nuages) : impossible de « casser » la composition.
var EMBLEM_ELEV=36; // élévation écran de l'ancre monument (deg)
// Default globe orientation: rig face (Europe/Africa) toward the camera —
// same equirect convention as buildEarthHtml (lng L faces camera at -90-L).
var rotLon=RIG.globe.defaultFace.lng,rotLat=RIG.globe.defaultFace.lat*0.5;
var homeLon=rotLon,homeLat=rotLat;      // vue « maison » du double-tap
var velLon=0,velLat=0,dragging=false,idleT=99,autoSpin=1;
var zoom=1,zoomTarget=1,ZMIN=0.85,ZMAX=1.45,PITCH_MAX=48;
var resetAnim=null;
function applyRot(){
  globeGroup.rotation.y=(-90-rotLon)*Math.PI/180;
  globeGroup.rotation.x=rotLat*Math.PI/180;
  needsRender=true;}
applyRot();
cloudRoot.quaternion.setFromEuler(new THREE.Euler(homeLat*Math.PI/180,(-90-homeLon)*Math.PI/180,0)).invert();
var ptrs={},lastSingle=null,pinchD=0,tapT=0,tapX=-99,tapY=-99;
function ptrList(){return Object.keys(ptrs).map(function(k){return ptrs[k];});}
document.addEventListener('pointerdown',function(e){
  ptrs[e.pointerId]={x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,t0:performance.now()};
  var l=ptrList();
  if(l.length===1){dragging=true;velLon=0;velLat=0;resetAnim=null;
    lastSingle={x:e.clientX,y:e.clientY,t:performance.now()};}
  else{dragging=false;lastSingle=null;
    if(l.length===2)pinchD=Math.hypot(l[0].x-l[1].x,l[0].y-l[1].y);}
  idleT=0;});
document.addEventListener('pointermove',function(e){
  var p=ptrs[e.pointerId];if(!p)return;
  p.x=e.clientX;p.y=e.clientY;
  var l=ptrList();
  if(l.length===2){
    var d2=Math.hypot(l[0].x-l[1].x,l[0].y-l[1].y);
    if(pinchD>0)zoomTarget=Math.max(ZMIN,Math.min(ZMAX,zoomTarget*d2/pinchD));
    pinchD=d2;idleT=0;needsRender=true;return;}
  if(!dragging||!lastSingle)return;
  var now=performance.now(),dt=Math.max(8,now-lastSingle.t);
  // Sensibilité normalisée à la taille du canvas : un drag pleine largeur ≈ 200°.
  var kx=200/Math.max(200,W),ky=140/Math.max(200,H);
  var dLon=(e.clientX-lastSingle.x)*kx,dLat=(e.clientY-lastSingle.y)*ky;
  rotLon+=dLon;
  var nl=rotLat+dLat;
  // Rubber-band au-delà des bornes de tilt (retour élastique à l'idle).
  if(nl>PITCH_MAX)nl=PITCH_MAX+(nl-PITCH_MAX)*0.25;
  if(nl<-PITCH_MAX)nl=-PITCH_MAX+(nl+PITCH_MAX)*0.25;
  rotLat=nl;
  velLon=0.8*velLon+0.2*(dLon/dt*1000);
  velLat=0.8*velLat+0.2*(dLat/dt*1000);
  lastSingle={x:e.clientX,y:e.clientY,t:now};
  idleT=0;applyRot();});
function endPtr(e){
  var was=ptrs[e.pointerId];delete ptrs[e.pointerId];
  var l=ptrList();
  if(l.length===1){pinchD=0;dragging=true;velLon=0;velLat=0;
    lastSingle={x:l[0].x,y:l[0].y,t:performance.now()};return;}
  if(l.length)return;
  dragging=false;lastSingle=null;pinchD=0;
  if(was){var now=performance.now();
    var isTap=(now-was.t0<260)&&Math.hypot(was.x-was.x0,was.y-was.y0)<12;
    if(isTap&&now-tapT<340&&Math.hypot(was.x0-tapX,was.y0-tapY)<28){
      // double-tap : recadrage animé sur la vue maison + zoom 1
      resetAnim={fromLon:rotLon,fromLat:rotLat,t:0};
      zoomTarget=1;velLon=0;velLat=0;tapT=0;
    } else if(isTap){tapT=now;tapX=was.x0;tapY=was.y0;}
  }}
document.addEventListener('pointerup',endPtr);
document.addEventListener('pointercancel',endPtr);

// ── Animation loop ───────────────────────────────────────────────────────────
var SAT_BASE=-Math.PI/4,SAT_SPEED=0.4,GLOBE_DPS=5;
var t0=performance.now(),prevT=t0,needsRender=true;
function frame(){
  requestAnimationFrame(frame);
  var now=performance.now(),dt=Math.min(0.05,(now-prevT)/1000);prevT=now;
  var t=(now-t0)/1000;
  if(!dragging){
    // Inertie du lancer, puis rappel élastique du tilt dans ses bornes.
    if(Math.abs(velLon)>0.5||Math.abs(velLat)>0.5){
      rotLon+=velLon*dt;rotLat+=velLat*dt;
      var damp=Math.pow(0.10,dt);
      velLon*=damp;velLat*=damp;applyRot();
    }else{velLon=0;velLat=0;}
    if(rotLat>PITCH_MAX){rotLat+=(PITCH_MAX-rotLat)*Math.min(1,dt*6);applyRot();}
    else if(rotLat<-PITCH_MAX){rotLat+=(-PITCH_MAX-rotLat)*Math.min(1,dt*6);applyRot();}
    idleT+=dt;
  }
  if(resetAnim){
    resetAnim.t+=dt*2.2;var k=Math.min(1,resetAnim.t),e3=1-Math.pow(1-k,3);
    rotLon=resetAnim.fromLon+(homeLon-resetAnim.fromLon)*e3;
    rotLat=resetAnim.fromLat+(homeLat-resetAnim.fromLat)*e3;
    applyRot();if(k>=1)resetAnim=null;
  }
  if(Math.abs(zoom-zoomTarget)>0.0008){
    zoom+=(zoomTarget-zoom)*Math.min(1,dt*10);
    camera.position.z=RIG.camera.distance/zoom;needsRender=true;
  }
  if(!reduceMotion){
    // Reprise en douceur de l'auto-rotation après ~2,5 s sans interaction.
    var want=(idleT>2.5&&!resetAnim)?1:0;
    autoSpin+=(want-autoSpin)*Math.min(1,dt*1.6);
    if(autoSpin>0.02&&!dragging){rotLon+=GLOBE_DPS*autoSpin*dt;applyRot();}
    cloudMesh.rotation.y+=0.0006;
    if(satObj){
      // Orbite BASSE (sous les anneaux, tilt opposé) : le satellite survole la
      // planète, disparaît derrière l'horizon (depth réel) et ne « roule »
      // jamais sur l'anneau.
      var a=SAT_BASE+t*SAT_SPEED,tilt=-16*Math.PI/180;
      var R=RIG.rings.innerRadius-0.14;
      var x=Math.cos(a)*R,zz=Math.sin(a)*R;
      satObj.position.set(x,-Math.sin(tilt)*zz,Math.cos(tilt)*zz);
      if(satBehav&&satBehav.face){
        // nez (+X modèle) orienté dans le sens du déplacement sur l'orbite
        satObj.rotation.y=-a-Math.PI/2+(satBehav.yaw||0);
      }else if(satObj.userData&&satObj.userData.spin){
        satObj.rotation.y=t*satObj.userData.spin;
      }
    }
    runAnims(t,dt);
    var pulse=0.72+0.28*Math.sin(t*3);
    pulseMats.forEach(function(m){m.opacity=pulse;m.transparent=true;});
    needsRender=true;
  }
  if(needsRender){if(post)post.render();else renderer.render(scene,camera);needsRender=!!(!reduceMotion);}
}
applyAll();
frame();
window.addEventListener('resize',function(){
  W=window.innerWidth;H=window.innerHeight;
  camera.aspect=W/H;camera.updateProjectionMatrix();renderer.setSize(W,H);
  if(post)post.setSize(W,H);needsRender=true;});
postMsg({type:'ready'});
</script>
</body></html>`;
}
