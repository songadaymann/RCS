#!/usr/bin/env python3
"""
Blender script to bake Mixamo animations onto the RCS model.

Usage (from command line):
  blender --background --python bake-animations.py

This script will:
1. Load the separated RCS model (with glasses)
2. Import each Mixamo animation
3. Bake the animation onto the RCS skeleton
4. Export as separate GLB files
"""

import bpy
import os
import sys

# Configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "assets", "RCS-walking-seperated.glb")
ANIM_DIR = os.path.join(BASE_DIR, "assets", "animations", "glb")
OUTPUT_DIR = os.path.join(BASE_DIR, "assets", "animations", "baked")

# Animations to bake (name, source file)
ANIMATIONS = [
    ("walk", "Walking.glb"),
    ("run", "Running.glb"),
    ("punch", "punch1.glb"),
    ("kick", "kick1.glb"),
    ("hit", "Head Hit.glb"),
    ("die", "dying.glb"),
]

def clear_scene():
    """Remove all objects from the scene"""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    
    # Clear orphan data
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.armatures:
        if block.users == 0:
            bpy.data.armatures.remove(block)

def import_glb(filepath):
    """Import a GLB file and return the imported objects"""
    bpy.ops.import_scene.gltf(filepath=filepath)
    return bpy.context.selected_objects

def get_armature(objects):
    """Find the armature in a list of objects"""
    for obj in objects:
        if obj.type == 'ARMATURE':
            return obj
    return None

def get_meshes(objects):
    """Find all mesh objects"""
    return [obj for obj in objects if obj.type == 'MESH']

def retarget_animation(source_armature, target_armature):
    """
    Copy animation from source to target armature.
    Assumes both have the same bone names (Mixamo standard).
    """
    if not source_armature.animation_data or not source_armature.animation_data.action:
        print(f"  No animation found in source")
        return False
    
    source_action = source_armature.animation_data.action
    
    # Create new action for target
    new_action = source_action.copy()
    new_action.name = f"baked_{source_action.name}"
    
    # Assign to target
    if not target_armature.animation_data:
        target_armature.animation_data_create()
    target_armature.animation_data.action = new_action
    
    return True

def bake_animation(armature, frame_start, frame_end):
    """Bake the animation on the armature"""
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    
    # Select all pose bones
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    
    # Bake
    bpy.ops.nla.bake(
        frame_start=int(frame_start),
        frame_end=int(frame_end),
        only_selected=True,
        visual_keying=True,
        clear_constraints=False,
        use_current_action=True,
        bake_types={'POSE'}
    )
    
    bpy.ops.object.mode_set(mode='OBJECT')

def export_glb(filepath):
    """Export the scene as GLB"""
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        export_animations=True,
        export_skins=True,
    )

def main():
    print("\n" + "="*50)
    print("RCS Animation Baker")
    print("="*50)
    
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    for anim_name, anim_file in ANIMATIONS:
        print(f"\nProcessing: {anim_name} ({anim_file})")
        
        # Clear scene
        clear_scene()
        
        # Import RCS model
        print(f"  Loading RCS model...")
        rcs_objects = import_glb(MODEL_PATH)
        rcs_armature = get_armature(rcs_objects)
        rcs_meshes = get_meshes(rcs_objects)
        
        if not rcs_armature:
            print(f"  ERROR: No armature found in RCS model!")
            continue
        
        print(f"  Found armature: {rcs_armature.name}")
        print(f"  Found {len(rcs_meshes)} meshes")
        
        # Import animation
        anim_path = os.path.join(ANIM_DIR, anim_file)
        if not os.path.exists(anim_path):
            print(f"  ERROR: Animation file not found: {anim_path}")
            continue
        
        print(f"  Loading animation...")
        anim_objects = import_glb(anim_path)
        anim_armature = get_armature(anim_objects)
        
        if not anim_armature:
            print(f"  ERROR: No armature found in animation file!")
            continue
        
        # Get animation frame range
        if anim_armature.animation_data and anim_armature.animation_data.action:
            action = anim_armature.animation_data.action
            frame_start, frame_end = action.frame_range
            print(f"  Animation frames: {frame_start} to {frame_end}")
        else:
            print(f"  ERROR: No animation data found!")
            continue
        
        # Retarget animation
        print(f"  Retargeting animation...")
        if not retarget_animation(anim_armature, rcs_armature):
            continue
        
        # Delete the animation armature and its meshes (we only need RCS)
        for obj in anim_objects:
            bpy.data.objects.remove(obj, do_unlink=True)
        
        # Bake animation
        print(f"  Baking animation...")
        bake_animation(rcs_armature, frame_start, frame_end)
        
        # Export
        output_path = os.path.join(OUTPUT_DIR, f"RCS-{anim_name}.glb")
        print(f"  Exporting to: {output_path}")
        export_glb(output_path)
        
        print(f"  ✓ Done!")
    
    print("\n" + "="*50)
    print("Animation baking complete!")
    print(f"Output files are in: {OUTPUT_DIR}")
    print("="*50 + "\n")

if __name__ == "__main__":
    main()


