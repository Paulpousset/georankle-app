# Socle commun de la reconstruction du rig cosmétique (DA PRO CARTOON).
# Tous les matériaux sont des toon "émission pure" : la direction de la key light
# de rig.json est cuite dans le node graph (bandes à paliers via ColorRamp
# CONSTANT), donc le rendu est identique en Cycles et EEVEE et ne dépend pas des
# lampes de la scène. Contours = coque Solidify + matériau "backfacing only"
# (astuce inverted-hull compatible Cycles).
import json
import math
import os

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
PIPE = os.path.dirname(HERE)

with open(os.path.join(PIPE, "rig.json"), "r", encoding="utf-8") as fh:
    RIG = json.load(fh)


# ---------------------------------------------------------------- couleurs ---
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexc(hex_str, alpha=1.0):
    """'#rrggbb' sRGB -> tuple RGBA linéaire (l'API Blender attend du linéaire)."""
    h = hex_str.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), alpha)


def _mix_hex(a, b, t):
    ah, bh = a.lstrip("#"), b.lstrip("#")
    out = "#"
    for i in (0, 2, 4):
        va, vb = int(ah[i : i + 2], 16), int(bh[i : i + 2], 16)
        out += f"{round(va + (vb - va) * t):02x}"
    return out


def shade_of(base_hex):
    """Couleur de bande ombrée : assombrie et tirée vers le bleu nuit (cartoon)."""
    return _mix_hex(_scale_hex(base_hex, 0.66), "#232a4d", 0.30)


def light_of(base_hex):
    """Couleur de bande éclairée : éclaircie, légèrement chaude."""
    return _mix_hex(_scale_hex(base_hex, 1.10), "#fff6e0", 0.30)


def outline_of(base_hex):
    """Contour : base très assombrie teintée encre bleue (jamais noir pur)."""
    return _mix_hex(_scale_hex(base_hex, 0.42), "#141a30", 0.62)


def _scale_hex(hex_str, k):
    h = hex_str.lstrip("#")
    out = "#"
    for i in (0, 2, 4):
        out += f"{min(255, round(int(h[i:i + 2], 16) * k)):02x}"
    return out


# Direction d'éclairage toon = key light de rig.json (portée vers l'origine).
def key_light_dir():
    cfg = RIG["lights"]["key"]
    az, el = math.radians(cfg["azimuthDeg"]), math.radians(cfg["elevationDeg"])
    v = Vector(
        (
            math.cos(el) * math.sin(az),
            -math.cos(el) * math.cos(az),
            math.sin(el),
        )
    )
    return v.normalized()  # pointe DE l'origine VERS la lampe


# --------------------------------------------------------------- matériaux ---
_MAT_CACHE = {}


def toon_material(name, base_hex, *, bands=(0.42, 0.72), glow=0.0, rim=0.16,
                  shade_hex=None, light_hex=None, extra_hot=None):
    """Toon 3 bandes (ombre / base / lumière) + rim optionnel côté opposé.

    bands: seuils du produit scalaire N·L remappé [0,1] (paliers CONSTANT).
    glow: >0 pousse toutes les bandes vers la couleur claire (matériaux émissifs).
    extra_hot: hex d'une 4e bande "spéculaire cartoon" au-dessus de 0.92.
    """
    key = (name,)
    if key in _MAT_CACHE:
        return _MAT_CACHE[key]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.0
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])

    geo = nt.nodes.new("ShaderNodeNewGeometry")
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    dot.inputs[1].default_value = key_light_dir()
    nt.links.new(geo.outputs["Normal"], dot.inputs[0])
    remap = nt.nodes.new("ShaderNodeMapRange")
    remap.inputs["From Min"].default_value = -1.0
    remap.inputs["From Max"].default_value = 1.0
    nt.links.new(dot.outputs["Value"], remap.inputs["Value"])

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    sh = shade_hex or shade_of(base_hex)
    li = light_hex or light_of(base_hex)
    if glow > 0:
        sh = _mix_hex(sh, li, glow)
        base_hex_eff = _mix_hex(base_hex, li, glow)
    else:
        base_hex_eff = base_hex
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = hexc(sh)
    ramp.color_ramp.elements[1].position = bands[0]
    ramp.color_ramp.elements[1].color = hexc(base_hex_eff)
    e2 = ramp.color_ramp.elements.new(bands[1])
    e2.color = hexc(li)
    if extra_hot:
        e3 = ramp.color_ramp.elements.new(0.92)
        e3.color = hexc(extra_hot)
    nt.links.new(remap.outputs["Result"], ramp.inputs["Fac"])
    # extras glTF pour la preview live (userData côté three.js)
    mat["ggKind"] = "toon"
    mat["ggHex"] = base_hex_eff

    if rim > 0:
        # Rim froid sur les bords (silhouette) : facing -> add léger bleu clair.
        lw = nt.nodes.new("ShaderNodeLayerWeight")
        lw.inputs["Blend"].default_value = 0.62
        rimramp = nt.nodes.new("ShaderNodeValToRGB")
        rimramp.color_ramp.interpolation = "CONSTANT"
        rimramp.color_ramp.elements[0].position = 0.0
        rimramp.color_ramp.elements[0].color = (0, 0, 0, 1)
        er = rimramp.color_ramp.elements[1]
        er.position = 0.78
        rim_col = hexc("#bcd8ff")
        er.color = (rim_col[0] * rim, rim_col[1] * rim, rim_col[2] * rim, 1)
        nt.links.new(lw.outputs["Facing"], rimramp.inputs["Fac"])
        add = nt.nodes.new("ShaderNodeVectorMath")
        add.operation = "ADD"
        nt.links.new(ramp.outputs["Color"], add.inputs[0])
        nt.links.new(rimramp.outputs["Color"], add.inputs[1])
        nt.links.new(add.outputs["Vector"], emit.inputs["Color"])
    else:
        nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])

    _MAT_CACHE[key] = mat
    return mat


