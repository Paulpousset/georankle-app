# Emblèmes monuments — modélisation procédurale détaillée, DA pro cartoon.
# Convention locale : monument debout à l'origine, base z=0, hauteur ~1.8-2.1,
# face vers -Y (caméra). plant() le pose ensuite sur le globe (rig.json).
import math

from mathutils import Euler, Matrix, Vector

import common
from common import (
    box, cone, contact_shadow, cyl, ensure_holdout, flat_material,
    get_collection, lathe, ngon_prism, outline_all, plant, sphere, strut,
    text_obj, toon_material, torus,
)

INK = 0.045  # épaisseur de contour par défaut (unités locales, avant scale)

# Réglages par item : échelle relative, rayon d'ombre, bascule avant (deg).
PLANT = {
    "emblem_compass": dict(scale=1.45, shadow=0.20, rot=-14),
    "emblem_eiffel": dict(scale=0.88, shadow=0.19),
    "emblem_pyramids": dict(scale=1.30, shadow=0.26),
    "emblem_liberty": dict(scale=1.05, shadow=0.17),
    "emblem_bigben": dict(scale=0.84, shadow=0.14),
    "emblem_fuji": dict(scale=0.95, shadow=0.20),
    "emblem_christ": dict(scale=1.05, shadow=0.17),
    "emblem_taj": dict(scale=1.20, shadow=0.27),
    "emblem_colosseum": dict(scale=1.30, shadow=0.28),
    "emblem_windmill": dict(scale=1.15, shadow=0.20),
    "emblem_pisa": dict(scale=1.05, shadow=0.15),
    "emblem_moai": dict(scale=1.15, shadow=0.19),
    "emblem_goldengate": dict(scale=1.25, shadow=0.30),
    "emblem_sydney": dict(scale=1.30, shadow=0.28),
    "emblem_greatwall": dict(scale=1.10, shadow=0.26),
    "emblem_st_star": dict(scale=1.20, shadow=0.18),
    "emblem_st_summit": dict(scale=1.25, shadow=0.24),
    "emblem_st_worldtree": dict(scale=1.15, shadow=0.22),
    "emblem_st_laurel": dict(scale=1.20, shadow=0.18),
}


def build(cid):
    fn = globals()[cid.replace("emblem_", "m_")]
    coll = get_collection(cid)
    fn(coll)
    cfg = PLANT.get(cid, {})
    plant(coll, cid, common.RIG["emblem"]["scale"] * cfg.get("scale", 1.0),
          pre_rot_x_deg=cfg.get("rot", 0.0))
    contact_shadow(coll, cid, ang_radius=cfg.get("shadow", 0.18))
    ensure_holdout()
    return coll


# ── Tour Eiffel ──────────────────────────────────────────────────────────────
def m_eiffel(c):
    bronze = "#c1763c"
    mat = toon_material("e_bronze", bronze)
    ink = flat_material("e_ink", common.outline_of(bronze))
    # gabarit (demi-largeur, z) des étages ; pieds aux coins (facteur 0.78)
    K = 0.78
    levels = [(0.44, 0.0), (0.32, 0.36), (0.24, 0.72), (0.17, 0.95),
              (0.135, 1.16), (0.09, 1.5), (0.05, 1.85)]
    for cx, cy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        for i in range(len(levels) - 1):
            (w0, z0), (w1, z1) = levels[i], levels[i + 1]
            t = 0.085 - 0.008 * i
            a = (cx * w0 * K, cy * w0 * K, z0)
            b = (cx * w1 * K, cy * w1 * K, z1)
            s = strut(c, f"leg{cx}{cy}{i}", a, b, t, mat)
            common.add_outline(s, bronze, 0.022)
    # plateformes (léger débord au-delà des pieds)
    for (w, z, h) in ((0.24, 0.72, 0.06), (0.135, 1.16, 0.05), (0.055, 1.85, 0.04)):
        side = 2 * (w * K + 0.05)
        p = box(c, f"plat{z}", (side, side, h), (0, 0, z), mat=mat, bevel=0.01)
        common.add_outline(p, bronze, 0.028)
    # arches sous la 1re plateforme (4 faces)
    for k, (rx, ry, rz) in enumerate(((0, 0.26, 0), (0, -0.26, 0),
                                      (0.26, 0, 90), (-0.26, 0, 90))):
        torus(c, f"arch{k}", 0.20, 0.030, loc=(rx, ry, 0.32),
              rot=(90, 0, rz), mat=mat, arc_deg=180, seg_major=32)
    # croisillons fins (lecture "treillis" à l'encre)
    for z0, z1, w0, w1 in ((0.10, 0.30, 0.405, 0.34), (0.44, 0.66, 0.295, 0.25),
                           (0.78, 0.92, 0.225, 0.185), (1.22, 1.44, 0.125, 0.10)):
        for sx, face in ((1, -1), (-1, -1)):
            strut(c, f"xbrace{z0}{sx}", (sx * w0 * K, face * w0 * K, z0),
                  (-sx * w1 * K, face * w1 * K, z1), 0.02, ink)
    # flèche et antenne
    tip = cone(c, "tip", 0.05, 0.10, (0, 0, 1.92), mat=mat, segments=8, smooth=False)
    common.add_outline(tip, bronze, 0.02)
    cyl(c, "antenna", 0.014, 0.18, (0, 0, 2.05), mat=mat, segments=8)
    sphere(c, "beacon", 0.024, (0, 0, 2.15), mat=mat, seg=12, rings=8)


