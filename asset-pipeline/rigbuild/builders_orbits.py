# Orbites — anneaux inclinés (rig.json rings), coupés au plan y=0 en deux
# collections <id>__back (moitié arrière, sous le globe au composite) et
# <id>__front (moitié avant, par-dessus). Corrige l'ancien pipeline où l'arc
# arrière n'était jamais rendu.
import math

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

import common
from common import (
    flat_material, get_collection, ngon_prism, sphere, toon_material, torus,
    text_obj,
)

RINGS = common.RIG["rings"]
TILT = math.radians(RINGS["tiltDeg"])
R_IN, R_OUT = RINGS["innerRadius"], RINGS["outerRadius"]
R_MID = (R_IN + R_OUT) / 2
TILT_M = Matrix.Rotation(TILT, 4, "X")


def build(cid):
    back = get_collection(cid + "__back")
    front = get_collection(cid + "__front")
    tmp = get_collection(cid + "__tmp")
    fn = globals()[cid.replace("orbit_", "o_")]
    fn(tmp, back, front)
    # tout objet resté dans tmp est un anneau continu : on le coupe en deux
    for obj in list(tmp.objects):
        split_by_y(obj, back, front)
    bpy.data.collections.remove(tmp)
    return back, front


def ring_pos(angle_deg, radius, z=0.0):
    """Point sur l'anneau incliné (angle 0 = +X, 90 = -Y côté caméra)."""
    a = math.radians(angle_deg)
    p = Vector((radius * math.cos(a), -radius * math.sin(a), z))
    return TILT_M @ p


def place_on_ring(obj, angle_deg, radius, z=0.0):
    obj.location = ring_pos(angle_deg, radius, z)
    return obj


def assign(obj, back, front):
    """Range un élément discret (et ses coques enfants) selon son y monde."""
    coll = back if obj.location.y > 0 else front
    for o in [obj] + list(obj.children):
        for c0 in list(o.users_collection):
            c0.objects.unlink(o)
        coll.objects.link(o)
    return obj


def split_by_y(obj, back, front, outline_hex=None, outline_t=0.03):
    """Coupe un objet monde au plan y=0 -> deux moitiés reliées back/front."""
    mw = obj.matrix_world.copy()
    halves = []
    for clear_front, coll, suffix in ((False, front, "_f"), (True, back, "_b")):
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.transform(bm, verts=bm.verts, matrix=mw)
        # léger recouvrement des moitiés pour masquer la couture au composite
        overlap = -0.006 if clear_front else 0.006
        bmesh.ops.bisect_plane(
            bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
            plane_co=(0, overlap, 0), plane_no=(0, 1, 0),
            clear_inner=not clear_front, clear_outer=clear_front)
        bmesh.ops.holes_fill(bm, edges=bm.edges)
        if not len(bm.verts):
            bm.free()
            continue
        mesh = bpy.data.meshes.new(obj.name + suffix)
        bm.to_mesh(mesh)
        bm.free()
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
        for m in obj.data.materials:
            mesh.materials.append(m)
        half = bpy.data.objects.new(obj.name + suffix, mesh)
        coll.objects.link(half)
        halves.append(half)
    for c0 in list(obj.users_collection):
        c0.objects.unlink(obj)
    bpy.data.objects.remove(obj)
    return halves


def tube(coll, name, radius, tube_r, mat, arc=360.0, seg=96):
    t = torus(coll, name, radius, tube_r, mat=mat, seg_major=seg, seg_minor=10,
              arc_deg=arc)
    t.matrix_world = TILT_M @ t.matrix_world
    return t


def annulus(coll, name, r0, r1, mat, thick=0.012):
    """Disque annulaire plat (Saturne, arc-en-ciel) légèrement épaissi."""
    bm = bmesh.new()
    prof = [bm.verts.new((r0, 0, -thick / 2)), bm.verts.new((r1, 0, -thick / 2)),
            bm.verts.new((r1, 0, thick / 2)), bm.verts.new((r0, 0, thick / 2))]
    edges = [bm.edges.new((prof[i], prof[(i + 1) % 4])) for i in range(4)]
    bmesh.ops.spin(bm, geom=prof + edges, cent=(0, 0, 0), axis=(0, 0, 1),
                   angle=2 * math.pi, steps=96, use_merge=True, use_duplicate=False)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    obj.data.materials.append(mat)
    obj.matrix_world = TILT_M
    return obj


