// Fenêtres : casier/boutique, défis & succès, bestiaire, réglages, aide.
import { COSMETICS } from '../../shared/data/cosmetics.js';
import { MONSTERS } from '../../shared/data/monsters.js';
import { EVENTS, EVENT_CATEGORIES } from '../../shared/data/events.js';
import { ACHIEVEMENTS } from '../../shared/data/progression.js';
import { EQUIPMENT } from '../../shared/data/equipment.js';
import { GAME } from '../../shared/config/game.js';
import { KEY_LABELS, DEFAULT_KEYS } from '../save/settings.js';
import { keyName } from '../input/input.js';
import { drawCharacter, drawMonster } from '../render/sprites.js';
import { esc } from '../game/client-game.js';

const $ = (id) => document.getElementById(id);
const SLOT_NAMES = { suit: 'Combinaisons', mask: 'Masques', hat: 'Couvre-chefs', light: 'Faisceaux', emote: 'Emotes', title: 'Titres' };

export class Modals {
  constructor(app) { this.app = app; }

  open(html, onMount) {
    $('modal-body').innerHTML = html;
    $('modal').hidden = false;
    onMount?.($('modal-body'));
  }
  close() { $('modal').hidden = true; this.app.menu.refresh(); }

  // ------------------------------------------------------------ CASIER
  locker(slot = 'suit') {
    const prof = this.app.profile, d = prof.data;
    const items = COSMETICS[slot];
    const html = `
      <h2>Casier — ${esc(SLOT_NAMES[slot])}</h2>
      <p class="note">Tout est cosmétique : aucun avantage en jeu. Crédits : <b>${d.coins}</b> · Niveau ${prof.level.level}. Aucun achat réel.</p>
      <div class="tabs">${Object.keys(SLOT_NAMES).map((s) => `<button class="btn small ${s === slot ? 'sel' : ''}" data-slot="${s}">${SLOT_NAMES[s]}</button>`).join('')}<button class="btn small" data-slot="equipment">Équipement</button></div>
      <div class="shop-layout">
        <div class="shop-preview"><canvas id="shop-preview" width="200" height="200"></canvas><b>${esc(d.name || 'Vous')}</b></div>
        <div class="shop-grid">${slot === 'equipment' ? this.equipmentCards() : items.map((it) => {
          const owned = prof.owns(slot, it.id);
          const equipped = slot === 'emote' ? d.cosmetics.emotes.includes(it.id) : d.cosmetics[slot] === it.id;
          const lock = it.achievement ? `🏆 ${esc(ACHIEVEMENTS.find((a) => a.id === it.achievement)?.name || 'succès')}` : it.level && prof.level.level < it.level ? `🔒 niveau ${it.level}` : '';
          const btn = owned ? `<button class="btn small" data-equip="${it.id}">${equipped ? (slot === 'emote' ? 'Retirer' : 'Équipé ✔') : 'Équiper'}</button>`
            : lock ? `<span class="note">${lock}</span>` : `<button class="btn small primary" data-buy="${it.id}" ${prof.canBuy(slot, it.id) ? '' : 'disabled'}>${it.price} cr</button>`;
          return `<div class="shop-item ${equipped ? 'equipped' : ''}">${slot === 'emote' ? `<div style="font-size:2.2rem">${it.text}</div>` : slot === 'title' ? `<div style="min-height:40px">« ${esc(it.name)} »</div>` : `<canvas width="80" height="80" data-prev="${it.id}"></canvas>`}<span>${esc(it.name)}</span>${btn}</div>`;
        }).join('')}</div>
      </div>`;
    this.open(html, (root) => {
      const pv = $('shop-preview').getContext('2d');
      drawCharacter(pv, 100, 104, 180, -Math.PI / 2 + 0.4, d.cosmetics, {});
      for (const cv of root.querySelectorAll('[data-prev]')) {
        const ctx = cv.getContext('2d');
        drawCharacter(ctx, 40, 42, 72, -Math.PI / 2 + 0.4, { ...d.cosmetics, [slot]: cv.dataset.prev }, {});
      }
      root.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => this.locker(b.dataset.slot)));
      root.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => { if (prof.buy(slot, b.dataset.buy)) { prof.equip(slot, b.dataset.buy); this.app.audio.play('kaching'); this.syncProfile(); } this.locker(slot); }));
      root.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => { prof.equip(slot, b.dataset.equip); this.syncProfile(); this.locker(slot); }));
      root.querySelectorAll('[data-eqbuy]').forEach((b) => b.addEventListener('click', () => { if (prof.buyEquipment(b.dataset.eqbuy)) this.app.audio.play('kaching'); this.locker('equipment'); }));
    });
  }

  equipmentCards() {
    const prof = this.app.profile;
    return Object.entries(EQUIPMENT).map(([id, e]) => {
      const owned = prof.ownsEquipment(id);
      const btn = owned ? '<span class="note">Possédé ✔</span>' : prof.level.level < e.unlockLevel ? `<span class="note">🔒 niveau ${e.unlockLevel}</span>` : `<button class="btn small primary" data-eqbuy="${id}" ${prof.canBuyEquipment(id) ? '' : 'disabled'}>${e.price} cr</button>`;
      return `<div class="shop-item"><b>${esc(e.name)}</b><small>${esc(e.desc)}</small>${btn}</div>`;
    }).join('');
  }

  syncProfile() {
    const d = this.app.profile.data;
    this.app.transport?.send({ t: 'profile', cosmetics: d.cosmetics, name: d.name, level: this.app.profile.level.level });
  }

  // ------------------------------------------------------------ PROGRESSION
  progress() {
    const prof = this.app.profile, d = prof.data;
    const ch = prof.currentChallenges();
    const html = `
      <h2>Défis, succès & statistiques</h2>
      <div class="help-cols">
        <div>
          <h3>Défis du jour</h3>${ch.filter((c) => c.id.startsWith('day')).map((c) => this.challengeRow(c)).join('')}
          <h3>Défis de la semaine</h3>${ch.filter((c) => c.id.startsWith('week')).map((c) => this.challengeRow(c)).join('')}
          <h3>Statistiques</h3>
          <div class="kv"><span>Missions</span><b>${d.stats.missions}</b><span>Réussites</span><b>${d.stats.wins}</b><span>Crédits gagnés</span><b>${d.stats.earned}</b><span>Réanimations</span><b>${d.stats.revives}</b><span>Morts</span><b>${d.stats.deaths}</b><span>Butin extrait</span><b>${Math.round(d.stats.extractedValue)} cr</b></div>
          <h3>Sauvegarde</h3>
          <p class="note">La progression est enregistrée dans ce navigateur (avec copie de secours). Exportez-la pour la transférer sur un autre appareil.</p>
          <div class="row2"><button class="btn small" id="save-export">Exporter</button><button class="btn small" id="save-import">Importer</button></div>
          <textarea id="save-box" rows="3" style="width:100%;margin-top:6px;background:#111;color:#ddd;border:1px solid #333;border-radius:6px" placeholder="Code de sauvegarde"></textarea>
        </div>
        <div>
          <h3>Succès (${Object.keys(d.achievements).length}/${ACHIEVEMENTS.length})</h3>
          ${ACHIEVEMENTS.map((a) => { const got = d.achievements[a.id]; return `<div class="ach ${got ? '' : 'locked'}">${got ? '🏆' : '🔒'} <div><b>${esc(a.secret && !got ? '???' : a.name)}</b><br><small>${esc(a.secret && !got ? 'Succès secret.' : a.desc)}</small></div></div>`; }).join('')}
        </div>
      </div>`;
    this.open(html, () => {
      $('save-export').onclick = () => { $('save-box').value = prof.export(); $('save-box').select(); };
      $('save-import').onclick = () => { try { prof.import($('save-box').value); this.app.toast('Sauvegarde importée.'); this.progress(); } catch (e) { this.app.toast('Code de sauvegarde invalide.'); } };
    });
  }

  challengeRow(c) {
    return `<div class="challenge ${c.claimed ? 'done' : ''}"><span>${c.claimed ? '✔' : '○'} ${esc(c.text)}</span><span>${c.inverse ? '' : `${Math.min(c.progress, c.target)}/${c.target} · `}+${c.reward} cr</span></div>`;
  }

  // ------------------------------------------------------------ BESTIAIRE
  bestiary() {
    const seen = this.app.profile.data.bestiary;
    const html = `
      <h2>Bestiaire</h2>
      <p class="note">Chaque créature obéit à des règles. Les joueurs attentifs les découvrent par leurs indices sonores et visuels. Les fiches se complètent quand vous les croisez.</p>
      <div class="bestiary">${Object.entries(MONSTERS).map(([id, m]) => {
        const known = seen[id];
        return `<div class="beast ${known ? '' : 'unknown'}"><canvas width="220" height="120" data-beast="${id}"></canvas><h3>${known ? esc(m.name) : '???'}</h3><b>${known ? esc(m.title) : 'Jamais croisée'}</b>${known ? `<p class="note">${esc(m.lore)}</p><ul>${m.clues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : `<p class="note">${esc(m.clues[0])}</p>`}</div>`;
      }).join('')}</div>
      <h2>Événements possibles (${EVENTS.length})</h2>
      <div class="kv">${EVENTS.map((e) => `<span><b style="color:${EVENT_CATEGORIES[e.category].color}">${esc(e.name)}</b> — ${esc(e.desc)}</span><small>${EVENT_CATEGORIES[e.category].name}</small>`).join('')}</div>`;
    this.open(html, (root) => {
      let t = 0;
      const draw = () => {
        if ($('modal').hidden || !root.querySelector('[data-beast]')) return;
        t += 0.03;
        for (const cv of root.querySelectorAll('[data-beast]')) {
          const ctx = cv.getContext('2d');
          ctx.fillStyle = '#07080a'; ctx.fillRect(0, 0, 220, 120);
          const id = cv.dataset.beast;
          ctx.save();
          if (!seen[id]) { ctx.filter = 'brightness(0)'; }
          drawMonster(ctx, 110, 62, 60, { k: id, a: Math.PI / 2 + Math.sin(t) * 0.3, s: 'roam', mv: 1, ex: { disguised: 1, lantern: 1, creak: Math.floor(t) } }, t);
          ctx.restore();
        }
        requestAnimationFrame(draw);
      };
      draw();
    });
  }

  // ------------------------------------------------------------ RÉGLAGES
  settings() {
    const s = this.app.settings;
    const v = this.app.voice;
    const range = (id, label, val, min = 0, max = 1, step = 0.05) => `<label class="field"><span>${label} <b id="${id}-v">${Math.round(val * 100)}%</b></span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></label>`;
    const html = `
      <h2>Réglages</h2>
      <div class="help-cols">
        <div>
          <h3>Audio</h3>
          ${range('st-master', 'Volume général', s.master)}${range('st-sfx', 'Effets', s.sfx)}${range('st-voice', 'Voix des joueurs', s.voice)}${range('st-music', 'Ambiance', s.music)}${range('st-bots', 'Voix des bots (synthèse vocale)', s.botVoices)}
          <h3>Chat vocal</h3>
          <label class="field"><span>Mode</span><select id="st-vmode"><option value="ptt">Appuyer pour parler</option><option value="open">Micro ouvert (détection de voix)</option><option value="off">Vocal coupé (je n'entends ni ne parle)</option></select></label>
          ${range('st-vad', 'Seuil de détection (micro ouvert)', s.vadThreshold, 0.01, 0.3, 0.01)}
          <div class="row2"><button class="btn small" id="st-mic">${v.micOn ? 'Couper le micro' : 'Activer le micro'}</button><span class="note" id="st-mic-level">Niveau : —</span></div>
          <p class="note">${v.secure ? '' : '⚠ Page non sécurisée : le micro est bloqué par le navigateur. Utilisez HTTPS (npm run start:https) ou localhost. '}Confidentialité : votre voix n'est envoyée qu'aux joueurs de votre salon (pair-à-pair), jamais enregistrée. Vous pouvez couper la voix de chaque joueur depuis le salon.</p>
          <label class="check"><input type="checkbox" id="st-mutenew"> Couper par défaut la voix des nouveaux joueurs</label>
        </div>
        <div>
          <h3>Affichage</h3>
          <label class="field"><span>Qualité graphique</span><select id="st-gfx"><option value="auto">Automatique (s'adapte à l'appareil)</option><option value="low">Basse (téléphones modestes)</option><option value="medium">Moyenne</option><option value="high">Haute</option></select></label>
          <label class="field"><span>Contrôles tactiles</span><select id="st-touch"><option value="auto">Automatique</option><option value="on">Toujours</option><option value="off">Jamais</option></select></label>
          <label class="check"><input type="checkbox" id="st-rings"> Indicateurs visuels des sons (accessibilité)</label>
          <label class="check"><input type="checkbox" id="st-shake"> Tremblements d'écran</label>
          <label class="check"><input type="checkbox" id="st-fps"> Afficher les images/seconde</label>
          <h3>Touches (clavier)</h3>
          <div id="st-keys">${Object.keys(KEY_LABELS).map((a) => `<div class="bindrow"><span>${esc(KEY_LABELS[a])}</span><button class="btn small" data-bind="${a}">${(s.keys[a] || []).map(keyName).join(' / ') || '—'}</button></div>`).join('')}</div>
          <button class="btn small" id="st-keys-reset">Touches par défaut</button>
          <p class="note">Manette : stick gauche = bouger, stick droit = viser, A = action, X = lancer, Y = objet, B = lampe, RB = parler, LB = radio, gâchettes = courir.</p>
        </div>
      </div>
      <p class="note">${esc(GAME.name)} v${GAME.version}</p>`;
    this.open(html, (root) => {
      const bindRange = (id, key, scale = 1) => {
        const el = $(id);
        el.addEventListener('input', () => { s[key] = Number(el.value) * scale; $(`${id}-v`).textContent = `${Math.round(Number(el.value) * 100)}%`; this.app.saveSettings(); });
      };
      bindRange('st-master', 'master'); bindRange('st-sfx', 'sfx'); bindRange('st-voice', 'voice'); bindRange('st-music', 'music'); bindRange('st-bots', 'botVoices'); bindRange('st-vad', 'vadThreshold');
      const sel = (id, key) => { const el = $(id); el.value = s[key]; el.addEventListener('change', () => { s[key] = el.value; this.app.saveSettings(); }); };
      sel('st-vmode', 'voiceMode'); sel('st-gfx', 'graphics'); sel('st-touch', 'touchControls');
      const chk = (id, key) => { const el = $(id); el.checked = !!s[key]; el.addEventListener('change', () => { s[key] = el.checked; this.app.saveSettings(); }); };
      chk('st-rings', 'visualSounds'); chk('st-shake', 'screenShake'); chk('st-fps', 'showFps'); chk('st-mutenew', 'autoMuteStrangers');
      $('st-mic').onclick = async () => {
        if (v.micOn) v.stop(); else { await v.start(true); if (v.error) this.app.toast(v.error); }
        this.settings();
      };
      const meter = () => { if ($('modal').hidden || !$('st-mic-level')) return; $('st-mic-level').textContent = v.micOn ? `Niveau : ${'▮'.repeat(Math.round(v.level * 10))}${'▯'.repeat(10 - Math.round(v.level * 10))}` : 'Micro inactif'; requestAnimationFrame(meter); };
      meter();
      root.querySelectorAll('[data-bind]').forEach((b) => b.addEventListener('click', () => {
        b.textContent = 'Appuyez sur une touche…';
        const onKey = (e) => {
          e.preventDefault(); e.stopPropagation();
          window.removeEventListener('keydown', onKey, true);
          if (e.code !== 'Escape') {
            for (const a of Object.keys(s.keys)) s.keys[a] = s.keys[a].filter((c) => c !== e.code);
            s.keys[b.dataset.bind] = [e.code];
            this.app.saveSettings();
          }
          this.settings();
        };
        window.addEventListener('keydown', onKey, true);
      }));
      $('st-keys-reset').onclick = () => { s.keys = structuredClone(DEFAULT_KEYS); this.app.saveSettings(); this.settings(); };
    });
  }

  // ------------------------------------------------------------ AIDE
  help() {
    const k = (a) => `<kbd>${(this.app.settings.keys[a] || []).map(keyName).join(' / ')}</kbd>`;
    const html = `
      <h2>Comment jouer</h2>
      <div class="help-cols">
        <div>
          <h3>Le principe</h3>
          <p>Vous êtes employés de ${esc(GAME.company)}. Entrez, récupérez des objets de valeur, ramenez-les au <b>fourgon</b> (zone jaune). Une fois le <b>quota</b> atteint, tirez le <b>levier</b> : le fourgon part 12 s plus tard. Ceux qui ne sont pas dedans restent sur place…</p>
          <p>Tout fait du bruit : vos pas (surtout en courant, sur le verre ou les grilles), les portes, les objets qui tombent, <b>votre voix</b>. Les créatures entendent. Certaines voient. Chacune a ses règles : observez les indices (bestiaire).</p>
          <p>Les objets fragiles perdent de la valeur à chaque choc. Les objets lourds ralentissent : portez-les à deux. À terre ? Un coéquipier peut vous relever. Mort ? Vous devenez un fantôme.</p>
          <p>Des <b>événements</b> imprévus bouleversent la mission (black-out, gravité détraquée, faux fourgon…). Plus vous restez, plus ça dégénère. Mais la prime au-delà du quota est tentante.</p>
        </div>
        <div>
          <h3>PC</h3>
          <div class="kv">
            <span>Se déplacer</span>${k('up')}${''}<span>Viser / lampe</span><kbd>Souris</kbd>
            <span>Courir / Discret</span><span>${k('sprint')} ${k('sneak')}</span>
            <span>Action contextuelle</span><span>${k('interact')} ou <kbd>clic droit</kbd></span>
            <span>Lancer l'objet</span><span>${k('throw')} ou <kbd>clic gauche</kbd></span>
            <span>Équipement</span>${k('utility')}<span>Lampe</span>${k('light')}
            <span>Parler (maintenir)</span>${k('talk')}<span>Talkie-walkie (maintenir)</span>${k('radio')}
            <span>Chat écrit</span>${k('chat')}<span>Emotes</span><kbd>1 2 3 4</kbd><span>Pause</span>${k('pause')}
          </div>
          <h3>Mobile</h3>
          <p>Joystick à gauche (il apparaît sous votre pouce, poussez à fond pour courir). Faites glisser à droite pour orienter la lampe. Boutons : ✋ action, 🫴 lancer, 🎙 parler (maintenir), 📻 radio. Jouez en paysage.</p>
          <h3>Astuces</h3>
          <ul><li>« CONTRÔLE ! » = ne bougez plus.</li><li>Gardez la Mannequine dans votre faisceau.</li><li>Une lanterne verte n'annonce rien de bon.</li><li>Un collègue sans lampe torche n'est peut-être pas un collègue.</li><li>Les murs fissurés cachent quelque chose. Quelque chose de lourd peut les ouvrir.</li></ul>
        </div>
      </div>`;
    this.open(html);
  }
}