# ── Pyramides de Gizeh ───────────────────────────────────────────────────────
def m_pyramids(c):
    sand, sand_d, gold = "#eec06a", "#d59a3f", "#ffd23e"
    m1 = toon_material("e_sand", sand, bands=(0.48, 0.62))
    m2 = toon_material("e_sandd", sand_d, bands=(0.48, 0.62))
    base = cyl(c, "dune", 0.72, 0.035, (0, 0, 0.017), mat=toon_material("e_dune", "#f2d189"),
               segments=36)
    base.scale = (1.0, 0.72, 1.0)
    common.add_outline(base, "#f2d189", 0.022)
    for name, r, h, x, y, rot, mat in (
        ("p1", 0.50, 0.95, -0.12, 0.08, 18, m1),
        ("p2", 0.34, 0.62, 0.34, -0.12, 30, m1),
        ("p3", 0.20, 0.36, -0.46, -0.22, 24, m2),
    ):
        p = cyl(c, name, r, h, (x, y, h / 2 + 0.02), (0, 0, rot), mat,
                segments=4, r2=0.0, smooth=False)
        common.add_outline(p, sand, 0.035)
    cap = cyl(c, "cap", 0.093, 0.17, (-0.12, 0.08, 0.94), (0, 0, 18),
              toon_material("e_capgold", gold, extra_hot="#fff2b0"),
              segments=4, r2=0.0, smooth=False)
    common.add_outline(cap, gold, 0.02)


# ── Statue de la Liberté ─────────────────────────────────────────────────────
def m_liberty(c):
    verd, verd_d, stone, gold = "#5bc9a2", "#3fa781", "#cbb89a", "#ffd23e"
    mv = toon_material("e_verd", verd)
    mvd = toon_material("e_verdd", verd_d)
    ms = toon_material("e_stone", stone)
    for name, s, z in (("ped1", (0.40, 0.40, 0.26), 0.13),
                       ("ped2", (0.30, 0.30, 0.30), 0.41),
                       ("cornice", (0.35, 0.35, 0.055), 0.585)):
        b = box(c, name, s, (0, 0, z), mat=ms, bevel=0.012)
        common.add_outline(b, stone, 0.03)
    robe = lathe(c, "robe", [(0.185, 0.61), (0.22, 0.74), (0.16, 1.04),
                             (0.115, 1.32), (0.082, 1.46)],
                 mat=mv, segments=9, smooth=False)
    common.add_outline(robe, verd, 0.035)
    sphere(c, "head", 0.088, (0, -0.02, 1.565), mv, seg=20, rings=14)
    # couronne : bandeau + 7 pointes rayonnantes
    band = cyl(c, "crownband", 0.094, 0.055, (0, -0.025, 1.645), (14, 0, 0), mvd, segments=14)
    common.add_outline(band, verd_d, 0.012)
    for i in range(7):
        a = math.radians(-81 + i * 27)
        x = 0.10 * math.sin(a)
        y = -0.03 - 0.10 * math.cos(a) * 0.55
        sp = cone(c, f"spike{i}", 0.02, 0.17, (x, y, 1.70), mat=mvd, segments=6, smooth=False)
        sp.rotation_euler = Euler((math.radians(24), 0, 0))
        sp.rotation_euler.rotate(Euler((0, a * 0.55, 0)))
        common.add_outline(sp, verd_d, 0.014)
    # bras droit levé + torche
    arm = strut(c, "arm", (0.13, -0.02, 1.30), (0.31, -0.05, 1.72), 0.065, mv)
    common.add_outline(arm, verd, 0.025)
    cyl(c, "torch", 0.032, 0.12, (0.315, -0.05, 1.775), mat=mvd, segments=10)
    flame = sphere(c, "flame_NoOutline", 0.065, (0.315, -0.05, 1.90),
                   toon_material("e_flame", gold, glow=0.5, extra_hot="#fff6c8"),
                   seg=12, rings=8, scale=(1, 1, 1.5))
    # tablette bras gauche, sortie du corps
    tab = box(c, "tablet", (0.075, 0.115, 0.21), (-0.235, -0.10, 1.16), (14, 0, -20), mvd)
    common.add_outline(tab, verd_d, 0.02)
    la = strut(c, "armL", (-0.12, -0.02, 1.28), (-0.225, -0.09, 1.10), 0.055, mv)
    common.add_outline(la, verd, 0.02)


# ── Big Ben ──────────────────────────────────────────────────────────────────
def m_bigben(c):
    cream, cream_d, slate, gold = "#ecd9a8", "#d8bf85", "#5a6f8a", "#f2c14e"
    mc = toon_material("e_cream", cream)
    mcd = toon_material("e_creamd", cream_d)
    msl = toon_material("e_slate", slate)
    mg = toon_material("e_gold", gold, extra_hot="#fff2b0")
    ink = flat_material("e_bink", common.outline_of(cream))
    shaft = box(c, "shaft", (0.28, 0.28, 1.16), (0, 0, 0.58), mat=mc)
    common.add_outline(shaft, cream, 0.032)
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        box(c, f"pil{sx}{sy}", (0.065, 0.065, 1.16), (sx * 0.145, sy * 0.145, 0.58), mat=mcd)
    # fenêtres gothiques (face avant, bien devant la coque de contour)
    for z in (0.30, 0.56, 0.82):
        box(c, f"win{z}", (0.065, 0.07, 0.115), (0, -0.13, z), mat=ink)
    stage = box(c, "clockstage", (0.42, 0.42, 0.34), (0, 0, 1.33), mat=mc, bevel=0.012)
    common.add_outline(stage, cream, 0.032)
    # cadrans sur 3 faces visibles, nettement en saillie
    for (dx, dy, rz) in ((0, -0.20, 0), (0.20, 0, 90), (-0.20, 0, 90)):
        face = cyl(c, f"clock{rz}{dx}", 0.135, 0.09, (dx, dy, 1.35), (90, 0, rz),
                   toon_material("e_clockface", "#fdf6e3", rim=0), segments=24)
        ring_loc = (0, -0.245, 1.35) if rz == 0 else (dx * 1.225, 0, 1.35)
        torus(c, f"ring{rz}{dx}", 0.135, 0.022, ring_loc, (90, 0, rz), mg,
              seg_major=28, seg_minor=8)
        if rz == 0:  # aiguilles sur le cadran face caméra uniquement
            strut(c, "hh", (dx, -0.26, 1.35), (dx + 0.06, -0.26, 1.39), 0.016, ink)
            strut(c, "mh", (dx, -0.26, 1.35), (dx - 0.033, -0.26, 1.45), 0.012, ink)
    box(c, "cornice", (0.46, 0.46, 0.055), (0, 0, 1.53), mat=mcd, bevel=0.01)
    r1 = cyl(c, "roof1", 0.30, 0.26, (0, 0, 1.685), (0, 0, 45), msl, segments=4,
             r2=0.11, smooth=False)
    common.add_outline(r1, slate, 0.028)
    spire = cone(c, "spire", 0.075, 0.34, (0, 0, 1.945), (0, 0, 45), msl, segments=4, smooth=False)
    common.add_outline(spire, slate, 0.02)
    sphere(c, "finial", 0.032, (0, 0, 2.13), mg, seg=12, rings=8)
    cyl(c, "mast", 0.009, 0.09, (0, 0, 2.18), mat=mg, segments=6)


