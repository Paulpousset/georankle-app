import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import GlobeWebView from '../components/GlobeWebView';
import type { WebViewMessageEvent } from '../components/GlobeWebView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ChevronRight, Home, RotateCcw, Share2, Wifi } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';

import type { GameMode, Language, Match } from '../types';
import { getColors, PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { getFlagUrl } from '../lib/flags';
import { createSeededRng } from '../lib/rng';
import { computeView, type RegionView } from '../lib/regionView';
import { tr } from '../i18n';
import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { getRegionFile, type Region } from '../../assets/regions';

const DEFAULT_ROUNDS = 5;

export interface RegionCountrySel {
  cca3: string;
  name: string;
  name_en: string;
  unit?: string | null;
}

export type RegionLevelKey = 'regions' | 'departments';

interface FindRegionGameProps {
  isDarkMode: boolean;
  language: Language;
  setGameMode: (mode: GameMode) => void;
  country: RegionCountrySel;
  level: RegionLevelKey;
  user?: User | null;
  matchData?: Match | null;
  onRoundComplete?: (score: number) => void;
  /** Solo flow: go back to the country picker instead of the menu. */
  onBack?: () => void;
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
}

type Phase = 'loading' | 'playing' | 'result' | 'finished';

interface RegionMessage {
  type: 'MAP_READY' | 'REGION_CLICKED' | 'MAP_ERROR';
  id?: string;
  msg?: string;
}

function sampleRounds(all: Region[], n: number, seed?: number): Region[] {
  const rng = seed != null ? createSeededRng(seed) : Math.random;
  const arr = [...all];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(n, arr.length));
}

/** Localized "Find this <unit>:" prompt, picking the right word for the division type. */
function findPrompt(level: RegionLevelKey, unit: string | null | undefined, language: Language): string {
  if (level === 'departments') return tr(language, 'Trouve ce département :', 'Find this department:');
  const u = (unit || '').toLowerCase();
  if (u.includes('state')) return tr(language, 'Trouve cet État :', 'Find this state:');
  if (u.includes('province')) return tr(language, 'Trouve cette province :', 'Find this province:');
  if (u.includes('prefecture')) return tr(language, 'Trouve cette préfecture :', 'Find this prefecture:');
  if (u.includes('governorate')) return tr(language, 'Trouve ce gouvernorat :', 'Find this governorate:');
  if (u.includes('canton')) return tr(language, 'Trouve ce canton :', 'Find this canton:');
  return tr(language, 'Trouve cette région :', 'Find this region:');
}

function buildRegionMapHtml(regions: Region[], isDark: boolean, view: RegionView): string {
  const bg = isDark ? '#0f172a' : '#0d2b5e';
  const polys = JSON.stringify(regions.map((r) => ({ id: r.id, r: r.r })));
  const dots = JSON.stringify(regions.map((r) => ({ id: r.id, lat: r.lat, lng: r.lng })));

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no,maximum-scale=1">
<style>
*{margin:0;padding:0;}
html,body{width:100%;height:100%;overflow:hidden;background:${bg};}
canvas{display:block;position:absolute;top:0;left:0;touch-action:none;}
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
var POLYGONS=${polys};
var DOTS=${dots};
var CLON=${view.clng.toFixed(3)},CLAT=${view.clat.toFixed(3)},MAXANG=${view.maxAng.toFixed(3)};
var dpr=window.devicePixelRatio||1;
var canvas=document.getElementById('c');
var ctx=canvas.getContext('2d');
var W,H,cx,cy,R,Rb;
var rotLon=CLON,rotLat=Math.max(-85,Math.min(85,CLAT)),zoom=1,ZMIN=0.6,ZMAX=8;
var sel=null,locked=false,hov=null;

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
  return{lat:lat*180/Math.PI,lng:lon*180/Math.PI};
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

// Precompute each region's area (shoelace) so enclaves (e.g. Brussels inside
// Flanders) work: the smallest region containing a tap wins, and small regions
// are drawn last (on top) so they stay visible above the region enclosing them.
function ringArea(ring){
  var a=0;for(var i=0,j=ring.length-1;i<ring.length;j=i++){a+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];}
  return Math.abs(a/2);
}
for(var ai=0;ai<POLYGONS.length;ai++){
  var pa=0;for(var ri2=0;ri2<POLYGONS[ai].r.length;ri2++)pa+=ringArea(POLYGONS[ai].r[ri2]);
  POLYGONS[ai].area=pa;
}
var DRAW_ORDER=POLYGONS.map(function(_,i){return i;}).sort(function(a,b){return POLYGONS[b].area-POLYGONS[a].area;});