def flat_material(name, hex_col, alpha=1.0):
    """Émission plate (effets : flammes, néons, étoiles...)."""
    key = (name,)
    if key in _MAT_CACHE:
        return _MAT_CACHE[key]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat["ggKind"] = "flat"
    mat["ggHex"] = hex_col
    mat["ggAlpha"] = alpha
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = hexc(hex_col)
    if alpha >= 1.0:
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    else:
        trans = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix = nt.nodes.new("ShaderNodeMixShader")
        mix.inputs["Fac"].default_value = alpha
        nt.links.new(trans.outputs["BSDF"], mix.inputs[1])
        nt.links.new(emit.outputs["Emission"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    _MAT_CACHE[key] = mat
    return mat


def outline_material(name, hex_col):
    """Visible uniquement sur les faces arrière -> coque = contour (Cycles ok)."""
    key = (name,)
    if key in _MAT_CACHE:
        return _MAT_CACHE[key]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat["ggKind"] = "outline"
    mat["ggHex"] = hex_col
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    trans = nt.nodes.new("ShaderNodeBsdfTransparent")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = hexc(hex_col)
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(geo.outputs["Backfacing"], mix.inputs["Fac"])
    nt.links.new(trans.outputs["BSDF"], mix.inputs[1])
    nt.links.new(emit.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    _MAT_CACHE[key] = mat
    return mat


def vertex_alpha_material(name, hex_col, max_alpha=0.55):
    """Émission couleur unie dont l'alpha vient de l'attribut 'falloff' (ombres)."""
    key = (name,)
    if key in _MAT_CACHE:
        return _MAT_CACHE[key]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "falloff"
    mult = nt.nodes.new("ShaderNodeMath")
    mult.operation = "MULTIPLY"
    mult.inputs[1].default_value = max_alpha
    nt.links.new(attr.outputs["Fac"], mult.inputs[0])
    trans = nt.nodes.new("ShaderNodeBsdfTransparent")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = hexc(hex_col)
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mult.outputs["Value"], mix.inputs["Fac"])
    nt.links.new(trans.outputs["BSDF"], mix.inputs[1])
    nt.links.new(emit.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    _MAT_CACHE[key] = mat
    return mat


# ------------------------------------------------------------------- scène ---
def wipe_scene():
    """Vide toutes les datas (repart d'un .blend neuf)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MAT_CACHE.clear()


def get_collection(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def link_only(obj, coll):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    return obj


# -------------------------------------------------------------- primitives ---
def _new_obj(name, mesh, coll, mat=None):
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def _bm_to_obj(bm, name, coll, mat=None, smooth=False):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if smooth:
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    return _new_obj(name, mesh, coll, mat)


def box(coll, name, size, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, bevel=0.0):
    """Boîte size=(sx,sy,sz) centrée sur loc (dimensions totales)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, verts=bm.verts, vec=Vector(size))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2,
                        profile=0.7, affect="EDGES")
    obj = _bm_to_obj(bm, name, coll, mat)
    obj.location = loc
    obj.rotation_euler = Euler([math.radians(a) for a in rot])
    return obj


def cyl(coll, name, r, depth, loc=(0, 0, 0), rot=(0, 0, 0), mat=None,
        segments=24, r2=None, smooth=True, cap=True):
    """Cylindre (ou tronc de cône si r2) le long de Z, centré sur loc."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=cap, cap_tris=True, segments=segments,
        radius1=r, radius2=r if r2 is None else r2, depth=depth,
    )
    obj = _bm_to_obj(bm, name, coll, mat, smooth=smooth)
    obj.location = loc
    obj.rotation_euler = Euler([math.radians(a) for a in rot])
    return obj


def cone(coll, name, r, depth, loc=(0, 0, 0), rot=(0, 0, 0), mat=None,
         segments=24, smooth=True):
    return cyl(coll, name, r, depth, loc, rot, mat, segments, r2=0.0, smooth=smooth)


def sphere(coll, name, r, loc=(0, 0, 0), mat=None, seg=32, rings=20,
           scale=(1, 1, 1), rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    bmesh.ops.scale(bm, verts=bm.verts, vec=Vector(scale))
    obj = _bm_to_obj(bm, name, coll, mat, smooth=True)
    obj.location = loc
    obj.rotation_euler = Euler([math.radians(a) for a in rot])
    return obj


def torus(coll, name, R, r, loc=(0, 0, 0), rot=(0, 0, 0), mat=None,
          seg_major=48, seg_minor=12, scale=(1, 1, 1), arc_deg=360.0):
    """Tore autour de Z (arc partiel si arc_deg < 360, ouvert aux extrémités)."""
    bm = bmesh.new()
    ring = bmesh.ops.create_circle(bm, segments=seg_minor, radius=r)
    bmesh.ops.rotate(bm, verts=ring["verts"], cent=(0, 0, 0),
                     matrix=Matrix.Rotation(math.pi / 2, 3, "X"))
    bmesh.ops.translate(bm, verts=ring["verts"], vec=(R, 0, 0))
    closed = arc_deg >= 359.9
    bmesh.ops.spin(
        bm, geom=list(bm.verts) + list(bm.edges), cent=(0, 0, 0),
        axis=(0, 0, 1), angle=math.radians(arc_deg),
        steps=max(3, round(seg_major * arc_deg / 360.0)),
        use_merge=closed, use_duplicate=False,
    )
    if not closed:
        bmesh.ops.holes_fill(bm, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _bm_to_obj(bm, name, coll, mat, smooth=True)
    obj.scale = scale
    obj.location = loc
    obj.rotation_euler = Euler([math.radians(a) for a in rot])
    return obj


def strut(coll, name, a, b, t, mat=None, square=True):
    """Barre de section t entre les points a et b (treillis, ponts, haubans)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    length = d.length
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, verts=bm.verts, vec=Vector((t, t, length)))
    obj = _bm_to_obj(bm, name, coll, mat)
    obj.location = (a + b) / 2
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return obj