# ── Mont Fuji ────────────────────────────────────────────────────────────────
def m_fuji(c):
    mtn, snow = "#6b79c4", "#ffffff"
    mm = toon_material("e_fuji", mtn, bands=(0.44, 0.70))
    msn = toon_material("e_snow", "#f2f7ff", bands=(0.38, 0.78),
                        shade_hex="#c3d2ec", light_hex="#ffffff")
    body = lathe(c, "mount", [(0.70, 0.0), (0.55, 0.16), (0.37, 0.40),
                              (0.235, 0.64), (0.16, 0.84), (0.135, 0.92)],
                 mat=mm, segments=40)
    common.add_outline(body, mtn, 0.032)
    cap = lathe(c, "snowcap", [(0.33, 0.60), (0.235, 0.82), (0.185, 0.97), (0.0, 1.05)],
                mat=msn, segments=40)
    common.add_outline(cap, "#dce6f5", 0.024)
    # coulées de neige (triangles pendants alternés, collés à la pente)
    for i in range(9):
        a = math.radians(i * 40 + 10)
        r0 = 0.325
        x, y = r0 * math.sin(a), -r0 * math.cos(a)
        ln = 0.16 if i % 2 else 0.10
        ngon_prism(c, f"drip{i}", [(-0.055, 0.005), (0.055, 0.005), (0.0, -ln)],
                   0.05, (x, y, 0.615), (0, 0, -math.degrees(a)), msn)
    # nuages cartoon bien lisibles
    mcl = toon_material("e_cloud", "#ffffff", shade_hex="#ccd9ee", rim=0)
    for (x, z, s) in ((-0.60, 0.38, 1.0), (0.63, 0.56, 0.85)):
        for j, (dx, dz, r) in enumerate(((0, 0, 0.115), (0.125, -0.015, 0.085),
                                         (-0.115, -0.02, 0.075))):
            sphere(c, f"cl{x}{j}_NoOutline", r * s, (x + dx * s, -0.02, z + dz * s), mcl,
                   seg=16, rings=10)


# ── Christ Rédempteur ────────────────────────────────────────────────────────
def m_christ(c):
    stone, stone_d = "#dfe3ee", "#b9c1d6"
    ms = toon_material("e_christ", stone, shade_hex="#9aa5c4")
    msd = toon_material("e_christd", stone_d)
    ped = box(c, "ped", (0.30, 0.30, 0.30), (0, 0, 0.15), mat=msd, bevel=0.015)
    common.add_outline(ped, stone_d, 0.03)
    robe = lathe(c, "robe", [(0.175, 0.30), (0.22, 0.58), (0.15, 1.22), (0.13, 1.56)],
                 mat=ms, segments=10, smooth=False)
    common.add_outline(robe, stone, 0.035)
    # bras en croix, légèrement inclinés
    for sx in (1, -1):
        a = strut(c, f"arm{sx}", (sx * 0.06, 0, 1.50), (sx * 0.52, 0, 1.575), 0.085, ms)
        common.add_outline(a, stone, 0.028)
        h = box(c, f"hand{sx}", (0.10, 0.06, 0.06), (sx * 0.56, 0, 1.585), mat=ms)
    sphere(c, "head", 0.07, (0, -0.01, 1.70), ms, seg=18, rings=12, scale=(1, 1, 1.25))


# ── Taj Mahal ────────────────────────────────────────────────────────────────
def m_taj(c):
    ivory, ivory_d, gold = "#f7eede", "#e3d3b2", "#f2c14e"
    mi = toon_material("e_ivory", ivory, shade_hex="#c9b995")
    mid = toon_material("e_ivoryd", ivory_d)
    mg = toon_material("e_tgold", gold, extra_hot="#fff2b0")
    ink = flat_material("e_tink", common.outline_of(ivory))
    plat = box(c, "plat", (1.14, 0.62, 0.10), (0, 0, 0.05), mat=mid, bevel=0.015)
    common.add_outline(plat, ivory_d, 0.03)
    blockm = box(c, "block", (0.56, 0.44, 0.46), (0, 0, 0.33), mat=mi, bevel=0.02)
    common.add_outline(blockm, ivory, 0.032)
    # iwan (grande niche) + niches latérales
    ngon_prism(c, "iwan", [(-0.10, 0.0), (0.10, 0.0), (0.10, 0.24), (0.0, 0.33), (-0.10, 0.24)],
               0.03, (0, -0.215, 0.12), (0, 0, 0), ink)
    for sx in (1, -1):
        ngon_prism(c, f"niche{sx}", [(-0.045, 0), (0.045, 0), (0.045, 0.10), (0, 0.145), (-0.045, 0.10)],
                   0.02, (sx * 0.20, -0.215, 0.16), (0, 0, 0), ink)
    dome = lathe(c, "dome", [(0.19, 0.55), (0.245, 0.66), (0.23, 0.78), (0.155, 0.90),
                             (0.06, 0.99), (0.02, 1.03)], mat=mi, segments=28)
    common.add_outline(dome, ivory, 0.032)
    cyl(c, "drum", 0.20, 0.06, (0, 0, 0.575), mat=mid, segments=24)
    cyl(c, "fin1", 0.012, 0.10, (0, 0, 1.06), mat=mg, segments=8)
    sphere(c, "fin2", 0.022, (0, 0, 1.12), mg, seg=12, rings=8)
    # petits dômes latéraux (chhatris)
    for sx in (1, -1):
        cyl(c, f"chd{sx}", 0.075, 0.075, (sx * 0.215, 0.06, 0.585), mat=mid, segments=14)
        d = lathe(c, f"chdome{sx}", [(0.075, 0.62), (0.09, 0.665), (0.06, 0.72), (0.012, 0.755)],
                  (sx * 0.215, 0.06, 0.0), mat=mi, segments=18)
        common.add_outline(d, ivory, 0.02)
    # minarets aux 4 coins
    for sx in (1, -1):
        for sy in (1, -1):
            x, y = sx * 0.515, sy * 0.235
            mnr = cyl(c, f"min{sx}{sy}", 0.042, 0.62, (x, y, 0.41), mat=mi, segments=14, r2=0.032)
            common.add_outline(mnr, ivory, 0.024)
            for z in (0.30, 0.50):
                torus(c, f"minr{sx}{sy}{z}", 0.044, 0.011, (x, y, z), mat=mid,
                      seg_major=16, seg_minor=6)
            d = lathe(c, f"mindome{sx}{sy}", [(0.045, 0.72), (0.052, 0.745), (0.03, 0.775), (0.008, 0.795)],
                      (x, y, 0.0), mat=mi, segments=14)
            common.add_outline(d, ivory, 0.016)


