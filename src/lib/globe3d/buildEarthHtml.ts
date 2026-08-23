/**
 * Shared three.js Earth for the gameplay globes (and the decorative menu globe),
 * injected into <GlobeWebView> exactly like the legacy Canvas-2D builders.
 *
 * Art direction (Paul, 2026-07-24): PRO CARTOON, not photoreal. Cel-shaded toon
 * sphere (3-step gradient), vivid ocean, fresh-green continents with a white
 * coastal halo + bold dark outlines, puffy procedural clouds (light theme),
 * golden city lights (dark theme), saturated fresnel atmosphere, starfield.
 * Country geometry is draped as an equirect overlay canvas on a second sphere
 * so hover/selected/correct/wrong highlights keep the game palette colours.
 *
 * A photoreal mode (NASA Blue Marble/Black Marble via window.setTextures) is
 * kept behind `look:'photo'` — unused today, a candidate premium cosmetic.
 *
 * SKINNED mode (`skin`, see lib/globeSkin.ts): the planet the player equipped in
 * the shop. Its equirect texture replaces the whole cartoon coat — base sphere,
 * continents, graticule, the lot — and the overlay is reduced to a contrast-
 * checked outline coat so the countries stay readable and pickable on skins as
 * extreme as Eclipse or Mars. Gameplay state colours are untouched.
 *
 * Gameplay parity with the 2D builders is contractual:
 *  - find    : posts GLOBE_READY / COUNTRY_SELECTED{cca3} / GLOBE_ERROR, exposes
 *              window.resetRound() + window.showResult(correct,picked); same
 *              drag factor (0.35°/px ÷ zoom), zoom bounds 0.9–24, anchored zoom,
 *              dot-first pick then smallest-area hit-test then 26 px dot snap.
 *  - borders : read-only globe driven by window.setHighlights(list,refit) with
 *              kinds start/chain/last/target/ideal, floating flag tags and the
 *              same auto-framing math; non-highlighted countries stay hidden
 *              (the puzzle must not be readable off the map).
 *  - menu    : decorative — slow spin, clouds, no input, no polygons.
 */
import { CITY_LIGHTS } from '../../components/WorldAvatar';
import type { MapPalette } from '../../theme/mapPalette';
import type { GameGlobeSkin } from '../globeSkin';

export interface WorldPolygon {
  id: string;
  r: number[][][];
}

interface CoreOptions {
  threeSrc: string;
  isDark: boolean;
  pal: MapPalette;
  polygons?: WorldPolygon[];
  maxDpr?: number;
  /** Initial view + framing margin (menu crops the globe at the bottom). */
  initial?: { rotLat?: number; rotLon?: number; zoom?: number; fit?: number };
  interactive?: boolean;
  spin?: boolean;
  /**
   * Keep the ⟲ button visible even at zoom 1, and hand it to the game via
   * window.__recenter. Borders needs it: only the countries in play are ever
   * drawn, so a drag alone — no zoom — can leave nothing but blank ocean.
   */
  resetAlways?: boolean;
  /** Transparent page background (decorative overlays composited over app UI). */
  transparentBg?: boolean;
  /** Equipped shop globe worn by the planet; omitted/null = the stock look. */
  skin?: GameGlobeSkin | null;
  /**
   * Confine the highlight overlay to a lat/lng box instead of wrapping the whole
   * sphere. The overlay canvas is a fixed 2048x1024: spread over 360 degrees it
   * gives France about 57 px, which is fine for country-sized shapes and useless
   * for its departments. Boxed on the country in play, the same canvas buys ~35x
   * the resolution, which is what makes the Regions globe drawable in 3D at all.
   */
  overlayBox?: OverlayBox | null;
  /**
   * Regions mode: POLYGONS are a country's subdivisions, not the world. They are
   * the board — always outlined, whatever the skin — since neither the pack
   * texture nor the cartoon coat knows anything about them.
   */
  regionCoat?: boolean;
}

/** Lat/lng window an overlay is confined to (see CoreOptions.overlayBox). */
export interface OverlayBox {
  lat0: number;
  lat1: number;
  lng0: number;
  lng1: number;
}

function core(opts: CoreOptions, gameJs: string): string {
  const payload = {
    pal: opts.pal,
    isDark: opts.isDark,
    look: 'cartoon',
    polys: opts.polygons ?? [],
    cities: CITY_LIGHTS,
    // 3 rather than 2 on the skinned globes: the player zooms into small
    // countries, and capping below the device's own ratio was throwing away
    // sharpness the screen could show.
    maxDpr: opts.maxDpr ?? (opts.skin ? 3 : 2),
    initial: { rotLat: 0, rotLon: 0, zoom: 1, fit: 0.88, ...(opts.initial ?? {}) },
    interactive: opts.interactive !== false,
    spin: !!opts.spin,
    resetAlways: !!opts.resetAlways,
    skin: opts.skin ?? null,
    obox: opts.overlayBox ?? null,
    regionCoat: !!opts.regionCoat,
  };
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no,maximum-scale=1">
<style>
*{margin:0;padding:0;}
html,body{width:100%;height:100%;overflow:hidden;background:${opts.transparentBg ? 'transparent' : opts.pal.bg};}
canvas{display:block;position:absolute;top:0;left:0;touch-action:none;}
#zc{position:fixed;right:12px;bottom:12px;display:flex;flex-direction:column;gap:8px;z-index:5;}
#zc button{width:44px;height:44px;padding:0;border-radius:12px;border:1px solid ${opts.pal.rim};
background:${opts.isDark ? 'rgba(19,36,63,0.88)' : 'rgba(255,255,255,0.9)'};
color:${opts.isDark ? '#e8dcc0' : '#2c1810'};font-family:-apple-system,system-ui,sans-serif;
font-size:22px;font-weight:600;line-height:1;display:flex;align-items:center;justify-content:center;
touch-action:manipulation;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;}
#zc button:active{opacity:0.55;}
/* #zc #zr, not #zr: "#zc button" above is more specific and would win. */
#zc #zr{font-size:16px;display:${opts.resetAlways ? 'flex' : 'none'};}
</style>
</head>
<body>
${
  opts.interactive === false
    ? ''
    : `<div id="zc">
<button id="zin" type="button">+</button>
<button id="zout" type="button">−</button>
<button id="zr" type="button">⟲</button>
</div>`
}
<script>${opts.threeSrc}</script>
<script>
"use strict";
var D=${JSON.stringify(payload)};
var PAL=D.pal,POLYGONS=D.polys;
var FOVY=40*Math.PI/180;
var rotLon=D.initial.rotLon,rotLat=D.initial.rotLat,zoom=D.initial.zoom;
var ZMIN=0.9,ZMAX=24;
var W,H,baseR;
var needsRender=true;

function postMsg(o){var j=JSON.stringify(o);
  if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(j);
  else if(window.parent!==window)window.parent.postMessage(j,'*');}
window.onerror=function(m){postMsg({type:'GLOBE_ERROR',msg:String(m)});};

var renderer,scene,camera,pivot,globe,globeMesh,overlayMesh,cloudMesh,atmoMesh;
var loadedTex={},photoMode=false;
var GRAD=null;
// Resolved in setup(), once the mode's gameJs has declared drawBaseLand:
//  RIG  — render the Blender rig look (pack lighting + no tone mapping)
//  SURF — radius of the state-highlight overlay: it MUST clear the continent
//         relief (which reaches ~1.021), or a selected country would be buried
//         under its own mountains
//  DOTR — the microstate markers, just above that
//  LINER — the crisp border lines, topmost so they never sink into the relief
var RIG=false,SURF=1.002,DOTR=1.004,LINER=1.006;

// Puffy sticker clouds: clusters of overlapping circles on a transparent
// equirect canvas, deterministic so every load looks the same.
function cartoonClouds(){
  var s=1024,cv=document.createElement('canvas');cv.width=s;cv.height=s/2;
  var c2=cv.getContext('2d'),seed=1337;
  function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
  c2.fillStyle='rgba(255,255,255,0.95)';
  for(var i=0;i<12;i++){
    var x=rnd()*s,y=s*0.06+rnd()*s*0.36,w=22+rnd()*42;
    for(var j=0;j<6;j++){
      c2.beginPath();
      c2.arc(x+(j-2.5)*w*0.30,y+((j%2)?-1:1)*w*0.10,w*(0.28+rnd()*0.22),0,Math.PI*2);
      c2.fill();}
  }
  var t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;return t;}

// (lat,lng) ↔ unit vector, matching three.js SphereGeometry equirect UVs.
function llToVec(lat,lng,r){
  var phi=(90-lat)*Math.PI/180,th=(lng+180)*Math.PI/180;
  return new THREE.Vector3(-r*Math.sin(phi)*Math.cos(th),r*Math.cos(phi),r*Math.sin(phi)*Math.sin(th));}
function vecToLL(v){
  var r=v.length(),lat=90-Math.acos(v.y/r)*180/Math.PI;
  var lng=Math.atan2(v.z,-v.x)*180/Math.PI-180;
  lng=((lng+180)%360+360)%360-180;
  return{lat:lat,lng:lng};}

// ── Hit-testing (verbatim port of the 2D builders) ───────────────────────────
function pointInRing(lx,ly,ring){var inside=false;
  for(var i=0,j=ring.length-1;i<ring.length;j=i++){
    var xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    if(((yi>ly)!=(yj>ly))&&lx<(xj-xi)*(ly-yi)/(yj-yi)+xi)inside=!inside;}
  return inside;}
function ringArea(ring){var a=0;
  for(var i=0,j=ring.length-1;i<ring.length;j=i++)a+=(ring[j][0]+ring[i][0])*(ring[j][1]-ring[i][1]);
  return Math.abs(a/2);}
