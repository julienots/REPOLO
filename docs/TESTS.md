# Rapport de tests

Commandes : `npm test` (Node, ~1 min) et `npm run test:e2e` (navigateur Chromium réel via Playwright, ~3 min).
Captures d'écran produites par les tests navigateur : dossier `test-results/`.

## Tests automatisés — RÉUSSIS

### Unitaires et intégration (`npm test`) — 45 / 45 réussis

| Domaine | Ce qui est vérifié |
|---|---|
| Cartes | 40 graines × 3 lieux : toutes les salles (hors secrète) accessibles depuis le fourgon, tout le butin accessible, levier et monte-charges accessibles, pièce secrète fermée derrière un mur fissuré ; même graine = même carte ; sérialisation réseau aller-retour |
| Navigation | A* : 60 chemins aléatoires valides |
| Vue et son | murs et portes fermées bloquent la vue ; un mur étouffe plus qu'une porte fermée |
| Créatures (8) | Sourdine aveugle (silence = invisible, cri = poursuite, murs étouffent) ; Inspecteur (immobile → confiscation, mouvement → poursuite) ; Mannequine (figée dans le faisceau, avance quand on se détourne) ; Déménageur (préparation de charge puis BONK contre un mur) ; Berger (sent le groupe, onde de choc) ; Écho (imitations marquées fausses, désaccordées, ignorées par les autres créatures) ; Faux Sauveteur (guide puis démasqué par la lampe) ; Dernier Invité (copie un coéquipier éloigné, démasqué par un objet lancé) ; casier = invisible ; période de grâce respectée |
| Mission | dépôt au fourgon, levier → départ → extraits / abandonnés, paie différente |
| Physique | objets lourds plus lents, plus rapides à deux ; fragiles perdent de la valeur, coffre-fort incassable |
| Joueurs | réanimation, mort après saignement → fantôme, « Bouh ! » |
| Bruit | courir ≫ marcher discrètement ; le niveau du micro produit un cri perçu |
| Talkie-walkie | grésillement chez le récepteur, batterie consommée, coupé par SILENCE RADIO |
| Événements (27) | chacun démarre, agit et se termine sans erreur ; un seul événement par tag ; déclenchement probabiliste par signal (objet cassé) ; jamais avant 25 s, intervalles variables |
| Parties complètes | 3 lieux × 4 difficultés jouées par 4 bots jusqu'à la fin, instantanés sérialisables |
| Progression | paie, XP, succès, bestiaire, sauvegarde, récupération d'une sauvegarde corrompue, boutique (crédits, niveaux, succès), export/import |
| Salon | solo local complet jusqu'aux résultats et retour au salon ; déconnexion → bot → reconnexion |
| Réseau (vrai serveur) | page et fichiers servis, blocage de la traversée de répertoires, création/connexion par code, nom assaini, réglages réservés à l'hôte, relais WebRTC, lancement refusé si pas prêt, même carte, mouvement synchronisé, téléportation refusée, déconnexion → bot, reconnexion par jeton, code inconnu, salon plein, exclusion, transfert d'hôte |

### Navigateur réel (`npm run test:e2e`)

| Test | Résultat |
|---|---|
| Fumée : menu → solo → mission → déplacements clavier, aucune erreur console | réussi |
| Multijoueur (PC 1280×720 + téléphone 844×390 tactile, vrai serveur) | 12/12 vérifications réussies |
| ↳ salon créé, code, second joueur rejoint, mode tactile détecté | réussi |
| ↳ connexion vocale WebRTC établie (micro simulé par Chromium) | réussi |
| ↳ appuyer-pour-parler : silence au repos, voix reçue en appuyant | réussi |
| ↳ même carte, lancement chez les deux | réussi |
| ↳ déplacement au joystick tactile vu par l'autre joueur | réussi |
| ↳ la voix réelle génère du bruit dans la simulation | réussi |
| ↳ déconnexion → bot → reconnexion automatique | réussi |
| Partie solo complète (accélérée ×6) jusqu'aux résultats, paie appliquée une seule fois, sauvegarde, retour au salon | réussi |

### Serveur HTTPS local
`npm run start:https` : certificat généré (avec l'IP locale), page servie en HTTPS — vérifié.

## Bugs trouvés et corrigés grâce aux tests
- Les pas des joueurs humains ne faisaient aucun bruit (déplacement mesuré au mauvais moment) → corrigé, l'Inspecteur détecte maintenant bien les joueurs qui bougent.
- Un état interne du Berger rendait l'instantané réseau circulaire (plantage) → données internes séparées des données envoyées.
- Objets et monte-charges pouvaient apparaître dans une zone inaccessible → placement limité aux cases accessibles.
- Le résultat de fin de partie pouvait être appliqué plusieurs fois → fin de partie idempotente (salon + client).
- Chat vocal : connexion parfois bloquée (« connecting ») — des messages de signalisation arrivaient pendant la demande d'accès au micro, ou des candidats ICE avant la description distante, et des offres se croisaient. → file d'attente par pair, mise en attente des messages précoces, un seul initiateur par paire, relance automatique d'une connexion bloquée. Après correction : 13 exécutions consécutives du test multijoueur réussies.
- Capture de pointeur tactile pouvant lever une erreur → protégée.
- Dépendance HTTPS vulnérable (node-forge) → mise à jour, `npm audit` : 0 vulnérabilité.

## NON testé (à faire sur de vrais appareils / réseaux)
- Chat vocal entre deux réseaux Internet différents (NAT, 4G) et avec un serveur TURN.
- Vrais téléphones Android (performances, chauffe, interruptions d'appel) — seule l'émulation mobile de Chromium a été utilisée.
- iPhone / Safari.
- Firefox et Safari de bureau (seul Chromium a été automatisé).
- Manette physique (code présent, non testé).
- Synthèse vocale des bots (dépend des voix installées sur l'appareil ; non audible dans les tests).
- Déploiement chez un hébergeur ; le `Dockerfile` n'a pas pu être construit (pas de démon Docker dans l'environnement de développement).
- Installation PWA (manifeste et service worker présents, installation non testée sur appareil).
- Charge serveur avec beaucoup de salons simultanés.

## Version 3D (Godot) — GitHub Actions `godot-3d.yml`

Lancés à chaque modification de `godot/` ou `shared/` avec le Godot 4.3 officiel :

- **Parité avec la version web** : générateur aléatoire et hachage identiques ; 6 cartes (3 lieux × 2 graines)
  identiques case par case au générateur JS ; tout le butin accessible sur 24 cartes ; A*, ligne de vue, son.
- **Compilation** de tous les scripts du jeu.
- **Simulation** : partie complète de 4 bots ; 8 graines comparées à la version web (même équilibre : 4 réussites
  sur 8 des deux côtés) ; chaque créature apparaît et agit ; 20 des 27 événements déclenchés (les autres dépendent de
  conditions de partie) ; résultat de mission ; format de l'instantané.
- **Réseau réel** : le serveur Node du jeu est lancé, deux clients Godot créent / rejoignent un salon par code,
  lancent une mission avec bots, l'invité voit l'hôte bouger, la carte reçue est identique à la génération Godot.
- **Rendu** : captures d'écran sous xvfb (OpenGL logiciel) du menu, des 8 créatures, de parties en pilote
  automatique dans les 3 lieux, de rencontres et de l'interface tactile (branche `ci-shots`).

Non testé automatiquement : performances et commandes tactiles sur un vrai téléphone Android.