# ── Colisée ──────────────────────────────────────────────────────────────────
def m_colosseum(c):
    stone, stone_d = "#e6b98b", "#c99a68"
    ms = toon_material("e_colo", stone)
    msd = toon_material("e_colod", stone_d)
    ink = flat_material("e_cink", common.outline_of(stone))
    import bmesh
    import bpy

    def ring_wall(name, r_out, r_in, z0, z1, arc=360.0, rot_z=0.0):
        prof = [(r_out, z0), (r_out, z1), (r_in, z1), (r_in, z0), (r_out, z0)]
        bm = bmesh.new()
        verts = [bm.verts.new((r, 0, z)) for r, z in prof]
        edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
        bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1),
                       angle=math.radians(arc), steps=max(8, round(48 * arc / 360)),
                       use_merge=arc >= 359.9, use_duplicate=False)
        if arc < 359.9:
            bmesh.ops.holes_fill(bm, edges=bm.edges)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
        obj = bpy.data.objects.new(name, mesh)
        c.objects.link(obj)
        obj.data.materials.append(ms)
        obj.rotation_euler = (0, 0, math.radians(rot_z))
        obj.scale = (1.0, 0.82, 1.0)
        return obj

    low = ring_wall("wall_low", 0.52, 0.44, 0.0, 0.36)
    common.add_outline(low, stone, 0.03)
    inner = ring_wall("wall_inner", 0.36, 0.30, 0.0, 0.22)
    inner.data.materials.clear()
    inner.data.materials.append(msd)
    # arène intérieure (sol sable)
    floor = cyl(c, "arena", 0.37, 0.03, (0, 0, 0.045), mat=toon_material("e_arena", "#e8cf9e"),
                segments=36)
    floor.scale = (1, 0.82, 1)
    # mur haut à l'arrière : segments de boîtes le long de l'arc (pas de fill)
    for i in range(11):
        a = math.radians(24 + i * 13.5)
        x, y = 0.485 * math.cos(a), 0.82 * 0.485 * math.sin(a)
        seg = box(c, f"high{i}", (0.13, 0.075, 0.25), (x, y, 0.475),
                  (0, 0, math.degrees(a) + 90), ms)
        common.add_outline(seg, stone, 0.022)
    # arches : deux rangées sur le devant, une sur l'arc haut
    for row_z, r, arc0, arc1, n in ((0.10, 0.525, 195, 345, 8),
                                    (0.245, 0.525, 195, 345, 8),
                                    (0.53, 0.50, 27, 160, 6)):
        for i in range(n):
            a = math.radians(arc0 + (arc1 - arc0) * (i + 0.5) / n)
            x, y = r * math.cos(a), 0.82 * r * math.sin(a)
            arch = box(c, f"arch{row_z}{i}", (0.055, 0.05, 0.10), (x, y, row_z),
                       (0, 0, math.degrees(a) + 90), ink)
    torus(c, "rim", 0.52, 0.014, (0, 0, 0.365), mat=msd, seg_major=48, seg_minor=6,
          scale=(1, 0.82, 1))


# ── Moulin hollandais ────────────────────────────────────────────────────────
def m_windmill(c):
    body, capc, white, grass = "#a9663a", "#7a4a28", "#f4efe2", "#7dc95e"
    mb = toon_material("e_mill", body)
    mc = toon_material("e_millcap", capc)
    mw = toon_material("e_millwhite", white, shade_hex="#c9c2ae")
    ink = flat_material("e_mink", common.outline_of(body))
    base = cyl(c, "lawn", 0.34, 0.07, (0, 0, 0.035), mat=toon_material("e_grass", grass),
               segments=28)
    common.add_outline(base, grass, 0.025)
    tower = cyl(c, "tower", 0.27, 0.82, (0, 0, 0.48), mat=mb, segments=24, r2=0.175)
    common.add_outline(tower, body, 0.035)
    # porte + fenêtres
    ngon_prism(c, "door", [(-0.055, 0), (0.055, 0), (0.055, 0.10), (0, 0.14), (-0.055, 0.10)],
               0.03, (0, -0.255, 0.07), (0, 0, 0), mw)
    for z, r in ((0.52, 0.235), (0.74, 0.20)):
        box(c, f"win{z}", (0.075, 0.03, 0.085), (0, -r, z), mat=mw)
    capd = sphere(c, "cap", 0.20, (0, 0, 0.925), mc, seg=20, rings=14, scale=(1, 1, 0.8))
    common.add_outline(capd, capc, 0.028)
    # moyeu + 4 ailes en croix (treillis à l'encre + panneau blanc)
    hub = (0, -0.175, 0.94)
    sphere(c, "hub", 0.045, hub, mc, seg=12, rings=8)
    for k in range(4):
        a = math.radians(45 + k * 90)
        dx, dz = math.cos(a), math.sin(a)
        tip = (hub[0] + dx * 0.62, hub[1] - 0.01, hub[2] + dz * 0.62)
        strut(c, f"sail{k}", hub, tip, 0.028, ink)
        # panneau : décalé d'un côté du bras, axe long le long du bras
        px, pz = -dz, dx
        mid = Vector((hub[0] + dx * 0.38 + px * 0.055, hub[1] - 0.012,
                      hub[2] + dz * 0.38 + pz * 0.055))
        pnl = box(c, f"panel{k}", (0.10, 0.016, 0.46), mid, mat=mw)
        pnl.rotation_euler = Vector((dx, 0, dz)).to_track_quat("Z", "Y").to_euler()
        common.add_outline(pnl, white, 0.02)
        for j in range(3):
            f = 0.16 + j * 0.16
            q0 = (hub[0] + dx * f, hub[1] - 0.012, hub[2] + dz * f)
            q1 = (hub[0] + dx * f + px * 0.11, hub[1] - 0.012, hub[2] + dz * f + pz * 0.11)
            strut(c, f"rung{k}{j}", q0, q1, 0.012, ink)


