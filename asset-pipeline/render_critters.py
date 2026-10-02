# Story-map wildlife — Quaternius CC0 animated models (GLB) re-shaded with the
# project's Cartoon HD toon (rigbuild/common.py: toon_hd + the 5 studio lights of
# rig.json) plus an inverted-hull ink outline, rendered frame by frame from a
# 3/4 top-side camera to transparent PNGs. convert_critters.mjs packs the frames
# into one horizontal webp strip per animal/clip, which StoryCritters plays.
#
#   blender -b -P render_critters.py -- <glb_dir> <out_dir> [key …]
#
# Keys come from critters.json (all of them when none is given). Frames are
# sampled evenly over ONE loop of the clip, so the strip loops cleanly.
import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "rigbuild"))
import common as C  # noqa: E402

SIZE = 320            # px per frame (displayed ~70-110 logical px → @2-3x)
ELEV = math.radians(32)   # camera elevation: the map is seen from above
TURN = math.radians(28)   # animal turned toward the camera (3/4 view)
OUTLINE = "#241510"
LIGHT_SCALE = 0.75
# Cartoon read (Paul, 29/09: « garder l'esprit cartoon ») — big heads, thick
# ink, flat confident colour, little gloss.
HEAD_SCALE = 2.0
EYE_SIZE = 2.2  # cartoon eye radius vs the model's own eye patch
INK_W = 0.024
SPEC = 0.14
RIM = 0.3


def boost(rgb, sat=1.45, val=1.0):
    """Quaternius palettes are muted — push saturation for the cartoon look."""
    r, g, b = rgb[:3]
    m = (r + g + b) / 3
    out = [max(0.0, min(1.0, (m + (c - m) * sat) * val)) for c in (r, g, b)]
    return (*out, 1.0)


def hex_lin(h):
    return C.hexc(h)


