"""Bake four transparent frames from the actual root > body/head GLB.

blender --background --python tools/assets/blender/render_2_5d.py
Then resize/optimize the temporary PNGs with the workspace Python (Pillow).
No skeleton, tail node or generated substitute character is assumed.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
OUT=HERE/'source/sprites'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'apps/web/public/assets/character.glb'))
meshes=[o for o in bpy.data.objects if o.type=='MESH']
body=next((o for o in meshes if 'body' in o.name.lower()),None)
head=next((o for o in meshes if 'head' in o.name.lower()),None)
if not body or not head:raise RuntimeError('Expected actual GLB body/head nodes')
roots=[o for o in bpy.data.objects if o.parent is None]
holder=bpy.data.objects.new('Sprite normalization',None);bpy.context.scene.collection.objects.link(holder)
for o in roots:o.parent=holder
bpy.context.view_layer.update()
pts=[o.matrix_world@Vector(v.co) for o in meshes for v in o.data.vertices]
lo=Vector(tuple(min(p[i] for p in pts) for i in range(3)))
hi=Vector(tuple(max(p[i] for p in pts) for i in range(3)))
scale=1.35/(hi.z-lo.z)
holder.scale=(scale,scale,scale)
holder.location=(-(lo.x+hi.x)*.5*scale,-(lo.y+hi.y)*.5*scale,-lo.z*scale)
scene=bpy.context.scene
try:scene.render.engine='BLENDER_EEVEE'
except TypeError as e:raise RuntimeError(str(e))
scene.eevee.taa_render_samples=32
scene.render.resolution_x=512;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True
scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
world=bpy.data.worlds.new('Transparent sprite world');scene.world=world
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Strength'].default_value=0
camdata=bpy.data.cameras.new('Sprite orthographic camera');camdata.type='ORTHO';camdata.ortho_scale=1.38
cam=bpy.data.objects.new(camdata.name,camdata);scene.collection.objects.link(cam);scene.camera=cam
cam.location=(0,-5,.76);cam.rotation_euler=(Vector((0,0,.76))-cam.location).to_track_quat('-Z','Y').to_euler()
# The source material is intentionally unlit hand-painted color.
for o in meshes:
    for mat in o.data.materials:
        if not mat or not mat.node_tree:continue
        output=next((n for n in mat.node_tree.nodes if n.type=='OUTPUT_MATERIAL'),None)
        image=next((n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None)
        if output and image:
            emission=mat.node_tree.nodes.new('ShaderNodeEmission')
            mat.node_tree.links.new(image.outputs['Color'],emission.inputs['Color'])
            mat.node_tree.links.new(emission.outputs[0],output.inputs['Surface'])
bpy.context.view_layer.update()
base_head=head.matrix_local.copy();base_body=body.matrix_local.copy()
for mood in ('idle','happy'):
    for frame in (0,1):
        sign=-1 if frame==0 else 1
        from mathutils import Matrix
        head.matrix_local=base_head @ Matrix.Rotation(sign*(.07 if mood=='happy' else .035),4,'Z') @ Matrix.Rotation(.035 if mood=='happy' else -.025*sign,4,'X')
        body.matrix_local=base_body @ Matrix.Rotation(-sign*.018,4,'Z')
        bpy.context.view_layer.update()
        holder.location.z=.025 if mood=='happy' and frame else 0
        scene.render.filepath=str(OUT/f'dayu-{mood}-{frame}.png')
        bpy.ops.render.render(write_still=True)
print('DAYU_SPRITES_RENDERED',str(OUT))
