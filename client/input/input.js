// Entrées unifiées : clavier (touches configurables, codes physiques → ZQSD/WASD automatiques),
// souris (visée), manette (API Gamepad) et tactile (joystick virtuel + boutons + visée au doigt).
export class Input {
  constructor(settings, canvas) {
    this.settings = settings;
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = [];          // actions déclenchées (front montant) à consommer
    this.released = [];
    this.mouse = { x: 0, y: 0, inside: false, moved: false };
    this.touchMove = { x: 0, y: 0, active: false };
    this.touchAim = { angle: null, active: false };
    this.touchHeld = new Set();
    this.toggles = { sprint: false, sneak: false };
    this.enabled = false;       // désactivé hors partie
    this.chatOpen = false;
    this.gamepadIndex = null;
    this.gpPrev = {};
    this.lastDevice = 'keyboard';
    this.bind();
  }

  actionOf(code) {
    for (const [action, codes] of Object.entries(this.settings.keys)) if (codes.includes(code)) return action;
    return null;
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || this.chatOpen) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const a = this.actionOf(e.code);
      if (!a) return;
      e.preventDefault();
      this.lastDevice = 'keyboard';
      if (!this.down.has(a)) this.pressed.push(a);
      this.down.add(a);
    });
    window.addEventListener('keyup', (e) => {
      const a = this.actionOf(e.code);
      if (!a) return;
      if (this.down.has(a)) this.released.push(a);
      this.down.delete(a);
    });
    window.addEventListener('blur', () => { for (const a of this.down) this.released.push(a); this.down.clear(); });
    this.canvas.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true; this.mouse.moved = true; this.lastDevice = 'keyboard'; });
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) this.pressed.push('throw');
      if (e.button === 2) this.pressed.push('interact');
    });
    this.canvas.addEventListener('mouseup', (e) => { if (e.button === 2) this.released.push('interact'); });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('gamepadconnected', (e) => { this.gamepadIndex = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { this.gamepadIndex = null; });
  }

  // ---------------------------------------------------------- tactile
  setupTouch(root) {
    const zone = root.querySelector('#joy-zone');
    const base = root.querySelector('#joy-base');
    const knob = root.querySelector('#joy-knob');
    const aim = root.querySelector('#aim-zone');
    let joyId = null, cx = 0, cy = 0, aimId = null, aimStart = null;
    const R = 50;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      joyId = e.pointerId; zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      // le joystick apparaît sous le pouce
      base.style.left = `${e.clientX - r.left - 60}px`; base.style.top = `${e.clientY - r.top - 60}px`; base.style.bottom = 'auto';
      cx = e.clientX; cy = e.clientY;
      this.touchMove.active = true; this.lastDevice = 'touch';
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyId) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.touchMove.x = dx / R; this.touchMove.y = dy / R;
      // pousser le joystick à fond = courir (si le bouton n'est pas utilisé)
      this.touchMove.full = d > R * 1.25;
    });
    const endJoy = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null; knob.style.transform = '';
      this.touchMove = { x: 0, y: 0, active: false };
    };
    zone.addEventListener('pointerup', endJoy); zone.addEventListener('pointercancel', endJoy);
    aim.addEventListener('pointerdown', (e) => { aimId = e.pointerId; aim.setPointerCapture(e.pointerId); aimStart = { x: e.clientX, y: e.clientY }; this.touchAim.active = true; });
    aim.addEventListener('pointermove', (e) => {
      if (e.pointerId !== aimId) return;
      const dx = e.clientX - aimStart.x, dy = e.clientY - aimStart.y;
      if (Math.hypot(dx, dy) > 12) this.touchAim.angle = Math.atan2(dy, dx);
    });
    const endAim = (e) => { if (e.pointerId === aimId) { aimId = null; this.touchAim.active = false; } };
    aim.addEventListener('pointerup', endAim); aim.addEventListener('pointercancel', endAim);

    for (const btn of root.querySelectorAll('[data-touch]')) {
      const a = btn.dataset.touch;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        btn.setPointerCapture?.(e.pointerId);
        this.lastDevice = 'touch';
        if (a === 'sprint' || a === 'sneak') {
          this.toggles[a] = !this.toggles[a];
          if (a === 'sprint' && this.toggles.sprint) this.toggles.sneak = false;
          if (a === 'sneak' && this.toggles.sneak) this.toggles.sprint = false;
          root.querySelector('.tb-sprint').classList.toggle('on', this.toggles.sprint);
          root.querySelector('.tb-sneak').classList.toggle('on', this.toggles.sneak);
          return;
        }
        btn.classList.add('on');
        this.touchHeld.add(a);
        this.pressed.push(a);
      });
      const up = (e) => {
        if (!this.touchHeld.has(a)) return;
        btn.classList.remove('on');
        this.touchHeld.delete(a);
        this.released.push(a);
      };
      btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
    }
  }

  // ---------------------------------------------------------- manette
  pollGamepad() {
    if (this.gamepadIndex === null || !navigator.getGamepads) return null;
    const gp = navigator.getGamepads()[this.gamepadIndex];
    if (!gp) return null;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    const map = { interact: 0, throw: 2, utility: 3, light: 1, talk: 5, radio: 4, sneak: 10, sprint: 6, pause: 9, chat: 8 };
    for (const [a, i] of Object.entries(map)) {
      const v = !!gp.buttons[i]?.pressed;
      if (v && !this.gpPrev[a]) { this.pressed.push(a); this.lastDevice = 'gamepad'; }
      if (!v && this.gpPrev[a]) this.released.push(a);
      this.gpPrev[a] = v;
    }
    const mx = dz(gp.axes[0] || 0), my = dz(gp.axes[1] || 0);
    const ax = dz(gp.axes[2] || 0), ay = dz(gp.axes[3] || 0);
    return {
      mx, my, aim: Math.hypot(ax, ay) > 0.3 ? Math.atan2(ay, ax) : null,
      sprint: gp.buttons[6]?.value > 0.3 || gp.buttons[7]?.value > 0.3, sneak: !!gp.buttons[10]?.pressed,
      talk: !!gp.buttons[5]?.pressed, radio: !!gp.buttons[4]?.pressed,
    };
  }

  isDown(a) { return this.down.has(a) || this.touchHeld.has(a) || (this.gp && this.gp[a]); }

  // État de déplacement de l'image courante.
  sample() {
    this.gp = this.pollGamepad();
    let mx = 0, my = 0;
    if (this.down.has('up')) my -= 1;
    if (this.down.has('down')) my += 1;
    if (this.down.has('left')) mx -= 1;
    if (this.down.has('right')) mx += 1;
    if (this.touchMove.active) { mx = this.touchMove.x; my = this.touchMove.y; }
    if (this.gp && (this.gp.mx || this.gp.my)) { mx = this.gp.mx; my = this.gp.my; }
    let mode = 'walk';
    if (this.down.has('sneak') || this.toggles.sneak || this.gp?.sneak) mode = 'sneak';
    if (this.down.has('sprint') || this.toggles.sprint || this.gp?.sprint || (this.touchMove.full && !this.toggles.sneak)) mode = 'sprint';
    return { mx, my, mode };
  }

  consume() {
    const p = this.pressed, r = this.released;
    this.pressed = []; this.released = [];
    return { pressed: p, released: r };
  }

  reset() { this.down.clear(); this.touchHeld.clear(); this.pressed = []; this.released = []; this.toggles = { sprint: false, sneak: false }; }
}

export function keyName(code) {
  if (!code) return '—';
  const m = { ShiftLeft: 'Maj', ShiftRight: 'Maj D', ControlLeft: 'Ctrl', Space: 'Espace', Enter: 'Entrée', Escape: 'Échap', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  if (m[code]) return m[code];
  if (code.startsWith('Key')) {
    const ch = code.slice(3);
    // affichage selon la disposition réelle si le navigateur la connaît
    return keyName.layout?.get(code)?.toUpperCase() || ch;
  }
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}
if (typeof navigator !== 'undefined' && navigator.keyboard?.getLayoutMap) {
  navigator.keyboard.getLayoutMap().then((m) => { keyName.layout = m; }).catch(() => {});
}
