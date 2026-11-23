# raw mesh reference GLB: check if cracks come from source texture
import json, struct
import numpy as np
from PIL import Image
import io

SRC = r'F:\ai\xiaoai\tools\assets\hunyuan'
OUT = SRC + r'\raw_reference.glb'
d = np.load(SRC + r'\mesh_raw.npz')
pos, uv, idx = d['pos'], d['uv'].astype(np.float32), d['idx'].reshape(-1, 3).astype(np.uint32)
V = np.stack([pos[:, 0], -pos[:, 2], pos[:, 1]], axis=1).astype(np.float32)
ymin = V[:, 1].min(); s = 1.35 / (V[:, 1].max() - ymin)
cx = (V[:, 0].min() + V[:, 0].max()) / 2; cz = (V[:, 2].min() + V[:, 2].max()) / 2
V = ((V - [cx, ymin, cz]) * s).astype(np.float32)
tex = Image.open(SRC + r'\tex1_4096x4096.png').convert('RGB').resize((2048, 2048), Image.LANCZOS)
buf = io.BytesIO(); tex.save(buf, format='PNG'); png = buf.getvalue()

chunks = []; offset = 0; accessors = []; bufferviews = []
def acc(arr, ct, typ, minmax=False, target=None):
    global offset
    data = arr.tobytes(); pad = (4 - len(data) % 4) % 4
    bv = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)}
    if target: bv['target'] = target
    bufferviews.append(bv); chunks.append(data + b'\x00' * pad); offset += len(data) + pad
    a = {'bufferView': len(bufferviews) - 1, 'componentType': ct, 'count': len(arr), 'type': typ}
    if minmax: a['min'] = arr.min(axis=0).tolist(); a['max'] = arr.max(axis=0).tolist()
    accessors.append(a); return len(accessors) - 1

ia = acc(idx.reshape(-1), 5125, 'SCALAR', target=34963)
pa = acc(V, 5126, 'VEC3', minmax=True, target=34962)
ua = acc(uv, 5126, 'VEC2', target=34962)
img_bv = len(bufferviews)
pad = (4 - len(png) % 4) % 4
bufferviews.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(png)})
chunks.append(png + b'\x00' * pad); offset += len(png) + pad
gltf = {
    'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
    'nodes': [{'name': 'raw', 'mesh': 0}],
    'meshes': [{'primitives': [{'attributes': {'POSITION': pa, 'TEXCOORD_0': ua}, 'indices': ia, 'material': 0}]}],
    'materials': [{'doubleSided': True, 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}, 'extensions': {'KHR_materials_unlit': {}}}],
    'extensionsUsed': ['KHR_materials_unlit'],
    'textures': [{'sampler': 0, 'source': 0}],
    'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
    'images': [{'bufferView': img_bv, 'mimeType': 'image/png'}],
    'accessors': accessors, 'bufferViews': bufferviews, 'buffers': [{'byteLength': offset}],
}
jb = json.dumps(gltf, separators=(',', ':')).encode(); jb += b' ' * ((4 - len(jb) % 4) % 4)
bb = b''.join(chunks); bb += b'\x00' * ((4 - len(bb) % 4) % 4)
total = 12 + 8 + len(jb) + 8 + len(bb)
with open(OUT, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(jb), 0x4E4F534A)); f.write(jb)
    f.write(struct.pack('<II', len(bb), 0x004E4942)); f.write(bb)
print('WROTE', OUT, total)