# ── Tour de Pise ─────────────────────────────────────────────────────────────
def m_pisa(c):
    marble, band = "#f4eedd", "#d9cba8"
    mm = toon_material("e_pisa", marble, shade_hex="#bfb693")
    mb = toon_material("e_pisaband", band)
    ink = flat_material("e_pink", common.outline_of(marble))
    lean = math.radians(8)
    def at(z):
        return (z * math.tan(lean), 0, z)

    base = cyl(c, "base", 0.21, 0.14, at(0.07), (0, math.degrees(lean), 0), mm, segments=24)
    common.add_outline(base, marble, 0.03)
    z = 0.14
    for i in range(6):
        h = 0.155
        st = cyl(c, f"stage{i}", 0.17, h, at(z + h / 2), (0, math.degrees(lean), 0), mm, segments=24)
        common.add_outline(st, marble, 0.026)
        torus(c, f"ledge{i}", 0.178, 0.011, at(z + h - 0.008), (0, math.degrees(lean), 0), mb,
              seg_major=28, seg_minor=6)
        # arcades : petites encoches sombres sur l'avant
        for j in range(5):
            a = math.radians(-52 + j * 26)
            x0, y0, z0 = at(z + h / 2)
            arc = box(c, f"arc{i}{j}", (0.022, 0.012, 0.075),
                      (x0 + 0.171 * math.sin(a), y0 - 0.171 * math.cos(a), z0),
                      (0, 0, -math.degrees(a)), ink)
        z += h
    bell = cyl(c, "belfry", 0.125, 0.14, at(z + 0.07), (0, math.degrees(lean), 0), mb, segments=20)
    common.add_outline(bell, band, 0.024)
    torus(c, "belfryledge", 0.132, 0.010, at(z + 0.135), (0, math.degrees(lean), 0), mb,
          seg_major=24, seg_minor=6)


# ── Moaï ─────────────────────────────────────────────────────────────────────
def m_moai(c):
    rock, rock_d, grass = "#91a0b5", "#6e7d94", "#7dc95e"
    mr = toon_material("e_moai", rock, shade_hex="#4d5a75")
    mrd = toon_material("e_moaid", rock_d)
    mound = cyl(c, "mound", 0.34, 0.09, (0, 0, 0.045),
                mat=toon_material("e_mgrass", grass), segments=24)
    mound.scale = (1, 0.85, 1)
    common.add_outline(mound, grass, 0.025)
    shoulders = box(c, "shoulders", (0.46, 0.28, 0.30), (0, 0, 0.23), mat=mrd, bevel=0.05)
    common.add_outline(shoulders, rock, 0.034)
    head = box(c, "head", (0.34, 0.26, 0.82), (0, 0, 0.78), mat=mr, bevel=0.06)
    common.add_outline(head, rock, 0.034)
    brow = box(c, "brow", (0.30, 0.09, 0.085), (0, -0.115, 1.045), mat=mrd, bevel=0.02)
    nose = box(c, "nose", (0.085, 0.09, 0.34), (0, -0.155, 0.83), mat=mr, bevel=0.02)
    common.add_outline(nose, rock, 0.024)
    box(c, "lips", (0.13, 0.05, 0.055), (0, -0.15, 0.55), mat=mrd, bevel=0.012)
    for sx in (1, -1):
        box(c, f"ear{sx}", (0.05, 0.09, 0.30), (sx * 0.185, 0.02, 0.80), mat=mrd, bevel=0.015)
        # orbites sombres
        box(c, f"eye{sx}", (0.085, 0.03, 0.05), (sx * 0.085, -0.135, 0.965),
            mat=flat_material("e_moaieye", "#39445c"))


# ── Golden Gate ──────────────────────────────────────────────────────────────
def m_goldengate(c):
    orange = "#f04a24"
    mo = toon_material("e_gg", orange, shade_hex="#9c2a10")
    ink = flat_material("e_ggink", common.outline_of(orange))
    deck = box(c, "deck", (1.36, 0.15, 0.05), (0, 0, 0.44), mat=mo, bevel=0.01)
    common.add_outline(deck, orange, 0.028)
    box(c, "rail", (1.36, 0.02, 0.025), (0, -0.065, 0.48), mat=mo)
    for tx in (-0.42, 0.42):
        for sx in (-1, 1):
            col = box(c, f"col{tx}{sx}", (0.055, 0.075, 1.02), (tx + sx * 0.075, 0, 0.51),
                      mat=mo, bevel=0.008)
            common.add_outline(col, orange, 0.024)
        for z in (0.62, 0.82, 1.00):
            box(c, f"beam{tx}{z}", (0.16, 0.06, 0.05), (tx, 0, z), mat=mo, bevel=0.008)
    # câbles porteurs : chaînes de segments paraboliques
    def cable(x0, z0, x1, z1, sag, n=10):
        pts = []
        for i in range(n + 1):
            t = i / n
            x = x0 + (x1 - x0) * t
            zline = z0 + (z1 - z0) * t
            z = zline - sag * 4 * t * (1 - t)
            pts.append((x, 0, z))
        for i in range(n):
            strut(c, f"cab{x0}{x1}{i}", pts[i], pts[i + 1], 0.022, mo)
        return pts

    mid = cable(-0.42, 1.035, 0.42, 1.035, 0.42)
    left = cable(-0.68, 0.44, -0.42, 1.035, -0.06, n=6)
    right = cable(0.42, 1.035, 0.68, 0.44, 0.06, n=6)
    # suspentes verticales
    for i, p in enumerate(mid):
        if 0 < i < len(mid) - 1:
            strut(c, f"susp{i}", p, (p[0], 0, 0.465), 0.01, ink)
    # piles courtes sous les tours
    for tx in (-0.42, 0.42):
        box(c, f"pier{tx}", (0.13, 0.10, 0.20), (tx, 0, 0.31), mat=mo)


