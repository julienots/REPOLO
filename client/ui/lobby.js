// Écran du salon : équipe, réglages de mission (hôte), équipement, prêt, chat, micro.
import { MISSIONS, DIFFICULTIES, VARIANTS } from '../../shared/data/missions.js';
import { EQUIPMENT } from '../../shared/data/equipment.js';
import { BOT_PROFILES } from '../../shared/data/bots.js';
import { THEMES } from '../../shared/data/themes.js';
import { LIMITS } from '../../shared/config/game.js';
import { drawCharacter } from '../render/sprites.js';
import { esc } from '../game/client-game.js';

const $ = (id) => document.getElementById(id);

export class LobbyUI {
  constructor(app) {
    this.app = app;
    this.state = null;
    const send = (patch) => app.transport?.send({ t: 'settings', ...patch });
    $('set-mission').addEventListener('change', (e) => send({ mission: e.target.value }));
    $('set-difficulty').addEventListener('change', (e) => send({ difficulty: e.target.value }));
    $('set-variant').addEventListener('change', (e) => send({ variant: e.target.value }));
    $('set-teamsize').addEventListener('change', (e) => send({ teamSize: Number(e.target.value) }));
    $('set-maxplayers').addEventListener('change', (e) => send({ maxPlayers: Number(e.target.value) }));
    $('set-fillbots').addEventListener('change', (e) => send({ fillBots: e.target.checked }));
    $('set-locked').addEventListener('change', (e) => send({ locked: e.target.checked }));
    $('lobby-chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const i = $('lobby-chat-input');
      if (i.value.trim()) app.transport?.send({ t: 'chat', text: i.value.trim() });
      i.value = '';
    });
    $('lobby-members').addEventListener('click', (e) => {
      const k = e.target.closest('[data-kick]');
      if (k && confirm('Exclure ce joueur du salon ?')) app.transport?.send({ t: 'kick', id: k.dataset.kick });
      const mu = e.target.closest('[data-mute]');
      if (mu) { const id = mu.dataset.mute; app.settings.mutedPeers[id] = !app.settings.mutedPeers[id]; app.saveSettings(); this.render(this.state); }
    });
    $('bot-controls').addEventListener('click', (e) => {
      const rm = e.target.closest('[data-rmbot]');
      if (rm) { const bots = this.state.settings.bots.slice(); bots.splice(Number(rm.dataset.rmbot), 1); send({ bots }); }
    });
    $('bot-controls').addEventListener('change', (e) => {
      if (e.target.id === 'add-bot' && e.target.value) { send({ bots: [...this.state.settings.bots, e.target.value] }); e.target.value = ''; }
    });
    $('loadout').addEventListener('click', (e) => {
      const c = e.target.closest('[data-eq]');
      if (!c) return;
      const id = c.dataset.eq;
      const prof = app.profile;
      if (!prof.ownsEquipment(id)) {
        if (prof.canBuyEquipment(id) && confirm(`Acheter « ${EQUIPMENT[id].name} » pour ${EQUIPMENT[id].price} crédits ?`)) { prof.buyEquipment(id); }
        else if (!prof.canBuyEquipment(id)) { app.toast(prof.level.level < EQUIPMENT[id].unlockLevel ? `Niveau ${EQUIPMENT[id].unlockLevel} requis.` : 'Pas assez de crédits.'); return; }
        else return;
      }
      prof.data.equipment = id; prof.save();
      app.transport?.send({ t: 'profile', equipment: id });
      this.renderLoadout();
    });
  }

  render(st) {
    if (!st) return;
    this.state = st;
    const app = this.app;
    const me = st.members.find((m) => m.id === app.myId);
    const host = !!me?.isHost;
    const local = st.local;
    $('lobby-code').textContent = local ? 'SOLO' : st.code;
    $('lobby-mode').textContent = local ? 'Partie solo (hors ligne)' : 'Code d\'invitation';
    $('btn-copy-code').hidden = local;
    $('lock-row').hidden = local;
    $('set-maxplayers').closest('.field').hidden = local;
    $('btn-voice').textContent = app.voice.active ? (app.voice.micOn ? '🎙 Micro activé' : '🎧 Écoute seule') : (local ? '🎙 Micro (les monstres vous entendront)' : '🎙 Activer le vocal');
    $('btn-voice').classList.toggle('on', app.voice.active);

    // membres
    const humans = st.members.length;
    $('lobby-count').textContent = `${humans} humain(s) · équipe de ${Math.max(st.settings.teamSize, humans + st.settings.bots.length)}`;
    $('lobby-members').innerHTML = st.members.map((m) => `
      <li class="member">
        <canvas width="108" height="108" data-avatar="${m.id}"></canvas>
        <div class="who"><b>${m.isHost ? '👑 ' : ''}${esc(m.name)}${m.id === app.myId ? ' (vous)' : ''}</b>
          <small>Niv. ${m.level} · ${m.platform === 'mobile' ? '📱' : '💻'} · ${esc(EQUIPMENT[m.equipment]?.name || '')} ${m.voice ? '· 🎙' : ''}</small></div>
        ${!m.connected ? '<span class="tag off">déconnecté</span>' : m.isHost ? '<span class="tag ready">hôte</span>' : m.ready ? '<span class="tag ready">prêt</span>' : '<span class="tag wait">pas prêt</span>'}
        ${m.id !== app.myId && m.voice ? `<button class="kick" data-mute="${m.id}" title="Couper sa voix (pour vous)">${app.settings.mutedPeers[m.id] ? '🔇' : '🔊'}</button>` : ''}
        ${host && m.id !== app.myId ? `<button class="kick" data-kick="${m.id}" title="Exclure">✕</button>` : ''}
      </li>`).join('') + st.settings.bots.map((b) => `
      <li class="member"><canvas width="108" height="108" data-botavatar="${b}"></canvas><div class="who"><b>🤖 ${esc(BOT_PROFILES[b]?.name || b)}</b><small>Bot</small></div><span class="tag">bot</span></li>`).join('');
    for (const cv of document.querySelectorAll('[data-avatar]')) {
      const m = st.members.find((x) => x.id === cv.dataset.avatar);
      const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, 108, 108);
      drawCharacter(ctx, 54, 58, 100, -Math.PI / 2 + 0.5, m?.cosmetics || {}, {});
    }
    for (const cv of document.querySelectorAll('[data-botavatar]')) {
      const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, 108, 108);
      const prof = BOT_PROFILES[cv.dataset.botavatar];
      drawCharacter(ctx, 54, 58, 100, -Math.PI / 2 + 0.5, { suit: 'blue', mask: 'goggles', hat: 'helmet' }, {});
      if (prof) { ctx.fillStyle = prof.suit; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(54, 58, 30, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    }
    // bots
    const bc = $('bot-controls');
    if (host) {
      bc.innerHTML = `${st.settings.bots.map((b, i) => `<button class="btn small" data-rmbot="${i}">🤖 ${esc(BOT_PROFILES[b]?.name || b)} ✕</button>`).join('')}
        <select id="add-bot"><option value="">+ Ajouter un bot…</option>${Object.entries(BOT_PROFILES).map(([id, p]) => `<option value="${id}">${esc(p.name)}</option>`).join('')}</select>`;
    } else bc.innerHTML = '';

    // réglages
    const lvl = app.profile.level.level;
    const s = st.settings;
    fillSelect($('set-mission'), Object.entries(MISSIONS).map(([id, m]) => ({ v: id, t: `${m.name}${lvl < m.unlockLevel && host ? ` (niv. ${m.unlockLevel})` : ''}`, dis: host && lvl < m.unlockLevel })), s.mission);
    fillSelect($('set-difficulty'), Object.entries(DIFFICULTIES).map(([id, d]) => ({ v: id, t: `${d.name}${host && d.level >= 3 && lvl < 3 ? ' (niv. 3)' : ''}`, dis: host && d.level >= 3 && lvl < 3 })), s.difficulty);
    fillSelect($('set-variant'), [{ v: 'random', t: 'Surprise (aléatoire)' }, ...VARIANTS.map((v) => ({ v: v.id, t: v.name }))], s.variant);
    fillSelect($('set-teamsize'), Array.from({ length: LIMITS.absoluteMaxPlayers }, (_, i) => ({ v: String(i + 1), t: `${i + 1}` })), String(s.teamSize));
    fillSelect($('set-maxplayers'), Array.from({ length: LIMITS.absoluteMaxPlayers }, (_, i) => ({ v: String(i + 1), t: `${i + 1}` })), String(s.maxPlayers));
    $('set-fillbots').checked = s.fillBots;
    $('set-locked').checked = s.locked;
    for (const id of ['set-mission', 'set-difficulty', 'set-variant', 'set-teamsize', 'set-maxplayers', 'set-fillbots', 'set-locked']) $(id).disabled = !host;
    const mission = MISSIONS[s.mission];
    $('mission-brief').textContent = `${THEMES[mission.theme]?.blurb || ''} ${mission.brief}`;
    $('difficulty-desc').textContent = DIFFICULTIES[s.difficulty]?.desc || '';
    $('settings-note').textContent = host ? (s.fillBots ? 'Les places libres seront occupées par des bots.' : '') : 'Seul l\'hôte peut modifier la mission.';

    // boutons
    const ready = $('btn-ready');
    ready.hidden = host;
    ready.textContent = me?.ready ? '✖ Finalement, pas prêt' : '✔ Je suis prêt';
    ready.classList.toggle('on', !!me?.ready);
    const start = $('btn-start');
    start.hidden = !host;
    const notReady = st.members.filter((m) => !m.isHost && !m.ready && m.connected);
    start.textContent = notReady.length ? `🚐 Lancer (en attente : ${notReady.length})` : '🚐 Lancer la mission';
    // chat
    const log = $('lobby-chat-log');
    log.innerHTML = st.chat.map((c) => `<li class="${c.from ? '' : 'sys'}">${c.from ? `<b>${esc(c.name)}</b> : ` : ''}${esc(c.text)}</li>`).join('');
    log.scrollTop = log.scrollHeight;
    this.renderLoadout();
  }

  renderLoadout() {
    const prof = this.app.profile;
    const sel = prof.data.equipment;
    $('loadout').innerHTML = Object.entries(EQUIPMENT).map(([id, e]) => {
      const owned = prof.ownsEquipment(id);
      const lockedLvl = prof.level.level < e.unlockLevel;
      const extra = owned ? '' : lockedLvl ? ` 🔒 niv. ${e.unlockLevel}` : ` · ${e.price} cr`;
      return `<button class="equip-card ${id === sel ? 'sel' : ''} ${!owned && lockedLvl ? 'locked' : ''}" data-eq="${id}"><b>${esc(e.name)}${extra}</b><small>${esc(e.desc)}</small></button>`;
    }).join('');
  }

  chat(m) {
    if (!this.state) return;
    this.state.chat.push({ from: m.from, name: m.name, text: m.text });
    const log = $('lobby-chat-log');
    const li = document.createElement('li');
    li.innerHTML = `<b>${esc(m.name)}</b> : ${esc(m.text)}`;
    log.append(li); log.scrollTop = log.scrollHeight;
  }

  toggleReady() {
    const me = this.state?.members.find((m) => m.id === this.app.myId);
    this.app.transport?.send({ t: 'ready', v: !me?.ready });
  }

  start() {
    const st = this.state;
    const notReady = st.members.filter((m) => !m.isHost && !m.ready && m.connected);
    const force = notReady.length ? confirm(`Certains joueurs ne sont pas prêts (${notReady.map((m) => m.name).join(', ')}). Lancer quand même ?`) : false;
    if (notReady.length && !force) return;
    this.app.audio.unlock();
    this.app.transport?.send({ t: 'start', force });
  }

  async toggleVoice() {
    const v = this.app.voice;
    if (v.active) { v.stop(); this.app.settings.voiceEnabled = false; }
    else {
      if (!v.supported) { this.app.toast('Votre navigateur ne gère pas le vocal (WebRTC).'); }
      const mic = await v.start(true);
      if (v.error) this.app.toast(v.error);
      else if (mic) this.app.toast(this.state?.local ? 'Micro activé : les créatures entendent vos cris (appuyez sur la touche Parler).' : 'Vocal activé. Maintenez la touche Parler (ou passez en micro ouvert dans les réglages).');
      this.app.settings.voiceEnabled = true;
    }
    this.app.saveSettings();
    this.render(this.state);
  }

  copyInvite() {
    const url = `${this.app.base || location.origin}/?join=${this.state.code}`;
    const text = `Rejoins ma mission sur Opération Panique ! Code : ${this.state.code} — ${url}`;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) navigator.share({ title: 'Opération Panique', text, url }).catch(() => {});
    else navigator.clipboard?.writeText(`${text}`).then(() => this.app.toast('Lien d\'invitation copié !'), () => this.app.toast(`Code : ${this.state.code}`));
  }
}

function fillSelect(sel, options, value) {
  const html = options.map((o) => `<option value="${o.v}" ${o.dis ? 'disabled' : ''}>${esc(o.t)}</option>`).join('');
  if (sel.dataset.html !== html) { sel.innerHTML = html; sel.dataset.html = html; }
  sel.value = value;
}
