# Story-map Blender kit — pro-cartoon pre-rendered biome bands + sprites.
# Runs inside the already-open avatar_rig.blend via the blender-mcp socket.
# NEVER saves the .blend — everything lives in throwaway scenes
# 'StoryBand' / 'StorySprites'; renders go to asset-pipeline/out/story/.
import bpy, math, random, os
from math import radians, sin, pi

OUT = '/Users/paulpousset/rankle/georankle-app/asset-pipeline/out/story'
os.makedirs(OUT, exist_ok=True)

# ── app geometry (StoryMap.tsx, reference width 390 logical px) ───────────────
W_PX, BAND_PX, ROW_PX = 390.0, 1180.0, 118.0
CENTER, AMP = 195.0, 101.4          # amp = clamp(390*.26, 58, 130)
PXU = 10.0                          # 1 blender unit = 10 px
# Props lie on their BACK, head up-screen (like billboards): the top-down camera
# sees their front, upright and sunlit — leaning them forward reads as "fallen".
TILT = radians(-80)
TILT_FLAT = radians(-16)            # ground features that must hug the terrain
FLAT_KINDS = {'islet', 'wave', 'snow'}

def river_px(r):
    """x in px for row r (nodes at r=0..9); 2 full sine periods per band."""
    return CENTER + AMP * sin(2 * pi * r / 5.0)

def u(x_px, y_px, z=0.0):
    """map px (y down, band top=0) → blender units, band centered at origin."""
    return ((x_px - CENTER) / PXU, (BAND_PX / 2 - y_px) / PXU, z)

# ── colors ────────────────────────────────────────────────────────────────────
def lin(hexs):
    h = hexs.lstrip('#')
    v = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in v) + (1.0,)

def mixhex(a, b, t):
    ha, hb = a.lstrip('#'), b.lstrip('#')
    return '#' + ''.join('%02x' % round(int(ha[i:i+2],16)*(1-t) + int(hb[i:i+2],16)*t) for i in (0,2,4))

def shade(hexs, amt):
    return mixhex(hexs, '#ffffff' if amt > 0 else '#000000', abs(amt))

BIOMES = {
  'prairie':  dict(bank=('#7cb04a','#4a7c3a'), river=('#6fb8e0','#2f7ca5'), rim='#c04a1a',
                   decor=['tree','pine','flower','grass','rock','cloud'], feature='hills',
                   fcol='#3c6a30', night=False),
  'desert':   dict(bank=('#eccb86','#c4872a'), river=('#7fd6e6','#2e8ac0'), rim='#a8541a',
                   decor=['cactus','rock','grass_dry','cloud'], feature='dunes',
                   fcol='#b07a28', night=False),
  'volcan':   dict(bank=('#43302f','#1a1010'), river=('#ffc24a','#d0341a'), rim='#ffce7a',
                   decor=['ember','rock_dark','crystal_o','rock_dark'], feature='volcano',
                   fcol='#1a0f0d', night=True),
  'glace':    dict(bank=('#e3edf4','#a9c9df'), river=('#d0f0ff','#7fb6dd'), rim='#1a4a7a',
                   decor=['pine_snow','crystal_b','snow','rock_snow'], feature='iceberg',
                   fcol='#c3dced', night=False),
  'jungle':   dict(bank=('#3f7c34','#173d18'), river=('#5fc0ac','#238a78'), rim='#e0b040',
                   decor=['tree','fern','palm','flower'], feature='canopy',
                   fcol='#123012', night=False),
  'archipel': dict(bank=('#39a0d0','#1a4a7a'), river=('#9ee8f4','#3aa8d8'), rim='#e0b060',
                   decor=['palm','islet','wave','rock'], feature='island',
                   fcol='#d9c48a', night=False),
  'savane':   dict(bank=('#dcb85e','#a8772a'), river=('#7fd6e6','#2e8ac0'), rim='#7a3f14',
                   decor=['acacia','grass_dry','rock','cloud'], feature='hills',
                   fcol='#9a6a24', night=False),
  'cosmos':   dict(bank=('#141c40','#070a1c'), river=('#7f8cff','#2a2a8a'), rim='#9a7cff',
                   decor=['star','crystal_p','comet','star'], feature='starfield',
                   fcol='#20265a', night=True),
}

# ── scenes ────────────────────────────────────────────────────────────────────
def purge_kit_materials():
    for m in list(bpy.data.materials):
        if m.name.startswith('SK_'):
            bpy.data.materials.remove(m)

def fresh_scene(name, res, ortho, transparent):
    purge_kit_materials()
    if name in bpy.data.scenes:
        scn = bpy.data.scenes[name]
        for o in list(scn.collection.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        scn = bpy.data.scenes.new(name)
    bpy.context.window.scene = scn
    r = scn.render
    r.engine = 'BLENDER_EEVEE'
    r.resolution_x, r.resolution_y = res
    r.film_transparent = transparent
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA' if transparent else 'RGB'
    scn.view_settings.view_transform = 'Standard'
    try:
        scn.eevee.taa_render_samples = 64
    except Exception:
        pass
    if scn.world is None:
        scn.world = bpy.data.worlds.new(name + '_world')
    scn.world.use_nodes = True
    bg = scn.world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.32, 0.34, 0.38, 1)
        bg.inputs[1].default_value = 0.85
    cam_d = bpy.data.cameras.new(name + '_cam')
    cam_d.type = 'ORTHO'
    cam_d.ortho_scale = ortho
    cam = bpy.data.objects.new(name + '_cam', cam_d)
    cam.location = (0, 0, 90)
    scn.collection.objects.link(cam)
    scn.camera = cam
    sun_d = bpy.data.lights.new(name + '_sun', 'SUN')
    sun_d.energy = 3.8
    sun_d.color = (1.0, 0.97, 0.90)
    sun_d.angle = radians(9)
    sun = bpy.data.objects.new(name + '_sun', sun_d)
    # beam heads down-right-toward-viewer: light from the TOP-LEFT of the image,
    # so camera-leaning props are lit and shadows fall down-screen
    sun.rotation_euler = (radians(-38), 0, radians(24))
    scn.collection.objects.link(sun)
    return scn

