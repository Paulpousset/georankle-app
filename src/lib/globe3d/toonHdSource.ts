/**
 * ToonHD — the « Cartoon HD » shading of the Blender rig, ported to three.js.
 *
 * ONE source for every live scene (avatar preview, gameplay globes, menu globe):
 * the JS below is spliced verbatim after the vendored three.js in the WebView
 * HTML (same mechanism as the polygons). It reads the SAME rig.json tables the
 * rig renders with (`toon`, `lights`), so the live scene stays superposable
 * with the pre-rendered layers — asset-pipeline/rigbuild/common.py `toon_hd`
 * is the reference implementation:
 *
 *   Blender : Diffuse → Shader-to-RGB → ColorRamp EASE (3 soft bands, real cast
 *             shadows) × colour + thresholded Glossy dot + Layer-Weight rim,
 *             summed as emission, lit by 5 area lights.
 *   three   : custom ShaderMaterial (lights:true) — the diffuse LUMINANCE of the
 *             5 directional lights (key with a shadow map) goes through the same
 *             ramp AFTER summing (the rig loses the light colours in the ramp
 *             too), Blinn-Phong dot thresholded the same way, same fresnel rim.
 *
 * No outlines anywhere: legacy `outline`/`landink` shells in old GLBs are hidden.
 * Bloom (UnrealBloomPass, vendored) is the only thing the rig does NOT bake
 * into the layers: it lives here, on HDR emissives (ggEmis > 1).
 *
 * Exposed as `window.ToonHD` (see the API at the bottom of the source).
 */
