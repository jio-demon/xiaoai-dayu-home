# -*- coding: utf-8 -*-
"""校验 Markdown 相对链接与图片路径、页内锚点。"""
import re, os, sys, unicodedata
ROOT = r'F:/ai/xiaoai'
def slug(h):
    # GitHub slugger: lowercase, strip punctuation & symbols (incl. emoji), spaces -> '-'
    h = h.strip().lower()
    out = []
    for ch in h:
        cat = unicodedata.category(ch)
        if ch in '-_':
            out.append(ch)
        elif ch == ' ':
            out.append('-')
        elif cat[0] in ('L', 'N', 'M'):  # letters, numbers, combining marks (VS16 kept by GitHub)
            out.append(ch)
    return ''.join(out)
files = ['README.md', 'README.en.md', 'docs/tutorial.md', 'docs/tutorial.en.md']
bad = []
for f in files:
    p = os.path.join(ROOT, f)
    text = open(p, encoding='utf-8').read()
    base = os.path.dirname(p)
    heads = [slug(m) for m in re.findall(r'^#{1,6}\s+(.+)$', text, re.M)]
    # images
    for m in re.findall(r'<img src="([^"]+)"', text):
        if m.startswith('http'): continue
        if not os.path.exists(os.path.normpath(os.path.join(base, m))):
            bad.append(f'{f}: IMG {m}')
    for m in re.findall(r'!\[[^\]]*\]\(([^)]+)\)', text):
        if m.startswith('http'): continue
        if not os.path.exists(os.path.normpath(os.path.join(base, m.split('#')[0]))):
            bad.append(f'{f}: MDIMG {m}')
    # links
    for m in re.findall(r'\]\(([^)]+)\)', text):
        if m.startswith(('http', 'mailto', 'codex')): continue
        path, _, frag = m.partition('#')
        if path:
            tgt = os.path.normpath(os.path.join(base, path))
            if not os.path.exists(tgt):
                bad.append(f'{f}: LINK {m}')
        elif frag:
            if frag not in heads:
                bad.append(f'{f}: ANCHOR #{frag} (heads sample: {heads[:5]})')
print('\n'.join(bad) if bad else 'ALL LINKS OK')