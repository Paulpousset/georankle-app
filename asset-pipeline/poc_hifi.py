"""Proof of concept — high-fidelity render directions for the World avatar.

  Blender -b -P poc_hifi.py -- --dir A|B --ring saturn|asteroids --out /path/x.png [--samples N]

Direction A  "Réaliste"  : NASA textures (day/night/clouds/bump), PBR ocean specular,
                          atmosphere rim, sun light, deep space with stars.
Direction B  "Stylisé HD": extruded continents mesh, glossy saturated PBR materials,
                          chunky clouds, cinematic 3-point studio light, bloom, DoF.
Same camera as rig.json (fov 20°, d = 9.15) so the result is comparable with the
current cel-shaded pack.
"""
import bpy, math, os, sys
from mathutils import Vector, Matrix

ROOT = '/Users/paulpousset/rankle/georankle-app'
TEX = '/private/tmp/claude-501/-Users-paulpousset-rankle/412eda56-a296-4295-89f9-183d89f79900/scratchpad/hifi/tex'
GLB = f'{ROOT}/assets/models3d'

args = sys.argv[sys.argv.index('--') + 1:]
def arg(name, default=None):
    return args[args.index(name) + 1] if name in args else default
DIR = arg('--dir', 'A')
RING = arg('--ring', 'saturn')
OUT = arg('--out', '/tmp/poc.png')
SAMPLES = int(arg('--samples', '160'))
RES = int(arg('--res', '840'))
ZROT = float(arg('--zrot', '-88'))

# ── helpers ──────────────────────────────────────────────────────────────────
def set_in(node, name, value):
    """Set a socket by name if it exists (survives Principled renames across versions)."""
    for alt in ([name] if isinstance(name, str) else name):
        if alt in node.inputs:
            try:
                node.inputs[alt].default_value = value
                return True
            except Exception:
                pass
    return False

def hexc(h, a=1.0):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    # sRGB → linear
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b), a)

def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    return m, nt, out

def img(path, non_color=False):
    im = bpy.data.images.load(path)
    if non_color:
        im.colorspace_settings.name = 'Non-Color'
    return im

def dir_from(az_deg, el_deg):
    az, el = math.radians(az_deg), math.radians(el_deg)
    return Vector((math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el)))

def sun(name, az, el, strength, color, angle_deg=1.0):
    d = dir_from(az, el)
    L = bpy.data.lights.new(name, 'SUN')
    L.energy = strength
    L.color = hexc(color)[:3]
    L.angle = math.radians(angle_deg)
    o = bpy.data.objects.new(name, L)
    bpy.context.collection.objects.link(o)
    o.location = d * 10
    o.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    return o

def area(name, az, el, power, color, size, dist=7.0):
    d = dir_from(az, el)
    L = bpy.data.lights.new(name, 'AREA')
    L.energy = power
    L.color = hexc(color)[:3]
    L.size = size
    o = bpy.data.objects.new(name, L)
    bpy.context.collection.objects.link(o)
    o.location = d * dist
    o.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    return o

def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    roots = [o for o in new if o.parent is None]
    return roots, meshes

def smooth(o):
    try:
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.shade_smooth()
        o.select_set(False)
    except Exception:
        pass

# ── scene reset ──────────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.refresh_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = 'GPU'
except Exception as e:
    print('GPU setup failed, CPU:', e)
scene.render.resolution_x = scene.render.resolution_y = RES
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'
try:
    scene.view_settings.look = 'AgX - Punchy' if DIR == 'B' else 'AgX - Base Contrast'
except Exception:
    pass