function drawMap(resultMode,correct,picked){
  ctx.clearRect(0,0,W,H);
  var g=ctx.createRadialGradient(cx-R*0.2,cy-R*0.2,R*0.05,cx,cy,R);
  g.addColorStop(0,'#1a4a8a');g.addColorStop(1,'#0a1a3a');
  ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();

  ctx.save();ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.clip();

  ctx.strokeStyle='rgba(100,160,255,0.08)';ctx.lineWidth=0.5;
  for(var la=-80;la<=80;la+=10){
    var f1=true;
    for(var lo=-180;lo<=180;lo+=3){
      var p=project(la,lo);if(!p){f1=true;continue;}
      if(f1){ctx.beginPath();ctx.moveTo(p.sx,p.sy);f1=false;}else ctx.lineTo(p.sx,p.sy);
    }ctx.stroke();
  }
  for(var lo2=-180;lo2<180;lo2+=10){
    var f2=true;
    for(var la2=-88;la2<=88;la2+=3){
      var p2=project(la2,lo2);if(!p2){f2=true;continue;}
      if(f2){ctx.beginPath();ctx.moveTo(p2.sx,p2.sy);f2=false;}else ctx.lineTo(p2.sx,p2.sy);
    }ctx.stroke();
  }

  for(var dk=0;dk<DRAW_ORDER.length;dk++){
    var poly=POLYGONS[DRAW_ORDER[dk]],id=poly.id,fill,stroke,lw;
    if(resultMode){
      if(id===correct){fill='rgba(16,185,129,0.78)';stroke='#10b981';lw=1.4;}
      else if(id===picked&&id!==correct){fill='rgba(239,68,68,0.72)';stroke='#ef4444';lw=1.4;}
      else{fill='rgba(110,158,82,0.78)';stroke='rgba(60,100,45,0.7)';lw=0.7;}
    }else{
      if(id===sel){fill='rgba(251,191,36,0.85)';stroke='#fbbf24';lw=1.6;}
      else if(!locked&&id===hov){fill='rgba(120,190,90,0.95)';stroke='rgba(220,255,200,1.0)';lw=2.0;}
      else{fill='rgba(110,158,82,0.85)';stroke='rgba(60,100,45,0.75)';lw=0.7;}
    }
    pathPolygon(poly.r);
    ctx.fillStyle=fill;ctx.fill();
    ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();
  }

  // Result markers on the correct / picked region label points.
  if(resultMode){
    DOTS.forEach(function(c){
      if(c.id!==correct&&c.id!==picked)return;
      var p=project(c.lat,c.lng);if(!p)return;
      var color=c.id===correct?'#10b981':'#ef4444';
      ctx.shadowColor=color;ctx.shadowBlur=12;
      ctx.beginPath();ctx.arc(p.sx,p.sy,7,0,Math.PI*2);
      ctx.fillStyle=color;ctx.fill();ctx.shadowBlur=0;
    });
  }

  ctx.restore();
  ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);
  ctx.strokeStyle='rgba(100,160,255,0.30)';ctx.lineWidth=1.5;ctx.stroke();
  var atm=ctx.createRadialGradient(cx,cy,R*0.96,cx,cy,R*1.06);
  atm.addColorStop(0,'rgba(100,160,255,0.20)');atm.addColorStop(1,'rgba(100,160,255,0)');
  ctx.beginPath();ctx.arc(cx,cy,R*1.06,0,Math.PI*2);ctx.fillStyle=atm;ctx.fill();
}

