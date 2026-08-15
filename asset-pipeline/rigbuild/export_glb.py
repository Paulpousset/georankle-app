# Exporte les modèles du rig en GLB pour la preview live three.js :
#   blender -b avatar_rig.blend -P rigbuild/export_glb.py [-- --only id1,id2]
# - emblem_*  : monument DROIT (Root remis à l'identité), sans ombre/holdout
# - sat_*     : objet posé (Pose_* incliné inclus)
# - orbit_*   : anneau complet (collections __back + __front, tilt 22° cuit)
# Les matériaux portent ggKind/ggHex/ggAlpha en custom props -> extras glTF ->
# material.userData côté three.js, qui remappe en MeshToon/Basic/BackSide.
# Sortie : ../assets/models3d/<id>.glb (consommé via cosmeticModels.gen.ts).
import argparse
import json
import os
import sys

import bpy
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
PIPE = os.path.dirname(HERE)
OUT = os.path.normpath(os.path.join(PIPE, "..", "assets", "models3d"))


def load_json(name):
    with open(os.path.join(PIPE, name), "r", encoding="utf-8") as fh:
        return json.load(fh)


def select_objects(objs):
    bpy.ops.object.select_all(action="DESELECT")
    count = 0
    for obj in objs:
        if obj.name.startswith("ShadowCap_") or obj.name == "HoldoutSphere":
            continue
        obj.select_set(True)
        count += 1
    return count


def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
    )


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default="")
    args = parser.parse_args(argv)
    wanted = set(args.only.split(",")) if args.only else None

    os.makedirs(OUT, exist_ok=True)
    catalog = load_json("ids.json")
    done, missing = [], []

    for row in catalog:
        cid, cat = row["id"], row["category"]
        if not row["needsRender"] or cat not in ("emblem", "satellite", "orbit"):
            continue
        if wanted and cid not in wanted:
            continue

        if cat == "orbit":
            colls = [bpy.data.collections.get(cid + "__back"),
                     bpy.data.collections.get(cid + "__front")]
            objs = [o for c in colls if c for o in c.objects]
        else:
            coll = bpy.data.collections.get(cid)
            objs = list(coll.objects) if coll else []
        if not objs:
            missing.append(cid)
            continue

        root = bpy.data.objects.get(f"Root_{cid}")
        saved = root.matrix_world.copy() if root else None
        if root:
            root.matrix_world = Matrix.Identity(4)
            bpy.context.view_layer.update()

        if select_objects(objs):
            export_glb(os.path.join(OUT, f"{cid}.glb"))
            done.append(cid)
        if root and saved:
            root.matrix_world = saved

    # ── Globes 3D (preview live) ────────────────────────────────────────────
    # - globe_land.glb : relief continents PARTAGÉ (géométrie identique pour
    #   tous les styles ; matériaux marqueurs ggKind landtex/landink, le live
    #   applique la texture du style + l'encre par style).
    # - globe_props_<style>.glb : props 3D du style (volcans, calottes...).
    # Les deux sont exportés en REPÈRE GÉO PUR : GeoRoot_<cid> remis à
    # l'identité (le live tourne de +90° Y pour matcher les UV three.js).
    def export_geo(cid, objs, out_name):
        root = bpy.data.objects.get(f"GeoRoot_{cid}")
        saved = root.matrix_world.copy() if root else None
        if root:
            root.matrix_world = Matrix.Identity(4)
            bpy.context.view_layer.update()
        if select_objects(objs):
            export_glb(os.path.join(OUT, f"{out_name}.glb"))
            done.append(out_name)
        if root and saved is not None:
            root.matrix_world = saved

    land_done = False
    for row in catalog:
        cid, cat = row["id"], row["category"]
        if not row["needsRender"] or cat != "globe":
            continue
        coll = bpy.data.collections.get(cid)
        if not coll:
            continue
        if not land_done:
            land = [o for o in coll.objects if o.name.startswith("gland_")]
            if land:
                if wanted is None or "globe_land" in wanted:
                    export_geo(cid, land, "globe_land")
                land_done = True
        props = [o for o in coll.objects if o.name.startswith("gprop_")]
        if props and (wanted is None or f"{cid}_props" in wanted):
            export_geo(cid, props, f"{cid}_props")

    sizes = sum(os.path.getsize(os.path.join(OUT, f"{c}.glb")) for c in done)
    print(f"GLB OK: {len(done)} fichiers, {sizes // 1024} KB total ; absents: {missing or 'aucun'}")


main()
