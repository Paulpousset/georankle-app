# Globes — v3 « Cartoon HD » (19/09/2026) : sphère océan + CONTINENTS EXTRUDÉS
# (plateaux 3D depuis assets/world_polygons.json, SANS coque d'encre) portant
# la texture du style projetée (UV équirect / arctan2 en espace objet) sous le
# matériau ToonHD de common.py (3 bandes douces, vraies ombres portées,
# spéculaire, contre-jour), + NUAGES en volumes (grappes de sphères, styles
# « vivants » de rig.json toon.clouds) + coquille d'ATMOSPHÈRE cyan + props 3D
# par style (volcans lava, cristaux/calottes ice, cratères mars, montagnes
# relief, failles st_fractured, couronne st_crowned). Les styles sombres sont
# auto-éclairés (texture émissive) pour rester lisibles.
#
# Repères : le land et les props sont construits en REPÈRE GÉO PUR (lng 0 face
# caméra) puis parentés à un Empty GeoRoot_<cid> tourné de rig.globe.defaultFace
# — même convention que la texture équirect. export_glb remet GeoRoot à
# l'identité pour produire des GLB en géo pur (le live les tourne de +90° Y pour
# retomber sur la convention UV de three.SphereGeometry).
import json
import math
import os
import random

import bpy
import bmesh
from mathutils import Euler, Vector
from mathutils.geometry import tessellate_polygon

import common
from common import (add_outline, cone, cyl, flat_material, get_collection,
                    hexc, lathe, sphere, toon_hd, toon_material, torus)

TEXDIR = os.path.join(common.PIPE, "textures_globe")
POLYS_PATH = os.path.normpath(
    os.path.join(common.PIPE, "..", "assets", "world_polygons.json"))

# Réglages ToonHD par style (océan / continents) ; les styles sombres sont
# auto-éclairés (rig.json toon.darkStyles → texture émissive).
TOON = common.TOON
DARK_STYLES = set(TOON["darkStyles"])
CLOUD_STYLES = set(TOON["clouds"]["styles"])
OCEAN = dict(rough=0.25, spec_k=0.55, rim_k=0.6, sat=1.2, val=1.05)
LAND = dict(rough=0.5, spec_k=0.25, rim_k=0.5, sat=1.25, val=1.02)

# Couleur « land » par style (source : gen_globe_textures.mjs) — sert à teinter
# l'encre du contour de relief. None = land non peint (styles techniques).
LAND_HEX = {
    "classic": "#7cc45e", "satellite": "#4e9e4a", "gaia": "#5ecf58",
    "pastel": "#f2c6d0", "political": "#9ec7a0", "vintage": "#c9ab6e",
    "gold": "#e0b23e", "night": "#1d3a5f", "ice": "#f4fafd",
    "lava": "#241009", "blueprint": "#1d4d8f", "cyber": "#0a1420",
    "hologram": "#0c2c3c", "biolum": "#083024", "eclipse": "#0c0c12",
    "relief": "#c2a368", "st_fractured": "#1c3050", "st_crowned": "#e0b23e",
}

# Relief/props par style. Le TOP du relief est UNIFORME (LAND_TOP) pour que le
# GLB partagé de la preview live reste superposable à toutes les vignettes.
LAND_TOP = 1.022
LAND_BASE = 0.994
NO_RELIEF = {"mars", "st_galaxy"}


def build(cid):
    coll = get_collection(cid)
    style = cid.replace("globe_", "")
    _globe_sphere(coll, cid, style)
    root = _geo_root(coll, cid)
    if style not in NO_RELIEF:
        land = _land_object(coll, cid, style)
        land.parent = root
    props = PROPS.get(style)
    if props:
        props(coll, root, style)
    if style in CLOUD_STYLES and style not in DARK_STYLES:
        _clouds(coll, style)
    _atmosphere(coll, style)
    return coll


