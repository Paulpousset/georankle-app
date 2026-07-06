/**
 * « Frontières » — link the start country to the target through land borders
 * (Travle-style). The player types countries one by one; each must border the
 * END of the current chain. Wrong guesses cost a life, detours cost points.
 * Puzzle generation / graph logic is pure and seeded (src/lib/borders.ts).
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Fuse from 'fuse.js';
import { ArrowRight, Heart, Home, Moon, RefreshCcw, Route, Search, Share2, Sun, Coins } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';

import rawCountriesStats from '../../assets/countries_stats.json';
import rawWorldPolygons from '../../assets/world_polygons.json';
import GlobeWebView from '../components/GlobeWebView';
import {
  bordersScore,
  buildBordersPuzzle,
  sharesBorder,
  BORDERS_EXTRA_STEPS,
  BORDERS_MAX_MISSES,
} from '../lib/borders';
import { getMapPalette } from '../theme/mapPalette';
import { getFlagUrl } from '../lib/flags';
import { normalizeRoundScore } from '../lib/score';
import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { log } from '../lib/log';
import { awardSoloCoins } from '../lib/coins';
import { useToast } from '../components/ToastProvider';
import type { GameMode, Match } from '../types';
import { getColors } from '../theme/colors';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, announce, a11yHidden, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';
import { RewardedAdButton } from '../components/RewardedAdButton';
import { TopInsetBar } from '../components/TopInsetBar';

const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

interface StatEntry {
  cca3: string;
  name: string;
  name_en?: string;
  lat?: number;
  lng?: number;
}
const COUNTRIES = rawCountriesStats as StatEntry[];
const NAME_BY_ID = new Map(COUNTRIES.map((c) => [c.cca3, c]));

function countryName(cca3: string, lang: 'fr' | 'en'): string {
  const c = NAME_BY_ID.get(cca3);
  if (!c) return cca3;
  return lang === 'fr' ? c.name : c.name_en ?? c.name;
}

interface WorldPolygon {
  id: string;
  r: number[][][];
}
const WORLD_POLYGONS = rawWorldPolygons as WorldPolygon[];
/** Label anchor (lat/lng) per country, for the globe name tags. */
const COORDS: Record<string, [number, number]> = Object.fromEntries(
  COUNTRIES.filter((c) => c.lat != null && c.lng != null).map((c) => [c.cca3, [c.lat!, c.lng!]]),
);

/** How a country is painted on the globe. */
type Highlight = {
  id: string;
  name: string;
  flag: string;
  kind: 'start' | 'chain' | 'last' | 'target';
};

/**
 * A read-only orthographic globe that paints the border chain in place:
 * start (blue), links (green), the current tip (bright), and the destination
 * (gold), each with a floating name tag. The player still types below — this is
 * pure visualization, driven from React via `window.setHighlights([...], refit)`.
 */
