# Architecture technique

## 1. Choix technique et justification

**Retenu : jeu web (HTML5 Canvas 2D + WebAudio + WebRTC) + serveur Node.js autoritaire (WebSocket), PWA installable.**

| Option évaluée | Pour | Contre (dans ce projet) |
|---|---|---|
| Unity 3D | rendu 3D, export Android/PC natif | export et tests impossibles dans l'environnement de travail ; chaque version doit être compilée ; vocal et réseau à ajouter via des services souvent payants ; WebGL Unity lourd sur mobile |
| Godot 3D | gratuit, export natif | même problème de compilation/vérification ici ; build web lourd ; vocal WebRTC à intégrer |
| WebGL / WebGPU 3D (Three.js) | 3D dans le navigateur | coût de production élevé (modèles, animations) et performances incertaines sur Android modeste ; la tension ne dépend pas de la 3D |
| **Canvas 2D vue de dessus + Node** | une seule base de code PC/mobile, aucune installation, jouable tout de suite par lien, très léger, **entièrement testable automatiquement** (navigateurs réels), même simulation en solo et en ligne | pas de 3D ; limites des navigateurs (micro en HTTPS, iOS) |

Le cœur du jeu (bruit, perception, règles des créatures, événements) est indépendant du rendu : un client 3D (Godot, Three.js) pourrait plus tard se brancher sur le même serveur et le même protocole.

**Ce qui est différent d'un jeu natif** : pas d'installation depuis un store (PWA à la place), le micro exige HTTPS, la qualité dépend du navigateur, pas d'accès aux API natives (vibration et plein écran limités sur iOS).

## 2. Organisation du dépôt

```
shared/                 Code commun serveur + navigateur (aucune dépendance DOM/réseau)
  config/game.js        Nom du jeu, constantes de simulation, limites
  data/                 CONTENU configurable sans toucher au moteur
    monsters.js         Créatures (vitesses, perception, dégâts, cycles, indices, coût)
    events.js           27 événements (conditions, durée, effets, équité)
    items.js            Objets (valeur, poids, fragilité, bruit)
    equipment.js        Équipements utilitaires
    missions.js         Missions, difficultés, variantes, objectifs bonus
    themes.js           Lieux (génération + palette + butin)
    bots.js, dialogue.js  Personnalités et répliques des bots
    cosmetics.js, progression.js  Cosmétiques, succès, défis, niveaux
  map/                  Grille (collisions, vue, son), A*, générateur de cartes
  sim/                  SIMULATION
    game.js             La partie : joueurs, actions, mission, instantanés réseau
    noise.js            Événements sonores et perception
    perception.js       Vue des créatures, lampes, observation
    movement.js         Déplacement (identique client/serveur)
    items.js            Physique des objets
    monsters/           base.js (moteur) + un module par créature + index.js (registre)
    bots/               brain.js (IA utilitaire), chatter.js (dialogues)
    events/             director.js (rythme), mods.js (modificateurs), actions.js
    spawner.js          Composition et apparition des créatures
    stats.js            Statistiques, distinctions, morts absurdes, replays
  room/room.js          Salon + boucle de partie (transport-agnostique)
server/index.js         HTTP statique + WebSocket + relais WebRTC + HTTPS local
client/                 Navigateur
  main.js               Point d'entrée, écrans, connexion
  net/transport.js      WebSocket (en ligne) ou salon local (solo)
  game/client-game.js   Prédiction, interpolation, sons, interface en jeu
  render/               renderer.js (carte, lumière, surcouches), sprites.js, lighting.js
  audio/audio.js        Sons synthétisés, spatialisation, ambiance, voix des bots
  voice/voice.js        Chat vocal de proximité WebRTC
  input/input.js        Clavier, souris, manette, tactile
  ui/                   menu, salon, résultats, fenêtres (casier, défis, bestiaire, réglages, aide)
  save/                 profil (progression) et réglages
  sw.js, manifest.webmanifest, assets/icons/   PWA
tests/                  unit/, integration/ (Node), e2e/ (Playwright)
scripts/                simulate.mjs (équilibrage), make_icons.py
```

## 3. Flux de données

