# Satellites — objets solo (cadrage auto serré au rendu), DA pro cartoon.
# Convention locale : objet centré sur l'origine, face/avant vers -Y ou +X,
# taille libre (~1 unité), contours épais lisibles à 40 px.
import math

from mathutils import Euler, Vector

import common
from common import (
    box, cone, cyl, flat_material, get_collection, lathe, ngon_prism,
    sphere, strut, toon_material, torus,
)


def build(cid):
    fn = globals()[cid.replace("sat_", "s_")]
    coll = get_collection(cid)
    fn(coll)
    return coll


def s_moon(c):
    body_hex = "#efe8d8"
    mb = toon_material("s_moon", body_hex, shade_hex="#b9b09a", bands=(0.42, 0.72))
    mc = toon_material("s_crater", "#cfc5ae", shade_hex="#a89e86", rim=0)
    b = sphere(c, "moon", 0.52, (0, 0, 0), mb, seg=40, rings=28)
    common.add_outline(b, body_hex, 0.035)
    craters = [(-28, 18, 0.15), (18, 30, 0.10), (30, -12, 0.13), (-8, -30, 0.09),
               (-38, -14, 0.075), (5, 3, 0.065)]
    for i, (lon, lat, r) in enumerate(craters):
        lo, la = math.radians(lon), math.radians(lat)
        n = Vector((math.sin(lo) * math.cos(la), -math.cos(lo) * math.cos(la) * 0.9,
                    math.sin(la))).normalized()
        pos = n * 0.505
        cr = sphere(c, f"crater{i}", r, pos, mc, seg=18, rings=12, scale=(1, 1, 0.35))
        cr.rotation_euler = n.to_track_quat("Z", "Y").to_euler()


def s_plane(c):
    white, belly, accent = "#f4f7fb", "#b8cbe0", "#e8452c"
    mw = toon_material("s_white", white, shade_hex="#b9c6da")
    mbl = toon_material("s_belly", belly)
    ma = toon_material("s_red", accent)
    ink = flat_material("s_ink", "#26314c")
    fus = sphere(c, "fuselage", 0.5, (0, 0, 0), mw, seg=32, rings=20, scale=(1, 0.24, 0.24))
    common.add_outline(fus, white, 0.028)
    nose = sphere(c, "nose", 0.10, (0.50, 0, 0), mbl, seg=16, rings=12)
    # ailes en flèche (plaques horizontales, forme vue de dessus)
    for sy in (1, -1):
        wing = ngon_prism(c, f"wing{sy}", [(0.20, 0.0), (0.02, 0.44), (-0.16, 0.48), (-0.18, 0.0)],
                          0.025, (0.02, 0, -0.05), (sy * -90, 0, 0), mw)
        common.add_outline(wing, white, 0.022)
    tail = ngon_prism(c, "tailfin", [(0.0, 0), (-0.18, 0), (-0.26, 0.22), (-0.17, 0.22)],
                      0.03, (-0.30, 0, 0.04), (0, 0, 0), ma)
    common.add_outline(tail, accent, 0.02)
    for sy in (1, -1):
        ngon_prism(c, f"stab{sy}", [(0.0, 0.0), (-0.10, 0.16), (-0.17, 0.16), (-0.14, 0.0)],
                   0.02, (-0.32, 0, 0.05), (sy * -90, 0, 0), ma)
    # moteurs + hublots
    for sy in (1, -1):
        cyl(c, f"eng{sy}", 0.05, 0.14, (0.10, sy * 0.20, -0.09), (0, 90, 0), mbl, segments=12)
    for i in range(5):
        sphere(c, f"win{i}_NoOutline", 0.022, (0.30 - i * 0.13, -0.10, 0.085), ink, seg=8, rings=6)
    common.group_rotate(c, "sat_plane", (-24, 6, -16))