# ── Opéra de Sydney ──────────────────────────────────────────────────────────
def m_sydney(c):
    import bmesh
    import bpy

    shell_hex, base_hex = "#f7f4ec", "#d8cfc0"
    msh = toon_material("e_shell", shell_hex, shade_hex="#bfc9da", bands=(0.52, 0.80))
    mba = toon_material("e_sydbase", base_hex)
    base = box(c, "base", (1.00, 0.44, 0.10), (0, 0, 0.05), mat=mba, bevel=0.015)
    common.add_outline(base, base_hex, 0.028)

    def sail(name, r, x, lean_deg, flip=False):
        """Coquille-croissant : demi-sphère fine tranchée par 2 plans inclinés."""
        s = -1 if flip else 1
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=r)
        bmesh.ops.scale(bm, verts=bm.verts, vec=Vector((1.0, 0.13, 1.0)))
        bmesh.ops.bisect_plane(
            bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
            plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True)
        # tranche arrière : garde un croissant orienté vers +X (ou -X si flip)
        bmesh.ops.bisect_plane(
            bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
            plane_co=(-s * 0.42 * r, 0, 0), plane_no=(s * 1.0, 0, -0.55),
            clear_inner=True)
        bmesh.ops.holes_fill(bm, edges=bm.edges)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
        obj = bpy.data.objects.new(name, mesh)
        c.objects.link(obj)
        obj.data.materials.append(msh)
        obj.location = (x, 0, 0.10)
        obj.rotation_euler = (0, math.radians(s * lean_deg), 0)
        common.add_outline(obj, "#aab4c6", 0.024)
        return obj

    sail("s1", 0.27, -0.33, 16)
    sail("s2", 0.35, -0.06, 18)
    sail("s3", 0.43, 0.24, 20)
    sail("s4", 0.24, 0.52, 18, flip=True)


# ── Grande Muraille ──────────────────────────────────────────────────────────
def m_greatwall(c):
    # v2 : collines ARRONDIES + muraille qui SERPENTE en profondeur par-dessus
    # les sommets (l'ancienne plaque verte extrudée lisait « socle rectangulaire »).
    wall, roof, grass, grass_d = "#cdb391", "#a0402a", "#6cbf5a", "#4f9c44"
    mw = toon_material("e_wall", wall)
    mr = toon_material("e_wallroof", roof, extra_hot="#e07a52")
    mg = toon_material("e_ridge", grass, bands=(0.46, 0.68))
    mgd = toon_material("e_ridge2", grass_d, bands=(0.46, 0.68))
    mpin = toon_material("e_wpine", "#2f6a3a")
    ink = flat_material("e_wink", common.outline_of(wall))
    # socle herbeux + trois collines en dômes (profondeur y variée)
    base = sphere(c, "gbase", 0.9, (0, 0.02, -0.16), mgd, seg=28, rings=18,
                  scale=(1.05, 0.5, 0.26))
    common.add_outline(base, grass_d, 0.028)
    hills = [(-0.48, 0.10, 0.42, 0.46), (0.16, 0.20, 0.50, 0.62), (0.68, -0.02, 0.32, 0.36)]
    for i, (hx, hy, hr, hh) in enumerate(hills):
        h = sphere(c, f"hill{i}", hr, (hx, hy, hh - hr), mg if i % 2 == 0 else mgd,
                   seg=24, rings=16, scale=(1.15, 0.8, 1.0))
        common.add_outline(h, grass, 0.03)
    # chemin 3D de la muraille : cols et sommets, zigzag en profondeur
    path = [(-0.92, -0.16, 0.20), (-0.48, 0.10, 0.52), (-0.14, -0.14, 0.26),
            (0.16, 0.20, 0.68), (0.48, -0.10, 0.30), (0.78, 0.02, 0.42),
            (0.95, 0.18, 0.30)]
    for i in range(len(path) - 1):
        a, b = Vector(path[i]), Vector(path[i + 1])
        d = b - a
        seg = box(c, f"wall{i}", (0.15, 0.15, d.length + 0.06),
                  ((a + b) / 2)[:], mat=mw)
        seg.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
        common.add_outline(seg, wall, 0.024)
        n = max(2, int(d.length / 0.11))
        for k in range(n):
            t = (k + 0.5) / n
            p = a.lerp(b, t)
            cren = box(c, f"cren{i}{k}", (0.045, 0.17, 0.05),
                       (p.x, p.y, p.z + 0.10), mat=mw)
            cren.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
            common.add_outline(cren, wall, 0.012)
    # tours de guet aux sommets (corps + corniche + toit pagode + porte)
    for i, ti in enumerate((1, 3, 5)):
        tx, ty, tz = path[ti]
        s = 1.15 if ti == 3 else 0.95
        tower = box(c, f"tower{i}", (0.22 * s, 0.22 * s, 0.30 * s),
                    (tx, ty, tz + 0.13 * s), mat=mw, bevel=0.01)
        common.add_outline(tower, wall, 0.026)
        box(c, f"tcorn{i}", (0.27 * s, 0.27 * s, 0.045), (tx, ty, tz + 0.28 * s), mat=mw)
        roofb = cyl(c, f"troof{i}", 0.20 * s, 0.15 * s, (tx, ty, tz + 0.37 * s),
                    (0, 0, 45), mr, segments=4, r2=0.025, smooth=False)
        common.add_outline(roofb, roof, 0.022)
        box(c, f"tdoor{i}", (0.07 * s, 0.03, 0.10 * s), (tx, ty - 0.115 * s, tz + 0.10 * s), mat=ink)
    # pins sur les flancs
    for j, (px, py, pz, ph) in enumerate(
            ((-0.80, -0.16, 0.06, 0.26), (0.44, -0.24, 0.05, 0.22), (0.0, -0.34, 0.02, 0.20))):
        pn = cone(c, f"wpine{j}", ph * 0.40, ph, (px, py, pz + ph / 2), mat=mpin,
                  segments=8, smooth=False)
        common.add_outline(pn, "#2f6a3a", 0.016)