function buildBordersGlobeHtml(isDark: boolean): string {
  const pal = getMapPalette(isDark);
  const polys = JSON.stringify(WORLD_POLYGONS);
  const coords = JSON.stringify(COORDS);
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no,maximum-scale=1">
<style>
*{margin:0;padding:0;}
html,body{width:100%;height:100%;overflow:hidden;background:${pal.bg};}
canvas{display:block;position:absolute;top:0;left:0;touch-action:none;}
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
var POLYGONS=${polys};
var COORDS=${coords};
var PAL=${JSON.stringify(pal)};
var GOLD='#c4872a',GOLDF='rgba(196,135,42,0.55)';
var dpr=window.devicePixelRatio||1;
var canvas=document.getElementById('c');
var ctx=canvas.getContext('2d');
var W,H,cx,cy,R,Rb;
var rotLon=0,rotLat=20,zoom=1;
var ZMIN=0.9,ZMAX=16;
var highlights=[];
var polyMap={};
POLYGONS.forEach(function(p,i){polyMap[p.id]=i;});

function postMsg(o){var j=JSON.stringify(o);if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(j);else if(window.parent!==window)window.parent.postMessage(j,'*');}

function project(lat,lng){
  var phi=lat*Math.PI/180,lam=lng*Math.PI/180;
  var cLat=rotLat*Math.PI/180,cLon=rotLon*Math.PI/180,dLon=lam-cLon;
  var d=Math.sin(cLat)*Math.sin(phi)+Math.cos(cLat)*Math.cos(phi)*Math.cos(dLon);
  if(d<0)return null;
  var x=Math.cos(phi)*Math.sin(dLon);
  var y=Math.cos(cLat)*Math.sin(phi)-Math.sin(cLat)*Math.cos(phi)*Math.cos(dLon);
  return{sx:cx+R*x,sy:cy-R*y,d:d};
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
function styleFor(kind){
  if(kind==='start')return{f:PAL.selF,s:PAL.selS,lw:1.6};
  if(kind==='last')return{f:PAL.hovF,s:PAL.hovS,lw:2.2};
  if(kind==='target')return{f:GOLDF,s:GOLD,lw:1.8};
  return{f:PAL.okF,s:PAL.okS,lw:1.4};
}

function toVec(lat,lng){var la=lat*Math.PI/180,lo=lng*Math.PI/180;return[Math.cos(la)*Math.cos(lo),Math.cos(la)*Math.sin(lo),Math.sin(la)];}

// Sampled unit vectors for framing. Only each country's MAIN landmass (largest
// ring) counts, so distant territories (French Guiana, the Azores, Alaska) don't
// blow the extent out and force a needless zoom-out.
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
  return v;
}

// Center on the highlighted countries and pick a zoom so the farthest outline
// vertex lands at a fixed fraction of the view — coherent whether the countries
// are tiny & adjacent (zoom in) or big & far apart (zoom out). Orthographic:
// a point θ° off-center projects to R·sin(θ), so zoom ≈ target / sin(θmax).
function frame(){
  var v=highlightVecs();
  if(!v.length)return;
  var sx=0,sy=0,sz=0;
  v.forEach(function(u){sx+=u[0];sy+=u[1];sz+=u[2];});
  var n=Math.sqrt(sx*sx+sy*sy+sz*sz)||1;
  var cx=sx/n,cy=sy/n,cz=sz/n;
  rotLat=Math.max(-78,Math.min(78,Math.asin(cz)*180/Math.PI));
  rotLon=Math.atan2(cy,cx)*180/Math.PI;
  // Max angular distance from the ACTUAL view center (post-clamp) to any vertex.
  var vc=toVec(rotLat,rotLon),maxAng=0;
  v.forEach(function(u){
    var dot=Math.max(-1,Math.min(1,u[0]*vc[0]+u[1]*vc[1]+u[2]*vc[2]));
    var ang=Math.acos(dot);
    if(ang>maxAng)maxAng=ang;
  });
  var th=Math.max(0.06,Math.min(1.48,maxAng)); // clamp to [~3.4°, ~85°]
  zoom=Math.max(1,Math.min(6,0.8/Math.sin(th)));
  R=Rb*zoom;
}

// Flag images, loaded once and cached; a fresh load triggers a redraw.
var FLAGS={};
function loadFlag(url){
  if(!url)return null;
  if(FLAGS[url])return FLAGS[url];
  var o={img:new Image(),ready:false};
  o.img.onload=function(){o.ready=true;draw();};
  o.img.onerror=function(){o.ready=false;};
  o.img.src=url;
  FLAGS[url]=o;
  return o;
}
// A flag tag floating above the country, with a tick down to it.
function drawFlag(lat,lng,url,color){
  var p=project(lat,lng);
  if(!p||p.d<0.15)return;
  var w=34,h=22,bx=p.sx-w/2,by=p.sy-h-10;
  // tick + anchor dot
  ctx.strokeStyle=color;ctx.lineWidth=1.4;
  ctx.beginPath();ctx.moveTo(p.sx,by+h);ctx.lineTo(p.sx,p.sy);ctx.stroke();
  ctx.beginPath();ctx.arc(p.sx,p.sy,3,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
  var f=loadFlag(url);
  if(f&&f.ready){
    ctx.save();
    if(ctx.roundRect){ctx.beginPath();ctx.roundRect(bx,by,w,h,4);ctx.clip();}
    ctx.drawImage(f.img,bx,by,w,h);
    ctx.restore();
  }else{
    // Not loaded yet: a neutral placeholder so the tag still reads.
    ctx.fillStyle=PAL.bg;
    if(ctx.roundRect){ctx.beginPath();ctx.roundRect(bx,by,w,h,4);ctx.fill();}else{ctx.fillRect(bx,by,w,h);}
  }
  // colored frame keeps start/link/tip/target distinguishable
  ctx.strokeStyle=color;ctx.lineWidth=2;
  if(ctx.roundRect){ctx.beginPath();ctx.roundRect(bx,by,w,h,4);ctx.stroke();}else{ctx.strokeRect(bx,by,w,h);}
}

function draw(){
  if(!R)return;
  ctx.clearRect(0,0,W,H);
  var g=ctx.createRadialGradient(cx-R*0.2,cy-R*0.2,R*0.05,cx,cy,R);
  g.addColorStop(0,PAL.ocean0);g.addColorStop(1,PAL.ocean1);
  ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.clip();

  ctx.strokeStyle=PAL.grat;ctx.lineWidth=0.5;
  for(var la=-60;la<=60;la+=30){var f1=true;for(var lo=-180;lo<=180;lo+=4){var p=project(la,lo);if(!p){f1=true;continue;}if(f1){ctx.beginPath();ctx.moveTo(p.sx,p.sy);f1=false;}else ctx.lineTo(p.sx,p.sy);}ctx.stroke();}
  for(var lo2=-180;lo2<180;lo2+=30){var f2=true;for(var la2=-88;la2<=88;la2+=4){var p2=project(la2,lo2);if(!p2){f2=true;continue;}if(f2){ctx.beginPath();ctx.moveTo(p2.sx,p2.sy);f2=false;}else ctx.lineTo(p2.sx,p2.sy);}ctx.stroke();}

  // Only the countries in play are drawn — start, links and target. Every other
  // landmass stays hidden (bare ocean), so the puzzle can't be read off the map.
  highlights.forEach(function(h){
    var idx=polyMap[h.id];if(idx===undefined)return;
    var st=styleFor(h.kind);
    pathPolygon(POLYGONS[idx].r);
    ctx.fillStyle=st.f;ctx.fill();ctx.strokeStyle=st.s;ctx.lineWidth=st.lw;ctx.stroke();
  });

  ctx.restore();
  ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.strokeStyle=PAL.rim;ctx.lineWidth=1.5;ctx.stroke();
  if(PAL.atm){var atm=ctx.createRadialGradient(cx,cy,R*0.96,cx,cy,R*1.06);atm.addColorStop(0,PAL.atm);atm.addColorStop(1,PAL.atmEnd);ctx.beginPath();ctx.arc(cx,cy,R*1.06,0,Math.PI*2);ctx.fillStyle=atm;ctx.fill();}

  // Flag tags last, above everything.
  highlights.forEach(function(h){
    var co=COORDS[h.id];if(!co)return;
    var st=styleFor(h.kind);
    drawFlag(co[0],co[1],h.flag,st.s);
  });
}

window.setHighlights=function(list,refit){
  highlights=list||[];
  highlights.forEach(function(h){loadFlag(h.flag);});
  if(refit)frame();
  draw();
};

var drag=null;
canvas.addEventListener('touchstart',function(e){if(e.touches.length===1)drag={x:e.touches[0].clientX,y:e.touches[0].clientY,lon:rotLon,lat:rotLat};},{passive:true});
canvas.addEventListener('touchmove',function(e){if(!drag||e.touches.length!==1)return;e.preventDefault();var dx=e.touches[0].clientX-drag.x,dy=e.touches[0].clientY-drag.y;rotLon=drag.lon-dx*(0.35/zoom);rotLat=Math.max(-85,Math.min(85,drag.lat+dy*(0.35/zoom)));draw();},{passive:false});
canvas.addEventListener('touchend',function(){drag=null;},{passive:true});
canvas.addEventListener('mousedown',function(e){drag={x:e.clientX,y:e.clientY,lon:rotLon,lat:rotLat};});
canvas.addEventListener('mousemove',function(e){if(!drag)return;var dx=e.clientX-drag.x,dy=e.clientY-drag.y;rotLon=drag.lon-dx*(0.35/zoom);rotLat=Math.max(-85,Math.min(85,drag.lat+dy*(0.35/zoom)));draw();});
canvas.addEventListener('mouseup',function(){drag=null;});
canvas.addEventListener('wheel',function(e){e.preventDefault();zoom=Math.max(ZMIN,Math.min(ZMAX,zoom*(e.deltaY>0?0.9:1.1)));R=Rb*zoom;draw();},{passive:false});

function setup(){
  W=window.innerWidth;H=window.innerHeight;
  if(!W||!H){requestAnimationFrame(setup);return;}
  Rb=Math.min(W,H)/2*0.9;R=Rb*zoom;
  canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';
  ctx.scale(dpr,dpr);cx=W/2;cy=H/2;
  draw();postMsg({type:'GLOBE_READY'});
}
requestAnimationFrame(setup);
</script>
</body>
</html>`;
}

interface BordersGameProps {
  setGameMode: (mode: GameMode) => void;
  user: User | null;
  matchData?: Match | null;
  onRoundComplete?: (score: number) => void;
  /** Daily challenge: deterministic seed for today's puzzle (overrides random). */
  dailySeed?: number;
  /** Daily challenge: fired once at game-over with the score. */
  onDailyComplete?: (score: number, grid?: string) => void;
  /** Daily challenge: replaces "Retry" with "Share" and skips score saving. */
  isDaily?: boolean;
  /** Daily challenge: invoked by the "Share" button on the game-over overlay. */
  onShare?: () => void;
  /** Daily challenge: reports the live score so a mid-game quit can lock it in. */
  onDailyScoreChange?: (score: number) => void;
}

export default function BordersGame({
  setGameMode,
  user,
  matchData,
  onRoundComplete,
  dailySeed,
  onDailyComplete,
  isDaily,
  onShare,
  onDailyScoreChange,
}: BordersGameProps) {
  const { isDarkMode, setIsDarkMode } = useTheme();
  const { language, setLanguage } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);

  const [puzzle, setPuzzle] = useState(() => {
    const seed =
      dailySeed ??
      (matchData?.game_data?.seed
        ? matchData.game_data.seed + ((matchData.current_round ?? 1) - 1)
        : Math.floor(Math.random() * 2147483647));
    return buildBordersPuzzle(seed);
  });
  /** The chain so far, starting at puzzle.start. */
  const [chain, setChain] = useState<string[]>([puzzle.start]);
  const [misses, setMisses] = useState(0);
  const [input, setInput] = useState('');
  const [outcome, setOutcome] = useState<'won' | 'lost' | null>(null);
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null);
  const [coinsCapped, setCoinsCapped] = useState(false);
  const [coinsSyncFailed, setCoinsSyncFailed] = useState(false);
  useEffect(() => {
    if (!matchData && !isDaily) track('game_started', { mode: 'borders' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Floating "-1 ❤" that rises and fades whenever a life is lost.
  const [lifeLostVisible, setLifeLostVisible] = useState(false);
  const [lifeAnim] = useState(() => new Animated.Value(0));
  const flashLifeLost = () => {
    setLifeLostVisible(true);
    lifeAnim.setValue(0);
    Animated.timing(lifeAnim, { toValue: 1, duration: 950, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) setLifeLostVisible(false);
      },
    );
  };

  // ── Globe visualization ────────────────────────────────────────────────────
  const webRef = useRef<any>(null);
  const [globeReady, setGlobeReady] = useState(false);
  const globeHtml = useMemo(() => buildBordersGlobeHtml(isDarkMode), [isDarkMode]);

  /** The countries to paint: start, links, the current tip, and the target. */
  const highlights = useMemo<Highlight[]>(() => {
    const list: Highlight[] = chain.map((id, i) => ({
      id,
      name: countryName(id, language),
      flag: getFlagUrl(id),
      kind: i === 0 ? 'start' : i === chain.length - 1 ? 'last' : 'chain',
    }));
    if (!chain.includes(puzzle.target)) {
      list.push({
        id: puzzle.target,
        name: countryName(puzzle.target, language),
        flag: getFlagUrl(puzzle.target),
        kind: 'target',
      });
    }
    return list;
  }, [chain, puzzle.target, language]);

  // Always re-frame: a fresh puzzle, a theme reload (new HTML) or an added
  // country all need the current countries painted AND centered, or the globe
  // can end up blank (the previous camera pointed elsewhere / highlights lost).
  const pushHighlights = useCallback(() => {
    webRef.current?.injectJavaScript(
      `window.setHighlights(${JSON.stringify(highlights)},true);true;`,
    );
  }, [highlights]);

  useEffect(() => {
    if (globeReady) pushHighlights();
  }, [globeReady, pushHighlights]);

  const maxSteps = puzzle.optimal + BORDERS_EXTRA_STEPS;
  /** Border crossings used so far (chain edges). */
  const stepsUsed = chain.length - 1;

  const fuse = useMemo(
    () =>
      new Fuse(COUNTRIES, {
        keys: ['name', 'name_en'],
        threshold: 0.3,
        ignoreLocation: true,
      }),
    [],
  );
  const suggestions = useMemo(() => {
    if (!input.trim() || outcome) return [];
    const inChain = new Set(chain);
    return fuse
      .search(input.trim())
      .map((r) => r.item)
      .filter((item) => !inChain.has(item.cca3) && item.cca3 !== puzzle.target)
      .slice(0, 5);
  }, [input, fuse, chain, puzzle.target, outcome]);

  const currentScore = () =>
    bordersScore(true, Math.max(0, stepsUsed + 1 - puzzle.optimal), misses);

  const finishRun = (won: boolean, finalScore: number) => {
    setOutcome(won ? 'won' : 'lost');
    if (isDaily) {
      onDailyScoreChange?.(finalScore);
      onDailyComplete?.(finalScore);
      return;
    }
    if (!matchData) {
      track('game_completed', { mode: 'borders', score: finalScore, won });
      if (user) {
        supabase
          .from('scores')
          .insert({ user_id: user.id, game_mode: 'borders', score: finalScore })
          .then(({ error }) => {
            if (error) {
              log.error('Error saving borders score:', error);
              Alert.alert(
                tr(language, 'Erreur', 'Error'),
                tr(language, "Impossible d'enregistrer ton score.", 'Could not save your score.'),
              );
            }
          });
        awardSoloCoins('borders').then((res) => {
          setCoinsEarned(res.coinsAwarded);
          setCoinsCapped(res.capped);
          setCoinsSyncFailed(!res.synced);
          if (!res.synced) {
            toast.info(
              tr(
                language,
                'Pièces non synchronisées — réessai à la reconnexion.',
                'Coins not synced — will retry when you reconnect.',
              ),
            );
          }
        });
      }
    }
    if (matchData && onRoundComplete) {
      onRoundComplete(normalizeRoundScore('borders', finalScore));
    }
  };

  const submitCountry = (cca3: string) => {
    if (outcome) return;
    setInput('');
    const last = chain[chain.length - 1];

    if (chain.includes(cca3)) {
      toast.info(tr(language, 'Déjà dans la chaîne.', 'Already in the chain.'));
      return;
    }
    if (!sharesBorder(last, cca3)) {
      const newMisses = misses + 1;
      setMisses(newMisses);
      flashLifeLost();
      announce(
        tr(
          language,
          `${countryName(cca3, language)} ne touche pas ${countryName(last, language)}.`,
          `${countryName(cca3, language)} does not border ${countryName(last, language)}.`,
        ),
      );
      if (newMisses >= BORDERS_MAX_MISSES) finishRun(false, 0);
      return;
    }

    const newChain = [...chain, cca3];
    setChain(newChain);
    announce(tr(language, `${countryName(cca3, language)} ajouté.`, `${countryName(cca3, language)} added.`));

    if (sharesBorder(cca3, puzzle.target) || cca3 === puzzle.target) {
      // Reached the destination — the final crossing into the target counts.
      const totalSteps = newChain.length - 1 + (cca3 === puzzle.target ? 0 : 1);
      finishRun(true, bordersScore(true, Math.max(0, totalSteps - puzzle.optimal), misses));
      return;
    }
    if (newChain.length - 1 + 1 > maxSteps) {
      // No budget left for the mandatory crossing into the target.
      finishRun(false, 0);
    }
  };

  const resetGame = () => {
    const fresh = buildBordersPuzzle(Math.floor(Math.random() * 2147483647));
    setPuzzle(fresh);
    setChain([fresh.start]);
    setMisses(0);
    setInput('');
    setOutcome(null);
    setCoinsEarned(null);
    setCoinsCapped(false);
    setCoinsSyncFailed(false);
  };

  const chip = (cca3: string, kind: 'start' | 'chain' | 'target') => {
    const palette =
      kind === 'target'
        ? { bg: 'rgba(196,135,42,0.14)', border: '#c4872a', text: '#c4872a' }
        : kind === 'start'
          ? { bg: c.surface, border: c.accent, text: c.text }
          : {
              bg: 'rgba(42,110,63,0.12)',
              border: '#2a6e3f',
              text: isDarkMode ? '#7fc49a' : '#2a6e3f',
            };
    return (
      <View
        key={`${kind}-${cca3}`}
        style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.border }]}
      >
        <Image source={{ uri: getFlagUrl(cca3) }} style={styles.chipFlag} accessible={false} />
        <Text style={[styles.chipText, { color: palette.text }]} numberOfLines={1}>
          {countryName(cca3, language)}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: c.background }]}
      edges={['left', 'right', 'bottom']}
    >
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <TopInsetBar color={isDarkMode ? c.background : c.card} />

      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <TouchableOpacity
            onPress={() => setGameMode('menu')}
            style={[styles.iconBtn, { backgroundColor: c.surface, borderColor: c.border, marginRight: 8 }]}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(tr(language, 'Menu', 'Menu'))}
          >
            <Home color={c.accent} size={18} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.text }]}>
            {tr(language, 'Frontières', 'Borders')}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={[styles.statsPill, { backgroundColor: c.surface, borderColor: c.border }]}
            accessible
            accessibilityLabel={tr(
              language,
              `${stepsUsed} étapes sur ${maxSteps}`,
              `${stepsUsed} of ${maxSteps} steps`,
            )}
          >
            <Route size={14} color={c.accent} {...a11yHidden} />
            <ScoreText style={[styles.statValue, { color: c.accent }]}>
              {stepsUsed}/{maxSteps}
            </ScoreText>
          </View>
          <View
            style={[styles.statsPill, { backgroundColor: c.surface, borderColor: c.border }]}
            accessible
            accessibilityLabel={tr(
              language,
              `${BORDERS_MAX_MISSES - misses} vies restantes`,
              `${BORDERS_MAX_MISSES - misses} lives left`,
            )}
          >
            <View style={{ flexDirection: 'row', gap: 3 }} {...a11yHidden}>
              {Array.from({ length: BORDERS_MAX_MISSES }, (_, i) => (
                <Heart
                  key={i}
                  size={15}
                  color={i < BORDERS_MAX_MISSES - misses ? '#c0392b' : c.border}
                  fill={i < BORDERS_MAX_MISSES - misses ? '#c0392b' : 'transparent'}
                />
              ))}
            </View>
          </View>

          <TouchableOpacity
            onPress={() => setLanguage(language === 'fr' ? 'en' : 'fr')}
            style={[styles.iconBtn, { backgroundColor: c.surface, borderColor: c.border, minWidth: 40, alignItems: 'center' }]}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(tr(language, 'Changer de langue', 'Change language'))}
          >
            <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 11 }}>
              {language.toUpperCase()}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setIsDarkMode(!isDarkMode)}
            style={[styles.iconBtn, { backgroundColor: c.surface, borderColor: c.border }]}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(
              isDarkMode ? tr(language, 'Mode clair', 'Light mode') : tr(language, 'Mode sombre', 'Dark mode'),
            )}
          >
            {isDarkMode ? <Sun color={c.accent} size={18} /> : <Moon color={c.textMuted} size={18} />}
          </TouchableOpacity>
        </View>
      </View>

      {lifeLostVisible && (
        <Animated.View
          pointerEvents="none"
          {...a11yHidden}
          style={[
            styles.lifeLost,
            {
              opacity: lifeAnim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateY: lifeAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -28] }) },
              ],
            },
          ]}
        >
          <Text style={styles.lifeLostText}>-1</Text>
          <Heart size={16} color="#c0392b" fill="#c0392b" />
        </Animated.View>
      )}

      <ScrollView contentContainerStyle={styles.gameArea} keyboardShouldPersistTaps="handled">
        <Text style={[styles.question, { color: c.textMuted }]}>
          {tr(
            language,
            `Relie les deux pays par leurs frontières (optimal : ${puzzle.optimal} étapes).`,
            `Link the two countries through land borders (optimal: ${puzzle.optimal} steps).`,
          )}
        </Text>

        {/* Globe — the chain painted on the world (drag to rotate, pinch to zoom). */}
        <View style={[styles.globeWrap, { borderColor: c.border, backgroundColor: getMapPalette(isDarkMode).bg }]}>
          <GlobeWebView
            ref={webRef}
            originWhitelist={['*']}
            source={{ html: globeHtml }}
            style={styles.globe}
            scrollEnabled={false}
            javaScriptEnabled
            domStorageEnabled
            onMessage={(e) => {
              try {
                const m = JSON.parse(e.nativeEvent.data);
                if (m.type === 'GLOBE_READY') {
                  setGlobeReady(true);
                  // Repaint immediately — covers first load and theme reloads,
                  // where the fresh page starts with no highlights.
                  pushHighlights();
                }
              } catch {
                // ignore malformed globe messages
              }
            }}
          />
        </View>

        {/* The journey so far: start → links → (…) → destination. */}
        <View style={[styles.routeCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.routeChain}>
            {chain.map((cca3, i) => (
              <Fragment key={cca3}>
                {i > 0 && <ArrowRight color={c.textFaint} size={15} {...a11yHidden} />}
                {chip(cca3, i === 0 ? 'start' : 'chain')}
              </Fragment>
            ))}
            <ArrowRight color={c.textFaint} size={15} {...a11yHidden} />
            <View style={[styles.chipDashed, { borderColor: c.border }]}>
              <Text style={[styles.chipText, { color: c.textFaint }]}>?</Text>
            </View>
            <ArrowRight color={c.textFaint} size={15} {...a11yHidden} />
            {chip(puzzle.target, 'target')}
          </View>
        </View>

        {!outcome && (
          <View style={{ width: '100%', maxWidth: 480, gap: 8 }}>
            <Text style={[styles.searchLabel, { color: c.textMuted }]}>
              {tr(
                language,
                `Un pays qui touche ${countryName(chain[chain.length - 1], language)}`,
                `A country bordering ${countryName(chain[chain.length - 1], language)}`,
              )}
            </Text>
            <View style={[styles.searchBar, { backgroundColor: c.card, borderColor: c.border }]}>
              <Search color={c.textFaint} size={18} {...a11yHidden} />
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={tr(language, 'Rechercher un pays…', 'Search a country…')}
                placeholderTextColor={c.textFaint}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel={tr(language, 'Saisir un pays', 'Type a country')}
                style={[styles.searchInput, { color: c.text }]}
              />
            </View>

            {suggestions.length > 0 && (
              <View style={[styles.suggestions, { backgroundColor: c.card, borderColor: c.border }]}>
                {suggestions.map((s) => (
                  <TouchableOpacity
                    key={s.cca3}
                    onPress={() => submitCountry(s.cca3)}
                    style={[styles.suggestionRow, { borderBottomColor: c.border }]}
                    {...a11yButton(countryName(s.cca3, language))}
                  >
                    <Image
                      source={{ uri: getFlagUrl(s.cca3) }}
                      style={[styles.suggestionFlag, { borderColor: c.border }]}
                      accessible={false}
                    />
                    <Text style={{ color: c.text, fontFamily: FONTS.heading, fontSize: 16 }}>
                      {countryName(s.cca3, language)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {outcome && (
          <View style={{ alignItems: 'center', gap: 14, marginTop: 18, width: '100%' }}>
            <ScoreText
              style={{
                fontSize: 34,
                fontFamily: FONTS.headingBlack,
                color: outcome === 'won' ? '#2a6e3f' : '#8b1a1a',
              }}
            >
              {outcome === 'won'
                ? tr(language, 'RELIÉ !', 'LINKED!')
                : tr(language, 'PERDU !', 'LOST!')}
            </ScoreText>
            <Text style={{ color: c.text, fontFamily: FONTS.mono, fontSize: 15 }}>
              {outcome === 'won'
                ? tr(language, `Score : ${currentScore()} / 1000`, `Score: ${currentScore()} / 1000`)
                : tr(
                    language,
                    `Chemin optimal : ${puzzle.optimal} étapes.`,
                    `Optimal path: ${puzzle.optimal} steps.`,
                  )}
            </Text>

            {coinsEarned != null && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: c.surface,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: coinsEarned > 0 ? '#ffd700' : coinsSyncFailed ? '#c0392b' : c.border,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                }}
              >
                <Coins color="#ffd700" size={20} />
                {coinsEarned > 0 ? (
                  <Text style={{ color: '#ffd700', fontSize: 18, fontFamily: FONTS.headingBlack }}>
                    {`+${coinsEarned}`}
                  </Text>
                ) : (
                  <Text style={{ color: c.textMuted, fontSize: 13, fontFamily: FONTS.mono }}>
                    {coinsSyncFailed
                      ? tr(language, 'Pièces non synchronisées', 'Coins not synced')
                      : coinsCapped
                        ? tr(language, 'Plafond quotidien atteint', 'Daily coin cap reached')
                        : tr(language, 'Aucune pièce cette fois', 'No coins this time')}
                  </Text>
                )}
              </View>
            )}

            {/* Rewarded ad slot (hidden while the rewarded_ads flag is off). */}
            {coinsEarned != null && (
              <View style={{ alignSelf: 'stretch' }}>
                <RewardedAdButton context="solo_summary" />
              </View>
            )}

            {!matchData &&
              (isDaily ? (
                <TouchableOpacity
                  style={styles.resetBtn}
                  onPress={onShare}
                  {...a11yButton(tr(language, 'Partager', 'Share'))}
                >
                  <Share2 color="#fff" size={20} />
                  <Text style={styles.resetBtnText}>{tr(language, 'PARTAGER', 'SHARE')}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.resetBtn}
                  onPress={resetGame}
                  {...a11yButton(tr(language, 'Recommencer', 'Retry'))}
                >
                  <RefreshCcw color="#fff" size={20} />
                  <Text style={styles.resetBtnText}>{tr(language, 'RECOMMENCER', 'RETRY')}</Text>
                </TouchableOpacity>
              ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, userSelect: 'none' as never },
  header: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    minHeight: 60,
  },
  title: { fontSize: isMobile ? 16 : 18, fontFamily: FONTS.headingBlack },
  statsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  statValue: { fontSize: 15, fontFamily: FONTS.monoBold },
  iconBtn: { padding: 6, borderRadius: 10, borderWidth: 1 },
  lifeLost: {
    position: 'absolute',
    top: 64,
    right: 58,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  lifeLostText: { color: '#c0392b', fontFamily: FONTS.headingBlack, fontSize: 18 },
  gameArea: { padding: 16, alignItems: 'center' },
  question: { fontFamily: FONTS.mono, fontSize: 13, marginBottom: 14, textAlign: 'center' },
  globeWrap: {
    width: '100%',
    maxWidth: 520,
    height: 300,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  globe: { flex: 1, backgroundColor: 'transparent' },
  routeCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  routeChain: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    maxWidth: 180,
  },
  chipFlag: { width: 22, height: 15, borderRadius: 2 },
  chipDashed: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  chipText: { fontFamily: FONTS.headingBlack, fontSize: 14 },
  searchLabel: { fontFamily: FONTS.mono, fontSize: 13, textAlign: 'center' },
  searchBar: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.heading,
    fontSize: 16,
    paddingVertical: 12,
  },
  suggestions: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  suggestionFlag: { width: 30, height: 20, borderRadius: 3, borderWidth: 1 },
  resetBtn: {
    backgroundColor: '#c04a1a',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#a03a10',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resetBtnText: { color: '#fff', fontFamily: FONTS.monoBold, fontSize: 14, letterSpacing: 1 },
});