def s_balloon(c):
    red, cream, wick = "#e8452c", "#f7ecd8", "#a9773f"
    mr = toon_material("s_balloonred", red)
    mc = toon_material("s_ballooncream", cream)
    mw = toon_material("s_wicker", wick)
    ink = flat_material("s_bink", "#3a2a18")
    env = lathe(c, "envelope", [(0.02, -0.30), (0.20, -0.24), (0.42, 0.0), (0.46, 0.22),
                                (0.36, 0.44), (0.18, 0.58), (0.0, 0.62)],
                mat=mr, segments=32)
    common.add_outline(env, red, 0.032)
    # fuseaux crème : secteurs de révolution plaqués sur l'avant
    for k in (-1, 0, 1):
        stripe = lathe(c, f"gore{k}", [(0.025, -0.295), (0.206, -0.234), (0.426, 0.003),
                                       (0.466, 0.22), (0.366, 0.442), (0.186, 0.578), (0.02, 0.615)],
                       mat=mc, segments=32, arc_deg=26)
        stripe.rotation_euler = Euler((0, 0, math.radians(-103 + k * 34)))
    basket = box(c, "basket", (0.30, 0.30, 0.20), (0, 0, -0.60), mat=mw, bevel=0.02)
    common.add_outline(basket, wick, 0.024)
    box(c, "basketrim", (0.34, 0.34, 0.045), (0, 0, -0.51), mat=ink)
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        strut(c, f"rope{sx}{sy}", (sx * 0.13, sy * 0.13, -0.52),
              (sx * 0.20, sy * 0.20, -0.27), 0.012, ink)
    # brûleur + flamme (animée en live : flicker via /^flame/)
    cyl(c, "burner", 0.035, 0.05, (0, 0, -0.49), mat=ink, segments=8)
    lathe(c, "flameb_NoOutline", [(0.005, -0.465), (0.030, -0.44), (0.020, -0.405),
                                  (0.0, -0.37)],
          mat=toon_material("s_bflame", "#ffb02e", glow=0.5, extra_hot="#fff6c8"),
          segments=10, smooth=False)


def s_satellite(c):
    gold, panel, grid = "#e8b23a", "#3f6fd8", "#22355c"
    mg = toon_material("s_gold", gold, extra_hot="#ffe9a0")
    mp = toon_material("s_panel", panel, shade_hex="#2a4a99")
    ink = flat_material("s_sink", grid)
    body = box(c, "body", (0.34, 0.30, 0.42), (0, 0, 0), mat=mg, bevel=0.02)
    common.add_outline(body, gold, 0.03)
    for sx in (1, -1):
        arm = cyl(c, f"arm{sx}", 0.028, 0.16, (sx * 0.25, 0, 0), (0, 90, 0), ink, segments=8)
        pnl = box(c, f"panel{sx}", (0.52, 0.02, 0.30), (sx * 0.60, 0, 0), mat=mp)
        common.add_outline(pnl, panel, 0.022)
        for i in range(3):
            box(c, f"grid{sx}{i}", (0.012, 0.026, 0.30), (sx * (0.41 + i * 0.13), 0, 0), mat=ink)
        box(c, f"gridh{sx}", (0.52, 0.026, 0.014), (sx * 0.60, 0, 0), mat=ink)
    dish = lathe(c, "dish", [(0.0, 0.0), (0.16, 0.02), (0.19, 0.06)],
                 (0, 0, 0.26), (18, 0, 0), toon_material("s_dish", "#dfe5f0"), segments=20)
    common.add_outline(dish, "#dfe5f0", 0.018)
    cyl(c, "mast", 0.014, 0.12, (0, -0.02, 0.28), (18, 0, 0), ink, segments=6)
    sphere(c, "feed", 0.028, (0, -0.045, 0.345), mg, seg=10, rings=8)
    # balise clignotante (animée en live : /^blink/)
    cyl(c, "blinkmast", 0.010, 0.07, (0.13, 0.11, 0.24), mat=ink, segments=6)
    sphere(c, "blink_NoOutline", 0.030, (0.13, 0.11, 0.29),
           flat_material("s_blink", "#ff5a4a"), seg=10, rings=8)


