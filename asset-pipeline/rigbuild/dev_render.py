# Boucle de dev : construit UN item depuis les builders et le rend en PNG.
#   blender -b -P rigbuild/dev_render.py -- --item emblem_eiffel --out /tmp/x.png
# Rend <id>.png (et <id>_back/_front pour les orbites). Sans passer par le
# .blend sauvegardé : sert à itérer vite sur la modélisation/le shading.
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402

import common  # noqa: E402


def setup_camera_and_render(size):
    rig = common.RIG
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new("RigCamera")
    cam = bpy.data.objects.new("RigCamera", cam_data)
    scene.collection.objects.link(cam)
    cam.data.angle = math.radians(rig["camera"]["fovDeg"])
    cam.location = (0.0, -rig["camera"]["distance"], 0.0)
    cam.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    scene.camera = cam
    common.setup_render(size, samples=32)
    common.studio_lights()


def frame_satellite(margin=0.78):
    """Avance la caméra pour que l'objet remplisse ~margin du cadre (sats)."""
    from mathutils import Vector

    bpy.context.view_layer.update()
    scene = bpy.context.scene
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    for obj in scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        for c in obj.bound_box:
            w = obj.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    radius = max(hi.x - lo.x, hi.z - lo.z) / 2
    center = (lo + hi) / 2
    cam = scene.camera
    half_angle = cam.data.angle / 2
    dist = radius / (margin * math.tan(half_angle))
    cam.location = (center.x, center.y - dist, center.z)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--item", required=True)
    parser.add_argument("--out", default="/tmp/preview")
    parser.add_argument("--with-globe", action="store_true",
                        help="ajoute le globe classic derrière (composition)")
    parser.add_argument("--zoom", action="store_true",
                        help="cadre serré sur la géométrie (debug détail)")
    parser.add_argument("--upright", action="store_true",
                        help="remet le Root à l'identité (passe sprite / debug)")
    args = parser.parse_args(argv)

    common.wipe_scene()

    cid = args.item
    cat = cid.split("_")[0]
    if cat == "emblem":
        import builders_emblems as B
    elif cat == "sat":
        import builders_sats as B
    elif cat == "orbit":
        import builders_orbits as B
    elif cat == "globe":
        import builders_globes as B
    else:
        raise SystemExit(f"catégorie inconnue: {cid}")
    B.build(cid)

    if args.with_globe:
        import builders_globes as BG

        BG.build("globe_classic")

    size = common.RIG["render"]["satelliteSize"] if cat == "sat" else common.RIG["render"]["layerSize"]
    setup_camera_and_render(size)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)
    base = args.out[:-4] if args.out.endswith(".png") else args.out

    if args.upright:
        from mathutils import Matrix

        root = bpy.data.objects.get(f"Root_{cid}")
        if root:
            root.matrix_world = Matrix.Identity(4)
        for obj in bpy.data.objects:
            if obj.name.startswith("ShadowCap_") or obj.name == "HoldoutSphere":
                obj.hide_render = True

    if cat == "sat" or args.zoom:
        frame_satellite()

    if cat == "orbit" and not args.with_globe:
        back = bpy.data.collections.get(cid + "__back")
        front = bpy.data.collections.get(cid + "__front")
        if back and front:
            for coll, suffix in ((back, "_back"), (front, "_front")):
                back.hide_render = suffix != "_back"
                front.hide_render = suffix != "_front"
                bpy.context.scene.render.filepath = base + suffix + ".png"
                bpy.ops.render.render(write_still=True)
            return
    if cat == "emblem" and not args.upright and not args.with_globe:
        holdout = bpy.data.objects.get("HoldoutSphere")
        if holdout:
            holdout.hide_render = False
            holdout.is_holdout = True
    bpy.context.scene.render.filepath = base + ".png"
    bpy.ops.render.render(write_still=True)


main()
