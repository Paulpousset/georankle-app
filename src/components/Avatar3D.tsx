import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';

import GlobeWebView from './GlobeWebView';
import type { WebViewMessageEvent } from './GlobeWebView';
import type { AvatarConfig } from '../types';
import { buildAvatarSpec } from '../data/avatar3d';

interface Avatar3DProps {
  config: AvatarConfig;
  size: number;
  /** Allow drag-to-rotate. */
  interactive?: boolean;
  style?: object;
}

/**
 * three.js page: loads the hero GLB (KayKit, rigged + animated), hides its
 * built-in weapons, attaches the equipped gear to the hand-slot bones, plays
 * the Idle animation, and stands the character in the environment (sky +
 * ground + fog). The user drag-rotates; there is no auto-spin.
 *
 * IMPORTANT: rigged GLBs must never be cloned (skeleton bindings break).
 */
function buildHtml(interactive: boolean): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no,maximum-scale=1">
<style>
  html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent;}
  canvas{display:block;touch-action:none;}
</style>
</head>
<body>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
<script>
var SPEC=null;
var INTERACTIVE=${interactive ? 'true' : 'false'};
var scene,camera,renderer,spinGroup,groundMesh,mixer;
var clock=null;
var dragging=false,lastX=0,lastY=0,velY=0;
var loadToken=0;

function post(s){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(s);else if(window.parent!==window)window.parent.postMessage(s,'*');}

// ── Toon gradient for the ground disc ────────────────────────────────────────
var _toonGrad=null;
function toonGradient(){
  if(_toonGrad)return _toonGrad;
  var cv=document.createElement('canvas');cv.width=4;cv.height=1;var x=cv.getContext('2d');
  var steps=['#777777','#a8a8a8','#d6d6d6','#ffffff'];
  for(var i=0;i<4;i++){x.fillStyle=steps[i];x.fillRect(i,0,1,1);}
  var t=new THREE.CanvasTexture(cv);t.minFilter=THREE.NearestFilter;t.magFilter=THREE.NearestFilter;
  _toonGrad=t;return t;
}

// ── Environment sky (canvas texture + vignette) ──────────────────────────────
function makeBackground(bg){
  var S=256,cv=document.createElement('canvas');cv.width=cv.height=S;var x=cv.getContext('2d');
  var c=(bg&&bg.colors)||['#2a4a74','#16263f'];
  function rngFor(seed){var s=seed;return function(){s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff;};}
  if(bg&&bg.kind==='stars'){
    var g0=x.createLinearGradient(0,0,0,S);g0.addColorStop(0,c[1]||c[0]);g0.addColorStop(1,c[0]);x.fillStyle=g0;x.fillRect(0,0,S,S);
    var rnd=rngFor(7);for(var i=0;i<140;i++){var a=0.3+rnd()*0.7;x.fillStyle='rgba(255,255,255,'+a+')';x.beginPath();x.arc(rnd()*S,rnd()*S,rnd()*1.3,0,6.28);x.fill();}
  } else if(bg&&bg.kind==='grid'){
    var g1=x.createLinearGradient(0,0,0,S);g1.addColorStop(0,c[0]);g1.addColorStop(1,c[1]||c[0]);x.fillStyle=g1;x.fillRect(0,0,S,S);
    x.strokeStyle='rgba(120,240,255,0.30)';x.lineWidth=1;for(var u=0;u<=S;u+=24){x.beginPath();x.moveTo(u,0);x.lineTo(u,S);x.stroke();x.beginPath();x.moveTo(0,u);x.lineTo(S,u);x.stroke();}
  } else {
    var g=x.createLinearGradient(0,0,0,S);g.addColorStop(0,c[0]);g.addColorStop(1,c[1]||c[0]);x.fillStyle=g;x.fillRect(0,0,S,S);
  }
  var v=x.createRadialGradient(S*0.5,S*0.45,S*0.3,S*0.5,S*0.5,S*0.78);
  v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,0.30)');
  x.fillStyle=v;x.fillRect(0,0,S,S);
  var t=new THREE.CanvasTexture(cv);if(THREE.sRGBEncoding)t.encoding=THREE.sRGBEncoding;return t;
}

function clearGroup(g){while(g.children.length){g.remove(g.children[g.children.length-1]);}}

// ── Hero + gear loading ───────────────────────────────────────────────────────
var GEAR_RE=/sword|shield|axe|staff|wand|dagger|crossbow|spellbook|bow|arrow|mug|smokebomb/i;

function applySpec(spec){
  SPEC=spec;
  if(!scene)return;
  scene.background=makeBackground(spec.bg);
  var groundCol=(spec.bg&&spec.bg.ground)||'#1c3050';
  if(groundMesh)groundMesh.material.color=new THREE.Color(groundCol);
  if(scene.fog)scene.fog.color=new THREE.Color((spec.bg&&spec.bg.colors&&spec.bg.colors[1])||groundCol);
  clearGroup(spinGroup);
  mixer=null;
  var token=++loadToken;
  var loader=new THREE.GLTFLoader();
  loader.load(spec.heroUrl,function(g){
    if(token!==loadToken)return; // newer spec arrived while loading
    var root=g.scene;
    // Hide the hero's built-in weapons — gear comes from the shop.
    root.traverse(function(o){if(o.isMesh&&GEAR_RE.test(o.name))o.visible=false;});
    // Scale to scene height and stand on the ground disc.
    var box=new THREE.Box3().setFromObject(root);
    var size=new THREE.Vector3();box.getSize(size);
    var k=size.y>0?5.6/size.y:1;
    root.scale.set(k,k,k);
    box.setFromObject(root);
    root.position.y+=-4.7-box.min.y;
    spinGroup.add(root);
    // Idle animation keeps the hero alive (subtle breathing/sway).
    var idle=(g.animations||[]).find(function(a){return a.name==='Idle';})||(g.animations||[]).find(function(a){return /idle/i.test(a.name);});
    if(idle){mixer=new THREE.AnimationMixer(root);mixer.clipAction(idle).play();}
    // Attach equipped gear to the hand-slot bones.
    (spec.attachments||[]).forEach(function(att){
      var slot=null;
      root.traverse(function(o){if(o.name===att.bone)slot=o;});
      if(!slot)return;
      loader.load(att.url,function(ga){if(token===loadToken)slot.add(ga.scene);},undefined,function(){post('gear-error');});
    });
    post('hero-loaded');
  },undefined,function(){post('glb-error');});
}
window.applySpec=applySpec;

