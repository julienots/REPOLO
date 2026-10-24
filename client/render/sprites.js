// Dessins procéduraux (Canvas 2D) : personnages, créatures, objets.
// Vue de dessus légèrement « 3/4 ». S = pixels par case. (x, y) en pixels écran.
import { cosmeticById } from '../../shared/data/cosmetics.js';
import { ITEMS } from '../../shared/data/items.js';

const TAU = Math.PI * 2;

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, r + amt)); g = Math.max(0, Math.min(255, g + amt)); b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}

function circle(ctx, x, y, r, fill, stroke, lw = 1) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function shadow(ctx, x, y, rx, ry = rx * 0.5) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y + ry * 0.9, rx, ry, 0, 0, TAU); ctx.fill();
}

// ------------------------------------------------------------------ PERSONNAGES
export function drawCharacter(ctx, x, y, S, angle, cos = {}, opts = {}) {
  const suit = cosmeticById('suit', cos.suit)?.color || '#e67e22';
  const r = S * 0.3;
  const t = opts.time || 0;
  if (opts.state === 'dead') return drawGhost(ctx, x, y, S, t, suit);
  ctx.save();
  ctx.translate(x, y);
  if (opts.state === 'downed') {
    shadow(ctx, 0, r * 0.3, r * 1.3, r * 0.5);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = suit;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.75, r * 1.25, 0, 0, TAU); ctx.fill();
    circle(ctx, 0, -r * 1.05, r * 0.55, shade(suit, 25));
    ctx.restore();
    return;
  }
  shadow(ctx, 0, r * 0.4, r * 1.05);
  const bob = opts.moving ? Math.sin(t * 14) * r * 0.06 : 0;
  ctx.translate(0, bob);
  // sac à dos
  const bx = -Math.cos(angle) * r * 0.75, by = -Math.sin(angle) * r * 0.75;
  ctx.fillStyle = shade(suit, -60);
  ctx.beginPath(); ctx.ellipse(bx, by, r * 0.55, r * 0.55, angle, 0, TAU); ctx.fill();
  // bras
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const swing = opts.moving ? Math.sin(t * 14) * 0.35 : 0;
  for (const side of [-1, 1]) {
    const reach = opts.carrying ? 0.95 : 0.55 + side * swing * 0.4;
    const ax = ca * r * reach - sa * side * r * 0.85, ay = sa * r * reach + ca * side * r * 0.85;
    circle(ctx, ax, ay, r * 0.28, shade(suit, -20));
  }
  // corps
  circle(ctx, 0, 0, r, suit, shade(suit, -70), Math.max(1, S * 0.03));
  // bande réfléchissante
  ctx.strokeStyle = 'rgba(230,230,200,0.5)'; ctx.lineWidth = r * 0.16;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.68, angle + 1.2, angle + Math.PI * 2 - 1.2); ctx.stroke();
  drawMask(ctx, cos.mask, r, angle);
  drawHat(ctx, cos.hat, r, angle, suit);
  ctx.restore();
}

