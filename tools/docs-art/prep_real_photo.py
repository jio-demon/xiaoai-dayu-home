# -*- coding: utf-8 -*-
from PIL import Image
import os
src = r'C:/Users/Administrator/Downloads/微信图片_20261124132119_11_63.jpg'
out = r'F:/ai/xiaoai/docs/images/real-device.jpg'
im = Image.open(src).convert('RGB')
# 缩到宽 1400，保持画质
w = 1400
im = im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)
im.save(out, quality=88, optimize=True, progressive=True)
print('saved', out, im.size, os.path.getsize(out))