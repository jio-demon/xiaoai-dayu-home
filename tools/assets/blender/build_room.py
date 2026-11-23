# Blender 3.x/4.x 脚本：程序化低模「大肥鱼的小房间」（与 web 端 room.ts 布局一致）
# 用法：blender --background --python build_room.py -- --out room.glb
import bpy, sys, math

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = argv[argv.index('--out') + 1] if '--out' in argv else 'room.glb'

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()

def mat(name, color, rough=0.9):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    return m

WOOD = mat('wood', (0.45, 0.33, 0.24)); WALL = mat('wall', (0.16, 0.22, 0.38))
BLUE = mat('blue', (0.30, 0.52, 0.85)); WHITE = mat('white', (0.85, 0.88, 0.95))
DARK = mat('dark', (0.10, 0.12, 0.20)); WARM = mat('warm', (1.0, 0.8, 0.5), 0.4)

def box(name, loc, scale, m):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object; o.name = name; o.scale = scale
    o.data.materials.append(m); return o

# 地板 8x6、两面墙
box('floor', (0, 0, -0.05), (4, 3, 0.05), WOOD)
box('wall_back', (0, -3, 1.5), (4, 0.05, 1.5), WALL)
box('wall_left', (-4, 0, 1.5), (0.05, 3, 1.5), WALL)
# 床（右后）+ 被子 + 鲸鱼玩偶
box('bed', (2.6, -1.8, 0.3), (1.2, 0.9, 0.3), WOOD)
box('blanket', (2.6, -1.7, 0.5), (1.15, 0.8, 0.12), BLUE)
bpy.ops.mesh.primitive_uv_sphere_add(location=(3.3, -2.3, 0.75), radius=0.22)
bpy.context.object.name = 'plushie'; bpy.context.object.data.materials.append(WHITE)
# 书桌 + 显示器（左后）
box('desk', (-2.6, -2.2, 0.7), (1.1, 0.5, 0.05), WOOD)
for x in (-3.5, -1.7):
    box('desk_leg', (x, -2.2, 0.35), (0.05, 0.4, 0.35), DARK)
box('monitor', (-2.6, -2.4, 1.25), (0.65, 0.04, 0.4), DARK)
box('screen', (-2.6, -2.37, 1.25), (0.6, 0.01, 0.35), BLUE)
# 窗（后墙中央，雨夜玻璃）
box('window_frame', (0.3, -2.97, 1.7), (0.9, 0.03, 0.7), WHITE)
box('window_glass', (0.3, -2.95, 1.7), (0.8, 0.01, 0.6), mat('glass', (0.08, 0.12, 0.25), 0.2))
# 地毯 / 落地灯 / 收音机 / 绿植
bpy.ops.mesh.primitive_cylinder_add(location=(0.1, 0.7, 0.02), radius=1.3, depth=0.04)
bpy.context.object.name = 'rug'; bpy.context.object.data.materials.append(BLUE)
box('lamp_pole', (-3.4, 1.8, 0.8), (0.03, 0.03, 0.8), DARK)
bpy.ops.mesh.primitive_cone_add(location=(-3.4, 1.8, 1.7), radius1=0.3, radius2=0.15, depth=0.3)
bpy.context.object.name = 'lamp'; bpy.context.object.data.materials.append(WARM)
box('radio', (2.9, 0.9, 0.55), (0.3, 0.15, 0.18), WOOD)
bpy.ops.mesh.primitive_cylinder_add(location=(3.5, 2.2, 0.25), radius=0.18, depth=0.5)
bpy.context.object.name = 'pot'; bpy.context.object.data.materials.append(WOOD)
bpy.ops.mesh.primitive_ico_sphere_add(location=(3.5, 2.2, 0.75), radius=0.35, subdivisions=1)
bpy.context.object.name = 'plant'; bpy.context.object.data.materials.append(mat('leaf', (0.25, 0.6, 0.35)))

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB')
print('OK ->', out)
