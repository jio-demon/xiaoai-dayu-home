# -*- coding: utf-8 -*-
"""生成记忆宫殿示意图 memory-palace.png：六房间 + 召回/衰减公式。"""
from PIL import Image, ImageDraw, ImageFont
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'docs', 'images')
W, H = 1500, 760
NAVY = (11, 16, 32); PANEL = (17, 24, 48); TXT = (232, 238, 255); DIM = (160, 176, 214)
img = Image.new('RGB', (W, H), NAVY); d = ImageDraw.Draw(img)
def F(n, s): return ImageFont.truetype('C:/Windows/Fonts/' + n, s)
fb = lambda s: F('msyhbd.ttc', s); fr = lambda s: F('msyh.ttc', s)
d.text((40, 26), '记忆宫殿 · 她怎样记住你', font=fb(34), fill=TXT)
d.text((40, 72), '聊完一段（空闲 90 秒）→ 大模型整理成原子卡片按语义放进房间；下次对话只带最相关的几条，聊得越久越懂你，上下文却不会爆。', font=fr(19), fill=DIM)
rooms = [
    ('门厅', '日常琐事', '住在广州 · 早上喝热美式', (110, 190, 255)),
    ('书房', '兴趣与知识', '喜欢蓝发鲸鱼娘 · 在做 LX04 改造', (140, 235, 160)),
    ('客厅', '重要事件与关系', '项目通过验收 · 养了猫「汤圆」', (255, 210, 110)),
    ('厨房', '约定与承诺', '周五晚一起看电影 · 早点睡', (255, 140, 190)),
    ('卧室', '情绪与私密', '最近工作压力大，需要多关心', (200, 160, 255)),
    ('阁楼', '归档（淡忘）', '很久前提过想去海边看鲸鱼', (150, 160, 190)),
]
x0, y0, cw, ch, gap = 40, 130, 440, 150, 20
for i, (name, cat, ex, c) in enumerate(rooms):
    col, row = i % 3, i // 3
    x, y = x0 + col * (cw + gap), y0 + row * (ch + gap)
    d.rounded_rectangle((x, y, x+cw, y+ch), 16, fill=PANEL, outline=c, width=2)
    d.text((x+20, y+14), name, font=fb(28), fill=c)
    d.text((x+110, y+22), cat, font=fr(20), fill=DIM)
    d.text((x+20, y+66), '例：' + ex, font=fr(18), fill=TXT)
    note = {'门厅': '随口一提的小事', '书房': '喜好 / 事实 / 知识', '客厅': '值得纪念的事', '厨房': '说好了就要做到', '卧室': '只对她说的话', '阁楼': 'strength < 0.15 自动搬进来'}[name]
    d.text((x+20, y+104), note, font=fr(17), fill=DIM)
# 公式区
y = y0 + 2 * (ch + gap) + 10
d.rounded_rectangle((40, y, 1460, y+250), 18, fill=(13, 19, 38), outline=(48, 66, 120), width=2)
d.text((64, y+18), '召回（每次对话前）', font=fb(24), fill=(91, 140, 255))
lines = [
    'score = 0.6 × 语义相似(BGE-M3 cos) + 0.2 × 重要度 + 0.2 × 当前强度',
    'topK = 6 条，≤ 800 token；置顶卡（≤3）必带；命中即强化 strength + 0.15',
    '没有 embedding key 时退化为重要度 × 强度排序，照样能用',
]
for i, l in enumerate(lines): d.text((64, y+60+i*32), l, font=fr(19), fill=TXT)
d.text((780, y+18), '夜间巩固（每天凌晨 4 点）', font=fb(24), fill=(255, 196, 92))
lines = [
    '衰减：strength × 0.98 ^ 距上次想起的天数',
    '合并：语义 cos > 0.92 的卡片合成一条',
    '归档：strength < 0.15 → 搬进阁楼（不再召回，可手动救回）',
    '置顶卡永不衰减、永不归档 —— 重要的事请在管理页「置顶」',
]
for i, l in enumerate(lines): d.text((780, y+60+i*32), l, font=fr(19), fill=TXT)
d.text((64, y+178), '上下文只带「回忆块 + 最近 7 轮」，长期记忆不占上下文；所有参数可在管理页「模型与 API → 记忆参数」调整。', font=fr(18), fill=DIM)
img.save(os.path.join(OUT, 'memory-palace.png'), optimize=True); print('saved')