var polyMap={},polyArea={};
POLYGONS.forEach(function(p,i){polyMap[p.id]=i;var a=0;
  for(var ri=0;ri<p.r.length;ri++)a+=ringArea(p.r[ri]);polyArea[p.id]=a;});
function hitTest(coords){var best=null,bestA=Infinity;
  for(var pi=0;pi<POLYGONS.length;pi++){var poly=POLYGONS[pi],inside=false;
    for(var ri=0;ri<poly.r.length&&!inside;ri++)if(pointInRing(coords.lng,coords.lat,poly.r[ri]))inside=true;
    if(inside&&polyArea[poly.id]<bestA){bestA=polyArea[poly.id];best=poly.id;}}
  return best;}

// ── Screen ↔ globe ───────────────────────────────────────────────────────────
var raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2();
// Round sprite for point markers (raw WebGL points render as squares).
var _dotTex=null;
function dotTexture(){
  if(_dotTex)return _dotTex;
  var cv=document.createElement('canvas');cv.width=64;cv.height=64;
  var c2=cv.getContext('2d');
  c2.beginPath();c2.arc(32,32,24,0,Math.PI*2);c2.fillStyle='#fff';c2.fill();
  _dotTex=new THREE.CanvasTexture(cv);
  return _dotTex;}
function unproject(sx,sy){
  ndc.set(sx/W*2-1,-(sy/H)*2+1);
  raycaster.setFromCamera(ndc,camera);
  var hits=raycaster.intersectObject(globeMesh,false);
  if(!hits.length)return null;
  return vecToLL(globeMesh.worldToLocal(hits[0].point.clone()));}
var _pv=new THREE.Vector3();
// 'r' MUST match the radius the thing is drawn at. The microstate markers ride
// at DOTR, well above the surface once the relief is on: projecting them from
// r=1 put their tap target several pixels away from the dot the player can see,
// and the gap widened with the zoom — i.e. exactly when they try to reach it.
function projectLL(lat,lng,r){
  _pv.copy(llToVec(lat,lng,r===undefined?1:r));globe.localToWorld(_pv);
  var vis=_pv.clone().normalize().dot(camera.position.clone().normalize())>0.06;
  _pv.project(camera);
  return{sx:(_pv.x*0.5+0.5)*W,sy:(1-(_pv.y*0.5+0.5))*H,d:vis?1:0,vis:vis};}

// ── Overlay: country polygons on an equirect canvas draped over the sphere ──
// 2048x1024 for the whole planet (2:1, the equirect ratio); square when the
// overlay is boxed on one country, whose window is nowhere near 2:1 — the extra
// rows go straight into how sharp a region's edge is when the player zooms past
// the default framing.
var OW=2048,OH=D.obox?2048:1024;
var overlayCv=document.createElement('canvas');overlayCv.width=OW;overlayCv.height=OH;
var overlayCtx=overlayCv.getContext('2d');
var overlayTex=null;
function unwrapRing(ring){
  var out=[],prev=null;
  for(var i=0;i<ring.length;i++){var lng=ring[i][0];
    if(prev!==null){while(lng-prev>180)lng-=360;while(prev-lng>180)lng+=360;}
    out.push([lng,ring[i][1]]);prev=lng;}
  return out;}
// Boxed overlay (Regions): the canvas covers BOX only, so the same 2048x1024
// lands on one country instead of the planet. Rings are shifted by whole turns
// into the box's longitude window first (a box near +-180 would otherwise draw
// its own country off-canvas).
var BOX=D.obox;
function traceRings(ctx,rings,off){
  for(var ri=0;ri<rings.length;ri++){var ring=unwrapRing(rings[ri]);
    var shift=0;
    if(BOX){var mid=(BOX.lng0+BOX.lng1)/2;
      while(ring[0][0]+shift-mid>180)shift-=360;
      while(mid-(ring[0][0]+shift)>180)shift+=360;}
    for(var i=0;i<ring.length;i++){
      var lng=ring[i][0]+shift,lat=ring[i][1];
      var x=BOX?(lng-BOX.lng0)/(BOX.lng1-BOX.lng0)*OW:(lng+180+off)/360*OW;
      var y=BOX?(BOX.lat1-lat)/(BOX.lat1-BOX.lat0)*OH:(90-lat)/180*OH;
      i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    ctx.closePath();}}
function drawPoly(rings,fill,stroke,lw){
  // The +-360 passes only exist to wrap the seam on a full-sphere overlay.
  (BOX?[0]:[-360,0,360]).forEach(function(off){
    overlayCtx.beginPath();traceRings(overlayCtx,rings,off);
    if(fill){overlayCtx.fillStyle=fill;overlayCtx.fill();}
    if(stroke){overlayCtx.strokeStyle=stroke;overlayCtx.lineWidth=lw||2;overlayCtx.stroke();}});}
// Cartoon coat palette — vivid, sticker-like (independent from the game PAL,
// which keeps driving the hover/selected/correct/wrong state colours).
var CART=D.isDark
  ?{land:'#274d68',halo:'rgba(127,216,232,0.30)',line:'#7fd8e8',grat:'rgba(160,200,255,0.12)',city:'#ffd27a'}
  :{land:'#7cc45e',halo:'rgba(255,255,255,0.60)',line:'#2e5b33',grat:'rgba(255,255,255,0.22)',city:null};
var SKIN=D.skin;
// states: [{id,fill,stroke,lw}] — mode-specific paint on top of the base coat.
var overlayStates=[];
// Borders hides every country, so its planet gets no texture at all — only a
// graticule keeps a dark skin from reading as a featureless black panel.
function paintSkinGraticule(){
  overlayCtx.strokeStyle=SKIN.grat;overlayCtx.lineWidth=1.6;
  for(var la=-60;la<=60;la+=30){overlayCtx.beginPath();
    overlayCtx.moveTo(0,(90-la)/180*OH);overlayCtx.lineTo(OW,(90-la)/180*OH);overlayCtx.stroke();}
  for(var lo=-180;lo<180;lo+=30){overlayCtx.beginPath();
    overlayCtx.moveTo((lo+180)/360*OW,OH*0.03);overlayCtx.lineTo((lo+180)/360*OW,OH*0.97);overlayCtx.stroke();}
}
// The pack texture already draws continents, borders, coastlines and graticule
// — it IS the art. So the overlay paints NOTHING on top of it (coat 'none', 17
// of 20 skins) and a round looks exactly like the shop preview. Only the two
// skins the texture leaves unplayable get a coat: Eclipse an outline, Mars an
// outline plus a land tint (its crust carries no landmasses at all).
function paintSkinCoat(){
  if(SKIN.coat==='none')return;
  POLYGONS.forEach(function(p){drawPoly(p.r,null,SKIN.halo,5);});
  POLYGONS.forEach(function(p){drawPoly(p.r,SKIN.landCoat,SKIN.line,1.8);});
}
// Regions: the subdivisions are the board and exist on no texture, so they are
// always drawn. Only their HALO is painted here — a soft, wide underlay. The
// border itself is a real 3D line (buildCrispLines), the one thing that stays a
// hairline at the 8x-20x zoom this mode opens at; a canvas stroke would be a
// fat smear there, exactly the "traits trop gros" problem the world globe had.
function paintRegionCoat(){
  var halo=SKIN?SKIN.halo:PAL.rim;
  POLYGONS.forEach(function(p){drawPoly(p.r,SKIN?null:PAL.landF,halo,10);});
}
function paintOverlay(){
  overlayCtx.clearRect(0,0,OW,OH);
  if(D.regionCoat){
    paintRegionCoat();
  } else if(SKIN){
    if(D.drawBaseLand)paintSkinCoat();else paintSkinGraticule();
  } else if(!photoMode){
    // Cartoon coat: graticule + sticker continents (white coastal halo under a
    // bold dark outline) + golden city lights at night.
    overlayCtx.strokeStyle=CART.grat;overlayCtx.lineWidth=1.6;
    for(var la=-60;la<=60;la+=30){overlayCtx.beginPath();
      overlayCtx.moveTo(0,(90-la)/180*OH);overlayCtx.lineTo(OW,(90-la)/180*OH);overlayCtx.stroke();}
    for(var lo=-180;lo<180;lo+=30){overlayCtx.beginPath();
      overlayCtx.moveTo((lo+180)/360*OW,OH*0.03);overlayCtx.lineTo((lo+180)/360*OW,OH*0.97);overlayCtx.stroke();}
    if(D.drawBaseLand){
      POLYGONS.forEach(function(p){drawPoly(p.r,null,CART.halo,10);});
      POLYGONS.forEach(function(p){drawPoly(p.r,CART.land,CART.line,3);});
      if(CART.city)D.cities.forEach(function(c){
        var x=(c[0]+180)/360*OW,y=(90-c[1])/180*OH;
        overlayCtx.save();overlayCtx.shadowColor=CART.city;overlayCtx.shadowBlur=14;
        overlayCtx.fillStyle=CART.city;
        overlayCtx.beginPath();overlayCtx.arc(x,y,4,0,Math.PI*2);overlayCtx.fill();overlayCtx.restore();});
    }
  } else if(D.drawBaseLand){
    // Photo coat: subtle political borders so countries stay pickable.
    POLYGONS.forEach(function(p){drawPoly(p.r,null,PAL.landS,1.8);});
  }
  overlayStates.forEach(function(s){
    var idx=polyMap[s.id];if(idx===undefined)return;
    // Sticker pop: white under-stroke so states read on any land colour
    // (green-on-green correct-state was invisible on the cartoon coat).
    drawPoly(POLYGONS[idx].r,null,'rgba(255,255,255,0.85)',(s.lw||2.6)+5);
    drawPoly(POLYGONS[idx].r,s.fill,s.stroke,s.lw||2.6);});
  if(overlayTex)overlayTex.needsUpdate=true;
  needsRender=true;}
function setOverlayStates(list){overlayStates=list||[];paintOverlay();}

// ── Scene ────────────────────────────────────────────────────────────────────
function initScene(){
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,D.maxDpr));
  renderer.setSize(W,H);
  // The rig renders with NO tone mapping so the pack's cartoon colours come out
  // exactly as authored (webp parity); ACES stays for the stock look.
  renderer.toneMapping=RIG?THREE.NoToneMapping:THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(40,W/H,0.01,60);
  if(RIG){
    // rig.json key/fill/rim, the exact lighting the pack was baked under.
    [[-35,30,3.0,0xfff4e0],[60,-10,0.6,0xbcd4ff],[160,25,1.8,0x9fc0ff]].forEach(function(L){
      var az=L[0]*Math.PI/180,el=L[1]*Math.PI/180;
      var d=new THREE.DirectionalLight(L[3],L[2]);
      d.position.set(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el));
      scene.add(d);});
    scene.add(new THREE.AmbientLight(0x8a94b0,0.8));
  } else {
    var sun=new THREE.DirectionalLight(0xfff2dd,D.isDark?1.35:2.2);
    sun.position.set(-1.6,1.0,3.0);scene.add(sun);
    scene.add(new THREE.AmbientLight(D.isDark?0x2a3350:0x9fb3cd,D.isDark?1.05:1.15));
    var rim=new THREE.DirectionalLight(D.isDark?0x7a92ff:0xcfe0ff,0.7);
    rim.position.set(2.4,0.6,-2.0);scene.add(rim);
  }

  pivot=new THREE.Group();scene.add(pivot);
  globe=new THREE.Group();pivot.add(globe);
  makeGradientMap();
  globeMesh=new THREE.Mesh(new THREE.SphereGeometry(1,96,96),
    new THREE.MeshToonMaterial({color:new THREE.Color(SKIN?SKIN.ocean:(D.isDark?'#153564':'#2f8ad8')),gradientMap:GRAD}));
  globe.add(globeMesh);
  // Skin texture + Blender rig: only where the base map is allowed to be visible.
  // Borders mode keeps its bare tinted sphere — its whole puzzle is that the
  // countries are NOT readable off the map.
  if(SKIN&&SKIN.texture&&D.drawBaseLand)applySkinTexture();
  overlayTex=new THREE.CanvasTexture(overlayCv);
  overlayTex.colorSpace=THREE.SRGBColorSpace;
  // Grazing angles near the limb are where an equirect overlay smears the most;
  // 16 costs nothing on a single sphere and keeps the highlights legible there.
  overlayTex.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
  // A boxed overlay rides a sphere PATCH whose UVs span the box, so the canvas is
  // spent entirely on the country in play (see CoreOptions.overlayBox).
  var oGeo=BOX
    ?new THREE.SphereGeometry(SURF,96,96,
      (BOX.lng0+180)*Math.PI/180,(BOX.lng1-BOX.lng0)*Math.PI/180,
      (90-BOX.lat1)*Math.PI/180,(BOX.lat1-BOX.lat0)*Math.PI/180)
    :new THREE.SphereGeometry(SURF,96,96);
  overlayMesh=new THREE.Mesh(oGeo,
    new THREE.MeshBasicMaterial({map:overlayTex,transparent:true,depthWrite:false}));
  globe.add(overlayMesh);
  cloudMesh=new THREE.Mesh(new THREE.SphereGeometry(1.016,64,64),
    new THREE.MeshBasicMaterial({transparent:true,opacity:0.9,depthWrite:false}));
  cloudMesh.visible=false;globe.add(cloudMesh);
  // Clouds are decorative-only (menu): on the gameplay globes they would hide
  // the very country the player must find. A skin decides for itself whether its
  // planet has weather (Mars, Hologram and friends do not).
  if(D.look==='cartoon'&&D.spin&&(SKIN?SKIN.clouds:!D.isDark)){
    cloudMesh.material.map=cartoonClouds();cloudMesh.material.needsUpdate=true;
    cloudMesh.material.opacity=0.8;cloudMesh.visible=true;}
  var atmoOn=SKIN?!!SKIN.atmo:true;
  atmoMesh=new THREE.Mesh(new THREE.SphereGeometry(1.10,64,64),
    new THREE.ShaderMaterial({
      uniforms:{c:{value:new THREE.Color(SKIN&&SKIN.atmo?SKIN.atmo:(D.isDark?'#4a6aff':'#7fb8ff'))},p:{value:3.6},s:{value:SKIN?SKIN.atmoStrength:(D.isDark?1.1:0.6)}},
      vertexShader:'varying vec3 vN;varying vec3 vP;void main(){vN=normalize(normalMatrix*normal);vP=normalize((modelViewMatrix*vec4(position,1.)).xyz);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform vec3 c;uniform float p;uniform float s;varying vec3 vN;varying vec3 vP;void main(){float f=pow(1.0-abs(dot(vN,-vP)),p)*s;gl_FragColor=vec4(c,1.0)*f;}',
      blending:THREE.AdditiveBlending,side:THREE.BackSide,transparent:true,depthWrite:false}));
  atmoMesh.visible=atmoOn;
  scene.add(atmoMesh);
  if(SKIN?SKIN.stars:D.isDark){
    var n=420,pos=new Float32Array(n*3);
    for(var i=0;i<n;i++){var u=Math.random()*2-1,a=Math.random()*Math.PI*2,rr=18;
      var sq=Math.sqrt(1-u*u);
      pos[i*3]=rr*sq*Math.cos(a);pos[i*3+1]=rr*u;pos[i*3+2]=rr*sq*Math.sin(a);}
    var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xbfd0ff,size:1.6,sizeAttenuation:false,transparent:true,opacity:0.8})));
  }
  if(SKIN){
    applyCosmos();
    loadSatellite((typeof THREE.GLTFLoader==='function')?new THREE.GLTFLoader():null);
  }
  buildCrispLines();
  applyRotation();updateCamera();paintOverlay();updateCrispLines();
}
function applyRotation(){
  pivot.rotation.x=rotLat*Math.PI/180;
  globe.rotation.y=(-90-rotLon)*Math.PI/180;
  needsRender=true;}
