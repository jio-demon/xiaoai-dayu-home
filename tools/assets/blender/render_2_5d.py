# Blender 脚本：把 room.glb 烘焙成 2.5D 背景 + 角色精灵帧（低端降级素材，可选）
# 用法：blender --background --python render_2_5d.py -- --room room.glb --char character.glb --outdir baked
import bpy, sys, math, os

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(k, d): return argv[argv.index(k) + 1] if k in argv else d
room_path, char_path, outdir = arg('--room', 'room.glb'), arg('--char', 'character.glb'), arg('--outdir', 'baked')
os.makedirs(outdir, exist_ok=True)

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=room_path)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 32
scene.render.resolution_x = 800; scene.render.resolution_y = 480
cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = 8.6
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam)
cam.location = (0.2, 6.1, 2.9); cam.rotation_euler = (math.radians(66), 0, 0)
scene.camera = cam
light = bpy.data.lights.new('sun', 'SUN'); light.energy = 2.0
lo = bpy.data.objects.new('sun', light); scene.collection.objects.link(lo)
lo.rotation_euler = (math.radians(50), math.radians(15), 0)

scene.render.filepath = os.path.join(outdir, 'room_bg.png')
bpy.ops.render.render(write_still=True)

# 角色精灵：两帧尾巴摆动
bpy.ops.object.select_all(action='DESELECT')
for o in list(bpy.data.objects):
    if o.name != 'cam' and o.name != 'sun': o.select_set(True)
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=char_path)
scene.render.film_transparent = True
cam_data.ortho_scale = 2.2; cam.location = (0, 4, 1.0)
for frame, angle in enumerate((-12, 12)):
    for o in bpy.data.objects:
        if o.name.startswith('tail'): o.rotation_euler[2] = math.radians(angle)
    scene.render.filepath = os.path.join(outdir, f'chibi_{frame}.png')
    bpy.ops.render.render(write_still=True)
print('OK ->', outdir)
