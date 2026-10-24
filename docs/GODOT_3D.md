# Opération Panique — version 3D (Godot 4)

Le dossier `godot/` contient la version 3D du jeu, faite avec le moteur **Godot 4.3** (gratuit et libre). Elle reprend
**les mêmes règles, les mêmes personnages, les mêmes 8 créatures, les mêmes 27 événements et les mêmes cartes** que la
version 2D, mais vue à la première personne, avec une lampe torche qui projette de vraies ombres.

## Ce qui est partagé avec la version 2D

| Élément | Comment |
|---|---|
| Données (créatures, objets, événements, missions, cosmétiques...) | exportées depuis `shared/data` vers `godot/data/game_data.json` (`npm run godot:data`) — une seule source |
| Générateur de cartes | porté en GDScript ; **vérifié identique** au serveur (tests de parité sur 6 cartes, case par case) |
| Simulation (bruit, perception, créatures, bots, directeur d'événements, statistiques) | portée en GDScript (`godot/scripts/sim`) ; mêmes formules. L'équilibre est vérifié : 4 missions de bots réussies sur 8 dans les deux versions avec les mêmes graines |
| Multijoueur | la 3D parle **le même protocole** que la 2D (`server/index.js`) : un joueur 3D peut rejoindre un salon créé en 2D, et inversement |

## Jouer

- **Android** : installer l'APK `OperationPanique3D-*.apk` de la release « apk-3d-latest » (signée avec une clé de débogage :
  Android demande d'autoriser l'installation depuis une source inconnue).
- **PC** : ouvrir le dossier `godot/` avec Godot 4.3 et lancer (F5), ou exporter pour Windows/Linux depuis Godot.

### Commandes

| Action | PC | Téléphone |
|---|---|---|
| Se déplacer | ZQSD / WASD / flèches | joystick à gauche (pousser au-delà du cercle = courir) |
| Regarder | souris | glisser sur la moitié droite |
| Courir / s'accroupir | Maj / Ctrl ou C | joystick à fond / bouton ACCROUPI |
| Action (ramasser, poser, porte, casier, levier, relever) | E ou Espace (maintenir pour relever / levier) | bouton ACTION (maintenir) |
| Lancer l'objet porté | clic gauche ou G | LANCER |
| Objet d'équipement (leurre, fusée, soin) | F | OBJET |
| Lampe | clic droit ou L | LAMPE |
| Pause | Échap | II |

### En ligne

Menu « Multijoueur en ligne » : saisir l'adresse du serveur du jeu (par exemple `192.168.1.20:8080` quand le serveur est
lancé avec `npm start` sur un PC du même Wi-Fi), puis créer un salon ou rejoindre avec un code.

## Rendu

- Rendu « Compatibilité » (OpenGL ES 3) pour tourner sur des téléphones modestes.
- Textures **générées au lancement** (aucune image téléchargée) : shaders triplanaires de béton, carrelage, parquet,
  métal, papier peint ; crasse au pied des murs, taches d'humidité, flaques réfléchissantes.
- Créatures modélisées par code (primitives animées) avec peau humide veinée, plastique fissuré, carton détrempé, os ;
  yeux luisants, tics nerveux, animations par état.
- Lampe torche avec ombres, néons qui grésillent (les plus proches seulement sont de vraies lumières), brouillard,
  post-traitement (vignette, grain, aberration chromatique quand une créature approche ou qu'on est blessé).
- Sons synthétisés (mêmes recettes que la 2D), spatialisés en 3D ; battements de cœur ; voix des bots par synthèse vocale
  du téléphone ; micro facultatif : votre vraie voix fait du bruit que les créatures entendent.

## Limites (honnêtement)

- **« Ultra réaliste »** : le jeu n'utilise aucun modèle 3D acheté ou scanné ; tout est généré par code. Le rendu est
  sombre, texturé et inquiétant, mais il n'atteint pas le photoréalisme d'un jeu AAA (personnages et créatures en
  formes simples animées, pas de squelettes ni de capture de mouvement).
- **Chat vocal** : absent de la version 3D (le moteur Godot n'inclut pas WebRTC sur Android sans extension). En ligne,
  les joueurs 3D lisent les messages et entendent les bots ; leur micro ne sert qu'au bruit.
- **Testé automatiquement** (CI GitHub Actions) : parité des cartes, simulation (parties complètes de bots, chaque
  créature, chaque événement), compilation de tous les scripts, connexion réelle de deux clients Godot au serveur Node,
  captures d'écran du rendu (rendu logiciel). **Pas encore testé sur un vrai téléphone** : performances et commandes
  tactiles à valider sur appareil.
- APK de test signée avec une clé de débogage (pas encore de version Play Store).

## Organisation

```
godot/
  project.godot, export_presets.cfg   projet et export Android
  data/game_data.json                 données exportées de shared/data
  scripts/core/                       RNG, grille, A*, générateur de cartes (parité avec shared/map)
  scripts/sim/                        simulation (port de shared/sim)
  scripts/game/                       rendu 3D, joueur, créatures, objets, sons, HUD, tactile
  scripts/net/                        client WebSocket + état client en ligne
  scripts/ui/                         menus, profil, thème
  shaders/                            surfaces, peau, post-traitement
  tests/                              tests (parité, simulation, réseau)
  tools/screenshots.*                 captures automatiques
```
