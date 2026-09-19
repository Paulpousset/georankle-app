"""Direction C — "Cartoon HD" (Fortnite / Pixar register) for the World avatar.

  Blender -b -P poc_cartoon.py -- --item globe:classic --out x.png [--res 480] [--samples 64]
      kinds: globe:<style> | emblem:<id> | sat:<id> | orbit:<id> | hero

Look: chunky readable shapes, saturated flat-ish colours, soft 3-band cel shading
with cast shadows (Shader-to-RGB, EEVEE), crisp specular dot, cool rim light,
puffy volumetric-looking clouds, bloom. No outlines: volume and light do the work.
Same rig camera (fov 20°, d 9.15) for globes and orbits; close-ups for emblems
and satellites.
"""
import bpy, math, os, sys, random
from mathutils import Vector, Matrix

ROOT = '/Users/paulpousset/rankle/georankle-app'
GLB = f'{ROOT}/assets/models3d'
TEXG = f'{ROOT}/asset-pipeline/textures_globe'

args = sys.argv[sys.argv.index('--') + 1:]
def arg(name, default=None):
    return args[args.index(name) + 1] if name in args else default
ITEM = arg('--item', 'globe:classic')
OUT = arg('--out', '/tmp/poc_c.png')
RES = int(arg('--res', '480'))
SAMPLES = int(arg('--samples', '64'))
KIND, _, ID = ITEM.partition(':')

random.seed(7)

# ── helpers ──────────────────────────────────────────────────────────────────
def hexc(h, a=1.0):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b), a)

def set_in(node, names, value):
    for n in ([names] if isinstance(names, str) else names):
        if n in node.inputs:
            try:
                node.inputs[n].default_value = value
                return True
            except Exception:
                pass
    return False

def dir_from(az_deg, el_deg):
    az, el = math.radians(az_deg), math.radians(el_deg)
    return Vector((math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el)))

def area(name, az, el, power, color, size, dist=7.0, target=None):
    d = dir_from(az, el)
    L = bpy.data.lights.new(name, 'AREA')
    L.energy = power
    L.color = hexc(color)[:3]
    L.size = size
    L.use_shadow = True
    o = bpy.data.objects.new(name, L)
    bpy.context.collection.objects.link(o)
    t = target or Vector((0, 0, 0))
    o.location = t + d * dist
    o.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    return o

def smooth(o):
    try:
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.shade_smooth()
        o.select_set(False)
    except Exception:
        pass

def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    return [o for o in new if o.parent is None], [o for o in new if o.type == 'MESH']