// Past this apparent radius the camera would be sitting ON the crust (its
// distance is 1/sin(a), so a→90° means d→1) and the view degenerates into the
// inside of the sphere — black sky with stars. Régions frames a whole country
// on screen, so it reaches that ceiling from the very first frame on a small
// country. Beyond A_MAX the camera therefore stops closing in and goes
// TELEPHOTO instead: same viewpoint, narrower field of view. 1.40 rad is above
// anything Globe Géo/Frontières can reach (zoom 24 tops out at ~1.37), so their
// framing is bit-for-bit unchanged.
var A_MAX=1.40;
function updateCamera(){
  var want=(baseR*zoom)/(H/2); // sphere radius, in half-screens
  var a=Math.atan(Math.tan(FOVY/2)*want),fov=FOVY;
  if(a>A_MAX){a=A_MAX;fov=2*Math.atan(Math.tan(A_MAX)/Math.max(0.001,want));}
  camera.position.set(0,0,1/Math.sin(Math.max(0.03,a)));
  camera.fov=fov*180/Math.PI;
  camera.lookAt(0,0,0);
  camera.updateProjectionMatrix();
  needsRender=true;}

// ── Skinned planet: the Blender rig, same assembly as <AvatarPreview3D> ──────
// Equirect pack texture on the sphere + the shared globe_land.glb continent
// relief (two shells: 'landtex' wears the style texture, 'landink' is the
// outline) + the style's own props GLB (volcanoes, ice crystals, crown…).
// Ported from lib/avatar3d/buildAvatarHtml so the planet the player bought is
// the same object in the shop and in a round.

// Rig toon ramp (parity with the pre-rendered layers).
function makeGradientMap(){
  if(RIG){
    var vals=[132,210,255],d=new Uint8Array(vals.length*4);
    for(var i=0;i<vals.length;i++){d[i*4]=d[i*4+1]=d[i*4+2]=vals[i];d[i*4+3]=255;}
    GRAD=new THREE.DataTexture(d,vals.length,1);
  } else {
    var gcv=document.createElement('canvas');gcv.width=3;gcv.height=1;
    var gcx=gcv.getContext('2d');
    ['#7a7a7a','#c4c4c4','#ffffff'].forEach(function(g,i){gcx.fillStyle=g;gcx.fillRect(i,0,1,1);});
    GRAD=new THREE.CanvasTexture(gcv);
  }
  GRAD.minFilter=THREE.NearestFilter;GRAD.magFilter=THREE.NearestFilter;GRAD.needsUpdate=true;
}
// Blender extras (ggKind/ggHex/ggAlpha) → three materials, verbatim from the rig.
function remapMaterials(root){root.traverse(function(n){
  if(!n.isMesh||!n.material)return;
  var ud=n.material.userData||{};
  var kind=ud.ggKind||'toon',hex=ud.ggHex||'#c8d0d8';
  var alpha=(ud.ggAlpha!=null)?ud.ggAlpha:1;
  n.userData.ggKind=kind;
  if(n.material.dispose)n.material.dispose();
  if(kind==='outline'||kind==='landink'){
    n.material=new THREE.MeshBasicMaterial({color:new THREE.Color(kind==='landink'?SKIN.landInk:hex),side:THREE.BackSide});
  }else if(kind==='flat'){
    n.material=new THREE.MeshBasicMaterial({color:new THREE.Color(hex),
      transparent:alpha<1,opacity:alpha,depthWrite:alpha>=1});
  }else if(kind==='landtex'){
    n.material=new THREE.MeshToonMaterial({color:0xffffff,gradientMap:GRAD});
  }else{
    n.material=new THREE.MeshToonMaterial({color:new THREE.Color(hex),gradientMap:GRAD});
  }});}