def s_iss(c):
    white, panel, ink_hex = "#eef1f6", "#c8781e", "#33405e"
    mw = toon_material("s_issw", white, shade_hex="#b3bed2")
    mp = toon_material("s_isspanel", "#d99226", shade_hex="#a56a12")
    ink = flat_material("s_issink", ink_hex)
    # poutre principale
    truss = box(c, "truss", (1.5, 0.05, 0.05), (0, 0, 0.12), mat=ink)
    # modules pressurisés
    mods = [((0, 0, -0.10), (90, 0, 0), 0.11, 0.62), ((0, -0.28, -0.10), (0, 90, 0), 0.09, 0.36),
            ((0, 0.20, -0.10), (0, 90, 0), 0.09, 0.30)]
    for i, (loc, rot, r, ln) in enumerate(mods):
        m = cyl(c, f"mod{i}", r, ln, loc, rot, mw, segments=16)
        common.add_outline(m, white, 0.022)
    sphere(c, "node", 0.10, (0, 0, -0.10), mw, seg=16, rings=12)
    # panneaux solaires par paires
    for sx in (1, -1):
        for k in (0, 1):
            x = sx * (0.42 + k * 0.33)
            for sz in (1, -1):
                p = box(c, f"sp{sx}{k}{sz}", (0.135, 0.02, 0.42), (x, 0, 0.12 + sz * 0.26), mat=mp)
                common.add_outline(p, "#d99226", 0.018)
                for j in range(3):
                    box(c, f"spl{sx}{k}{sz}{j}", (0.14, 0.026, 0.012),
                        (x, 0, -0.02 + sz * 0.26 + 0.14 + j * 0.115), mat=ink)
    # radiateur
    box(c, "radiator", (0.05, 0.30, 0.02), (0, 0.36, 0.13), mat=mw)
    # balise clignotante en bout de poutre (animée en live : /^blink/)
    sphere(c, "blink_NoOutline", 0.032, (0.78, 0, 0.12),
           flat_material("s_blink", "#ff5a4a"), seg=10, rings=8)
    common.group_rotate(c, "sat_iss", (14, 0, -18))


def s_comet(c):
    ice, tail1, tail2 = "#cfeefc", "#7fd4f7", "#3fa8e8"
    mi = toon_material("s_ice", ice, shade_hex="#8fb8d8", extra_hot="#ffffff")
    head = sphere(c, "head", 0.30, (0.30, 0, 0), mi, seg=24, rings=16)
    common.add_outline(head, ice, 0.03)
    # cailloux de glace sur la tête
    for i, (a, r) in enumerate(((30, 0.075), (-20, 0.06), (75, 0.05))):
        ar = math.radians(a)
        sphere(c, f"chunk{i}", r, (0.30 + 0.27 * math.cos(ar), -0.10, 0.27 * math.sin(ar)),
               toon_material("s_icecore", "#a8d8ef"), seg=10, rings=8)
    # queue : trois languettes effilées
    for i, (dz, ln, w, m) in enumerate(((0.0, 0.95, 0.16, flat_material("s_tail1", tail1)),
                                        (0.14, 0.7, 0.10, flat_material("s_tail2", tail2)),
                                        (-0.13, 0.62, 0.09, flat_material("s_tail3", tail2)))):
        t = ngon_prism(c, f"tail{i}", [(0, w), (0, -w), (-ln, dz * 0.3)],
                       0.06, (0.08, 0, dz), (0, 0, 0), m)


def s_paperplane(c):
    paper, crease = "#f6f8fc", "#c9d4e6"
    mp = toon_material("s_paper", paper, shade_hex="#b9c6dd", bands=(0.5, 0.78))
    mc = toon_material("s_paper2", crease)
    # dart : deux ailes en V (plaques posées à plat puis relevées) + carène
    for sy in (1, -1):
        w = ngon_prism(c, f"wing{sy}", [(0.55, 0.0), (-0.45, 0.34), (-0.42, 0.0)],
                       0.015, (0, 0, 0.02), (sy * -90 + sy * 34, 0, 0), mp)
        common.add_outline(w, paper, 0.014)
    keel = ngon_prism(c, "keel", [(0.55, 0.02), (-0.42, 0.0), (-0.40, -0.30)],
                      0.02, (0, 0, 0), (0, 0, 0), mc)
    common.add_outline(keel, crease, 0.014)
    common.group_rotate(c, "sat_paperplane", (-38, 12, -20))