# ── styles ───────────────────────────────────────────────────────────────────
def o_meridian(tmp, back, front):
    bronze = "#cd7f32"
    t = tube(tmp, "ring", R_MID, 0.038, toon_material("o_bronze", bronze))
    for h in split_by_y(t, back, front):
        common.add_outline(h, bronze, 0.022)


def o_graticule(tmp, back, front):
    silver = "#c8d0d8"
    ms = toon_material("o_silver", silver, extra_hot="#ffffff")
    for i, r in enumerate((R_IN + 0.02, R_MID, R_OUT - 0.02)):
        t = tube(tmp, f"ring{i}", r, 0.016, ms)
        for h in split_by_y(t, back, front):
            common.add_outline(h, silver, 0.014)


def o_compass(tmp, back, front):
    gold = "#f0b429"
    mg = toon_material("o_cgold", gold, extra_hot="#fff2b0")
    ink = flat_material("o_cink", "#5a4210")
    t = tube(tmp, "ring", R_MID, 0.042, mg)
    for h in split_by_y(t, back, front):
        common.add_outline(h, gold, 0.024)
    # pointes cardinales (losanges) + graduations
    for k in range(4):
        ang = 90 * k
        d = ngon_prism(bpy.context.scene.collection, f"card{k}",
                       [(0.0, 0.16), (0.055, 0.0), (0.0, -0.16), (-0.055, 0.0)],
                       0.05, (0, 0, 0), (0, 0, 0), mg)
        d.location = ring_pos(ang + 90, R_MID)
        d.rotation_euler = Euler((TILT, 0, math.radians(-ang)))
        common.add_outline(d, gold, 0.02)
        assign(d, back, front)
    for k in range(8):
        if k % 2 == 0:
            continue
        ang = 45 * k
        tick = sphere(bpy.context.scene.collection, f"tick{k}", 0.055,
                      ring_pos(ang + 90, R_MID), ink, seg=10, rings=8)
        assign(tick, back, front)


def o_neon(tmp, back, front):
    core_hex, glow_hex = "#80f0ff", "#2fd8f0"
    t1 = tube(tmp, "core", R_MID, 0.026, flat_material("o_neoncore", "#d8fbff"))
    t2 = tube(tmp, "glow", R_MID, 0.075, flat_material("o_neonglow", core_hex, alpha=0.30))
    split_by_y(t1, back, front)
    split_by_y(t2, back, front)
    t3 = tube(tmp, "halo", R_MID, 0.13, flat_material("o_neonhalo", glow_hex, alpha=0.10))
    split_by_y(t3, back, front)


def _rock_mesh(name, r, seed):
    """Caillou low-poly facetté : icosphère subdiv 1 déformée (cartoon minéral)."""
    import random
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    for v in bm.verts:
        v.co *= 0.82 + rnd.random() * 0.36
    bmesh.ops.scale(bm, verts=bm.verts,
                    vec=Vector((1.0 + rnd.random() * 0.35, 0.8 + rnd.random() * 0.3,
                                0.75 + rnd.random() * 0.3)))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return mesh  # facettes gardées (pas de smooth)


def o_asteroids(tmp, back, front):
    # Ceinture DENSE et continue : la moitié arrière passe derrière le globe en
    # live (depth réel), la lecture ne tient que si la bande est bien remplie.
    import random
    rnd = random.Random(20260815)
    mats = [toon_material("o_ast0", "#a8977e"), toon_material("o_ast1", "#8d7c64"),
            toon_material("o_ast2", "#bcae96"), toon_material("o_ast3", "#6f6252")]
    n = 0
    for i in range(28):  # roches principales, pas angulaire serré + jitter
        ang = i * (360 / 28) + rnd.uniform(-4, 4)
        rad = R_MID + rnd.uniform(-0.08, 0.08)
        z = rnd.uniform(-0.035, 0.035)
        r = 0.05 + rnd.random() * 0.05
        rock = bpy.data.objects.new(f"rock{n}", _rock_mesh(f"rock{n}", r, i * 7 + 1))
        bpy.context.scene.collection.objects.link(rock)
        rock.data.materials.append(mats[i % 4])
        rock.location = ring_pos(ang, rad, z)
        rock.rotation_euler = (rnd.uniform(0, 3.1), rnd.uniform(0, 3.1), rnd.uniform(0, 3.1))
        common.add_outline(rock, "#8d7c64", 0.015 if r > 0.08 else 0.011)
        assign(rock, back, front)
        n += 1
    for i in range(22):  # débris intercalés (petits, sans contour)
        ang = i * (360 / 22) + rnd.uniform(-8, 8) + 6
        rad = R_MID + rnd.uniform(-0.14, 0.14)
        z = rnd.uniform(-0.06, 0.06)
        r = 0.018 + rnd.random() * 0.024
        deb = bpy.data.objects.new(f"rock{n}", _rock_mesh(f"rock{n}", r, i * 13 + 5))
        bpy.context.scene.collection.objects.link(deb)
        deb.data.materials.append(mats[(i + 2) % 4])
        deb.location = ring_pos(ang, rad, z)
        deb.rotation_euler = (rnd.uniform(0, 3.1), rnd.uniform(0, 3.1), 0)
        assign(deb, back, front)
        n += 1