# camera (rig parity)
cam_data = bpy.data.cameras.new('Cam')
cam_data.lens_unit = 'FOV'
cam_data.angle = math.radians(20)
cam = bpy.data.objects.new('Cam', cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (0, 0, 9.15)
cam.rotation_euler = (0, 0, 0)
scene.camera = cam
if DIR == 'B':
    cam_data.dof.use_dof = True
    cam_data.dof.focus_distance = 9.15
    cam_data.dof.aperture_fstop = 4.0

# ── world ────────────────────────────────────────────────────────────────────
world = bpy.data.worlds.new('W')
scene.world = world
world.use_nodes = True
wn = world.node_tree
for n in list(wn.nodes):
    wn.nodes.remove(n)
wout = wn.nodes.new('ShaderNodeOutputWorld')
bg = wn.nodes.new('ShaderNodeBackground')
# base deep-space colour
grad = wn.nodes.new('ShaderNodeTexGradient')
grad.gradient_type = 'SPHERICAL'
tc = wn.nodes.new('ShaderNodeTexCoord')
ramp = wn.nodes.new('ShaderNodeValToRGB')
if DIR == 'A':
    ramp.color_ramp.elements[0].color = hexc('#03050f')
    ramp.color_ramp.elements[1].color = hexc('#0a1228')
else:
    ramp.color_ramp.elements[0].color = hexc('#140a36')
    ramp.color_ramp.elements[1].color = hexc('#0b1e4a')
wn.links.new(tc.outputs['Generated'], grad.inputs['Vector'])
wn.links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
# stars: voronoi F1 distance thresholded
vor = wn.nodes.new('ShaderNodeTexVoronoi')
vor.inputs['Scale'].default_value = 220.0
try:
    vor.inputs['Randomness'].default_value = 1.0
except Exception:
    pass
mapr = wn.nodes.new('ShaderNodeMapRange')
mapr.inputs['From Min'].default_value = 0.0
mapr.inputs['From Max'].default_value = 0.09
mapr.inputs['To Min'].default_value = 1.0
mapr.inputs['To Max'].default_value = 0.0
mapr.clamp = True
pw = wn.nodes.new('ShaderNodeMath')
pw.operation = 'POWER'
pw.inputs[1].default_value = 6.0
mulS = wn.nodes.new('ShaderNodeMath')
mulS.operation = 'MULTIPLY'
mulS.inputs[1].default_value = 14.0 if DIR == 'A' else 16.0
wn.links.new(tc.outputs['Generated'], vor.inputs['Vector'])
wn.links.new(vor.outputs['Distance'], mapr.inputs['Value'])
wn.links.new(mapr.outputs['Result'], pw.inputs[0])
wn.links.new(pw.outputs['Value'], mulS.inputs[0])
addc = wn.nodes.new('ShaderNodeMixRGB')
addc.blend_type = 'ADD'
addc.inputs['Fac'].default_value = 1.0
wn.links.new(ramp.outputs['Color'], addc.inputs[1])
starcol = wn.nodes.new('ShaderNodeMixRGB')
starcol.blend_type = 'MULTIPLY'
starcol.inputs['Fac'].default_value = 1.0
starcol.inputs[2].default_value = hexc('#dfe8ff')
wn.links.new(mulS.outputs['Value'], starcol.inputs[1])
wn.links.new(starcol.outputs['Color'], addc.inputs[2])
wn.links.new(addc.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 1.0
wn.links.new(bg.outputs['Background'], wout.inputs['Surface'])

# ── globe orientation: Europe/Africa towards camera (+Z), north up (+Y) ──────
# Blender UV sphere: equirect u=0 at -Y... we rotate empirically: lng 10 → camera.
globe_rot = Matrix.Rotation(math.radians(-90), 4, 'X') @ Matrix.Rotation(math.radians(ZROT), 4, 'Z')
globe_rot = Matrix.Rotation(math.radians(-15), 4, 'X') @ globe_rot  # lat 15 tilt towards camera

def uv_sphere(name, r, seg=128, rings=64):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r)
    o = bpy.context.active_object
    o.name = name
    smooth(o)
    o.matrix_world = globe_rot @ o.matrix_world
    return o

# ── DIRECTION A : realistic earth ────────────────────────────────────────────
if DIR == 'A':
    earth = uv_sphere('Earth', 1.0)
    m, nt, out = new_mat('EarthA')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    day = nt.nodes.new('ShaderNodeTexImage'); day.image = img(f'{TEX}/earth_day_2k.png')
    spec = nt.nodes.new('ShaderNodeTexImage'); spec.image = img(f'{TEX}/earth_specular_2048.jpg', True)
    nrm = nt.nodes.new('ShaderNodeTexImage'); nrm.image = img(f'{TEX}/earth_normal_2048.jpg', True)
    night = nt.nodes.new('ShaderNodeTexImage'); night.image = img(f'{TEX}/earth_lights_2048.png')
    # colour: slightly boost saturation for punch
    hsv = nt.nodes.new('ShaderNodeHueSaturation')
    hsv.inputs['Saturation'].default_value = 1.25
    hsv.inputs['Value'].default_value = 1.05
    nt.links.new(day.outputs['Color'], hsv.inputs['Color'])
    nt.links.new(hsv.outputs['Color'], p.inputs['Base Color'])
    # roughness: ocean (bump dark) glossy, land rough
    # specular map: white = ocean → glossy; land rough
    rr = nt.nodes.new('ShaderNodeValToRGB')
    rr.color_ramp.elements[0].position = 0.1; rr.color_ramp.elements[0].color = (0.9, 0.9, 0.9, 1)
    rr.color_ramp.elements[1].position = 0.6; rr.color_ramp.elements[1].color = (0.18, 0.18, 0.18, 1)
    nt.links.new(spec.outputs['Color'], rr.inputs['Fac'])
    nt.links.new(rr.outputs['Color'], p.inputs['Roughness'])
    set_in(p, ['Specular IOR Level', 'Specular'], 0.7)
    nm2 = nt.nodes.new('ShaderNodeNormalMap'); nm2.inputs['Strength'].default_value = 0.8
    nt.links.new(nrm.outputs['Color'], nm2.inputs['Color'])
    nt.links.new(nm2.outputs['Normal'], p.inputs['Normal'])
    # night lights on the dark side: emission masked by (1 - N·sun)
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    dot = nt.nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    kd = dir_from(-35, 30)
    dot.inputs[1].default_value = (kd.x, kd.y, kd.z)
    nt.links.new(geo.outputs['Normal'], dot.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.15; mr.inputs['From Max'].default_value = -0.25
    mr.inputs['To Min'].default_value = 0.0; mr.inputs['To Max'].default_value = 1.0
    mr.clamp = True
    nt.links.new(dot.outputs['Value'], mr.inputs['Value'])
    nm = nt.nodes.new('ShaderNodeMixRGB'); nm.blend_type = 'MULTIPLY'; nm.inputs['Fac'].default_value = 1.0
    nt.links.new(night.outputs['Color'], nm.inputs[1])
    nt.links.new(mr.outputs['Result'], nm.inputs[2])
    warm = nt.nodes.new('ShaderNodeMixRGB'); warm.blend_type = 'MULTIPLY'; warm.inputs['Fac'].default_value = 1.0
    warm.inputs[2].default_value = hexc('#ffd28a')
    nt.links.new(nm.outputs['Color'], warm.inputs[1])
    if not set_in(p, 'Emission Color', (0, 0, 0, 1)):
        pass
    nt.links.new(warm.outputs['Color'], p.inputs['Emission Color' if 'Emission Color' in p.inputs else 'Emission'])
    set_in(p, 'Emission Strength', 6.0)
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    earth.data.materials.append(m)

    # clouds
    clouds = uv_sphere('Clouds', 1.012)
    m, nt, out = new_mat('CloudsA')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    ct = nt.nodes.new('ShaderNodeTexImage'); ct.image = img(f'{TEX}/earth_clouds_1k.png', True)
    p.inputs['Base Color'].default_value = (1, 1, 1, 1)
    p.inputs['Roughness'].default_value = 1.0
    cr = nt.nodes.new('ShaderNodeMath'); cr.operation = 'MULTIPLY'; cr.inputs[1].default_value = 1.1
    nt.links.new(ct.outputs['Alpha'], cr.inputs[0])
    nt.links.new(cr.outputs['Value'], p.inputs['Alpha'])
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    try:
        m.blend_method = 'HASHED'; m.shadow_method = 'HASHED'
    except Exception:
        pass
    clouds.data.materials.append(m)

    # atmosphere rim
    atm = uv_sphere('Atmo', 1.045)
    m, nt, out = new_mat('AtmoA')
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
    pw2 = nt.nodes.new('ShaderNodeMath'); pw2.operation = 'POWER'; pw2.inputs[1].default_value = 6.0
    nt.links.new(lw.outputs['Facing'], pw2.inputs[0])
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = hexc('#7cc0ff'); em.inputs['Strength'].default_value = 2.5
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(pw2.outputs['Value'], mix.inputs['Fac'])
    nt.links.new(tr.outputs['BSDF'], mix.inputs[1])
    nt.links.new(em.outputs['Emission'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    try:
        m.blend_method = 'BLEND'; m.shadow_method = 'NONE'
    except Exception:
        pass
    atm.data.materials.append(m)
    atm.visible_shadow = False

    sun('Key', -35, 30, 5.0, '#fff1dc', 0.8)
    sun('Fill', 60, -10, 0.25, '#bcd4ff', 3)
    sun('Rim', 160, 25, 1.2, '#9fc0ff', 2)

# ── DIRECTION B : stylised high-fidelity ─────────────────────────────────────
else:
    ocean = uv_sphere('Ocean', 1.0)
    m, nt, out = new_mat('OceanB')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    # subtle depth variation
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3.0
    try:
        nz.inputs['Detail'].default_value = 4.0
    except Exception:
        pass
    ocr = nt.nodes.new('ShaderNodeValToRGB')
    ocr.color_ramp.elements[0].color = hexc('#1457c8'); ocr.color_ramp.elements[1].color = hexc('#2a8df0')
    nt.links.new(nz.outputs['Fac'], ocr.inputs['Fac'])
    nt.links.new(ocr.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.28
    set_in(p, ['Coat Weight', 'Clearcoat'], 0.4)
    set_in(p, ['Coat Roughness', 'Clearcoat Roughness'], 0.15)
    set_in(p, ['Specular IOR Level', 'Specular'], 0.7)
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    ocean.data.materials.append(m)

    # extruded continents from the rig's shared land mesh
    roots, meshes = import_glb(f'{GLB}/globe_land.glb')
    m, nt, out = new_mat('LandB')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    # lighter tops (facing outwards) / darker sides: N·(position normalised)
    pos = nt.nodes.new('ShaderNodeVectorMath'); pos.operation = 'NORMALIZE'
    nt.links.new(geo.outputs['Position'], pos.inputs[0])
    dot = nt.nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    nt.links.new(geo.outputs['Normal'], dot.inputs[0])
    nt.links.new(pos.outputs['Vector'], dot.inputs[1])
    lr = nt.nodes.new('ShaderNodeValToRGB')
    lr.color_ramp.elements[0].position = 0.3; lr.color_ramp.elements[0].color = hexc('#2f8f3a')
    lr.color_ramp.elements[1].position = 0.95; lr.color_ramp.elements[1].color = hexc('#6fd35a')
    nt.links.new(dot.outputs['Value'], lr.inputs['Fac'])
    # patchy terrain variation
    nz2 = nt.nodes.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 9.0
    vr = nt.nodes.new('ShaderNodeValToRGB')
    vr.color_ramp.elements[0].color = hexc('#8fc850'); vr.color_ramp.elements[1].color = hexc('#3f9b3f')
    nt.links.new(nz2.outputs['Fac'], vr.inputs['Fac'])
    mixc = nt.nodes.new('ShaderNodeMixRGB'); mixc.blend_type = 'MULTIPLY'; mixc.inputs['Fac'].default_value = 0.35
    nt.links.new(lr.outputs['Color'], mixc.inputs[1]); nt.links.new(vr.outputs['Color'], mixc.inputs[2])
    nt.links.new(mixc.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.45
    set_in(p, ['Coat Weight', 'Clearcoat'], 0.25)
    bev = nt.nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.02
    nt.links.new(bev.outputs['Normal'], p.inputs['Normal'])
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    for o in meshes:
        o.data.materials.clear(); o.data.materials.append(m); smooth(o)
        try:
            o.data.use_auto_smooth = True
        except Exception:
            pass
    for r in roots:
        r.matrix_world = Matrix.Rotation(math.radians(-15), 4, 'X') @ Matrix.Rotation(math.radians(-90), 4, 'X') @ r.matrix_world

    # chunky stylised clouds: thresholded cloud map, slightly raised
    clouds = uv_sphere('Clouds', 1.03)
    m, nt, out = new_mat('CloudsB')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    ct = nt.nodes.new('ShaderNodeTexImage'); ct.image = img(f'{TEX}/earth_clouds_1k.png', True)
    thr = nt.nodes.new('ShaderNodeMath'); thr.operation = 'GREATER_THAN'; thr.inputs[1].default_value = 0.6
    nt.links.new(ct.outputs['Alpha'], thr.inputs[0])
    nt.links.new(thr.outputs['Value'], p.inputs['Alpha'])
    p.inputs['Base Color'].default_value = (1, 1, 1, 1)
    p.inputs['Roughness'].default_value = 0.8
    set_in(p, ['Subsurface Weight', 'Subsurface'], 0.3)
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    try:
        m.blend_method = 'CLIP'; m.shadow_method = 'CLIP'
    except Exception:
        pass
    clouds.data.materials.append(m)

    # tight cyan rim glow
    atm = uv_sphere('Atmo', 1.035)
    m, nt, out = new_mat('AtmoB')
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.4
    pw2 = nt.nodes.new('ShaderNodeMath'); pw2.operation = 'POWER'; pw2.inputs[1].default_value = 7.0
    nt.links.new(lw.outputs['Facing'], pw2.inputs[0])
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = hexc('#5fe0ff'); em.inputs['Strength'].default_value = 4.0
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(pw2.outputs['Value'], mix.inputs['Fac'])
    nt.links.new(tr.outputs['BSDF'], mix.inputs[1]); nt.links.new(em.outputs['Emission'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    atm.data.materials.append(m)
    atm.visible_shadow = False

    area('Key', -35, 30, 1500, '#fff0d8', 9.0)
    area('Fill', 60, -10, 250, '#9ec3ff', 7.0)
    area('Rim', 160, 25, 1400, '#7a6bff', 3.0)
    area('RimTop', 0, 80, 500, '#ffffff', 4.0)

# ── ring ─────────────────────────────────────────────────────────────────────
tilt = Matrix.Rotation(math.radians(22), 4, 'X')
if RING == 'saturn':
    if DIR == 'A':
        # dusty ice ring: banded alpha, translucent
        bpy.ops.mesh.primitive_circle_add(vertices=256, radius=1.55, fill_type='NGON')
        ring = bpy.context.active_object
        # make an annulus via a boolean-free trick: solidify nothing, use alpha mask by radius
        m, nt, out = new_mat('RingA')
        p = nt.nodes.new('ShaderNodeBsdfPrincipled')
        tc2 = nt.nodes.new('ShaderNodeTexCoord')
        ln = nt.nodes.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'
        nt.links.new(tc2.outputs['Object'], ln.inputs[0])
        bands = nt.nodes.new('ShaderNodeTexNoise'); bands.inputs['Scale'].default_value = 40.0
        try:
            bands.inputs['Detail'].default_value = 6.0; bands.inputs['Roughness'].default_value = 0.7
        except Exception:
            pass
        # radial-only noise: feed length as a vector
        cmb = nt.nodes.new('ShaderNodeCombineXYZ')
        nt.links.new(ln.outputs['Value'], cmb.inputs['X'])
        nt.links.new(cmb.outputs['Vector'], bands.inputs['Vector'])
        # radius mask 1.26..1.55 with soft edges
        mr1 = nt.nodes.new('ShaderNodeMapRange'); mr1.inputs['From Min'].default_value = 1.24; mr1.inputs['From Max'].default_value = 1.30; mr1.clamp = True
        mr2 = nt.nodes.new('ShaderNodeMapRange'); mr2.inputs['From Min'].default_value = 1.55; mr2.inputs['From Max'].default_value = 1.50; mr2.clamp = True
        nt.links.new(ln.outputs['Value'], mr1.inputs['Value']); nt.links.new(ln.outputs['Value'], mr2.inputs['Value'])
        mm = nt.nodes.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'
        nt.links.new(mr1.outputs['Result'], mm.inputs[0]); nt.links.new(mr2.outputs['Result'], mm.inputs[1])
        ma = nt.nodes.new('ShaderNodeMath'); ma.operation = 'MULTIPLY'
        nt.links.new(mm.outputs['Value'], ma.inputs[0]); nt.links.new(bands.outputs['Fac'], ma.inputs[1])
        mb = nt.nodes.new('ShaderNodeMath'); mb.operation = 'MULTIPLY'; mb.inputs[1].default_value = 1.6
        nt.links.new(ma.outputs['Value'], mb.inputs[0])
        nt.links.new(mb.outputs['Value'], p.inputs['Alpha'])
        cr2 = nt.nodes.new('ShaderNodeValToRGB')
        cr2.color_ramp.elements[0].color = hexc('#b9a888'); cr2.color_ramp.elements[1].color = hexc('#f1e6cf')
        nt.links.new(bands.outputs['Fac'], cr2.inputs['Fac'])
        nt.links.new(cr2.outputs['Color'], p.inputs['Base Color'])
        p.inputs['Roughness'].default_value = 0.8
        set_in(p, ['Subsurface Weight'], 0.2)
        nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
        try:
            m.blend_method = 'HASHED'; m.shadow_method = 'HASHED'
        except Exception:
            pass
        ring.data.materials.append(m)
        ring.matrix_world = tilt @ Matrix.Rotation(math.radians(90), 4, 'X') @ ring.matrix_world
    else:
        roots, meshes = import_glb(f'{GLB}/orbit_saturn.glb')
        m, nt, out = new_mat('RingB')
        p = nt.nodes.new('ShaderNodeBsdfPrincipled')
        tc2 = nt.nodes.new('ShaderNodeTexCoord')
        ln = nt.nodes.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'
        nt.links.new(tc2.outputs['Object'], ln.inputs[0])
        cr2 = nt.nodes.new('ShaderNodeValToRGB')
        cr2.color_ramp.interpolation = 'CONSTANT'
        cr2.color_ramp.elements[0].position = 0.0; cr2.color_ramp.elements[0].color = hexc('#ffd27a')
        e = cr2.color_ramp.elements.new(0.45); e.color = hexc('#ff9b5c')
        e = cr2.color_ramp.elements.new(0.7); e.color = hexc('#ffe3a8')
        mr1 = nt.nodes.new('ShaderNodeMapRange'); mr1.inputs['From Min'].default_value = 1.26; mr1.inputs['From Max'].default_value = 1.55; mr1.clamp = True
        nt.links.new(ln.outputs['Value'], mr1.inputs['Value']); nt.links.new(mr1.outputs['Result'], cr2.inputs['Fac'])
        nt.links.new(cr2.outputs['Color'], p.inputs['Base Color'])
        p.inputs['Roughness'].default_value = 0.2
        set_in(p, ['Coat Weight', 'Clearcoat'], 1.0)
        bev = nt.nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.01
        nt.links.new(bev.outputs['Normal'], p.inputs['Normal'])
        nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
        for o in meshes:
            o.data.materials.clear(); o.data.materials.append(m); smooth(o)
        bpy.context.view_layer.update()
        rmax = 0.0
        for o in meshes:
            for v in o.data.vertices:
                w = o.matrix_world @ v.co
                rmax = max(rmax, math.hypot(w.x, w.y), math.hypot(w.x, w.z))
        k = 1.55 / rmax if rmax > 0 else 1.0
        print('saturn glb rmax', rmax, 'scale', k)
        # glTF up (Y) lands on Blender Z after import: stand the ring up, then tilt it
        for r in roots:
            r.matrix_world = tilt @ Matrix.Rotation(math.radians(-90), 4, 'X') @ Matrix.Scale(k, 4) @ r.matrix_world
else:
    roots, meshes = import_glb(f'{GLB}/orbit_asteroids.glb')
    m, nt, out = new_mat('Rocks')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 25.0
    try:
        nz.inputs['Detail'].default_value = 8.0; nz.inputs['Roughness'].default_value = 0.75
    except Exception:
        pass
    cr = nt.nodes.new('ShaderNodeValToRGB')
    if DIR == 'A':
        cr.color_ramp.elements[0].color = hexc('#4a4038'); cr.color_ramp.elements[1].color = hexc('#9c8f80')
    else:
        cr.color_ramp.elements[0].color = hexc('#7a4a2e'); cr.color_ramp.elements[1].color = hexc('#c98f5a')
    nt.links.new(nz.outputs['Fac'], cr.inputs['Fac'])
    nt.links.new(cr.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.9 if DIR == 'A' else 0.5
    bn = nt.nodes.new('ShaderNodeBump'); bn.inputs['Strength'].default_value = 0.6 if DIR == 'A' else 0.25; bn.inputs['Distance'].default_value = 0.01
    nt.links.new(nz.outputs['Fac'], bn.inputs['Height'])
    if DIR == 'B':
        bev = nt.nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.02
        nt.links.new(bev.outputs['Normal'], bn.inputs['Normal'])
    nt.links.new(bn.outputs['Normal'], p.inputs['Normal'])
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    for o in meshes:
        o.data.materials.clear(); o.data.materials.append(m); smooth(o)
        # rocks: add a displace-ish subdivision for silhouette detail
        try:
            sub = o.modifiers.new('Sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
            if True:
                tex = bpy.data.textures.new('rock', 'CLOUDS'); tex.noise_scale = 0.08
                dis = o.modifiers.new('Dis', 'DISPLACE'); dis.texture = tex; dis.strength = 0.035 if DIR == 'A' else 0.02; dis.mid_level = 0.5
        except Exception as e:
            print('rock mods', e)
    for r in roots:
        r.matrix_world = tilt @ Matrix.Rotation(math.radians(-90), 4, 'X') @ r.matrix_world

# ── satellite: moon on the tilted ellipse at -45° ────────────────────────────
try:
    roots, meshes = import_glb(f'{GLB}/sat_moon.glb')
    m, nt, out = new_mat('Moon')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nz = nt.nodes.new('ShaderNodeTexVoronoi'); nz.inputs['Scale'].default_value = 14.0
    cr = nt.nodes.new('ShaderNodeValToRGB')
    if DIR == 'A':
        cr.color_ramp.elements[0].color = hexc('#8f8d88'); cr.color_ramp.elements[1].color = hexc('#d9d6cf')
    else:
        cr.color_ramp.elements[0].color = hexc('#cfd6e6'); cr.color_ramp.elements[1].color = hexc('#f4f6ff')
    nt.links.new(nz.outputs['Distance'], cr.inputs['Fac'])
    nt.links.new(cr.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.95 if DIR == 'A' else 0.35
    bn = nt.nodes.new('ShaderNodeBump'); bn.inputs['Strength'].default_value = 0.5 if DIR == 'A' else 0.2; bn.inputs['Distance'].default_value = 0.02
    nt.links.new(nz.outputs['Distance'], bn.inputs['Height'])
    nt.links.new(bn.outputs['Normal'], p.inputs['Normal'])
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    for o in meshes:
        o.data.materials.clear(); o.data.materials.append(m); smooth(o)
    a = math.radians(-45)
    ex, ey = math.cos(a) * 1.35, math.sin(a) * 0.52
    t = math.radians(18)
    sx = ex * math.cos(t) - ey * math.sin(t)
    sy = ex * math.sin(t) + ey * math.cos(t)
    # in rig space: x right, y up, z towards camera; front when sin(a) > 0
    for r in roots:
        r.location = (sx, -sy, 0.6 if math.sin(a) > 0 else -0.6)
        r.scale = (0.85, 0.85, 0.85)
except Exception as e:
    print('moon failed', e)

# ── emblem: Eiffel planted at lat 52 / lng 4 ─────────────────────────────────
try:
    roots, meshes = import_glb(f'{GLB}/emblem_eiffel.glb')
    m, nt, out = new_mat('Iron')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value = hexc('#7a4a2a') if DIR == 'A' else hexc('#c9702f')
    set_in(p, 'Metallic', 0.9 if DIR == 'A' else 0.6)
    p.inputs['Roughness'].default_value = 0.45 if DIR == 'A' else 0.3
    set_in(p, ['Coat Weight', 'Clearcoat'], 0.0 if DIR == 'A' else 0.6)
    bev = nt.nodes.new('ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.004
    nt.links.new(bev.outputs['Normal'], p.inputs['Normal'])
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    for o in meshes:
        o.data.materials.clear(); o.data.materials.append(m)
    lat, lng = math.radians(52), math.radians(4)
    # anchor direction in camera-facing frame: lng 0 towards +Z, north +Y
    n = Vector((math.cos(lat) * math.sin(lng), math.sin(lat), math.cos(lat) * math.cos(lng)))
    # keep it on the visible face relative to the globe's default face (lat 15, lng 10)
    n = Matrix.Rotation(math.radians(-15), 3, 'X') @ n
    q = n.to_track_quat('Z', 'Y')
    for r in roots:
        r.location = n * 1.0
        r.rotation_mode = 'QUATERNION'
        r.rotation_quaternion = q
        r.scale = (0.26, 0.26, 0.26)
except Exception as e:
    print('emblem failed', e)

# ── compositor bloom for B ───────────────────────────────────────────────────
if DIR == 'B':
    try:
        ng = bpy.data.node_groups.new('Comp', 'CompositorNodeTree')
        try:
            ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        except Exception as e:
            print('iface', e)
        rl = ng.nodes.new('CompositorNodeRLayers')
        rl.scene = scene
        gl = ng.nodes.new('CompositorNodeGlare')
        try:
            gl.inputs['Type'].default_value = 'Bloom'
        except Exception as e:
            print('glare type', e)
        for k, v in (('threshold', 1.0), ('mix', -0.4), ('size', 7), ('quality', 'HIGH')):
            try:
                setattr(gl, k, v)
            except Exception:
                pass
        for k, v in (('Threshold', 1.0), ('Strength', 0.4), ('Size', 0.7)):
            try:
                gl.inputs[k].default_value = v
            except Exception:
                pass
        outn = ng.nodes.new('NodeGroupOutput')
        ng.links.new(rl.outputs['Image'], gl.inputs['Image'])
        ng.links.new(gl.outputs['Image'], outn.inputs[0])
        scene.compositing_node_group = ng
        try:
            scene.render.use_compositing = True
        except Exception:
            pass
        print('bloom set')
    except Exception as e:
        print('bloom failed', e)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('WROTE', OUT)
