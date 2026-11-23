import { skyGradient, starAlpha, cityLightAlpha, rgbCss, type SkyState } from './sky';

/** 程序化 Canvas 纹理：零外部资源，离线可用，低分辨率省显存。 */
function cv(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

export function woodFloor(): HTMLCanvasElement {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#7a5c42'; g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    const y = row * 32;
    const off = (row % 2) * 64;
    for (let x = -64; x < 256; x += 128) {
      const hue = 0.9 + Math.random() * 0.2;
      g.fillStyle = `rgb(${Math.round(122 * hue)},${Math.round(92 * hue)},${Math.round(66 * hue)})`;
      g.fillRect(x + off + 1, y + 1, 126, 30);
      g.strokeStyle = 'rgba(60,40,25,0.35)';
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(x + off + 4, y + 6 + i * 9 + Math.random() * 3);
        g.bezierCurveTo(x + off + 40, y + 4 + i * 9, x + off + 90, y + 9 + i * 9, x + off + 122, y + 6 + i * 9);
        g.stroke();
      }
    }
  }
  return c;
}

export function wall(): HTMLCanvasElement {
  const [c, g] = cv(128, 128);
  g.fillStyle = '#5d739e'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  g.fillStyle = 'rgba(30,40,70,0.12)';
  for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 128, 1);
  return c;
}