// Dark styles are self-lit in the rig: unlit material, no toon banding.
function skinMaterial(tex){
  return SKIN.unlit?new THREE.MeshBasicMaterial({map:tex})
    :new THREE.MeshToonMaterial({map:tex,gradientMap:GRAD});}
function dressLand(root,tex){
  root.traverse(function(n){
    if(n.isMesh&&n.userData.ggKind==='landtex'){
      if(n.material&&n.material.dispose)n.material.dispose();
      n.material=skinMaterial(tex);}});}
// Props animations (pulsing lava, breathing ice crystals, crown gems).
var propAnims=[];
function nodesOf(root,re){var out=[];root.traverse(function(n){
  if(n.isMesh&&re.test(n.name))out.push(n);});return out;}
function restOf(n){
  if(!n.userData.rest)n.userData.rest={s:n.scale.clone()};
  return n.userData.rest;}
function colorPulse(mesh,hexHot,freq,phase){
  var c0=mesh.material.color.clone(),c1=new THREE.Color(hexHot);
  propAnims.push(function(t){mesh.material.color.copy(c0).lerp(c1,0.5+0.5*Math.sin(t*freq+phase));});}
function setupPropsAnims(p){
  nodesOf(p,/_lv$|_lv[.]/).forEach(function(v,i){colorPulse(v,'#ffd23e',2.1,i*1.4);});
  nodesOf(p,/^gprop_fis/).forEach(function(f,i){colorPulse(f,'#ffd23e',1.9,i*0.8);});
  nodesOf(p,/_dp$|_dp[.]/).forEach(function(d,i){var r0=restOf(d);
    propAnims.push(function(t){d.scale.set(r0.s.x,r0.s.y,r0.s.z*(1+0.18*Math.sin(t*2.4+i)));});});
  nodesOf(p,/crown_gem/).forEach(function(g,i){var r0=restOf(g);
    propAnims.push(function(t){g.scale.copy(r0.s).multiplyScalar(1+0.16*Math.max(0,Math.sin(t*3.1+i*1.1)));});});
  nodesOf(p,/_c[0-9]/).forEach(function(c2,i){var r0=restOf(c2);
    propAnims.push(function(t){c2.scale.copy(r0.s).multiplyScalar(1+0.05*Math.sin(t*2.2+i*1.6));});});
}
function applySkinTexture(){
  new THREE.TextureLoader().load(SKIN.texture,function(t){
    t.colorSpace=THREE.SRGBColorSpace;
    t.wrapS=THREE.RepeatWrapping; // the relief crosses the ±180° seam (u>1)
    t.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
    var old=globeMesh.material;
    globeMesh.material=skinMaterial(t);
    if(old&&old.dispose)old.dispose();
    needsRender=true;
    loadRig(t);
  },undefined,function(){/* keep the flat skin-tinted sphere */});
}
// ── Cosmos backdrop: the equipped sky, behind everything ────────────────────
function applyCosmos(){
  if(!SKIN||!SKIN.cosmos)return; // free procedural night → keep the theme colour
  new THREE.TextureLoader().load(SKIN.cosmos,function(t){
    t.colorSpace=THREE.SRGBColorSpace;
    scene.background=t;needsRender=true;
  },undefined,function(){});
}

// ── Satellite: the equipped one, on the rig's own orbit ─────────────────────
// Tables lifted from buildAvatarHtml so it flies exactly as on the profile:
// 'face' points the nose along the orbit, otherwise it spins slowly on itself.
var SAT_BEHAV={
  sat_moon:{spin:0.4},sat_st_moon:{spin:0.4},sat_satellite:{spin:0.55},
  sat_iss:{spin:0.3},sat_ufo:{spin:1.5},
  sat_balloon:{face:1,yaw:0},sat_paperplane:{face:1,yaw:0},
  sat_plane:{face:1,yaw:0},sat_bird:{face:1,yaw:0},sat_rocket:{face:1,yaw:0},
  sat_comet:{face:1,yaw:0},sat_shootingstar:{face:1,yaw:0},
  sat_st_comet:{face:1,yaw:0},sat_st_ship:{face:1,yaw:Math.PI},
};
var SAT_SCALE={sat_bird:0.56,sat_plane:0.46,sat_iss:0.48,sat_st_ship:0.47,
  sat_balloon:0.45,sat_satellite:0.44,sat_ufo:0.45,sat_paperplane:0.42,
  sat_comet:0.50,sat_rocket:0.43,sat_shootingstar:0.50,sat_st_comet:0.50,
  sat_moon:0.31,sat_st_moon:0.34};
var satObj=null,satBehav=null;
function loadSatellite(loader){
  if(!SKIN||!SKIN.satellite||!loader)return;
  var id=SKIN.satellite.id;
  loader.load(SKIN.satellite.model,function(g){
    var m=g.scene;remapMaterials(m);
    var box=new THREE.Box3().setFromObject(m);
    var sz=box.getSize(new THREE.Vector3());
    var mx=Math.max(sz.x,sz.y,sz.z,0.001),mn=Math.max(0.001,Math.min(sz.x,sz.y,sz.z));
    var target=SAT_SCALE[id]||((mx/mn<1.35)?0.30:0.40);
    var s=target/mx;
    m.scale.setScalar(s);
    m.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(s));
    satBehav=SAT_BEHAV[id]||null;
    satObj=new THREE.Group();satObj.add(m);
    satObj.userData.spin=(satBehav&&satBehav.spin)||(satBehav?0:0.7);
    // Blinking beacons / waving pennants, same as the profile.
    nodesOf(m,/^blink/).forEach(function(b){
      var c0=b.material.color.clone(),c1=new THREE.Color('#5a1410');
      propAnims.push(function(t){b.material.color.copy(Math.sin(t*4.2)>0?c0:c1);});});
    nodesOf(m,/^flag/).forEach(function(f){var r0=f.rotation.y;
      propAnims.push(function(t){f.rotation.y=r0+Math.sin(t*5.2)*0.22;});});
    // The satellite lives in world space, not on the globe: dragging the planet
    // must not drag its moon along.
    scene.add(satObj);needsRender=true;
  },undefined,function(){});
}
var SAT_BASE=-Math.PI/4,SAT_SPEED=0.4,SAT_R=1.12,SAT_TILT=-16*Math.PI/180;
function moveSatellite(t){
  if(!satObj)return;
  var a=SAT_BASE+t*SAT_SPEED;
  var x=Math.cos(a)*SAT_R,zz=Math.sin(a)*SAT_R;
  satObj.position.set(x,-Math.sin(SAT_TILT)*zz,Math.cos(SAT_TILT)*zz);
  if(satBehav&&satBehav.face)satObj.rotation.y=-a-Math.PI/2+(satBehav.yaw||0);
  else if(satObj.userData.spin)satObj.rotation.y=t*satObj.userData.spin;
  needsRender=true;
}

// ── Crisp borders: real 3D lines, sharp at any zoom ─────────────────────────
// The planet's art is a 2048×1024 equirect texture. Beautiful at world zoom,
// but at 24× the player is looking at ~1/24th of it and everything turns to
// mush. These line loops trace the SAME world_polygons the texture was drawn
// from, so they land exactly on its borders and simply re-sharpen them —
// invisible at world zoom (the texture alone, the look validated for the shop),
// fading in as the player zooms in to hunt a small country.
function ringSegments(rings,r,out){
  for(var ri=0;ri<rings.length;ri++){
    var ring=rings[ri];
    for(var i=0;i<ring.length;i++){
      var a=ring[i],b=ring[(i+1)%ring.length];
      var va=llToVec(a[1],a[0],r),vb=llToVec(b[1],b[0],r);
      out.push(va.x,va.y,va.z,vb.x,vb.y,vb.z);}}
}
var crispLines=null;
function buildCrispLines(){
  if(!D.regionCoat&&(!SKIN||!D.drawBaseLand))return;
  var pos=[];
  for(var i=0;i<POLYGONS.length;i++)ringSegments(POLYGONS[i].r,LINER,pos);
  if(!pos.length)return;
  var g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pos),3));
  crispLines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({
    color:new THREE.Color(SKIN?SKIN.crispLine:PAL.landS),transparent:true,opacity:0,depthWrite:false}));
  crispLines.visible=false;
  globe.add(crispLines);
}
// Ramp: nothing below 2×, full strength by 6× — the zone where the texture
// stops holding up and the player is picking between neighbours.
//
// The raised relief bows out at the same time. Extruded plateaus and lines on a
// sphere cannot register: the higher the zoom, the further the relief's walls
// slide off the borders drawn underneath them. Up close the map has to be a
// map, so the planet flattens and the crisp lines land exactly on the texture.
var landObj=null;
function updateCrispLines(){
  if(crispLines){
    // Regions open already zoomed on a country: their borders are the board, so
    // they are never faded out. Country borders instead fade in from 2x to 6x,
    // where the equirect texture stops holding up.
    var k=D.regionCoat?1:Math.max(0,Math.min(1,(zoom-2)/4));
    crispLines.material.opacity=k*(D.regionCoat?0.9:0.75);
    crispLines.visible=k>0.01;
  }
  if(landObj){
    var flat=Math.max(0,Math.min(1,(zoom-3)/3)); // 3× → 6×
    landObj.visible=flat<1;
    landObj.scale.setScalar(1-0.02*flat);        // sink the crust back into the sphere
  }
  needsRender=true;
}