# ── materials ─────────────────────────────────────────────────────────────────
def _bands_group(nt, out_sock, levels):
    """Diffuse→ShaderToRGB→const ramp (banded light) ready to multiply."""
    d = nt.nodes.new('ShaderNodeBsdfDiffuse'); d.inputs['Color'].default_value = (1,1,1,1)
    s2 = nt.nodes.new('ShaderNodeShaderToRGB')
    rmp = nt.nodes.new('ShaderNodeValToRGB')
    cr = rmp.color_ramp; cr.interpolation = 'CONSTANT'
    cr.elements[0].position = 0.0
    cr.elements[0].color = (levels[0],) * 3 + (1,)
    cr.elements[1].position = 0.30
    cr.elements[1].color = (levels[1],) * 3 + (1,)
    e = cr.elements.new(0.58); e.color = (levels[2],) * 3 + (1,)
    nt.links.new(d.outputs[0], s2.inputs[0])
    nt.links.new(s2.outputs[0], rmp.inputs[0])
    nt.links.new(rmp.outputs['Color'], out_sock)

def toon(name, base, patch=None, noise=6.0, emit=0.0, rim=0.0, levels=(0.68, 0.92, 1.08)):
    """Banded toon material; optional 2-tone noise patches + light rim."""
    name = 'SK_' + name
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.name != 'Material Output':
            nt.nodes.remove(n)
    outn = nt.nodes['Material Output']
    em = nt.nodes.new('ShaderNodeEmission')
    mul = nt.nodes.new('ShaderNodeMixRGB'); mul.blend_type = 'MULTIPLY'; mul.inputs['Fac'].default_value = 1.0
    _bands_group(nt, mul.inputs['Color1'], levels)
    if patch:
        tex = nt.nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = noise
        prm = nt.nodes.new('ShaderNodeValToRGB')
        pc = prm.color_ramp; pc.interpolation = 'CONSTANT'
        pc.elements[0].position = 0.0;  pc.elements[0].color = lin(base)
        pc.elements[1].position = 0.52; pc.elements[1].color = lin(patch)
        nt.links.new(tex.outputs['Fac'], prm.inputs[0])
        nt.links.new(prm.outputs['Color'], mul.inputs['Color2'])
    else:
        mul.inputs['Color2'].default_value = lin(base)
    src = mul
    if rim > 0:
        fr = nt.nodes.new('ShaderNodeFresnel'); fr.inputs['IOR'].default_value = 1.35
        frm = nt.nodes.new('ShaderNodeValToRGB')
        fc = frm.color_ramp; fc.interpolation = 'CONSTANT'
        fc.elements[0].color = (0,0,0,1); fc.elements[1].position = 0.72; fc.elements[1].color = (1,1,1,1)
        mix = nt.nodes.new('ShaderNodeMixRGB'); mix.blend_type = 'ADD'
        mix.inputs['Fac'].default_value = rim
        nt.links.new(fr.outputs[0], frm.inputs[0])
        nt.links.new(frm.outputs['Color'], mix.inputs['Color2'])
        nt.links.new(mul.outputs['Color'], mix.inputs['Color1'])
        src = mix
    nt.links.new(src.outputs['Color'], em.inputs['Color'])
    em.inputs['Strength'].default_value = 1.0 + emit
    nt.links.new(em.outputs[0], outn.inputs['Surface'])
    return m

def glow(name, base, strength):
    name = 'SK_' + name
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        m.node_tree.nodes.remove(bsdf)
    em = m.node_tree.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = lin(base)
    em.inputs['Strength'].default_value = strength
    m.node_tree.links.new(em.outputs[0], m.node_tree.nodes['Material Output'].inputs['Surface'])
    return m

def outline_mat(col):
    m = glow('OUT_' + col, col, 1.0)
    m.use_backface_culling = True  # essential: hides the hull's inward faces
    return m

def finish(obj, mat, out_col=None, out_w=0.07, bevel=0.05):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    if bevel:
        b = obj.modifiers.new('Bev', 'BEVEL'); b.width = bevel; b.segments = 2
    if out_col:
        obj.data.materials.append(outline_mat(out_col))
        s = obj.modifiers.new('Out', 'SOLIDIFY')
        s.thickness = -out_w; s.offset = 1; s.use_flip_normals = True
        s.material_offset = 1; s.use_rim = False

# ── primitives (all live in the active scene collection) ─────────────────────
def _last():
    return bpy.context.active_object

def sphere(loc, r, seg=16):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=max(6, seg // 2), location=loc)
    return _last()

def ico(loc, r, sub=1):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=sub, location=loc)
    return _last()

def cone(loc, r1, r2, depth, vs=12):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, vertices=vs, location=loc)
    return _last()

def cyl(loc, r, depth, vs=16):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=vs, location=loc)
    return _last()

def box(loc, sx, sy, sz):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = _last(); o.scale = (sx, sy, sz)
    return o

def torus(loc, R, r):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc,
                                     major_segments=28, minor_segments=10)
    return _last()

def rig_prop(parts, loc, s=1.0, tilt=TILT, rz=None):
    """Parent parts to an empty at loc, scale, lean toward camera."""
    e = bpy.data.objects.new('prop', None)
    bpy.context.scene.collection.objects.link(e)
    e.location = loc; e.scale = (s, s, s)
    e.rotation_euler = (tilt, 0, rz if rz is not None else 0)
    for p in parts:
        p.parent = e
    return e