def retoon(obj, palette):
    """Swap every material for a ToonHD one of the same colour (or texture)."""
    for slot in obj.material_slots:
        src = slot.material
        if src is None:
            continue
        name = "crit_" + src.name
        if src.name in palette:
            col = hex_lin(palette[src.name])

            def sock(nt, col=col):
                n = nt.nodes.new("ShaderNodeRGB")
                n.outputs[0].default_value = col
                return n.outputs[0]

            slot.material = C.toon_hd(name, color_socket=sock, cache=False, spec_k=SPEC, rim_k=RIM)
            continue
        if name in bpy.data.materials:
            slot.material = bpy.data.materials[name]
            continue
        tex_img = None
        base = (0.8, 0.8, 0.8, 1.0)
        if src.use_nodes:
            bsdf = next((n for n in src.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf is not None:
                inp = bsdf.inputs["Base Color"]
                if inp.is_linked and inp.links[0].from_node.type == "TEX_IMAGE":
                    tex_img = inp.links[0].from_node.image
                else:
                    base = tuple(inp.default_value)

        if tex_img is not None:
            def sock(nt, img=tex_img):
                t = nt.nodes.new("ShaderNodeTexImage")
                t.image = img
                t.interpolation = "Closest"
                return t.outputs["Color"]
        else:
            col = boost(base)

            def sock(nt, col=col):
                n = nt.nodes.new("ShaderNodeRGB")
                n.outputs[0].default_value = col
                return n.outputs[0]

        slot.material = C.toon_hd(name, color_socket=sock, cache=False, spec_k=SPEC, rim_k=RIM)


def smooth_mesh(obj):
    """Low-poly packs split every face; weld them and shade smooth so the
    body reads rounded (cartoon), not faceted — and the ink hull stays whole."""
    import bmesh
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True


def ink_outline(obj, thickness):
    """Inverted hull: solidify with flipped normals + back-face-culled ink."""
    mat = bpy.data.materials.get("crit_ink")
    if mat is None:
        mat = bpy.data.materials.new("crit_ink")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = C.hexc(OUTLINE)
        nt.links.new(em.outputs[0], out.inputs["Surface"])
        mat.use_backface_culling = True
    obj.data.materials.append(mat)
    mod = obj.modifiers.new("ink", "SOLIDIFY")
    # thickness is in the object's local units — undo its world scale
    sc = obj.matrix_world.to_scale()
    mod.thickness = thickness / max(1e-6, (abs(sc.x) + abs(sc.y) + abs(sc.z)) / 3)
    mod.offset = 1.0
    mod.use_flip_normals = True
    mod.use_rim = False
    mod.material_offset = len(obj.data.materials) - 1


def chibi(arms, factor):
    """Cartoon proportions: a bigger head (eyes included — they're skinned to
    it). A Limit Scale constraint pins the head's local scale, so the clip's
    own keys can't undo it, and every child bone (ears, jaw…) follows."""
    if factor == 1.0:
        return
    for arm in arms:
        pb = arm.pose.bones.get("Head")
        if pb is None:
            continue
        c = pb.constraints.new("LIMIT_SCALE")
        for ax in "xyz":
            setattr(c, f"use_min_{ax}", True)
            setattr(c, f"use_max_{ax}", True)
            setattr(c, f"min_{ax}", factor)
            setattr(c, f"max_{ax}", factor)
        c.owner_space = "LOCAL"


def _flat(name, hexcol):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = C.hexc(hexcol)
        nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def cartoon_eyes(arms, meshes, eye_mats, size):
    """Replace the packs' pin-prick eyes with big cartoon ones: a white ball,
    a dark pupil pushed outward and a catch-light — parented to the Head bone
    so they follow every clip (and the chibi head scale)."""
    arm = next((a for a in arms if a.pose.bones.get("Head")), None)
    if arm is None or size <= 0:
        return
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    # The head = vertices mostly skinned to the Head bone (bone lengths live in
    # another scale than the meshes on these rigs, so measure the mesh itself).
    head_pts = []
    dg = bpy.context.evaluated_depsgraph_get()
    for m in meshes:
        g = m.vertex_groups.get("Head")
        if g is None:
            continue
        ev = m.evaluated_get(dg)
        for v in m.data.vertices:
            if any(e.group == g.index and e.weight > 0.5 for e in v.groups):
                head_pts.append(ev.matrix_world @ ev.data.vertices[v.index].co)
    if len(head_pts) < 4:
        arm.data.pose_position = "POSE"
        return
    lo = Vector(map(min, *head_pts)) if len(head_pts) > 1 else head_pts[0]
    hi = Vector(map(max, *head_pts))
    head_mid = (lo + hi) / 2
    head_len = max(hi - lo)
    head_w = head_mid
    pts = []
    for m in meshes:
        names = [s.material.name if s.material else "" for s in m.material_slots]
        idx = {i for i, n in enumerate(names)
               if (n in eye_mats or n.split(".0")[0] in eye_mats)
               or (not eye_mats and "eye" in n.lower() and "white" not in n.lower())}
        if not idx:
            continue
        dg = bpy.context.evaluated_depsgraph_get()
        ev = m.evaluated_get(dg)
        me = ev.to_mesh()
        for poly in me.polygons:
            if poly.material_index in idx:
                pts.append(ev.matrix_world @ poly.center)
        ev.to_mesh_clear()
    # only what sits on the head (a « Black » material also covers claws…)
    pts = [p for p in pts if (p - head_mid).length < head_len * 0.8]
    print(f"EYES {arm.name}: {len(pts)} pts, head_len={head_len:.3f}")
    if len(pts) < 2:
        arm.data.pose_position = "POSE"
        return
    # two eyes: split along the widest horizontal axis across the head
    spread = [max(p[i] for p in pts) - min(p[i] for p in pts) for i in range(2)]
    ax = 0 if spread[0] >= spread[1] else 1
    mid = sum(p[ax] for p in pts) / len(pts)
    groups = [[p for p in pts if p[ax] < mid], [p for p in pts if p[ax] >= mid]]
    white, black = _flat("crit_eyewhite", "#ffffff"), _flat("crit_pupil", "#1b1210")
    for g in groups:
        if not g:
            continue
        c = sum(g, Vector()) / len(g)
        r = min(max(max((p - c).length for p in g), head_len * 0.05) * size, head_len * 0.2)
        print(f"  eye r={r:.3f} n={len(g)}")
        out = (c - head_w)
        out.z = 0
        out = out.normalized() if out.length > 1e-6 else Vector((0, 0, 1))
        parts = []
        for name, rad, off, mat in (("eyeW", r, 0.45, white), ("eyeP", r * 0.62, 0.95, black),
                                    ("eyeH", r * 0.24, 1.4, white)):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=rad, segments=24, ring_count=12,
                                                 location=c + out * (r * off))
            o = bpy.context.active_object
            o.name = name
            for poly in o.data.polygons:
                poly.use_smooth = True
            o.data.materials.append(mat)
            if name == "eyeH":
                o.location += Vector((0, 0, r * 0.35))
            parts.append(o)
        ink_outline(parts[0], thickness=r * 0.35)
        for o in parts:
            bpy.ops.object.select_all(action="DESELECT")
            o.select_set(True)
            arm.select_set(True)
            bpy.context.view_layer.objects.active = arm
            arm.data.bones.active = arm.data.bones["Head"]
            bpy.ops.object.parent_set(type="BONE", keep_transform=True)
    arm.data.pose_position = "POSE"
    bpy.context.view_layer.update()


def world_bbox(objs, frames):
    dg = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    scene = bpy.context.scene
    for f in frames:
        scene.frame_set(int(round(f)))
        dg.update()
        for o in objs:
            ev = o.evaluated_get(dg)
            for c in ev.bound_box:
                w = ev.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, w))
                hi = Vector(map(max, hi, w))
    return lo, hi


