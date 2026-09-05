import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import GlobeWebView from '../components/GlobeWebView';
import type { WebViewMessageEvent } from '../components/GlobeWebView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Check, ChevronRight, Home, Wifi } from 'lucide-react-native';
import { AtlasGlobe, AtlasCheck, AtlasCross } from '../components/AtlasIcons';
import type { User } from '@supabase/supabase-js';

import type { GameMode, Match } from '../types';
import { getColors, PALETTE } from '../theme/colors';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getMapPalette, type MapPalette } from '../theme/mapPalette';
import { buildFindEarthHtml } from '../lib/globe3d/buildEarthHtml';
import { skinMapPalette, useGameGlobeSkin } from '../lib/globeSkin';
import { GlobePickerModal } from '../components/GlobePickerModal';
import { FONTS } from '../theme/typography';
import { getFlagUrl, prefetchFlags } from '../lib/flags';
import { createSeededRng } from '../lib/rng';
import { normalizeRoundScore } from '../lib/score';
import { tr } from '../i18n';
import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import rawCountriesStats from '../../assets/countries_stats.json';
import { filterByContinent, type ContinentId } from '../data/continents';
import { saveSoloScore } from '../lib/soloResult';
import { useSoloCoins } from '../lib/useSoloCoins';
import { SoloCoinReward } from '../components/SoloCoinReward';
import { SoloEndActions } from '../components/SoloEndActions';
import { PlayerGlobe } from '../components/PlayerGlobe';
import { useMyGameGlobe } from '../lib/myGlobe';
import { OffLeaderboardNotice } from '../components/OffLeaderboardNotice';
import { RunRecap, type RecapEntry } from '../components/RunRecap';
import { orderByReview, recordRun } from '../lib/reviewPool';
import { countryFactName } from '../lib/countryFacts';
import rawWorldPolygons from '../../assets/world_polygons.json';
import { a11yButton, a11yHidden, announce, a11yImage, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';
import { TopInsetBar } from '../components/TopInsetBar';
import { countryName } from '../lib/geoNames';

const DEFAULT_ROUNDS = 5;

interface CountryStat {
  name: string;
  name_en: string;
  cca3: string;
  lat: number;
  lng: number;
  region: string;
  /** km² — sizes the tap footprint of the dot-rendered microstates. */
  area: number;
}

interface FindCountryGameProps {
  setGameMode: (mode: GameMode) => void;
  user?: User | null;
  matchData?: Match | null;
  onRoundComplete?: (score: number) => void;
  /** Daily challenge: deterministic seed for today's puzzle (overrides random). */
  dailySeed?: number;
  /** Daily challenge: fired once at the end with the score + emoji share grid. */
  onDailyComplete?: (score: number, grid?: string) => void;
  /** Daily challenge: replaces "Play again" with "Share" and skips score saving. */
  isDaily?: boolean;
  /** Daily challenge: invoked by the "Share" button on the finished screen. */
  onShare?: () => void;
  /** Daily challenge: reports the live score so a mid-game quit can lock it in. */
  onDailyScoreChange?: (score: number) => void;
    /**
   * Entraînement: no mistake ends the run, every answer is explained, and
   * nothing is recorded (no coins, no leaderboard).
   */
  training?: boolean;
/** Solo continent scope: narrows the answer pool. Null/absent = worldwide. */
  scope?: ContinentId | null;
  /** Review run: countries to ask about first (see lib/reviewPool). */
  reviewIds?: string[] | null;
  /**
   * Opens the shop from the globe picker. Only wired in free solo play — it
   * navigates away, which ends the round — so a daily / online / parcours host
   * simply leaves it out and the entry does not appear.
   */
  onOpenShop?: () => void;
}

type Phase = 'loading' | 'playing' | 'result' | 'finished';

interface GlobeMessage {
  type: 'GLOBE_READY' | 'COUNTRY_SELECTED' | 'GLOBE_ERROR';
  cca3?: string;
  msg?: string;
}

function sampleRounds(all: CountryStat[], n: number, seed?: number): CountryStat[] {
  const rng = seed != null ? createSeededRng(seed) : Math.random;
  const arr = [...all];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

interface WorldPolygon {
  id: string;
  r: number[][][];
}

/**
 * Legacy Canvas-2D globe (the fallback when `globe_3d` is off / reduce-motion).
 * Exported so the "Globes en jeu" screen can preview the exact renderer a real
 * game would use instead of faking it with the 3D one.
 *
 * `pal` carries the shop-globe skin: a canvas orthographic globe can't sample an
 * equirect texture, so here a skin is only a palette (see skinMapPalette).
 */
export function buildGlobeHtml(
  countries: CountryStat[],
  isDark: boolean,
  polygons: WorldPolygon[],
  pal: MapPalette = getMapPalette(isDark),
): string {
  const bg = pal.bg;
  // `area` (km²) sizes each dot's tap footprint — see dotFootprint() below.
  const dots = JSON.stringify(
    countries.map((c) => ({ cca3: c.cca3, lat: c.lat, lng: c.lng, area: c.area })),
  );
  const polys = JSON.stringify(polygons);
  // Zoom-control chrome — readable over both map themes without a new palette slot.
  const uiBg = isDark ? 'rgba(19,36,63,0.88)' : 'rgba(255,255,255,0.9)';
  const uiFg = isDark ? '#e8dcc0' : '#2c1810';
  const dotRing = isDark ? 'rgba(10,18,33,0.9)' : 'rgba(255,255,255,0.95)';

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no,maximum-scale=1">
<style>
*{margin:0;padding:0;}
html,body{width:100%;height:100%;overflow:hidden;background:${bg};}
canvas{display:block;position:absolute;top:0;left:0;touch-action:none;}
#zc{position:fixed;right:12px;bottom:12px;display:flex;flex-direction:column;gap:8px;z-index:5;}
#zc button{width:44px;height:44px;padding:0;border-radius:12px;border:1px solid ${pal.rim};
background:${uiBg};color:${uiFg};font-family:-apple-system,system-ui,sans-serif;font-size:22px;
font-weight:600;line-height:1;display:flex;align-items:center;justify-content:center;
touch-action:manipulation;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;}
#zc button:active{opacity:0.55;}
/* #zc #zr, not #zr: "#zc button" above is more specific and would win. */
#zc #zr{font-size:16px;display:none;}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="zc">
<button id="zin" type="button">+</button>
<button id="zout" type="button">−</button>
<button id="zr" type="button">⟲</button>
</div>
<script>
var COUNTRIES=${dots};
var POLYGONS=${polys};
var PAL=${JSON.stringify(pal)};
var DOTRING='${dotRing}';
var dpr=window.devicePixelRatio||1;
var canvas=document.getElementById('c');
var ctx=canvas.getContext('2d');
var W,H,cx,cy,R,Rb;
var rotLon=0,rotLat=0,zoom=1;
var ZMIN=0.9,ZMAX=24;
var sel=null,locked=false,hov=null;
var resultMode=false,resultCorrect=null,resultPicked=null;
// Dot-rendered microstates grow slowly with zoom: zooming in is the player's
// tool for reaching them, so they must become a bigger target, not stay 4 px.
function dotRadius(){return 4*Math.pow(zoom,0.25);}
// Dot countries only outrank the polygon they sit on ONCE ZOOMED IN: at world
// zoom the 4 px marker spans ~250 km, so giving it priority handed the Riviera
// to Monaco and half the Pyrenees to Andorra. Below this, behaviour is exactly
// what shipped before (polygon first, 26 px ocean snap for the islands).
var DOT_PICK_ZOOM=2.6;
// Tap footprint of a dot country, in px: the on-screen radius of its REAL area
// (capped, since a coarse host polygon must keep its middle), floored at the
// drawn marker so a 0.5 km² Vatican still gets a finger-sized target.
function dotFootprint(c){
  return Math.max(dotRadius()+1,R*Math.min(35,Math.sqrt((c.area||0)/Math.PI))/6371);
}

function postMsg(obj){
  var j=JSON.stringify(obj);
  if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(j);
  else if(window.parent!==window)window.parent.postMessage(j,'*');
}

function project(lat,lng){
  var phi=lat*Math.PI/180,lam=lng*Math.PI/180;
  var cLat=rotLat*Math.PI/180,cLon=rotLon*Math.PI/180;
  var dLon=lam-cLon;
  var d=Math.sin(cLat)*Math.sin(phi)+Math.cos(cLat)*Math.cos(phi)*Math.cos(dLon);
  if(d<0)return null;
  var x=Math.cos(phi)*Math.sin(dLon);
  var y=Math.cos(cLat)*Math.sin(phi)-Math.sin(cLat)*Math.cos(phi)*Math.cos(dLon);
  return{sx:cx+R*x,sy:cy-R*y,d:d};
}

function unproject(sx,sy){
  var x=(sx-cx)/R,y=(cy-sy)/R,r2=x*x+y*y;
  if(r2>1)return null;
  var c=Math.sqrt(1-r2),cLat=rotLat*Math.PI/180,cLon=rotLon*Math.PI/180;
  var lat=Math.asin(c*Math.sin(cLat)+y*Math.cos(cLat));
  var lon=cLon+Math.atan2(x,c*Math.cos(cLat)-y*Math.sin(cLat));
  var lng=lon*180/Math.PI;
  lng=((lng+180)%360+360)%360-180; // pan accumulates rotLon unbounded; wrap to [-180,180]
  return{lat:lat*180/Math.PI,lng:lng};
}

function angDist(la1,lo1,la2,lo2){
  var r=Math.PI/180,s=Math.sin((la2-la1)*r/2),t=Math.sin((lo2-lo1)*r/2);
  return 2*Math.asin(Math.sqrt(s*s+Math.cos(la1*r)*Math.cos(la2*r)*t*t))*180/Math.PI;
}

function pointInRing(lx,ly,ring){
  var inside=false;
  for(var i=0,j=ring.length-1;i<ring.length;j=i++){
    var xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    if(((yi>ly)!=(yj>ly))&&lx<(xj-xi)*(ly-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}

function pathPolygon(rings){
  ctx.beginPath();
  for(var ri=0;ri<rings.length;ri++){
    var ring=rings[ri],down=false;
    for(var i=0;i<ring.length;i++){
      var p=project(ring[i][1],ring[i][0]);
      if(!p){down=false;continue;}
      if(!down){ctx.moveTo(p.sx,p.sy);down=true;}else ctx.lineTo(p.sx,p.sy);
    }
  }
}

function ringArea(ring){
  var a=0;
  for(var i=0,j=ring.length-1;i<ring.length;j=i++){
    a+=(ring[j][0]+ring[i][0])*(ring[j][1]-ring[i][1]);
  }
  return Math.abs(a/2);
}
var polyMap={},polyArea={};
POLYGONS.forEach(function(p,i){
  polyMap[p.id]=i;
  var area=0;
  for(var ri=0;ri<p.r.length;ri++)area+=ringArea(p.r[ri]);
  polyArea[p.id]=area;
});

// Returns the SMALLEST-area polygon containing the point, so enclaves/exclaves
// (Lesotho inside South Africa, San Marino/Vatican inside Italy) win over the
// big country whose outer ring also covers them (holes are dropped in the data).
function hitTest(coords){
  var best=null,bestA=Infinity;
  for(var pi=0;pi<POLYGONS.length;pi++){
    var poly=POLYGONS[pi],inside=false;
    for(var ri=0;ri<poly.r.length&&!inside;ri++){
      if(pointInRing(coords.lng,coords.lat,poly.r[ri]))inside=true;
    }
    if(inside&&polyArea[poly.id]<bestA){bestA=polyArea[poly.id];best=poly.id;}
  }
  return best;
}

function drawGlobe(resultMode,correct,picked){
  ctx.clearRect(0,0,W,H);
  var g=ctx.createRadialGradient(cx-R*0.2,cy-R*0.2,R*0.05,cx,cy,R);
  g.addColorStop(0,PAL.ocean0);g.addColorStop(1,PAL.ocean1);
  ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();

  ctx.save();ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.clip();

  ctx.strokeStyle=PAL.grat;ctx.lineWidth=0.5;
  var gs=zoom>6?1:(zoom>2?2:3); // finer sampling when zoomed, else 3° stays cheap
  for(var la=-60;la<=60;la+=30){
    var f1=true;
    for(var lo=-180;lo<=180;lo+=gs){
      var p=project(la,lo);if(!p){f1=true;continue;}
      if(f1){ctx.beginPath();ctx.moveTo(p.sx,p.sy);f1=false;}else ctx.lineTo(p.sx,p.sy);
    }ctx.stroke();
  }
  for(var lo2=-180;lo2<180;lo2+=30){
    var f2=true;
    for(var la2=-88;la2<=88;la2+=gs){
      var p2=project(la2,lo2);if(!p2){f2=true;continue;}
      if(f2){ctx.beginPath();ctx.moveTo(p2.sx,p2.sy);f2=false;}else ctx.lineTo(p2.sx,p2.sy);
    }ctx.stroke();
  }

  for(var pi=0;pi<POLYGONS.length;pi++){
    var poly=POLYGONS[pi],id=poly.id,fill,stroke,lw;
    if(resultMode){
      if(id===correct){fill=PAL.okF;stroke=PAL.okS;lw=1.2;}
      else if(id===picked&&id!==correct){fill=PAL.badF;stroke=PAL.badS;lw=1.2;}
      else{fill=PAL.landF;stroke=PAL.landS;lw=0.6;}
    }else{
      if(id===sel){fill=PAL.selF;stroke=PAL.selS;lw=1.5;}
      else if(!locked&&id===hov){fill=PAL.hovF;stroke=PAL.hovS;lw=2.2;}
      else{fill=PAL.landF;stroke=PAL.landS;lw=0.6;}
    }
    pathPolygon(poly.r);
    ctx.fillStyle=fill;ctx.fill();
    ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();
  }

  var dr=dotRadius();
  COUNTRIES.forEach(function(c){
    if(polyMap[c.cca3]!==undefined)return;
    var p=project(c.lat,c.lng);if(!p)return;
    var alpha=0.4+p.d*0.6,dotR=dr,color,glow=false;
    if(resultMode){
      if(c.cca3===correct){dotR=dr*2.2;color=PAL.okS;glow=true;}
      else if(c.cca3===picked&&c.cca3!==correct){dotR=dr*2.2;color=PAL.badS;glow=true;}
      else color=PAL.dot+alpha+')';
    }else{
      if(c.cca3===sel){dotR=dr*2.2;color=PAL.selS;glow=true;}
      else if(!locked&&c.cca3===hov){dotR=dr*1.5;color=PAL.hovS;}
      else color=PAL.dot+alpha+')';
    }
    if(glow){ctx.shadowColor=color;ctx.shadowBlur=12;}
    ctx.beginPath();ctx.arc(p.sx,p.sy,dotR,0,Math.PI*2);
    ctx.fillStyle=color;ctx.fill();ctx.shadowBlur=0;
    // Contrasting ring: a dot sitting ON land (Vatican, Monaco, Singapour…) is
    // otherwise nearly invisible against the land fill.
    ctx.beginPath();ctx.arc(p.sx,p.sy,dotR+1.2,0,Math.PI*2);
    ctx.strokeStyle=DOTRING;ctx.lineWidth=1.4;ctx.stroke();
  });

  ctx.restore();
  ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);
  ctx.strokeStyle=PAL.rim;ctx.lineWidth=1.5;ctx.stroke();
  if(PAL.atm){
    var atm=ctx.createRadialGradient(cx,cy,R*0.96,cx,cy,R*1.06);
    atm.addColorStop(0,PAL.atm);atm.addColorStop(1,PAL.atmEnd);
    ctx.beginPath();ctx.arc(cx,cy,R*1.06,0,Math.PI*2);ctx.fillStyle=atm;ctx.fill();
  }
}

function render(){
  if(resultMode)drawGlobe(true,resultCorrect,resultPicked);
  else drawGlobe(false,null,null);
}

// Zoom keeps the geo point under the finger/cursor pinned instead of always
// scaling about the globe centre — without it, zooming towards a microstate
// pushed it off screen and the player had to re-pan after every pinch.
// Iterative: nudge the centre with the same px→degree linearisation the drag
// handler uses until the anchor projects back onto the pointer (3-4 passes).
function anchorAt(lat,lng,px,py){
  for(var i=0;i<6;i++){
    var p=project(lat,lng);if(!p)return;
    var ex=px-p.sx,ey=py-p.sy;
    if(Math.abs(ex)<0.5&&Math.abs(ey)<0.5)return;
    var f=57.2957795/R;
    rotLon-=ex*f/Math.max(0.2,Math.cos(lat*Math.PI/180));
    rotLat=Math.max(-85,Math.min(85,rotLat+ey*f));
  }
}
// geo === undefined → resolve the anchor from (px,py); pass null for a plain
// centre zoom (buttons, or a pinch that started off the globe).
function setZoom(z,px,py,geo){
  var anchor=geo===undefined?unproject(px,py):geo;
  zoom=Math.max(ZMIN,Math.min(ZMAX,z));
  R=Rb*zoom;
  if(anchor)anchorAt(anchor.lat,anchor.lng,px,py);
  document.getElementById('zr').style.display=zoom>1.05?'flex':'none';
  render();
}

var drag=null;
// A touch tap is followed by SYNTHESISED mouse events (touchend, then
// mousedown/mouseup a few ms later). Both paths reach onEnd, so a single tap
// used to look like a double-tap and zoomed the globe by itself on every pick.
// Ignore the mouse path for a moment after any touch.
var lastTouch=0;
function fromTouch(){return Date.now()-lastTouch<700;}
function onStart(x,y){drag={x:x,y:y,lon:rotLon,lat:rotLat,moved:false};}
function onMove(x,y){
  if(!drag)return;
  var dx=x-drag.x,dy=y-drag.y;
  if(Math.abs(dx)>4||Math.abs(dy)>4)drag.moved=true;
  rotLon=drag.lon-dx*(0.35/zoom);
  rotLat=Math.max(-85,Math.min(85,drag.lat+dy*(0.35/zoom)));
  render();
}
var lastTap=0,lastTapX=0,lastTapY=0;
function onEnd(x,y){
  if(drag&&!drag.moved){
    var now=Date.now();
    // Double-tap zooms in on the spot — the discoverable way to reach a dot
    // country on touch without a two-finger pinch.
    if(now-lastTap<280&&Math.hypot(x-lastTapX,y-lastTapY)<22){
      lastTap=0;setZoom(zoom*1.8,x,y);
    }else{
      lastTap=now;lastTapX=x;lastTapY=y;handleTap(x,y);
    }
  }
  drag=null;
}

var pinchD=null,pinchZ=null,pinchGeo=null;
function pinchStart(t1,t2){
  pinchD=Math.hypot(t2.clientX-t1.clientX,t2.clientY-t1.clientY);
  pinchZ=zoom;drag=null;
  pinchGeo=unproject((t1.clientX+t2.clientX)/2,(t1.clientY+t2.clientY)/2);
}
function pinchMove(t1,t2){
  if(pinchD===null)return;
  var d=Math.hypot(t2.clientX-t1.clientX,t2.clientY-t1.clientY);
  // Anchoring the start midpoint to the live midpoint gives two-finger pan for free.
  setZoom(pinchZ*d/pinchD,(t1.clientX+t2.clientX)/2,(t1.clientY+t2.clientY)/2,pinchGeo);
}

canvas.addEventListener('touchstart',function(e){
  lastTouch=Date.now();
  if(e.touches.length===2)pinchStart(e.touches[0],e.touches[1]);
  else onStart(e.touches[0].clientX,e.touches[0].clientY);
},{passive:true});
canvas.addEventListener('touchmove',function(e){
  e.preventDefault();lastTouch=Date.now();
  if(e.touches.length===2)pinchMove(e.touches[0],e.touches[1]);
  else if(e.touches.length===1)onMove(e.touches[0].clientX,e.touches[0].clientY);
},{passive:false});
canvas.addEventListener('touchend',function(e){
  lastTouch=Date.now();
  if(e.touches.length<2){pinchD=null;pinchGeo=null;}
  if(e.touches.length===0)onEnd(e.changedTouches[0].clientX,e.changedTouches[0].clientY);
},{passive:true});
canvas.addEventListener('mousedown',function(e){if(fromTouch())return;onStart(e.clientX,e.clientY);});
canvas.addEventListener('mousemove',function(e){
  if(fromTouch())return;
  if(drag){onMove(e.clientX,e.clientY);return;}
  if(locked)return;
  var hit=pickAt(e.clientX,e.clientY);
  if(hit!==hov){hov=hit;canvas.style.cursor=hit?'pointer':'default';render();}
});
canvas.addEventListener('mouseup',function(e){if(fromTouch())return;onEnd(e.clientX,e.clientY);});
canvas.addEventListener('wheel',function(e){
  e.preventDefault();
  setZoom(zoom*(e.deltaY>0?0.9:1.1),e.clientX,e.clientY);
},{passive:false});
// 1.7× per press: two taps clear DOT_PICK_ZOOM, so "+ +" is enough to unlock
// the microstates without a pinch.
document.getElementById('zin').addEventListener('click',function(){setZoom(zoom*1.7,cx,cy,null);});
document.getElementById('zout').addEventListener('click',function(){setZoom(zoom/1.7,cx,cy,null);});
document.getElementById('zr').addEventListener('click',function(){setZoom(1,cx,cy,null);});

function nearestDot(tx,ty,maxD){
  var best=null,bestD=maxD;
  for(var i=0;i<COUNTRIES.length;i++){
    var c=COUNTRIES[i];
    if(polyMap[c.cca3]!==undefined)continue;
    var p=project(c.lat,c.lng);if(!p)continue;
    var d=Math.hypot(p.sx-tx,p.sy-ty);
    if(d<bestD){bestD=d;best=c;}
  }
  return best;
}
// The dot whose own footprint the tap falls in (closest one relative to its
// own radius, so Vatican beats Italy but never outranks a bigger neighbour).
function dotInFootprint(tx,ty){
  if(zoom<DOT_PICK_ZOOM)return null;
  var best=null,bestRel=1,bestD=0;
  for(var i=0;i<COUNTRIES.length;i++){
    var c=COUNTRIES[i];
    if(polyMap[c.cca3]!==undefined)continue;
    var p=project(c.lat,c.lng);if(!p)continue;
    var d=Math.hypot(p.sx-tx,p.sy-ty),rel=d/dotFootprint(c);
    if(rel<bestRel){bestRel=rel;best=c;bestD=d;}
  }
  return best?{c:best,d:bestD}:null;
}
var centreMap={};
COUNTRIES.forEach(function(c){centreMap[c.cca3]=c;});
// Screen distance from a tap to a country's own centre, or Infinity.
function centreDist(cca3,tx,ty){
  var c=centreMap[cca3];if(!c)return Infinity;
  var p=project(c.lat,c.lng);if(!p)return Infinity;
  return Math.hypot(p.sx-tx,p.sy-ty);
}
// Dot countries win inside their own screen footprint, THEN polygons, then a
// wider snap. Seven dots (Vatican/Saint-Marin in ITA, Monaco/Andorre in FRA,
// Liechtenstein in CHE, Singapour in MYS, Palestine in ISR) sit inside another
// country's ring, so a polygon-first test made them literally unselectable.
function pickAt(tx,ty){
  var coords=unproject(tx,ty);
  var poly=coords?hitTest(coords):null;
  var near=dotInFootprint(tx,ty);
  // A tap on a country's own centre belongs to that country even when a dot's
  // footprint covers it — our ISR ring is a coarse 9-point sliver whose middle
  // sits under the Palestine dot, and Israel must stay selectable there.
  if(near&&poly&&centreDist(poly,tx,ty)<near.d)return poly;
  if(near)return near.c.cca3;
  if(poly)return poly;
  // Polygon miss: snap to the nearest dot within ~26px of the tap. Screen-space
  // distance is naturally zoom-aware, so a zoomed-in tap on a big landmass can
  // no longer grab a far-away island (a fixed 18° threshold used to do that).
  var far=nearestDot(tx,ty,26);
  return far?far.cca3:null;
}

function handleTap(tx,ty){
  if(locked)return;
  var hit=pickAt(tx,ty);
  if(!hit)return;
  sel=hit;render();
  postMsg({type:'COUNTRY_SELECTED',cca3:hit});
}

// The reveal now leaves the globe zoomed on the answer, so the next round has to
// take it back to the world view — it is the board every round starts from.
window.resetRound=function(){sel=null;locked=false;hov=null;resultMode=false;resultCorrect=null;resultPicked=null;canvas.style.cursor='default';
  zoom=1;R=Rb;
  var zr0=document.getElementById('zr');if(zr0)zr0.style.display='none';
  render();};
// Angular radius (degrees) of a country around its label point, measured on its
// LARGEST ring only: taken over every ring, French Guiana would size the reveal
// of France and Alaska that of the United States.
function shapeSpan(id,clat,clng){
  var poly=null;
  for(var i=0;i<POLYGONS.length;i++)if(POLYGONS[i].id===id){poly=POLYGONS[i];break;}
  if(!poly)return null;
  var main=poly.r[0];
  for(var ri=1;ri<poly.r.length;ri++)if(poly.r[ri].length>main.length)main=poly.r[ri];
  if(!main||!main.length)return null;
  var max=0,step=Math.max(1,Math.floor(main.length/120));
  for(var k=0;k<main.length;k+=step){
    var d=angDist(clat,clng,main[k][1],main[k][0]);
    if(d>max)max=d;}
  return max;
}
// Reveal: centred on the answer, at a zoom that SITUATES it (same rule as the 3D
// builder). The world view this replaced left Monaco as three pixels of
// vermilion, but a close-up is just as useless: the answer is sized to a sixth
// of the half-screen, i.e. five to six times its own width of surroundings. The
// dot microstates (Monaco, Andorre, Singapour...) have no polygon and a marker
// that keeps its screen size at every zoom, so they get one fixed regional view
// instead. The clamps are [1x, 6x] and 4x here against [1x, 3.5x] and 2.5x on
// the WebGL globe for the same framing: this map is orthographic, where the zoom
// bites far less than under a perspective camera.
function frameReveal(correct){
  var t=COUNTRIES.find(function(c){return c.cca3===correct;});
  if(!t){zoom=1;R=Rb;return;}
  var span=shapeSpan(correct,t.lat,t.lng);
  if(span===null)zoom=4;
  else{
    var ang=Math.max(0.004,Math.min(80,span))*Math.PI/180;
    var z=(0.18*Math.min(W,H)/2)/Math.sin(ang)/Rb;
    zoom=Math.max(1,Math.min(6,z));
  }
  // The +-60 deg clamp is a world-view rule; framed on the country itself, the
  // centre IS the answer or the answer falls off the screen.
  var lim=zoom>1.2?85:60;
  rotLon=t.lng;rotLat=Math.max(-lim,Math.min(lim,t.lat));
  R=Rb*zoom;
  var zr=document.getElementById('zr');
  if(zr)zr.style.display=zoom>1.05?'flex':'none';
}
window.showResult=function(correct,picked){
  locked=true;hov=null;canvas.style.cursor='default';
  resultMode=true;resultCorrect=correct;resultPicked=picked;
  frameReveal(correct);
  render();
};

function setup(){
  W=window.innerWidth;H=window.innerHeight;
  if(!W||!H){requestAnimationFrame(setup);return;}
  Rb=Math.min(W,H)/2*0.88;R=Rb*zoom;
  canvas.width=W*dpr;canvas.height=H*dpr;
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  ctx.scale(dpr,dpr);cx=W/2;cy=H/2;
  render();postMsg({type:'GLOBE_READY'});
}
requestAnimationFrame(setup);
</script>
</body>
</html>`;
}

export default function FindCountryGame({
  setGameMode,
  user,
  matchData,
  onRoundComplete,
  dailySeed,
  onDailyComplete,
  isDaily,
  onShare,
  onDailyScoreChange,
  scope = null,
  reviewIds = null,
  training = false,
  onOpenShop,
}: FindCountryGameProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const colors = getColors(isDarkMode);
  const isOnline = !!matchData;
  const isPlayer1 = matchData?.player1_id === user?.id;
  // Custom matches set the round length per-round in game_data.rounds; fall back
  // to the flat roundsPerSet used by single-mode / ranked matches.
  const roundCfg = matchData?.game_data?.rounds?.[(matchData?.current_round ?? 1) - 1];
  const totalRounds = (roundCfg?.count ?? (matchData?.game_data?.roundsPerSet as number)) ?? DEFAULT_ROUNDS;

  // The answer pool, narrowed to the solo continent scope when there is one.
  // The globe itself still draws the whole world — only the questions change.
  const pool = useMemo(() => {
    const scoped = filterByContinent(rawCountriesStats as unknown as CountryStat[], scope);
    return reviewIds?.length ? orderByReview(scoped, reviewIds) : scoped;
  }, [scope, reviewIds]);
  const isReview = !!reviewIds?.length;
  const { coinsEarned, coinsCapped, coinsSyncFailed, award } = useSoloCoins();
  const { config: myGlobe } = useMyGameGlobe();

  const [rounds, setRounds] = useState<CountryStat[]>(() => {
    const all = pool;
    // Prefer the match's deduplicated per-round assignment (no country repeats
    // across modes); fall back to the legacy seeded sample for older matches.
    const round = matchData?.current_round ?? 1;
    const assigned = matchData?.game_data?.roundCountries?.[round];
    if (assigned?.length) {
      const byId = new Map(all.map((co) => [co.cca3, co]));
      const picked = assigned.map((id) => byId.get(id)).filter(Boolean) as CountryStat[];
      if (picked.length === assigned.length) return picked;
    }
    let seed: number | undefined;
    if (dailySeed != null) {
      seed = dailySeed;
    } else if (matchData?.game_data?.seed != null) {
      seed = (matchData.game_data.seed as number) + (matchData.current_round ?? 0) * 997;
    }
    return isReview ? all.slice(0, totalRounds) : sampleRounds(all, totalRounds, seed);
  });
  // Per-round correctness, in play order — drives the daily emoji share grid.
  const roundResults = useRef<boolean[]>([]);
  // Full per-round detail for the end-of-run recap (the boolean list above only
  // feeds the daily share grid).
  const [recap, setRecap] = useState<RecapEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<Phase>('playing');
  const [selectedCca3, setSelectedCca3] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [opponentScore, setOpponentScore] = useState(0);
  const submitted = useRef(false);

  // Surface the running score so the daily host can lock it in on a mid-game quit.
  useEffect(() => {
    if (isDaily) onDailyScoreChange?.(score);
  }, [isDaily, score, onDailyScoreChange]);

  useEffect(() => {
    if (!matchData) track('game_started', { mode: 'globe' });
    // Warm the flag cache for every round up front.
    prefetchFlags(rounds.map((r) => r.cca3));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!matchData || !user) return;
    const channel = supabase
      .channel(`globe_match_${matchData.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchData.id}` },
        (payload: any) => {
          const u = payload.new;
          setOpponentScore(isPlayer1 ? (u.p2_current_score ?? 0) : (u.p1_current_score ?? 0));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchData?.id, user?.id]);

  const webViewRef = useRef<any>(null);
  // The planet the player is wearing (texture, relief, cosmos, satellite) AND
  // the renderer that can draw it — resolved together before mount, so the page
  // never hot-swaps mid-round. `choose` is the in-game picker.
  const globeSkin = useGameGlobeSkin();
  const [pickerOpen, setPickerOpen] = useState(false);
  const globeHtml = useMemo(() => {
    if (globeSkin.status === 'pending') return null;
    const pal = skinMapPalette(getMapPalette(isDarkMode), globeSkin.key);
    if (globeSkin.threeSrc) {
      return buildFindEarthHtml({
        threeSrc: globeSkin.threeSrc,
        isDark: isDarkMode,
        pal,
        polygons: rawWorldPolygons as unknown as WorldPolygon[],
        dots: (rawCountriesStats as unknown as CountryStat[]).map((co) => ({
          cca3: co.cca3,
          lat: co.lat,
          lng: co.lng,
          area: co.area,
        })),
        skin: globeSkin.skin,
      });
    }
    return buildGlobeHtml(
      rawCountriesStats as unknown as CountryStat[],
      isDarkMode,
      rawWorldPolygons as unknown as WorldPolygon[],
      pal,
    );
  }, [globeSkin, isDarkMode]);
  const current = rounds[index];
  const isCorrect = selectedCca3 === current.cca3;
  const localName = countryName(current, language);

  // Announce each find result (correct/wrong + the target name) for screen readers.
  useEffect(() => {
    if (phase !== 'result') return;
    announce(
      isCorrect
        ? tr(language, 'Correct ! {0}', 'Correct! {0}', [countryName])
        : tr(language, 'Raté ! C\'était {0}', 'Wrong! It was {0}', [countryName]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Announce the final score when the game finishes.
  useEffect(() => {
    if (phase !== 'finished') return;
    const correctCount = score / 1000;
    announce(
      tr(
        language, 'Partie terminée. Score : {0} sur {1}.', 'Game over. Score: {0} out of {1}.', [correctCount, totalRounds],
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: GlobeMessage;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === 'GLOBE_READY') {
        setPhase('playing');
      } else if (msg.type === 'COUNTRY_SELECTED' && msg.cca3) {
        // Tentative pick — highlighted on the globe, validated only on confirm.
        setSelectedCca3(msg.cca3);
      } else if (msg.type === 'GLOBE_ERROR') {
        setErrorMsg(msg.msg ?? 'Globe failed to load');
      }
    },
    [],
  );

  const handleConfirm = () => {
    if (!selectedCca3 || phase !== 'playing') return;
    const correct = selectedCca3 === current.cca3;
    if (correct) setScore((s) => s + 1000);
    roundResults.current.push(correct);
    setRecap((prev) => [
      ...prev,
      {
        cca3: current.cca3,
        prompt: countryFactName(current.cca3, language),
        yourAnswer: correct ? undefined : countryFactName(selectedCca3, language),
        correctAnswer: countryFactName(current.cca3, language),
        ok: correct,
      },
    ]);
    setPhase('result');
    webViewRef.current?.injectJavaScript(
      `window.showResult('${current.cca3}','${selectedCca3}');true;`,
    );
  };

  const handleNext = () => {
    if (index + 1 >= totalRounds) {
      if (onRoundComplete) {
        if (submitted.current) return;
        submitted.current = true;
        onRoundComplete(normalizeRoundScore('globe', score, { numQuestions: totalRounds }));
        return;
      }
      if (isDaily) {
        if (!submitted.current) {
          submitted.current = true;
          const grid = roundResults.current.map((r) => (r ? '🟩' : '🟥')).join('');
          onDailyComplete?.(score, grid);
        }
        setPhase('finished');
        return;
      }
      if (!matchData) {
        track('game_completed', { mode: 'globe', score, scope: scope ?? 'world' });
        // Leaderboard stores the unified 0–1000 scale so runs of any length
        // compare fairly — and a continent-scoped run doesn't enter it at all.
        void saveSoloScore(
          user ?? null,
          'globe',
          normalizeRoundScore('globe', score, { numQuestions: totalRounds }),
          { scope, review: isReview, training },
        );
        // Feed the "mes erreurs" pool so a missed country comes back later.
        void recordRun('globe', recap);
        // Pièces solo : Globe Géo n'en créditait aucune, alors que le serveur
        // accepte ce mode depuis toujours (award_solo_coins, liste des modes).
        if (user) {
          award('globe', normalizeRoundScore('globe', score, { numQuestions: totalRounds }), {
            scope,
            review: isReview,
            training,
          });
        }
      }
      setPhase('finished');
      return;
    }
    setIndex((i) => i + 1);
    setSelectedCca3(null);
    setPhase('playing');
    webViewRef.current?.injectJavaScript(`window.resetRound();true;`);
  };

  /** Remet la manche à zéro sans toucher au tirage (`rounds`). */
  const restart = () => {
    setRecap([]);
    roundResults.current = [];
    setIndex(0);
    setScore(0);
    setSelectedCca3(null);
    setErrorMsg(null);
    setPhase('playing');
    webViewRef.current?.injectJavaScript(`window.resetRound();true;`);
  };

  /** Rejoue exactement les mêmes pays, dans le même ordre. */
  const handleReplaySame = () => restart();

  /** Nouveau tirage. */
  const handleReplay = () => {
    setRounds(isReview ? pool.slice(0, totalRounds) : sampleRounds(pool, totalRounds));
    restart();
  };

  // ── Finished screen ──────────────────────────────────────────────────────
  // L'ordre est délibéré : le globe équipé (la vitrine), le score, les pièces
  // (+ le doubleur pub) AVANT le récap — c'est ce que le joueur vient chercher
  // et il ne doit pas avoir à scroller pour le voir. Le récap, lui, est la
  // solution : il reste juste en dessous, toujours ouvert.
  if (phase === 'finished') {
    const correctCount = score / 1000;
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <ScrollView
          contentContainerStyle={styles.finishedScroll}
          showsVerticalScrollIndicator={false}
        >
          <PlayerGlobe config={myGlobe} size={116} accent={PALETTE.oceanBlue} animate />

          <Text style={[styles.finishedTitle, { color: colors.text }]}>
            {tr(language, 'Partie terminée !', 'Game over!')}
          </Text>
          <ScoreText style={[styles.finishedScore, { color: PALETTE.sand }]}>
            {correctCount} / {totalRounds}
          </ScoreText>
          <Text style={[styles.finishedSub, { color: colors.textMuted }]}>
            {Math.round((correctCount / totalRounds) * 100)}
            {tr(language, '% de réussite', '% success rate')}
          </Text>
          <OffLeaderboardNotice run={{ scope, review: isReview, training }} color={colors.textMuted} />

          <SoloCoinReward
            coinsEarned={coinsEarned}
            coinsCapped={coinsCapped}
            coinsSyncFailed={coinsSyncFailed}
            containerStyle={styles.finishedBlock}
          />

          <View style={styles.finishedBlock}>
            <RunRecap entries={recap} />
          </View>

          <View style={styles.finishedBlock}>
            <SoloEndActions
              onShare={isDaily ? onShare : undefined}
              onReplaySame={isDaily ? undefined : handleReplaySame}
              onNewGame={isDaily ? undefined : handleReplay}
              onMenu={() => setGameMode('menu')}
              accent={PALETTE.chartBlue}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Main game screen ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right', 'bottom']}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <TopInsetBar color={colors.card} />

        {/* Header */}
        <View
          style={[
            styles.header,
            { backgroundColor: colors.card, borderBottomColor: colors.border },
          ]}
        >
          <TouchableOpacity
            onPress={() => setGameMode('menu')}
            style={styles.backBtn}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(tr(language, 'Menu', 'Menu'))}
          >
            <Home color={colors.textMuted} size={20} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.roundLabel, { color: colors.textMuted }]}>
              {index + 1} / {totalRounds}
            </Text>
            {isOnline ? (
              <View style={styles.scoreRow}>
                <Wifi size={12} color={PALETTE.forestGreen} />
                <Text style={[styles.scoreLabel, { color: PALETTE.sand }]}>{score}</Text>
                <Text style={[styles.scoreSep, { color: colors.textMuted }]}>vs</Text>
                <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>{opponentScore}</Text>
              </View>
            ) : (
              <Text style={[styles.scoreLabel, { color: PALETTE.sand }]}>{score} pts</Text>
            )}
          </View>
          {/* Swap the planet you play on. Only between guesses: the pick rebuilds
              the globe page, which would wipe a result reveal. A bare icon read
              as decoration — the label is what tells the player it is a button. */}
          <TouchableOpacity
            onPress={() => setPickerOpen(true)}
            disabled={phase !== 'playing'}
            style={[
              styles.globeBtn,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                opacity: phase === 'playing' ? 1 : 0.35,
              },
            ]}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(tr(language, 'Changer de globe', 'Change globe'))}
          >
            <AtlasGlobe color={colors.textMuted} size={16} {...a11yHidden} />
            <Text style={[styles.globeBtnText, { color: colors.textMuted }]} numberOfLines={1}>
              {tr(language, 'Changer de globe', 'Change globe')}
            </Text>
          </TouchableOpacity>
        </View>

        <GlobePickerModal
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onOpenShop={isOnline ? undefined : onOpenShop}
          current={globeSkin.status === 'ready' ? globeSkin.key : null}
          onPick={(key) => {
            setSelectedCca3(null);
            globeSkin.choose(key);
          }}
        />

        {/* Country name prompt */}
        <View
          style={[styles.prompt, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={[styles.promptSub, { color: colors.textMuted }]}>
            {tr(language, 'Trouve ce pays :', 'Find this country:')}
          </Text>
          <View style={styles.promptRow}>
            <Image source={{ uri: getFlagUrl(current.cca3) }} style={styles.promptFlag} />
            <Text style={[styles.promptName, { color: colors.text }]}>
              {countryName(current, language)}
            </Text>
          </View>
        </View>

        {/* Globe WebView — mounted once for the full game */}
        <View style={styles.globeWrap}>
          {phase === 'loading' && (
            <View style={[styles.loader, { backgroundColor: colors.background }]}>
              {errorMsg ? (
                <>
                  <Text
                    style={{ color: PALETTE.dangerRed, fontSize: 14, textAlign: 'center', padding: 20 }}
                  >
                    {errorMsg}
                  </Text>
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: PALETTE.chartBlue, alignSelf: 'center' }]}
                    onPress={() => setGameMode('menu')}
                    {...a11yButton(tr(language, 'Menu', 'Menu'))}
                  >
                    <Home color="white" size={18} />
                    <Text style={styles.btnText}>Menu</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <ActivityIndicator size="large" color={PALETTE.chartBlue} />
                  <Text style={[styles.loadingText, { color: colors.textMuted }]}>
                    {tr(language, 'Chargement du globe…', 'Loading globe…')}
                  </Text>
                </>
              )}
            </View>
          )}
          {globeHtml && (
            <GlobeWebView
              ref={webViewRef}
              source={{ html: globeHtml }}
              onMessage={handleMessage}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              style={styles.webview}
              scrollEnabled={false}
            />
          )}
        </View>

        {/* Hint / confirm bar (playing) */}
        {phase === 'playing' && (
          <View
            style={[
              styles.bar,
              { backgroundColor: colors.card, borderTopColor: colors.border },
            ]}
          >
            {selectedCca3 ? (
              <View style={styles.confirmRow}>
                <Text style={[styles.hint, { color: colors.textMuted, flex: 1, textAlign: 'left' }]}>
                  {tr(language, 'Confirme ton choix', 'Confirm your pick')}
                </Text>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: PALETTE.chartBlue }]}
                  onPress={handleConfirm}
                  {...a11yButton(tr(language, 'Valider', 'Confirm'))}
                >
                  <Check color="white" size={18} />
                  <Text style={styles.confirmBtnText}>{tr(language, 'Valider', 'Confirm')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  {tr(language, 'Tape sur le pays puis valide', 'Tap the country, then confirm')}
                </Text>
                {/* Microstates are drawn as dots and only become selectable once
                    zoomed in — say so, the gesture is not discoverable alone. */}
                <Text style={[styles.hintSmall, { color: colors.textMuted }]}>
                  {tr(
                    language,
                    'Zoome (pincement, double-tap ou +) pour les tout petits pays',
                    'Zoom (pinch, double-tap or +) to reach the tiny countries',
                  )}
                </Text>
              </>
            )}
          </View>
        )}

        {/* Result bar */}
        {phase === 'result' && (
          <View
            style={[
              styles.resultBar,
              {
                backgroundColor: isCorrect
                  ? 'rgba(42,110,63,0.95)'
                  : 'rgba(139,26,26,0.95)',
              },
            ]}
          >
            <View style={styles.resultRow}>
              <View
                style={styles.resultEmoji}
                {...a11yImage(
                  isCorrect
                    ? tr(language, 'Correct', 'Correct')
                    : tr(language, 'Incorrect', 'Incorrect'),
                )}
              >
                {isCorrect ? (
                  <AtlasCheck color={PALETTE.forestGreen} size={32} />
                ) : (
                  <AtlasCross color={PALETTE.dangerRed} size={32} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.resultTitle}>
                  {isCorrect
                    ? tr(language, 'Correct !', 'Correct!')
                    : tr(language, 'Raté !', 'Wrong!')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <Image source={{ uri: getFlagUrl(current.cca3) }} style={styles.resultFlag} />
                  <Text style={styles.resultName}>
                    {countryName(current, language)}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity
              style={styles.nextBtn}
              onPress={handleNext}
              {...a11yButton(
                index + 1 < totalRounds
                  ? tr(language, 'Suivant', 'Next')
                  : tr(language, 'Résultats', 'Results'),
              )}
            >
              <Text style={styles.nextBtnText}>
                {index + 1 < totalRounds
                  ? tr(language, 'Suivant', 'Next')
                  : tr(language, 'Résultats', 'Results')}
              </Text>
              <ChevronRight color="white" size={20} />
            </TouchableOpacity>
          </View>
        )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 8 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 8 },
  // Labelled pill: shrinks before the header does (the round counter keeps its
  // room), and the text truncates rather than pushing the score off screen.
  globeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 1,
  },
  globeBtnText: { fontSize: 11, fontFamily: FONTS.monoBold, flexShrink: 1 },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  roundLabel: { fontSize: 13, fontFamily: FONTS.mono },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreLabel: { fontSize: 16, fontFamily: FONTS.monoBold },
  scoreSep: { fontSize: 12, fontFamily: FONTS.mono },

  // Prompt
  prompt: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  promptSub: { fontSize: 13, fontFamily: FONTS.mono },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  promptFlag: { width: 48, height: 32, borderRadius: 4 },
  promptName: { fontSize: 26, fontFamily: FONTS.headingBlack, flexShrink: 1 },

  // Globe
  globeWrap: { flex: 1, overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  loader: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { fontSize: 14, fontFamily: FONTS.mono },

  // Bottom bars
  bar: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  hint: { fontSize: 14, textAlign: 'center', fontFamily: FONTS.mono },
  hintSmall: { fontSize: 11, textAlign: 'center', fontFamily: FONTS.mono, opacity: 0.75, marginTop: 3 },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    width: '100%',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  confirmBtnText: { color: 'white', fontFamily: FONTS.monoBold, fontSize: 15 },

  resultBar: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 12 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultEmoji: { alignItems: 'center', justifyContent: 'center' },
  resultTitle: { color: 'white', fontFamily: FONTS.headingBlack, fontSize: 18 },
  resultFlag: { width: 32, height: 22, borderRadius: 3 },
  resultName: { color: 'white', fontFamily: FONTS.monoBold, fontSize: 15 },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  nextBtnText: { color: 'white', fontFamily: FONTS.monoBold, fontSize: 15 },

  // Finished
  finishedEmoji: { fontSize: 64, marginBottom: 8 },
  finishedTitle: { fontSize: 26, fontFamily: FONTS.headingBlack, textAlign: 'center' },
  finishedScore: { fontSize: 56, fontFamily: FONTS.headingBlack, marginTop: 8 },
  finishedSub: { fontSize: 16, fontFamily: FONTS.mono, marginBottom: 8 },
  finishedScroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 6,
  },
  finishedBlock: { width: '100%', maxWidth: 360, marginTop: 12 },

  // Shared button
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  btnText: { color: 'white', fontFamily: FONTS.monoBold, fontSize: 16 },
});