# ── Boussole (emblème) ───────────────────────────────────────────────────────
def m_compass(c):
    gold, face_hex, red, navy = "#f7b32e", "#fdf6e3", "#e8452c", "#2c3e6b"
    mg = toon_material("e_cgold", gold, extra_hot="#fff2b0")
    mf = toon_material("e_cface", face_hex, rim=0)
    ink = flat_material("e_cpink", common.outline_of(gold))
    body = cyl(c, "body", 0.46, 0.11, (0, 0, 0.50), (90, 0, 0), mg, segments=36)
    common.add_outline(body, gold, 0.032)
    face = cyl(c, "face", 0.385, 0.115, (0, -0.004, 0.50), (90, 0, 0), mf, segments=36)
    # graduations
    for i in range(12):
        a = math.radians(i * 30)
        r0 = 0.33
        box(c, f"tick{i}", (0.018, 0.012, 0.05), (r0 * math.sin(a), -0.065, 0.50 + r0 * math.cos(a)),
            (0, -math.degrees(a), 0), ink)
    for txt, (dx, dz) in (("N", (0, 0.255)), ("S", (0, -0.255)), ("E", (0.255, 0)), ("O", (-0.255, 0))):
        t = text_obj(c, f"lbl{txt}", txt, 0.11, ink, (dx, -0.068, 0.50 + dz), (90, 0, 0), extrude=0.012)
    # aiguille
    ngon_prism(c, "needleN", [(-0.045, 0), (0.045, 0), (0, 0.30)], 0.02, (0, -0.075, 0.50),
               (0, 0, 0), toon_material("e_cred", red))
    ngon_prism(c, "needleS", [(-0.045, 0), (0.045, 0), (0, -0.30)], 0.02, (0, -0.075, 0.50),
               (0, 0, 0), toon_material("e_cnavy", navy))
    sphere(c, "pivot", 0.042, (0, -0.085, 0.50), mg, seg=14, rings=10)
    # anneau de suspension
    tor = torus(c, "loop", 0.075, 0.020, (0, 0, 1.02), (90, 0, 0), mg, seg_major=20, seg_minor=8)
    common.add_outline(tor, gold, 0.02)
    cyl(c, "loopbase", 0.035, 0.05, (0, 0, 0.965), mat=mg, segments=10)


# ── Étoile (succès) ──────────────────────────────────────────────────────────
def m_st_star(c):
    gold = "#ffc924"
    mg = toon_material("e_stargold", gold, glow=0.08, extra_hot="#ffe98f")
    pts = []
    for i in range(10):
        r = 0.44 if i % 2 == 0 else 0.185
        a = math.radians(90 + i * 36)
        pts.append((r * math.cos(a), r * math.sin(a)))
    # étoile facettée : éventail vers un apex avant + un apex arrière -> les
    # facettes alternent bande claire / bande sombre (relief cartoon)
    import bmesh
    import bpy as _bpy

    bm = bmesh.new()
    apex_f = bm.verts.new((0, -0.09, 0))
    apex_b = bm.verts.new((0, 0.06, 0))
    ring = [bm.verts.new((x, 0, z)) for x, z in pts]
    for i in range(10):
        a, b = ring[i], ring[(i + 1) % 10]
        bm.faces.new((apex_f, a, b))
        bm.faces.new((apex_b, b, a))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = _bpy.data.meshes.new("star")
    bm.to_mesh(mesh)
    bm.free()
    star = _bpy.data.objects.new("star", mesh)
    c.objects.link(star)
    star.data.materials.append(mg)
    star.location = (0, 0, 0.46)
    common.add_outline(star, gold, 0.05)
    halo = cyl(c, "halo_NoOutline", 0.50, 0.012, (0, 0.07, 0.46), (90, 0, 0),
               flat_material("e_starhalo", "#ffd76a", alpha=0.16), segments=36)
    for (dx, dz, s) in ((-0.55, 0.78, 1.0), (0.60, 0.30, 0.8), (0.42, 0.86, 0.65),
                        (-0.48, 0.18, 0.6)):
        mini = []
        for i in range(10):
            r = (0.075 if i % 2 == 0 else 0.032) * s
            a = math.radians(90 + i * 36)
            mini.append((r * math.cos(a), r * math.sin(a)))
        m = ngon_prism(c, f"mini{dx}{dz}", mini, 0.03, (dx, 0.02, dz), (0, 0, 0), mg)
        common.add_outline(m, gold, 0.022)