# ── vegetation & rocks ────────────────────────────────────────────────────────
TRUNK = '#5a3a1a'
def p_pine(dark, snow=None):
    t = cyl((0, 0, 0.5), 0.16, 1.1, 8); finish(t, toon('m_trunk', TRUNK), '#241505')
    parts = [t]
    cols = [dark, shade(dark, 0.14), shade(dark, 0.26)]
    for i, (z, r) in enumerate([(1.1, 0.85), (1.75, 0.62), (2.3, 0.4)]):
        c = cone((0, 0, z), r, 0.02, 0.95, 10)
        finish(c, toon('m_pine%d_%s' % (i, dark), cols[i], levels=(0.8, 0.98, 1.1)), shade(dark, -0.55))
        parts.append(c)
        if snow:
            sc = cone((0, 0, z + 0.22), r * 0.62, 0.02, 0.5, 10)
            finish(sc, toon('m_snowcap', snow), '#9db8cc')
            parts.append(sc)
    return parts

def p_tree(leaf):
    t = cyl((0, 0, 0.45), 0.17, 1.0, 8); finish(t, toon('m_trunk', TRUNK), '#241505')
    parts = [t]
    for dx, dz, r in [(0, 1.5, 0.85), (-0.55, 1.15, 0.55), (0.55, 1.2, 0.5)]:
        b = ico((dx, 0, dz), r, 2)
        finish(b, toon('m_leaf_' + leaf, leaf, shade(leaf, 0.16), noise=3.2, levels=(0.8, 0.98, 1.1)),
               shade(leaf, -0.55))
        parts.append(b)
    return parts

def p_palm():
    parts = []
    for i in range(4):
        seg = cyl((0.12 * i, 0, 0.3 + i * 0.55), 0.14 - i * 0.015, 0.6, 8)
        seg.rotation_euler.y = radians(8 * i)
        finish(seg, toon('m_palmtrunk', '#8a6a3a'), '#3a2810')
        parts.append(seg)
    top = (0.12 * 3 + 0.12, 0, 0.3 + 3 * 0.55 + 0.3)
    for k in range(5):
        a = k * (2 * pi / 5)
        leaf = ico((top[0] + 0.62 * math.cos(a), 0.62 * math.sin(a), top[2] + 0.1), 0.5, 1)
        leaf.scale = (1.25, 0.45, 0.16)
        leaf.rotation_euler = (0, radians(-22), a)
        finish(leaf, toon('m_palmleaf', '#2f7a3a'), '#0f3a14')
        parts.append(leaf)
    return parts

def p_cactus():
    m = toon('m_cactus', '#2f7a3a', shade('#2f7a3a', 0.1), noise=8)
    a = cyl((0, 0, 0.9), 0.32, 1.8, 12); finish(a, m, '#0f3a14')
    b = cyl((0.55, 0, 1.05), 0.2, 0.75, 10); b.rotation_euler.y = radians(90)
    finish(b, m, '#0f3a14')
    c = cyl((0.82, 0, 1.45), 0.2, 0.8, 10); finish(c, m, '#0f3a14')
    d = cyl((-0.5, 0, 0.75), 0.18, 0.6, 10); d.rotation_euler.y = radians(-90)
    finish(d, m, '#0f3a14')
    e = cyl((-0.72, 0, 1.1), 0.18, 0.7, 10); finish(e, m, '#0f3a14')
    return [a, b, c, d, e]

def p_acacia():
    t = cyl((0, 0, 0.7), 0.15, 1.5, 8); t.rotation_euler.y = radians(6)
    finish(t, toon('m_trunk', TRUNK), '#241505')
    br = cyl((0.3, 0, 1.35), 0.09, 0.8, 6); br.rotation_euler.y = radians(55)
    finish(br, toon('m_trunk', TRUNK), '#241505')
    can = cyl((0.15, 0, 1.75), 1.15, 0.34, 14)
    finish(can, toon('m_acacia', '#4a7a2a', '#5f8f33', noise=4), '#1c3510')
    return [t, br, can]

def p_rock(col, edge):
    r = ico((0, 0, 0.4), 0.62, 1)
    r.scale = (1.2, 0.9, 0.72); r.rotation_euler.z = radians(30)
    finish(r, toon('m_rock_' + col, col, shade(col, -0.12), noise=5), edge)
    r2 = ico((0.7, 0.2, 0.22), 0.3, 1)
    finish(r2, toon('m_rock_' + col, col), edge)
    return [r, r2]

def p_flower(pet):
    """Petal ring in the XZ plane so the bloom faces the camera when lying back."""
    st = cyl((0, 0, 0.45), 0.06, 0.95, 6); finish(st, toon('m_stem', '#3a7a2a'), '#173d10', bevel=0)
    parts = [st]
    for k in range(5):
        a = pi / 2 + k * 2 * pi / 5
        p = sphere((0.32 * math.cos(a), 0, 1.0 + 0.32 * math.sin(a)), 0.24, 10)
        p.scale = (1, 0.55, 1)
        finish(p, toon('m_petal_' + pet, pet, levels=(0.85, 1.0, 1.08)), shade(pet, -0.5), bevel=0)
        parts.append(p)
    c = sphere((0, 0, 1.0), 0.2, 10); c.scale = (1, 0.6, 1)
    finish(c, toon('m_fcenter', '#ffd84a'), '#a06a10', bevel=0)
    parts.append(c)
    return parts

def p_grass(col):
    parts = []
    for dx, h in [(-0.22, 0.55), (0, 0.8), (0.22, 0.6)]:
        g = cone((dx, 0, h / 2), 0.11, 0.015, h, 6)
        g.rotation_euler.y = radians(dx * 30)
        finish(g, toon('m_grass_' + col, col), shade(col, -0.5), bevel=0)
        parts.append(g)
    return parts