// Zoomed in on a country, an orbiting moon crossing between the camera and the
// planet is just an obstacle — the sky belongs to the world view.
var SAT_MAX_ZOOM=3;
function updateSatVisibility(){
  if(satObj&&satObj.visible!==(zoom<=SAT_MAX_ZOOM)){
    satObj.visible=zoom<=SAT_MAX_ZOOM;needsRender=true;}
}

function loadRig(tex){
  var loader=(typeof THREE.GLTFLoader==='function')?new THREE.GLTFLoader():null;
  if(!loader)return; // no vendored loader → texture-only planet, still correct
  // The GLBs are exported in a pure geo frame: +90° Y lines them up with
  // three.SphereGeometry's UV convention. Parented to the globe group, so they rotate,
  // zoom and re-frame with it for free.
  if(SKIN.landModel){
    loader.load(SKIN.landModel,function(g){
      var land=g.scene;remapMaterials(land);dressLand(land,tex);
      land.rotation.y=Math.PI/2;globe.add(land);
      landObj=land;updateCrispLines();
    },undefined,function(){});
  }
  if(SKIN.propsModel){
    loader.load(SKIN.propsModel,function(g){
      var props=g.scene;remapMaterials(props);
      props.rotation.y=Math.PI/2;globe.add(props);
      setupPropsAnims(props);needsRender=true;
    },undefined,function(){});
  }
}

window.setTextures=function(uris){
  if(D.look!=='photo')return; // cartoon look ignores photo textures
  var loader=new THREE.TextureLoader(),pending=0;
  Object.keys(uris||{}).forEach(function(k){if(!uris[k])return;pending++;
    loader.load(uris[k],function(t){t.colorSpace=THREE.SRGBColorSpace;
      t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
      loadedTex[k]=t;pending--;if(!pending)applyPhoto();},undefined,function(){pending--;});});
  if(!pending)applyPhoto();};
function applyPhoto(){
  var m=globeMesh.material;
  if(D.isDark&&loadedTex.night){
    m.map=loadedTex.night;m.color.set(0x8a94ac);
    m.emissiveMap=loadedTex.night;m.emissive=new THREE.Color(0xffffff);
  } else if(!D.isDark&&loadedTex.day){
    m.map=loadedTex.day;m.color.set(0xffffff);
    m.specular=new THREE.Color(0x223b4d);m.shininess=42;
  } else return;
  if(loadedTex.bump){m.bumpMap=loadedTex.bump;m.bumpScale=0.03;}
  m.needsUpdate=true;
  if(!D.isDark&&loadedTex.clouds){
    cloudMesh.material.map=loadedTex.clouds;cloudMesh.material.alphaMap=loadedTex.clouds;
    cloudMesh.material.needsUpdate=true;cloudMesh.visible=true;}
  photoMode=true;paintOverlay();}

// ── Input (same feel as the 2D globes) ───────────────────────────────────────
var drag=null,pinchD=null,pinchZ=null;
var onTapCb=null,onHoverCb=null;
function onStart(x,y){drag={x:x,y:y,lon:rotLon,lat:rotLat,moved:false};}
function onMoveDrag(x,y){if(!drag)return;
  var dx=x-drag.x,dy=y-drag.y;
  if(Math.abs(dx)>4||Math.abs(dy)>4)drag.moved=true;
  rotLon=drag.lon-dx*(0.35/zoom);
  rotLat=Math.max(-85,Math.min(85,drag.lat+dy*(0.35/zoom)));
  applyRotation();}
var lastTap=0,lastTapX=0,lastTapY=0;
// A touch tap is followed by SYNTHESISED mouse events (touchend, then
// mousedown/mouseup a few ms later). Both paths reach onEnd, so a single tap
// looked like a double-tap and zoomed the globe by itself on every pick.
// Ignore the mouse path for a moment after any touch.
var lastTouch=0;
function fromTouch(){return Date.now()-lastTouch<700;}
function onEnd(x,y){
  if(drag&&!drag.moved){
    var now=Date.now();
    // Double-tap zooms in on the spot (touch path to the dot microstates).
    if(now-lastTap<280&&Math.hypot(x-lastTapX,y-lastTapY)<22){lastTap=0;setZoom(zoom*1.8,x,y);}
    else{lastTap=now;lastTapX=x;lastTapY=y;if(onTapCb)onTapCb(x,y);}}
  drag=null;}
// Projections read matrices the render loop normally refreshes; anchoring runs
// between frames, so sync them by hand before each probe.
function syncMatrices(){
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();}
// Keep the geo point under the finger/cursor pinned while zooming (same
// linearisation as the drag handler, iterated to convergence).
function anchorAt(lat,lng,px,py){
  for(var i=0;i<6;i++){
    syncMatrices();
    var p=projectLL(lat,lng);if(!p.vis)return;
    var ex=px-p.sx,ey=py-p.sy;
    if(Math.abs(ex)<0.5&&Math.abs(ey)<0.5)return;
    var f=57.2957795/(baseR*zoom);
    rotLon-=ex*f/Math.max(0.2,Math.cos(lat*Math.PI/180));
    rotLat=Math.max(-85,Math.min(85,rotLat+ey*f));
    applyRotation();}}
var onZoomCb=null;
// geo === undefined → resolve the anchor from (px,py); null → plain centre zoom.
function setZoom(z,px,py,geo){
  var anchor=null;
  if(px!==undefined){syncMatrices();anchor=geo===undefined?unproject(px,py):geo;}
  zoom=Math.max(ZMIN,Math.min(ZMAX,z));
  updateCamera();
  if(anchor)anchorAt(anchor.lat,anchor.lng,px,py);
  var zr=document.getElementById('zr');
  if(zr&&!D.resetAlways)zr.style.display=zoom>1.05?'flex':'none';
  updateCrispLines();updateSatVisibility();
  if(onZoomCb)onZoomCb();}
// The +/-/reset controls live inside the page, so their clicks bubble to the
// document handlers below and used to register as a tap on the planet too —
// pressing "+" silently picked whatever sat under the button.
function onControls(e){
  var zc=document.getElementById('zc');
  return !!(zc&&e.target&&zc.contains(e.target));}