def _crystal_mesh(name, ln, w):
    """Cristal hexagonal : colonne facettée à double pointe (vraie gemme 3D)."""
    bm = bmesh.new()
    top = bm.verts.new((0, 0, ln))
    bot = bm.verts.new((0, 0, -ln))
    hi = [bm.verts.new((w * math.cos(a), w * math.sin(a), ln * 0.38))
          for a in [k * math.pi / 3 for k in range(6)]]
    lo = [bm.verts.new((w * math.cos(a), w * math.sin(a), -ln * 0.38))
          for a in [k * math.pi / 3 for k in range(6)]]
    for j in range(6):
        k = (j + 1) % 6
        bm.faces.new((top, hi[j], hi[k]))
        bm.faces.new((hi[j], lo[j], lo[k], hi[k]))
        bm.faces.new((bot, lo[k], lo[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return mesh  # facettes nettes


def o_ice(tmp, back, front):
    # Amas de cristaux hexagonaux (1 grand + satellites) + éclats scintillants.
    import random
    rnd = random.Random(424213)
    ice_hex = "#9fd8f7"
    mi = toon_material("o_ice", ice_hex, shade_hex="#5a9cd0", light_hex="#e8f8ff",
                       glow=0.22, extra_hot="#ffffff")
    mw = toon_material("o_ice2", "#dff2ff", shade_hex="#9cc6e4", glow=0.18,
                       extra_hot="#ffffff")
    n = 0
    for i in range(16):  # amas répartis uniformément, cristaux plutôt DRESSÉS
        ang = i * (360 / 16) + rnd.uniform(-5, 5)
        rad = R_MID + rnd.uniform(-0.08, 0.08)
        for j in range(2 if i % 2 else 3):
            ln = (0.16 if j == 0 else 0.09) * (0.85 + rnd.random() * 0.4)
            w = ln * 0.34
            sh = bpy.data.objects.new(f"shard{n}", _crystal_mesh(f"shard{n}", ln, w))
            bpy.context.scene.collection.objects.link(sh)
            sh.data.materials.append(mi if (n % 3) else mw)
            sh.location = ring_pos(ang + j * 3.2 - 3, rad + (j - 1) * 0.05,
                                   rnd.uniform(-0.02, 0.06))
            sh.rotation_euler = (TILT + rnd.uniform(-0.22, 0.22),
                                 rnd.uniform(-0.28, 0.28), rnd.uniform(0, 3.1))
            common.add_outline(sh, ice_hex, 0.014 if j == 0 else 0.010)
            assign(sh, back, front)
            n += 1
    for i in range(14):  # éclats blancs entre les amas
        ang = i * (360 / 14) + rnd.uniform(-9, 9) + 11
        sp = sphere(bpy.context.scene.collection, f"spk{i}", 0.020 + rnd.random() * 0.012,
                    ring_pos(ang, R_MID + rnd.uniform(-0.13, 0.13), rnd.uniform(-0.05, 0.06)),
                    flat_material("o_icespark", "#ffffff"), seg=8, rings=6)
        assign(sp, back, front)


def o_double(tmp, back, front):
    m1 = toon_material("o_dbl1", "#8fb8ff")
    m2 = toon_material("o_dbl2", "#4a7fd8")
    t1 = tube(tmp, "ring1", R_IN + 0.06, 0.032, m1)
    for h in split_by_y(t1, back, front):
        common.add_outline(h, "#8fb8ff", 0.02)
    # second anneau : contre-inclinaison
    t2 = torus(tmp, "ring2", R_OUT - 0.03, 0.028, mat=m2, seg_major=96, seg_minor=10)
    t2.matrix_world = Matrix.Rotation(math.radians(-8), 4, "X") @ Matrix.Rotation(
        math.radians(14), 4, "Y")
    for h in split_by_y(t2, back, front):
        common.add_outline(h, "#4a7fd8", 0.018)


def o_fireflies(tmp, back, front):
    # Essaim RÉPARTI sur tout l'anneau (pas d'amas) : lecture continue en live.
    import random
    rnd = random.Random(778899)
    glow = flat_material("o_fly", "#d8ff5a")
    glow2 = flat_material("o_fly2", "#f0ffb0")
    halo = flat_material("o_flyhalo", "#d8ff5a", alpha=0.25)
    trail = flat_material("o_flytrail", "#d8ff5a", alpha=0.45)
    for i in range(36):
        ang = i * (360 / 36) + rnd.uniform(-4.5, 4.5)
        rad = R_MID + rnd.uniform(-0.13, 0.13)
        z = rnd.uniform(-0.09, 0.09)
        r = 0.034 + rnd.random() * 0.026
        p = ring_pos(ang, rad, z)
        b = sphere(bpy.context.scene.collection, f"fly{i}", r, p,
                   glow if i % 3 else glow2, seg=10, rings=8)
        assign(b, back, front)
        h = sphere(bpy.context.scene.collection, f"halo{i}", r * 2.6, p, halo,
                   seg=10, rings=8)
        assign(h, back, front)
        if i % 2:
            tr = ngon_prism(bpy.context.scene.collection, f"tr{i}",
                            [(0, 0.028), (0, -0.028), (-0.24, 0)], 0.025,
                            (0, 0, 0), (0, 0, 0), trail)
            tr.location = p
            tr.rotation_euler = Euler((TILT, 0, math.radians(-ang)))
            assign(tr, back, front)


def o_saturn(tmp, back, front):
    W = R_OUT - R_IN
    bands = [("#f2dfb2", R_IN, R_IN + 0.34 * W), ("#dcbf8a", R_IN + 0.42 * W, R_IN + 0.66 * W),
             ("#f2dfb2", R_IN + 0.74 * W, R_OUT)]
    for i, (hexc, r0, r1) in enumerate(bands):
        a = annulus(tmp, f"band{i}", r0, r1,
                    toon_material(f"o_sat{i}", hexc, bands=(0.35, 0.65)))
        for h in split_by_y(a, back, front):
            common.add_outline(h, hexc, 0.014)


def o_rainbow(tmp, back, front):
    cols = ["#e8452c", "#f0862a", "#f7c92e", "#58c15a", "#3f8fd8", "#8a5ac4"]
    w = (R_OUT - R_IN - 0.02) / 6
    for i, hexc in enumerate(cols):
        r0 = R_IN + 0.01 + i * w
        a = annulus(tmp, f"band{i}", r0 + 0.008, r0 + w - 0.008,
                    toon_material(f"o_rb{i}", hexc, bands=(0.4, 0.7)))
        split_by_y(a, back, front)


def _flame_pts(h, lean):
    """Silhouette de flamme cartoon : base ronde, ventre, pointe déportée (vent)."""
    return [(-0.062, 0.0), (-0.075, h * 0.18), (-0.052, h * 0.42),
            (-0.020 + lean * 0.5, h * 0.68), (lean, h),
            (0.030 + lean * 0.55, h * 0.62), (0.058, h * 0.34),
            (0.072, h * 0.14), (0.062, 0.0)]


def o_fire(tmp, back, front):
    # Vraies flammes cartoon léchées par le vent : langue orange + CŒUR jaune,
    # grandes/petites alternées, braises entre les flammes.
    import random
    rnd = random.Random(661144)
    core = tube(tmp, "core", R_MID, 0.040, flat_material("o_firecore", "#ffb02e"))
    split_by_y(core, back, front)
    glow = tube(tmp, "glow", R_MID, 0.085, flat_material("o_fireglow", "#ff6a2a", alpha=0.30))
    split_by_y(glow, back, front)
    mf = flat_material("o_flame1", "#ff8a2e")
    mc = flat_material("o_flame2", "#ffd23e")
    n = 0
    for i in range(22):
        ang = i * (360 / 22) + rnd.uniform(-3, 3)
        big = i % 2 == 0
        h = (0.26 if big else 0.15) * (0.9 + rnd.random() * 0.25)
        lean = 0.055 + rnd.random() * 0.03  # pointe toujours dans le sens du vent
        fl = ngon_prism(bpy.context.scene.collection, f"flame{n}",
                        _flame_pts(h, lean), 0.05, (0, 0, 0), (0, 0, 0), mf)
        fl.location = ring_pos(ang, R_MID, 0.015)
        fl.rotation_euler = Euler((TILT, 0, math.radians(-ang)))
        assign(fl, back, front)
        # cœur jaune inscrit, légèrement devant
        co = ngon_prism(bpy.context.scene.collection, f"flame{n}c",
                        [(p[0] * 0.52, p[1] * 0.58) for p in _flame_pts(h, lean)],
                        0.052, (0, 0, 0), (0, 0, 0), mc)
        co.location = ring_pos(ang, R_MID, 0.015)
        co.rotation_euler = Euler((TILT, 0, math.radians(-ang)))
        assign(co, back, front)
        n += 1
    for i in range(12):  # braises flottantes
        ang = i * (360 / 12) + rnd.uniform(-6, 6) + 8
        em = sphere(bpy.context.scene.collection, f"ember{i}",
                    0.016 + rnd.random() * 0.014,
                    ring_pos(ang, R_MID + rnd.uniform(-0.05, 0.09),
                             0.09 + rnd.random() * 0.10),
                    flat_material("o_ember", "#ffcf5a"), seg=8, rings=6)
        assign(em, back, front)


def o_st_laurel(tmp, back, front):
    gold, gold_d = "#e8c04a", "#c69a2e"
    mg = toon_material("o_lgold", gold, extra_hot="#fff2b0")
    mgd = toon_material("o_lgoldd", gold_d)
    t = tube(tmp, "ring", R_MID, 0.030, mg)
    for h in split_by_y(t, back, front):
        common.add_outline(h, gold, 0.02)
    for i in range(36):
        ang = i * 10
        side = 1 if i % 2 else -1
        leaf = sphere(bpy.context.scene.collection, f"leaf{i}", 0.085,
                      ring_pos(ang, R_MID + side * 0.055, side * 0.015),
                      mg if i % 2 else mgd, seg=10, rings=8,
                      scale=(1.0, 0.34, 0.42))
        leaf.rotation_euler = Euler((TILT, math.radians(side * 24), math.radians(-ang)))
        common.add_outline(leaf, gold, 0.014)
        assign(leaf, back, front)


def o_st_compass(tmp, back, front):
    gold = "#e0a93a"
    mg = toon_material("o_scgold", gold, extra_hot="#fff2b0")
    navy = toon_material("o_scnavy", "#2c3e6b")
    t = tube(tmp, "ring", R_MID + 0.04, 0.045, mg)
    for h in split_by_y(t, back, front):
        common.add_outline(h, gold, 0.024)
    t2 = tube(tmp, "inner", R_IN + 0.01, 0.018, mg)
    split_by_y(t2, back, front)
    for k in range(4):
        ang = 90 * k + 90
        big = ngon_prism(bpy.context.scene.collection, f"pt{k}",
                         [(0.0, 0.20), (0.07, 0.0), (0.0, -0.20), (-0.07, 0.0)],
                         0.055, (0, 0, 0), (0, 0, 0), mg if k % 2 == 0 else navy)
        big.location = ring_pos(ang, R_MID + 0.04)
        big.rotation_euler = Euler((TILT, 0, math.radians(-(ang - 90))))
        common.add_outline(big, gold, 0.02)
        assign(big, back, front)
    for k in range(4):
        ang = 90 * k + 45 + 90
        stud = sphere(bpy.context.scene.collection, f"stud{k}", 0.055,
                      ring_pos(ang, R_MID + 0.04), navy, seg=10, rings=8)
        common.add_outline(stud, "#2c3e6b", 0.014)
        assign(stud, back, front)


BUILDERS = {k.replace("o_", "orbit_"): v for k, v in list(globals().items())
            if k.startswith("o_") and callable(v)}