def p_fern():
    parts = []
    for k in range(5):
        a = k * 2 * pi / 5
        l = ico((0.42 * math.cos(a), 0.42 * math.sin(a), 0.3), 0.42, 1)
        l.scale = (1.5, 0.35, 0.14)
        l.rotation_euler = (0, radians(-30), a)
        finish(l, toon('m_fern', '#2e8a4a', '#3fa05a', noise=6), '#0f3a14')
        parts.append(l)
    return parts

def p_snow():
    s = sphere((0, 0, 0.25), 0.6, 14); s.scale = (1.25, 1.0, 0.5)
    finish(s, toon('m_snow', '#eef6fb'), '#9db8cc')
    return [s]

def p_crystal(col):
    parts = []
    for dx, h, rz in [(0, 1.35, 0), (0.55, 0.85, 16), (-0.5, 0.65, -20)]:
        c = cone((dx, 0, h / 2), 0.44, 0.1, h, 6)
        c.rotation_euler = (0, radians(rz), radians(20))
        finish(c, toon('m_cr_' + col, col, emit=0.7, levels=(0.8, 1.0, 1.15)), shade(col, -0.55))
        parts.append(c)
    return parts

def p_ember():
    r = ico((0, 0, 0.35), 0.55, 1); r.scale = (1.15, 0.95, 0.7)
    finish(r, toon('m_rock_dk', '#3a2a28', '#2a1a18', noise=5), '#120808')
    parts = [r]
    for dx, dy, dz in [(0.2, 0.15, 0.6), (-0.25, -0.1, 0.5), (0.05, -0.25, 0.65)]:
        e = sphere((dx, dy, dz), 0.11, 8)
        finish(e, glow('m_emberdot', '#ff8a2a', 6.0), bevel=0)
        parts.append(e)
    return parts

def p_islet():
    s = sphere((0, 0, 0.1), 0.85, 14); s.scale = (1.3, 0.95, 0.4)
    finish(s, toon('m_sand', '#e8cf92', '#d9bd7c', noise=5), '#8a6a2a')
    return [s] + [pp for pp in p_palm()]

def p_wave():
    """Stylised foam: two staggered rows of flattened white capsules."""
    parts = []
    for i, (y0, n) in enumerate([(0, 3), (0.55, 2)]):
        for k in range(n):
            w = sphere(((k - (n - 1) / 2) * 0.85, y0, 0.16 + i * 0.05), 0.34, 12)
            w.scale = (1.5, 0.5, 0.35)
            finish(w, toon('m_wave', '#f2fdff', emit=0.35, levels=(0.9, 1.0, 1.05)), None, bevel=0)
            parts.append(w)
    return parts

def p_cloud():
    parts = []
    for dx, dz, r in [(-0.6, 0, 0.42), (0, 0.12, 0.6), (0.62, 0, 0.45), (0.2, -0.05, 0.5)]:
        b = sphere((dx, 0, 2.6 + dz), r, 12)
        finish(b, toon('m_cloud', '#ffffff', emit=0.35, levels=(0.85, 0.97, 1.05)), None, bevel=0)
        parts.append(b)
    return parts

def star_mesh(name, r_out, r_in, pts=5):
    verts, faces = [(0, 0, 0)], []
    for i in range(pts * 2):
        a = pi / 2 + i * pi / pts
        r = r_out if i % 2 == 0 else r_in
        verts.append((r * math.cos(a), r * math.sin(a), 0))
    for i in range(1, pts * 2 + 1):
        j = i + 1 if i < pts * 2 else 1
        faces.append((0, i, j))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o

def p_star(col='#ffd84a', big=1.0):
    st = star_mesh('star', 0.75 * big, 0.32 * big)
    st.location = (0, 0, 0.7)
    st.rotation_euler.x = radians(90)
    m = st.modifiers.new('So', 'SOLIDIFY'); m.thickness = 0.28 * big; m.offset = 0
    finish(st, toon('m_star_' + col, col, emit=0.8, levels=(0.85, 1.0, 1.1)), shade(col, -0.6), bevel=0.04)
    return [st]

def p_comet():
    h = sphere((0, 0, 1.0), 0.34, 12)
    finish(h, toon('m_comet', '#cfe8ff', emit=1.4, levels=(0.9, 1.0, 1.1)), '#4a6a9a', bevel=0)
    t = cone((0.75, 0, 0.62), 0.30, 0.02, 1.5, 10)
    t.rotation_euler = (0, radians(115), 0)
    finish(t, glow('m_comettail', '#7fa8ff', 1.6), bevel=0)
    return [h, t]

PROPS = {
  'pine':      lambda: p_pine('#3f8f4a'),
  'pine_snow': lambda: p_pine('#4a8a72', snow='#f2f8fc'),
  'tree':      lambda: p_tree('#4aa856'),
  'palm':      p_palm,
  'cactus':    p_cactus,
  'acacia':    p_acacia,
  'rock':      lambda: p_rock('#8a8f96', '#3a3f46'),
  'rock_dark': lambda: p_rock('#4a3a38', '#160c0a'),
  'rock_snow': lambda: p_rock('#c9d8e4', '#7a95a8'),
  'flower':    lambda: p_flower('#e86a8a'),
  'grass':     lambda: p_grass('#6ab448'),
  'grass_dry': lambda: p_grass('#cfa952'),
  'fern':      p_fern,
  'snow':      p_snow,
  'crystal_b': lambda: p_crystal('#9fd8ff'),
  'crystal_o': lambda: p_crystal('#ffb060'),
  'crystal_p': lambda: p_crystal('#c9a8ff'),
  'ember':     p_ember,
  'islet':     p_islet,
  'wave':      p_wave,
  'cloud':     p_cloud,
  'star':      p_star,
  'comet':     p_comet,
}