# ── ToonHD material ──────────────────────────────────────────────────────────
# Diffuse → Shader-to-RGB → soft 3-band ramp (keeps cast shadows) × colour,
# + thresholded glossy dot, + cool rim, all summed as emission (EEVEE only).
def toon_hd(name, color=None, color_socket=None, rough=0.35, rim='#7fe8ff', rim_k=0.55,
            spec_k=0.45, emissive=0.0, shadow_tint='#3a3f8a'):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')

    # base colour source
    if color_socket is None:
        rgb = nt.nodes.new('ShaderNodeRGB')
        rgb.outputs[0].default_value = hexc(color or '#ffffff')
        col_out = rgb.outputs[0]
    else:
        col_out = color_socket(nt)

    dif = nt.nodes.new('ShaderNodeBsdfDiffuse')
    s2r = nt.nodes.new('ShaderNodeShaderToRGB')
    nt.links.new(dif.outputs['BSDF'], s2r.inputs['Shader'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'EASE'
    e = ramp.color_ramp.elements
    e[0].position = 0.06; e[0].color = hexc(shadow_tint)
    e[1].position = 0.26; e[1].color = (0.62, 0.62, 0.68, 1)
    e2 = e.new(0.42); e2.color = (1.0, 1.0, 1.0, 1)
    e3 = e.new(0.9); e3.color = (1.12, 1.12, 1.08, 1)
    nt.links.new(s2r.outputs['Color'], ramp.inputs['Fac'])
    shade = nt.nodes.new('ShaderNodeMixRGB'); shade.blend_type = 'MULTIPLY'; shade.inputs['Fac'].default_value = 1.0
    nt.links.new(col_out, shade.inputs[1])
    nt.links.new(ramp.outputs['Color'], shade.inputs[2])

    # specular dot
    glo = nt.nodes.new('ShaderNodeBsdfGlossy'); glo.inputs['Roughness'].default_value = rough
    s2r2 = nt.nodes.new('ShaderNodeShaderToRGB')
    nt.links.new(glo.outputs['BSDF'], s2r2.inputs['Shader'])
    sr = nt.nodes.new('ShaderNodeValToRGB'); sr.color_ramp.interpolation = 'EASE'
    sr.color_ramp.elements[0].position = 0.35; sr.color_ramp.elements[0].color = (0, 0, 0, 1)
    sr.color_ramp.elements[1].position = 0.6; sr.color_ramp.elements[1].color = (spec_k, spec_k, spec_k, 1)
    nt.links.new(s2r2.outputs['Color'], sr.inputs['Fac'])

    # rim
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.45
    pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 3.5
    nt.links.new(lw.outputs['Facing'], pw.inputs[0])
    rimc = nt.nodes.new('ShaderNodeMixRGB'); rimc.blend_type = 'MULTIPLY'; rimc.inputs['Fac'].default_value = 1.0
    rimc.inputs[2].default_value = hexc(rim)
    rimk = nt.nodes.new('ShaderNodeMath'); rimk.operation = 'MULTIPLY'; rimk.inputs[1].default_value = rim_k
    nt.links.new(pw.outputs['Value'], rimk.inputs[0])
    nt.links.new(rimk.outputs['Value'], rimc.inputs[1])

    add1 = nt.nodes.new('ShaderNodeMixRGB'); add1.blend_type = 'ADD'; add1.inputs['Fac'].default_value = 1.0
    nt.links.new(shade.outputs['Color'], add1.inputs[1]); nt.links.new(sr.outputs['Color'], add1.inputs[2])
    add2 = nt.nodes.new('ShaderNodeMixRGB'); add2.blend_type = 'ADD'; add2.inputs['Fac'].default_value = 1.0
    nt.links.new(add1.outputs['Color'], add2.inputs[1]); nt.links.new(rimc.outputs['Color'], add2.inputs[2])
    if emissive > 0:
        em = nt.nodes.new('ShaderNodeMixRGB'); em.blend_type = 'ADD'; em.inputs['Fac'].default_value = 1.0
        emk = nt.nodes.new('ShaderNodeMixRGB'); emk.blend_type = 'MULTIPLY'; emk.inputs['Fac'].default_value = 1.0
        emk.inputs[2].default_value = (emissive, emissive, emissive, 1)
        nt.links.new(col_out, emk.inputs[1])
        nt.links.new(add2.outputs['Color'], em.inputs[1]); nt.links.new(emk.outputs['Color'], em.inputs[2])
        final = em.outputs['Color']
    else:
        final = add2.outputs['Color']
    emis = nt.nodes.new('ShaderNodeEmission'); emis.inputs['Strength'].default_value = 1.0
    nt.links.new(final, emis.inputs['Color'])
    nt.links.new(emis.outputs['Emission'], out.inputs['Surface'])
    return m

# spherical projection of an equirect texture from object-space position
def style_texture_socket(style, sat=1.15, val=1.0):
    def build(nt):
        tc = nt.nodes.new('ShaderNodeTexCoord')
        nrm = nt.nodes.new('ShaderNodeVectorMath'); nrm.operation = 'NORMALIZE'
        nt.links.new(tc.outputs['Object'], nrm.inputs[0])
        sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(nrm.outputs['Vector'], sep.inputs[0])
        # object space (glTF import + UV sphere): up = local +Z, front = local -Y
        negy = nt.nodes.new('ShaderNodeMath'); negy.operation = 'MULTIPLY'; negy.inputs[1].default_value = -1.0
        nt.links.new(sep.outputs['Y'], negy.inputs[0])
        at = nt.nodes.new('ShaderNodeMath'); at.operation = 'ARCTAN2'
        nt.links.new(sep.outputs['X'], at.inputs[0]); nt.links.new(negy.outputs['Value'], at.inputs[1])
        u = nt.nodes.new('ShaderNodeMath'); u.operation = 'MULTIPLY_ADD'
        u.inputs[1].default_value = 1 / (2 * math.pi); u.inputs[2].default_value = 0.5
        nt.links.new(at.outputs['Value'], u.inputs[0])
        asn = nt.nodes.new('ShaderNodeMath'); asn.operation = 'ARCSINE'
        nt.links.new(sep.outputs['Z'], asn.inputs[0])
        v = nt.nodes.new('ShaderNodeMath'); v.operation = 'MULTIPLY_ADD'
        v.inputs[1].default_value = 1 / math.pi; v.inputs[2].default_value = 0.5
        nt.links.new(asn.outputs['Value'], v.inputs[0])
        cmb = nt.nodes.new('ShaderNodeCombineXYZ')
        nt.links.new(u.outputs['Value'], cmb.inputs['X']); nt.links.new(v.outputs['Value'], cmb.inputs['Y'])
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(f'{TEXG}/{style}.png')
        tex.extension = 'REPEAT'
        nt.links.new(cmb.outputs['Vector'], tex.inputs['Vector'])
        hsv = nt.nodes.new('ShaderNodeHueSaturation'); hsv.inputs['Saturation'].default_value = sat; hsv.inputs['Value'].default_value = val
        nt.links.new(tex.outputs['Color'], hsv.inputs['Color'])
        return hsv.outputs['Color']
    return build

EMISSIVE_HINT = ('neon', 'fire', 'firefl', 'rainbow', 'comet', 'shooting', 'flame', 'glow', 'lava', 'st_star', 'st_comet', 'lamp', 'light')

def restyle_glb(meshes, item_id, default_hex='#c8c8c8', rim='#7fe8ff'):
    """Hide outline shells, give every toon part a ToonHD material in its own colour."""
    for o in meshes:
        kinds = set(); hexes = []
        for m in o.data.materials:
            if not m:
                continue
            kinds.add(str(m.get('ggKind', '')))
            hexes.append(str(m.get('ggHex', default_hex)))
        if 'outline' in kinds or o.name.endswith('_ol'):
            o.hide_render = True; o.hide_viewport = True
            continue
        hx = hexes[0] if hexes else default_hex
        if not hx.startswith('#'):
            hx = default_hex
        lname = (o.name + ' ' + ' '.join(kinds)).lower()
        emis = 2.5 if any(h in lname for h in ('flame', 'glow', 'emis', 'lamp', 'light', 'fire')) else 0.0
        if any(h in item_id for h in ('neon', 'fire', 'firefl', 'rainbow', 'comet', 'shooting', 'st_star')):
            emis = max(emis, 1.6)
        o.data.materials.clear()
        o.data.materials.append(toon_hd(f'T_{o.name}', color=hx, rim=rim, emissive=emis, rough=0.3))
        smooth(o)

# ── scene ────────────────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
ev = scene.eevee
for k, v in (('taa_render_samples', SAMPLES), ('use_shadows', True), ('use_raytracing', True),
             ('use_fast_gi', True), ('shadow_ray_count', 2), ('shadow_step_count', 4)):
    try:
        setattr(ev, k, v)
    except Exception as e:
        print('eevee', k, e)
scene.render.resolution_x = scene.render.resolution_y = RES
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'Standard'
try:
    scene.view_settings.look = 'None'
except Exception:
    pass

cam_data = bpy.data.cameras.new('Cam'); cam_data.lens_unit = 'FOV'; cam_data.angle = math.radians(20)
cam = bpy.data.objects.new('Cam', cam_data); bpy.context.collection.objects.link(cam)
cam.location = (0, 0, 9.15); cam.rotation_euler = (0, 0, 0)
scene.camera = cam

# world: violet→navy gradient + soft bokeh stars
world = bpy.data.worlds.new('W'); scene.world = world; world.use_nodes = True
wn = world.node_tree
for n in list(wn.nodes):
    wn.nodes.remove(n)
wout = wn.nodes.new('ShaderNodeOutputWorld'); bg = wn.nodes.new('ShaderNodeBackground')
tc = wn.nodes.new('ShaderNodeTexCoord'); grad = wn.nodes.new('ShaderNodeTexGradient'); grad.gradient_type = 'SPHERICAL'
ramp = wn.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color = hexc('#1a0f4a'); ramp.color_ramp.elements[1].color = hexc('#0c2a66')
wn.links.new(tc.outputs['Generated'], grad.inputs['Vector']); wn.links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
vor = wn.nodes.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 60.0
try:
    vor.feature = 'SMOOTH_F1'; vor.inputs['Smoothness'].default_value = 0.4
except Exception:
    pass
mr = wn.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.0; mr.inputs['From Max'].default_value = 0.12
mr.inputs['To Min'].default_value = 1.0; mr.inputs['To Max'].default_value = 0.0; mr.clamp = True
pw = wn.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 5.0
mul = wn.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 0.9
wn.links.new(tc.outputs['Generated'], vor.inputs['Vector']); wn.links.new(vor.outputs['Distance'], mr.inputs['Value'])
wn.links.new(mr.outputs['Result'], pw.inputs[0]); wn.links.new(pw.outputs['Value'], mul.inputs[0])
addc = wn.nodes.new('ShaderNodeMixRGB'); addc.blend_type = 'ADD'; addc.inputs['Fac'].default_value = 1.0
wn.links.new(ramp.outputs['Color'], addc.inputs[1])
stc = wn.nodes.new('ShaderNodeMixRGB'); stc.blend_type = 'MULTIPLY'; stc.inputs['Fac'].default_value = 1.0
stc.inputs[2].default_value = hexc('#b8d4ff')
wn.links.new(mul.outputs['Value'], stc.inputs[1]); wn.links.new(stc.outputs['Color'], addc.inputs[2])
wn.links.new(addc.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 1.0
wn.links.new(bg.outputs['Background'], wout.inputs['Surface'])

def studio_lights(target=None, scale=1.0):
    area('Key', -35, 32, 1400 * scale, '#fff1d6', 5.0, target=target)
    area('Fill', 60, -8, 260 * scale, '#9ec7ff', 7.0, target=target)
    area('RimR', 150, 25, 1500 * scale, '#66f0ff', 3.0, target=target)
    area('RimL', -150, 15, 900 * scale, '#c66bff', 3.0, target=target)
    area('Top', 0, 82, 420 * scale, '#ffffff', 5.0, target=target)

# ── globe assembly (used by globe / orbit / hero / emblem) ───────────────────
TILT_LAT = Matrix.Rotation(math.radians(-15), 4, 'X')
UP_FIX = Matrix.Rotation(math.radians(-90), 4, 'X')   # glTF Y-up → our Y-up with +Z front

def build_globe(style, clouds=True, atmosphere=True):
    # ocean sphere: object space must have +Z front / +Y up for the projection → rotate the DATA not the object
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1.0)
    ocean = bpy.context.active_object; ocean.name = 'Ocean'; smooth(ocean)
    ocean.matrix_world = TILT_LAT @ UP_FIX
    dark = style in ('night', 'eclipse', 'lava', 'cyber', 'hologram', 'biolum', 'st_fractured', 'st_galaxy')
    ocean.data.materials.append(toon_hd('Ocean', color_socket=style_texture_socket(style, 1.2, 1.05),
                                        rough=0.25, spec_k=0.55, rim_k=0.6, emissive=0.9 if dark else 0.0))
    roots, meshes = import_glb(f'{GLB}/globe_land.glb')
    land = toon_hd('Land', color_socket=style_texture_socket(style, 1.25, 1.02), rough=0.5, spec_k=0.25, rim_k=0.5,
                   emissive=0.9 if dark else 0.0)
    # rounded edges on the extruded continents
    bev = land.node_tree.nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.025
    for n in land.node_tree.nodes:
        if n.type == 'BSDF_DIFFUSE' or n.type == 'BSDF_GLOSSY':
            land.node_tree.links.new(bev.outputs['Normal'], n.inputs['Normal'])
    for o in meshes:
        o.data.materials.clear(); o.data.materials.append(land); smooth(o)
    for r in roots:
        r.matrix_world = TILT_LAT @ UP_FIX @ r.matrix_world
    # style props (volcanoes, ice caps, crown…)
    pp = f'{GLB}/globe_{style}_props.glb'
    if os.path.exists(pp):
        proots, pmeshes = import_glb(pp)
        restyle_glb(pmeshes, style)
        for r in proots:
            r.matrix_world = TILT_LAT @ UP_FIX @ r.matrix_world
    if clouds and not dark:
        cm = toon_hd('Cloud', color='#ffffff', rough=0.6, spec_k=0.15, rim='#dff6ff', rim_k=0.35, shadow_tint='#8fa0ff')
        rnd = random.Random(11)
        for c in range(9):
            # keep clouds off the emblem anchor (top front)
            lat = math.radians(rnd.uniform(-55, 40)); lng = math.radians(rnd.uniform(-150, 150))
            base = Vector((math.cos(lat) * math.sin(lng), math.sin(lat), math.cos(lat) * math.cos(lng)))
            for k in range(rnd.randint(3, 5)):
                off = Vector((rnd.uniform(-0.12, 0.12), rnd.uniform(-0.05, 0.05), rnd.uniform(-0.12, 0.12)))
                p = (base * 1.0 + off).normalized() * rnd.uniform(1.06, 1.09)
                r = rnd.uniform(0.05, 0.11)
                bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=r, location=TILT_LAT @ p)
                s = bpy.context.active_object; smooth(s); s.data.materials.append(cm)
                s.scale = (1.0, 0.7, 1.0)
    if atmosphere:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1.035)
        atm = bpy.context.active_object; smooth(atm)
        m = bpy.data.materials.new('Atmo'); m.use_nodes = True; nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.4
        pw2 = nt.nodes.new('ShaderNodeMath'); pw2.operation = 'POWER'; pw2.inputs[1].default_value = 6.0
        nt.links.new(lw.outputs['Facing'], pw2.inputs[0])
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = hexc('#7fe8ff'); em.inputs['Strength'].default_value = 3.0
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mix = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(pw2.outputs['Value'], mix.inputs['Fac']); nt.links.new(tr.outputs['BSDF'], mix.inputs[1]); nt.links.new(em.outputs['Emission'], mix.inputs[2])
        nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
        atm.data.materials.append(m)
        atm.visible_shadow = False