def _clouds(coll, style):
    """Nuages en volumes : grappes de 3–5 sphères écrasées, placées dans le
    repère caméra (mêmes graine et tirages que la scène live) hors de l'ancre
    des emblèmes (haut-avant)."""
    cfg = TOON["clouds"]
    cm = toon_hd("g_cloud", color="#ffffff", rough=0.6, spec_k=0.15,
                 rim="#dff6ff", rim_k=0.35, shadow_tint="#8fa0ff")
    rnd = random.Random(cfg["seed"])
    r0, r1 = cfg["radius"]
    s0, s1 = cfg["size"]
    n = 0
    for c in range(cfg["count"]):
        lat = math.radians(rnd.uniform(-55, 40))
        lng = math.radians(rnd.uniform(-150, 150))
        base = Vector((math.cos(lat) * math.sin(lng), math.sin(lat),
                       math.cos(lat) * math.cos(lng)))
        for k in range(rnd.randint(3, 5)):
            off = Vector((rnd.uniform(-0.12, 0.12), rnd.uniform(-0.05, 0.05),
                          rnd.uniform(-0.12, 0.12)))
            p = (base + off).normalized() * rnd.uniform(r0, r1)
            r = rnd.uniform(s0, s1)
            loc = common.three_to_rig(p)
            # écrasement le long de la normale (le « haut » du nuage)
            s = sphere(coll, f"gcloud_{c}_{k}", r, loc, cm, seg=24, rings=12)
            s.rotation_euler = loc.normalized().to_track_quat("Z", "Y").to_euler()
            s.scale = (1.0, 1.0, cfg["squash"])
            n += 1
    return n


def _atmosphere(coll, style):
    cfg = TOON["atmosphere"]
    atm = sphere(coll, f"gatmo_{style}", cfg["radius"], (0, 0, 0),
                 common.atmosphere_material(), seg=64, rings=32)
    atm.visible_shadow = False
    return atm


def _geo_root(coll, cid):
    """Empty portant la rotation defaultFace : land + props géo purs dessous."""
    root = bpy.data.objects.new(f"GeoRoot_{cid}", None)
    coll.objects.link(root)
    face = common.RIG["globe"]["defaultFace"]
    root.rotation_euler = Euler((math.radians(face["lat"]), 0,
                                 math.radians(-face["lng"])), "XYZ")
    return root


# ------------------------------------------------------------ polys du monde --
_POLY_CACHE = None


def _sph(lon_deg, lat_deg, radius=1.0):
    """(lon,lat) -> point sphère, convention texture (lng 0 face caméra -Y)."""
    lon, lat = math.radians(lon_deg), math.radians(lat_deg)
    return Vector((math.sin(lon) * math.cos(lat),
                   -math.cos(lon) * math.cos(lat),
                   math.sin(lat))) * radius


def _unwrap(ring):
    out, prev = [], None
    for lon, lat in ring:
        l = lon
        if prev is not None:
            while l - prev > 180:
                l -= 360
            while prev - l > 180:
                l += 360
        out.append((l, lat))
        prev = l
    return out