if(D.interactive){
  var pinchGeo=null;
  document.addEventListener('touchstart',function(e){
    lastTouch=Date.now();
    if(onControls(e))return;
    if(e.touches.length===2){pinchD=Math.hypot(e.touches[1].clientX-e.touches[0].clientX,e.touches[1].clientY-e.touches[0].clientY);pinchZ=zoom;drag=null;
      syncMatrices();pinchGeo=unproject((e.touches[0].clientX+e.touches[1].clientX)/2,(e.touches[0].clientY+e.touches[1].clientY)/2);}
    else onStart(e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
  document.addEventListener('touchmove',function(e){e.preventDefault();lastTouch=Date.now();
    if(e.touches.length===2&&pinchD!==null){
      var d=Math.hypot(e.touches[1].clientX-e.touches[0].clientX,e.touches[1].clientY-e.touches[0].clientY);
      // Anchoring the start midpoint to the live one gives two-finger pan for free.
      setZoom(pinchZ*d/pinchD,(e.touches[0].clientX+e.touches[1].clientX)/2,(e.touches[0].clientY+e.touches[1].clientY)/2,pinchGeo);}
    else if(e.touches.length===1)onMoveDrag(e.touches[0].clientX,e.touches[0].clientY);},{passive:false});
  document.addEventListener('touchend',function(e){
    lastTouch=Date.now();
    if(e.touches.length<2){pinchD=null;pinchGeo=null;}
    if(e.touches.length===1)drag={x:e.touches[0].clientX,y:e.touches[0].clientY,lon:rotLon,lat:rotLat,moved:true};
    if(e.touches.length===0)onEnd(e.changedTouches[0].clientX,e.changedTouches[0].clientY);},{passive:true});
  document.addEventListener('mousedown',function(e){if(fromTouch()||onControls(e))return;onStart(e.clientX,e.clientY);});
  document.addEventListener('mousemove',function(e){
    if(fromTouch())return;
    if(drag){onMoveDrag(e.clientX,e.clientY);return;}
    if(onHoverCb)onHoverCb(e.clientX,e.clientY);});
  document.addEventListener('mouseup',function(e){if(fromTouch()||onControls(e))return;onEnd(e.clientX,e.clientY);});
  document.addEventListener('wheel',function(e){e.preventDefault();setZoom(zoom*(e.deltaY>0?0.9:1.1),e.clientX,e.clientY);},{passive:false});
  var zin=document.getElementById('zin');
  if(zin){
    // 1.7× per press: two taps clear DOT_PICK_ZOOM in find mode.
    zin.addEventListener('click',function(){setZoom(zoom*1.7);});
    document.getElementById('zout').addEventListener('click',function(){setZoom(zoom/1.7);});
    // The game can own the reset (borders re-frames on the chain); otherwise
    // ⟲ is just "back to world zoom".
    document.getElementById('zr').addEventListener('click',function(){
      if(window.__recenter)window.__recenter();else setZoom(1);});
  }
}

// ── Loop ─────────────────────────────────────────────────────────────────────
var frameCbs=[],animClock=0;
function loop(){
  requestAnimationFrame(loop);
  if(D.spin){rotLon+=0.05;applyRotation();}
  if(cloudMesh&&cloudMesh.visible){cloudMesh.rotation.y+=0.00035;needsRender=true;}
  if(propAnims.length||satObj){
    animClock+=1/60;
    for(var a=0;a<propAnims.length;a++)propAnims[a](animClock);
    if(satObj&&satObj.visible)moveSatellite(animClock);
    needsRender=true;}
  for(var i=0;i<frameCbs.length;i++)frameCbs[i]();
  if(needsRender){renderer.render(scene,camera);needsRender=false;}}

function setup(){
  W=window.innerWidth;H=window.innerHeight;
  if(!W||!H){requestAnimationFrame(setup);return;}
  baseR=Math.min(W,H)/2*D.initial.fit;
  // gameJs has run by now, so drawBaseLand is known.
  RIG=!!(SKIN&&SKIN.texture&&D.drawBaseLand);
  if(RIG&&SKIN.landModel){SURF=1.03;DOTR=1.032;}
  // The crisp lines must hug the surface the TEXTURE is on, not the highlight
  // overlay above it: parked at SURF they drifted visibly off the coastlines at
  // high zoom, because the relief lifts the texture ~2% and the parallax grows
  // with the zoom. Just above the relief's crest (~1.021) they stay glued to it.
  LINER=(RIG&&SKIN.landModel)?1.023:SURF+0.004;
  initScene();
  if(typeof gameInit==='function')gameInit();
  loop();
  postMsg({type:'GLOBE_READY'});
}
window.addEventListener('resize',function(){
  if(!renderer)return;
  W=window.innerWidth;H=window.innerHeight;baseR=Math.min(W,H)/2*D.initial.fit;
  camera.aspect=W/H;renderer.setSize(W,H);updateCamera();});
${gameJs}
requestAnimationFrame(setup);
</script>
</body>
</html>`;
}

// ── FIND mode (FindCountryGame) ──────────────────────────────────────────────

export interface FindDot {
  cca3: string;
  lat: number;
  lng: number;
  /** km² — sizes the tap footprint of the dot-rendered microstates. */
  area?: number;
}

export function buildFindEarthHtml(opts: {
  threeSrc: string;
  isDark: boolean;
  pal: MapPalette;
  polygons: WorldPolygon[];
  dots: FindDot[];
  maxDpr?: number;
  skin?: GameGlobeSkin | null;
}): string {
  const gameJs = `
var COUNTRIES=${JSON.stringify(opts.dots)};
D.drawBaseLand=true;
var sel=null,hov=null,locked=false,resultMode=false,resultCorrect=null,resultPicked=null;
var dotsObj=null,dotHalo=null,activeDot=null,activeHalo=null;
// Dot microstates grow with zoom: zooming in is the player's tool for reaching
// them, so they must become a bigger target. Base bumped from 9 to 14 px and the
// curve steepened — on a full-bleed textured planet the old marker was a speck.
function dotSize(){return 14*Math.pow(zoom,0.3);}
// Dot countries only outrank the polygon they sit on ONCE ZOOMED IN: at world
// zoom the marker spans ~250 km, so giving it priority handed the Riviera to
// Monaco and half the Pyrenees to Andorra. Below this, behaviour is exactly
// what shipped before (polygon first, 26 px ocean snap for the islands).
var DOT_PICK_ZOOM=2.6;
// Tap footprint of a dot country, in px: the on-screen radius of its REAL area
// (capped, since a coarse host polygon must keep its middle), floored at the
// drawn marker so a 0.5 km² Vatican still gets a finger-sized target.
function dotFootprint(c){
  return Math.max(dotSize()/2+8,(baseR*zoom)*Math.min(35,Math.sqrt((c.area||0)/Math.PI))/6371);}
function nearestDot(tx,ty,maxD){
  var best=null,bestD=maxD;
  for(var i=0;i<COUNTRIES.length;i++){
    var c=COUNTRIES[i];
    if(polyMap[c.cca3]!==undefined)continue;
    var p=projectLL(c.lat,c.lng,DOTR);if(!p.vis)continue;
    var d=Math.hypot(p.sx-tx,p.sy-ty);
    if(d<bestD){bestD=d;best=c;}}
  return best;}
// The dot whose own footprint the tap falls in (closest one relative to its
// own radius, so Vatican beats Italy but never outranks a bigger neighbour).
function dotInFootprint(tx,ty){
  if(zoom<DOT_PICK_ZOOM)return null;
  var best=null,bestRel=1,bestD=0;
  for(var i=0;i<COUNTRIES.length;i++){
    var c=COUNTRIES[i];
    if(polyMap[c.cca3]!==undefined)continue;
    var p=projectLL(c.lat,c.lng,DOTR);if(!p.vis)continue;
    var d=Math.hypot(p.sx-tx,p.sy-ty),rel=d/dotFootprint(c);
    if(rel<bestRel){bestRel=rel;best=c;bestD=d;}}
  return best?{c:best,d:bestD}:null;}
var centreMap={};
COUNTRIES.forEach(function(c){centreMap[c.cca3]=c;});
// Screen distance from a tap to a country's own centre, or Infinity.
function centreDist(cca3,tx,ty){
  var c=centreMap[cca3];if(!c)return Infinity;
  var p=projectLL(c.lat,c.lng,DOTR);if(!p.vis)return Infinity;
  return Math.hypot(p.sx-tx,p.sy-ty);}
// Dot countries win inside their own screen footprint, THEN polygons, then a
// wider 26 px snap. Seven dots (Vatican/Saint-Marin in ITA, Monaco/Andorre in
// FRA, Liechtenstein in CHE, Singapour in MYS, Palestine in ISR) sit inside
// another country's ring, so a polygon-first test made them unselectable.
function pickAt(tx,ty){
  var coords=unproject(tx,ty);
  var poly=coords?hitTest(coords):null;
  var near=dotInFootprint(tx,ty);
  // A tap on a country's own centre belongs to that country even when a dot's
  // footprint covers it (coarse ISR ring vs the Palestine dot).
  if(near&&poly&&centreDist(poly,tx,ty)<near.d)return poly;
  if(near)return near.c.cca3;
  if(poly)return poly;
  var far=nearestDot(tx,ty,26);
  return far?far.cca3:null;}
function repaintStates(){
  var list=[];
  if(resultMode){
    if(resultCorrect)list.push({id:resultCorrect,fill:PAL.okF,stroke:PAL.okS,lw:3.4});
    if(resultPicked&&resultPicked!==resultCorrect)list.push({id:resultPicked,fill:PAL.badF,stroke:PAL.badS,lw:3.4});
  } else {
    if(hov&&!locked&&hov!==sel)list.push({id:hov,fill:PAL.hovF,stroke:PAL.hovS,lw:3.4});
    if(sel)list.push({id:sel,fill:PAL.selF,stroke:PAL.selS,lw:4});
  }
  setOverlayStates(list);
  updateHiDot();
}
// Which dot countries are in a game state right now, and in which colour.
// Every OTHER dot stays neutral: painting them all in the selection colour (as
// this globe used to) meant tapping one changed nothing on screen — there was
// no way to tell what you had picked.
function dotStates(){
  var out=[];
  if(resultMode){
    if(resultCorrect&&polyMap[resultCorrect]===undefined)out.push({id:resultCorrect,color:PAL.okS});
    if(resultPicked&&resultPicked!==resultCorrect&&polyMap[resultPicked]===undefined)out.push({id:resultPicked,color:PAL.badS});
  } else {
    if(hov&&!locked&&hov!==sel&&polyMap[hov]===undefined)out.push({id:hov,color:PAL.hovS});
    if(sel&&polyMap[sel]===undefined)out.push({id:sel,color:PAL.selS});
  }
  return out;}
// The highlighted dots are redrawn on their own layer, bigger and in the state
// colour, on top of the neutral ones — colour AND size, so the pick reads at a
// glance even in a cluster like the Riviera.
function updateHiDot(){
  if(!activeDot)return;
  var st=dotStates();
  var pos=[],col=[];
  st.forEach(function(s2){
    var c=centreMap[s2.id];if(!c)return;
    var v=llToVec(c.lat,c.lng,DOTR+0.001);
    pos.push(v.x,v.y,v.z);
    var cl=new THREE.Color(s2.color);col.push(cl.r,cl.g,cl.b);});
  [activeHalo,activeDot].forEach(function(o){
    o.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pos),3));
    o.geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(col),3));
    o.geometry.setDrawRange(0,pos.length/3);
    o.visible=pos.length>0;});
  // The halo keeps the contrast ring, the dot carries the state colour.
  activeHalo.material.color.set(SKIN?SKIN.crispLine:(D.isDark?'#0a1221':'#ffffff'));
  needsRender=true;}
