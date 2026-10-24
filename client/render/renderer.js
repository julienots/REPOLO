// Rendu Canvas 2D : carte pré-rendue + entités + obscurité éclairée par rayons + surcouches.
import { T, hasLineOfSight } from '../../shared/map/grid.js';
import { THEMES } from '../../shared/data/themes.js';
import { cosmeticById } from '../../shared/data/cosmetics.js';
import { ITEMS } from '../../shared/data/items.js';
import { SIM } from '../../shared/config/game.js';
import { makeRng } from '../../shared/util/rng.js';
import { drawCharacter, drawMonster, drawMonsterEyes, drawItem } from './sprites.js';
import { conePolygon, circlePolygon, tracePoly } from './lighting.js';

const TAU = Math.PI * 2;
const QUALITY = {
  low: { tile: 24, rays: 28, darkScale: 0.5, tint: false, particles: 20, dpr: 1 },
  medium: { tile: 32, rays: 44, darkScale: 0.75, tint: true, particles: 50, dpr: 1.5 },
  high: { tile: 40, rays: 64, darkScale: 1, tint: true, particles: 90, dpr: 2 },
};

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.settings = settings;
    this.dark = document.createElement('canvas');
    this.dctx = this.dark.getContext('2d');
    this.cam = { x: 0, y: 0, shake: 0 };
    this.particles = [];
    this.rings = [];
    this.lampPolys = null;
    this.lampKey = '';
    this.fps = 60;
    this.frameTimes = [];
    this.autoLevel = null;
    this.setQuality(settings.graphics);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setQuality(level) {
    if (level === 'auto') {
      const mobile = matchMedia('(pointer: coarse)').matches;
      level = this.autoLevel || (mobile ? 'medium' : 'high');
      this.auto = true;
    } else this.auto = false;
    this.qName = level;
    this.q = QUALITY[level] || QUALITY.medium;
    this.resize();
    if (this.map) this.prerender();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.dpr);
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.dpr = dpr; this.w = w; this.h = h;
    this.dark.width = Math.round(w * this.q.darkScale); this.dark.height = Math.round(h * this.q.darkScale);
    const mobile = matchMedia('(pointer: coarse)').matches;
    // pixels par case : on voit ~ 17 cases en largeur sur PC, ~ 14 sur mobile
    this.S = Math.max(26, Math.min(70, Math.min(w / (mobile ? 14 : 18), h / (mobile ? 8.5 : 11))));
  }

  setMap(map) {
    this.map = map;
    this.grid = map.grid;
    this.theme = THEMES[map.theme] || THEMES.warehouse;
    this.lampPolys = null;
    this.prerender();
  }

  // ---------------------------------------------------------------- PRÉ-RENDU
  prerender() {
    const m = this.map, P = this.q.tile, pal = this.theme.palette;
    const c = document.createElement('canvas');
    c.width = m.w * P; c.height = m.h * P;
    const g = c.getContext('2d');
    const rng = makeRng(m.seed || 1);
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) this.drawTile(g, x, y, P, pal, rng);
    }
    // marquage au sol de la zone du fourgon
    const v = m.van;
    g.save();
    g.strokeStyle = '#f0c040'; g.setLineDash([P * 0.3, P * 0.2]); g.lineWidth = P * 0.08;
    g.strokeRect(v.x * P, v.y * P, v.w * P, v.h * P);
    g.restore();
    this.mapCanvas = c;
    this.P = P;
  }

  drawTile(g, x, y, P, pal, rng) {
    const t = this.grid.get(x, y);
    const px = x * P, py = y * P;
    const floor = () => {
      g.fillStyle = (x + y) % 2 ? pal.floor : pal.floor2; g.fillRect(px, py, P, P);
      if (this.map.theme === 'hotel') {
        g.fillStyle = 'rgba(212,175,55,0.08)'; g.beginPath(); g.moveTo(px + P / 2, py + P * 0.15); g.lineTo(px + P * 0.85, py + P / 2); g.lineTo(px + P / 2, py + P * 0.85); g.lineTo(px + P * 0.15, py + P / 2); g.fill();
      } else if (this.map.theme === 'lab') {
        g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1; g.strokeRect(px + 0.5, py + 0.5, P - 1, P - 1);
      } else {
        for (let i = 0; i < 3; i++) { g.fillStyle = `rgba(0,0,0,${rng.range(0.03, 0.12)})`; g.fillRect(px + rng.next() * P, py + rng.next() * P, rng.range(1, P * 0.25), rng.range(1, P * 0.18)); }
      }
      if (rng.chance(0.04)) { g.fillStyle = 'rgba(60,20,10,0.25)'; g.beginPath(); g.ellipse(px + rng.next() * P, py + rng.next() * P, P * rng.range(0.15, 0.4), P * rng.range(0.1, 0.25), rng.next() * 3, 0, TAU); g.fill(); }
    };
    switch (t) {
      case T.WALL: case T.CRACKED: {
        g.fillStyle = pal.wall; g.fillRect(px, py, P, P);
        const below = this.grid.get(x, y + 1);
        const isOpenBelow = below !== T.WALL && below !== T.CRACKED;
        g.fillStyle = pal.wallTop; g.fillRect(px, py, P, isOpenBelow ? P * 0.62 : P);
        if (isOpenBelow) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(px, py + P * 0.62, P, P * 0.38); }
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(px, py, P, 2);
        if (t === T.CRACKED) {
          g.strokeStyle = 'rgba(30,20,10,0.8)'; g.lineWidth = Math.max(1, P * 0.05);
          g.beginPath(); g.moveTo(px + P * 0.2, py + P * 0.1); g.lineTo(px + P * 0.45, py + P * 0.4); g.lineTo(px + P * 0.35, py + P * 0.7); g.lineTo(px + P * 0.6, py + P * 0.95);
          g.moveTo(px + P * 0.45, py + P * 0.4); g.lineTo(px + P * 0.8, py + P * 0.3); g.stroke();
        }
        break;
      }
      case T.SHELF:
        floor();
        g.fillStyle = pal.shelf; g.fillRect(px + 2, py + 2, P - 4, P - 4);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(px + 2, py + P - 8, P - 4, 6);
        for (let i = 0; i < 2; i++) { g.fillStyle = ['#9b7a4a', '#7a8a9a', '#a05a3a', '#556b2f'][rng.int(0, 3)]; g.fillRect(px + 4 + i * P * 0.45, py + 5, P * 0.38, P * 0.4); }
        break;
      case T.TABLE:
        floor();
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(px + 4, py + 6, P - 6, P - 6);
        g.fillStyle = pal.table; g.fillRect(px + 2, py + 2, P - 4, P - 6);
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(px + 2, py + 2, P - 4, 3);
        break;
      case T.DEBRIS:
        floor();
        for (let i = 0; i < 7; i++) { g.fillStyle = rng.chance(0.5) ? pal.debris : 'rgba(200,230,255,0.5)'; g.save(); g.translate(px + rng.next() * P, py + rng.next() * P); g.rotate(rng.next() * 3); g.fillRect(-2, -1, rng.range(2, P * 0.2), rng.range(1, 3)); g.restore(); }
        break;
      case T.GRATE:
        g.fillStyle = pal.grate; g.fillRect(px, py, P, P);
        g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
        for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(px + (i * P) / 4, py); g.lineTo(px + (i * P) / 4, py + P); g.stroke(); }
        break;
      default:
        floor();
    }
  }

  // Un mur fissuré s'est effondré : on redessine la case.
  updateTile(i) {
    if (!this.mapCanvas) return;
    const x = i % this.map.w, y = (i / this.map.w) | 0;
    const g = this.mapCanvas.getContext('2d');
    const rng = makeRng(i);
    for (const [dx, dy] of [[0, 0], [0, -1]]) this.drawTile(g, x + dx, y + dy, this.P, this.theme.palette, rng);
    g.fillStyle = 'rgba(120,110,100,0.5)';
    for (let k = 0; k < 6; k++) g.fillRect(x * this.P + rng.next() * this.P, y * this.P + rng.next() * this.P, 4, 3);
    this.lampPolys = null;
  }

  // ---------------------------------------------------------------- IMAGE
  render(v) {
    const ctx = this.ctx, S = this.S, dpr = this.dpr;
    const now = performance.now();
    this.trackFps(now);
    const t = v.time;
    // caméra
    const target = v.camTarget;
    this.cam.x += (target.x - this.cam.x) * Math.min(1, v.dt * 8);
    this.cam.y += (target.y - this.cam.y) * Math.min(1, v.dt * 8);
    if (Math.abs(target.x - this.cam.x) > 8 || Math.abs(target.y - this.cam.y) > 8) { this.cam.x = target.x; this.cam.y = target.y; }
    this.cam.shake = Math.max(0, this.cam.shake - v.dt * 12);
    const shx = this.settings.screenShake ? (Math.random() - 0.5) * this.cam.shake : 0;
    const shy = this.settings.screenShake ? (Math.random() - 0.5) * this.cam.shake : 0;
    const ox = this.w / 2 - this.cam.x * S + shx, oy = this.h / 2 - this.cam.y * S + shy;
    this.ox = ox; this.oy = oy;
    const X = (x) => ox + x * S, Y = (y) => oy + y * S;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.w, this.h);
    ctx.imageSmoothingEnabled = true;
    // carte
    const P = this.P, k = S / P;
    const sx = Math.max(0, (-ox) / k), sy = Math.max(0, (-oy) / k);
    const sw = Math.min(this.mapCanvas.width - sx, this.w / k + 2), sh = Math.min(this.mapCanvas.height - sy, this.h / k + 2);
    if (sw > 0 && sh > 0) ctx.drawImage(this.mapCanvas, sx, sy, sw, sh, ox + sx * k, oy + sy * k, sw * k, sh * k);

    const vx0 = this.cam.x - this.w / S / 2 - 2, vx1 = this.cam.x + this.w / S / 2 + 2;
    const vy0 = this.cam.y - this.h / S / 2 - 2, vy1 = this.cam.y + this.h / S / 2 + 2;
    const onScreen = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;

    this.drawStatics(ctx, v, X, Y, S, t, onScreen);

    // entités triées par profondeur
    const ents = [];
    for (const it of v.items) if (onScreen(it.x, it.y) && !it.c) ents.push({ y: it.y, d: () => this.drawItemEnt(ctx, it, X, Y, S, t) });
    for (const it of v.items) if (it.c && onScreen(it.x, it.y)) ents.push({ y: it.y + 0.01, d: () => drawItem(ctx, X(it.x), Y(it.y), S, it.k, { time: t, noShadow: true }) });
    for (const p of v.players) {
      if (p.h || !onScreen(p.x, p.y) || p.st === 'extracted' || p.st === 'left') continue;
      if (p.st === 'dead' && !v.me?.dead && !v.showGhosts) continue;
      ents.push({ y: p.y, d: () => drawCharacter(ctx, X(p.x), Y(p.y), S, p.a, p.cos, { state: p.st, moving: p.sp > 0.3, carrying: !!p.c, time: t + p.phase }) });
    }
    for (const m of v.monsters) if (onScreen(m.x, m.y)) ents.push({ y: m.y, d: () => drawMonster(ctx, X(m.x), Y(m.y), S, m, t, v.roster) });
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.d();

    this.drawParticles(ctx, v, X, Y, S, 'under');
    // obscurité
    this.drawDarkness(v, X, Y, S, t);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(this.dark, 0, 0, this.w, this.h);
    if (this.q.tint) this.drawTint(ctx, v, X, Y, S);

    // au-dessus de l'obscurité
    for (const m of v.monsters) if (onScreen(m.x, m.y) && v.eyesVisible(m)) drawMonsterEyes(ctx, X(m.x), Y(m.y), S, m, t);
    this.drawParticles(ctx, v, X, Y, S, 'over');
    this.drawRings(ctx, v, X, Y, S);
    this.drawLabels(ctx, v, X, Y, S, t);
    this.drawBubbles(ctx, v, X, Y, S, t);
    this.drawIndicators(ctx, v, X, Y, S, t);
    if (this.settings.showFps) { ctx.fillStyle = '#0f0'; ctx.font = '12px monospace'; ctx.textAlign = 'left'; ctx.fillText(`${Math.round(this.fps)} i/s · ${this.qName}`, 8, this.h - 8); }
  }

  drawItemEnt(ctx, it, X, Y, S, t) {
    if (it.f > 0) {
      // objet en train de tomber du plafond : ombre qui grossit + objet décalé
      const k = Math.min(1, it.f / 1.2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(X(it.x), Y(it.y), S * 0.3 * (1 - k * 0.6), S * 0.15 * (1 - k * 0.6), 0, 0, TAU); ctx.fill();
      drawItem(ctx, X(it.x), Y(it.y) - k * S * 3, S, it.k, { time: t, noShadow: true });
      return;
    }
    drawItem(ctx, X(it.x), Y(it.y), S, it.k, { time: t, active: !!it.d || !!it.fl, flare: !!it.fl });
  }

  drawStatics(ctx, v, X, Y, S, t, onScreen) {
    const m = this.map, grid = this.grid;
    // portes
    m.doors.forEach((i, k) => {
      const x = i % m.w, y = (i / m.w) | 0;
      if (!onScreen(x, y)) return;
      const st = v.doorStates[k];
      const horizontalWall = grid.get(x - 1, y) === T.WALL || grid.get(x + 1, y) === T.WALL ? false : true;
      ctx.save();
      ctx.translate(X(x), Y(y));
      if (st === '2') { ctx.fillStyle = '#4a3020'; for (let j = 0; j < 4; j++) ctx.fillRect(S * (0.1 + j * 0.2), S * (0.3 + (j % 2) * 0.3), S * 0.18, S * 0.08); }
      else if (st === '1') {
        ctx.fillStyle = '#6b4a2a';
        if (horizontalWall) ctx.fillRect(0, 0, S * 0.14, S); else ctx.fillRect(0, 0, S, S * 0.14);
      } else {
        ctx.fillStyle = '#7a5532'; ctx.fillRect(S * 0.04, S * 0.04, S * 0.92, S * 0.92);
        ctx.strokeStyle = '#3d2817'; ctx.lineWidth = 2; ctx.strokeRect(S * 0.12, S * 0.12, S * 0.76, S * 0.76);
        ctx.fillStyle = '#d9b55a'; ctx.beginPath(); ctx.arc(S * 0.75, S * 0.5, S * 0.06, 0, TAU); ctx.fill();
      }
      ctx.restore();
    });
    // casiers
    for (const l of m.lockers) {
      if (!onScreen(l.x, l.y)) continue;
      const occ = v.lockerOcc[l.id] || 0;
      const shake = occ >= 2 ? Math.sin(t * 40) * 1.5 : 0;
      ctx.save(); ctx.translate(X(l.x) + shake, Y(l.y)); ctx.rotate(l.face + Math.PI / 2);
      ctx.fillStyle = '#5d6b73'; ctx.fillRect(-S * 0.42, -S * 0.1, S * 0.84, S * 0.55);
      ctx.fillStyle = '#4a565d'; ctx.fillRect(-S * 0.38, -S * 0.08, S * 0.36, S * 0.5); ctx.fillRect(S * 0.02, -S * 0.08, S * 0.36, S * 0.5);
      ctx.fillStyle = '#222'; for (let i = 0; i < 3; i++) { ctx.fillRect(-S * 0.3, S * (0.02 + i * 0.07), S * 0.2, S * 0.025); ctx.fillRect(S * 0.1, S * (0.02 + i * 0.07), S * 0.2, S * 0.025); }
      ctx.restore();
    }
    // monte-charges
    for (const e of m.elevators) {
      if (!onScreen(e.x, e.y)) continue;
      ctx.save(); ctx.translate(X(e.x), Y(e.y));
      ctx.fillStyle = '#2b3036'; ctx.fillRect(-S * 0.48, -S * 0.48, S * 0.96, S * 0.96);
      ctx.strokeStyle = v.mods.elevatorRandom ? '#ff5' : '#e8a33d'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(-S * 0.42, -S * 0.42, S * 0.84, S * 0.84); ctx.setLineDash([]);
      ctx.fillStyle = '#e8a33d'; ctx.font = `bold ${S * 0.36}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⇅', 0, 0);
      ctx.restore();
    }
    // fourgon (réel) et levier
    this.drawVan(ctx, m.van, X, Y, S, false, v);
    const lv = m.lever, ready = v.quotaMet;
    ctx.save(); ctx.translate(X(lv.x), Y(lv.y));
    ctx.fillStyle = '#333'; ctx.fillRect(-S * 0.15, -S * 0.15, S * 0.3, S * 0.3);
    ctx.strokeStyle = ready ? '#3ccf7a' : '#c0392b'; ctx.lineWidth = S * 0.08; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(S * 0.15, v.departing ? S * 0.3 : -S * 0.3); ctx.stroke();
    ctx.fillStyle = ready ? '#3ccf7a' : '#c0392b'; ctx.beginPath(); ctx.arc(S * 0.15, v.departing ? S * 0.3 : -S * 0.3, S * 0.1, 0, TAU); ctx.fill();
    ctx.restore();
    if (v.fakeVan) this.drawVan(ctx, v.fakeVan, X, Y, S, true, v);
    // point de contrôle qualité
    if (v.quest && !v.quest.done) {
      ctx.save(); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.arc(X(v.quest.x), Y(v.quest.y), v.quest.r * S, 0, TAU); ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#ffd23f'; ctx.font = `bold ${S * 0.3}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('CONTRÔLE QUALITÉ', X(v.quest.x), Y(v.quest.y));
    }
    // client spectral
    if (v.customer && !v.customer.done) {
      const cx = X(v.customer.x), cy = Y(v.customer.y) + Math.sin(t * 2) * 3;
      ctx.save(); ctx.globalAlpha = 0.6 + Math.sin(t * 5) * 0.1;
      ctx.fillStyle = '#9fe3ff'; ctx.beginPath(); ctx.ellipse(cx, cy, S * 0.3, S * 0.42, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#123'; ctx.fillRect(cx - S * 0.15, cy - S * 0.15, S * 0.08, S * 0.08); ctx.fillRect(cx + S * 0.07, cy - S * 0.15, S * 0.08, S * 0.08);
      ctx.restore();
    }
  }

  drawVan(ctx, van, X, Y, S, fake, v) {
    const x = X(van.x + van.w / 2), y = Y(van.y + van.h / 2);
    const w = Math.min(van.w, 4.2) * S, h = Math.min(van.h, 2.2) * S * 0.9;
    ctx.save(); ctx.translate(x, y);
    if (fake) { ctx.strokeStyle = 'rgba(240,192,64,0.8)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeRect(-van.w * S / 2, -van.h * S / 2, van.w * S, van.h * S); ctx.setLineDash([]); }
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-w / 2 + 6, -h / 2 + 8, w, h);
    ctx.fillStyle = fake ? '#d8e0d8' : '#e8e8e8'; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = '#3a4a5a'; ctx.fillRect(w / 2 - w * 0.22, -h / 2 + 4, w * 0.18, h - 8);
    ctx.fillStyle = '#f0a32e'; ctx.fillRect(-w / 2, -h * 0.1, w * 0.75, h * 0.2);
    ctx.fillStyle = '#222'; ctx.font = `bold ${S * 0.26}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(fake ? 'R3CUP\'EXPRES' : 'RÉCUP\'EXPRESS', -w * 0.12, -h * 0.3);
    ctx.font = `bold ${S * 0.2}px monospace`; ctx.fillStyle = '#333'; ctx.fillRect(-w / 2 + 4, h / 2 - S * 0.3, S * 1.3, S * 0.24);
    ctx.fillStyle = '#ffd'; ctx.fillText(fake ? 'F4-UX-666' : 'AB-123-CD', -w / 2 + 4 + S * 0.65, h / 2 - S * 0.18);
    if (v.departing && !fake) { ctx.fillStyle = `rgba(255,60,40,${0.5 + Math.sin(v.time * 12) * 0.4})`; ctx.fillRect(-w / 2 - 4, -h / 2, 6, h); }
    ctx.restore();
  }

  drawDarkness(v, X, Y, S, t) {
    const d = this.dctx, sc = this.q.darkScale;
    d.setTransform(sc, 0, 0, sc, 0, 0);
    d.globalCompositeOperation = 'source-over';
    const fog = this.theme.palette.fog;
    const reveal = v.mods.rv;
    d.fillStyle = reveal ? `rgba(${fog},0.25)` : `rgba(${fog},${v.me?.dead ? 0.8 : 0.955})`;
    d.fillRect(0, 0, this.w, this.h);
    d.globalCompositeOperation = 'destination-out';
    const rays = this.q.rays;
    const light = (pts, cx, cy, radius, intensity) => {
      const gr = d.createRadialGradient(X(cx), Y(cy), 0, X(cx), Y(cy), radius * S);
      gr.addColorStop(0, `rgba(0,0,0,${intensity})`);
      gr.addColorStop(0.65, `rgba(0,0,0,${intensity * 0.75})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = gr;
      tracePoly(d, pts, X, Y);
      d.fill();
    };
    // lampes de plafond (polygones mis en cache tant que portes/murs ne changent pas)
    const key = v.doorString + '|' + v.lampString;
    if (!this.lampPolys || this.lampKey !== key) {
      this.lampKey = key;
      this.lampPolys = this.map.lamps.map((l) => circlePolygon(this.grid, l.x, l.y, l.radius, 48));
    }
    const amb = v.mods.al;
    if (amb > 0.02) {
      this.map.lamps.forEach((l, i) => {
        if (v.lampString[i] !== '1') return;
        let k = amb;
        if (l.flicker) { const f = Math.sin(t * (7 + l.flicker * 13) + i) + Math.sin(t * 23 + i * 3); if (f > 1.2 * (1 - l.flicker * 0.6)) k *= 0.15; }
        light(this.lampPolys[i], l.x, l.y, l.radius, 0.85 * k);
      });
    }
    // lampes torches de tous les joueurs (on voit aussi ce qu'éclairent les autres)
    for (const p of v.players) {
      if (p.st === 'dead' || p.h || p.st === 'extracted' || p.st === 'left') continue;
      const isMe = p.id === v.myId;
      if (!p.l) continue;
      const big = p.eq === 'bigLight';
      let range = SIM.flashlightRange * (big ? 1.3 : 1) * v.mods.fr;
      const fov = SIM.flashlightFov * (big ? 1.35 : 1);
      let inten = 0.97;
      if ((v.mods.fk || p.fl) && Math.sin(t * 31 + p.phase * 10) > 0.3) inten *= 0.2;
      if (p.b < 0.15) { inten *= 0.4 + Math.random() * 0.4; range *= 0.6; }
      const pts = conePolygon(this.grid, p.x, p.y, p.a, fov, range, isMe ? rays : Math.round(rays * 0.6));
      light(pts, p.x, p.y, range, inten);
    }
    // vision rapprochée (autour de soi, même lampe éteinte)
    if (v.me && !v.me.dead) {
      const pts = circlePolygon(this.grid, v.me.x, v.me.y, SIM.ambientSight * 1.25, 24);
      light(pts, v.me.x, v.me.y, SIM.ambientSight * 1.25, 0.8);
    } else if (v.me?.dead) {
      const pts = circlePolygon(this.grid, v.me.x, v.me.y, 5, 24);
      light(pts, v.me.x, v.me.y, 5, 0.6);
    }
    // lanternes des créatures (indices !), fusées
    for (const m of v.monsters) {
      if ((m.k === 'inspecteur' && m.ex?.lantern) || (m.k === 'sauveteur' && m.ex?.lantern)) {
        light(circlePolygon(this.grid, m.x, m.y, 3.2, 24), m.x, m.y, 3.2, 0.8);
      }
    }
    for (const f of v.flares) light(circlePolygon(this.grid, f[0], f[1], 5.5, 32), f[0], f[1], 5.5, 0.95);
    // le fourgon en départ allume ses phares
    if (v.departing) { const vn = this.map.van; light(circlePolygon(this.grid, vn.x + vn.w / 2, vn.y + vn.h / 2, 6, 32), vn.x + vn.w / 2, vn.y + vn.h / 2, 6, 0.9); }
    d.globalCompositeOperation = 'source-over';
  }

  drawTint(ctx, v, X, Y, S) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of v.monsters) {
      if (m.k === 'sauveteur' && m.ex?.lantern) this.glow(ctx, X(m.x), Y(m.y), S * 3, '80,255,120', 0.13);
      if (m.k === 'inspecteur' && m.ex?.lantern) this.glow(ctx, X(m.x), Y(m.y), S * 3, '255,210,90', 0.12);
    }
    for (const f of v.flares) this.glow(ctx, X(f[0]), Y(f[1]), S * 5, '255,80,40', 0.15);
    for (const p of v.players) {
      if (!p.l || p.st === 'dead' || p.h) continue;
      const col = cosmeticById('light', p.cos?.light)?.color || '255,230,170';
      this.glow(ctx, X(p.x + Math.cos(p.a) * 2.5), Y(p.y + Math.sin(p.a) * 2.5), S * 3, col, 0.06);
    }
    if (v.mods.ag) { ctx.fillStyle = 'rgba(120,0,0,0.08)'; ctx.fillRect(0, 0, this.w, this.h); }
    ctx.restore();
  }

  glow(ctx, x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // ---------------------------------------------------------------- SURCOUCHES
  drawLabels(ctx, v, X, Y, S, t) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const p of v.players) {
      if (p.id === v.myId || p.h || p.st === 'extracted' || p.st === 'left') continue;
      if (p.st === 'dead' && !v.me?.dead) continue;
      if (!v.canSee(p.x, p.y)) continue;
      const y = Y(p.y) - S * 0.5;
      ctx.font = `600 ${Math.max(11, S * 0.26)}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const w = ctx.measureText(p.name).width + 10;
      ctx.fillRect(X(p.x) - w / 2, y - S * 0.32, w, S * 0.32);
      ctx.fillStyle = p.st === 'downed' ? '#ff8f7f' : '#fff';
      ctx.fillText(p.name, X(p.x), y);
      if (p.vl > 0.05) { ctx.fillStyle = '#3ccf7a'; ctx.fillText(p.rt ? '📻' : '🔊', X(p.x) + w / 2 + 8, y); }
      if (p.st === 'downed') this.bar(ctx, X(p.x), Y(p.y) + S * 0.45, S * 0.8, p.dn / SIM.bleedOutTime, '#ff5d4d');
      if (p.em) { ctx.font = `${S * 0.5}px sans-serif`; ctx.fillText(p.em, X(p.x), y - S * 0.35); }
    }
    // faux coéquipier (Dernier Invité) : nom qui clignote, lettres mélangées
    for (const m of v.monsters) {
      if (m.k !== 'invite' || !m.ex?.as || !v.canSee(m.x, m.y)) continue;
      const src = v.roster.get(m.ex.as);
      if (!src) continue;
      let name = src.name;
      if (Math.sin(t * 9 + m.x) > 0.6) name = scramble(name, Math.floor(t * 3));
      if (Math.sin(t * 17) > 0.85) continue;
      ctx.font = `600 ${Math.max(11, S * 0.26)}px system-ui, sans-serif`;
      const y = Y(m.y) - S * 0.5;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const w = ctx.measureText(name).width + 10;
      ctx.fillRect(X(m.x) - w / 2, y - S * 0.32, w, S * 0.32);
      ctx.fillStyle = '#fff'; ctx.fillText(name, X(m.x), y);
    }
    // valeur des objets proches et éclairés
    if (v.me && !v.me.dead) {
      ctx.font = `${Math.max(10, S * 0.22)}px system-ui, sans-serif`;
      for (const it of v.items) {
        if (it.c || it.f > 0) continue;
        const dd = Math.hypot(it.x - v.me.x, it.y - v.me.y);
        if (dd > 3.2 || !v.canSee(it.x, it.y)) continue;
        const def = ITEMS[it.k];
        if (!def || def.noLoot) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const label = `${it.v} cr`;
        const w = ctx.measureText(label).width + 8;
        ctx.fillRect(X(it.x) - w / 2, Y(it.y) - S * 0.62, w, S * 0.26);
        ctx.fillStyle = def.weight >= 3 ? '#ffb46b' : '#ffe9a8';
        ctx.fillText(label, X(it.x), Y(it.y) - S * 0.38);
      }
    }
  }

  bar(ctx, x, y, w, frac, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2, y, w, 5);
    ctx.fillStyle = color; ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), 5);
  }

  drawBubbles(ctx, v, X, Y, S, t) {
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    for (const b of v.bubbles) {
      const age = t - b.t;
      if (age > b.life) continue;
      const alpha = Math.min(1, (b.life - age) * 2);
      const x = X(b.x), y = Y(b.y) - S * 1.05 - age * 4;
      ctx.font = `${b.kind === 'monster' ? 'bold ' : ''}${Math.max(12, S * 0.3)}px system-ui, sans-serif`;
      const lines = wrap(ctx, b.text, S * 5);
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14;
      const h = lines.length * S * 0.36 + 8;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = b.kind === 'monster' ? 'rgba(80,0,0,0.85)' : b.kind === 'mimic' || b.kind === 'disguised' ? 'rgba(40,30,50,0.85)' : b.kind === 'rescuer' ? 'rgba(10,60,20,0.85)' : b.kind === 'ghost' ? 'rgba(80,90,120,0.7)' : 'rgba(255,255,255,0.92)';
      roundRect(ctx, x - w / 2, y - h / 2, w, h, 8); ctx.fill();
      ctx.fillStyle = b.kind === 'bot' || b.kind === 'chat' ? '#111' : '#fff';
      lines.forEach((l, i) => ctx.fillText(l, x, y - h / 2 + 4 + S * 0.18 + i * S * 0.36));
      if (b.speaker) { ctx.font = `600 ${Math.max(9, S * 0.2)}px system-ui`; ctx.fillStyle = b.kind === 'bot' || b.kind === 'chat' ? '#555' : '#ccc'; ctx.fillText(b.speaker, x, y - h / 2 - S * 0.12); }
      ctx.globalAlpha = 1;
    }
  }

  drawRings(ctx, v, X, Y, S) {
    if (!this.settings.visualSounds) return;
    for (const r of v.rings) {
      const age = v.time - r.t;
      if (age > 1) continue;
      ctx.strokeStyle = r.monster ? `rgba(255,70,60,${1 - age})` : `rgba(255,255,255,${0.6 * (1 - age)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(r.x), Y(r.y), S * (0.3 + age * Math.min(4, r.l * 0.4)), 0, TAU); ctx.stroke();
    }
  }

  // Flèches au bord de l'écran : coéquipiers, fourgon, repères
  drawIndicators(ctx, v, X, Y, S, t) {
    const marks = [];
    for (const p of v.players) {
      if (p.id === v.myId || p.st === 'extracted' || p.st === 'left' || (p.st === 'dead' && !v.me?.dead)) continue;
      marks.push({ x: p.x, y: p.y, label: p.name, color: cosmeticById('suit', p.cos?.suit)?.color || '#fff', icon: p.st === 'downed' ? '✚' : '●' });
    }
    if (v.fakeMark) marks.push(v.fakeMark);
    if (v.carrying || v.quotaMet || v.departing) marks.push({ x: this.map.van.x + this.map.van.w / 2, y: this.map.van.y + this.map.van.h / 2, label: 'Fourgon', color: '#f0c040', icon: '🚐' });
    for (const pg of v.pings) marks.push({ x: pg.x, y: pg.y, label: pg.label, color: '#ffd23f', icon: '◆' });
    const m = 26;
    for (const mk of marks) {
      const sx = X(mk.x), sy = Y(mk.y);
      const inside = sx > m && sx < this.w - m && sy > m && sy < this.h - m;
      const dist = v.me ? Math.round(Math.hypot(mk.x - v.me.x, mk.y - v.me.y)) : 0;
      if (inside) {
        if (mk.icon === '◆' || mk.icon === '🚐') { ctx.font = `${S * 0.35}px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = mk.color; ctx.fillText(mk.icon, sx, sy - S * 0.9); }
        continue;
      }
      const cx = this.w / 2, cy = this.h / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const k = Math.min((this.w / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (this.h / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
      const ex = cx + Math.cos(a) * k, ey = cy + Math.sin(a) * k;
      ctx.save(); ctx.translate(ex, ey);
      ctx.fillStyle = mk.color; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12); ctx.lineTo(Math.cos(a + 2.4) * 9, Math.sin(a + 2.4) * 9); ctx.lineTo(Math.cos(a - 2.4) * 9, Math.sin(a - 2.4) * 9); ctx.fill();
      ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tx = -Math.cos(a) * 26, ty = -Math.sin(a) * 18;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; const label = `${mk.icon} ${mk.label} ${dist}m`; const w = ctx.measureText(label).width + 8; ctx.fillRect(tx - w / 2, ty - 8, w, 16);
      ctx.fillStyle = '#fff'; ctx.fillText(label, tx, ty);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- PARTICULES
  spawn(kind, x, y, n = 10) {
    const max = this.q.particles;
    for (let i = 0; i < n && this.particles.length < max * 3; i++) {
      const a = Math.random() * TAU, sp = Math.random();
      const p = { kind, x, y, vx: Math.cos(a) * sp * 3, vy: Math.sin(a) * sp * 3, life: 1, max: 1, layer: 'over' };
      if (kind === 'confetti') { p.vy = -Math.random() * 4; p.vx = (Math.random() - 0.5) * 6; p.color = ['#ff4757', '#ffd32a', '#3ae374', '#17c0eb', '#c56cf0'][i % 5]; p.max = p.life = 2 + Math.random(); }
      if (kind === 'dust') { p.vx *= 0.4; p.vy *= 0.4; p.max = p.life = 0.8 + Math.random(); p.layer = 'under'; }
      if (kind === 'spark') { p.max = p.life = 0.4 + Math.random() * 0.3; p.color = '#ffcc55'; }
      if (kind === 'shard') { p.max = p.life = 0.7; p.color = '#cfe7ff'; }
      if (kind === 'coin') { p.vy = -2 - Math.random() * 2; p.max = p.life = 1; p.color = '#ffd700'; }
      this.particles.push(p);
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'confetti') { p.vy += 3 * dt; p.vx *= 0.98; }
      else { p.vx *= 0.9; p.vy *= 0.9; }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  drawParticles(ctx, v, X, Y, S, layer) {
    for (const p of this.particles) {
      if (p.layer !== layer) continue;
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      if (p.kind === 'confetti') { ctx.fillStyle = p.color; ctx.save(); ctx.translate(X(p.x), Y(p.y)); ctx.rotate(p.life * 8); ctx.fillRect(-3, -1.5, 6, 3); ctx.restore(); }
      else if (p.kind === 'dust') { ctx.fillStyle = '#bba'; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), S * 0.08 * (1.5 - a), 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = p.color || '#fff'; ctx.fillRect(X(p.x) - 2, Y(p.y) - 2, 4, 4); }
    }
    ctx.globalAlpha = 1;
  }

  shake(amp) { this.cam.shake = Math.min(18, this.cam.shake + amp); }

  trackFps(now) {
    this.frameTimes.push(now);
    while (this.frameTimes.length && this.frameTimes[0] < now - 1000) this.frameTimes.shift();
    this.fps = this.frameTimes.length;
    // qualité automatique : on baisse si l'appareil peine (chauffe / batterie)
    if (this.auto && this.frameTimes.length > 5) {
      this.autoCheck = (this.autoCheck || 0) + 1;
      if (this.autoCheck > 180) {
        this.autoCheck = 0;
        if (this.fps < 38 && this.qName !== 'low') { this.autoLevel = this.qName === 'high' ? 'medium' : 'low'; this.setQuality('auto'); }
      }
    }
  }

  screenToWorld(sx, sy) { return { x: (sx - this.ox) / this.S, y: (sy - this.oy) / this.S }; }
}

function wrap(ctx, text, maxW) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function scramble(name, seed) {
  const chars = [...name];
  if (chars.length < 3) return name;
  const i = 1 + (seed % (chars.length - 2));
  [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
  return chars.join('');
}

export { hasLineOfSight };