def add_emblem(eid, scale=0.30):
    roots, meshes = import_glb(f'{GLB}/emblem_{eid}.glb')
    restyle_glb(meshes, eid)
    lat, lng = math.radians(52), math.radians(4)
    n = Vector((math.cos(lat) * math.sin(lng), math.sin(lat), math.cos(lat) * math.cos(lng)))
    n = Matrix.Rotation(math.radians(-15), 3, 'X') @ n
    q = n.to_track_quat('Z', 'Y')
    for r in roots:
        r.location = n * 1.0
        r.rotation_mode = 'QUATERNION'; r.rotation_quaternion = q
        r.scale = (scale, scale, scale)
    return n

def add_moon(angle_deg=-45, sid='moon'):
    roots, meshes = import_glb(f'{GLB}/sat_{sid}.glb')
    restyle_glb(meshes, sid, default_hex='#f1efe6')
    a = math.radians(angle_deg)
    ex, ey = math.cos(a) * 1.35, math.sin(a) * 0.52
    t = math.radians(18)
    sx = ex * math.cos(t) - ey * math.sin(t); sy = ex * math.sin(t) + ey * math.cos(t)
    for r in roots:
        r.location = (sx, -sy, 0.6 if math.sin(a) > 0 else -0.6)
        r.scale = (0.9, 0.9, 0.9)