def _rdp(pts, eps):
    """Douglas-Peucker sur (lon,lat) — itératif (les anneaux sont longs)."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i0, i1 = stack.pop()
        ax, ay = pts[i0]
        bx, by = pts[i1]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1e-9
        dmax, imax = -1.0, -1
        for i in range(i0 + 1, i1):
            px, py = pts[i]
            d = abs(dx * (ay - py) - dy * (ax - px)) / norm
            if d > dmax:
                dmax, imax = d, i
        if dmax > eps:
            keep[imax] = True
            stack.append((i0, imax))
            stack.append((imax, i1))
    return [p for p, k in zip(pts, keep) if k]


def _ring_area(pts):
    a = 0.0
    for i in range(len(pts)):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % len(pts)]
        a += x0 * y1 - x1 * y0
    return abs(a) / 2.0


def _load_land_rings(eps=0.32, min_area=1.4):
    """Anneaux (lon,lat) unwrappés, simplifiés, micro-îles filtrées."""
    global _POLY_CACHE
    if _POLY_CACHE is not None:
        return _POLY_CACHE
    with open(POLYS_PATH, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    rings = []
    for entry in data:
        for ring in entry["r"]:
            pts = _unwrap(ring)
            if len(pts) > 3 and pts[0] == pts[-1]:
                pts = pts[:-1]
            if _ring_area(pts) < min_area:
                continue
            simp = _rdp(pts, eps)
            if len(simp) >= 4 and _ring_area(simp) >= min_area:
                # winding CCW imposé (lon,lat) : la paramétrisation sphérique
                # préserve l'orientation -> normales SORTANTES garanties (le
                # recalc Blender se trompait sur certains anneaux, ce qui
                # retournait la coque d'encre côté caméra dans three.js)
                if _signed_area(simp) < 0:
                    simp = list(reversed(simp))
                rings.append(simp)
    _POLY_CACHE = rings
    return rings


def _signed_area(pts):
    a = 0.0
    for i in range(len(pts)):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % len(pts)]
        a += x0 * y1 - x1 * y0
    return a / 2.0


# --------------------------------------------------------------- land relief --
_LAND_MESH = None  # géométrie partagée entre styles (matériau par style)


def _build_land_mesh():
    """Plateaux continents extrudés sur la sphère (top LAND_TOP, murs jusqu'à
    LAND_BASE sous l'océan), subdivisés puis reprojetés pour épouser la courbure."""
    bm = bmesh.new()
    rt = bm.verts.layers.float.new("rt")  # rayon cible de reprojection
    for ring in _load_land_rings():
        vecs = [Vector((lon, lat, 0.0)) for lon, lat in ring]
        try:
            tris = tessellate_polygon([vecs])
        except Exception:
            continue
        top = []
        for lon, lat in ring:
            v = bm.verts.new(_sph(lon, lat, LAND_TOP))
            v[rt] = LAND_TOP
            top.append(v)
        for a, b, c in tris:
            try:
                f = bm.faces.new((top[a], top[b], top[c]))
            except ValueError:
                continue  # face dégénérée/dupliquée
            # normale SORTANTE imposée (tessellate ne garantit pas le sens ;
            # un recalc global se trompait sur certains anneaux -> coque
            # d'encre retournée côté caméra dans three.js)
            f.normal_update()
            if f.normal.dot(f.calc_center_median()) < 0:
                f.normal_flip()
        base = []
        for lon, lat in ring:
            v = bm.verts.new(_sph(lon, lat, LAND_BASE))
            v[rt] = LAND_BASE
            base.append(v)
        n = len(ring)
        for i in range(n):
            j = (i + 1) % n
            try:
                # ring CCW (intérieur à gauche) -> ce winding met la normale
                # du mur vers l'EXTÉRIEUR du polygone
                bm.faces.new((top[i], base[i], base[j], top[j]))
            except ValueError:
                pass
    # courbure : couper les longues arêtes puis reprojeter au rayon cible
    for _ in range(3):
        long_edges = [e for e in bm.edges if e.calc_length() > 0.11]
        if not long_edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1)
        for v in bm.verts:
            target = v[rt]
            if target > 1e-6 and v.co.length > 1e-6:
                v.co = v.co.normalized() * target
    # UV équirect par loop — SEULE la preview live les consomme (le matériau
    # Blender échantillonne en coordonnées objet). V est PRÉ-INVERSÉ : l'export
    # glTF flippe V (origine haut-gauche) alors que la texture pack est chargée
    # flipY=true côté three ; sans cette compensation le relief échantillonne la
    # texture en miroir nord-sud (plateaux bleus « délavés », bug du 15/08).
    uv = bm.loops.layers.uv.new("UVMap")
    for face in bm.faces:
        us = []
        for loop in face.loops:
            co = loop.vert.co.normalized()
            u = 0.5 + math.atan2(co.x, -co.y) / (2 * math.pi)
            v2 = 0.5 - math.asin(max(-1.0, min(1.0, co.z))) / math.pi
            loop[uv].uv = (u, v2)
            us.append(u)
        if max(us) - min(us) > 0.5:
            for loop in face.loops:
                if loop[uv].uv[0] < 0.5:
                    loop[uv].uv = (loop[uv].uv[0] + 1.0, loop[uv].uv[1])
    mesh = bpy.data.meshes.new("gland_shared")
    bm.to_mesh(mesh)
    bm.free()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    return mesh


