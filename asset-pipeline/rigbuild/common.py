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
# Charte « Cartoon HD » (Paul, 19/09/2026 — registre Fortnite / Pixar) :
# Diffuse → Shader-to-RGB → ColorRamp EASE à 3 bandes douces (garde les VRAIES
# ombres portées des 5 area lights de rig.json), point spéculaire net (Glossy
# seuillé), contre-jour cyan (Layer Weight), sommés en émission. EEVEE
# obligatoire (Shader-to-RGB n'existe pas en Cycles). Plus AUCUN contour : le
# volume et la lumière font le travail. Les extras ggKind/ggHex/ggEmis/ggAlpha
# passent par export_glb → material.userData côté three.js.
_MAT_CACHE = {}
TOON = RIG["toon"]


def toon_hd(name, color=None, color_socket=None, *, rough=None, rim=None, rim_k=None,
            spec_k=None, emissive=0.0, shadow_tint=None, cache=True):
    """Matériau ToonHD. color = hex, ou color_socket = fn(node_tree) -> socket.

    emissive > 0 : ajoute couleur × emissive (styles sombres auto-éclairés,
    flammes, néons) — > 1 déclenche le bloom de la scène live."""
    key = (name,)
    if cache and key in _MAT_CACHE:
        return _MAT_CACHE[key]
    rough = TOON["spec"]["roughness"] if rough is None else rough
    rim = TOON["rim"]["color"] if rim is None else rim
    rim_k = TOON["rim"]["strength"] if rim_k is None else rim_k
    spec_k = TOON["spec"]["strength"] if spec_k is None else spec_k
    shadow_tint = TOON["shadowTint"] if shadow_tint is None else shadow_tint

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")

    if color_socket is None:
        rgb = nt.nodes.new("ShaderNodeRGB")
        rgb.outputs[0].default_value = hexc(color or "#ffffff")
        col_out = rgb.outputs[0]
    else:
        col_out = color_socket(nt)

    # bandes douces sur la luminance diffuse (ombres portées comprises)
    dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
    a = TOON["diffuseAlbedo"]
    dif.inputs["Color"].default_value = (a, a, a, 1.0)
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    nt.links.new(dif.outputs["BSDF"], s2r.inputs["Shader"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    els = ramp.color_ramp.elements
    stops = TOON["ramp"]
    els[0].position = stops[0][0]
    els[0].color = hexc(shadow_tint)
    els[1].position = stops[1][0]
    els[1].color = tuple(stops[1][1]) + (1.0,)
    for pos, rgbv in stops[2:]:
        e = els.new(pos)
        e.color = tuple(rgbv) + (1.0,)
    nt.links.new(s2r.outputs["Color"], ramp.inputs["Fac"])
    shade = nt.nodes.new("ShaderNodeMixRGB")
    shade.blend_type = "MULTIPLY"
    shade.inputs["Fac"].default_value = 1.0
    nt.links.new(col_out, shade.inputs[1])
    nt.links.new(ramp.outputs["Color"], shade.inputs[2])

    # point spéculaire net
    glo = nt.nodes.new("ShaderNodeBsdfGlossy")
    glo.inputs["Roughness"].default_value = rough
    s2r2 = nt.nodes.new("ShaderNodeShaderToRGB")
    nt.links.new(glo.outputs["BSDF"], s2r2.inputs["Shader"])
    sr = nt.nodes.new("ShaderNodeValToRGB")
    sr.color_ramp.interpolation = "EASE"
    t0, t1 = TOON["spec"]["threshold"]
    sr.color_ramp.elements[0].position = t0
    sr.color_ramp.elements[0].color = (0, 0, 0, 1)
    sr.color_ramp.elements[1].position = t1
    sr.color_ramp.elements[1].color = (spec_k, spec_k, spec_k, 1)
    nt.links.new(s2r2.outputs["Color"], sr.inputs["Fac"])

    # contre-jour
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = TOON["rim"]["blend"]
    pw = nt.nodes.new("ShaderNodeMath")
    pw.operation = "POWER"
    pw.inputs[1].default_value = TOON["rim"]["power"]
    nt.links.new(lw.outputs["Facing"], pw.inputs[0])
    rimk = nt.nodes.new("ShaderNodeMath")
    rimk.operation = "MULTIPLY"
    rimk.inputs[1].default_value = rim_k
    nt.links.new(pw.outputs["Value"], rimk.inputs[0])
    rimc = nt.nodes.new("ShaderNodeMixRGB")
    rimc.blend_type = "MULTIPLY"
    rimc.inputs["Fac"].default_value = 1.0
    rimc.inputs[2].default_value = hexc(rim)
    nt.links.new(rimk.outputs["Value"], rimc.inputs[1])

    add1 = nt.nodes.new("ShaderNodeMixRGB")
    add1.blend_type = "ADD"
    add1.inputs["Fac"].default_value = 1.0
    nt.links.new(shade.outputs["Color"], add1.inputs[1])
    nt.links.new(sr.outputs["Color"], add1.inputs[2])
    add2 = nt.nodes.new("ShaderNodeMixRGB")
    add2.blend_type = "ADD"
    add2.inputs["Fac"].default_value = 1.0
    nt.links.new(add1.outputs["Color"], add2.inputs[1])
    nt.links.new(rimc.outputs["Color"], add2.inputs[2])
    final = add2.outputs["Color"]
    if emissive > 0:
        emk = nt.nodes.new("ShaderNodeMixRGB")
        emk.blend_type = "MULTIPLY"
        emk.inputs["Fac"].default_value = 1.0
        emk.inputs[2].default_value = (emissive, emissive, emissive, 1)
        nt.links.new(col_out, emk.inputs[1])
        em = nt.nodes.new("ShaderNodeMixRGB")
        em.blend_type = "ADD"
        em.inputs["Fac"].default_value = 1.0
        nt.links.new(final, em.inputs[1])
        nt.links.new(emk.outputs["Color"], em.inputs[2])
        final = em.outputs["Color"]
    emis = nt.nodes.new("ShaderNodeEmission")
    emis.inputs["Strength"].default_value = 1.0
    nt.links.new(final, emis.inputs["Color"])
    nt.links.new(emis.outputs["Emission"], out.inputs["Surface"])
    mat["ggKind"] = "toon"
    mat["ggHex"] = color or "#ffffff"
    mat["ggEmis"] = float(emissive)
    if cache:
        _MAT_CACHE[key] = mat
    return mat


def toon_material(name, base_hex, *, bands=None, glow=0.0, rim=0.16,
                  shade_hex=None, light_hex=None, extra_hot=None):
    """Matériau toon d'un builder (signature historique conservée).

    bands/shade_hex/light_hex ne servent plus (la rampe est globale, rig.json) ;
    glow → émissif ; rim → force du contre-jour ; extra_hot → spéculaire renforcé.
    """
    key = (name,)
    if key in _MAT_CACHE:
        return _MAT_CACHE[key]
    mat = toon_hd(name, color=base_hex, rim_k=min(0.8, rim * 3.4),
                  emissive=glow * 1.2, spec_k=0.6 if extra_hot else None,
                  cache=False)
    mat["ggKind"] = "toon"
    mat["ggHex"] = base_hex
    _MAT_CACHE[key] = mat
    return mat


# Un matériau « flat » dont le nom évoque une source lumineuse devient émissif
# (> 1 → bloom en live) ; les autres (encres, yeux, mâts) sont de simples toons.
GLOW_HINTS = ("fire", "flame", "neon", "fly", "glow", "light", "blink", "lava",
              "hot", "fissure", "spark", "tail", "trail", "ember", "star", "halo",
              "beam", "core", "comet", "gem", "ruby", "lamp")
GLOW_EMISSIVE = 1.6


def flat_material(name, hex_col, alpha=1.0, glow=None):
    """Ex-« émission plate » : toon émissif (flammes, néons, étoiles) ou toon
    simple (encres). alpha < 1 : émission transparente conservée (halos)."""
    key = (name,)
    if key in _MAT_CACHE:
        return _MAT_CACHE[key]
    if alpha < 1.0:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        mat["ggKind"] = "flat"
        mat["ggHex"] = hex_col
        mat["ggAlpha"] = alpha
        mat["ggEmis"] = GLOW_EMISSIVE
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        emit = nt.nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = hexc(hex_col)
        trans = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix = nt.nodes.new("ShaderNodeMixShader")
        mix.inputs["Fac"].default_value = alpha
        nt.links.new(trans.outputs["BSDF"], mix.inputs[1])
        nt.links.new(emit.outputs["Emission"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
        try:
            mat.surface_render_method = "BLENDED"
        except AttributeError:
            pass
        _MAT_CACHE[key] = mat
        return mat
    if glow is None:
        low = name.lower()
        glow = GLOW_EMISSIVE if any(h in low for h in GLOW_HINTS) else 0.0
    mat = toon_hd(name, color=hex_col, emissive=glow, rough=0.3, cache=False)
    mat["ggKind"] = "flat" if glow > 0 else "toon"
    mat["ggHex"] = hex_col
    mat["ggEmis"] = float(glow)
    _MAT_CACHE[key] = mat
    return mat


def outline_material(name, hex_col):
    """Conservé pour compatibilité : la charte Cartoon HD n'a plus de contour
    (add_outline ne crée plus de coque). Backfacing-only, comme avant."""
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
    try:
        mat.surface_render_method = "BLENDED"
    except AttributeError:
        pass
    _MAT_CACHE[key] = mat
    return mat


def atmosphere_material(name="g_atmo", color=None, power=None, strength=None):
    """Coquille d'atmosphère : émission cyan × facing^power, transparente ailleurs."""
    key = (name,)
    if key in _MAT_CACHE:
        return _MAT_CACHE[key]
    cfg = TOON["atmosphere"]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.4
    pw = nt.nodes.new("ShaderNodeMath")
    pw.operation = "POWER"
    pw.inputs[1].default_value = cfg["power"] if power is None else power
    nt.links.new(lw.outputs["Facing"], pw.inputs[0])
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = hexc(color or cfg["color"])
    em.inputs["Strength"].default_value = cfg["strength"] if strength is None else strength
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(pw.outputs["Value"], mix.inputs["Fac"])
    nt.links.new(tr.outputs["BSDF"], mix.inputs[1])
    nt.links.new(em.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    try:
        mat.surface_render_method = "BLENDED"
    except AttributeError:
        pass
    mat["ggKind"] = "atmo"
    _MAT_CACHE[key] = mat
    return mat


# ------------------------------------------------------------------ rendu ----
def three_to_rig(v):
    """Repère caméra three.js (x droite, y haut, z vers la caméra) → repère du
    rig Blender (caméra en -Y, Z haut) : (x, y, z) -> (x, -z, y)."""
    return Vector((v[0], -v[2], v[1]))


def light_dir(cfg):
    """Direction (depuis l'origine VERS la lampe) d'une entrée rig.lights."""
    az, el = math.radians(cfg["azimuthDeg"]), math.radians(cfg["elevationDeg"])
    return three_to_rig((math.sin(az) * math.cos(el), math.sin(el),
                         math.cos(az) * math.cos(el))).normalized()


def studio_lights(target=None, scale=1.0, prefix="StudioLight_"):
    """Les 5 area lights de rig.json, visant `target` (origine par défaut).
    Idempotent : les lampes existantes sont remplacées."""
    scene = bpy.context.scene
    for obj in list(bpy.data.objects):
        if obj.name.startswith(prefix):
            bpy.data.objects.remove(obj, do_unlink=True)
    cfg = RIG["lights"]
    dist = cfg.get("distance", 7.0)
    t = Vector(target) if target is not None else Vector((0, 0, 0))
    made = []
    for name in ("key", "fill", "rimR", "rimL", "top"):
        L = cfg[name]
        d = light_dir(L)
        data = bpy.data.lights.new(prefix + name, "AREA")
        data.energy = L["power"] * scale
        data.color = hexc(L["color"])[:3]
        data.size = L["size"]
        data.use_shadow = bool(L.get("shadow", True))
        obj = bpy.data.objects.new(prefix + name, data)
        scene.collection.objects.link(obj)
        obj.location = t + d * dist
        obj.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        made.append(obj)
    return made


def studio_world():
    """Fond monde du POC (dégradé violet → marine) : invisible en film
    transparent mais il participe à l'éclairage d'ambiance EEVEE."""
    scene = bpy.context.scene
    world = bpy.data.worlds.get("StudioWorld") or bpy.data.worlds.new("StudioWorld")
    scene.world = world
    world.use_nodes = True
    wn = world.node_tree
    wn.nodes.clear()
    cfg = TOON["world"]
    out = wn.nodes.new("ShaderNodeOutputWorld")
    bg = wn.nodes.new("ShaderNodeBackground")
    tc = wn.nodes.new("ShaderNodeTexCoord")
    grad = wn.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "SPHERICAL"
    ramp = wn.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = hexc(cfg["top"])
    ramp.color_ramp.elements[1].color = hexc(cfg["bottom"])
    wn.links.new(tc.outputs["Generated"], grad.inputs["Vector"])
    wn.links.new(grad.outputs["Fac"], ramp.inputs["Fac"])
    wn.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0
    wn.links.new(bg.outputs["Background"], out.inputs["Surface"])
    return world


def setup_render(size, samples=None, transparent=None):
    """Moteur EEVEE Next + vue Standard + film transparent (rig.json render)."""
    scene = bpy.context.scene
    cfg = RIG["render"]
    scene.render.engine = cfg.get("engine", "BLENDER_EEVEE")
    ev = scene.eevee
    for k, v in (("taa_render_samples", samples or cfg["samples"]),
                 ("use_shadows", True), ("use_raytracing", True),
                 ("use_fast_gi", True), ("shadow_ray_count", 2),
                 ("shadow_step_count", 4)):
        try:
            setattr(ev, k, v)
        except (AttributeError, TypeError):
            pass
    scene.render.film_transparent = cfg["filmTransparent"] if transparent is None else transparent
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.use_compositing = False
    if scene.world is None or scene.world.name != "StudioWorld":
        studio_world()


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
# Cartoon HD : plus de coque de contour. Les helpers restent (les builders les
# appellent partout) mais ne créent plus rien — les GLB exportés n'ont donc
# plus de mesh `_ol`, et la scène live n'a plus rien à masquer.
def add_outline(obj, base_hex, thickness=0.045):
    return obj


def outline_all(coll, base_hex, thickness=0.045, skip=()):
    return None


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


def contact_shadow(coll, cid, ang_radius=0.17, lat=None, lng=None, radius=1.004,
                   parent=None):
    """Calotte sphérique d'ombre de contact, alpha en falloff radial doux.
    radius : au-dessus du relief des continents (1.022) pour un prop de globe ;
    parent : Empty du repère géo (GeoRoot) pour suivre la face par défaut."""
    cfg = RIG["emblem"]
    lat = cfg["anchorLat"] if lat is None else lat
    lng = cfg["anchorLng"] if lng is None else lng
    center, _ = anchor_on_globe(lat, lng)
    center = center.normalized()
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=64, radius=radius)
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
    if parent is not None:
        obj.parent = parent
    return obj