def add_orbit(oid):
    roots, meshes = import_glb(f'{GLB}/orbit_{oid}.glb')
    restyle_glb(meshes, oid, default_hex='#b98860', rim='#ffe9b0')
    tilt = Matrix.Rotation(math.radians(22), 4, 'X')
    for o in meshes:
        if oid == 'asteroids':
            try:
                o.modifiers.new('Sub', 'SUBSURF').levels = 1
                o.modifiers['Sub'].render_levels = 1
                tex = bpy.data.textures.new('rock', 'CLOUDS'); tex.noise_scale = 0.1
                dis = o.modifiers.new('Dis', 'DISPLACE'); dis.texture = tex; dis.strength = 0.03
            except Exception:
                pass
    for r in roots:
        r.matrix_world = tilt @ UP_FIX @ r.matrix_world

# ── bloom (Blender 5 compositor) ─────────────────────────────────────────────
def bloom(strength=0.35, threshold=1.0):
    try:
        ng = bpy.data.node_groups.new('Comp', 'CompositorNodeTree')
        try:
            ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        except Exception:
            pass
        rl = ng.nodes.new('CompositorNodeRLayers'); rl.scene = scene
        gl = ng.nodes.new('CompositorNodeGlare')
        try:
            gl.inputs['Type'].default_value = 'Bloom'
        except Exception:
            pass
        for k, v in (('Threshold', threshold), ('Strength', strength), ('Size', 0.6)):
            try:
                gl.inputs[k].default_value = v
            except Exception:
                pass
        outn = ng.nodes.new('NodeGroupOutput')
        ng.links.new(rl.outputs['Image'], gl.inputs['Image']); ng.links.new(gl.outputs['Image'], outn.inputs[0])
        scene.compositing_node_group = ng
        scene.render.use_compositing = True
    except Exception as e:
        print('bloom failed', e)