def _land_object(coll, cid, style):
    global _LAND_MESH
    if _LAND_MESH is None:
        _LAND_MESH = _build_land_mesh()
    mesh = _LAND_MESH.copy()
    mesh.name = f"gland_{style}"
    obj = bpy.data.objects.new(f"gland_{style}", mesh)
    coll.objects.link(obj)
    mat = _globe_material(style, land=True)
    obj.data.materials.append(mat)
    return obj


# ---------------------------------------------------------------- matériaux ---
def _style_tex_socket(style, sat, val, object_space):
    """Texture équirect du style (+ saturation) : par UV (sphère) ou projetée
    depuis la position OBJET (continents, géo pure : u = atan2(x,-y)/2π+½,
    v = asin(z)/π+½ — indépendante de la rotation defaultFace du GeoRoot)."""
    def build(nt):
        tex = nt.nodes.new("ShaderNodeTexImage")
        path = os.path.join(TEXDIR, f"{style}.png")
        tex.image = bpy.data.images.load(path, check_existing=True)
        tex.extension = "REPEAT"
        if object_space:
            geo_in = nt.nodes.new("ShaderNodeTexCoord")
            ln = nt.nodes.new("ShaderNodeVectorMath")
            ln.operation = "NORMALIZE"
            nt.links.new(geo_in.outputs["Object"], ln.inputs[0])
            sep = nt.nodes.new("ShaderNodeSeparateXYZ")
            nt.links.new(ln.outputs["Vector"], sep.inputs["Vector"])
            neg = nt.nodes.new("ShaderNodeMath")
            neg.operation = "MULTIPLY"
            neg.inputs[1].default_value = -1.0
            nt.links.new(sep.outputs["Y"], neg.inputs[0])
            at2 = nt.nodes.new("ShaderNodeMath")
            at2.operation = "ARCTAN2"
            nt.links.new(sep.outputs["X"], at2.inputs[0])
            nt.links.new(neg.outputs["Value"], at2.inputs[1])
            udiv = nt.nodes.new("ShaderNodeMath")
            udiv.operation = "MULTIPLY_ADD"
            udiv.inputs[1].default_value = 1.0 / (2 * math.pi)
            udiv.inputs[2].default_value = 0.5
            nt.links.new(at2.outputs["Value"], udiv.inputs[0])
            asin = nt.nodes.new("ShaderNodeMath")
            asin.operation = "ARCSINE"
            nt.links.new(sep.outputs["Z"], asin.inputs[0])
            vdiv = nt.nodes.new("ShaderNodeMath")
            vdiv.operation = "MULTIPLY_ADD"
            vdiv.inputs[1].default_value = 1.0 / math.pi
            vdiv.inputs[2].default_value = 0.5
            nt.links.new(asin.outputs["Value"], vdiv.inputs[0])
            comb = nt.nodes.new("ShaderNodeCombineXYZ")
            nt.links.new(udiv.outputs["Value"], comb.inputs["X"])
            nt.links.new(vdiv.outputs["Value"], comb.inputs["Y"])
            nt.links.new(comb.outputs["Vector"], tex.inputs["Vector"])
        else:
            uv = nt.nodes.new("ShaderNodeTexCoord")
            nt.links.new(uv.outputs["UV"], tex.inputs["Vector"])
        hsv = nt.nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Saturation"].default_value = sat
        hsv.inputs["Value"].default_value = val
        nt.links.new(tex.outputs["Color"], hsv.inputs["Color"])
        return hsv.outputs["Color"]
    return build


def _globe_material(style, land=False):
    """ToonHD × texture du style. land=True : projection espace objet +
    marqueur ggKind=landtex (la scène live pose la texture au runtime)."""
    name = f"globe_{style}" + ("_land" if land else "")
    cfg = LAND if land else OCEAN
    dark = style in DARK_STYLES
    mat = toon_hd(name, color_socket=_style_tex_socket(style, cfg["sat"], cfg["val"], land),
                  rough=cfg["rough"], spec_k=cfg["spec_k"], rim_k=cfg["rim_k"],
                  emissive=TOON["darkEmissive"] if dark else 0.0, cache=False)
    mat["ggKind"] = "landtex" if land else "toon"
    mat["ggHex"] = LAND_HEX.get(style) or "#7cc45e"
    return mat