# ── terrain, river, features ─────────────────────────────────────────────────
def ground(b, rng, soft=False):
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=52, y_subdivisions=150, size=1, location=(0, 0, 0))
    g = _last(); g.scale = (43, 124, 1)
    bpy.ops.object.transform_apply(scale=True)
    me = g.data
    amp_z = 0.2 if soft else 0.5
    for v in me.vertices:
        v.co.z = (math.sin(v.co.x * 0.55 + v.co.y * 0.3) + math.sin(v.co.y * 0.7 + v.co.x * 0.2)) * amp_z * 0.5 \
                 + (rng.random() - 0.5) * 0.05
    lv = (0.82, 0.97, 1.05) if soft else (0.74, 0.95, 1.07)
    mat = toon('m_bank_%s%s' % (b['key'], '_s' if soft else ''), b['bank'][0],
               shade(b['bank'][0], 0.10), noise=0.4, levels=lv)
    finish(g, mat, None, bevel=0)
    return g

def river_wobble(r):
    """Gentle organic meander added to every ribbon pass. Frequencies are
    multiples of 1/10 row so each band stays seam-periodic; max ±13 px — well
    under the 62 px medallions that sit on river_px(r)."""
    return 8.0 * sin(2 * pi * 0.8 * r + 0.9) + 5.0 * sin(2 * pi * 1.8 * r + 2.2)

def river_curve(name, half_w_px, z, mat, r0=-0.8, r1=9.8):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    sp = cu.splines.new('POLY')
    n = int((r1 - r0) / 0.02)
    sp.points.add(n)
    for i in range(n + 1):
        r = r0 + i * 0.02
        x, y, _ = u(river_px(r) + river_wobble(r), (r + 0.5) * ROW_PX)
        sp.points[i].co = (x, y, 0, 1)
    cu.bevel_depth = half_w_px / PXU
    cu.bevel_resolution = 6
    cu.use_fill_caps = True
    o = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(o)
    o.location.z = z
    o.scale = (1, 1, 0.05)   # flatten the bevel tube into a ribbon
    o.visible_shadow = False  # ribbons must not cast the muddy side-shadow
    o.data.materials.append(mat)
    return o

def sparkles(b, rng, col='#ffffff'):
    for _ in range(16):
        r = rng.random() * 10.2 - 0.6
        x_px = river_px(r) + (rng.random() - 0.5) * 30
        s = sphere(u(x_px, (r + 0.5) * ROW_PX, 0.9), 0.16 + rng.random() * 0.12, 8)
        s.scale = (2.2, 0.7, 0.25)
        s.visible_shadow = False
        finish(s, glow('m_sparkle_' + col, col, 1.6), bevel=0)

def bank_lobes(b, rng):
    """Deliberate rounded bank tongues biting over the water edge — replaces the
    accidental (and ragged) terrain-over-ribbon overlaps with a clean cartoon
    scalloped shoreline. Flat outlined blobs in the ground colour, sitting
    ABOVE the ribbons at the edge/halo boundary."""
    mat = toon('m_lobe_' + b['key'], b['bank'][0], shade(b['bank'][0], 0.10), noise=0.4,
               levels=(0.82, 0.97, 1.06))
    out_col = mixhex(b['bank'][1], '#000000', 0.25)
    r = -0.75
    while r < 9.75:
        r += 0.14 + rng.random() * 0.24
        side = 1 if rng.random() < 0.5 else -1
        x_px = river_px(r) + side * (42 + rng.random() * 7)
        s = sphere(u(x_px, (r + 0.5) * ROW_PX, 0.98), 0.55 + rng.random() * 0.85, 14)
        s.scale = (1.35, 1.0, 0.16)
        s.rotation_euler.z = rng.random() * 3.14
        s.visible_shadow = False
        finish(s, mat, out_col, bevel=0, out_w=0.05)

def build_river(b, rng, lava=False, cosmic=False):
    # ribbons ride ABOVE the terrain relief (z +0.35) so the shoreline is a
    # clean smooth contour; bank_lobes() then adds the organic bites on purpose
    r0, r1 = b['river']
    bank_dark = mixhex(b['bank'][1], '#000000', 0.25)
    if lava:
        river_curve('edge', 46, 0.45, glow('m_lavaedge', '#140807', 1.0))
        river_curve('halo', 38, 0.57, glow('m_lavahalo', '#7a3014', 1.4))
        river_curve('body', 27, 0.69, glow('m_lava', r1, 2.2))
        river_curve('core', 10, 0.81, glow('m_lavacore', '#ffe27a', 5.0))
        sparkles(b, rng, '#ffcf5a')
    elif cosmic:
        river_curve('edge', 46, 0.45, glow('m_cosmoedge', '#0a0d2a', 1.0))
        river_curve('halo', 38, 0.57, glow('m_cosmohalo', '#3a3aa0', 1.2))
        river_curve('body', 27, 0.69, glow('m_cosmo', r1, 1.8))
        river_curve('core', 10, 0.81, glow('m_cosmocore', '#cfd6ff', 3.4))
        sparkles(b, rng, '#e8ecff')
    else:
        halo = mixhex(r0, '#ffffff', 0.62)
        river_curve('edge', 46, 0.45, toon('m_redge_' + b['key'], bank_dark, levels=(0.9, 1.0, 1.02)))
        river_curve('halo', 38, 0.57, toon('m_halo_' + b['key'], halo, levels=(0.9, 1.0, 1.05)))
        river_curve('body', 27, 0.69, toon('m_water_' + b['key'], r1, emit=0.3, levels=(0.85, 1.0, 1.08)))
        river_curve('core', 10, 0.81, toon('m_wcore_' + b['key'], mixhex(r0, '#ffffff', 0.28),
                                           emit=0.55, levels=(0.9, 1.0, 1.06)))
        sparkles(b, rng)