function render(){drawMap(false,null,null);}

var drag=null;
function onStart(x,y){drag={x:x,y:y,lon:rotLon,lat:rotLat,moved:false};}
function onMove(x,y){
  if(!drag)return;
  var dx=x-drag.x,dy=y-drag.y;
  if(Math.abs(dx)>4||Math.abs(dy)>4)drag.moved=true;
  rotLon=drag.lon-dx*(0.35/zoom);
  rotLat=Math.max(-85,Math.min(85,drag.lat+dy*(0.35/zoom)));
  render();
}
function onEnd(x,y){if(drag&&!drag.moved)handleTap(x,y);drag=null;}

var pinchD=null,pinchZ=null;
function pinchStart(t1,t2){
  pinchD=Math.hypot(t2.clientX-t1.clientX,t2.clientY-t1.clientY);
  pinchZ=zoom;drag=null;
}
function pinchMove(t1,t2){
  if(pinchD===null)return;
  var d=Math.hypot(t2.clientX-t1.clientX,t2.clientY-t1.clientY);
  zoom=Math.max(ZMIN,Math.min(ZMAX,pinchZ*d/pinchD));
  R=Rb*zoom;render();
}

canvas.addEventListener('touchstart',function(e){
  if(e.touches.length===2)pinchStart(e.touches[0],e.touches[1]);
  else onStart(e.touches[0].clientX,e.touches[0].clientY);
},{passive:true});
canvas.addEventListener('touchmove',function(e){
  e.preventDefault();
  if(e.touches.length===2)pinchMove(e.touches[0],e.touches[1]);
  else if(e.touches.length===1)onMove(e.touches[0].clientX,e.touches[0].clientY);
},{passive:false});
canvas.addEventListener('touchend',function(e){
  if(e.touches.length<2)pinchD=null;
  if(e.touches.length===0)onEnd(e.changedTouches[0].clientX,e.changedTouches[0].clientY);
},{passive:true});
canvas.addEventListener('mousedown',function(e){onStart(e.clientX,e.clientY);});
canvas.addEventListener('mousemove',function(e){
  if(drag){onMove(e.clientX,e.clientY);return;}
  if(locked)return;
  var coords=unproject(e.clientX,e.clientY);
  var hit=findRegion(coords);
  if(hit!==hov){hov=hit;canvas.style.cursor=hit?'pointer':'default';render();}
});
canvas.addEventListener('mouseup',function(e){onEnd(e.clientX,e.clientY);});
canvas.addEventListener('wheel',function(e){
  e.preventDefault();
  zoom=Math.max(ZMIN,Math.min(ZMAX,zoom*(e.deltaY>0?0.9:1.1)));
  R=Rb*zoom;render();
},{passive:false});

function findRegion(coords){
  if(!coords)return null;
  // Among every region whose polygon contains the tap, pick the SMALLEST so an
  // enclave (e.g. Brussels) wins over the region that encloses it.
  var bestId=null,bestArea=Infinity;
  for(var pi=0;pi<POLYGONS.length;pi++){
    var poly=POLYGONS[pi];
    for(var ri=0;ri<poly.r.length;ri++){
      if(pointInRing(coords.lng,coords.lat,poly.r[ri])){
        if(poly.area<bestArea){bestArea=poly.area;bestId=poly.id;}
        break;
      }
    }
  }
  if(bestId)return bestId;
  // Fallback: snap to the nearest region label point if the tap is close
  // (handles tiny regions whose polygon is sub-pixel at the current zoom).
  var best=null,bestD=2.5/zoom+0.6;
  DOTS.forEach(function(c){
    var d=angDist(coords.lat,coords.lng,c.lat,c.lng);
    if(d<bestD){bestD=d;best=c.id;}
  });
  return best;
}