function gameInit(){
  // Dot-only microstates ride the globe as constant-screen-size points.
  var free=COUNTRIES.filter(function(c){return polyMap[c.cca3]===undefined;});
  var pos=new Float32Array(free.length*3);
  free.forEach(function(c,i){var v=llToVec(c.lat,c.lng,DOTR);
    pos[i*3]=v.x;pos[i*3+1]=v.y;pos[i*3+2]=v.z;});
  var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  // Contrasting ring under every marker — the 2D globe has always had one, the
  // 3D one never did, and a vermilion speck sitting ON a green continent was
  // simply invisible. Drawn as a second, larger point layer behind the dot.
  var ringCol=SKIN?SKIN.crispLine:(D.isDark?'#0a1221':'#ffffff');
  // Neutral resting colour — the opposite of the ring, so ring + dot always
  // read as a target, and NEVER the selection colour (that one now means
  // "this is the one you picked").
  var restCol=(ringCol==='#ffffff'||ringCol==='#fff')?'#1b2436':'#f4f7fb';
  dotHalo=new THREE.Points(g,new THREE.PointsMaterial({color:new THREE.Color(ringCol),
    size:dotSize()+7,sizeAttenuation:false,transparent:true,opacity:0.95,
    map:dotTexture(),alphaTest:0.4,depthWrite:false}));
  dotHalo.renderOrder=6;globe.add(dotHalo);
  dotsObj=new THREE.Points(g,new THREE.PointsMaterial({color:new THREE.Color(restCol),size:dotSize(),sizeAttenuation:false,transparent:true,opacity:1,map:dotTexture(),alphaTest:0.4,depthWrite:false}));
  dotsObj.renderOrder=7;globe.add(dotsObj);
  // Highlight layer: same markers, 1.8× bigger, per-point state colour.
  activeHalo=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({
    color:new THREE.Color(ringCol),size:dotSize()*1.8+8,sizeAttenuation:false,
    transparent:true,opacity:1,map:dotTexture(),alphaTest:0.4,depthWrite:false,depthTest:false}));
  activeHalo.renderOrder=8;activeHalo.visible=false;globe.add(activeHalo);
  activeDot=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({
    size:dotSize()*1.8,sizeAttenuation:false,vertexColors:true,
    transparent:true,opacity:1,map:dotTexture(),alphaTest:0.4,depthWrite:false,depthTest:false}));
  activeDot.renderOrder=9;activeDot.visible=false;globe.add(activeDot);
  onZoomCb=function(){
    if(dotsObj)dotsObj.material.size=dotSize();
    if(dotHalo)dotHalo.material.size=dotSize()+7;
    if(activeDot)activeDot.material.size=dotSize()*1.8;
    if(activeHalo)activeHalo.material.size=dotSize()*1.8+8;};
  onTapCb=function(x,y){
    if(locked)return;
    var hit=pickAt(x,y);
    if(!hit)return;
    sel=hit;repaintStates();
    postMsg({type:'COUNTRY_SELECTED',cca3:hit});
  };
  onHoverCb=function(x,y){
    if(locked)return;
    var hit=pickAt(x,y);
    if(hit!==hov){hov=hit;document.body.style.cursor=hit?'pointer':'default';repaintStates();}
  };
  repaintStates();
}
window.resetRound=function(){sel=null;hov=null;locked=false;resultMode=false;resultCorrect=null;resultPicked=null;document.body.style.cursor='default';repaintStates();};
// Reveal: straight back to the world view, centred on the answer. Framing the
// answer to its own size (an earlier attempt) came out far too zoomed on small
// countries — what the player needs to learn is WHERE it sits on the globe, not
// a close-up of its outline.
function frameReveal(correct){
  var t=centreMap[correct];
  if(t){rotLon=t.lng;rotLat=Math.max(-60,Math.min(60,t.lat));applyRotation();}
  setZoom(1);
}
window.showResult=function(correct,picked){
  locked=true;hov=null;document.body.style.cursor='default';
  resultMode=true;resultCorrect=correct;resultPicked=picked;
  frameReveal(correct);
  repaintStates();
};`;
  return core(
    {
      threeSrc: opts.threeSrc,
      isDark: opts.isDark,
      pal: opts.pal,
      polygons: opts.polygons,
      maxDpr: opts.maxDpr,
      interactive: true,
      skin: opts.skin,
    },
    gameJs,
  );
}

// ── BORDERS mode (BordersGame) ───────────────────────────────────────────────

export function buildBordersEarthHtml(opts: {
  threeSrc: string;
  isDark: boolean;
  pal: MapPalette;
  polygons: WorldPolygon[];
  coords: Record<string, [number, number]>;
  maxDpr?: number;
  /** Borders wears the skin's ocean/atmosphere only — never its land texture. */
  skin?: GameGlobeSkin | null;
}): string {
  const gameJs = `
var COORDS=${JSON.stringify(opts.coords)};
D.drawBaseLand=false; // anti-cheat: only the countries in play are ever drawn
var GOLD='#c4872a',GOLDF='rgba(196,135,42,0.55)';
var highlights=[],flagSprites=[];
function styleFor(kind){
  if(kind==='start')return{f:PAL.selF,s:PAL.selS,lw:3};
  if(kind==='last')return{f:PAL.hovF,s:PAL.hovS,lw:4};
  if(kind==='target')return{f:GOLDF,s:GOLD,lw:3.4};
  if(kind==='ideal')return{f:'rgba(122,74,255,0.35)',s:'#8a63e8',lw:3};
  return{f:PAL.okF,s:PAL.okS,lw:2.6};}
function toVec(lat,lng){var la=lat*Math.PI/180,lo=lng*Math.PI/180;
  return[Math.cos(la)*Math.cos(lo),Math.cos(la)*Math.sin(lo),Math.sin(la)];}
function highlightVecs(){
  var v=[];
  highlights.forEach(function(h){
    var idx=polyMap[h.id];
    if(idx!==undefined){
      var rings=POLYGONS[idx].r,main=rings[0];
      for(var ri=1;ri<rings.length;ri++)if(rings[ri].length>main.length)main=rings[ri];
      var step=Math.max(1,Math.floor(main.length/40));
      for(var i=0;i<main.length;i+=step)v.push(toVec(main[i][1],main[i][0]));
    }else if(COORDS[h.id]){v.push(toVec(COORDS[h.id][0],COORDS[h.id][1]));}
  });
  return v;}
function frame(){
  var v=highlightVecs();if(!v.length)return;
  var sx=0,sy=0,sz=0;
  v.forEach(function(u){sx+=u[0];sy+=u[1];sz+=u[2];});
  var n=Math.sqrt(sx*sx+sy*sy+sz*sz)||1;
  var ux=sx/n,uy=sy/n,uz=sz/n;
  rotLat=Math.max(-78,Math.min(78,Math.asin(uz)*180/Math.PI));
  rotLon=Math.atan2(uy,ux)*180/Math.PI;
  var vc=toVec(rotLat,rotLon),maxAng=0;
  v.forEach(function(u){
    var dot=Math.max(-1,Math.min(1,u[0]*vc[0]+u[1]*vc[1]+u[2]*vc[2]));
    var ang=Math.acos(dot);if(ang>maxAng)maxAng=ang;});
  var th=Math.max(0.06,Math.min(1.48,maxAng));
  zoom=Math.max(1,Math.min(6,0.8/Math.sin(th)));
  applyRotation();updateCamera();}
// Flag tags: canvas-drawn sprite (flag image + coloured frame), constant screen size.
function makeFlagSprite(url,color){
  var cv=document.createElement('canvas');cv.width=76;cv.height=50;
  var cx2=cv.getContext('2d');
  function paint(img){
    cx2.clearRect(0,0,76,50);
    cx2.fillStyle='rgba(10,12,20,0.5)';
    cx2.beginPath();cx2.roundRect?cx2.roundRect(4,4,68,42,8):cx2.rect(4,4,68,42);cx2.fill();
    if(img){cx2.save();cx2.beginPath();
      cx2.roundRect?cx2.roundRect(4,4,68,42,8):cx2.rect(4,4,68,42);cx2.clip();
      cx2.drawImage(img,4,4,68,42);cx2.restore();}
    cx2.strokeStyle=color;cx2.lineWidth=4;
    cx2.beginPath();cx2.roundRect?cx2.roundRect(4,4,68,42,8):cx2.rect(4,4,68,42);cx2.stroke();}
  paint(null);
  var tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
  var spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,sizeAttenuation:false,depthTest:false}));
  spr.scale.set(0.085,0.056,1);spr.renderOrder=10;
  if(url){var img=new Image();img.crossOrigin='anonymous';
    img.onload=function(){paint(img);tex.needsUpdate=true;needsRender=true;};img.src=url;}
  return spr;}
function rebuildFlags(){
  flagSprites.forEach(function(s){globe.remove(s);s.material.map.dispose();s.material.dispose();});
  flagSprites=[];
  highlights.forEach(function(h){
    var co=COORDS[h.id];if(!co)return;
    var st=styleFor(h.kind);
    var spr=makeFlagSprite(h.flag,st.s);
    spr.position.copy(llToVec(co[0],co[1],1.05));
    globe.add(spr);flagSprites.push(spr);});
  needsRender=true;}
window.setHighlights=function(list,refit){
  highlights=list||[];
  setOverlayStates(highlights.map(function(h){var st=styleFor(h.kind);
    return{id:h.id,fill:st.f,stroke:st.s,lw:st.lw};}));
  rebuildFlags();
  if(refit)frame();
  needsRender=true;};
// ⟲ re-frames on the countries in play rather than only resetting the zoom:
// only they are drawn, so a drag can leave the view on empty ocean.
window.__recenter=function(){frame();needsRender=true;};
function gameInit(){rotLat=20;applyRotation();}`;
  return core(
    {
      threeSrc: opts.threeSrc,
      isDark: opts.isDark,
      pal: opts.pal,
      polygons: opts.polygons,
      maxDpr: opts.maxDpr,
      interactive: true,
      resetAlways: true,
      initial: { rotLat: 20, fit: 0.9 },
      skin: opts.skin,
    },
    gameJs,
  );
}

// ── REGIONS mode (FindRegionGame) ────────────────────────────────────────────

export interface RegionDot {
  id: string;
  lat: number;
  lng: number;
}

/**
 * The subdivisions of ONE country, draped on the planet the player equipped.
 *
 * Same contract as the Canvas-2D region map it stands in for: posts MAP_READY /
 * REGION_SELECTED{id}, exposes window.resetRound() + window.showResult(correct,
 * picked), auto-frames the country and snaps a near miss to the closest region
 * label point. What it adds is the skin: the round is played on the bought globe
 * instead of a flat two-tone disc.
 */
export function buildRegionEarthHtml(opts: {
  threeSrc: string;
  isDark: boolean;
  pal: MapPalette;
  polygons: WorldPolygon[];
  dots: RegionDot[];
  /** Auto-framing from lib/regionView (spherical mean + angular spread). */
  view: { clat: number; clng: number; maxAng: number };
  maxDpr?: number;
  skin?: GameGlobeSkin | null;
}): string {
  const gameJs = `
var DOTS=${JSON.stringify(opts.dots)};
var VIEW=${JSON.stringify({
    clat: +opts.view.clat.toFixed(4),
    clng: +opts.view.clng.toFixed(4),
    maxAng: +opts.view.maxAng.toFixed(4),
  })};
