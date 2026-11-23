# 解析混元 GLB：导出统计 + 贴图，供后续减面/绑骨流水线使用
import json, struct, sys, io
from pathlib import Path
import numpy as np
from PIL import Image

SRC = Path(r"F:/ai/workspace/2026-11-18-14-23-55/output/maid_3d/77dd64bf-da6e-40ee-9742-8c5ce583dcef_0.glb")
OUT = Path(__file__).parent

buf = SRC.read_bytes()
assert buf[:4] == b"glTF"
json_len = struct.unpack_from("<I", buf, 12)[0]
gltf = json.loads(buf[20:20+json_len])
bin_off = 20 + json_len + 8
bin_chunk = buf[bin_off:]

def accessor(idx):
    a = gltf["accessors"][idx]
    bv = gltf["bufferViews"][a["bufferView"]]
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    ct = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}[a["componentType"]]
    ncomp = {"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4}[a["type"]]
    stride = bv.get("byteStride", np.dtype(ct).itemsize * ncomp)
    count = a["count"]
    arr = np.ndarray((count, ncomp), dtype=ct, buffer=bin_chunk, offset=off, strides=(stride, np.dtype(ct).itemsize))
    return arr

mesh = gltf["meshes"][0]["primitives"][0]
pos = accessor(mesh["attributes"]["POSITION"]).astype(np.float32)
uv  = accessor(mesh["attributes"]["TEXCOORD_0"]).astype(np.float32)
idx = accessor(mesh["indices"]).reshape(-1).astype(np.uint32)
print("verts", len(pos), "tris", len(idx)//3)
print("bbox min", pos.min(0), "max", pos.max(0))

# 提取贴图
for i, img in enumerate(gltf.get("images", [])):
    bv = gltf["bufferViews"][img["bufferView"]]
    off = bv.get("byteOffset", 0)
    data = bin_chunk[off:off+bv["byteLength"]]
    im = Image.open(io.BytesIO(data))
    name = f"tex{i}_{im.size[0]}x{im.size[1]}.png"
    im.save(OUT / name)
    print("image", i, im.size, im.mode, "->", name)

np.savez_compressed(OUT / "mesh_raw.npz", pos=pos, uv=uv, idx=idx)
print("saved mesh_raw.npz")