function drawMask(ctx, mask, r, a) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const fx = ca * r * 0.55, fy = sa * r * 0.55;
  ctx.save(); ctx.translate(fx, fy); ctx.rotate(a);
  switch (mask) {
    case 'goggles':
      circle(ctx, 0, -r * 0.24, r * 0.2, '#ffcf6b', '#222', 2); circle(ctx, 0, r * 0.24, r * 0.2, '#ffcf6b', '#222', 2); break;
    case 'smile':
      circle(ctx, 0, 0, r * 0.42, '#f4efe4', '#999', 1);
      ctx.strokeStyle = '#222'; ctx.lineWidth = r * 0.07; ctx.beginPath(); ctx.arc(-r * 0.05, 0, r * 0.25, -1.1, 1.1); ctx.stroke(); break;
    case 'gas':
      circle(ctx, 0, 0, r * 0.4, '#5e6466'); circle(ctx, r * 0.25, -r * 0.25, r * 0.15, '#2c2f30'); circle(ctx, r * 0.25, r * 0.25, r * 0.15, '#2c2f30');
      circle(ctx, -r * 0.05, -r * 0.18, r * 0.1, '#9fd8ff'); circle(ctx, -r * 0.05, r * 0.18, r * 0.1, '#9fd8ff'); break;
    case 'paper':
      ctx.fillStyle = '#b48a55'; ctx.fillRect(-r * 0.4, -r * 0.45, r * 0.75, r * 0.9);
      ctx.fillStyle = '#222'; ctx.fillRect(0, -r * 0.25, r * 0.12, r * 0.12); ctx.fillRect(0, r * 0.13, r * 0.12, r * 0.12); break;
    case 'hockey':
      circle(ctx, 0, 0, r * 0.42, '#efe9dc', '#7a1e1e', 2);
      for (const [ox, oy] of [[0.05, -0.2], [0.05, 0.2], [0.2, 0], [-0.15, 0]]) circle(ctx, r * ox, r * oy, r * 0.06, '#222'); break;
    case 'cyclops':
      circle(ctx, 0, 0, r * 0.36, '#333'); circle(ctx, r * 0.05, 0, r * 0.22, '#ff4a3d'); circle(ctx, r * 0.1, -r * 0.06, r * 0.06, '#fff'); break;
    default:
      ctx.fillStyle = '#7fc4ff'; ctx.strokeStyle = '#123'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.22, r * 0.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(r * 0.04, -r * 0.2, r * 0.06, r * 0.15, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawHat(ctx, hat, r, a, suit) {
  const ca = Math.cos(a), sa = Math.sin(a);
  switch (hat) {
    case 'helmet':
      circle(ctx, -ca * r * 0.1, -sa * r * 0.1, r * 0.62, '#f1c40f', '#a8860a', 2);
      circle(ctx, ca * r * 0.25, sa * r * 0.25, r * 0.12, '#fff7c2'); break;
    case 'beanie':
      circle(ctx, -ca * r * 0.1, -sa * r * 0.1, r * 0.55, shade(suit, -40)); circle(ctx, -ca * r * 0.1, -sa * r * 0.1, r * 0.18, '#eee'); break;
    case 'cap':
      circle(ctx, -ca * r * 0.1, -sa * r * 0.1, r * 0.55, '#2c3e8f');
      ctx.fillStyle = '#1f2b66'; ctx.beginPath(); ctx.ellipse(ca * r * 0.45, sa * r * 0.45, r * 0.28, r * 0.42, a, 0, TAU); ctx.fill(); break;
    case 'crown': {
      ctx.fillStyle = '#ffd700'; ctx.strokeStyle = '#a07800'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const ang = (i / 10) * TAU; const rr = i % 2 ? r * 0.35 : r * 0.6; ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
      ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    }
    case 'antenna':
      ctx.strokeStyle = '#999'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-ca * r * 0.2 + r * 0.3, -sa * r * 0.2 - r * 0.6); ctx.stroke();
      circle(ctx, -ca * r * 0.2 + r * 0.3, -sa * r * 0.2 - r * 0.6, r * 0.14, '#ff4757'); break;
    case 'chef':
      for (const [ox, oy] of [[0, 0], [0.25, 0.2], [-0.25, 0.15], [0.1, -0.28], [-0.2, -0.22]]) circle(ctx, r * ox, r * oy, r * 0.32, '#fafafa', '#ccc', 1); break;
    case 'party':
      ctx.fillStyle = '#e84393'; ctx.beginPath(); ctx.moveTo(-r * 0.4, r * 0.1); ctx.lineTo(r * 0.4, r * 0.1); ctx.lineTo(0, -r * 0.9); ctx.closePath(); ctx.fill();
      circle(ctx, 0, -r * 0.9, r * 0.12, '#ffeaa7'); break;
    default: break;
  }
}

function drawGhost(ctx, x, y, S, t, suit) {
  const r = S * 0.32;
  ctx.save(); ctx.translate(x, y + Math.sin(t * 3) * r * 0.15); ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#dfe9ff';
  ctx.beginPath(); ctx.arc(0, -r * 0.2, r, Math.PI, 0);
  for (let i = 0; i <= 6; i++) { const px = r - (i / 6) * r * 2; ctx.lineTo(px, r * 0.7 + (i % 2 ? -r * 0.25 : 0) + Math.sin(t * 6 + i) * r * 0.08); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = suit; ctx.fillRect(-r * 0.7, r * 0.15, r * 1.4, r * 0.12);
  circle(ctx, -r * 0.35, -r * 0.3, r * 0.14, '#223'); circle(ctx, r * 0.35, -r * 0.3, r * 0.14, '#223');
  ctx.restore();
}

// ------------------------------------------------------------------ CRÉATURES
// m : { k, x, y, a, s, mv, r, ex }, roster : pour le Dernier Invité (apparence copiée)
export function drawMonster(ctx, x, y, S, m, t, roster) {
  const fn = MONSTER_DRAW[m.k];
  if (fn) fn(ctx, x, y, S, m, t, roster);
}

const MONSTER_DRAW = {
  sourdine(ctx, x, y, S, m, t) {
    const a = m.a;
    ctx.save(); ctx.translate(x, y);
    shadow(ctx, 0, S * 0.15, S * 0.4);
    const sway = Math.sin(t * 2) * 0.1;
    ctx.rotate(a);
    // longs bras traînants
    ctx.strokeStyle = '#3b3f45'; ctx.lineWidth = S * 0.07; ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0, side * S * 0.18);
      ctx.quadraticCurveTo(S * 0.3, side * S * (0.55 + sway), S * 0.75, side * S * (0.35 + sway * 0.5)); ctx.stroke();
    }
    // corps maigre
    ctx.fillStyle = '#4a4e55'; ctx.beginPath(); ctx.ellipse(-S * 0.05, 0, S * 0.22, S * 0.17, 0, 0, TAU); ctx.fill();
    // tête-cornet (pavillon) sans yeux
    const g = ctx.createLinearGradient(0, 0, S * 0.7, 0);
    g.addColorStop(0, '#6b6f78'); g.addColorStop(1, '#c9b9a6');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(S * 0.05, -S * 0.08); ctx.lineTo(S * 0.62, -S * 0.36); ctx.quadraticCurveTo(S * 0.72, 0, S * 0.62, S * 0.36); ctx.lineTo(S * 0.05, S * 0.08); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3a2a22'; ctx.lineWidth = 1.5;
    for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(S * (0.2 + i * 0.12), 0, S * 0.03, S * (0.1 + i * 0.08), 0, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = '#1b0f0c'; ctx.beginPath(); ctx.ellipse(S * 0.64, 0, S * 0.05, S * 0.28, 0, 0, TAU); ctx.fill();
    ctx.restore();
  },
  inspecteur(ctx, x, y, S, m, t) {
    ctx.save(); ctx.translate(x, y);
    shadow(ctx, 0, S * 0.15, S * 0.38);
    ctx.rotate(m.a);
    // manteau
    ctx.fillStyle = '#1f2a44'; ctx.beginPath(); ctx.moveTo(-S * 0.35, -S * 0.3); ctx.lineTo(S * 0.15, -S * 0.25); ctx.lineTo(S * 0.15, S * 0.25); ctx.lineTo(-S * 0.35, S * 0.3); ctx.closePath(); ctx.fill();
    // bras + lanterne / tampon
    circle(ctx, S * 0.25, S * 0.3, S * 0.09, '#1f2a44');
    circle(ctx, S * 0.42, S * 0.33, S * 0.1, '#ffd36b', '#7a5a10', 2);
    circle(ctx, S * 0.25, -S * 0.3, S * 0.09, '#1f2a44');
    ctx.fillStyle = '#7a1d1d'; ctx.fillRect(S * 0.32, -S * 0.4, S * 0.14, S * 0.16);
    // visage vide + casquette à visière
    circle(ctx, 0, 0, S * 0.2, '#d8d2c6');
    circle(ctx, -S * 0.04, 0, S * 0.22, '#15203a');
    ctx.fillStyle = '#0d1426'; ctx.beginPath(); ctx.ellipse(S * 0.17, 0, S * 0.1, S * 0.2, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
    ctx.fillStyle = '#e8c547'; ctx.fillRect(-S * 0.02, -S * 0.04, S * 0.08, S * 0.08);
    ctx.restore();
    if (m.s === 'control' || m.s === 'check') {
      ctx.fillStyle = '#ffd36b'; ctx.font = `bold ${S * 0.45}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('!', x, y - S * 0.55);
    }
  },
  mannequine(ctx, x, y, S, m, t) {
    ctx.save(); ctx.translate(x, y);
    shadow(ctx, 0, S * 0.12, S * 0.3);
    ctx.rotate(m.a);
    // pose aléatoire figée, change à chaque reprise de mouvement (craquement)
    const seed = (m.ex?.creak || 0) * 1.7;
    const pose = (i) => Math.sin(seed + i * 2.3) * 0.9;
    ctx.strokeStyle = '#e9dcc7'; ctx.lineWidth = S * 0.09; ctx.lineCap = 'round';
    for (const [i, side] of [[0, -1], [1, 1]]) {
      const ang = side * (1.2 + pose(i) * 0.6);
      ctx.beginPath(); ctx.moveTo(0, side * S * 0.12); ctx.lineTo(Math.cos(ang) * S * 0.38, Math.sin(ang) * S * 0.38 + side * S * 0.05); ctx.stroke();
      circle(ctx, Math.cos(ang) * S * 0.38, Math.sin(ang) * S * 0.38 + side * S * 0.05, S * 0.05, '#cdbfa8');
    }
    ctx.fillStyle = '#efe3cf'; ctx.beginPath(); ctx.ellipse(-S * 0.02, 0, S * 0.15, S * 0.21, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#b9a98f'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-S * 0.15, 0); ctx.lineTo(S * 0.12, 0); ctx.stroke();
    // tête lisse avec sourire peint
    circle(ctx, S * 0.08, 0, S * 0.15, '#f6ecdc', '#c8b89d', 1);
    ctx.strokeStyle = '#b3262e'; ctx.lineWidth = S * 0.025; ctx.beginPath(); ctx.arc(S * 0.12, 0, S * 0.08, -1.2, 1.2); ctx.stroke();
    circle(ctx, S * 0.15, -S * 0.06, S * 0.018, '#222'); circle(ctx, S * 0.15, S * 0.06, S * 0.018, '#222');
    ctx.restore();
  },
  demenageur(ctx, x, y, S, m, t) {
    ctx.save(); ctx.translate(x, y);
    const big = S * 1.55;
    shadow(ctx, 0, big * 0.2, big * 0.45);
    ctx.rotate(m.a);
    const breathe = 1 + Math.sin(t * 2) * 0.02;
    // dos voûté énorme
    ctx.fillStyle = '#5a3f2e'; ctx.beginPath(); ctx.ellipse(-big * 0.1, 0, big * 0.4 * breathe, big * 0.36 * breathe, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6e4e39'; ctx.beginPath(); ctx.ellipse(-big * 0.15, 0, big * 0.25, big * 0.22, 0, 0, TAU); ctx.fill();
    // mains énormes
    for (const side of [-1, 1]) circle(ctx, big * 0.28, side * big * 0.36, big * 0.13, '#4a3324', '#2a1d14', 2);
    // tête-carton
    ctx.fillStyle = '#b98b4f'; ctx.strokeStyle = '#6e5025'; ctx.lineWidth = 2;
    ctx.fillRect(big * 0.08, -big * 0.2, big * 0.34, big * 0.4); ctx.strokeRect(big * 0.08, -big * 0.2, big * 0.34, big * 0.4);
    ctx.strokeStyle = '#8a6532'; ctx.beginPath(); ctx.moveTo(big * 0.25, -big * 0.2); ctx.lineTo(big * 0.25, big * 0.2); ctx.stroke();
    ctx.fillStyle = '#c0392b'; ctx.save(); ctx.translate(big * 0.17, 0); ctx.rotate(Math.PI / 2); ctx.font = `bold ${big * 0.07}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('FRAGILE', 0, 0); ctx.restore();
    // trous pour les yeux
    circle(ctx, big * 0.36, -big * 0.08, big * 0.035, '#120a04'); circle(ctx, big * 0.36, big * 0.08, big * 0.035, '#120a04');
    ctx.restore();
    if (m.s === 'stunned') {
      for (let i = 0; i < 3; i++) {
        const ang = t * 5 + (i * TAU) / 3;
        ctx.fillStyle = '#ffe066'; ctx.font = `${S * 0.4}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillText('★', x + Math.cos(ang) * S * 0.6, y - S * 0.7 + Math.sin(ang) * S * 0.2);
      }
    }
    if (m.s === 'windup') { ctx.strokeStyle = 'rgba(255,80,40,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, S * (0.9 + Math.sin(t * 30) * 0.08), 0, TAU); ctx.stroke(); }
  },
  berger(ctx, x, y, S, m, t) {
    ctx.save(); ctx.translate(x, y);
    shadow(ctx, 0, S * 0.15, S * 0.4);
    ctx.rotate(m.a);
    // mille bras
    ctx.strokeStyle = '#2f3a2f'; ctx.lineWidth = S * 0.035; ctx.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * TAU + Math.sin(t * 3 + i) * 0.15;
      const len = S * (0.45 + (i % 3) * 0.08);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(ang + 0.4) * len * 0.6, Math.sin(ang + 0.4) * len * 0.6, Math.cos(ang) * len, Math.sin(ang) * len); ctx.stroke();
    }
    circle(ctx, 0, 0, S * 0.24, '#4a5a48', '#232b22', 2);
    // cloche
    const ring = m.s === 'ring' ? Math.sin(t * 40) * 0.4 : Math.sin(t * 4) * 0.15;
    ctx.save(); ctx.translate(S * 0.36, 0); ctx.rotate(ring);
    ctx.fillStyle = '#d4a017'; ctx.beginPath(); ctx.moveTo(-S * 0.1, -S * 0.1); ctx.lineTo(S * 0.1, -S * 0.14); ctx.lineTo(S * 0.1, S * 0.14); ctx.lineTo(-S * 0.1, S * 0.1); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    if (m.s === 'ring') { ctx.strokeStyle = `rgba(255,220,120,${0.4 + Math.sin(t * 20) * 0.3})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, S * (1 + ((t * 2) % 1) * 3), 0, TAU); ctx.stroke(); }
  },
  echo(ctx, x, y, S, m, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(m.a);
    ctx.globalAlpha = 0.85;
    // corps plat à franges
    ctx.fillStyle = '#5b4b57';
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const ang = (i / 24) * TAU;
      const rr = S * (0.34 + Math.sin(ang * 6 + t * 10) * 0.03) * (Math.abs(Math.cos(ang)) * 0.4 + 0.6);
      ctx.lineTo(Math.cos(ang) * rr * 1.3, Math.sin(ang) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8c7387'; ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-S * 0.35, i * S * 0.06); ctx.lineTo(S * 0.3, i * S * 0.06); ctx.stroke(); }
    // bouche en anneaux (« haut-parleur »)
    for (let i = 3; i > 0; i--) circle(ctx, S * 0.3, 0, S * 0.04 * i, i % 2 ? '#2b1e28' : '#a07f96');
    ctx.restore();
  },
  sauveteur(ctx, x, y, S, m, t) {
    const disguised = m.ex?.disguised;
    ctx.save(); ctx.translate(x, y);
    // pas d'ombre : indice subtil
    ctx.rotate(m.a);
    const r = S * 0.3;
    circle(ctx, -r * 0.7, 0, r * 0.5, '#7a3a10');
    circle(ctx, 0, 0, r, disguised ? '#ff7a1a' : '#6a2b0e', '#5a2200', 2);
    ctx.strokeStyle = '#e8f0d0'; ctx.lineWidth = r * 0.2; ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.9); ctx.lineTo(-r * 0.2, r * 0.9); ctx.stroke();
    circle(ctx, -r * 0.05, 0, r * 0.6, '#e9e9e9', '#999', 1);
    circle(ctx, r * 0.35, 0, r * 0.14, disguised ? '#fff7c2' : '#300');
    // lanterne VERTE
    circle(ctx, r * 0.9, r * 0.9, r * 0.3, disguised ? '#7dff9a' : '#1a3', '#164', 2);
    if (!disguised) {
      // mâchoire allongée
      ctx.fillStyle = '#2b0d06'; ctx.beginPath(); ctx.moveTo(r * 0.4, -r * 0.4); ctx.lineTo(r * 1.5, 0); ctx.lineTo(r * 0.4, r * 0.4); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 4; i++) { ctx.fillStyle = '#f2f2e0'; ctx.fillRect(r * (0.5 + i * 0.22), -r * 0.08, r * 0.08, r * 0.16); }
    }
    ctx.restore();
  },
  invite(ctx, x, y, S, m, t, roster) {
    const as = m.ex?.as && roster?.get(m.ex.as);
    if (as) {
      drawCharacter(ctx, x, y, S, m.a, as.cosmetics, { moving: m.mv, time: t + 0.37 });
      return;
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(m.a);
    shadow(ctx, 0, S * 0.12, S * 0.35);
    ctx.strokeStyle = '#1b1b22'; ctx.lineWidth = S * 0.06; ctx.lineCap = 'round';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, side * S * 0.2); ctx.lineTo(S * 0.55, side * S * 0.5); ctx.lineTo(S * 0.75, side * S * 0.3); ctx.stroke(); }
    circle(ctx, 0, 0, S * 0.3, '#24242e', '#0c0c10', 2);
    circle(ctx, S * 0.16, -S * 0.09, S * 0.05, '#fff'); circle(ctx, S * 0.16, S * 0.09, S * 0.05, '#fff');
    ctx.restore();
  },
};

// Yeux luisants (dessinés PAR-DESSUS l'obscurité : terrifiant, et c'est aussi un indice)
export function drawMonsterEyes(ctx, x, y, S, m, t) {
  const a = m.a, ca = Math.cos(a), sa = Math.sin(a);
  const pair = (fwd, spread, rr, color) => {
    for (const side of [-1, 1]) {
      const ex = x + ca * fwd - sa * side * spread, ey = y + sa * fwd + ca * side * spread;
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(ex, ey, rr, 0, TAU); ctx.fill();
    }
    ctx.shadowBlur = 0;
  };
  switch (m.k) {
    case 'demenageur': pair(S * 0.55, S * 0.12, S * 0.05, '#ffcc33'); break;
    case 'berger': pair(S * 0.15, S * 0.07, S * 0.035, '#ff3b3b'); pair(S * 0.08, S * 0.15, S * 0.03, '#ff3b3b'); break;
    case 'echo': for (let i = 0; i < 5; i++) { ctx.fillStyle = '#ffb3e6'; ctx.beginPath(); ctx.arc(x + Math.cos(a + (i - 2) * 0.5) * S * 0.25, y + Math.sin(a + (i - 2) * 0.5) * S * 0.25, S * 0.02, 0, TAU); ctx.fill(); } break;
    case 'sauveteur': if (!m.ex?.disguised) pair(S * 0.12, S * 0.08, S * 0.04, '#ff2222'); break;
    case 'invite': if (!m.ex?.as) pair(S * 0.16, S * 0.09, S * 0.045, '#ffffff'); break;
    default: break;
  }
}

// ------------------------------------------------------------------ OBJETS
export function drawItem(ctx, x, y, S, type, opts = {}) {
  const def = ITEMS[type] || ITEMS.junk;
  const r = def.radius * S;
  const c = def.color;
  ctx.save(); ctx.translate(x, y);
  if (!opts.noShadow) shadow(ctx, 0, r * 0.4, r * 0.9);
  const dark = shade(c, -50), light = shade(c, 40);
  switch (def.shape) {
    case 'vase':
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-r * 0.3, -r); ctx.quadraticCurveTo(-r * 1.1, 0, -r * 0.5, r); ctx.lineTo(r * 0.5, r); ctx.quadraticCurveTo(r * 1.1, 0, r * 0.3, -r); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, TAU); ctx.stroke(); break;
    case 'lamp':
      ctx.fillStyle = '#6b4d2a'; ctx.fillRect(-r * 0.1, -r * 0.2, r * 0.2, r); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-r * 0.7, 0); ctx.lineTo(r * 0.7, 0); ctx.lineTo(r * 0.4, -r); ctx.lineTo(-r * 0.4, -r); ctx.closePath(); ctx.fill(); break;
    case 'radio':
      ctx.fillStyle = c; ctx.fillRect(-r, -r * 0.6, r * 2, r * 1.2); circle(ctx, -r * 0.4, 0, r * 0.4, dark); ctx.fillStyle = '#e8d8a0'; ctx.fillRect(r * 0.1, -r * 0.3, r * 0.7, r * 0.3); break;
    case 'painting':
      ctx.fillStyle = '#c9a24a'; ctx.fillRect(-r, -r * 0.75, r * 2, r * 1.5); ctx.fillStyle = '#3d5a6c'; ctx.fillRect(-r * 0.8, -r * 0.55, r * 1.6, r * 1.1); circle(ctx, 0, -r * 0.1, r * 0.25, '#e0c0a0'); ctx.fillStyle = '#222'; ctx.fillRect(-r * 0.3, r * 0.15, r * 0.6, r * 0.4); break;
    case 'tv':
      ctx.fillStyle = c; ctx.fillRect(-r, -r * 0.8, r * 2, r * 1.6); ctx.fillStyle = '#1a2a24'; ctx.fillRect(-r * 0.8, -r * 0.6, r * 1.3, r * 1.2); ctx.fillStyle = 'rgba(160,255,200,0.15)'; ctx.fillRect(-r * 0.8, -r * 0.6, r * 1.3, r * 0.3); circle(ctx, r * 0.72, -r * 0.3, r * 0.1, '#888'); break;
    case 'safe':
      ctx.fillStyle = c; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.strokeRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); circle(ctx, 0, 0, r * 0.35, '#aaa', '#333', 2); ctx.fillStyle = '#333'; ctx.fillRect(-r * 0.05, -r * 0.35, r * 0.1, r * 0.3); break;
    case 'flamingo':
      ctx.strokeStyle = c; ctx.lineWidth = r * 0.25; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, r * 0.2); ctx.quadraticCurveTo(r * 0.6, -r * 0.6, r * 0.1, -r); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(-r * 0.2, r * 0.3, r * 0.7, r * 0.45, 0.3, 0, TAU); ctx.fill(); circle(ctx, r * 0.1, -r, r * 0.2, c); ctx.fillStyle = '#222'; ctx.fillRect(r * 0.2, -r * 1.05, r * 0.3, r * 0.1); break;
    case 'clock':
      circle(ctx, 0, 0, r, c, dark, 2); circle(ctx, 0, 0, r * 0.75, '#f6efdc'); ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r * 0.55); ctx.moveTo(0, 0); ctx.lineTo(r * 0.4, r * 0.1); ctx.stroke(); break;
    case 'crate':
      ctx.fillStyle = c; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.strokeRect(-r, -r, r * 2, r * 2); ctx.beginPath(); ctx.moveTo(-r, -r); ctx.lineTo(r, r); ctx.moveTo(r, -r); ctx.lineTo(-r, r); ctx.stroke(); break;
    case 'toolbox':
      ctx.fillStyle = c; ctx.fillRect(-r, -r * 0.5, r * 2, r); ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.5); ctx.lineTo(-r * 0.4, -r * 0.9); ctx.lineTo(r * 0.4, -r * 0.9); ctx.lineTo(r * 0.4, -r * 0.5); ctx.stroke(); break;
    case 'gnome':
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.1); ctx.lineTo(0, -r * 1.2); ctx.lineTo(r * 0.6, -r * 0.1); ctx.closePath(); ctx.fill();
      circle(ctx, 0, 0, r * 0.4, '#f1c9a5'); ctx.fillStyle = type === 'golden_gnome' ? '#fff6b0' : '#eee'; ctx.beginPath(); ctx.moveTo(-r * 0.4, r * 0.1); ctx.lineTo(0, r * 0.9); ctx.lineTo(r * 0.4, r * 0.1); ctx.closePath(); ctx.fill();
      if (type === 'golden_gnome') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, r * 1.3 + Math.sin((opts.time || 0) * 4) * 2, 0, TAU); ctx.stroke(); }
      break;
    case 'bottle':
      ctx.fillStyle = c; ctx.fillRect(-r * 0.45, -r * 0.4, r * 0.9, r * 1.4); ctx.fillRect(-r * 0.18, -r, r * 0.36, r * 0.65); ctx.fillStyle = '#e8dcc0'; ctx.fillRect(-r * 0.45, 0, r * 0.9, r * 0.4); break;
    case 'trophy':
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-r * 0.7, -r); ctx.lineTo(r * 0.7, -r); ctx.quadraticCurveTo(r * 0.6, 0, 0, r * 0.2); ctx.quadraticCurveTo(-r * 0.6, 0, -r * 0.7, -r); ctx.fill(); ctx.fillRect(-r * 0.1, 0, r * 0.2, r * 0.6); ctx.fillRect(-r * 0.5, r * 0.6, r, r * 0.3); break;
    case 'servers':
      ctx.fillStyle = c; ctx.fillRect(-r * 0.8, -r, r * 1.6, r * 2); for (let i = 0; i < 5; i++) { ctx.fillStyle = '#111'; ctx.fillRect(-r * 0.65, -r * 0.85 + i * r * 0.36, r * 1.3, r * 0.22); circle(ctx, r * 0.5, -r * 0.74 + i * r * 0.36, r * 0.05, i % 2 ? '#3f6' : '#f63'); } break;
    case 'jar':
      ctx.fillStyle = 'rgba(160,230,170,0.6)'; ctx.fillRect(-r * 0.7, -r * 0.8, r * 1.4, r * 1.7); ctx.fillStyle = '#556'; ctx.fillRect(-r * 0.75, -r * 1, r * 1.5, r * 0.25);
      circle(ctx, 0, r * 0.1, r * 0.3, '#d0c0a0'); circle(ctx, r * 0.1, 0, r * 0.08, '#222'); break;
    case 'microscope':
      ctx.fillStyle = '#333'; ctx.fillRect(-r * 0.7, r * 0.5, r * 1.4, r * 0.3); ctx.fillStyle = c; ctx.save(); ctx.rotate(-0.4); ctx.fillRect(-r * 0.15, -r, r * 0.3, r * 1.4); ctx.restore(); circle(ctx, -r * 0.45, -r * 0.8, r * 0.18, '#222'); break;
    case 'piano':
      ctx.fillStyle = c; ctx.fillRect(-r * 1.1, -r * 0.7, r * 2.2, r * 1.4); ctx.fillStyle = '#f4f4f4'; ctx.fillRect(-r * 1, r * 0.2, r * 2, r * 0.4);
      for (let i = 0; i < 10; i++) { ctx.fillStyle = '#111'; ctx.fillRect(-r * 0.95 + i * r * 0.2, r * 0.2, r * 0.07, r * 0.25); } break;
    case 'suitcase':
      ctx.fillStyle = c; ctx.fillRect(-r, -r * 0.6, r * 2, r * 1.3); ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.strokeRect(-r * 0.3, -r * 0.85, r * 0.6, r * 0.25); ctx.fillStyle = light; ctx.fillRect(-r * 0.6, -r * 0.6, r * 0.15, r * 1.3); ctx.fillRect(r * 0.45, -r * 0.6, r * 0.15, r * 1.3); break;
    case 'chandelier':
      ctx.strokeStyle = '#c9b46a'; ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); circle(ctx, Math.cos(a) * r, Math.sin(a) * r, r * 0.16, c, '#88a', 1); } circle(ctx, 0, 0, r * 0.25, '#c9b46a'); break;
    case 'duck':
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, r * 0.15, r, r * 0.7, 0, 0, TAU); ctx.fill(); circle(ctx, r * 0.45, -r * 0.45, r * 0.45, c); ctx.fillStyle = '#ff8c1a'; ctx.beginPath(); ctx.moveTo(r * 0.8, -r * 0.5); ctx.lineTo(r * 1.25, -r * 0.35); ctx.lineTo(r * 0.8, -r * 0.25); ctx.fill(); circle(ctx, r * 0.55, -r * 0.6, r * 0.08, '#222');
      ctx.fillStyle = '#222'; ctx.font = `bold ${r * 0.45}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('ISO', -r * 0.1, r * 0.35); break;
    case 'parcel':
      ctx.fillStyle = c; ctx.fillRect(-r, -r * 0.8, r * 2, r * 1.6); ctx.fillStyle = '#c0392b'; ctx.fillRect(-r, -r * 0.1, r * 2, r * 0.2); ctx.fillRect(-r * 0.1, -r * 0.8, r * 0.2, r * 1.6);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${r * 0.4}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('URGENT', 0, -r * 0.3); break;
    case 'decoy':
      circle(ctx, 0, 0, r, opts.flare ? '#ff4d2e' : c, '#114', 2); if (opts.active) { ctx.strokeStyle = opts.flare ? '#ffcc00' : '#7fff7f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * (1.5 + ((opts.time || 0) * 3) % 1.5), 0, TAU); ctx.stroke(); } break;
    default:
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-r, r * 0.3); ctx.lineTo(-r * 0.2, -r); ctx.lineTo(r, -r * 0.2); ctx.lineTo(r * 0.4, r); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