function bindDrag(){
  var el=renderer.domElement;
  function down(x,y){dragging=true;lastX=x;lastY=y;}
  function move(x,y){if(!dragging)return;var dx=x-lastX;lastX=x;lastY=y;spinGroup.rotation.y+=dx*0.01;velY=dx*0.01;}
  function up(){dragging=false;}
  el.addEventListener('pointerdown',function(e){down(e.clientX,e.clientY);});
  window.addEventListener('pointermove',function(e){move(e.clientX,e.clientY);});
  window.addEventListener('pointerup',up);
  el.addEventListener('touchstart',function(e){var t=e.touches[0];down(t.clientX,t.clientY);},{passive:true});
  window.addEventListener('touchmove',function(e){if(dragging&&e.cancelable)e.preventDefault();var t=e.touches[0];move(t.clientX,t.clientY);},{passive:false});
  window.addEventListener('touchend',up);
}

function init(){
  var w=window.innerWidth,h=window.innerHeight;
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(35,w/h,0.1,100);camera.position.set(0,-1.0,12);camera.lookAt(0,-1.55,0);
  scene.fog=new THREE.Fog(new THREE.Color('#16263f'),13,24);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(w,h);
  if(THREE.sRGBEncoding)renderer.outputEncoding=THREE.sRGBEncoding;
  if(THREE.ACESFilmicToneMapping){renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;}
  document.body.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff,0x5a647e,0.95));
  var key=new THREE.DirectionalLight(0xfff2dd,1.0);key.position.set(3,4,5);scene.add(key);
  var rim=new THREE.DirectionalLight(0xdfe8ff,0.45);rim.position.set(-3,2,-4);scene.add(rim);
  // Ground disc + soft shadow blob (never cleared by applySpec).
  groundMesh=new THREE.Mesh(new THREE.CylinderGeometry(9,9,0.12,48),new THREE.MeshToonMaterial({color:new THREE.Color('#1c3050'),gradientMap:toonGradient()}));
  groundMesh.position.set(0,-4.76,0);scene.add(groundMesh);
  var shCv=document.createElement('canvas');shCv.width=256;shCv.height=128;
  var sx=shCv.getContext('2d');sx.translate(128,64);sx.scale(1,0.5);
  var sg=sx.createRadialGradient(0,0,10,0,0,118);
  sg.addColorStop(0,'rgba(15,18,28,0.40)');sg.addColorStop(1,'rgba(15,18,28,0)');
  sx.fillStyle=sg;sx.fillRect(-128,-128,256,256);
  var shadow=new THREE.Mesh(new THREE.PlaneGeometry(4.2,2.1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shCv),transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.set(0,-4.66,0.1);scene.add(shadow);
  spinGroup=new THREE.Group();scene.add(spinGroup);
  // Pleasant 3/4 presentation angle; the user rotates from there.
  spinGroup.rotation.y=-0.3;
  if(SPEC)applySpec(SPEC);
  if(INTERACTIVE)bindDrag();
  clock=new THREE.Clock();
  function loop(){
    requestAnimationFrame(loop);
    var dt=clock.getDelta();
    if(mixer)mixer.update(dt);
    if(!dragging&&Math.abs(velY)>0.0001){spinGroup.rotation.y+=velY;velY*=0.95;}
    renderer.render(scene,camera);
  }
  loop();
  post('ready');
}

window.addEventListener('resize',function(){if(!renderer)return;var w=window.innerWidth,h=window.innerHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);});
if(window.THREE&&window.THREE.GLTFLoader)init();else{var iv=setInterval(function(){if(window.THREE&&window.THREE.GLTFLoader){clearInterval(iv);init();}},50);}
</script>
</body>
</html>`;
}

export function Avatar3D({ config, size, interactive = true, style }: Avatar3DProps) {
  const ref = useRef<{ injectJavaScript: (code: string) => void } | null>(null);
  const readyRef = useRef(false);
  const specRef = useRef('');
  const specJson = useMemo(() => JSON.stringify(buildAvatarSpec(config)), [config]);

  // HTML is built once; the spec is always delivered via injection.
  const html = useMemo(() => buildHtml(interactive), [interactive]);

  useEffect(() => {
    specRef.current = specJson;
    if (readyRef.current) ref.current?.injectJavaScript(`window.applySpec(${specJson});true;`);
  }, [specJson]);

  const onMessage = (e: WebViewMessageEvent) => {
    if (e.nativeEvent.data === 'ready') {
      readyRef.current = true;
      if (specRef.current) ref.current?.injectJavaScript(`window.applySpec(${specRef.current});true;`);
    }
  };

  return (
    <View style={[{ width: size, height: size }, style]}>
      <GlobeWebView
        ref={ref as never}
        source={{ html }}
        onMessage={onMessage}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      />
    </View>
  );
}