def feature(b, rng):
    """Big background pieces — built standing at origin, then leaned toward the
    camera like every prop so they read as ¾ silhouettes, not flat ellipses."""
    f, col = b['feature'], b['fcol']
    slots = [(0.26, 1.35), (0.74, 3.6), (0.24, 6.1), (0.74, 8.55)]
    def spot(k):
        fx, fr = slots[k % 4]
        x_px = fx * W_PX + (rng.random() - 0.5) * 26
        return u(x_px, (fr + 0.5) * ROW_PX)
    if f == 'hills':
        hcol = mixhex(b['bank'][0], col, 0.45)   # lighter than fcol but still saturated
        for k in range(4):
            parts = []
            for dx, r in [(-1.3, 1.7), (0.9, 2.2), (2.6, 1.4)]:
                h = sphere((dx, 0, 0.4), r, 18)
                finish(h, toon('m_hill_' + b['key'], hcol, mixhex(hcol, b['bank'][0], 0.4), noise=1.4),
                       shade(col, -0.35))
                parts.append(h)
            rig_prop(parts, spot(k), s=1.5 + rng.random() * 0.5)
    elif f == 'mountains':
        for k in range(3):
            parts = []
            m = cone((0, 0, 2.6), 3.2, 0.12, 5.2, 7)
            finish(m, toon('m_mount', col, shade(col, 0.12), noise=2), shade(col, -0.5))
            c = cone((0, 0, 4.5), 1.05, 0.08, 1.7, 7)
            finish(c, toon('m_mcap', '#f2f8fc'), '#9db8cc')
            parts += [m, c]
            rig_prop(parts, spot(k), s=1.4 + rng.random() * 0.6)
    elif f == 'volcano':
        parts = []
        v = cone((0, 0, 2.7), 4.4, 1.3, 5.4, 9)
        finish(v, toon('m_volc', '#4a2c26', '#331b16', noise=3), '#0a0505')
        ring = torus((0, 0, 5.38), 1.32, 0.24)
        finish(ring, glow('m_craterring', '#ff6a1a', 2.4), bevel=0)
        lava = cyl((0, 0, 5.30), 1.22, 0.2, 9)
        finish(lava, glow('m_lavatop', '#e8501a', 1.6), bevel=0)
        parts += [v, ring, lava]
        rig_prop(parts, spot(1), s=1.7)
        for k in (0, 2, 3):
            m = cone((0, 0, 1.7), 2.3, 0.18, 3.4, 7)
            finish(m, toon('m_volc2', '#2c1715', '#1a0d0b', noise=3), '#0a0505')
            rig_prop([m], spot(k), s=1.2 + rng.random() * 0.5)
    elif f == 'iceberg':
        for k in range(4):
            i1 = ico((0, 0, 1.4), 2.4 + rng.random() * 0.8, 1)
            i1.scale = (1.25, 0.9, 1.25)
            i1.rotation_euler.z = rng.random() * 3
            finish(i1, toon('m_berg', '#e8f4fd', '#cfe4f2', noise=2.2), '#8fb3cc')
            rig_prop([i1], spot(k), s=1.3 + rng.random() * 0.5)
    elif f == 'dunes':
        dcol = shade(col, 0.30)
        for k in range(4):
            parts = []
            for dx, r in [(-1.6, 1.9), (0.8, 2.5), (2.9, 1.5)]:
                d = sphere((dx, 0, 0.3), r, 18); d.scale = (1.4, 0.8, 0.8)
                finish(d, toon('m_dune', dcol, shade(dcol, 0.12), noise=1.3), shade(col, -0.25))
                parts.append(d)
            rig_prop(parts, spot(k), s=1.5 + rng.random() * 0.5)
    elif f == 'canopy':
        ccol = mixhex(col, '#3f9a3a', 0.62)   # saturated jungle green, not washed grey
        for k in range(4):
            parts = []
            for j in range(5):
                blob = ico(((j - 2) * 1.5 + (rng.random() - 0.5), (rng.random() - 0.5) * 1.4, 0.8 + (j % 2) * 0.7),
                           1.3 + rng.random() * 0.8, 2)
                finish(blob, toon('m_canopy', ccol, shade(ccol, 0.16), noise=2.4), shade(col, -0.45))
                parts.append(blob)
            t = cyl((0, 0, 0.2), 0.3, 1.2, 8); finish(t, toon('m_trunk', TRUNK), '#241505')
            parts.append(t)
            rig_prop(parts, spot(k), s=1.5 + rng.random() * 0.4)
    elif f == 'island':
        for k in range(3):
            loc = spot(k)
            s = sphere(loc, 2.6, 16); s.scale = (1.5, 1.1, 0.30)
            finish(s, toon('m_isl_sand', col, shade(col, 0.12), noise=3), '#8a6a2a')
            g = sphere((loc[0], loc[1], 0.35), 1.6, 14); g.scale = (1.2, 0.9, 0.22)
            finish(g, toon('m_isl_grass', '#5a9a4a'), '#2a5a1a')
            rig_prop(p_palm(), (loc[0] - 0.4, loc[1], 0.5), s=1.3)
            rig_prop(p_rock('#8a8f96', '#3a3f46'), (loc[0] + 1.4, loc[1] - 0.5, 0.5), s=0.9)
    elif f == 'starfield':
        for _ in range(120):
            x_px, y_px = rng.random() * W_PX, rng.random() * BAND_PX
            if abs(x_px - river_px(y_px / ROW_PX - 0.5)) < 48:
                continue
            st = sphere(u(x_px, y_px, 0.15), 0.05 + rng.random() * 0.1, 6)
            finish(st, glow('m_stardot', '#ffffff', 2.0 + rng.random() * 3), bevel=0)
        for k in range(3):
            loc = spot(k)
            base_c = ['#3a2a7a', '#6a2a6a', '#20408a'][k]
            for j, (dx, dy, r) in enumerate([(-1.6, 0.3, 2.4), (0.9, -0.4, 3.0), (2.8, 0.5, 1.8)]):
                neb = sphere((loc[0] + dx, loc[1] + dy, 0.1 + j * 0.02), r, 14)
                neb.scale = (1.5, 0.95, 0.2)
                finish(neb, glow('m_neb_%d_%d' % (k, j), mixhex(base_c, '#8a9aff', j * 0.18), 0.5), bevel=0)

