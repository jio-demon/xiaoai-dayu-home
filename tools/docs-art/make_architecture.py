# -*- coding: utf-8 -*-
"""生成 README 用的架构示意图 architecture.png（纯 Pillow，中文微软雅黑）。"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'docs', 'images'); os.makedirs(OUT, exist_ok=True)
W, H = 1500, 930
NAVY = (11, 16, 32); PANEL = (17, 24, 48); LINE = (64, 92, 170); ACCENT = (91, 140, 255)
TXT = (232, 238, 255); DIM = (160, 176, 214); OK = (86, 200, 140); WARM = (255, 196, 92); PINK = (255, 140, 190)
img = Image.new('RGB', (W, H), NAVY); d = ImageDraw.Draw(img)
def F(name, size): return ImageFont.truetype('C:/Windows/Fonts/' + name, size)
fb = lambda s: F('msyhbd.ttc', s); fr = lambda s: F('msyh.ttc', s); fm = lambda s: F('segoeui.ttf', s)
def box(x, y, w, h, title, lines, color=ACCENT, title_size=26, fill=PANEL):
    d.rounded_rectangle((x, y, x+w, y+h), 16, fill=fill, outline=color, width=2)
    d.rounded_rectangle((x, y, x+w, y+44), 16, fill=tuple(min(255, c+14) for c in fill))
    d.rectangle((x, y+30, x+w, y+44), fill=tuple(min(255, c+14) for c in fill))
    d.text((x+18, y+8), title, font=fb(title_size), fill=color)
    yy = y + 58
    for ln in lines:
        if isinstance(ln, tuple): txt, c, fnt = ln
        else: txt, c, fnt = ln, TXT, fr(19)
        d.text((x+18, yy), txt, font=fnt, fill=c); yy += 27
    return (x, y, w, h)
def arrow(p1, p2, label=None, color=DIM, dashed=False, lx=0, ly=0):
    x1, y1 = p1; x2, y2 = p2
    if dashed:
        import math
        L = math.hypot(x2-x1, y2-y1); n = int(L // 12)
        for i in range(0, n, 2):
            a = i / n; b = min(1, (i+1) / n)
            d.line((x1+(x2-x1)*a, y1+(y2-y1)*a, x1+(x2-x1)*b, y1+(y2-y1)*b), fill=color, width=2)
    else:
        d.line((x1, y1, x2, y2), fill=color, width=2)
    import math
    ang = math.atan2(y2-y1, x2-x1); s = 10
    d.polygon([(x2, y2), (x2 - s*math.cos(ang-0.5), y2 - s*math.sin(ang-0.5)), (x2 - s*math.cos(ang+0.5), y2 - s*math.sin(ang+0.5))], fill=color)
    if label:
        mx, my = (x1+x2)/2 + lx, (y1+y2)/2 + ly
        f = fr(17); tw = d.textlength(label, font=f)
        d.rounded_rectangle((mx-tw/2-8, my-14, mx+tw/2+8, my+14), 12, fill=NAVY, outline=(40, 56, 100))
        d.text((mx-tw/2, my-11), label, font=f, fill=DIM)
d.text((40, 26), '大肥鱼之家 · 系统架构', font=fb(34), fill=TXT)
d.text((40, 72), '一台音响 = Kotlin 薄壳 + Web 界面 + TS 大脑；手机浏览器通过局域网管理；AI 全部走云端，密钥只存设备。', font=fr(19), fill=DIM)
# 设备大框
dx, dy, dw, dh = 40, 120, 900, 780
d.rounded_rectangle((dx, dy, dx+dw, dy+dh), 22, outline=(48, 66, 120), width=2, fill=(13, 19, 38))
d.text((dx+22, dy+14), 'LX04 小爱触屏音箱（Android 8.1 · MT8167 · 1GB RAM · 800×480）', font=fb(22), fill=TXT)
# Kotlin 薄壳
box(dx+22, dy+60, 856, 196, 'apps/device-shell — Kotlin 薄壳', [
    ('MainActivity：Kiosk WebView（开机自启 / 可设为桌面）', TXT, fr(18)),
    ('HttpServer：NanoHTTPD/NanoWSD :8080（静态界面 + REST + /ws）   ·   Store：SQLite kv（config 走 Keystore AES/GCM）', TXT, fr(18)),
    ('UpdateManager：zip 热更新 + 30s 看门狗回滚（保留 3 包）   ·   AudioEngine：AudioRecord 16k + MediaPlayer 播报', TXT, fr(18)),
    ('KwsEngine：sherpa-onnx「大肥鱼」本地唤醒（缺 AAR / 模型自动禁用，点麦克风仍可用）', TXT, fr(18)),
], color=WARM)
# Web
box(dx+22, dy+280, 420, 230, 'apps/web — React + three.js', [
    ('#/device 设备页', ACCENT, fb(19)),
    '3D 房间 / GLB 鲸鱼娘 / 昼夜天空', '城市天气窗景 / 语音环 / 字幕 / ⚙ 设置',
    ('#/admin 管理页（手机扫码）', ACCENT, fb(19)),
    'API · 角色 · 记忆宫殿 · 历史 · 热更新',
], color=ACCENT)
# brain
box(dx+462, dy+280, 416, 230, 'packages/brain — TS 编排器', [
    '召回记忆 → 流式 LLM → 逐句 TTS → 打断',
    '会话结束（空闲 90s）→ 提取 ≤12 张卡片',
    ('记忆宫殿：六房间 · 衰减 / 合并 / 归档', PINK, fb(19)),
    'providers：DeepSeek / SiliconFlow /', 'Volcano（豆包 TTS）/ DashScope 备选',
], color=PINK)
# protocol
box(dx+22, dy+540, 856, 92, 'packages/protocol — 三方唯一类型契约', [
    ('BridgeApi · REST · WsMessage · AppConfig · MemoryCard（改这里三端同步）', DIM, fr(18)),
], color=OK, title_size=22)
# PC mock
box(dx+22, dy+644, 856, 116, 'PC 模拟（npm run dev，无需实机）', [
    ('MockBridge：localStorage + getUserMedia + Audio · BroadcastChannel 跨标签同步', DIM, fr(18)),
    ('开发服务器 /cloud-proxy 转发云端 API，解决浏览器 CORS（Failed to fetch）', DIM, fr(18)),
], color=DIM, title_size=22)
# 箭头：薄壳 ↔ web
arrow((dx+230, dy+256), (dx+230, dy+280), 'JS Bridge', color=WARM, lx=-70)
arrow((dx+300, dy+280), (dx+300, dy+256), None, color=WARM)
arrow((dx+442, dy+395), (dx+462, dy+395), None, color=ACCENT)
arrow((dx+670, dy+256), (dx+670, dy+280), 'REST /ws', color=WARM, lx=70)
# 右侧：手机 + 云
box(980, 120, 480, 150, '手机 / 电脑浏览器', [
    'http://<音响IP>:8080/#/admin',
    '登录（sha256 密码换 token）→ 改配置 / 记忆',
    '/ws 实时推送；密钥永远掩码显示',
], color=OK)
arrow((980, 250), (dx+dw, dy+190), None, color=OK)
d.text((dx+dw+4, dy+96), '局域网', font=fr(15), fill=OK)
box(980, 310, 480, 330, '云端 AI（密钥只存设备本地）', [
    ('DeepSeek', ACCENT, fb(20)), 'deepseek-chat 流式对话 / 记忆提取',
    ('SiliconFlow 硅基流动', ACCENT, fb(20)), 'SenseVoiceSmall ASR · CosyVoice2 TTS', 'BGE-M3 向量（记忆语义召回）',
    ('Volcano 火山引擎 · 豆包 TTS 2.0', ACCENT, fb(20)), '活泼音色（爽快思思 / 撒娇学妹…）',
    ('腾讯天气 wis.qq.com / Open-Meteo', DIM, fr(18)),
], color=ACCENT)
arrow((dx+dw, dy+400), (980, 420), 'HTTPS', color=ACCENT, lx=6, ly=-26)
box(980, 700, 480, 188, '场景联动', [
    '本机时间 → 日出日落 / 星空 / 城市灯火',
    '城市天气 → 窗外雨 / 雪 / 晴 / 雷阵雨',
    'FPS EMA < 20 持续 4s → 自动降级 2.5D',
    'VRM > character.glb > 几何占位形象',
], color=WARM)
img.save(os.path.join(OUT, 'architecture.png'), optimize=True)
print('saved', img.size)