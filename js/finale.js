// Afsluiting na de laatste vraag: een fotocollage en daarna de winnaar met vuurwerk en confetti.
import { esc } from './common.js';

export const PHOTOS = ['finale/proost.jpg', 'finale/bottelen.jpg', 'finale/ambree-glas.jpg', 'finale/geschenkdoos.jpg'];

export function preloadPhotos() {
  for (const src of PHOTOS) new Image().src = src;
}

export function collageHtml(extra = '') {
  const tiles = PHOTOS.map((src, i) => `<figure class="polaroid p${i + 1}"><img src="${src}" alt=""></figure>`).join('');
  return `<section class="collage-screen">
    <h1 class="collage-title">Proost!</h1>
    <p class="collage-sub">Op alle vrijwilligers van Brouwerij Bosch</p>
    <div class="collage">${tiles}</div>
    ${extra || '<p class="collage-wait">Zo meteen: de winnaar…</p>'}
  </section>`;
}

// Winnaars = alle teams op plek 1 (bij gelijke stand meer dan één).
export function winnerHtml(list, me, extra = '') {
  const winners = (list || []).filter((r) => r.rank === 1);
  const names = winners.map((r) => `<span>${esc(r.name)}</span>`).join('<span class="amp">&amp;</span>');
  const mine = me && winners.some((r) => r.id === me.id)
    ? '<p class="winner-me">Dat zijn jullie! 🎉</p>'
    : me ? `<p class="winner-me other">Jullie werden ${me.rank}e met ${me.score} punten</p>` : '';
  return `<section class="winner-screen">
    <canvas class="fx"></canvas>
    <div class="winner-card">
      <p class="winner-lead">${winners.length > 1 ? 'De winnaars zijn' : 'De winnaar is'}</p>
      <h1 class="winner-name">${names || '…'}</h1>
      ${winners[0] ? `<p class="winner-score">${winners[0].score} punten</p>` : ''}
      ${mine}
      ${extra}
    </div>
  </section>`;
}

// Vuurwerk en confetti op het canvas in het winnaarsscherm. Stopt vanzelf als het canvas verdwijnt.
export function celebrate(root = document) {
  const canvas = root.querySelector('canvas.fx');
  if (!canvas || canvas.dataset.running) return;
  canvas.dataset.running = '1';
  const ctx = canvas.getContext('2d');
  const colors = ['#c5863f', '#f2c14e', '#ffffff', '#e94f37', '#cec5b6', '#7bc96f', '#5aa9e6'];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  let w = 0, h = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  const confetti = [];
  const addConfetti = (n) => {
    for (let i = 0; i < n; i++) {
      confetti.push({
        x: Math.random() * w, y: -20 - Math.random() * h * 0.5,
        vx: (Math.random() - 0.5) * 1.5, vy: 1.5 + Math.random() * 2.5,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        s: 6 + Math.random() * 6, c: pick(colors), wob: Math.random() * 10,
      });
    }
  };
  const rockets = [];
  const sparks = [];
  const launch = () => rockets.push({
    x: w * (0.15 + Math.random() * 0.7), y: h,
    vx: (Math.random() - 0.5) * 2, vy: -(h * 0.012 + 6 + Math.random() * 3),
    c: pick(colors), fuse: h * (0.15 + Math.random() * 0.3),
  });
  const burst = (r) => {
    const n = 60 + Math.floor(Math.random() * 40);
    const c2 = pick(colors);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, sp = 2 + Math.random() * 4;
      sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c: i % 3 ? r.c : c2 });
    }
  };

  addConfetti(160);
  let frame = 0;
  const step = () => {
    if (!canvas.isConnected) { window.removeEventListener('resize', resize); return; }
    frame++;
    if (frame % 28 === 0 || frame === 5) launch();
    if (frame % 6 === 0 && confetti.length < 220) addConfetti(4);
    ctx.clearRect(0, 0, w, h);

    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.x += r.vx; r.y += r.vy; r.vy += 0.12;
      ctx.fillStyle = r.c;
      ctx.beginPath(); ctx.arc(r.x, r.y, 2.5, 0, Math.PI * 2); ctx.fill();
      if (r.y < r.fuse || r.vy >= 0) { burst(r); rockets.splice(i, 1); }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx; s.y += s.vy; s.vx *= 0.97; s.vy = s.vy * 0.97 + 0.06; s.life -= 0.01;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.globalAlpha = s.life;
      ctx.fillStyle = s.c;
      ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.wob += 0.08; p.x += p.vx + Math.sin(p.wob) * 0.8; p.y += p.vy; p.r += p.vr;
      if (p.y > h + 20) { confetti.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2 * Math.abs(Math.cos(p.wob)) + 1);
      ctx.restore();
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
