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
  /** Transparent page background (decorative overlays composited over app UI). */
  transparentBg?: boolean;
}

function core(opts: CoreOptions, gameJs: string): string {
  const payload = {
    pal: opts.pal,
    isDark: opts.isDark,
    look: 'cartoon',
    polys: opts.polygons ?? [],
    cities: CITY_LIGHTS,
    maxDpr: opts.maxDpr ?? 2,
    initial: { rotLat: 0, rotLon: 0, zoom: 1, fit: 0.88, ...(opts.initial ?? {}) },
    interactive: opts.interactive !== false,
    spin: !!opts.spin,
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
#zc #zr{font-size:16px;display:none;}
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
function projectLL(lat,lng){
  _pv.copy(llToVec(lat,lng,1));globe.localToWorld(_pv);
  var vis=_pv.clone().normalize().dot(camera.position.clone().normalize())>0.06;
  _pv.project(camera);
  return{sx:(_pv.x*0.5+0.5)*W,sy:(1-(_pv.y*0.5+0.5))*H,d:vis?1:0,vis:vis};}

// ── Overlay: country polygons on an equirect canvas draped over the sphere ──
var OW=2048,OH=1024;
var overlayCv=document.createElement('canvas');overlayCv.width=OW;overlayCv.height=OH;
var overlayCtx=overlayCv.getContext('2d');
var overlayTex=null;
function unwrapRing(ring){
  var out=[],prev=null;
  for(var i=0;i<ring.length;i++){var lng=ring[i][0];
    if(prev!==null){while(lng-prev>180)lng-=360;while(prev-lng>180)lng+=360;}
    out.push([lng,ring[i][1]]);prev=lng;}
  return out;}
function traceRings(ctx,rings,off){
  for(var ri=0;ri<rings.length;ri++){var ring=unwrapRing(rings[ri]);
    for(var i=0;i<ring.length;i++){
      var x=(ring[i][0]+180+off)/360*OW,y=(90-ring[i][1])/180*OH;
      i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    ctx.closePath();}}
function drawPoly(rings,fill,stroke,lw){
  [-360,0,360].forEach(function(off){
    overlayCtx.beginPath();traceRings(overlayCtx,rings,off);
    if(fill){overlayCtx.fillStyle=fill;overlayCtx.fill();}
    if(stroke){overlayCtx.strokeStyle=stroke;overlayCtx.lineWidth=lw||2;overlayCtx.stroke();}});}
// Cartoon coat palette — vivid, sticker-like (independent from the game PAL,
// which keeps driving the hover/selected/correct/wrong state colours).
var CART=D.isDark
  ?{land:'#274d68',halo:'rgba(127,216,232,0.30)',line:'#7fd8e8',grat:'rgba(160,200,255,0.12)',city:'#ffd27a'}
  :{land:'#7cc45e',halo:'rgba(255,255,255,0.60)',line:'#2e5b33',grat:'rgba(255,255,255,0.22)',city:null};
// states: [{id,fill,stroke,lw}] — mode-specific paint on top of the base coat.
var overlayStates=[];
function paintOverlay(){
  overlayCtx.clearRect(0,0,OW,OH);
  if(!photoMode){
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
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(40,W/H,0.01,60);
  var sun=new THREE.DirectionalLight(0xfff2dd,D.isDark?1.35:2.2);
  sun.position.set(-1.6,1.0,3.0);scene.add(sun);
  scene.add(new THREE.AmbientLight(D.isDark?0x2a3350:0x9fb3cd,D.isDark?1.05:1.15));
  var rim=new THREE.DirectionalLight(D.isDark?0x7a92ff:0xcfe0ff,0.7);
  rim.position.set(2.4,0.6,-2.0);scene.add(rim);

  pivot=new THREE.Group();scene.add(pivot);
  globe=new THREE.Group();pivot.add(globe);
  // Cel shading: a 3-step gradient map quantises the toon lighting into bands.
  var gcv=document.createElement('canvas');gcv.width=3;gcv.height=1;
  var gcx=gcv.getContext('2d');
  ['#7a7a7a','#c4c4c4','#ffffff'].forEach(function(g,i){gcx.fillStyle=g;gcx.fillRect(i,0,1,1);});
  var gradientMap=new THREE.CanvasTexture(gcv);
  gradientMap.minFilter=THREE.NearestFilter;gradientMap.magFilter=THREE.NearestFilter;
  globeMesh=new THREE.Mesh(new THREE.SphereGeometry(1,96,96),
    new THREE.MeshToonMaterial({color:new THREE.Color(D.isDark?'#153564':'#2f8ad8'),gradientMap:gradientMap}));
  globe.add(globeMesh);
  overlayTex=new THREE.CanvasTexture(overlayCv);
  overlayTex.colorSpace=THREE.SRGBColorSpace;
  overlayTex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
  overlayMesh=new THREE.Mesh(new THREE.SphereGeometry(1.002,96,96),
    new THREE.MeshBasicMaterial({map:overlayTex,transparent:true,depthWrite:false}));
  globe.add(overlayMesh);
  cloudMesh=new THREE.Mesh(new THREE.SphereGeometry(1.016,64,64),
    new THREE.MeshBasicMaterial({transparent:true,opacity:0.9,depthWrite:false}));
  cloudMesh.visible=false;globe.add(cloudMesh);
  // Clouds are decorative-only (menu): on the gameplay globes they would hide
  // the very country the player must find.
  if(D.look==='cartoon'&&!D.isDark&&D.spin){
    cloudMesh.material.map=cartoonClouds();cloudMesh.material.needsUpdate=true;
    cloudMesh.material.opacity=0.8;cloudMesh.visible=true;}
  atmoMesh=new THREE.Mesh(new THREE.SphereGeometry(1.10,64,64),
    new THREE.ShaderMaterial({
      uniforms:{c:{value:new THREE.Color(D.isDark?'#4a6aff':'#7fb8ff')},p:{value:3.6},s:{value:D.isDark?1.1:0.6}},
      vertexShader:'varying vec3 vN;varying vec3 vP;void main(){vN=normalize(normalMatrix*normal);vP=normalize((modelViewMatrix*vec4(position,1.)).xyz);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform vec3 c;uniform float p;uniform float s;varying vec3 vN;varying vec3 vP;void main(){float f=pow(1.0-abs(dot(vN,-vP)),p)*s;gl_FragColor=vec4(c,1.0)*f;}',
      blending:THREE.AdditiveBlending,side:THREE.BackSide,transparent:true,depthWrite:false}));
  scene.add(atmoMesh);
  if(D.isDark){
    var n=420,pos=new Float32Array(n*3);
    for(var i=0;i<n;i++){var u=Math.random()*2-1,a=Math.random()*Math.PI*2,rr=18;
      var sq=Math.sqrt(1-u*u);
      pos[i*3]=rr*sq*Math.cos(a);pos[i*3+1]=rr*u;pos[i*3+2]=rr*sq*Math.sin(a);}
    var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xbfd0ff,size:1.6,sizeAttenuation:false,transparent:true,opacity:0.8})));
  }
  applyRotation();updateCamera();paintOverlay();
}
function applyRotation(){
  pivot.rotation.x=rotLat*Math.PI/180;
  globe.rotation.y=(-90-rotLon)*Math.PI/180;
  needsRender=true;}
