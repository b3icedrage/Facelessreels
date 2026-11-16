"""Procedural, offline Blender scene builder for the Kids Studio.

Creates a simple original 3D cartoon animatic from an episode blueprint.
This is intentionally a first-pass low-poly production pipeline, not studio-grade
character animation. Run with Blender in background mode.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--blueprint", required=True)
    parser.add_argument("--seconds", type=int, default=20)
    parser.add_argument("--output", default="output/kids-render/silent.mp4")
    return parser.parse_args(argv)


def material(name, color, roughness=0.72):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*color, 1)
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return mat


def sphere(name, location, scale, mat, parent=None, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    if parent:
        obj.parent = parent
        obj.location = location
    return obj


def cylinder(name, location, radius, depth, mat, parent=None, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
        obj.location = location
    return obj


def make_character_root(name, location):
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=location)
    root = bpy.context.object
    root.name = name + "_ROOT"
    return root


def squirrel(origin, mats):
    root = make_character_root("Pip", origin)
    sphere("Pip body", (0, 0, 1.0), (0.48, 0.38, 0.62), mats["squirrel"], root)
    sphere("Pip head", (0, -0.02, 1.78), (0.57, 0.48, 0.52), mats["squirrel"], root)
    sphere("Pip muzzle", (0, -0.43, 1.62), (0.27, 0.16, 0.19), mats["cream"], root)
    for x in (-0.32, 0.32):
        sphere("Pip ear", (x, -0.01, 2.19), (0.17, 0.13, 0.25), mats["squirrel"], root)
        sphere("Pip inner ear", (x, -0.125, 2.2), (0.09, 0.035, 0.15), mats["pink"], root)
    for x in (-0.21, 0.21):
        sphere("Pip eye white", (x, -0.445, 1.88), (0.105, 0.055, 0.14), mats["white"], root)
        sphere("Pip pupil", (x, -0.495, 1.87), (0.052, 0.028, 0.08), mats["dark"], root)
    sphere("Pip nose", (0, -0.58, 1.68), (0.065, 0.045, 0.045), mats["pink"], root)
    sphere("Pip scarf", (0, -0.02, 1.34), (0.47, 0.39, 0.13), mats["teal"], root)
    tail = sphere("Pip fluffy tail", (0.53, 0.22, 1.05), (0.48, 0.35, 0.58), mats["squirrel"], root)
    tail.rotation_euler[1] = -0.65
    sphere("Pip tail tip", (0.73, 0.20, 1.43), (0.22, 0.22, 0.23), mats["cream"], root)
    for x in (-0.25, 0.25):
        sphere("Pip foot", (x, -0.02, 0.43), (0.22, 0.3, 0.13), mats["brown"], root)
    return root


def turtle(origin, mats):
    root = make_character_root("Tilly", origin)
    sphere("Tilly body", (0, 0, 0.83), (0.48, 0.42, 0.42), mats["mint"], root)
    sphere("Tilly shell", (0, 0.12, 1.12), (0.62, 0.52, 0.52), mats["yellow"], root)
    sphere("Tilly shell centre", (0, -0.015, 1.28), (0.35, 0.32, 0.24), mats["gold"], root)
    sphere("Tilly head", (0, -0.42, 1.25), (0.43, 0.42, 0.4), mats["mint"], root)
    for x in (-0.17, 0.17):
        sphere("Tilly eye white", (x, -0.79, 1.36), (0.085, 0.045, 0.11), mats["white"], root)
        sphere("Tilly pupil", (x, -0.83, 1.36), (0.042, 0.025, 0.06), mats["dark"], root)
    sphere("Tilly smile", (0, -0.82, 1.12), (0.12, 0.025, 0.025), mats["dark"], root)
    for x in (-0.38, 0.38):
        for y in (-0.18, 0.32):
            sphere("Tilly foot", (x, y, 0.54), (0.18, 0.22, 0.16), mats["mint"], root)
    sphere("Tilly satchel", (0.39, -0.08, 0.86), (0.2, 0.16, 0.24), mats["orange"], root)
    return root


def key(obj, frame, location=None, rotation=None, scale=None):
    if location is not None:
        obj.location = location
        obj.keyframe_insert(data_path="location", frame=frame)
    if rotation is not None:
        obj.rotation_euler = rotation
        obj.keyframe_insert(data_path="rotation_euler", frame=frame)
    if scale is not None:
        obj.scale = scale
        obj.keyframe_insert(data_path="scale", frame=frame)


def build_scene(blueprint, seconds, output):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)

    mats = {
        "grass": material("Meadow green", (0.22, 0.55, 0.28)),
        "squirrel": material("Pip golden brown", (0.55, 0.25, 0.09)),
        "cream": material("Warm cream", (0.96, 0.79, 0.57)),
        "pink": material("Soft pink", (0.95, 0.38, 0.43)),
        "teal": material("Pip teal scarf", (0.03, 0.55, 0.58)),
        "brown": material("Paw brown", (0.36, 0.16, 0.07)),
        "mint": material("Tilly mint", (0.25, 0.72, 0.52)),
        "yellow": material("Tilly yellow shell", (0.92, 0.67, 0.19)),
        "gold": material("Shell detail", (0.98, 0.79, 0.34)),
        "orange": material("Satchel orange", (0.9, 0.31, 0.08)),
        "white": material("Eye white", (1, 1, 1)),
        "dark": material("Eye dark", (0.025, 0.035, 0.045)),
        "sky": material("Sky blue", (0.35, 0.68, 0.91)),
        "leaf": material("Tree leaves", (0.12, 0.42, 0.2)),
        "trunk": material("Tree trunk", (0.34, 0.17, 0.08)),
        "balloon": material("Balloon red", (0.92, 0.08, 0.12), 0.25),
    }

    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
    ground = bpy.context.object
    ground.name = "Soft green meadow"
    ground.data.materials.append(mats["grass"])

    # Simple rounded trees frame the action.
    for x in (-5.2, 5.2):
        cylinder("Tree trunk", (x, 1.5, 1.1), 0.32, 2.2, mats["trunk"])
        sphere("Tree canopy", (x, 1.5, 2.7), (1.15, 0.95, 1.25), mats["leaf"])

    pip = squirrel((-1.35, 0, 0), mats)
    tilly = turtle((1.35, 0.2, 0), mats)
    balloon = sphere("Runaway balloon", (3.2, 0.2, 3.3), (0.42, 0.42, 0.52), mats["balloon"])
    balloon.hide_render = False

    # Balloon string.
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.012, depth=0.9, location=(3.2, 0.2, 2.75))
    string = bpy.context.object
    string.name = "Balloon string"
    string.data.materials.append(mats["white"])

    bpy.ops.object.camera_add(location=(0, -13.5, 5.4))
    camera = bpy.context.object
    camera.name = "Story camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 10.8
    camera.rotation_euler = (math.radians(70), 0, 0)
    # Aim camera at the middle of the characters.
    direction = Vector((0, 0, 1.45)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera

    bpy.ops.object.light_add(type="AREA", location=(-4, -6, 9))
    key_light = bpy.context.object
    key_light.data.energy = 1150
    key_light.data.shape = "DISK"
    key_light.data.size = 7

    scene = bpy.context.scene
    scene.world.color = (0.32, 0.42, 0.55)
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys() else "BLENDER_EEVEE"
    scene.render.resolution_x = 854
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.fps = 12
    # Blender 5 removed FFMPEG from ImageSettings.file_format. Render PNG
    # frames here; the workflow assembles them with the separately installed FFmpeg.
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.filepath = str((Path(output).parent / "frame_").resolve())
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"

    duration = int(blueprint["duration_seconds"])
    total_frames = duration * scene.render.fps
    scene.frame_start = 1
    scene.frame_end = min(seconds, duration) * scene.render.fps
    scene.render.image_settings.color_mode = "RGB"

    # Animate friendly bobbing, turns and a gentle runaway balloon drift.
    for index, item in enumerate(blueprint["scenes"]):
        start = max(1, item["start_seconds"] * scene.render.fps + 1)
        end = min(item["end_seconds"], seconds) * scene.render.fps
        if start > scene.frame_end:
            continue
        mid = (start + end) // 2
        for root, base_x, phase in ((pip, -1.35, 0), (tilly, 1.35, 1.2)):
            key(root, start, location=(base_x, 0 if root == pip else 0.2, 0), rotation=(0, 0, -0.08 if phase == 0 else 0.08))
            key(root, mid, location=(base_x, 0 if root == pip else 0.2, 0.12), rotation=(0, 0, 0.12 if phase == 0 else -0.12))
            key(root, end, location=(base_x, 0 if root == pip else 0.2, 0), rotation=(0, 0, -0.08 if phase == 0 else 0.08))
        key(balloon, start, location=(3.2, 0.2, 3.3))
        key(balloon, end, location=(2.4 - (index % 3) * 0.3, 0.2, 3.8 + (index % 2) * 0.4))
    for obj in (pip, tilly, balloon):
        if obj.animation_data and obj.animation_data.action:
            for fcurve in obj.animation_data.action.fcurves:
                for point in fcurve.keyframe_points:
                    point.interpolation = "BEZIER"

    # A simple 3D title card is part of the first seconds.
    bpy.ops.object.text_add(location=(-2.2, -0.4, 4.15), rotation=(math.radians(90), 0, 0))
    title = bpy.context.object
    title.name = "Episode title"
    title.data.body = blueprint.get("title", "A Pip and Tilly Adventure")
    title.data.size = 0.38
    title.data.extrude = 0.006
    title.data.materials.append(mats["white"])
    title.keyframe_insert(data_path="location", frame=1)
    title.location.z = 4.45
    title.keyframe_insert(data_path="location", frame=min(36, scene.frame_end))

    bpy.ops.wm.save_as_mainfile(filepath=str(Path(output).with_suffix(".blend").resolve()))
    bpy.ops.render.render(animation=True)


def main():
    args = arguments()
    blueprint = json.loads(Path(args.blueprint).read_text(encoding="utf-8"))
    if not 1 <= args.seconds <= int(blueprint["duration_seconds"]):
        raise SystemExit("--seconds must be between 1 and the blueprint duration")
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    build_scene(blueprint, args.seconds, args.output)


if __name__ == "__main__":
    main()