/** 显示器壁纸：参考图2里的鲸鱼画面。 */
export function whaleWallpaper(): HTMLCanvasElement {
  const [c, g] = cv(256, 160);
  const grad = g.createLinearGradient(0, 0, 0, 160);
  grad.addColorStop(0, '#1c3f7a'); grad.addColorStop(1, '#0d2247');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 160);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(180,210,255,${0.2 + Math.random() * 0.5})`;
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 100, Math.random() * 1.5 + 0.5, 0, 7); g.fill();
  }
  // 鲸鱼
  g.fillStyle = '#7fb2e5';
  g.beginPath(); g.ellipse(128, 95, 62, 34, 0, 0, 7); g.fill();
  g.beginPath(); g.moveTo(185, 90); g.quadraticCurveTo(215, 70, 228, 82); g.quadraticCurveTo(216, 95, 228, 110); g.quadraticCurveTo(212, 118, 185, 102); g.fill();
  g.fillStyle = '#cfe4f7';
  g.beginPath(); g.ellipse(120, 108, 48, 18, 0, 0, 7); g.fill();
  g.fillStyle = '#12233f';
  g.beginPath(); g.arc(92, 88, 4, 0, 7); g.fill();
  g.strokeStyle = '#12233f'; g.lineWidth = 2;
  g.beginPath(); g.arc(84, 98, 6, 0.2, 2.6); g.stroke();
  // 喷水
  g.strokeStyle = 'rgba(200,230,255,0.8)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(110, 62); g.quadraticCurveTo(104, 44, 92, 38); g.stroke();
  g.beginPath(); g.moveTo(112, 62); g.quadraticCurveTo(118, 42, 130, 36); g.stroke();
  return c;
}

export function whaleRug(): HTMLCanvasElement {
  const [c, g] = cv(256, 192);
  g.fillStyle = '#2e4a7d'; g.fillRect(0, 0, 256, 192);
  g.fillStyle = '#8fb8e8';
  g.beginPath(); g.ellipse(120, 96, 88, 58, 0, 0, 7); g.fill();
  g.beginPath(); g.moveTo(198, 88); g.quadraticCurveTo(232, 62, 246, 78); g.quadraticCurveTo(232, 96, 246, 116); g.quadraticCurveTo(228, 128, 198, 108); g.fill();
  g.fillStyle = '#dcebf9';
  g.beginPath(); g.ellipse(110, 116, 66, 30, 0, 0, 7); g.fill();
  g.fillStyle = '#1d3355';
  g.beginPath(); g.arc(70, 84, 6, 0, 7); g.fill();
  g.strokeStyle = '#1d3355'; g.lineWidth = 3;
  g.beginPath(); g.arc(60, 98, 8, 0.3, 2.7); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 4;
  g.beginPath(); g.ellipse(120, 96, 92, 62, 0, 0, 7); g.stroke();
  return c;
}

/** 窗外景色：按天空状态（时刻+天气）程序化绘制。仅在分钟/天气变化时重绘，省 GPU。 */
export function windowSky(s: SkyState): HTMLCanvasElement {
  const [c, g] = cv(256, 176);
  const W = 256, H = 176;
  const { top, bottom } = skyGradient(s);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, rgbCss(top)); grad.addColorStop(1, rgbCss(bottom));
  g.fillStyle = grad; g.fillRect(0, 0, W, H);

  // 星星（夜晚且少云）
  const sa = starAlpha(s);
  if (sa > 0.02) {
    for (let i = 0; i < 40; i++) {
      const x = (i * 61.7) % W, y = ((i * 37.3) % (H * 0.55));
      g.fillStyle = `rgba(220,232,255,${sa * (0.25 + ((i * 13) % 10) / 14)})`;
      g.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }
  }
  // 太阳 / 月亮（沿弧线移动；雨雾天被云遮住）
  const hideSun = s.dim > 0.45;
  if (s.sunAlt > -0.12 && !hideSun) {
    const sx = 30 + ((s.hour - 6) / 12) * (W - 60);
    const sy = H * 0.62 - Math.max(0, s.sunAlt) * H * 0.48;
    const sunGlow = g.createRadialGradient(sx, sy, 2, sx, sy, 26);
    const warmish = s.warm > 0.3;
    sunGlow.addColorStop(0, warmish ? 'rgba(255,190,110,0.95)' : 'rgba(255,244,200,0.95)');
    sunGlow.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = sunGlow; g.beginPath(); g.arc(sx, sy, 26, 0, 7); g.fill();
    g.fillStyle = warmish ? '#ffcf8a' : '#fff3c8';
    g.beginPath(); g.arc(sx, sy, 9, 0, 7); g.fill();
  } else if (s.night > 0.5 && s.dim < 0.5) {
    const mx = W * 0.72, my = H * 0.2;
    g.fillStyle = `rgba(232,238,250,${0.5 + s.night * 0.5})`;
    g.beginPath(); g.arc(mx, my, 8, 0, 7); g.fill();
    g.fillStyle = rgbCss(mixRgb(top, [10, 16, 40], 0.4));
    g.beginPath(); g.arc(mx - 3.5, my - 2, 7, 0, 7); g.fill(); // 月牙
  }
  // 云（多云/阴/雨；晴夜无云）
  const cloudN = s.condition === 'clear' ? (s.night > 0.6 ? 0 : 1) : s.condition === 'cloudy' ? 3 : 6;
  for (let i = 0; i < cloudN; i++) {
    const cx = ((i * 83.1) % (W + 60)) - 30;
    const cy = 14 + ((i * 29.7) % (H * 0.4));
    const cw = 34 + ((i * 17) % 26);
    const shade = s.night > 0.5 ? 0.35 : 0.85 - s.dim * 0.4;
    const base = Math.round(200 * shade + 40);
    g.fillStyle = `rgba(${base},${base + 6},${base + 16},${0.5 + s.dim * 0.35})`;
    g.beginPath();
    g.ellipse(cx, cy, cw, cw * 0.32, 0, 0, 7);
    g.ellipse(cx - cw * 0.4, cy + 4, cw * 0.55, cw * 0.24, 0, 0, 7);
    g.ellipse(cx + cw * 0.42, cy + 3, cw * 0.5, cw * 0.22, 0, 0, 7);
    g.fill();
  }
  // 远处城市剪影 + 夜灯
  const skylineY = H * 0.66;
  const cityDark = mixRgb([26, 36, 62], [10, 16, 34], s.night);
  g.fillStyle = rgbCss(mixRgb(cityDark, bottom, 0.25 + s.dim * 0.2));
  let x = 0; let bi = 0;
  while (x < W) {
    const bw = 14 + ((bi * 23) % 18);
    const bh = 18 + ((bi * 41) % 40);
    g.fillRect(x, skylineY + (H - skylineY) - bh - 14, bw, bh + 14);
    x += bw + 3; bi++;
  }
  g.fillStyle = rgbCss(mixRgb(cityDark, [8, 12, 26], 0.4));
  g.fillRect(0, H - 14, W, 14);
  const la = cityLightAlpha(s);
  if (la > 0.03) {
    for (let i = 0; i < 26; i++) {
      const lx = (i * 47.3) % W, ly = skylineY + 6 + ((i * 31.7) % (H - skylineY - 20));
      g.fillStyle = `rgba(255,214,140,${la * (0.3 + ((i * 7) % 10) / 16)})`;
      g.fillRect(lx, ly, 2, 2);
    }
  }
  // 雨痕 / 雪点 / 雾（静态部分；动态粒子由 room.ts 叠加）
  if (s.condition === 'rain' || s.condition === 'drizzle' || s.condition === 'thunder') {
    g.strokeStyle = `rgba(170,198,235,${s.condition === 'drizzle' ? 0.16 : 0.26})`;
    const n = s.condition === 'drizzle' ? 14 : 30;
    for (let i = 0; i < n; i++) {
      const rx = (i * 53.7) % W, ry = (i * 71.3) % H;
      g.lineWidth = 0.5 + ((i * 7) % 10) / 10;
      g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx - 2, ry + 8 + ((i * 11) % 14)); g.stroke();
    }
  } else if (s.condition === 'snow') {
    for (let i = 0; i < 24; i++) {
      g.fillStyle = `rgba(240,246,255,${0.3 + ((i * 9) % 10) / 18})`;
      g.beginPath(); g.arc((i * 67.9) % W, (i * 43.1) % H, 1 + (i % 2), 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(235,242,252,0.75)';
    g.fillRect(0, H - 16, W, 4); // 窗台积雪
  } else if (s.condition === 'fog') {
    const fog = g.createLinearGradient(0, H * 0.3, 0, H);
    fog.addColorStop(0, 'rgba(180,188,198,0)'); fog.addColorStop(1, 'rgba(180,188,198,0.55)');
    g.fillStyle = fog; g.fillRect(0, 0, W, H);
  }
  return c;
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function rainyGlass(): HTMLCanvasElement {
  const [c, g] = cv(128, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#0a1430'); grad.addColorStop(1, '#13224a');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  // 远处城市灯
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(255,214,140,${0.25 + Math.random() * 0.4})`;
    g.fillRect(Math.random() * 128, 70 + Math.random() * 40, 2, 2);
  }
  // 雨痕
  g.strokeStyle = 'rgba(160,190,230,0.25)';
  for (let i = 0; i < 24; i++) {
    const x = Math.random() * 128; const y = Math.random() * 128;
    g.lineWidth = Math.random() * 1.2 + 0.4;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, y + 8 + Math.random() * 14); g.stroke();
  }
  return c;
}

export function poster(): HTMLCanvasElement {
  const [c, g] = cv(128, 160);
  g.fillStyle = '#f3e9d8'; g.fillRect(0, 0, 128, 160);
  g.fillStyle = '#3f6fd8';
  g.beginPath(); g.ellipse(64, 70, 40, 26, 0, 0, 7); g.fill();
  g.beginPath(); g.moveTo(100, 66); g.quadraticCurveTo(118, 52, 124, 62); g.quadraticCurveTo(116, 72, 124, 82); g.quadraticCurveTo(114, 88, 100, 78); g.fill();
  g.fillStyle = '#12233f'; g.beginPath(); g.arc(46, 64, 3, 0, 7); g.fill();
  g.fillStyle = '#5d739e';
  g.font = 'bold 14px sans-serif'; g.textAlign = 'center';
  g.fillText('OCEAN', 64, 122);
  g.font = '10px sans-serif';
  g.fillText('大肥鱼之家', 64, 140);
  return c;
}

export function blanket(): HTMLCanvasElement {
  const [c, g] = cv(128, 128);
  g.fillStyle = '#3f6fd8'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
  for (let i = 0; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let y = 8; y < 128; y += 32) for (let x = 8; x < 128; x += 32) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
  return c;
}