```
            ┌───────────── Navigateur ─────────────┐        ┌──────── Serveur Node ────────┐
 Entrées → client-game (prédiction du joueur)  ──st──▶  Room ─▶ Game.step() à 30 Hz        │
            │  interpolation ◀──── snap (15 Hz) ─────  (monstres, bots, objets, événements)│
            │  sons / bulles / effets ◀── noises, msgs                                    │
 Micro → voice.js ──voice (niveau)────────────────▶  bruit « voix » dans la simulation   │
         voice.js ◀════ WebRTC pair-à-pair ════▶ autres joueurs (signalisation via Room) │
```

- **Solo** : `LocalTransport` crée la même `Room` dans le navigateur. Même code, mêmes règles, aucun serveur nécessaire.
- **Autorité** : le serveur décide de tout (créatures, objets, dégâts, événements, mission). Le déplacement du joueur est prédit localement pour la réactivité ; le serveur le **valide** (vitesse maximale, collisions) et peut recaler le client (`tp`). Les pas, et donc le bruit, sont calculés côté serveur à partir des déplacements réels.
- **Déconnexion** : le personnage passe sous contrôle d'un bot ; reconnexion par jeton (90 s de grâce).

## 4. Protocole (messages JSON)

Client → serveur : `create`, `join {code, hello}`, `profile`, `ready`, `settings` (hôte), `kick` (hôte), `start` (hôte), `chat`, `rtc {to, data}`, `voiceState`, `leave`, `backToLobby`, en jeu : `st {x,y,a,l,m,tp}`, `act {a: interact|release|throw|utility|door|emote|boo}`, `voice {lv, radio}`, `abandon`, `ping`.

Serveur → client : `welcome {you, token, code}`, `lobby {...}`, `chat`, `error`, `kicked`, `start {info, you}`, `snap {...}` (joueurs, créatures, objets, portes, lampes, bruits, messages, événements, mission), `result`, `rtc {from, data}`, `pong`.

## 5. Chat vocal

- WebRTC en maillage (chaque joueur relié à chaque autre), négociation « parfaite » (gestion des collisions d'offres), serveurs STUN publics, TURN configurable (`TURN_URL`...).
- Chaque voix distante : filtre passe-bas (murs, casier), gain (distance, 17 cases max), panoramique, branche radio (passe-bande + distorsion) si les deux ont un talkie-walkie, effet « voix inversées » (modulation + inversion gauche/droite).
- Les morts n'entendent / ne sont entendus que par les morts.
- Appuyer-pour-parler par défaut ; micro ouvert avec détection ; vocal coupé ; coupure par joueur ; micro coupé quand l'application passe en arrière-plan.
- Le niveau du micro local (mesuré réellement) est envoyé au serveur 10 fois/s pendant la transmission : la simulation le convertit en bruit.
- Limite : au-delà de ~6 joueurs, il faudrait un serveur de relais audio (SFU).

## 6. Ajouter du contenu

- **Un événement** : ajouter une entrée dans `shared/data/events.js` en combinant `mods` (voir `sim/events/mods.js`) et actions (`sim/events/actions.js`). Une action nouvelle = une fonction dans `ACTIONS`.
- **Un objet** : une entrée dans `shared/data/items.js` (+ forme de dessin dans `client/render/sprites.js`, sinon forme générique), puis le référencer dans la table `loot` d'un thème.
- **Une créature** : une entrée dans `shared/data/monsters.js`, un module `shared/sim/monsters/<nom>.js` (`init`, `update`, `onRest`, `onWake`, `onHitByItem`), l'enregistrer dans `monsters/index.js`, ajouter son dessin dans `MONSTER_DRAW` (sprites.js) et éventuellement sa signature sonore (`monsterCues` dans client-game.js, sons dans audio.js).
- **Un lieu** : une entrée dans `shared/data/themes.js` (disposition, meubles, butin, palette) et une mission dans `missions.js`.
- **Renommer le jeu** : `shared/config/game.js` (+ `client/manifest.webmanifest` et le titre de `client/index.html`).

## 7. Performances

- Simulation à 30 Hz, instantanés à 15 Hz (JSON, ~4,7 Ko en moyenne avant compression ; compression WebSocket activée côté serveur). Piste d’optimisation : envoi différentiel.
- Rendu : carte pré-rendue une fois ; lumière par lancer de rayons sur la grille (28 à 64 rayons par lampe selon la qualité), polygones des néons mis en cache ; calque d'obscurité à résolution réduite en qualité basse ; nombre de particules limité.
- Qualité automatique : si les images/s tombent sous 38, la qualité baisse (utile contre la chauffe sur mobile).
- Partie de 4 bots simulée sans affichage : ~1 s de calcul pour 4 min de jeu.
