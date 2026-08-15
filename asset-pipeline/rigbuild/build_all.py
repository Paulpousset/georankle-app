# Reconstruit TOUT le rig cosmétique dans une scène neuve et sauvegarde
# avatar_rig.blend. Source de vérité : le code (rigbuild/), pas le .blend.
#   blender -b -P rigbuild/build_all.py            # tout
#   blender -b -P rigbuild/build_all.py -- --only emblem_eiffel,orbit_fire
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402

import common  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default="")
    parser.add_argument("--out", default=os.path.join(common.PIPE, "avatar_rig.blend"))
    args = parser.parse_args(argv)
    wanted = set(args.only.split(",")) if args.only else None

    with open(os.path.join(common.PIPE, "ids.json"), "r", encoding="utf-8") as fh:
        catalog = json.load(fh)

    common.wipe_scene()
    common.ensure_holdout()

    import builders_emblems
    import builders_globes
    import builders_orbits
    import builders_sats

    builders = {
        "emblem": builders_emblems,
        "sat": builders_sats,
        "orbit": builders_orbits,
        "globe": builders_globes,
    }

    built, skipped = [], []
    for row in catalog:
        cid = row["id"]
        if not row["needsRender"] or row["category"] == "cosmos":
            continue
        if wanted and cid not in wanted:
            continue
        cat = cid.split("_")[0]
        mod = builders.get(cat)
        if mod is None:
            skipped.append(cid)
            continue
        mod.build(cid)
        built.append(cid)

    print(f"BUILD OK: {len(built)} items ; skipped: {skipped or 'aucun'}")
    bpy.ops.wm.save_as_mainfile(filepath=args.out, compress=True)
    print(f"saved {args.out}")


main()