# ── items ────────────────────────────────────────────────────────────────────
if KIND == 'globe':
    build_globe(ID, clouds=ID in ('classic', 'pastel', 'gaia', 'satellite', 'political', 'vintage'))
    add_moon()
    studio_lights()
    bloom(0.3)
elif KIND == 'hero':
    build_globe('classic', clouds=True)
    add_emblem('eiffel', 0.30)
    add_orbit('saturn')
    add_moon()
    studio_lights()
    bloom(0.3)
elif KIND == 'orbit':
    build_globe('classic', clouds=False)
    add_orbit(ID)
    studio_lights()
    bloom(0.5 if any(h in ID for h in ('neon', 'fire', 'rainbow', 'firefl')) else 0.3)
elif KIND == 'emblem':
    build_globe('classic', clouds=False, atmosphere=True)
    n = add_emblem(ID, 0.30)
    # close-up: camera 3.2 units out along the anchor normal, slightly above, looking at the monument
    look = n * 1.2
    campos = look + (n * 0.5 + Vector((0.3, 0.1, 1.0))).normalized() * 3.3
    f = (look - campos).normalized()
    right = f.cross(n).normalized(); up = right.cross(f).normalized()
    rot = Matrix((right, up, -f)).transposed().to_4x4()
    cam.matrix_world = Matrix.Translation(campos) @ rot
    studio_lights(target=look, scale=0.55)
    bloom(0.25)
elif KIND == 'sat':
    roots, meshes = import_glb(f'{GLB}/sat_{ID}.glb')
    restyle_glb(meshes, ID, default_hex='#f1efe6')
    bpy.context.view_layer.update()
    # normalise to ~1.3 units and give a 3/4 view
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        if o.hide_render:
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    size = max(hi - lo); ctr = (lo + hi) / 2
    k = 1.3 / max(size, 1e-6)
    view = Matrix.Rotation(math.radians(-18), 4, 'X') @ Matrix.Rotation(math.radians(35), 4, 'Y') @ UP_FIX
    for r in roots:
        r.matrix_world = view @ Matrix.Translation(-ctr * 0) @ Matrix.Scale(k, 4) @ Matrix.Translation(-ctr) @ r.matrix_world
    cam.location = (0, 0, 6.2)
    studio_lights(scale=0.5)
    bloom(0.3)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('WROTE', OUT)