def s_bird(c):
    body_hex, wing_hex, beak = "#4fa8e8", "#2f7fc4", "#f7b32e"
    mb = toon_material("s_bird", body_hex)
    mw2 = toon_material("s_bird2", wing_hex)
    mk = toon_material("s_beak", beak)
    ink = flat_material("s_birdink", "#1d2a44")
    body = sphere(c, "body", 0.34, (0, 0, 0), mb, seg=24, rings=16, scale=(1.25, 0.8, 0.8))
    common.add_outline(body, body_hex, 0.03)
    head = sphere(c, "head", 0.20, (0.34, 0, 0.14), mb, seg=20, rings=14)
    common.add_outline(head, body_hex, 0.026)
    cone(c, "beak", 0.075, 0.18, (0.55, 0, 0.12), (0, 102, 0), mk, segments=10, smooth=False)
    sphere(c, "eye_NoOutline", 0.035, (0.42, -0.115, 0.20), ink, seg=8, rings=6)
    sphere(c, "belly", 0.23, (0.05, -0.08, -0.10), toon_material("s_belly2", "#dff0fb"),
           seg=18, rings=12, scale=(1.15, 0.55, 0.7))
    # ailes déployées (battement) — silhouette arrondie à plumes (fini la flèche)
    wing_pts = [(0.16, 0.0), (0.10, 0.05), (-0.02, 0.10), (-0.15, 0.24),
                (-0.24, 0.40), (-0.215, 0.41), (-0.16, 0.31), (-0.115, 0.355),
                (-0.085, 0.25), (-0.03, 0.275), (-0.015, 0.17), (0.06, 0.10),
                (0.13, 0.045)]
    for sy in (1, -1):
        wg = ngon_prism(c, f"wing{sy}", wing_pts,
                        0.05, (0, 0, 0), (0, 0, 0), mw2)
        wg.location = (-0.02, sy * 0.26, 0.10)
        wg.rotation_euler = Euler((math.radians(-sy * 55), 0, 0))
        common.add_outline(wg, wing_hex, 0.022)
    tail = ngon_prism(c, "tail", [(0, 0.05), (0, -0.05), (-0.30, -0.16), (-0.30, 0.10)],
                      0.05, (-0.36, 0, 0.02), (0, 8, 0), mw2)
    common.add_outline(tail, wing_hex, 0.02)


def s_rocket(c):
    red, white, gold = "#e8452c", "#f4f7fb", "#f7b32e"
    mr = toon_material("s_rocketred", red)
    mw = toon_material("s_rocketwhite", white, shade_hex="#bcc8dc")
    mg = toon_material("s_flame", gold, glow=0.45, extra_hot="#fff6c8")
    ink = flat_material("s_rink", "#26314c")
    body = lathe(c, "body", [(0.10, -0.42), (0.19, -0.28), (0.21, 0.05), (0.16, 0.30), (0.10, 0.42)],
                 mat=mw, segments=24)
    common.add_outline(body, white, 0.028)
    nosec = lathe(c, "nose", [(0.10, 0.41), (0.085, 0.50), (0.02, 0.62)], mat=mr, segments=20)
    common.add_outline(nosec, red, 0.024)
    torus(c, "collar", 0.105, 0.022, (0, 0, 0.41), mat=mr, seg_major=20, seg_minor=8)
    # hublot bien en saillie sur la coque
    torus(c, "portring", 0.088, 0.026, (0, -0.205, 0.10), (78, 0, 0), mr, seg_major=20, seg_minor=8)
    sphere(c, "port", 0.082, (0, -0.175, 0.10), toon_material("s_glass", "#9fdcf7", rim=0),
           seg=16, rings=12, scale=(1, 0.45, 1))
    # ailerons
    for k in range(3):
        a = math.radians(90 + k * 120)
        fin = ngon_prism(c, f"fin{k}", [(0, 0.1), (0.16, -0.10), (0.10, -0.32), (0, -0.18)],
                         0.035, (0, 0, 0), (0, 0, 0), mr)
        fin.location = (0.16 * math.cos(a), 0.16 * math.sin(a), -0.28)
        fin.rotation_euler = Euler((0, 0, a))
        common.add_outline(fin, red, 0.022)
    cyl(c, "nozzle", 0.09, 0.08, (0, 0, -0.45), mat=ink, segments=14, r2=0.115)
    flame = lathe(c, "flame_NoOutline", [(0.01, -0.50), (0.075, -0.56), (0.05, -0.68), (0.0, -0.80)],
                  mat=mg, segments=12, smooth=False)


