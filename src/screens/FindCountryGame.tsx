import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Check, ChevronRight, Home, RotateCcw, Share2, Wifi } from 'lucide-react-native';
import { AtlasGlobe, AtlasCheck, AtlasCross } from '../components/AtlasIcons';
import type { User } from '@supabase/supabase-js';

import type { GameMode, Match } from '../types';
import { getColors, PALETTE } from '../theme/colors';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getMapPalette } from '../theme/mapPalette';
import { FONTS } from '../theme/typography';
import { getFlagUrl, prefetchFlags } from '../lib/flags';
import { createSeededRng } from '../lib/rng';
import { tr } from '../i18n';
import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import rawCountriesStats from '../../assets/countries_stats.json';
import rawWorldPolygons from '../../assets/world_polygons.json';
import { a11yButton, announce, a11yImage, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';
import { TopInsetBar } from '../components/TopInsetBar';

const DEFAULT_ROUNDS = 5;

interface CountryStat {
  name: string;
  name_en: string;
  cca3: string;
  lat: number;
  lng: number;
  region: string;
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

function buildGlobeHtml(
  countries: CountryStat[],
  isDark: boolean,
  polygons: WorldPolygon[],
): string {
  const pal = getMapPalette(isDark);
  const bg = pal.bg;
  const dots = JSON.stringify(countries.map((c) => ({ cca3: c.cca3, lat: c.lat, lng: c.lng })));
  const polys = JSON.stringify(polygons);

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
var COUNTRIES=${dots};
var POLYGONS=${polys};
var PAL=${JSON.stringify(pal)};
var dpr=window.devicePixelRatio||1;
var canvas=document.getElementById('c');
var ctx=canvas.getContext('2d');
var W,H,cx,cy,R,Rb;
var rotLon=0,rotLat=0,zoom=1;
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

var polyMap={};
POLYGONS.forEach(function(p,i){polyMap[p.id]=i;});

function drawGlobe(resultMode,correct,picked){
  ctx.clearRect(0,0,W,H);
  var g=ctx.createRadialGradient(cx-R*0.2,cy-R*0.2,R*0.05,cx,cy,R);
  g.addColorStop(0,PAL.ocean0);g.addColorStop(1,PAL.ocean1);
  ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();

  ctx.save();ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.clip();

  ctx.strokeStyle=PAL.grat;ctx.lineWidth=0.5;
  for(var la=-60;la<=60;la+=30){
    var f1=true;
    for(var lo=-180;lo<=180;lo+=3){
      var p=project(la,lo);if(!p){f1=true;continue;}
      if(f1){ctx.beginPath();ctx.moveTo(p.sx,p.sy);f1=false;}else ctx.lineTo(p.sx,p.sy);
    }ctx.stroke();
  }
  for(var lo2=-180;lo2<180;lo2+=30){
    var f2=true;
    for(var la2=-88;la2<=88;la2+=3){
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

  COUNTRIES.forEach(function(c){
    if(polyMap[c.cca3]!==undefined)return;
    var p=project(c.lat,c.lng);if(!p)return;
    var alpha=0.4+p.d*0.6,dotR=4,color,glow=false;
    if(resultMode){
      if(c.cca3===correct){dotR=9;color=PAL.okS;glow=true;}
      else if(c.cca3===picked&&c.cca3!==correct){dotR=9;color=PAL.badS;glow=true;}
      else color=PAL.dot+alpha+')';
    }else{
      if(c.cca3===sel){dotR=9;color=PAL.selS;glow=true;}
      else color=PAL.dot+alpha+')';
    }
    if(glow){ctx.shadowColor=color;ctx.shadowBlur=12;}
    ctx.beginPath();ctx.arc(p.sx,p.sy,dotR,0,Math.PI*2);
    ctx.fillStyle=color;ctx.fill();ctx.shadowBlur=0;
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

function render(){drawGlobe(false,null,null);}

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
  zoom=Math.max(0.9,Math.min(8,pinchZ*d/pinchD));
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
  var hit=null;
  if(coords){
    for(var pi=0;pi<POLYGONS.length&&!hit;pi++){
      var poly=POLYGONS[pi];
      for(var ri=0;ri<poly.r.length;ri++){
        if(pointInRing(coords.lng,coords.lat,poly.r[ri])){hit=poly.id;break;}
      }
    }
  }
  if(hit!==hov){hov=hit;canvas.style.cursor=hit?'pointer':'default';render();}
});
canvas.addEventListener('mouseup',function(e){onEnd(e.clientX,e.clientY);});
canvas.addEventListener('wheel',function(e){
  e.preventDefault();
  zoom=Math.max(0.9,Math.min(8,zoom*(e.deltaY>0?0.9:1.1)));
  R=Rb*zoom;render();
},{passive:false});

function handleTap(tx,ty){
  if(locked)return;
  var coords=unproject(tx,ty);if(!coords)return;
  var hit=null;
  for(var pi=0;pi<POLYGONS.length&&!hit;pi++){
    var poly=POLYGONS[pi];
    for(var ri=0;ri<poly.r.length;ri++){
      if(pointInRing(coords.lng,coords.lat,poly.r[ri])){hit=poly.id;break;}
    }
  }
  if(!hit){
    var best=null,bestD=18;
    COUNTRIES.forEach(function(c){
      if(polyMap[c.cca3]!==undefined)return;
      var d=angDist(coords.lat,coords.lng,c.lat,c.lng);
      if(d<bestD){bestD=d;best=c;}
    });
    if(best)hit=best.cca3;
  }
  if(!hit)return;
  sel=hit;render();
  postMsg({type:'COUNTRY_SELECTED',cca3:hit});
}

window.resetRound=function(){sel=null;locked=false;hov=null;canvas.style.cursor='default';render();};
window.showResult=function(correct,picked){
  locked=true;hov=null;canvas.style.cursor='default';
  var t=COUNTRIES.find(function(c){return c.cca3===correct;});
  if(t){rotLon=t.lng;rotLat=Math.max(-60,Math.min(60,t.lat));}
  drawGlobe(true,correct,picked);
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
}: FindCountryGameProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const colors = getColors(isDarkMode);
  const isOnline = !!matchData;
  const isPlayer1 = matchData?.player1_id === user?.id;
  const totalRounds = (matchData?.game_data?.roundsPerSet as number) ?? DEFAULT_ROUNDS;

  const [rounds, setRounds] = useState<CountryStat[]>(() => {
    let seed: number | undefined;
    if (dailySeed != null) {
      seed = dailySeed;
    } else if (matchData?.game_data?.seed != null) {
      seed = (matchData.game_data.seed as number) + (matchData.current_round ?? 0) * 997;
    }
    return sampleRounds(rawCountriesStats as unknown as CountryStat[], totalRounds, seed);
  });
  // Per-round correctness, in play order — drives the daily emoji share grid.
  const roundResults = useRef<boolean[]>([]);
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
  const current = rounds[index];
  const isCorrect = selectedCca3 === current.cca3;
  const countryName = language === 'fr' ? current.name : (current.name_en ?? current.name);

  // Announce each find result (correct/wrong + the target name) for screen readers.
  useEffect(() => {
    if (phase !== 'result') return;
    announce(
      isCorrect
        ? tr(language, `Correct ! ${countryName}`, `Correct! ${countryName}`)
        : tr(language, `Raté ! C'était ${countryName}`, `Wrong! It was ${countryName}`),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Announce the final score when the game finishes.
  useEffect(() => {
    if (phase !== 'finished') return;
    const correctCount = score / 1000;
    announce(
      tr(
        language,
        `Partie terminée. Score : ${correctCount} sur ${totalRounds}.`,
        `Game over. Score: ${correctCount} out of ${totalRounds}.`,
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
      if (!matchData) track('game_completed', { mode: 'globe', score });
      setPhase('finished');
      return;
    }
    setIndex((i) => i + 1);
    setSelectedCca3(null);
    setPhase('playing');
    webViewRef.current?.injectJavaScript(`window.resetRound();true;`);
  };

  const handleReplay = () => {
    setRounds(sampleRounds(rawCountriesStats as unknown as CountryStat[], totalRounds));
    setIndex(0);
    setScore(0);
    setSelectedCca3(null);
    setErrorMsg(null);
    setPhase('playing');
    webViewRef.current?.injectJavaScript(`window.resetRound();true;`);
  };

  // ── Finished screen ──────────────────────────────────────────────────────
  if (phase === 'finished') {
    const correctCount = score / 1000;
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <View style={styles.centered}>
            <View style={{ marginBottom: 8 }} {...a11yImage(tr(language, 'Globe', 'Globe'))}>
              <AtlasGlobe color={PALETTE.oceanBlue} size={64} />
            </View>
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
            <View style={{ gap: 12, width: '100%', maxWidth: 300 }}>
              {isDaily ? (
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: PALETTE.chartBlue }]}
                  onPress={onShare}
                  {...a11yButton(tr(language, 'Partager', 'Share'))}
                >
                  <Share2 color="white" size={18} />
                  <Text style={styles.btnText}>{tr(language, 'Partager', 'Share')}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: PALETTE.chartBlue }]}
                  onPress={handleReplay}
                  {...a11yButton(tr(language, 'Rejouer', 'Play again'))}
                >
                  <RotateCcw color="white" size={18} />
                  <Text style={styles.btnText}>{tr(language, 'Rejouer', 'Play again')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.btn,
                  {
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setGameMode('menu')}
                {...a11yButton(tr(language, 'Menu', 'Menu'))}
              >
                <Home color={colors.text} size={18} />
                <Text style={[styles.btnText, { color: colors.text }]}>Menu</Text>
              </TouchableOpacity>
            </View>
        </View>
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
        </View>

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
              {language === 'fr' ? current.name : (current.name_en ?? current.name)}
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
          <GlobeWebView
            ref={webViewRef}
            source={{
                html: buildGlobeHtml(
                  rawCountriesStats as unknown as CountryStat[],
                  isDarkMode,
                  rawWorldPolygons as unknown as WorldPolygon[],
                ),
              }}
            onMessage={handleMessage}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            style={styles.webview}
            scrollEnabled={false}
          />
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
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {tr(language, 'Tape sur le pays puis valide', 'Tap the country, then confirm')}
              </Text>
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
                    {language === 'fr' ? current.name : (current.name_en ?? current.name)}
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
