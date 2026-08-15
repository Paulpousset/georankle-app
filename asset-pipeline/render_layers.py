# Rendu batch des couches cosmétiques depuis avatar_rig.blend (headless) :
#   blender -b avatar_rig.blend -P render_layers.py -- --ids all --out ./out
#   blender -b avatar_rig.blend -P render_layers.py -- --ids globe_lava,orbit_fire --out ./out
# Puis : node convert.mjs --dir ./out ../assets/cosmetics --quality 80 && npm run manifest
#
# CONVENTIONS DU .BLEND (généré par rigbuild/build_all.py — NE PAS éditer à la
# main, la source de vérité est le code rigbuild/) :
#  - globe/emblem : une collection par id -> <id>.png (512).
#  - emblem : passe composite (planté sur le globe, holdout + ShadowCap_<id>)
#    puis passe sprite (Root_<id> remis à l'identité, cadrage auto serré)
#    -> <id>_sprite.png (320) pour la preview live three.js.
#  - orbit : collections <id>__back / <id>__front (anneau coupé au plan y=0)
#    -> <id>_back.png et <id>_front.png. L'arc arrière EST rendu (fix 24/07).
#  - satellite : <id>.png (256) cadré serré (caméra avancée automatiquement).
#  - cosmos : générés par gen_cosmos_textures.mjs, pas de passage Blender.
#  - 'HoldoutSphere' : masque d'occlusion du globe (emblèmes).
#  - Matériaux toon émission pure (direction lumière cuite depuis rig.json) :
#    le rendu ne dépend pas des lampes ; view transform Standard obligatoire.
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))


def load_json(name):
    with open(os.path.join(HERE, name), "r", encoding="utf-8") as fh:
        return json.load(fh)


def apply_camera(rig):
    scene = bpy.context.scene
    cam = bpy.data.objects.get("RigCamera")
    if cam is None:
        cam_data = bpy.data.cameras.new("RigCamera")
        cam = bpy.data.objects.new("RigCamera", cam_data)
        scene.collection.objects.link(cam)
    cam.data.angle = math.radians(rig["camera"]["fovDeg"])
    cam.location = (0.0, -rig["camera"]["distance"], 0.0)
    cam.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    scene.camera = cam
    return cam


def setup_render(rig, size):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = rig["render"]["samples"]
    scene.cycles.transparent_max_bounces = 64
    scene.render.film_transparent = rig["render"]["filmTransparent"]
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"


def find_layer_collection(layer_coll, name):
    if layer_coll.name == name:
        return layer_coll
    for child in layer_coll.children:
        found = find_layer_collection(child, name)
        if found:
            return found
    return None


def set_collection_visible(name, visible):
    coll = bpy.data.collections.get(name)
    if coll is None:
        return False
    coll.hide_render = not visible
    for layer in bpy.context.scene.view_layers:
        lc = find_layer_collection(layer.layer_collection, name)
        if lc:
            lc.exclude = not visible
    return True


def set_holdout(enabled):
    obj = bpy.data.objects.get("HoldoutSphere")
    if obj is None:
        return
    obj.hide_render = not enabled
    obj.is_holdout = enabled


def set_shadow_visible(cid, visible):
    obj = bpy.data.objects.get(f"ShadowCap_{cid}")
    if obj is not None:
        obj.hide_render = not visible


def frame_tight(cam, margin=0.78):
    """Avance la caméra pour que les objets rendables remplissent ~margin."""
    bpy.context.view_layer.update()
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    depsgraph_seen = False
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        coll_hidden = all(
            c.hide_render for c in obj.users_collection
        ) if obj.users_collection else False
        if coll_hidden:
            continue
        depsgraph_seen = True
        for c in obj.bound_box:
            w = obj.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    if not depsgraph_seen:
        return
    radius = max(hi.x - lo.x, hi.z - lo.z) / 2
    center = (lo + hi) / 2
    dist = radius / (margin * math.tan(cam.data.angle / 2))
    cam.location = (center.x, center.y - dist, center.z)


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"rendered {path}")


def hide_all_item_collections(ids):
    for row in ids:
        for suffix in ("", "__back", "__front"):
            set_collection_visible(row["id"] + suffix, False)
    set_holdout(False)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--ids", default="all")
    parser.add_argument("--out", default=os.path.join(HERE, "out"))
    args = parser.parse_args(argv)

    rig = load_json("rig.json")
    catalog = load_json("ids.json")  # généré par : npm run ids
    wanted = None if args.ids == "all" else set(args.ids.split(","))
    os.makedirs(args.out, exist_ok=True)

    cam = apply_camera(rig)
    cam_home = cam.location.copy()
    hide_all_item_collections(catalog)

    missing = []
    for row in catalog:
        cid, cat = row["id"], row["category"]
        if not row["needsRender"] or cat == "cosmos" or (wanted and cid not in wanted):
            continue

        if cat == "orbit":
            ok = True
            for suffix, fname in (("__back", f"{cid}_back.png"),
                                  ("__front", f"{cid}_front.png")):
                if not bpy.data.collections.get(cid + suffix):
                    ok = False
                    continue
                setup_render(rig, rig["render"]["layerSize"])
                set_collection_visible(cid + suffix, True)
                render_to(os.path.join(args.out, fname))
                set_collection_visible(cid + suffix, False)
            if not ok:
                missing.append(cid)
            continue

        if not bpy.data.collections.get(cid):
            missing.append(cid)
            continue

        if cat == "satellite":
            setup_render(rig, rig["render"]["satelliteSize"])
            set_collection_visible(cid, True)
            frame_tight(cam)
            render_to(os.path.join(args.out, f"{cid}.png"))
            cam.location = cam_home
            set_collection_visible(cid, False)
            continue

        if cat == "emblem":
            # passe composite : monument planté + ombre + occlusion globe
            setup_render(rig, rig["render"]["layerSize"])
            set_collection_visible(cid, True)
            set_holdout(True)
            render_to(os.path.join(args.out, f"{cid}.png"))
            set_holdout(False)
            # passe sprite : monument droit, solo, cadrage serré
            root = bpy.data.objects.get(f"Root_{cid}")
            saved = root.matrix_world.copy() if root else None
            if root:
                root.matrix_world = Matrix.Identity(4)
            set_shadow_visible(cid, False)
            setup_render(rig, rig["render"].get("spriteSize", 320))
            frame_tight(cam, margin=0.86)
            render_to(os.path.join(args.out, f"{cid}_sprite.png"))
            cam.location = cam_home
            if root and saved:
                root.matrix_world = saved
            set_shadow_visible(cid, True)
            set_collection_visible(cid, False)
            continue

        # globe et défaut : une passe plein cadre
        setup_render(rig, rig["render"]["layerSize"])
        set_collection_visible(cid, True)
        render_to(os.path.join(args.out, f"{cid}.png"))
        set_collection_visible(cid, False)

    if missing:
        print(f"ATTENTION — collections absentes du .blend ({len(missing)}): {', '.join(missing)}")


if __name__ == "__main__":
    main()
