# Blender 脚本：大肥鱼 Q 版代理模型（占位/烘焙用；正式形象建议 VRM，见 docs/assets.md）
# 用法：blender --background --python build_character_proxy.py -- --out character.glb
import bpy, sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = argv[argv.index('--out') + 1] if '--out' in argv else 'character.glb'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()

def mat(name, color):
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1)
    return m

SKIN = mat('skin', (1.0, 0.92, 0.86)); HAIR = mat('hair', (0.35, 0.55, 0.95))
DRESS = mat('dress', (0.16, 0.2, 0.32)); WHITE = mat('white', (0.95, 0.96, 1.0))
TAIL = mat('tail', (0.45, 0.65, 0.95))

def sphere(name, loc, r, m, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(location=loc, radius=r)
    o = bpy.context.object; o.name = name; o.scale = scale
    o.data.materials.append(m); return o

sphere('head', (0, 0, 1.35), 0.32, SKIN)
sphere('hair_back', (0, 0.06, 1.42), 0.34, HAIR, (1, 1, 1.05))
sphere('hair_tail_l', (-0.28, 0.1, 0.95), 0.12, HAIR, (1, 1, 2.6))
sphere('hair_tail_r', (0.28, 0.1, 0.95), 0.12, HAIR, (1, 1, 2.6))
sphere('body', (0, 0, 0.8), 0.26, DRESS, (1, 0.9, 1.3))
sphere('apron', (0, -0.16, 0.78), 0.2, WHITE, (0.9, 0.5, 1.1))
sphere('leg_l', (-0.1, 0, 0.3), 0.09, SKIN, (1, 1, 2.2))
sphere('leg_r', (0.1, 0, 0.3), 0.09, SKIN, (1, 1, 2.2))
sphere('arm_l', (-0.3, 0, 0.85), 0.07, SKIN, (1, 1, 2.4))
sphere('arm_r', (0.3, 0, 0.85), 0.07, SKIN, (1, 1, 2.4))
# 鲸鱼尾巴（身后）
sphere('tail_body', (0, 0.42, 0.55), 0.2, TAIL, (1, 1.8, 0.8))
sphere('tail_fin_l', (-0.16, 0.78, 0.6), 0.12, TAIL, (1.6, 0.8, 0.4))
sphere('tail_fin_r', (0.16, 0.78, 0.6), 0.12, TAIL, (1.6, 0.8, 0.4))
# 眼睛
sphere('eye_l', (-0.11, -0.28, 1.38), 0.035, mat('eye', (0.1, 0.15, 0.3)))
sphere('eye_r', (0.11, -0.28, 1.38), 0.035, bpy.data.materials['eye'])

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB')
print('OK ->', out)