export const TOON_HD_JS = String.raw`
var ToonHD=(function(){
'use strict';
// ── Python-compatible Mersenne Twister (random.Random(seed)) ────────────────
// The rig scatters its clouds with Python's RNG; reproducing it bit for bit is
// what keeps the placeholder layer and the live clouds superposable.
function PyRandom(seed){
  var mt=new Array(624),idx=625;
  function seed32(s){mt[0]=s>>>0;for(var i=1;i<624;i++){var p=mt[i-1]^(mt[i-1]>>>30);
    mt[i]=((((p&0xffff0000)>>>16)*1812433253)<<16)+((p&0xffff)*1812433253)+i;mt[i]>>>=0;}idx=624;}
  function initByArray(key){seed32(19650218);var i=1,j=0,k=Math.max(624,key.length);
    for(;k;k--){var p=mt[i-1]^(mt[i-1]>>>30);
      mt[i]=((mt[i]^((((p&0xffff0000)>>>16)*1664525)<<16)+((p&0xffff)*1664525))+key[j]+j)>>>0;
      i++;j++;if(i>=624){mt[0]=mt[623];i=1;}if(j>=key.length)j=0;}
    for(k=623;k;k--){var q=mt[i-1]^(mt[i-1]>>>30);
      mt[i]=((mt[i]^((((q&0xffff0000)>>>16)*1566083941)<<16)+((q&0xffff)*1566083941))-i)>>>0;
      i++;if(i>=624){mt[0]=mt[623];i=1;}}
    mt[0]=0x80000000;idx=624;}
  function gen(){if(idx>=624){for(var i=0;i<624;i++){var y=(mt[i]&0x80000000)|(mt[(i+1)%624]&0x7fffffff);
      mt[i]=mt[(i+397)%624]^(y>>>1)^((y&1)?0x9908b0df:0);}idx=0;}
    var y=mt[idx++];y^=y>>>11;y^=(y<<7)&0x9d2c5680;y^=(y<<15)&0xefc60000;y^=y>>>18;return y>>>0;}
  // Python seeds an int with init_by_array of its 32-bit limbs.
  var key=[];var s=Math.abs(seed)>>>0;do{key.push(s&0xffffffff);s=Math.floor(s/4294967296);}while(s>0);
  initByArray(key);
  var api={};
  api.random=function(){var a=gen()>>>5,b=gen()>>>6;return (a*67108864+b)/9007199254740992;};
  api.uniform=function(lo,hi){return lo+(hi-lo)*api.random();};
  api.randint=function(lo,hi){var n=hi-lo+1,k=0;for(var t=n-1;t;t>>>=1)k++;
    for(;;){var r=gen()>>>(32-k);if(r<n)return lo+r;}};
  return api;
}

// ── Shader ───────────────────────────────────────────────────────────────────
var VERT=[
'#include <common>',
'#include <shadowmap_pars_vertex>',
'varying vec3 vNormal;varying vec3 vViewPosition;varying vec2 vUv;',
'void main(){',
'  vUv=uv;',
'  vec3 transformed=position;vec3 objectNormal=normal;',
'  #ifdef USE_INSTANCING',
'  transformed=(instanceMatrix*vec4(transformed,1.0)).xyz;objectNormal=mat3(instanceMatrix)*objectNormal;',
'  #endif',
'  vec3 transformedNormal=normalMatrix*objectNormal;',
'  vNormal=normalize(transformedNormal);',
'  vec4 mvPosition=modelViewMatrix*vec4(transformed,1.0);',
'  vViewPosition=-mvPosition.xyz;',
'  gl_Position=projectionMatrix*mvPosition;',
'  vec4 worldPosition=modelMatrix*vec4(transformed,1.0);',
'  #include <shadowmap_vertex>',
'}'].join('\n');
var FRAG=[
'#include <common>',
'#include <packing>',
'#include <lights_pars_begin>',
'#include <shadowmap_pars_fragment>',
'uniform vec3 uColor;uniform float uOpacity;uniform float uEmis;uniform float uAlbedo;',
'uniform vec4 uRampPos;uniform vec3 uRamp0;uniform vec3 uRamp1;uniform vec3 uRamp2;uniform vec3 uRamp3;',
'uniform vec2 uSpecT;uniform float uSpecK;uniform float uShin;uniform float uSpecScale;',
'uniform vec3 uRimColor;uniform float uRimK;uniform float uRimPow;uniform float uRimBlend;',
'uniform float uLitMix;uniform float uSat;uniform float uVal;',
'#ifdef TOON_MAP',
'uniform sampler2D tMap;',
'#endif',
'varying vec3 vNormal;varying vec3 vViewPosition;varying vec2 vUv;',
'float ease(float a,float b,float x){float t=clamp((x-a)/max(1e-5,b-a),0.0,1.0);return t*t*(3.0-2.0*t);}',
'vec3 ramp(float f){vec3 c=uRamp0;c=mix(c,uRamp1,ease(uRampPos.x,uRampPos.y,f));',
'  c=mix(c,uRamp2,ease(uRampPos.y,uRampPos.z,f));c=mix(c,uRamp3,ease(uRampPos.z,uRampPos.w,f));return c;}',
'vec3 satur(vec3 c,float s,float v){float l=dot(c,vec3(0.2126,0.7152,0.0722));return max(vec3(0.0),mix(vec3(l),c,s))*v;}',
'void main(){',
'  vec3 base=uColor;float alpha=uOpacity;',
'  #ifdef TOON_MAP',
'  vec4 tx=texture2D(tMap,vUv);base*=satur(tx.rgb,uSat,uVal);alpha*=tx.a;',
'  #ifdef TOON_ALPHATEST',
'  if(alpha<0.02)discard;',
'  #endif',
'  #endif',
'  vec3 N=normalize(vNormal);if(!gl_FrontFacing)N=-N;vec3 V=normalize(vViewPosition);',
'  float lum=0.0;float spec=0.0;',
'  #if NUM_DIR_LIGHTS > 0',
'  vec3 L;vec3 H;float ndl;float sh;float w;',
'  #pragma unroll_loop_start',
'  for(int i=0;i<NUM_DIR_LIGHTS;i++){',
'    L=directionalLights[ i ].direction;w=dot(directionalLights[ i ].color,vec3(0.2126,0.7152,0.0722));',
'    ndl=max(dot(N,L),0.0);sh=1.0;',
'    #if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )',
'    sh=getShadow(directionalShadowMap[ i ],directionalLightShadows[ i ].shadowMapSize,directionalLightShadows[ i ].shadowIntensity,directionalLightShadows[ i ].shadowBias,directionalLightShadows[ i ].shadowRadius,vDirectionalShadowCoord[ i ]);',
'    #endif',
'    lum+=w*ndl*sh*uAlbedo;',
'    H=normalize(L+V);spec+=w*pow(max(dot(N,H),0.0),uShin)*sh*uSpecScale;',
'  }',
'  #pragma unroll_loop_end',
'  #endif',
'  vec3 shade=mix(ramp(lum),vec3(1.0),1.0-uLitMix);',
'  float sp=ease(uSpecT.x,uSpecT.y,spec)*uSpecK;',
'  float facing=1.0-pow(max(dot(N,V),0.0),uRimBlend);',
'  vec3 rim=uRimColor*pow(facing,uRimPow)*uRimK;',
'  vec3 col=base*shade+vec3(sp)+rim+base*uEmis;',
'  gl_FragColor=vec4(col,alpha);',
'  #include <colorspace_fragment>',
'}'].join('\n');

var CFG=null;
function cfg(){return CFG||(CFG={diffuseAlbedo:0.8,ramp:[[0.06,[0.0423,0.0497,0.2582]],[0.26,[0.62,0.62,0.68]],[0.42,[1,1,1]],[0.9,[1.12,1.12,1.08]]],
  spec:{threshold:[0.35,0.6],strength:0.45,roughness:0.35},rim:{color:'#7fe8ff',power:3.5,strength:0.55,blend:0.45},
  clouds:{styles:['classic','pastel','gaia','satellite','political','vintage'],seed:11,count:9,radius:[1.06,1.09],size:[0.05,0.11],squash:0.7},
  atmosphere:{radius:1.035,color:'#7fe8ff',power:6,strength:3},darkStyles:['night','eclipse','lava','cyber','hologram','biolum','st_fractured','st_galaxy'],
  darkEmissive:0.9,bloom:{threshold:1,strength:0.3,radius:0.6}});}
function configure(toon){CFG=toon||null;return cfg();}
// Blender's Layer Weight « blend » remap (node_layer_weight): 0.45 → 0.9.
function blendPow(b){b=Math.min(b,1-1e-5);return b<0.5?2*b:0.5/(1-b);}

/** Material. opts: {color, map, emissive, opacity, transparent, side, litMix,
 *  specK, rimK, rimColor, rough, sat, val, alphaTest, shadowTint, depthWrite} */
function material(opts){
  opts=opts||{};var T=cfg();
  var col=opts.color instanceof THREE.Color?opts.color.clone():new THREE.Color(opts.color||'#ffffff');
  var stops=T.ramp;
  var shadowTint=new THREE.Color(opts.shadowTint||stops[0][1]);
  if(opts.shadowTint===undefined&&Array.isArray(stops[0][1]))shadowTint=new THREE.Color().setRGB(stops[0][1][0],stops[0][1][1],stops[0][1][2]);
  // Blinn-Phong exponent from the glossy roughness (GGX-ish remap α=r^1.5:
  // r 0.35 → ~45, r 0.25 → ~80, r 0.5 → ~14), tuned so the key light's dot has
  // the pack's size — a crisp DOT, not a wash over half the ocean.
  var rough=opts.rough!=null?opts.rough:T.spec.roughness;
  var al=Math.pow(rough,1.5);
  var shin=Math.max(6,Math.round(2/(al*al)-2));
  var uniforms=THREE.UniformsUtils.merge([THREE.UniformsLib.lights,{
    uColor:{value:col},uOpacity:{value:opts.opacity!=null?opts.opacity:1},
    uEmis:{value:opts.emissive||0},uAlbedo:{value:T.diffuseAlbedo},
    uRampPos:{value:new THREE.Vector4(stops[0][0],stops[1][0],stops[2][0],stops[3][0])},
    uRamp0:{value:shadowTint},
    uRamp1:{value:new THREE.Vector3().fromArray(stops[1][1])},
    uRamp2:{value:new THREE.Vector3().fromArray(stops[2][1])},
    uRamp3:{value:new THREE.Vector3().fromArray(stops[3][1])},
    uSpecT:{value:new THREE.Vector2(T.spec.threshold[0],T.spec.threshold[1])},
    uSpecK:{value:opts.specK!=null?opts.specK:T.spec.strength},
    uShin:{value:shin},uSpecScale:{value:0.30},
    uRimColor:{value:new THREE.Color(opts.rimColor||T.rim.color)},
    uRimK:{value:opts.rimK!=null?opts.rimK:T.rim.strength},
    uRimPow:{value:T.rim.power},uRimBlend:{value:blendPow(T.rim.blend)},
    uLitMix:{value:opts.litMix!=null?opts.litMix:1},
    uSat:{value:opts.sat!=null?opts.sat:1},uVal:{value:opts.val!=null?opts.val:1},
    tMap:{value:opts.map||null},
  }]);
  // UniformsUtils.merge clones values: put the live objects back.
  uniforms.uColor.value=col;uniforms.tMap.value=opts.map||null;
  var defines={};
  if(opts.map)defines.TOON_MAP='';
  if(opts.alphaTest)defines.TOON_ALPHATEST='';
  var m=new THREE.ShaderMaterial({uniforms:uniforms,vertexShader:VERT,fragmentShader:FRAG,lights:true,
    defines:defines,transparent:!!opts.transparent,side:opts.side||THREE.FrontSide,
    depthWrite:opts.depthWrite!=null?opts.depthWrite:!opts.transparent});
  m.userData.toonHd=true;
  m.color=col; // convenience for the colour pulses (same object as the uniform)
  Object.defineProperty(m,'map',{get:function(){return uniforms.tMap.value;},
    set:function(t){uniforms.tMap.value=t;if(t&&!m.defines.TOON_MAP){m.defines.TOON_MAP='';m.needsUpdate=true;}
      if(!t&&m.defines.TOON_MAP){delete m.defines.TOON_MAP;m.needsUpdate=true;}}});
  Object.defineProperty(m,'emissiveStrength',{get:function(){return uniforms.uEmis.value;},set:function(v){uniforms.uEmis.value=v;}});
  Object.defineProperty(m,'opacity',{get:function(){return uniforms.uOpacity.value;},set:function(v){uniforms.uOpacity.value=v;}});
  return m;
}

// ── Lights: the 5 studio area lights of rig.json as directionals ────────────
function dirFrom(c){var az=c.azimuthDeg*Math.PI/180,el=c.elevationDeg*Math.PI/180;
  return new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el));}
/** opts: {shadow:true, shadowSize:1024, extent:2.4} → {lights:[], key} */
function lights(scene,L,opts){
  opts=opts||{};var out=[],key=null;
  ['key','fill','rimR','rimL','top'].forEach(function(k){var c=L[k];if(!c)return;
    var l=new THREE.DirectionalLight(new THREE.Color(c.color),c.intensity*(opts.scale||1));
    l.position.copy(dirFrom(c)).multiplyScalar(12);
    l.target.position.set(0,0,0);scene.add(l);scene.add(l.target);
    if(c.shadow&&opts.shadow!==false){
      l.castShadow=true;var e=opts.extent||2.4,sz=opts.shadowSize||1024;
      l.shadow.mapSize.set(sz,sz);
      l.shadow.camera.left=-e;l.shadow.camera.right=e;l.shadow.camera.top=e;l.shadow.camera.bottom=-e;
      l.shadow.camera.near=4;l.shadow.camera.far=24;
      l.shadow.bias=-0.0006;l.shadow.normalBias=0.02;l.shadow.radius=3;
      key=l;}
    out.push(l);});
  return {lights:out,key:key};
}
function enableShadows(renderer){renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;}

// ── GLB materials: Blender extras (ggKind/ggHex/ggEmis/ggAlpha) → ToonHD ───
/** opts: {landInk (ignored, legacy), rimColor} */
function remapMaterials(root,opts){opts=opts||{};
  root.traverse(function(n){
    if(!n.isMesh||!n.material)return;
    var ud=n.material.userData||{};
    var kind=ud.ggKind||'toon',hex=ud.ggHex||'#c8c8c8';
    var alpha=(ud.ggAlpha!=null)?ud.ggAlpha:1,emis=ud.ggEmis||0;
    n.userData.ggKind=kind;
    if(n.material.dispose)n.material.dispose();
    if(kind==='outline'||kind==='landink'||/_ol(\.|$)/.test(n.name)){
      // Cartoon HD has no outline shells (legacy GLBs only).
      n.visible=false;n.material=new THREE.MeshBasicMaterial({visible:false});return;}
    if(kind==='atmo'){n.visible=false;return;}
    if(kind==='flat'&&alpha<1){
      // Glow halos: unlit, additive-looking, HDR so the bloom picks them up.
      var c=new THREE.Color(hex);if(emis>0)c.multiplyScalar(emis);
      n.material=new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:alpha,depthWrite:false});
      n.castShadow=false;n.receiveShadow=false;return;}
    if(kind==='landtex'){
      n.material=material({color:'#ffffff',rough:0.5,specK:0.25,rimK:0.5,sat:1.25,val:1.02,rimColor:opts.rimColor});
    }else{
      n.material=material({color:hex,emissive:emis,rough:0.3,rimColor:opts.rimColor});
    }
    n.castShadow=true;n.receiveShadow=true;
  });}

// ── Clouds: the rig's clusters (same RNG, same seed) merged into one mesh ────
function mergeSpheres(list){ // [{p:Vector3, r, q:Quaternion, sy}]
  var pos=[],nor=[],uv=[],idx=[],base=0;
  var m=new THREE.Matrix4(),nm=new THREE.Matrix3();
  list.forEach(function(s){
    var g=new THREE.SphereGeometry(s.r,16,10);
    m.compose(s.p,s.q,new THREE.Vector3(1,1,s.sy));nm.getNormalMatrix(m);
    var p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv,v=new THREE.Vector3();
    for(var i=0;i<p.count;i++){
      v.fromBufferAttribute(p,i).applyMatrix4(m);pos.push(v.x,v.y,v.z);
      v.fromBufferAttribute(n,i).applyMatrix3(nm).normalize();nor.push(v.x,v.y,v.z);
      uv.push(u.getX(i),u.getY(i));}
    var ix=g.index.array;for(var j=0;j<ix.length;j++)idx.push(ix[j]+base);
    base+=p.count;g.dispose();});
  var geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(idx);return geo;}
/** Cloud clusters in the CAMERA frame (x right, y up, z toward the camera),
 *  exactly as rigbuild/builders_globes._clouds draws them. */
function clouds(){
  var C=cfg().clouds,rnd=PyRandom(C.seed),list=[];
  var up=new THREE.Vector3(0,0,1);
  for(var c=0;c<C.count;c++){
    var lat=rnd.uniform(-55,40)*Math.PI/180,lng=rnd.uniform(-150,150)*Math.PI/180;
    var base=new THREE.Vector3(Math.cos(lat)*Math.sin(lng),Math.sin(lat),Math.cos(lat)*Math.cos(lng));
    var k=rnd.randint(3,5);
    for(var j=0;j<k;j++){
      var off=new THREE.Vector3(rnd.uniform(-0.12,0.12),rnd.uniform(-0.05,0.05),rnd.uniform(-0.12,0.12));
      var p=base.clone().add(off).normalize().multiplyScalar(rnd.uniform(C.radius[0],C.radius[1]));
      var r=rnd.uniform(C.size[0],C.size[1]);
      // squashed along its own normal (Blender: track Z to the normal, scale z)
      var q=new THREE.Quaternion().setFromUnitVectors(up,p.clone().normalize());
      list.push({p:p,r:r,q:q,sy:C.squash});}}
  var mesh=new THREE.Mesh(mergeSpheres(list),material({color:'#ffffff',rough:0.6,specK:0.15,rimColor:'#dff6ff',rimK:0.35,shadowTint:'#8fa0ff'}));
  mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='toonClouds';
  return mesh;}

// ── Atmosphere shell (fresnel, additive) ────────────────────────────────────
function atmosphere(color,radius,power,strength){
  var A=cfg().atmosphere;
  return new THREE.Mesh(new THREE.SphereGeometry(radius||A.radius*1.05,48,48),
    new THREE.ShaderMaterial({
      uniforms:{c:{value:new THREE.Color(color||A.color)},p:{value:power||A.power*0.6},s:{value:strength!=null?strength:A.strength*0.3}},
      vertexShader:'varying vec3 vN;varying vec3 vP;void main(){vN=normalize(normalMatrix*normal);vP=normalize((modelViewMatrix*vec4(position,1.)).xyz);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform vec3 c;uniform float p;uniform float s;varying vec3 vN;varying vec3 vP;void main(){float f=pow(1.0-abs(dot(vN,-vP)),p)*s;gl_FragColor=vec4(c,1.0)*f;}',
      blending:THREE.AdditiveBlending,side:THREE.BackSide,transparent:true,depthWrite:false}));}

// ── Bloom (EffectComposer + UnrealBloomPass, HDR) ───────────────────────────
/** Returns {render(), setSize(w,h), composer} or null when the passes are not vendored. */
function bloom(renderer,scene,camera,W,H,opts){
  if(typeof THREE.EffectComposer!=='function'||typeof THREE.UnrealBloomPass!=='function')return null;
  var B=cfg().bloom;opts=opts||{};
  var composer=new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene,camera));
  var pass=new THREE.UnrealBloomPass(new THREE.Vector2(W,H),opts.strength!=null?opts.strength:B.strength,B.radius,B.threshold);
  composer.addPass(pass);
  if(typeof THREE.OutputPass==='function')composer.addPass(new THREE.OutputPass());
  return {composer:composer,pass:pass,
    render:function(){composer.render();},
    setSize:function(w,h){composer.setSize(w,h);pass.setSize(w,h);},
    dispose:function(){composer.dispose();}};
}

return {PyRandom:PyRandom,configure:configure,material:material,lights:lights,enableShadows:enableShadows,
  remapMaterials:remapMaterials,clouds:clouds,atmosphere:atmosphere,bloom:bloom,dirFrom:dirFrom,cfg:cfg};
})();
`;
