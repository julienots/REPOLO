// Démarrage de la version web : intro « SuperEssence. STUDIO » (≈ 2,4 s, logo officiel),
// puis écran de chargement d'Opération Panique avec une vraie progression (script du jeu,
// polices, ressources de la page), une phrase du lore qui change, et « Toucher pour jouer ».
// Script classique (pas un module) : il démarre avant le reste du jeu.
(function () {
  const root = document.getElementById('boot');
  if (!root) return;
  // tests automatisés (navigateur piloté) : on passe directement au menu, sauf avec ?intro
  if (navigator.webdriver && !/[?&]intro/.test(location.search)) { root.remove(); return; }
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage bloqué */ } },
  };
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seen = store.get('se-intro-vue') === '1';
  const intro = root.querySelector('.se-intro');
  const load = root.querySelector('.op-load');
  const bar = root.querySelector('.op-bar i');
  const pct = root.querySelector('.op-pct');
  const lore = root.querySelector('.op-lore');
  const play = root.querySelector('.op-play');
  const LORE = [
    "Récup'Express rachète tout ce qui traîne dans les lieux que personne ne réclame.",
    "Les lunettes sont réglementaires. L'entreprise en a commandé trois mille de trop.",
    'Les créatures ne chassent pas : elles gardent les lieux. Vous, vous dérangez.',
    "Le fourgon n'attend jamais longtemps. Le chauffeur non plus.",
    'Règle n° 4 du manuel : ne jamais crier. Règle n° 5 : relire la règle n° 4.',
  ];
  let li = Math.floor(Math.random() * LORE.length);
  lore.textContent = LORE[li];

  // progression réelle : chaque étape franchie fait avancer la barre
  const steps = { page: false, script: false, fonts: false };
  let progress = 10;
  function update() {
    const done = Object.values(steps).filter(Boolean).length;
    progress = 10 + (done / 3) * 90;
    bar.style.width = progress + '%';
    pct.textContent = progress >= 100 ? 'Prêt' : Math.round(progress) + ' %';
    if (progress >= 100) { play.disabled = false; play.classList.add('ready'); }
  }
  window.__bootStep = (k) => { steps[k] = true; update(); };
  if (document.readyState === 'complete') steps.page = true;
  else window.addEventListener('load', () => window.__bootStep('page'));
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => window.__bootStep('fonts'));
  update();

  let introDone = false;
  function endIntro(full) {
    if (introDone) return;
    introDone = true;
    if (full) store.set('se-intro-vue', '1');
    intro.classList.add('out');
    setTimeout(() => { intro.remove(); load.classList.add('in'); }, 350);
    const timer = setInterval(() => {
      if (!document.body.contains(lore)) return clearInterval(timer);
      lore.classList.add('swap');
      setTimeout(() => { li = (li + 1) % LORE.length; lore.textContent = LORE[li]; lore.classList.remove('swap'); }, 220);
    }, 3200);
  }
  // attendre que les images du logo soient décodées avant d'animer
  const imgs = [...intro.querySelectorAll('img')];
  Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()))).then(() => {
    intro.classList.add(reduce ? 'play-reduced' : 'play');
    setTimeout(() => endIntro(true), 2350);
  });
  intro.addEventListener('pointerdown', () => { if (seen) endIntro(false); });

  function start() {
    if (play.disabled) return;
    root.classList.add('out');
    setTimeout(() => root.remove(), 320);
  }
  play.addEventListener('click', start);
  document.addEventListener('keydown', (e) => { if (introDone && !play.disabled && (e.key === 'Enter' || e.key === ' ')) start(); });
})();
