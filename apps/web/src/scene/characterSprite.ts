/** 2.5D 模式 / UI 头像用的 Q 版大肥鱼立绘（Canvas 绘制，两帧尾巴摆动）。 */
export function drawChibi(g: CanvasRenderingContext2D, w: number, h: number, frame: 0 | 1, happy = false): void {
  const u = w / 256; // 设计坐标 256x320
  const v = h / 320;
  g.clearRect(0, 0, w, h);
  g.save();
  g.scale(u, v);
  const sway = frame === 0 ? -1 : 1;

  // 鲸鱼尾巴（身后右下）
  g.save();
  g.translate(196, 250);
  g.rotate(sway * 0.18);
  g.fillStyle = '#5b8fd6';
  g.beginPath(); g.moveTo(-10, 10); g.quadraticCurveTo(30, -6, 44, -34); g.quadraticCurveTo(40, -4, 58, 6); g.quadraticCurveTo(30, 18, -10, 26); g.fill();
  g.fillStyle = '#7fb2e5';
  g.beginPath(); g.ellipse(-14, 16, 22, 14, 0.3, 0, 7); g.fill();
  g.restore();

  // 后发
  g.fillStyle = '#3f6fd8';
  g.beginPath(); g.ellipse(128, 130, 74, 86, 0, 0, 7); g.fill();
  g.beginPath(); g.moveTo(60, 140); g.quadraticCurveTo(48, 220, 70, 252); g.lineTo(96, 240); g.quadraticCurveTo(78, 190, 84, 140); g.fill();
  g.beginPath(); g.moveTo(196, 140); g.quadraticCurveTo(208, 220, 186, 252); g.lineTo(160, 240); g.quadraticCurveTo(178, 190, 172, 140); g.fill();

  // 身体：女仆裙
  g.fillStyle = '#2b2f3a';
  g.beginPath(); g.moveTo(96, 178); g.quadraticCurveTo(128, 168, 160, 178); g.lineTo(182, 278); g.quadraticCurveTo(128, 292, 74, 278); g.fill();
  // 围裙
  g.fillStyle = '#f4f6fb';
  g.beginPath(); g.moveTo(104, 190); g.quadraticCurveTo(128, 184, 152, 190); g.lineTo(164, 272); g.quadraticCurveTo(128, 282, 92, 272); g.fill();
  g.strokeStyle = '#d8dce8'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(104, 206); g.quadraticCurveTo(128, 214, 152, 206); g.stroke();
  // 领结
  g.fillStyle = '#5b8fd6';
  g.beginPath(); g.moveTo(128, 182); g.lineTo(112, 174); g.lineTo(112, 190); g.fill();
  g.beginPath(); g.moveTo(128, 182); g.lineTo(144, 174); g.lineTo(144, 190); g.fill();
  g.beginPath(); g.arc(128, 182, 5, 0, 7); g.fill();
  // 手臂
  g.fillStyle = '#ffe3d3';
  g.beginPath(); g.ellipse(84, 214 + sway * 3, 12, 26, 0.25, 0, 7); g.fill();
  g.beginPath(); g.ellipse(172, 214 - sway * 3, 12, 26, -0.25, 0, 7); g.fill();
  g.fillStyle = '#2b2f3a';
  g.beginPath(); g.ellipse(88, 196, 14, 14, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(168, 196, 14, 14, 0, 0, 7); g.fill();

  // 头
  g.fillStyle = '#ffe3d3';
  g.beginPath(); g.ellipse(128, 112, 58, 54, 0, 0, 7); g.fill();
  // 刘海
  g.fillStyle = '#4a7fd4';
  g.beginPath();
  g.moveTo(70, 108);
  g.quadraticCurveTo(72, 52, 128, 50);
  g.quadraticCurveTo(184, 52, 186, 108);
  g.quadraticCurveTo(170, 84, 150, 92);
  g.quadraticCurveTo(140, 74, 122, 90);
  g.quadraticCurveTo(106, 76, 96, 94);
  g.quadraticCurveTo(82, 86, 70, 108);
  g.fill();
  // 呆毛
  g.strokeStyle = '#4a7fd4'; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(128, 52); g.quadraticCurveTo(136 + sway * 4, 30, 150 + sway * 6, 34); g.stroke();
  // 女仆发箍
  g.fillStyle = '#f4f6fb';
  g.beginPath(); g.ellipse(128, 62, 52, 12, 0, Math.PI, 0); g.fill();
  for (let i = -2; i <= 2; i++) { g.beginPath(); g.arc(128 + i * 20, 56, 8, 0, 7); g.fill(); }

  // 眼睛
  if (happy) {
    g.strokeStyle = '#274a86'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.arc(104, 116, 10, Math.PI + 0.3, -0.3); g.stroke();
    g.beginPath(); g.arc(152, 116, 10, Math.PI + 0.3, -0.3); g.stroke();
  } else {
    g.fillStyle = '#274a86';
    g.beginPath(); g.ellipse(104, 116, 9, 12, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(152, 116, 9, 12, 0, 0, 7); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(107, 111, 3.5, 0, 7); g.fill();
    g.beginPath(); g.arc(155, 111, 3.5, 0, 7); g.fill();
  }
  // 腮红
  g.fillStyle = 'rgba(255,150,150,0.5)';
  g.beginPath(); g.ellipse(88, 132, 10, 6, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(168, 132, 10, 6, 0, 0, 7); g.fill();
  // 嘴
  g.strokeStyle = '#c96a6a'; g.lineWidth = 3;
  g.beginPath(); g.arc(128, 134, happy ? 9 : 5, 0.25, Math.PI - 0.25); g.stroke();

  // 小鲸鳍发饰
  g.fillStyle = '#7fb2e5';
  g.beginPath(); g.moveTo(176, 70); g.quadraticCurveTo(196, 54, 202, 66); g.quadraticCurveTo(192, 74, 178, 80); g.fill();
  g.restore();
}

export function chibiCanvas(frame: 0 | 1, happy = false, w = 256, h = 320): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  drawChibi(c.getContext('2d')!, w, h, frame, happy);
  return c;
}