def scatter(b, rng):
    placed = []
    kinds = b['decor']
    for _ in range(60):
        r = 0.45 + rng.random() * 9.0      # keep tall standing props inside the band
        y_px = (r + 0.5) * ROW_PX
        side = 1 if rng.random() < 0.5 else -1
        x_px = river_px(r) + side * (82 + rng.random() * (W_PX / 2 - 100))
        if x_px < 26 or x_px > W_PX - 26:
            continue
        if any((x_px - px) ** 2 + (y_px - py) ** 2 < 70 ** 2 for px, py in placed):
            continue
        placed.append((x_px, y_px))
        kind = kinds[rng.randrange(len(kinds))]
        parts = PROPS[kind]()
        big = kind in ('tree', 'pine', 'pine_snow', 'palm', 'cactus', 'acacia', 'islet')
        s = (2.0 + rng.random() * 1.0) if big else (1.5 + rng.random() * 0.8)
        tilt = TILT_FLAT if kind in FLAT_KINDS else TILT
        # lower-on-screen props sit a hair higher so they overlap those behind them
        rig_prop(parts, u(x_px, y_px, 0.05 + (y_px / BAND_PX) * 0.5), s=s,
                 tilt=tilt, rz=(rng.random() - 0.5) * 0.4)
    # second pass: small filler close to the banks (flowers, tufts, pebbles…)
    small = [k for k in kinds if k in ('flower', 'grass', 'grass_dry', 'rock', 'rock_dark',
                                      'rock_snow', 'snow', 'ember', 'star', 'wave', 'fern', 'crystal_b',
                                      'crystal_o', 'crystal_p')] or kinds[-2:]
    for _ in range(26):
        r = 0.15 + rng.random() * 9.55
        y_px = (r + 0.5) * ROW_PX
        side = 1 if rng.random() < 0.5 else -1
        x_px = river_px(r) + side * (66 + rng.random() * 36)
        if x_px < 24 or x_px > W_PX - 24:
            continue
        if any((x_px - px) ** 2 + (y_px - py) ** 2 < 46 ** 2 for px, py in placed):
            continue
        placed.append((x_px, y_px))
        kind = small[rng.randrange(len(small))]
        parts = PROPS[kind]()
        tilt = TILT_FLAT if kind in FLAT_KINDS else TILT
        rig_prop(parts, u(x_px, y_px, 0.05 + (y_px / BAND_PX) * 0.5), s=1.4 + rng.random() * 0.7,
                 tilt=tilt, rz=(rng.random() - 0.5) * 0.4)
    return len(placed)

def render_to(path):
    scn = bpy.context.scene
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)

# ── sprites (medallions, stars, props on transparent) ────────────────────────
def sprite_scene(ortho=9.0, res=512):
    return fresh_scene('StorySprites', (res, res), ortho, True)

def render_sprite(builder, path, ortho=9.0, res=512, s=1.0, dz=0.0, shadow_disc=0.0, tilt=TILT, dy=-0.18):
    sprite_scene(ortho, res)
    parts = builder()
    e = rig_prop(parts, (0, ortho * dy, dz), s=s, tilt=tilt)
    if shadow_disc > 0:
        d = cyl((0, -ortho * 0.18, 0.02), shadow_disc, 0.02, 32)
        d.visible_shadow = False
        finish(d, glow('m_ground_shadow', '#101418', 0.55), bevel=0)
    render_to(path)
    return e

def p_coin(rim, face_light, locked=False):
    """Level medallion — FLAT Candy-Crush button seen straight from above:
    full circle face + a darker base cylinder offset down-screen (the visible
    "thickness" crescent). Render with tilt=0."""
    base = cyl((0, -0.55, 0.3), 3.08, 0.55, 48)
    finish(base, toon('m_coin_base_' + rim, shade(rim, -0.45), levels=(0.85, 0.98, 1.05)),
           shade(rim, -0.68), bevel=0.08)
    body = cyl((0, 0, 0.75), 3.1, 0.5, 48)
    finish(body, toon('m_coin_side_' + rim, rim, levels=(0.8, 0.98, 1.08)),
           shade(rim, -0.6), bevel=0.1)
    ring = torus((0, 0, 1.02), 2.8, 0.36)
    finish(ring, toon('m_coin_rim_' + rim, rim, levels=(0.8, 0.98, 1.1)), shade(rim, -0.6), bevel=0)
    face = cyl((0, 0, 1.06), 2.45, 0.18, 48)
    finish(face, toon('m_coin_face_' + face_light, face_light, levels=(0.9, 1.0, 1.05)),
           shade(rim, -0.5), bevel=0.05)
    parts = [base, body, ring, face]
    if locked:
        # padlock lying on its back on the face → reads upright from above
        pivot = bpy.data.objects.new('lockpivot', None)
        bpy.context.scene.collection.objects.link(pivot)
        pivot.location = (0, -1.5, 1.25)
        pivot.scale = (1.5, 1.5, 1.5)
        pivot.rotation_euler = (radians(-80), 0, 0)
        for o in p_padlock(z=0):
            o.parent = pivot
        parts.append(pivot)
    return parts

