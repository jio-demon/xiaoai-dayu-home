# -*- coding: utf-8 -*-
"""生成 README 头图 banner.png：深蓝夜色 + 昼夜双景截图 + 标题。"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SHOTS = os.path.join(ROOT, 'docs', 'screenshots')
OUT = os.path.join(ROOT, 'docs', 'images'); os.makedirs(OUT, exist_ok=True)
W, H = 1600, 640
NAVY = (11, 16, 32); ACCENT = (91, 140, 255); DIM = (160, 176, 214)
img = Image.new('RGB', (W, H), NAVY)
d = ImageDraw.Draw(img)
# 背景：柔和的蓝色光晕
glow = Image.new('RGB', (W, H), NAVY)
gd = ImageDraw.Draw(glow)
gd.ellipse((-300, -200, 700, 500), fill=(24, 38, 84))
gd.ellipse((900, 300, 1900, 1000), fill=(18, 30, 66))
glow = glow.filter(ImageFilter.GaussianBlur(120))
img = Image.blend(img, glow, 0.9)
d = ImageDraw.Draw(img)
# 星点
import random
random.seed(7)
for _ in range(90):
    x, y = random.randint(0, W), random.randint(0, H)
    r = random.choice([1, 1, 1, 2]); a = random.randint(60, 160)
    d.ellipse((x-r, y-r, x+r, y+r), fill=(a, a+20, min(255, a+60)))
def font(name, size): return ImageFont.truetype('C:/Windows/Fonts/' + name, size)
# 右侧两张截图（昼 / 夜），圆角 + 阴影 + 微倾斜
def rounded(im, rad):
    mask = Image.new('L', im.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.size[0]-1, im.size[1]-1), rad, fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0)); out.paste(im, (0, 0), mask); return out
def place(path, box_w, x, y, angle, label):
    im = Image.open(path).convert('RGB')
    ratio = box_w / im.width; im = im.resize((box_w, int(im.height * ratio)), Image.LANCZOS)
    im = rounded(im, 18)
    # 边框
    ImageDraw.Draw(im).rounded_rectangle((0, 0, im.width-1, im.height-1), 18, outline=(91, 140, 255, 200), width=2)
    shadow = Image.new('RGBA', (im.width+60, im.height+60), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((30, 34, 30+im.width, 34+im.height), 18, fill=(0, 0, 0, 170))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    comp = Image.new('RGBA', shadow.size, (0, 0, 0, 0)); comp.alpha_composite(shadow); comp.alpha_composite(im, (30, 30))
    comp = comp.rotate(angle, resample=Image.BICUBIC, expand=True)
    img.paste(comp, (x, y), comp)
    # 标签（贴在卡片左上角外侧，避免被后一张卡遮住）
    f = font('msyh.ttc', 20); tw = d.textlength(label, font=f)
    lx, ly = x + 50, y + 2
    d.rounded_rectangle((lx, ly, lx + tw + 28, ly + 36), 18, fill=(20, 27, 51), outline=(64, 92, 170), width=1)
    d.text((lx + 14, ly + 6), label, font=f, fill=(210, 222, 255))
place(os.path.join(SHOTS, 'device-idle-front.png'), 470, 1040, 70, -4, '深夜 · 星空 · 待机溜达')
place(os.path.join(SHOTS, 'device-night-rain.png'), 470, 1090, 340, 3, '雨夜 · 窗外真实天气')
# 左侧文案
d.text((80, 96), '🐋', font=font('seguiemj.ttf', 96), embedded_color=True)
d.text((80, 215), '大肥鱼之家', font=font('msyhbd.ttc', 92), fill=(240, 244, 255))
d.text((84, 330), 'Dayu Home  ·  把小爱触屏音箱 LX04 改造成 AI 鲸鱼娘', font=font('msyh.ttc', 30), fill=DIM)
# 特性胶囊
tags = ['3D 房间 · 昼夜天气', '语音唤醒 · 流式对话', '记忆宫殿 · 会淡忘也会想起', '手机管理 · 热更新']
f = font('msyh.ttc', 22); x, y = 84, 400
for t in tags:
    tw = d.textlength(t, font=f)
    if x + tw + 36 > 860: x, y = 84, y + 52
    d.rounded_rectangle((x, y, x + tw + 36, y + 42), 21, fill=(20, 30, 62), outline=(64, 92, 170), width=1)
    d.text((x + 18, y + 8), t, font=f, fill=(190, 208, 255)); x += tw + 50
d.text((84, 560), 'TypeScript · React · three.js · Kotlin · DeepSeek / SiliconFlow / Volcano TTS', font=font('segoeui.ttf', 20), fill=(120, 136, 176))
# 底部渐变线
for i in range(W):
    t = i / W; c = tuple(int(NAVY[k] + (ACCENT[k] - NAVY[k]) * (0.5 + 0.5 * __import__('math').sin(t * 3.14))) for k in range(3))
    d.line((i, H-4, i, H), fill=c)
img.save(os.path.join(OUT, 'banner.png'), optimize=True)
print('saved', os.path.join(OUT, 'banner.png'), img.size)