def lathe(coll, name, profile, loc=(0, 0, 0), rot=(0, 0, 0), mat=None,
          segments=32, smooth=True, arc_deg=360.0):
    """Solide de révolution autour de Z. profile = [(rayon, z), ...] bas->haut.
    arc_deg < 360 : secteur (fuseaux, quartiers), extrémités rebouchées."""
    bm = bmesh.new()
    verts = [bm.verts.new((max(r, 0.0005), 0, z)) for r, z in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    closed = arc_deg >= 359.9
    bmesh.ops.spin(
        bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1),
        angle=math.radians(arc_deg),
        steps=max(2, round(segments * arc_deg / 360.0)),
        use_merge=closed, use_duplicate=False,
    )
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.holes_fill(bm, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _bm_to_obj(bm, name, coll, mat, smooth=smooth)
    obj.location = loc
    obj.rotation_euler = Euler([math.radians(a) for a in rot])
    return obj


def ngon_prism(coll, name, points, depth, loc=(0, 0, 0), rot=(0, 0, 0),
               mat=None):
    """Prisme extrudé le long de Y depuis un polygone XZ (silhouettes 2.5D)."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, -depth / 2, z)) for x, z in points]
    face = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=(0, depth, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _bm_to_obj(bm, name, coll, mat)
    obj.location = loc
    obj.rotation_euler = Euler([math.radians(a) for a in rot])
    return obj


def text_obj(coll, name, txt, size, mat, loc=(0, 0, 0), rot=(0, 0, 0),
             extrude=0.02, bold=True):
    cu = bpy.data.curves.new(name, type="FONT")
    cu.body = txt
    cu.size = size
    cu.extrude = extrude
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    for path in (
        "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        if os.path.exists(path):
            try:
                cu.font = bpy.data.fonts.load(path, check_existing=True)
                break
            except RuntimeError:
                continue
    obj = bpy.data.objects.new(name, cu)
    coll.objects.link(obj)
    obj.data.materials.append(mat)
    obj.location = loc
    obj.rotation_euler = Euler([math.radians(a) for a in rot])
    return obj


# ---------------------------------------------------------------- contours ---
def add_outline(obj, base_hex, thickness=0.045):
    """Coque inverted-hull : copie gonflée le long des normales, matériau
    backfacing-only (transparent côté caméra, encre côté opposé -> silhouette).
    Parentée à l'objet pour suivre toutes ses transformations."""
    mat = outline_material(f"ol_{base_hex}", outline_of(base_hex))
    mesh = obj.data.copy()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * thickness
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.clear()
    mesh.materials.append(mat)
    hull = bpy.data.objects.new(obj.name + "_ol", mesh)
    for coll in obj.users_collection:
        coll.objects.link(hull)
    hull.parent = obj
    return obj


def outline_all(coll, base_hex, thickness=0.045, skip=()):
    for obj in coll.objects:
        if obj.type == "MESH" and obj.name not in skip and "NoOutline" not in obj.name:
            add_outline(obj, base_hex, thickness)


# ------------------------------------------------------------- placements ----
def anchor_on_globe(lat_deg, lng_deg, radius=1.0):
    """Point + repère tangent (monument debout, face caméra) sur la sphère."""
    lat, lng = math.radians(lat_deg), math.radians(lng_deg)
    n = Vector(
        (
            math.sin(lng) * math.cos(lat),
            -math.cos(lng) * math.cos(lat),
            math.sin(lat),
        )
    )
    pos = n * radius
    up = n
    to_cam = Vector((0, -1, 0))
    right = to_cam.cross(up)
    if right.length < 1e-5:
        right = Vector((1, 0, 0))
    right.normalize()
    front = up.cross(right).normalized()  # ~vers la caméra, tangent
    basis = Matrix((right, -front, up)).transposed().to_4x4()
    return pos, basis


def group_rotate(coll, cid, rot_deg=(0, 0, 0)):
    """Parente les objets racine à un Empty incliné (pose dynamique des sats)."""
    root = bpy.data.objects.new(f"Pose_{cid}", None)
    coll.objects.link(root)
    for obj in list(coll.objects):
        if obj is not root and obj.parent is None:
            obj.parent = root
    root.rotation_euler = Euler([math.radians(a) for a in rot_deg])
    return root


def ensure_holdout():
    """Sphère d'occlusion partagée (masque du globe pour emblèmes/orbites)."""
    obj = bpy.data.objects.get("HoldoutSphere")
    if obj is None:
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=40, radius=0.997)
        mesh = bpy.data.meshes.new("HoldoutSphere")
        bm.to_mesh(mesh)
        bm.free()
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
        obj = bpy.data.objects.new("HoldoutSphere", mesh)
        bpy.context.scene.collection.objects.link(obj)
    obj.hide_render = True
    return obj


