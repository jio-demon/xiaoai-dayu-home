"""Hunyuan 静态雕塑 GLB -> 轻量可动画角色资产。
减面(fast-simplification, UV 通过 collapse 重放保留) + 贴图降采样 + 头/身两段切分(颈部枢轴) + 手写 GLB。
输出: apps/web/public/assets/character.glb (节点: root > body / head, unlit 材质)
"""
import json, struct, sys
import numpy as np
from PIL import Image
import fast_simplification as fs

SRC = r'F:\ai\xiaoai\tools\assets\hunyuan'
OUT = r'F:\ai\xiaoai\apps\web\public\assets\character.glb'
TARGET_TRIS = 70000
TEX_SIZE = 2048
HEIGHT = 1.35           # 场景内角色身高（与占位形象一致）
NECK_Y = 0.50           # 原始世界坐标颈部切分高度（脸肤色 0.52~0.78，下巴 ~0.5）

# 使用 UV 岛保护减面结果（decimate_uv.py 生成）：V 已是世界坐标(x,-z,y)，脸朝 +Z
dd = np.load(SRC + r'\dec_uvaware.npz')
V0, UV0, F0 = dd['V'], dd['UV'], dd['F']
print('loaded decimated:', V0.shape, F0.shape, flush=True)

V, UV, F = V0.copy(), UV0.copy(), F0.copy()
print('final verts', len(V), 'tris', len(F), flush=True)

# 3) 缩放/居中: 身高 HEIGHT，脚底 y=0，X/Z 居中
ymin, ymax = V[:, 1].min(), V[:, 1].max()
s = HEIGHT / (ymax - ymin)
cx = (V[:, 0].min() + V[:, 0].max()) / 2
cz = (V[:, 2].min() + V[:, 2].max()) / 2
V = ((V - [cx, ymin, cz]) * s).astype(np.float32)
neck = float((NECK_Y - ymin) * s)
print('scale', s, 'neck pivot y', neck, flush=True)

# 4) 法线重算（面积加权累积）
n = np.zeros_like(V, dtype=np.float64)
tri = V[F.astype(np.int64)]
fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
for k in range(3):
    np.add.at(n, F[:, k], fn)
ln = np.linalg.norm(n, axis=1, keepdims=True)
N = (n / np.maximum(ln, 1e-12)).astype(np.float32)

# 5) 头/身切分：按三角形质心 y 与颈线比较；头部顶点平移到颈部枢轴局部坐标
cent_y = tri[:, :, 1].mean(axis=1)
head_tris = cent_y > neck
body_tris = ~head_tris
print('head tris', int(head_tris.sum()), 'body tris', int(body_tris.sum()), flush=True)

def submesh(mask, offset_y=0.0):
    f = F[mask]
    used_v = np.unique(f)
    rm = np.full(len(V), -1, dtype=np.int64)
    rm[used_v] = np.arange(len(used_v))
    v = V[used_v].copy(); v[:, 1] -= offset_y
    return v, N[used_v], UV[used_v], rm[f].astype(np.uint32)

bv, bn, buv, bf = submesh(body_tris)
hv, hn, huv, hf = submesh(head_tris, neck)

# 6) 贴图降采样
tex = Image.open(SRC + r'\tex1_4096x4096.png').convert('RGB').resize((TEX_SIZE, TEX_SIZE), Image.LANCZOS)
import io
buf = io.BytesIO(); tex.save(buf, format='PNG', optimize=True)
png = buf.getvalue()
print('texture png bytes', len(png), flush=True)

# 7) 手写 GLB
bin_chunks = []
offset = 0
accessors, bufferviews = [], []

def add_accessor(arr, comp_type, typ, minmax=False, target=None):
    global offset
    data = arr.tobytes()
    pad = (4 - len(data) % 4) % 4
    bv = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)}
    if target: bv['target'] = target
    bufferviews.append(bv)
    bin_chunks.append(data + b'\x00' * pad)
    offset += len(data) + pad
    acc = {'bufferView': len(bufferviews) - 1, 'componentType': comp_type, 'count': len(arr), 'type': typ}
    if minmax:
        acc['min'] = arr.min(axis=0).tolist()
        acc['max'] = arr.max(axis=0).tolist()
    accessors.append(acc)
    return len(accessors) - 1

prims = []
for v, nn, u, f in ((bv, bn, buv, bf), (hv, hn, huv, hf)):
    ia = add_accessor(f.reshape(-1), 5125, 'SCALAR', target=34963)
    pa = add_accessor(v, 5126, 'VEC3', minmax=True, target=34962)
    na = add_accessor(nn, 5126, 'VEC3', target=34962)
    ua = add_accessor(u, 5126, 'VEC2', target=34962)
    prims.append({'attributes': {'POSITION': pa, 'NORMAL': na, 'TEXCOORD_0': ua}, 'indices': ia, 'material': 0})

img_bv = len(bufferviews)
pad = (4 - len(png) % 4) % 4
bufferviews.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(png)})
bin_chunks.append(png + b'\x00' * pad)
offset += len(png) + pad

gltf = {
    'asset': {'version': '2.0', 'generator': 'xiaoai-hunyuan-pipeline'},
    'scene': 0,
    'scenes': [{'nodes': [0]}],
    'nodes': [
        {'name': 'root', 'children': [1, 2]},
        {'name': 'body', 'mesh': 0},
        {'name': 'head', 'mesh': 1, 'translation': [0, neck, 0]},
    ],
    'meshes': [
        {'name': 'body_mesh', 'primitives': [prims[0]]},
        {'name': 'head_mesh', 'primitives': [prims[1]]},
    ],
    'materials': [{
        'name': 'chibi_unlit',
        'doubleSided': True,
        'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 1},
        'extensions': {'KHR_materials_unlit': {}},
    }],
    'extensionsUsed': ['KHR_materials_unlit'],
    'textures': [{'sampler': 0, 'source': 0}],
    'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
    'images': [{'bufferView': img_bv, 'mimeType': 'image/png'}],
    'accessors': accessors,
    'bufferViews': bufferviews,
    'buffers': [{'byteLength': offset}],
}

jb = json.dumps(gltf, separators=(',', ':')).encode()
jb += b' ' * ((4 - len(jb) % 4) % 4)
bb = b''.join(bin_chunks)
bb += b'\x00' * ((4 - len(bb) % 4) % 4)
total = 12 + 8 + len(jb) + 8 + len(bb)
with open(OUT, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(jb), 0x4E4F534A)); f.write(jb)
    f.write(struct.pack('<II', len(bb), 0x004E4942)); f.write(bb)
print('WROTE', OUT, total, 'bytes; neck', neck)
meta = {'neck': neck, 'height': HEIGHT, 'tris': int(len(F)), 'verts': int(len(V))}
with open(SRC + r'\build_meta.json', 'w') as f: json.dump(meta, f)