D.drawBaseLand=true;   // the planet keeps its texture: it is the point of the mode
D.regionCoat=true;     // …and the country's regions are drawn on top of it
var sel=null,hov=null,locked=false,resultMode=false,resultCorrect=null,resultPicked=null;
var markDot=null,markHalo=null;
function angDist(la1,lo1,la2,lo2){
  var r=Math.PI/180,s=Math.sin((la2-la1)*r/2),t=Math.sin((lo2-lo1)*r/2);
  return 2*Math.asin(Math.min(1,Math.sqrt(s*s+Math.cos(la1*r)*Math.cos(la2*r)*t*t)))*180/Math.PI;}
var dotMap={};
DOTS.forEach(function(d){dotMap[d.id]=d;});
// Smallest region containing the tap (an enclave beats the region around it),
// then a snap to the nearest label point for the ones that are sub-pixel here.
function pickAt(tx,ty){
  var coords=unproject(tx,ty);
  if(!coords)return null;
  var hit=hitTest(coords);
  if(hit)return hit;
  var best=null,bestD=2.5/zoom+0.6;
  for(var i=0;i<DOTS.length;i++){
    var d=angDist(coords.lat,coords.lng,DOTS[i].lat,DOTS[i].lng);
    if(d<bestD){bestD=d;best=DOTS[i].id;}}
  return best;}
function repaintStates(){
  var list=[];
  if(resultMode){
    if(resultCorrect)list.push({id:resultCorrect,fill:PAL.okF,stroke:PAL.okS,lw:9});
    if(resultPicked&&resultPicked!==resultCorrect)list.push({id:resultPicked,fill:PAL.badF,stroke:PAL.badS,lw:9});
  } else {
    if(hov&&!locked&&hov!==sel)list.push({id:hov,fill:PAL.hovF,stroke:PAL.hovS,lw:8});
    if(sel)list.push({id:sel,fill:PAL.selF,stroke:PAL.selS,lw:10});
  }
  setOverlayStates(list);
  updateMarks();}
// A tiny region can be a couple of pixels wide: the reveal also plants a marker
// on its label point, or the player never sees where the answer was.
function updateMarks(){
  if(!markDot)return;
  var pos=[],col=[];
  if(resultMode){
    [[resultCorrect,PAL.okS],[resultPicked===resultCorrect?null:resultPicked,PAL.badS]].forEach(function(e){
      var d=e[0]?dotMap[e[0]]:null;if(!d)return;
      var v=llToVec(d.lat,d.lng,DOTR+0.001);pos.push(v.x,v.y,v.z);
      var c=new THREE.Color(e[1]);col.push(c.r,c.g,c.b);});}
  [markHalo,markDot].forEach(function(o){
    o.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pos),3));
    o.geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(col),3));
    o.geometry.setDrawRange(0,pos.length/3);
    o.visible=pos.length>0;});
  needsRender=true;}
// Fit the country: an orthographic point at angle θ lands at R·sin(θ) from the
// centre, so size the globe until the farthest region sits at ~84% of the disc.
var atFit=false;
// Where a point ang radians off the view centre lands, in px from the centre,
// at a given zoom. The flat maps could invert this in closed form (orthographic:
// R·sin θ); a perspective camera cannot — it magnifies the centre far more than
// the limb, which is why reusing the 2D formula here framed France so tight that
// Corsica fell off the screen. Mirrors updateCamera exactly, so a binary search
// on it lands on the real fit.
function projRadius(ang,z){
  var want=(baseR*z)/(H/2);
  var a=Math.atan(Math.tan(FOVY/2)*want),fov=FOVY;
  if(a>A_MAX){a=A_MAX;fov=2*Math.atan(Math.tan(A_MAX)/Math.max(0.001,want));}
  var d=1/Math.sin(Math.max(0.03,a));
  return (H/2)*(Math.sin(ang)/Math.max(0.001,d-Math.cos(ang)))/Math.tan(fov/2);}
function frameCountry(){
  rotLon=VIEW.clng;rotLat=Math.max(-85,Math.min(85,VIEW.clat));
  var ang=Math.min(80,VIEW.maxAng*1.12+1.5)*Math.PI/180;
  // …so the farthest region sits at ~84% of the half-screen, like the 2D map.
  var target=0.84*Math.min(W,H)/2,lo=0.2,hi=400;
  for(var i=0;i<44;i++){var mid=(lo+hi)/2;
    if(projRadius(ang,mid)>target)hi=mid;else lo=mid;}
  var z=(lo+hi)/2;
  ZMAX=Math.max(16,z*6);ZMIN=Math.min(0.9,z*0.4);
  applyRotation();setZoom(z);atFit=true;}
// The globe box shrinks when the result banner opens (and grows back on the next
// round). Re-fit rather than keep the pixel size, or half the country is simply
// cropped away at the very moment the answer is revealed. A player who zoomed in
// themselves keeps their view.
window.addEventListener('resize',function(){if(atFit)frameCountry();});
function gameInit(){
  var mk=function(size,vc){
    var m=new THREE.PointsMaterial({size:size,sizeAttenuation:false,transparent:true,
      opacity:1,map:dotTexture(),alphaTest:0.4,depthWrite:false,depthTest:false});
    if(vc)m.vertexColors=true;else m.color=new THREE.Color(SKIN?SKIN.crispLine:(D.isDark?'#0a1221':'#ffffff'));
    var o=new THREE.Points(new THREE.BufferGeometry(),m);
    o.visible=false;globe.add(o);return o;};
  markHalo=mk(22,false);markHalo.renderOrder=8;
  markDot=mk(14,true);markDot.renderOrder=9;
  onZoomCb=function(){atFit=false;};
  onTapCb=function(x,y){
    if(locked)return;
    var hit=pickAt(x,y);
    if(!hit)return;
    sel=hit;repaintStates();
    postMsg({type:'REGION_SELECTED',id:hit});};
  onHoverCb=function(x,y){
    if(locked)return;
    var hit=pickAt(x,y);
    if(hit!==hov){hov=hit;document.body.style.cursor=hit?'pointer':'default';repaintStates();}};
  frameCountry();repaintStates();
  // The host screen listens for MAP_READY (shared with the 2D map it replaces).
  postMsg({type:'MAP_READY'});}
// ⟲ goes back to the country, not to world zoom: the world is not the board here.
window.__recenter=function(){frameCountry();};
window.resetRound=function(){
  sel=null;hov=null;locked=false;resultMode=false;resultCorrect=null;resultPicked=null;
  document.body.style.cursor='default';repaintStates();};
window.showResult=function(correct,picked){
  locked=true;hov=null;document.body.style.cursor='default';
  resultMode=true;resultCorrect=correct;resultPicked=picked;
  // Straight back to the whole country: after hunting a region at 30x, a reveal
  // left at that zoom shows nothing but the answer's own interior.
  frameCountry();
  repaintStates();};`;
  return core(
    {
      threeSrc: opts.threeSrc,
      isDark: opts.isDark,
      pal: opts.pal,
      polygons: opts.polygons,
      maxDpr: opts.maxDpr,
      interactive: true,
      resetAlways: true,
      initial: { rotLat: opts.view.clat, rotLon: opts.view.clng, fit: 0.9 },
      overlayBox: regionOverlayBox(opts.view, opts.polygons),
      regionCoat: true,
      skin: opts.skin,
    },
    gameJs,
  );
}

/**
 * The lat/lng window the region overlay is confined to: the polygons' own
 * bounding box plus a small margin. Tight on purpose — every degree of slack is
 * canvas resolution taken away from the country. Longitudes are unwrapped around
 * the framed centre first, so a country straddling ±180° still yields one box.
 *
 * Null — i.e. the plain full-sphere overlay — as soon as the box would wrap the
 * globe or reach a pole, where a sphere patch buys nothing.
 */
export function regionOverlayBox(
  view: { clat: number; clng: number },
  polygons: WorldPolygon[],
): OverlayBox | null {
  let lat0 = 90, lat1 = -90, lng0 = 180, lng1 = -180;
  let seen = false;
  for (const p of polygons) {
    for (const ring of p.r) {
      for (const [lngRaw, lat] of ring) {
        let lng = lngRaw;
        while (lng - view.clng > 180) lng -= 360;
        while (view.clng - lng > 180) lng += 360;
        if (lat < lat0) lat0 = lat;
        if (lat > lat1) lat1 = lat;
        if (lng < lng0) lng0 = lng;
        if (lng > lng1) lng1 = lng;
        seen = true;
      }
    }
  }
  if (!seen) return null;
  const mLat = Math.max(0.25, (lat1 - lat0) * 0.06);
  const mLng = Math.max(0.25, (lng1 - lng0) * 0.06);
  lat0 -= mLat; lat1 += mLat; lng0 -= mLng; lng1 += mLng;
  if (lat1 - lat0 >= 140 || lng1 - lng0 >= 170) return null;
  if (lat0 <= -89 || lat1 >= 89) return null;
  return { lat0, lat1, lng0, lng1 };
}

// ── MENU mode (decorative hero globe) ────────────────────────────────────────

export function buildMenuEarthHtml(opts: {
  threeSrc: string;
  isDark: boolean;
  pal: MapPalette;
  polygons: WorldPolygon[];
  maxDpr?: number;
  skin?: GameGlobeSkin | null;
}): string {
  return core(
    {
      threeSrc: opts.threeSrc,
      isDark: opts.isDark,
      pal: opts.pal,
      polygons: opts.polygons,
      maxDpr: opts.maxDpr,
      interactive: false,
      spin: true,
      transparentBg: true,
      initial: { rotLat: 18, rotLon: 10, zoom: 1, fit: 0.98 },
      skin: opts.skin,
    },
    'D.drawBaseLand=true;function gameInit(){}',
  );
}