def plant(coll, cid, scale, pre_rot_x_deg=0.0, lat=None, lng=None):
    """Parente les objets racine de la collection à un Empty posé sur le globe.

    L'empty s'appelle Root_<cid> : render_layers le remet à l'identité pour la
    passe sprite (rendu solo droit) puis restaure la matrice plantée.
    """
    cfg = RIG["emblem"]
    lat = cfg["anchorLat"] if lat is None else lat
    lng = cfg["anchorLng"] if lng is None else lng
    root = bpy.data.objects.new(f"Root_{cid}", None)
    coll.objects.link(root)
    for obj in list(coll.objects):
        if obj is not root and obj.parent is None:
            obj.parent = root
    pos, basis = anchor_on_globe(lat, lng)
    mtx = (
        Matrix.Translation(pos)
        @ basis
        @ Matrix.Rotation(math.radians(pre_rot_x_deg), 4, "X")
        @ Matrix.Diagonal((scale, scale, scale, 1.0))
    )
    root.matrix_world = mtx
    return root


def contact_shadow(coll, cid, ang_radius=0.17, lat=None, lng=None):
    """Calotte sphérique d'ombre de contact, alpha en falloff radial doux."""
    cfg = RIG["emblem"]
    lat = cfg["anchorLat"] if lat is None else lat
    lng = cfg["anchorLng"] if lng is None else lng
    center, _ = anchor_on_globe(lat, lng)
    center = center.normalized()
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=64, radius=1.004)
    doomed = [v for v in bm.verts
              if v.co.normalized().angle(center) > ang_radius]
    bmesh.ops.delete(bm, geom=doomed, context="VERTS")
    layer = bm.verts.layers.float.new("falloff")
    for v in bm.verts:
        t = 1.0 - min(1.0, v.co.normalized().angle(center) / ang_radius)
        v[layer] = t * t * (3 - 2 * t)  # smoothstep
    mesh = bpy.data.meshes.new(f"ShadowCap_{cid}")
    bm.to_mesh(mesh)
    bm.free()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    obj = bpy.data.objects.new(f"ShadowCap_{cid}", mesh)
    coll.objects.link(obj)
    obj.data.materials.append(vertex_alpha_material("contact_shadow", "#101830"))
    return obj