def render_one(glb_dir, out_dir, key, cfg):
    stem, clip, count = cfg["model"], cfg.get("clip", ""), int(cfg.get("frames", 12))
    yaw_deg = float(cfg.get("yaw", 90))
    elev = math.radians(float(cfg.get("elev", math.degrees(ELEV))))
    C.wipe_scene()
    scene = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=os.path.join(glb_dir, stem + ".glb"))
    arms = [o for o in scene.objects if o.type == "ARMATURE"]
    for o in list(scene.objects):
        if o.type == "MESH" and (o.name in cfg.get("hide", []) or o.data.name in cfg.get("hide", [])):
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in scene.objects if o.type == "MESH"]

    # Clips to render: the main loop, plus an optional idle loop (grazing,
    # sniffing…) shown while the animal pauses. Both share ONE camera fitted to
    # the union of their poses, so the app can swap strips without a jump.
    names = sorted(bpy.data.actions, key=lambda a: len(a.name))

    def find(clip):
        for a in names:  # exact clip first ("Walk" before "Walk_Gun")
            if a.name.split("|")[-1].lower() == clip.lower():
                return a
        for a in names:
            if clip and clip.lower() in a.name.split("|")[-1].lower():
                return a
        return bpy.data.actions[0] if bpy.data.actions else None

    jobs = [(key, find(clip), count)]
    if cfg.get("idle"):
        jobs.append((key + "_idle", find(cfg["idle"]), int(cfg.get("idle_frames", 12))))

    def play(action):
        for arm in arms:
            ad = arm.animation_data or arm.animation_data_create()
            for tr in list(ad.nla_tracks):
                ad.nla_tracks.remove(tr)
            if action is not None:
                ad.action = action
                try:
                    if action.slots and ad.action_slot is None:
                        ad.action_slot = action.slots[0]
                except AttributeError:
                    pass

    def frames_of(action, n):
        f0, f1 = (action.frame_range if action is not None else (1, 2))
        span = max(1.0, f1 - f0)
        return [f0 + span * i / n for i in range(n)]

    play(jobs[0][1])
    cartoon_eyes(arms, meshes, cfg.get("eyes", []), float(cfg.get("eye", EYE_SIZE)))
    chibi(arms, float(cfg.get("head", HEAD_SCALE)))

    # Face +X (screen right after the camera turn): glTF animals face +Y in
    # Blender after import; yaw corrects per model.
    root = bpy.data.objects.new("crit_root", None)
    scene.collection.objects.link(root)
    for o in scene.objects:
        if o.parent is None and o is not root:
            o.parent = root
    root.rotation_euler = (0, 0, math.radians(yaw_deg))

    def union_bbox():
        lo = Vector((1e9, 1e9, 1e9))
        hi = Vector((-1e9, -1e9, -1e9))
        for _, action, n in jobs:
            play(action)
            a, b = world_bbox(meshes, frames_of(action, n))
            lo = Vector(map(min, lo, a))
            hi = Vector(map(max, hi, b))
        return lo, hi

    # Normalise to ~2 units so the rig's lights/toon ramp apply unchanged.
    lo, hi = union_bbox()
    k = 2.0 / max(hi - lo)
    root.scale = (k, k, k)
    lo, hi = union_bbox()
    size = hi - lo
    height = max(size.x, size.y, size.z)
    for m in meshes:
        smooth_mesh(m)
        retoon(m, cfg.get("palette", {}))
        ink_outline(m, thickness=height * INK_W)

    center = (lo + hi) / 2
    # Camera: from the viewer's side (-Y), raised by ELEV, swung by TURN so we
    # see a little of the animal's front (it walks toward screen-right).
    d = Vector((math.sin(TURN) * math.cos(elev), -math.cos(TURN) * math.cos(elev), math.sin(elev)))
    cam_data = bpy.data.cameras.new("crit_cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = height * 1.25
    cam = bpy.data.objects.new("crit_cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = center + d * (height * 6)
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    cam_data.clip_end = height * 20

    C.setup_render(SIZE, samples=32, transparent=True)
    C.studio_lights(target=center, scale=LIGHT_SCALE)

    os.makedirs(out_dir, exist_ok=True)
    for sub, action, n in jobs:
        play(action)
        for i, f in enumerate(frames_of(action, n)):
            # sub-frame precision so the loop closes exactly
            scene.frame_set(int(math.floor(f)), subframe=f - math.floor(f))
            scene.render.filepath = os.path.join(out_dir, sub, f"{i:02d}.png")
            bpy.ops.render.render(write_still=True)
        print(f"CRIT {sub} {stem}/{action.name if action else '-'} {n} frames")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    glb_dir, out_dir, keys = argv[0], argv[1], argv[2:]
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "critters.json")) as fh:
        table = {k: v for k, v in json.load(fh).items() if not k.startswith("_")}
    for key in keys or list(table):
        render_one(glb_dir, out_dir, key, table[key])


main()