def _globe_sphere(coll, cid, style):
    mesh = _uv_sphere_equirect(cid)
    obj = bpy.data.objects.new(cid, mesh)
    coll.objects.link(obj)
    obj.data.materials.append(_globe_material(style))
    face = common.RIG["globe"]["defaultFace"]
    obj.rotation_euler = Euler((math.radians(face["lat"]),
                                0, math.radians(-face["lng"])), "XYZ")
    return obj


def _uv_sphere_equirect(name, seg=96, rings=64, radius=1.0):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=radius)
    uv = bm.loops.layers.uv.new("UVMap")
    for face in bm.faces:
        us = []
        for loop in face.loops:
            co = loop.vert.co.normalized()
            u = 0.5 + math.atan2(co.x, -co.y) / (2 * math.pi)
            v = 0.5 + math.asin(max(-1.0, min(1.0, co.z))) / math.pi
            loop[uv].uv = (u, v)
            us.append(u)
        if max(us) - min(us) > 0.5:
            for loop in face.loops:
                if loop[uv].uv[0] < 0.5:
                    loop[uv].uv = (loop[uv].uv[0] + 1.0, loop[uv].uv[1])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    return mesh


# ------------------------------------------------------------------- props ----
# Tous les objets props sont préfixés gprop_ (export GLB par style) et posés
# tangents à la sphère en repère géo pur via un Empty par ancre, parenté au
# GeoRoot (defaultFace) — donc alignés avec la texture équirect.
from mathutils import Matrix  # noqa: E402


def _prop_anchor(coll, root, name, lat, lng, radius=1.0, yaw_deg=0.0):
    """Empty tangent à la sphère (Z local = normale sortante), parenté au root."""
    pos, basis = common.anchor_on_globe(lat, lng)
    empty = bpy.data.objects.new(f"gprop_{name}", None)
    coll.objects.link(empty)
    empty.matrix_world = (
        Matrix.Translation(pos * radius) @ basis
        @ Matrix.Rotation(math.radians(yaw_deg), 4, "Z")
    )
    empty.parent = root
    return empty


def _parent_keep(obj, anchor):
    """Parente : la transform posée par les helpers (matrix_basis) devient
    LOCALE au repère de l'ancre (matrix_parent_inverse reste identité)."""
    obj.parent = anchor
    return obj


def _props_relief(coll, root, style):
    """Massifs montagneux toon (cônes gris + neige) sur les grandes chaînes."""
    rock = toon_material("g_mountain", "#8f8f9c")
    snow = toon_material("g_snowcap", "#f4f8ff", rim=0.1)
    ranges = [
        ("himalaya", 32, 86, 0.17, 3),
        ("andes", -22, -68, 0.15, 3),
        ("rockies", 46, -114, 0.14, 2),
        ("alps", 46, 9, 0.11, 2),
    ]
    for name, lat, lng, h, count in ranges:
        anchor = _prop_anchor(coll, root, f"mt_{name}", lat, lng)
        for i in range(count):
            off = (i - (count - 1) / 2) * 0.11
            hh = h * (1.0 - 0.22 * abs(i - (count - 1) / 2))
            peak = cone(coll, f"gprop_{name}_pk{i}", hh * 0.62, hh,
                        (off, 0.02 * (i % 2), hh / 2), mat=rock,
                        segments=7, smooth=False)
            add_outline(peak, "#8f8f9c", 0.010)
            cap = cone(coll, f"gprop_{name}_sn{i}", hh * 0.27, hh * 0.42,
                       (off, 0.02 * (i % 2), hh * 0.80), mat=snow,
                       segments=7, smooth=False)
            _parent_keep(peak, anchor)
            _parent_keep(cap, anchor)


def _ice_cap(coll, root, name, lat):
    """Calotte polaire : disque bombé toon posé au pôle (Cartoon HD : plus
    large et plus épais, formes rondes)."""
    mat = toon_material("g_icecap", "#f6fbff", rim=0.12)
    cap = lathe(coll, f"gprop_{name}",
                [(0.38, -0.014), (0.36, 0.018), (0.27, 0.040), (0.13, 0.054),
                 (0.0, 0.058)],
                mat=mat, segments=32)
    anchor = _prop_anchor(coll, root, f"a_{name}", lat, 0)
    _parent_keep(cap, anchor)


