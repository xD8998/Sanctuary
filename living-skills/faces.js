// simple drifting faces with emotion colors
let faces = [], W = 0, H = 0, DPR = 1;
const EMO = [
  { name:'happy', color:'#ffd84a' },
  { name:'angry', color:'#ff4a4a' },
  { name:'sad', color:'#6bb7ff' },
  { name:'mad', color:'#c12d2d' },
  { name:'scared', color:'#b86bff' },
  { name:'distracted', color:'#9aa0a6' },
];

export function initFaces({ width, height, dpr }) {
  W = width; H = height; DPR = Math.max(1, dpr || 1);
  const count = Math.max(18, Math.floor(Math.min(W, H) / 40));
  faces = [];
  for (let i = 0; i < count; i++) {
    const e = EMO[i % EMO.length];
    faces.push({
      x: Math.random() * (W / DPR),
      y: Math.random() * (H / DPR),
      vx: (Math.random() * 0.6 - 0.3) * (1 + Math.random()),
      vy: (Math.random() * 0.6 - 0.3) * (1 + Math.random()),
      r: 10 + Math.random() * 18,
      emo: e.name,
      color: e.color,
      wob: Math.random() * 1000
    });
  }
}

export function updateAndDrawFaces(ctx, { width, height, dpr }, dtMs = 16) {
  if (!faces.length) return;
  const dt = Math.min(0.06, dtMs / 1000);
  const wCss = width / (dpr || DPR), hCss = height / (dpr || DPR);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (const f of faces) {
    f.x += f.vx * 40 * dt;
    f.y += f.vy * 40 * dt;
    f.wob += dt * 2;
    // bounce
    if (f.x < 0 || f.x > wCss) f.vx *= -1;
    if (f.y < 0 || f.y > hCss) f.vy *= -1;
    // draw
    const x = Math.max(0, Math.min(wCss, f.x)) * dpr;
    const y = Math.max(0, Math.min(hCss, f.y)) * dpr;
    const r = f.r * dpr;
    // face circle
    ctx.beginPath();
    ctx.fillStyle = f.color;
    ctx.globalAlpha = 0.22;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.95;
    // eyes
    const eyeR = Math.max(2, r * 0.14), ex = r * 0.38, ey = -r * 0.18;
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(x - ex, y + ey, eyeR, 0, Math.PI * 2);
    ctx.arc(x + ex, y + ey, eyeR, 0, Math.PI * 2);
    ctx.fill();
    // mouth by emotion
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    const mx = x, my = y + r * 0.28, mw = r * 0.6;
    switch (f.emo) {
      case 'happy': ctx.arc(mx, my, mw * 0.6, 0, Math.PI, false); break;
      case 'sad': ctx.arc(mx, my, mw * 0.5, Math.PI, 0, false); break;
      case 'angry':
      case 'mad': ctx.moveTo(mx - mw * 0.5, my); ctx.lineTo(mx + mw * 0.5, my); break;
      case 'scared': ctx.arc(mx, my, mw * 0.4, 0, Math.PI * 2, false); break;
      case 'distracted':
        const sway = Math.sin(f.wob) * mw * 0.15;
        ctx.moveTo(mx - mw * 0.5, my + sway);
        ctx.lineTo(mx + mw * 0.5, my - sway);
        break;
    }
    ctx.stroke();
  }
  ctx.restore();
}