def s_ufo(c):
    hull, dome, glow = "#a8b4c8", "#8fe8d8", "#f7e63e"
    mh = toon_material("s_ufohull", hull, shade_hex="#6a7690")
    md = toon_material("s_ufodome", dome, shade_hex="#4fb8a8", rim=0.3)
    saucer = lathe(c, "saucer", [(0.02, -0.10), (0.30, -0.10), (0.52, 0.0), (0.30, 0.10), (0.02, 0.10)],
                   mat=mh, segments=32)
    common.add_outline(saucer, hull, 0.03)
    dm = sphere(c, "dome", 0.22, (0, 0, 0.09), md, seg=24, rings=16, scale=(1, 1, 0.85))
    common.add_outline(dm, dome, 0.024)
    ring = torus(c, "rim", 0.40, 0.035, (0, 0, -0.035), mat=toon_material("s_ufobelt", "#7e8aa4"),
                 seg_major=32, seg_minor=8, scale=(1, 1, 0.6))
    for i in range(8):
        a = math.radians(i * 45)
        sphere(c, f"light{i}_NoOutline", 0.045, (0.41 * math.cos(a), 0.41 * math.sin(a), -0.045),
               flat_material("s_ufolight", glow), seg=10, rings=8)
    cyl(c, "beam_NoOutline", 0.10, 0.16, (0, 0, -0.19),
        mat=flat_material("s_beam", "#fff6a8", alpha=0.35), segments=16, r2=0.20)


def s_shootingstar(c):
    gold = "#ffd23e"
    mg = toon_material("s_star", gold, glow=0.1, extra_hot="#fff2b0")
    import bmesh
    import bpy as _bpy

    pts = []
    for i in range(10):
        r = 0.30 if i % 2 == 0 else 0.13
        a = math.radians(90 + i * 36)
        pts.append((r * math.cos(a), r * math.sin(a)))
    bm = bmesh.new()
    af = bm.verts.new((0, -0.07, 0))
    ab = bm.verts.new((0, 0.05, 0))
    ring = [bm.verts.new((x, 0, z)) for x, z in pts]
    for i in range(10):
        a, b = ring[i], ring[(i + 1) % 10]
        bm.faces.new((af, a, b))
        bm.faces.new((ab, b, a))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = _bpy.data.meshes.new("star")
    bm.to_mesh(mesh)
    bm.free()
    star = _bpy.data.objects.new("star", mesh)
    c.objects.link(star)
    star.data.materials.append(mg)
    star.location = (0.30, 0, 0.06)
    common.add_outline(star, gold, 0.035)
    # traîne
    for i, (dz, ln, w, hexc_) in enumerate(((0.02, 0.85, 0.11, "#ffd76a"),
                                            (0.14, 0.55, 0.07, "#ffe9a0"),
                                            (-0.10, 0.5, 0.06, "#ffe9a0"))):
        ngon_prism(c, f"trail{i}", [(0, w), (0, -w), (-ln, dz * 0.4)],
                   0.05, (0.06, 0, dz), (0, 0, 0), flat_material(f"s_trail{i}", hexc_))