function handleTap(tx,ty){
  if(locked)return;
  var coords=unproject(tx,ty);if(!coords)return;
  var hit=findRegion(coords);
  if(!hit)return;
  sel=hit;locked=true;render();
  postMsg({type:'REGION_CLICKED',id:hit});
}

window.resetRound=function(){sel=null;locked=false;hov=null;canvas.style.cursor='default';render();};
window.showResult=function(correct,picked){
  locked=true;hov=null;canvas.style.cursor='default';
  var t=DOTS.find(function(c){return c.id===correct;});
  if(t){rotLon=t.lng;rotLat=Math.max(-85,Math.min(85,t.lat));}
  drawMap(true,correct,picked);
};

function setup(){
  W=window.innerWidth;H=window.innerHeight;
  if(!W||!H){requestAnimationFrame(setup);return;}
  Rb=Math.min(W,H)/2*0.9;
  // Fit the country: an orthographic point at angle θ lands at R·sin(θ) from
  // centre; size R so the farthest region sits at ~84% of the disc radius.
  var ang=Math.min(80,MAXANG*1.12+1.5)*Math.PI/180;
  var rNeeded=(0.84*Math.min(W,H)/2)/Math.max(0.02,Math.sin(ang));
  zoom=Math.max(0.5,rNeeded/Rb);
  ZMAX=Math.max(8,zoom*4);ZMIN=Math.min(0.6,zoom*0.4);
  R=Rb*zoom;
  canvas.width=W*dpr;canvas.height=H*dpr;
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  ctx.scale(dpr,dpr);cx=W/2;cy=H/2;
  render();postMsg({type:'MAP_READY'});
}
requestAnimationFrame(setup);
</script>
</body>
</html>`;
}

export default function FindRegionGame({
  isDarkMode,
  language,
  setGameMode,
  country,
  level,
  user,
  matchData,
  onRoundComplete,
  onBack,
  dailySeed,
  onDailyComplete,
  isDaily,
  onShare,
  onDailyScoreChange,
}: FindRegionGameProps) {
  const colors = getColors(isDarkMode);
  const isOnline = !!matchData;
  const isPlayer1 = matchData?.player1_id === user?.id;
  const totalRoundsCfg = (matchData?.game_data?.roundsPerSet as number) ?? DEFAULT_ROUNDS;

  const file = useMemo(() => getRegionFile(country.cca3, level), [country.cca3, level]);
  const allRegions = useMemo(() => file?.regions ?? [], [file]);
  const totalRounds = Math.min(totalRoundsCfg, allRegions.length || totalRoundsCfg);
  const view = useMemo(() => computeView(allRegions), [allRegions]);
  const html = useMemo(
    () => buildRegionMapHtml(allRegions, isDarkMode, view),
    [allRegions, isDarkMode, view],
  );

  const [rounds, setRounds] = useState<Region[]>(() => {
    let seed: number | undefined;
    if (dailySeed != null) {
      seed = dailySeed;
    } else if (matchData?.game_data?.seed != null) {
      seed = (matchData.game_data.seed as number) + (matchData.current_round ?? 0) * 997;
    }
    return sampleRounds(allRegions, totalRounds, seed);
  });
  // Per-round correctness, in play order — drives the daily emoji share grid.
  const roundResults = useRef<boolean[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<Phase>(file ? 'playing' : 'loading');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Surface the running score so the daily host can lock it in on a mid-game quit.
  useEffect(() => {
    if (isDaily) onDailyScoreChange?.(score);
  }, [isDaily, score, onDailyScoreChange]);
  const [errorMsg, setErrorMsg] = useState<string | null>(file ? null : 'No region data');

  const [opponentScore, setOpponentScore] = useState(0);
  const submitted = useRef(false);
  const webViewRef = useRef<any>(null);

  useEffect(() => {
    if (!matchData) track('game_started', { mode: 'regions' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!matchData || !user) return;
    const channel = supabase
      .channel(`region_match_${matchData.id}`)
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

  const goBack = onBack ?? (() => setGameMode('menu'));
  const current = rounds[index];
  const isCorrect = current != null && selectedId === current.id;
  const regionName = (r: Region) => (language === 'fr' ? r.name : (r.name_en ?? r.name));

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: RegionMessage;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === 'MAP_READY') {
        setPhase('playing');
      } else if (msg.type === 'REGION_CLICKED' && msg.id) {
        const id = msg.id;
        const correct = id === current?.id;
        if (correct) setScore((s) => s + 1000);
        roundResults.current.push(correct);
        setSelectedId(id);
        setPhase('result');
        webViewRef.current?.injectJavaScript(
          `window.showResult('${current?.id}','${id}');true;`,
        );
      } else if (msg.type === 'MAP_ERROR') {
        setErrorMsg(msg.msg ?? 'Map failed to load');
      }
    },
    [current?.id],
  );

  const handleNext = () => {
    if (index + 1 >= totalRounds) {
      if (onRoundComplete) {
        if (submitted.current) return;
        submitted.current = true;
        onRoundComplete(score);
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
      if (!matchData) track('game_completed', { mode: 'regions', score });
      setPhase('finished');
      return;
    }
    setIndex((i) => i + 1);
    setSelectedId(null);
    setPhase('playing');
    webViewRef.current?.injectJavaScript(`window.resetRound();true;`);
  };

  const handleReplay = () => {
    setRounds(sampleRounds(allRegions, totalRounds));
    setIndex(0);
    setScore(0);
    setSelectedId(null);
    setPhase('playing');
    webViewRef.current?.injectJavaScript(`window.resetRound();true;`);
  };

  const countryLabel = language === 'fr' ? country.name : (country.name_en ?? country.name);

  // ── No data guard ────────────────────────────────────────────────────────
  if (!file || allRegions.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <View style={styles.centered}>
          <Text style={{ color: PALETTE.dangerRed, fontSize: 15, textAlign: 'center', marginBottom: 16 }}>
            {tr(language, 'Pas de données de régions pour ce pays.', 'No region data for this country.')}
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: PALETTE.chartBlue }]}
            onPress={goBack}
          >
            <Home color="white" size={18} />
            <Text style={styles.btnText}>{tr(language, 'Retour', 'Back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Finished screen ──────────────────────────────────────────────────────
  if (phase === 'finished') {
    const correctCount = score / 1000;
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <View style={styles.centered}>
          <Text style={styles.finishedEmoji}>🗺️</Text>
          <Text style={[styles.finishedTitle, { color: colors.text }]}>
            {tr(language, 'Partie terminée !', 'Game over!')}
          </Text>
          <Text style={[styles.finishedScore, { color: PALETTE.sand }]}>
            {correctCount} / {totalRounds}
          </Text>
          <Text style={[styles.finishedSub, { color: colors.textMuted }]}>
            {Math.round((correctCount / totalRounds) * 100)}
            {tr(language, '% de réussite', '% success rate')}
          </Text>
          <View style={{ gap: 12, width: '100%', maxWidth: 300 }}>
            {isDaily ? (
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: PALETTE.chartBlue }]}
                onPress={onShare}
              >
                <Share2 color="white" size={18} />
                <Text style={styles.btnText}>{tr(language, 'Partager', 'Share')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: PALETTE.chartBlue }]}
                onPress={handleReplay}
              >
                <RotateCcw color="white" size={18} />
                <Text style={styles.btnText}>{tr(language, 'Rejouer', 'Play again')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={goBack}
            >
              <Home color={colors.text} size={18} />
              <Text style={[styles.btnText, { color: colors.text }]}>
                {isDaily
                  ? tr(language, 'Retour', 'Back')
                  : tr(language, 'Changer de pays', 'Change country')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main game screen ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Home color={colors.textMuted} size={20} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.roundLabel, { color: colors.textMuted }]}>
            {index + 1} / {totalRounds}
          </Text>
          {isOnline ? (
            <View style={styles.scoreRow}>
              <Wifi size={12} color="#10b981" />
              <Text style={[styles.scoreLabel, { color: PALETTE.sand }]}>{score}</Text>
              <Text style={[styles.scoreSep, { color: colors.textMuted }]}>vs</Text>
              <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>{opponentScore}</Text>
            </View>
          ) : (
            <Text style={[styles.scoreLabel, { color: PALETTE.sand }]}>{score} pts</Text>
          )}
        </View>
      </View>

      {/* Region name prompt */}
      <View style={[styles.prompt, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.promptContextRow}>
          <Image source={{ uri: getFlagUrl(country.cca3) }} style={styles.promptFlagSmall} />
          <Text style={[styles.promptContext, { color: colors.textMuted }]}>
            {findPrompt(level, country.unit, language)} {countryLabel}
          </Text>
        </View>
        <Text style={[styles.promptName, { color: colors.text }]}>
          {current ? regionName(current) : ''}
        </Text>
      </View>

      {/* Map WebView — mounted once for the full game */}
      <View style={styles.globeWrap}>
        {phase === 'loading' && (
          <View style={[styles.loader, { backgroundColor: colors.background }]}>
            {errorMsg ? (
              <>
                <Text style={{ color: PALETTE.dangerRed, fontSize: 14, textAlign: 'center', padding: 20 }}>
                  {errorMsg}
                </Text>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: PALETTE.chartBlue, alignSelf: 'center' }]}
                  onPress={goBack}
                >
                  <Home color="white" size={18} />
                  <Text style={styles.btnText}>{tr(language, 'Retour', 'Back')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <ActivityIndicator size="large" color={PALETTE.chartBlue} />
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>
                  {tr(language, 'Chargement de la carte…', 'Loading map…')}
                </Text>
              </>
            )}
          </View>
        )}
        <GlobeWebView
          ref={webViewRef}
          source={{ html }}
          onMessage={handleMessage}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          style={styles.webview}
          scrollEnabled={false}
        />
      </View>

      {/* Hint bar (playing) */}
      {phase === 'playing' && (
        <View style={[styles.bar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {tr(language, 'Tape la bonne zone sur la carte', 'Tap the right area on the map')}
          </Text>
        </View>
      )}

      {/* Result bar */}
      {phase === 'result' && current && (
        <View
          style={[
            styles.resultBar,
            { backgroundColor: isCorrect ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)' },
          ]}
        >
          <View style={styles.resultRow}>
            <Text style={styles.resultEmoji}>{isCorrect ? '✅' : '❌'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultTitle}>
                {isCorrect ? tr(language, 'Correct !', 'Correct!') : tr(language, 'Raté !', 'Wrong!')}
              </Text>
              <Text style={styles.resultName}>{regionName(current)}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
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
    gap: 6,
  },
  promptContextRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  promptFlagSmall: { width: 26, height: 18, borderRadius: 3 },
  promptContext: { fontSize: 13, fontFamily: FONTS.mono },
  promptName: { fontSize: 26, fontFamily: FONTS.headingBlack, flexShrink: 1, textAlign: 'center' },

  // Map
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

  resultBar: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 12 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultEmoji: { fontSize: 32 },
  resultTitle: { color: 'white', fontFamily: FONTS.headingBlack, fontSize: 18 },
  resultName: { color: 'white', fontFamily: FONTS.monoBold, fontSize: 15, marginTop: 2 },
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
  finishedSub: { fontSize: 16, fontFamily: FONTS.mono, marginBottom: 32 },

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
