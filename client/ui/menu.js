// Menu principal : fond animé (couloir sombre, lampe qui balaie, silhouettes), carte de profil.
import { drawCharacter, drawMonster } from '../render/sprites.js';
import { cosmeticById } from '../../shared/data/cosmetics.js';

const $ = (id) => document.getElementById(id);

export class MenuUI {
  constructor(app) {
    this.app = app;
    this.t = 0;
    this.canvas = $('menu-canvas');
    this.ctx = this.canvas.getContext('2d');
    const name = $('profile-name');
    name.addEventListener('change', () => { app.profile.data.name = name.value.trim().slice(0, 16); app.profile.save(); });
    this.refresh();
  }

  refresh() {
    const p = this.app.profile;
    const d = p.data;
    $('profile-name').value = d.name || '';
    if (!d.name) $('profile-name').placeholder = 'Employé n°' + (Math.floor(Math.random() * 900) + 100);
    const lv = p.level;
    $('profile-level').textContent = lv.level;
    $('profile-coins').textContent = d.coins;
    $('profile-wins').textContent = d.stats.wins;
    $('profile-xp').style.width = `${Math.round((lv.into / lv.next) * 100)}%`;
    $('profile-title').textContent = `« ${cosmeticById('title', d.cosmetics.title)?.name || 'Stagiaire'} »`;
    const av = $('menu-avatar').getContext('2d');
    av.clearRect(0, 0, 160, 160);
    drawCharacter(av, 80, 84, 150, -Math.PI / 2 + 0.4, d.cosmetics, { time: 0 });
    if (this.app.profile.persisted === false) this.app.toast('Attention : le stockage local est bloqué, la progression ne sera pas sauvegardée.');
  }

  frame(dt) {
    this.t += dt;
    const c = this.canvas, ctx = this.ctx;
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const t = this.t;
    ctx.fillStyle = '#07080a'; ctx.fillRect(0, 0, w, h);
    // sol en perspective
    const S = Math.max(40, Math.min(w, h) / 9);
    ctx.save();
    for (let y = 0; y < h / S + 1; y++) for (let x = 0; x < w / S + 1; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#15171a' : '#121417';
      ctx.fillRect(x * S, y * S, S, S);
    }
    // créature qui rôde au loin
    const mx = w * 0.78 + Math.sin(t * 0.2) * w * 0.08, my = h * 0.3 + Math.cos(t * 0.17) * h * 0.05;
    drawMonster(ctx, mx, my, S * 1.1, { k: Math.floor(t / 12) % 2 ? 'sourdine' : 'berger', a: Math.PI - 0.3 + Math.sin(t) * 0.2, s: 'roam', mv: 1, ex: {} }, t);
    // personnage avec lampe
    const px = w * 0.2, py = h * 0.72;
    drawCharacter(ctx, px, py, S * 1.2, -0.5 + Math.sin(t * 0.5) * 0.4, this.app.profile.data.cosmetics, { time: t, moving: false });
    ctx.restore();
    // obscurité + faisceau
    const ang = -0.5 + Math.sin(t * 0.5) * 0.4;
    const g = ctx.createRadialGradient(px, py, 0, px, py, w * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.0)');
    ctx.save();
    ctx.fillStyle = 'rgba(4,5,7,0.93)';
    ctx.beginPath(); ctx.rect(0, 0, w, h);
    ctx.moveTo(px, py);
    ctx.arc(px, py, w * 0.75, ang - 0.32, ang + 0.32);
    ctx.closePath();
    ctx.fill('evenodd');
    ctx.restore();
    const beam = ctx.createRadialGradient(px, py, 0, px, py, w * 0.75);
    beam.addColorStop(0, 'rgba(255,220,150,0.18)'); beam.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, w * 0.75, ang - 0.32, ang + 0.32); ctx.closePath(); ctx.fill();
    // yeux dans le noir
    if (Math.sin(t * 0.7) > 0.2) {
      for (const [ex, ey] of [[w * 0.92, h * 0.62], [w * 0.06, h * 0.2]]) {
        ctx.fillStyle = '#ffcc33'; ctx.shadowColor = '#ffcc33'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.arc(ex + 14, ey, 3, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }
}