def s_st_moon(c):
    gold = "#f2cf5b"
    mg = toon_material("s_stmoon", gold, extra_hot="#fff2b0")
    ink = flat_material("s_stmink", "#7a5a14")
    # croissant 2.5D facetté
    import bmesh
    import bpy as _bpy

    # croissant : bande de quads entre arc extérieur et arc intérieur, solidifiée
    outer_r, inner_r, off = 0.46, 0.40, 0.24
    bm = bmesh.new()
    # les deux arcs longent le côté gauche, des pointes hautes aux pointes basses
    outer, inner = [], []
    for i in range(13):
        ao = math.radians(60 + i * 20)            # arc extérieur 60° -> 300°
        ai = math.radians(92 + i * (176 / 12))    # arc intérieur 92° -> 268°
        outer.append(bm.verts.new((outer_r * math.cos(ao), 0, outer_r * math.sin(ao))))
        inner.append(bm.verts.new((inner_r * math.cos(ai) + off, 0, inner_r * math.sin(ai))))
    for i in range(12):
        bm.faces.new((outer[i], outer[i + 1], inner[i + 1], inner[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.solidify(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                       thickness=0.14)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = _bpy.data.meshes.new("crescent")
    bm.to_mesh(mesh)
    bm.free()
    moon = _bpy.data.objects.new("crescent", mesh)
    c.objects.link(moon)
    moon.data.materials.append(mg)
    common.add_outline(moon, gold, 0.035)
    # petites étoiles compagnes
    for (dx, dz, s) in ((0.34, 0.30, 1.0), (0.42, -0.18, 0.7), (0.18, -0.38, 0.55)):
        mini = []
        for i in range(10):
            r = (0.07 if i % 2 == 0 else 0.03) * s
            a = math.radians(90 + i * 36)
            mini.append((r * math.cos(a) + dx, r * math.sin(a) + dz))
        st = ngon_prism(c, f"mini{dx}", mini, 0.03, (0, 0, 0), (0, 0, 0), mg)
        common.add_outline(st, gold, 0.016)


def s_st_ship(c):
    hull_hex, sail_hex, trim = "#8a5a34", "#f7f2e2", "#e8452c"
    mh = toon_material("s_hull", hull_hex)
    ms = toon_material("s_sail", sail_hex, shade_hex="#c3cbd9")
    mt = toon_material("s_shiptrim", trim)
    ink = flat_material("s_shipink", "#3a2a18")
    # coque (profil extrudé)
    hull = ngon_prism(c, "hull", [(-0.5, 0.12), (0.5, 0.12), (0.38, -0.14), (-0.34, -0.14)],
                      0.26, (0, 0, -0.18), (0, 0, 0), mh)
    common.add_outline(hull, hull_hex, 0.03)
    box(c, "gunwale", (1.02, 0.28, 0.045), (0, 0, -0.05), mat=mt, bevel=0.01)
    # mâts + voiles gonflées en D (demi-sphères tranchées, bombées vers +X)
    import bmesh
    import bpy as _bpy

    for x, h, sw in ((0.12, 0.78, 0.30), (-0.30, 0.60, 0.23)):
        cyl(c, f"mast{x}", 0.022, h, (x, 0, -0.02 + h / 2), mat=ink, segments=8)
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=sw)
        bmesh.ops.scale(bm, verts=bm.verts, vec=Vector((0.85, 0.24, 1.05)))
        bmesh.ops.bisect_plane(
            bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
            plane_co=(-0.03, 0, 0), plane_no=(1, 0, 0), clear_inner=True)
        bmesh.ops.holes_fill(bm, edges=bm.edges)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mesh = _bpy.data.meshes.new(f"sail{x}")
        bm.to_mesh(mesh)
        bm.free()
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
        sail = _bpy.data.objects.new(f"sail{x}", mesh)
        c.objects.link(sail)
        sail.data.materials.append(ms)
        sail.location = (x + 0.03, 0, 0.14 + h * 0.52)
        common.add_outline(sail, sail_hex, 0.022)
    # fanion en haut du grand mât (ondule en live : /^flag/)
    ngon_prism(c, "flag", [(0, 0), (0.22, 0.030), (0.17, 0.055), (0.22, 0.082),
                           (0, 0.105)], 0.015,
               (0.12, 0, 0.76), (0, 0, 0), mt)
    # beaupré ancré à la proue
    cone(c, "bowsprit", 0.030, 0.34, (0.54, 0, -0.01), (0, 75, 0), mh, segments=8, smooth=False)


def s_st_comet(c):
    gold = "#ffd23e"
    mg = toon_material("s_stcomet", gold, glow=0.15, extra_hot="#fff6c8")
    head = sphere(c, "head", 0.26, (0.32, 0, 0), mg, seg=24, rings=16)
    common.add_outline(head, gold, 0.03)
    ring = torus(c, "ring", 0.34, 0.028, (0.32, 0, 0), (12, 62, 0),
                 toon_material("s_stcring", "#fff2b0"), seg_major=28, seg_minor=8)
    for i, (dz, ln, w, hx) in enumerate(((0.0, 1.0, 0.13, "#ffd76a"),
                                         (0.15, 0.66, 0.08, "#ffe9a0"),
                                         (-0.13, 0.60, 0.07, "#ffe9a0"))):
        ngon_prism(c, f"tail{i}", [(0, w), (0, -w), (-ln, dz * 0.35)],
                   0.05, (0.10, 0, dz), (0, 0, 0), flat_material(f"s_ctail{i}", hx))
    for (dx, dz) in ((0.52, 0.30), (0.62, -0.14)):
        sphere(c, f"spark{dx}_NoOutline", 0.035, (dx, -0.05, dz),
               flat_material("s_cspark", "#fff6c8"), seg=8, rings=6)


BUILDERS = {k.replace("s_", "sat_"): v for k, v in list(globals().items())
            if k.startswith("s_") and callable(v)}