def p_padlock(z=0.0):
    body = box((0, 0, z + 0.75), 1.7, 0.7, 1.3)
    finish(body, toon('m_lock_body', '#8a92a0', levels=(0.78, 0.97, 1.08)), '#3a3f48', bevel=0.16)
    sh = torus((0, 0, z + 1.55), 0.62, 0.17)
    sh.rotation_euler.x = radians(90)
    finish(sh, toon('m_lock_shackle', '#5a626e'), '#23272e', bevel=0)
    kh = cyl((0, -0.4, z + 0.7), 0.17, 0.2, 12)
    kh.rotation_euler.x = radians(90)
    finish(kh, toon('m_lock_hole', '#3a3f48'), None, bevel=0)
    return [body, sh, kh]

def p_heart():
    m = toon('m_heart', '#e84a6a', levels=(0.8, 0.98, 1.1))
    a = sphere((-0.62, 0, 1.75), 0.92, 20); a.scale = (1, 0.8, 1)
    b = sphere((0.62, 0, 1.75), 0.92, 20); b.scale = (1, 0.8, 1)
    c = box((0, 0, 0.85), 1.85, 1.45, 1.85)
    c.rotation_euler.y = radians(45)
    for o in (a, b, c):
        finish(o, m, '#7a1030', bevel=0.1)
    return [a, b, c]

def p_chest():
    body = box((0, 0, 0.7), 2.6, 1.7, 1.3)
    finish(body, toon('m_chest_wood', '#8a5a2a', '#7a4a20', noise=4), '#3a2208', bevel=0.14)
    lid = cyl((0, 0, 1.35), 0.86, 2.6, 24)
    lid.rotation_euler.y = radians(90)
    lid.scale = (1, 1, 0.75)
    finish(lid, toon('m_chest_lid', '#9a6a34', '#8a5a2a', noise=4), '#3a2208', bevel=0.1)
    band = box((0, 0, 1.0), 0.5, 1.78, 1.9)
    finish(band, toon('m_chest_band', '#ffd84a', levels=(0.8, 0.98, 1.1)), '#8a5a10', bevel=0.08)
    plate = cyl((0, -0.92, 0.95), 0.34, 0.14, 16)
    plate.rotation_euler.x = radians(90)
    finish(plate, toon('m_chest_plate', '#ffd84a'), '#8a5a10', bevel=0)
    return [body, lid, band, plate]

def p_trophy():
    m = toon('m_trophy', '#ffd84a', levels=(0.8, 0.98, 1.12))
    cup = sphere((0, 0, 2.5), 1.15, 20)
    cup.scale = (1, 1, 1.15)
    rim = torus((0, 0, 3.45), 1.02, 0.15)
    stem = cone((0, 0, 1.15), 0.55, 0.25, 0.9, 16)
    foot = cyl((0, 0, 0.5), 0.9, 0.4, 24)
    parts = [cup, rim, stem, foot]
    for sx in (-1.35, 1.35):
        h = torus((sx, 0, 2.7), 0.48, 0.13)
        h.rotation_euler.x = radians(90)
        parts.append(h)
    for o in parts:
        finish(o, m, '#8a5a10', bevel=0.06)
    return parts

def render_sprites():
    out = []
    COIN_TILT = radians(38)
    for key, b in BIOMES.items():
        face = mixhex(b['rim'], '#ffffff', 0.72)
        render_sprite(lambda rim=b['rim'], f=face: p_coin(rim, f),
                      '%s/coin_%s.png' % (OUT, key), ortho=8, s=1.0, tilt=COIN_TILT)
        out.append(key)
    render_sprite(lambda: p_coin('#9aa2ae', '#d8dde4', locked=True), OUT + '/coin_locked.png',
                  ortho=8, tilt=COIN_TILT)
    render_sprite(lambda: p_star('#ffd84a', 2.4), OUT + '/star_gold.png', ortho=9, dz=-0.6, tilt=radians(30))
    render_sprite(lambda: p_star('#b8c0cc', 2.4), OUT + '/star_empty.png', ortho=9, dz=-0.6, tilt=radians(30))
    render_sprite(p_heart, OUT + '/heart.png', ortho=8, tilt=radians(75), dy=0.20)
    render_sprite(p_chest, OUT + '/chest.png', ortho=7, tilt=radians(75), dy=0.22)
    render_sprite(p_padlock, OUT + '/lock.png', ortho=6.5, tilt=radians(-80), dy=-0.28)
    return out

def render_band(key, style='A', suffix=''):
    b = dict(BIOMES[key]); b['key'] = key
    soft = style == 'B'
    scn = fresh_scene('StoryBand', (780, 2360), 118.0, False)
    if soft:
        for o in scn.collection.objects:
            if o.type == 'LIGHT':
                o.data.energy = 2.6; o.data.angle = radians(12)
    if b['night']:
        bg = scn.world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs[1].default_value = 0.22
        for o in scn.collection.objects:
            if o.type == 'LIGHT':
                o.data.energy = 2.2
                o.data.color = (0.85, 0.9, 1.0)
    rng = random.Random(sum(ord(c) * (i + 7) for i, c in enumerate(key)))
    ground(b, rng, soft=soft)
    build_river(b, rng, lava=(key == 'volcan'), cosmic=(key == 'cosmos'))
    feature(b, rng)
    n = scatter(b, rng)
    render_to('%s/band_%s%s.png' % (OUT, key, suffix))
    return n

print('story kit loaded')