def _props_ice(coll, root, style):
    """Monde glacé : calottes + BLOCS DE GLACE ARRONDIS (Cartoon HD) posés à
    l'intérieur de la silhouette (latitudes ≤ 66°), en grappes de trois."""
    _ice_cap(coll, root, "cap_n", 89)
    _ice_cap(coll, root, "cap_s", -89)
    ice = toon_material("g_iceblock", "#cfeeff", rim=0.28)
    ice2 = toon_material("g_iceblock2", "#e8f8ff", rim=0.24)
    spots = [("greenland", 66, -42, 0.115, 8), ("siberia", 62, 100, 0.10, -14),
             ("canada", 58, -100, 0.09, 20), ("scandi", 63, 18, 0.08, -8)]
    for name, lat, lng, h, yaw in spots:
        anchor = _prop_anchor(coll, root, f"cr_{name}", lat, lng, yaw_deg=yaw)
        for i, (dx, dy, k) in enumerate([(0, 0, 1.0), (0.07, 0.04, 0.62),
                                         (-0.065, 0.035, 0.5)]):
            hh = h * k
            w = hh * 0.62
            # dôme arrondi à sommet doux (rien ne dépasse de la silhouette)
            blk = lathe(coll, f"gprop_{name}_c{i}",
                        [(w * 0.95, 0.0), (w, hh * 0.35), (w * 0.8, hh * 0.7),
                         (w * 0.45, hh * 0.92), (0.0, hh)],
                        loc=(dx, dy, 0.0), mat=ice if i else ice2, segments=20)
            _parent_keep(blk, anchor)


def _props_lava(coll, root, style):
    basalt = toon_material("g_basalt", "#2c1a14")
    lava_hot = flat_material("g_lavahot", "#ff9a3a")
    # Cartoon HD : volcans grossis (×1.3) pour rester lisibles en vignette
    spots = [("hawaii", 20, -156, 0.22), ("vesuvio", 41, 14, 0.18),
             ("java", -8, 112, 0.20), ("fuego", 14, -90, 0.17)]
    for name, lat, lng, h in spots:
        anchor = _prop_anchor(coll, root, f"vol_{name}", lat, lng)
        body = cyl(coll, f"gprop_{name}_bd", h * 0.72, h, (0, 0, h / 2),
                   mat=basalt, segments=9, r2=h * 0.34, smooth=False)
        add_outline(body, "#2c1a14", 0.011)
        mouth = cyl(coll, f"gprop_{name}_lv", h * 0.30, h * 0.10,
                    (0, 0, h * 1.01), mat=lava_hot, segments=9, smooth=False)
        drip = sphere(coll, f"gprop_{name}_dp", h * 0.09,
                      (h * 0.34, h * 0.16, h * 0.72), lava_hot,
                      seg=8, rings=6, scale=(1, 1, 1.7))
        for obj in (body, mouth, drip):
            _parent_keep(obj, anchor)


def _props_mars(coll, root, style):
    _mars_cap(coll, root)
    rim_mat = toon_material("g_craterrim", "#b0511f")
    craters = [("hellas", -38, 66, 0.115), ("gale", -5, 137, 0.085),
               ("jezero", 20, 76, 0.075), ("argyre", -48, -44, 0.10),
               ("utopia", 46, 118, 0.11), ("valles", -12, -58, 0.085),
               ("chryse", 25, -32, 0.09)]
    for name, lat, lng, R in craters:
        anchor = _prop_anchor(coll, root, f"cra_{name}", lat, lng)
        ring = torus(coll, f"gprop_{name}_rg", R, R * 0.30, mat=rim_mat,
                     seg_major=18, seg_minor=8, scale=(1, 1, 0.62))
        add_outline(ring, "#b0511f", 0.010)
        _parent_keep(ring, anchor)
    oly = _prop_anchor(coll, root, "oly", 18, -134)
    mons = cyl(coll, "gprop_oly_mons", 0.19, 0.11, (0, 0, 0.055),
               mat=toon_material("g_marsmons", "#c96a33"),
               segments=12, r2=0.075, smooth=False)
    add_outline(mons, "#c96a33", 0.011)
    _parent_keep(mons, oly)


