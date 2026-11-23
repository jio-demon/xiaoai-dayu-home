# v8: seam-locked + preserve_border decimation, per-triangle stretch guard with
# LOCAL revert: only triangles whose ratio deviates get their original verts restored.
import numpy as np
import fast_simplification as fs

SRC = r'F:\ai\xiaoai\tools\assets\hunyuan'
d = np.load(SRC + r'\mesh_raw.npz')
pos, uv, idx = d['pos'], d['uv'].astype(np.float64), d['idx'].reshape(-1, 3).astype(np.int32)
P = np.stack([pos[:, 0], -pos[:, 2], pos[:, 1]], axis=1).astype(np.float64)
N = len(P)

parent = np.arange(N, dtype=np.int64)
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]; x = parent[x]
    return x
e = np.concatenate([idx[:, [0, 1]], idx[:, [1, 2]], idx[:, [2, 0]]])
duv = np.linalg.norm(uv[e[:, 0]] - uv[e[:, 1]], axis=1)
cont = e[duv < 0.02]
for a, b in cont:
    ra, rb = find(int(a)), find(int(b))
    if ra != rb: parent[rb] = ra
roots = np.array([find(i) for i in range(N)])
uq, inv = np.unique(roots, return_inverse=True)
print('vertex islands:', len(uq), flush=True)

Pg = np.round(pos.astype(np.float64), 6)
uqp, invp = np.unique(Pg, axis=0, return_inverse=True)
spread = np.zeros(len(uqp))
for ax in range(2):
    mn = np.full(len(uqp), np.inf); mx = np.full(len(uqp), -np.inf)
    np.minimum.at(mn, invp, uv[:, ax]); np.maximum.at(mx, invp, uv[:, ax])
    spread = np.maximum(spread, mx - mn)
seam_v = (spread > 0.02)[invp]
print('global seam verts:', int(seam_v.sum()), flush=True)

def ratios(v, u, f):
    tv = v[f.astype(np.int64)]; tu = u[f.astype(np.int64)]
    ga = np.linalg.norm(np.cross(tv[:,1]-tv[:,0], tv[:,2]-tv[:,0]), axis=1) * 0.5
    ua = np.abs((tu[:,1,0]-tu[:,0,0])*(tu[:,2,1]-tu[:,0,1]) - (tu[:,2,0]-tu[:,0,0])*(tu[:,1,1]-tu[:,0,1])) * 0.5
    ok = ga > 1e-14
    r = np.full(len(f), np.nan)
    r[ok] = ua[ok] / ga[ok]
    return r

tri_island = inv[idx[:, 0]]
TARGET = 90000
STRETCH_TOL = 1.6
outV, outUV, outF = [], [], []
voff = 0
sizes = np.bincount(tri_island)
order = np.argsort(-sizes)
stats = {'clean': 0, 'patched': 0, 'reverted': 0, 'small': 0}
patched_tris = 0
for isl in order:
    tm = tri_island == isl
    f = idx[tm]
    vids = np.unique(f)
    rm = np.full(N, -1, dtype=np.int64); rm[vids] = np.arange(len(vids))
    lp = P[vids]; lf = rm[f].astype(np.int32); luv = uv[vids]
    lock = seam_v[vids]
    n_out = max(8, int(round(TARGET * len(f) / len(idx))))
    if len(f) <= n_out * 1.15 or len(f) < 40:
        sp, nuv, sf = lp, luv, lf
        stats['small'] += 1
    else:
        r0 = ratios(lp, luv, lf)
        med = np.nanmedian(r0)
        _, _, col = fs.simplify(lp, lf, target_count=n_out, agg=7, preserve_border=True, return_collapses=True)
        par = np.arange(len(lp), dtype=np.int64)
        def lfind(x):
            while par[x] != x:
                par[x] = par[par[x]]; x = par[x]
            return x
        for i0, i1 in col:
            r0i, r1i = lfind(int(i0)), lfind(int(i1))
            if r0i == r1i: continue
            if lock[r1i] and not lock[r0i]: par[r0i] = r1i
            else: par[r1i] = r0i
        rep = np.array([lfind(i) for i in range(len(lp))])
        used = np.unique(rep[lf.reshape(-1)])
        rm2 = np.full(len(lp), -1, dtype=np.int64); rm2[used] = np.arange(len(used))
        sf = rm2[rep[lf.reshape(-1)]].reshape(-1, 3)
        good = (sf[:, 0] != sf[:, 1]) & (sf[:, 1] != sf[:, 2]) & (sf[:, 0] != sf[:, 2])
        sf = sf[good]; orig_f = lf[good]
        sp = lp[used]; nuv = luv[used]
        r1 = ratios(sp, nuv, sf)
        valid = ~np.isnan(r1) & (med > 1e-9)
        bad = valid & ((r1 > med * STRETCH_TOL) | (r1 < med / STRETCH_TOL))
        nbad = int(bad.sum())
        if nbad == 0:
            stats['clean'] += 1
        elif nbad > len(sf) * 0.3:
            sp, nuv, sf = lp, luv, lf
            stats['reverted'] += 1
        else:
            # local patch: replace bad simplified tris with the ORIGINAL tris they came from
            # (orig vertices appended to the island's vertex pool)
            extra = np.unique(orig_f[bad])
            base = len(sp)
    # append extra original verts
            sp = np.concatenate([sp, lp[extra]])
            nuv = np.concatenate([nuv, luv[extra]])
            emap = np.full(len(lp), -1, dtype=np.int64); emap[extra] = base + np.arange(len(extra))
            sf = np.concatenate([sf[~bad], emap[orig_f[bad]]])
            stats['patched'] += 1; patched_tris += nbad
    outV.append(sp.astype(np.float32)); outUV.append(nuv.astype(np.float32))
    outF.append((sf + voff).astype(np.uint32)); voff += len(sp)
V = np.concatenate(outV); UV = np.concatenate(outUV); F = np.concatenate(outF)
print('stats:', stats, 'patched tris', patched_tris, 'verts', len(V), 'tris', len(F), flush=True)
np.savez_compressed(SRC + r'\dec_uvaware.npz', V=V, UV=UV, F=F)
print('saved', flush=True)