function updateCamera(){
  var t=Math.tan(FOVY/2)*(baseR*zoom)/(H/2);
  var a=Math.atan(t);
  camera.position.set(0,0,1/Math.sin(Math.max(0.03,Math.min(1.52,a))));
  camera.lookAt(0,0,0);
  camera.updateProjectionMatrix();
  needsRender=true;}

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
  if(zr)zr.style.display=zoom>1.05?'flex':'none';
  if(onZoomCb)onZoomCb();}
if(D.interactive){
  var pinchGeo=null;
  document.addEventListener('touchstart',function(e){
    if(e.touches.length===2){pinchD=Math.hypot(e.touches[1].clientX-e.touches[0].clientX,e.touches[1].clientY-e.touches[0].clientY);pinchZ=zoom;drag=null;
      syncMatrices();pinchGeo=unproject((e.touches[0].clientX+e.touches[1].clientX)/2,(e.touches[0].clientY+e.touches[1].clientY)/2);}
    else onStart(e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
  document.addEventListener('touchmove',function(e){e.preventDefault();
    if(e.touches.length===2&&pinchD!==null){
      var d=Math.hypot(e.touches[1].clientX-e.touches[0].clientX,e.touches[1].clientY-e.touches[0].clientY);
      // Anchoring the start midpoint to the live one gives two-finger pan for free.
      setZoom(pinchZ*d/pinchD,(e.touches[0].clientX+e.touches[1].clientX)/2,(e.touches[0].clientY+e.touches[1].clientY)/2,pinchGeo);}
    else if(e.touches.length===1)onMoveDrag(e.touches[0].clientX,e.touches[0].clientY);},{passive:false});
  document.addEventListener('touchend',function(e){
    if(e.touches.length<2){pinchD=null;pinchGeo=null;}
    if(e.touches.length===1)drag={x:e.touches[0].clientX,y:e.touches[0].clientY,lon:rotLon,lat:rotLat,moved:true};
    if(e.touches.length===0)onEnd(e.changedTouches[0].clientX,e.changedTouches[0].clientY);},{passive:true});
  document.addEventListener('mousedown',function(e){onStart(e.clientX,e.clientY);});
  document.addEventListener('mousemove',function(e){
    if(drag){onMoveDrag(e.clientX,e.clientY);return;}
    if(onHoverCb)onHoverCb(e.clientX,e.clientY);});
  document.addEventListener('mouseup',function(e){onEnd(e.clientX,e.clientY);});
  document.addEventListener('wheel',function(e){e.preventDefault();setZoom(zoom*(e.deltaY>0?0.9:1.1),e.clientX,e.clientY);},{passive:false});
  var zin=document.getElementById('zin');
  if(zin){
    // 1.7× per press: two taps clear DOT_PICK_ZOOM in find mode.
    zin.addEventListener('click',function(){setZoom(zoom*1.7);});
    document.getElementById('zout').addEventListener('click',function(){setZoom(zoom/1.7);});
    document.getElementById('zr').addEventListener('click',function(){setZoom(1);});
  }
}

// ── Loop ─────────────────────────────────────────────────────────────────────
var frameCbs=[];
function loop(){
  requestAnimationFrame(loop);
  if(D.spin){rotLon+=0.05;applyRotation();}
  if(cloudMesh&&cloudMesh.visible){cloudMesh.rotation.y+=0.00035;needsRender=true;}
  for(var i=0;i<frameCbs.length;i++)frameCbs[i]();
  if(needsRender){renderer.render(scene,camera);needsRender=false;}}

function setup(){
  W=window.innerWidth;H=window.innerHeight;
  if(!W||!H){requestAnimationFrame(setup);return;}
  baseR=Math.min(W,H)/2*D.initial.fit;
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
}): string {
  const gameJs = `
var COUNTRIES=${JSON.stringify(opts.dots)};
D.drawBaseLand=true;
var sel=null,hov=null,locked=false,resultMode=false,resultCorrect=null,resultPicked=null;
var dotsObj=null,hiDot=null;
// Dot microstates grow slowly with zoom: zooming in is the player's tool for
// reaching them, so they must become a bigger target.
function dotSize(){return 9*Math.pow(zoom,0.25);}
// Dot countries only outrank the polygon they sit on ONCE ZOOMED IN: at world
// zoom the marker spans ~250 km, so giving it priority handed the Riviera to
// Monaco and half the Pyrenees to Andorra. Below this, behaviour is exactly
// what shipped before (polygon first, 26 px ocean snap for the islands).
var DOT_PICK_ZOOM=2.6;
// Tap footprint of a dot country, in px: the on-screen radius of its REAL area
// (capped, since a coarse host polygon must keep its middle), floored at the
// drawn marker so a 0.5 km² Vatican still gets a finger-sized target.
function dotFootprint(c){
  return Math.max(dotSize()/2+1,(baseR*zoom)*Math.min(35,Math.sqrt((c.area||0)/Math.PI))/6371);}
function nearestDot(tx,ty,maxD){
  var best=null,bestD=maxD;
  for(var i=0;i<COUNTRIES.length;i++){
    var c=COUNTRIES[i];
    if(polyMap[c.cca3]!==undefined)continue;
    var p=projectLL(c.lat,c.lng);if(!p.vis)continue;
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
    var p=projectLL(c.lat,c.lng);if(!p.vis)continue;
    var d=Math.hypot(p.sx-tx,p.sy-ty),rel=d/dotFootprint(c);
    if(rel<bestRel){bestRel=rel;best=c;bestD=d;}}
  return best?{c:best,d:bestD}:null;}
var centreMap={};
COUNTRIES.forEach(function(c){centreMap[c.cca3]=c;});
// Screen distance from a tap to a country's own centre, or Infinity.
function centreDist(cca3,tx,ty){
  var c=centreMap[cca3];if(!c)return Infinity;
  var p=projectLL(c.lat,c.lng);if(!p.vis)return Infinity;
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
function dotColorState(){
  if(resultMode){
    if(resultCorrect&&polyMap[resultCorrect]===undefined)return{id:resultCorrect,color:PAL.okS};
    if(resultPicked&&resultPicked!==resultCorrect&&polyMap[resultPicked]===undefined)return{id:resultPicked,color:PAL.badS};
  } else if(sel&&polyMap[sel]===undefined)return{id:sel,color:PAL.selS};
  return null;}
function updateHiDot(){
  if(!hiDot)return;
  var st=dotColorState();
  if(!st){hiDot.visible=false;needsRender=true;return;}
  var c=null;
  for(var i=0;i<COUNTRIES.length;i++)if(COUNTRIES[i].cca3===st.id){c=COUNTRIES[i];break;}
  if(!c){hiDot.visible=false;return;}
  var v=llToVec(c.lat,c.lng,1.004);
  hiDot.position.copy(v);hiDot.material.color=new THREE.Color(st.color);
  hiDot.visible=true;needsRender=true;}
function gameInit(){
  // Dot-only microstates ride the globe as constant-screen-size points.
  var free=COUNTRIES.filter(function(c){return polyMap[c.cca3]===undefined;});
  var pos=new Float32Array(free.length*3);
  free.forEach(function(c,i){var v=llToVec(c.lat,c.lng,1.004);
    pos[i*3]=v.x;pos[i*3+1]=v.y;pos[i*3+2]=v.z;});
  var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  dotsObj=new THREE.Points(g,new THREE.PointsMaterial({color:new THREE.Color(PAL.selS),size:dotSize(),sizeAttenuation:false,transparent:true,opacity:0.9,map:dotTexture(),alphaTest:0.4}));
  globe.add(dotsObj);
  hiDot=new THREE.Mesh(new THREE.SphereGeometry(0.014,12,12),new THREE.MeshBasicMaterial({color:0xffffff}));
  hiDot.visible=false;globe.add(hiDot);
  onZoomCb=function(){if(dotsObj)dotsObj.material.size=dotSize();};
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
window.showResult=function(correct,picked){
  locked=true;hov=null;document.body.style.cursor='default';
  resultMode=true;resultCorrect=correct;resultPicked=picked;
  var t=null;
  for(var i=0;i<COUNTRIES.length;i++)if(COUNTRIES[i].cca3===correct){t=COUNTRIES[i];break;}
  if(t){rotLon=t.lng;rotLat=Math.max(-60,Math.min(60,t.lat));applyRotation();}
  // Cap the reveal zoom so the answer keeps its surrounding context.
  if(zoom>6)setZoom(6);
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
function gameInit(){rotLat=20;applyRotation();}`;
  return core(
    {
      threeSrc: opts.threeSrc,
      isDark: opts.isDark,
      pal: opts.pal,
      polygons: opts.polygons,
      maxDpr: opts.maxDpr,
      interactive: true,
      initial: { rotLat: 20, fit: 0.9 },
    },
    gameJs,
  );
}

// ── MENU mode (decorative hero globe) ────────────────────────────────────────

export function buildMenuEarthHtml(opts: {
  threeSrc: string;
  isDark: boolean;
  pal: MapPalette;
  polygons: WorldPolygon[];
  maxDpr?: number;
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
    },
    'D.drawBaseLand=true;function gameInit(){}',
  );
}