def _mars_cap(coll, root):
    mat = toon_material("g_marscap", "#f2e8dc", rim=0.1)
    cap = lathe(coll, "gprop_marscap",
                [(0.30, 0.0), (0.27, 0.016), (0.16, 0.030), (0.0, 0.038)],
                mat=mat, segments=24)
    add_outline(cap, "#e0d4c4", 0.010)
    anchor = _prop_anchor(coll, root, "a_marscap", 88, 0)
    _parent_keep(cap, anchor)


def _props_fractured(coll, root, style):
    """Failles ardentes : chaînes de barres émissives le long de la croûte."""
    hot = flat_material("g_fissure", "#ff8a3a")
    import random
    rnd = random.Random(4242)
    for k in range(5):
        lat = rnd.uniform(-45, 55)
        lng = rnd.uniform(-170, 170)
        heading = rnd.uniform(0, 360)
        prev = None
        for s in range(7):
            lat += math.cos(math.radians(heading)) * rnd.uniform(4, 9)
            lng += math.sin(math.radians(heading)) * rnd.uniform(6, 12)
            heading += rnd.uniform(-40, 40)
            pos, _ = common.anchor_on_globe(lat, lng)
            cur = pos * 1.004
            if prev is not None:
                seg = common.strut(coll, f"gprop_fis{k}_{s}", prev, cur, 0.016,
                                   mat=hot)
                seg.name = f"gprop_fis{k}_{s}"
                seg.parent = root
            prev = cur


def _props_crown(coll, root, style):
    """Couronne dorée posée haut-avant (st_crowned), repère géo pur. Cartoon
    HD : ×2,2 (elle était minuscule), or à joyaux émissifs, ombre de contact."""
    gold = "#f2c14e"
    mg = toon_material("g_crown", gold, extra_hot="#fff2b0")
    gem = flat_material("g_crowngem", "#e8304a")  # « gem » → émissif (bloom)
    lat, lng = 50, -5
    anchor = _prop_anchor(coll, root, "crown", lat, lng)
    R, tube = 0.42, 0.070
    band = torus(coll, "gprop_crown_band", R, tube, mat=mg,
                 seg_major=48, seg_minor=14)
    _parent_keep(band, anchor)
    # bourrelet supérieur (lecture de l'épaisseur) + velours sombre au centre
    lip = torus(coll, "gprop_crown_lip", R + 0.02, tube * 0.45, loc=(0, 0, tube * 0.9),
                mat=toon_material("g_crownlip", "#f8d878"), seg_major=48, seg_minor=10)
    _parent_keep(lip, anchor)
    for i in range(6):
        a = math.radians(i * 60)
        sp = cone(coll, f"gprop_crown_spike{i}", 0.11, 0.34,
                  (R * math.cos(a), R * math.sin(a), tube * 0.9 + 0.17),
                  mat=mg, segments=14, smooth=True)
        _parent_keep(sp, anchor)
        g = sphere(coll, f"gprop_crown_gem{i}", 0.052,
                   (R * math.cos(a), R * math.sin(a), tube * 0.9 + 0.36), gem,
                   seg=14, rings=10)
        _parent_keep(g, anchor)
        # joyau de ceinture entre deux pointes
        b = math.radians(i * 60 + 30)
        g2 = sphere(coll, f"gprop_crown_gem{i}b", 0.040,
                    ((R + tube * 0.85) * math.cos(b), (R + tube * 0.85) * math.sin(b), 0.0),
                    gem, seg=12, rings=8)
        _parent_keep(g2, anchor)
    common.contact_shadow(coll, "globe_st_crowned", ang_radius=0.60, lat=lat, lng=lng,
                          radius=1.026, parent=root)


PROPS = {
    "relief": _props_relief,
    "ice": _props_ice,
    "lava": _props_lava,
    "mars": _props_mars,
    "st_fractured": _props_fractured,
    "st_crowned": _props_crown,
}
