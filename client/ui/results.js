// Écran de fin de mission : bilan, paie, distinctions, moments forts avec mini-replays.
import { MONSTERS } from '../../shared/data/monsters.js';
import { cosmeticById } from '../../shared/data/cosmetics.js';
import { BOT_PROFILES } from '../../shared/data/bots.js';
import { esc } from '../game/client-game.js';

const $ = (id) => document.getElementById(id);
const REASONS = { departure: 'Le fourgon est parti.', wipe: 'Toute l\'équipe est hors de combat.', abandon: 'Mission abandonnée.', crash: 'La mission s\'est interrompue (erreur).' };

export class ResultsUI {
  constructor(app) {
    this.app = app;
    this.anim = null;
    $('res-highlights').addEventListener('click', (e) => {
      const li = e.target.closest('[data-replay]');
      if (li) { for (const x of $('res-highlights').children) x.classList.remove('sel'); li.classList.add('sel'); this.playReplay(Number(li.dataset.replay)); }
    });
  }

  render(r, summary) {
    this.r = r;
    if (!r) { $('res-title').textContent = 'MISSION INTERROMPUE'; return; }
    const title = $('res-title');
    title.textContent = r.success ? 'MISSION RÉUSSIE' : 'MISSION ÉCHOUÉE';
    title.className = r.success ? 'ok' : 'fail';
    $('res-sub').textContent = `${r.missionName} · ${r.variant} · ${REASONS[r.reason] || ''}`;
    const me = r.players.find((p) => p.id === this.app.myId);
    $('res-summary').innerHTML = [
      [`${r.deposited} / ${r.quota}`, 'Butin chargé / quota'],
      [`${r.bonus} cr`, 'Bonus (objectifs, contrôles)'],
      [`${r.players.filter((p) => p.survived).length} / ${r.players.length}`, 'Survivants'],
      [`${Math.floor(r.time / 60)} min ${r.time % 60} s`, 'Durée'],
      [`${r.eventsSeen.length}`, 'Événements subis'],
      [r.monstersSeen.map((m) => MONSTERS[m]?.name.replace(/^L[ae]s? |^L'/, '')).join(', ') || '—', 'Créatures'],
    ].map(([b, s]) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');
    $('res-side').innerHTML = r.side.map((o) => `<li class="${o.done ? 'done' : 'not'}">${o.done ? '✔' : '✖'} ${esc(o.name)} (+${o.reward} cr)</li>`).join('');
    if (me && summary) {
      const lv = summary.levelAfter > summary.levelBefore ? `<div>🎉 Niveau ${summary.levelAfter} atteint !</div>` : '';
      $('res-pay').innerHTML = `<div class="big">+${summary.coins} cr</div><div>+${summary.xp} XP ${me.survived ? '' : '(prime de décès incluse)'}</div>${lv}
        ${summary.completed.map((c) => `<div>✔ Défi : ${esc(c.text)} (+${c.reward} cr)</div>`).join('')}
        ${summary.unlocked.map((a) => `<div>🏆 Succès : <b>${esc(a.name)}</b> — ${esc(a.desc)}</div>`).join('')}
        ${summary.saved === false ? '<div style="color:#f88">⚠ Sauvegarde impossible (stockage du navigateur bloqué).</div>' : ''}`;
    } else $('res-pay').innerHTML = '<div>—</div>';
    $('res-awards').innerHTML = r.awards.length ? r.awards.map((a) => `<div class="award"><b>${esc(a.name)}</b><span>${esc(a.desc)}</span><i>${esc(a.playerName)}${a.value ? ' · ' + esc(a.value) : ''}</i></div>`).join('') : '<p class="note">Une mission bien trop calme pour mériter des distinctions.</p>';
    $('res-players').innerHTML = r.players.map((p) => {
      const st = { extracted: '🚐 extrait', dead: '💀 mort', left: '✖ abandonné', alive: 'vivant', downed: 'à terre' }[p.state] || p.state;
      const cause = p.stats.deathCause ? ` — <i>${esc(p.stats.deathCause)}</i>` : '';
      return `<li><b style="color:${cosmeticById('suit', p.cosmetics?.suit)?.color || '#fff'}">${esc(p.name)}</b>${p.bot ? ` (${esc(BOT_PROFILES[p.botProfile]?.name || 'bot')})` : ''} : ${st}${cause}<br><small>${Math.round(p.stats.deposited)} cr chargés · ${p.stats.revives} réa · bruit ${Math.round(p.stats.noise)}</small></li>`;
    }).join('');
    $('res-highlights').innerHTML = r.highlights.length ? r.highlights.map((h) => `<li ${h.replay !== undefined ? `class="has-replay" data-replay="${h.replay}"` : ''}>[${Math.floor(h.t / 60)}:${String(h.t % 60).padStart(2, '0')}] ${esc(h.text)}</li>`).join('') : '<li class="not">Aucun moment marquant.</li>';
    const host = this.app.isHost() || this.app.transport?.kind === 'local';
    $('btn-back-lobby').textContent = host ? '↺ Retour au salon' : '↺ Retour au salon (attendre l\'hôte)';
    this.drawStatic();
    if (r.replays.length) this.playReplay(0);
  }

  drawStatic() {
    const r = this.r, cv = $('replay-canvas'), ctx = cv.getContext('2d');
    const k = Math.min(cv.width / r.map.w, cv.height / r.map.h);
    ctx.fillStyle = '#07080a'; ctx.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < r.map.tiles.length; i++) {
      const t = r.map.tiles.charCodeAt(i) - 48;
      if (t === 1 || t === 3) continue;
      ctx.fillStyle = t === 5 || t === 6 ? '#3a3226' : '#24272c';
      ctx.fillRect((i % r.map.w) * k, Math.floor(i / r.map.w) * k, k, k);
    }
    this.k = k;
    this.bg = ctx.getImageData(0, 0, cv.width, cv.height);
  }

  playReplay(idx) {
    cancelAnimationFrame(this.anim);
    const rep = this.r.replays[idx];
    if (!rep || !rep.frames.length) return;
    const cv = $('replay-canvas'), ctx = cv.getContext('2d'), k = this.k;
    const colors = new Map(this.r.players.map((p) => [p.id, cosmeticById('suit', p.cosmetics?.suit)?.color || '#fff']));
    let f = 0, last = 0;
    const step = (now) => {
      if (now - last > 250) {
        last = now;
        ctx.putImageData(this.bg, 0, 0);
        const fr = rep.frames[f];
        for (const [type, x, y] of fr.m) { ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(x * k, y * k, k * 0.9, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `${Math.max(8, k * 1.4)}px sans-serif`; ctx.fillText((MONSTERS[type]?.name || '?').replace(/^L[ae]s? |^L'/, '')[0], x * k + k, y * k); }
        for (const [id, x, y, st] of fr.p) { ctx.fillStyle = st === 'd' ? '#777' : colors.get(id) || '#fff'; ctx.beginPath(); ctx.arc(x * k, y * k, k * 0.7, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#ffd166'; ctx.font = '11px sans-serif'; ctx.fillText(rep.text.slice(0, 48), 6, cv.height - 8);
        if (rep.x !== undefined) { ctx.strokeStyle = '#ffd166'; ctx.beginPath(); ctx.arc(rep.x * k, rep.y * k, k * 3, 0, 7); ctx.stroke(); }
        f = (f + 1) % rep.frames.length;
        if (f === 0) last = now + 800;
      }
      this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }
}