# ── Sommet (succès) ──────────────────────────────────────────────────────────
def m_st_summit(c):
    rock, snow, red = "#8f9bb0", "#ffffff", "#e8452c"
    mr = toon_material("e_peak", rock, shade_hex="#57627d")
    msn = toon_material("e_peaksnow", snow, shade_hex="#ccd9f2")
    peak = lathe(c, "peak", [(0.56, 0), (0.42, 0.20), (0.28, 0.46), (0.155, 0.74), (0.05, 1.02)],
                 mat=mr, segments=7, smooth=False)
    common.add_outline(peak, rock, 0.04)
    p2 = lathe(c, "peak2", [(0.34, 0), (0.22, 0.18), (0.12, 0.42), (0.04, 0.62)],
               (-0.42, 0.22, 0), mat=mr, segments=6, smooth=False)
    common.add_outline(p2, rock, 0.035)
    cap = lathe(c, "snow", [(0.20, 0.62), (0.12, 0.85), (0.045, 1.03), (0.0, 1.06)],
                mat=msn, segments=7, smooth=False)
    common.add_outline(cap, "#dce6f5", 0.026)
    cap2 = lathe(c, "snow2", [(0.115, 0.44), (0.06, 0.58), (0.0, 0.64)],
                 (-0.42, 0.22, 0), mat=msn, segments=6, smooth=False)
    for i in range(5):
        a = math.radians(i * 72 + 30)
        x, y = 0.205 * math.sin(a), -0.205 * math.cos(a)
        ngon_prism(c, f"drip{i}", [(-0.045, 0), (0.045, 0), (0, -0.10)], 0.045,
                   (x, y, 0.635), (0, 0, -math.degrees(a)), msn)
    cyl(c, "pole", 0.013, 0.26, (0, 0, 1.17), mat=flat_material("e_pole", "#5a4630"), segments=8)
    flag = ngon_prism(c, "flag", [(0, 0), (0.24, 0.045), (0.19, 0.085), (0.24, 0.125), (0, 0.17)],
                      0.016, (0.01, 0, 1.10), (0, 0, 0), toon_material("e_flag", red))
    common.add_outline(flag, red, 0.02)


# ── Arbre-Monde (succès) ─────────────────────────────────────────────────────
def m_st_worldtree(c):
    trunk, leaf1, leaf2, gold = "#8a5a34", "#58c15a", "#3f9e4b", "#ffd23e"
    mt = toon_material("e_trunk", trunk)
    ml1 = toon_material("e_leaf1", leaf1)
    ml2 = toon_material("e_leaf2", leaf2)
    mg = toon_material("e_fruit", gold, glow=0.3)
    tr = lathe(c, "trunk", [(0.19, 0), (0.115, 0.22), (0.085, 0.55), (0.07, 0.85)],
               mat=mt, segments=10, smooth=False)
    common.add_outline(tr, trunk, 0.035)
    for i, a in enumerate((15, 135, 255)):
        ar = math.radians(a)
        root = cone(c, f"root{i}", 0.085, 0.30, (0.20 * math.sin(ar), -0.20 * math.cos(ar), 0.10),
                    mat=mt, segments=6, smooth=False)
        root.rotation_euler = Euler((math.radians(-34) * math.cos(ar), math.radians(-34) * -math.sin(ar), 0))
        common.add_outline(root, trunk, 0.022)
    b1 = strut(c, "branch1", (0.04, 0, 0.78), (0.26, -0.03, 1.02), 0.05, mt)
    b2 = strut(c, "branch2", (-0.04, 0, 0.72), (-0.24, 0.03, 0.95), 0.045, mt)
    canopy = [
        ("can1", 0.40, (0, 0.02, 1.22), ml1),
        ("can2", 0.28, (0.30, -0.02, 1.06), ml2),
        ("can3", 0.26, (-0.29, 0.04, 1.02), ml2),
        ("can4", 0.24, (0.02, -0.20, 1.05), ml1),
        ("can5", 0.20, (-0.05, 0.06, 1.48), ml2),
    ]
    for name, r, loc, m in canopy:
        s = sphere(c, name, r, loc, m, seg=20, rings=14)
        common.add_outline(s, leaf1, 0.035)
    for i, (x, y, z) in enumerate(((0.24, -0.24, 1.18), (-0.22, -0.20, 1.12),
                                   (0.05, -0.28, 0.98), (0.36, -0.12, 1.30),
                                   (-0.10, -0.18, 1.52), (-0.33, -0.10, 1.18))):
        f = sphere(c, f"fruit{i}", 0.055, (x, y, z), mg, seg=12, rings=8)
        common.add_outline(f, "#b8860b", 0.016)


# ── Lauriers (succès) ────────────────────────────────────────────────────────
def m_st_laurel(c):
    gold, gold_d, red = "#e8c04a", "#c69a2e", "#c0392b"
    mg = toon_material("e_wreath", gold, extra_hot="#fff2b0")
    mgd = toon_material("e_wreathd", gold_d)
    R, cz = 0.40, 0.50
    # anneau dans le plan XZ (face caméra), ouverture centrée en haut
    ring = torus(c, "ring", R, 0.026, mat=mg, seg_major=44, seg_minor=8, arc_deg=310)
    ring.matrix_world = (
        Matrix.Translation((0, 0, cz))
        @ Matrix.Rotation(math.pi / 2, 4, "X")
        @ Matrix.Rotation(math.radians(115), 4, "Z")
    )
    common.add_outline(ring, gold, 0.024)
    # paires de feuilles nettement décollées de l'anneau, pointées vers le haut
    for side in (1, -1):
        for i in range(7):
            phi = math.radians(-90 + side * (20 + i * 25))
            for k, (roff, tilt) in enumerate(((0.062, 52), (-0.055, -46))):
                rr = R + roff
                x, z = rr * math.cos(phi), cz + rr * math.sin(phi)
                leaf = sphere(c, f"leaf{side}{i}{k}", 0.085, (x, 0, z),
                              mg if (i + k) % 2 else mgd, seg=12, rings=8,
                              scale=(1.0, 0.26, 0.38),
                              rot=(0, -(math.degrees(phi) + 90) + side * tilt, 0))
                common.add_outline(leaf, gold, 0.018)
    # nœud de ruban en bas
    knot = sphere(c, "knot", 0.055, (0, -0.01, cz - R), toon_material("e_ribbon", red), seg=12, rings=8)
    for sx in (1, -1):
        rib = ngon_prism(c, f"rib{sx}", [(0, 0), (sx * 0.09, -0.14), (sx * 0.055, -0.16), (0, -0.045)],
                         0.02, (0, -0.01, cz - R), (0, 0, 0), toon_material("e_ribbon", red))
        common.add_outline(rib, red, 0.018)


BUILDERS = {k.replace("m_", "emblem_"): v for k, v in list(globals().items())
            if k.startswith("m_") and callable(v)}
