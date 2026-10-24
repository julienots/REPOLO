# OPÉRATION PANIQUE

**Jeu d'horreur coopératif multijoueur — PC et mobile, dans le navigateur.**

Vous êtes employés de *Récup'Express S.A.R.L.*, une entreprise de « récupération » peu regardante. On vous dépose dans un entrepôt abandonné, un hôtel délabré ou un laboratoire souterrain. Votre mission : récupérer assez d'objets de valeur pour atteindre le **quota**, les ramener au **fourgon**, puis tirer le levier et partir… avant que les créatures qui hantent les lieux ne vous trouvent.

Tout fait du bruit : vos pas, les portes, les objets qui tombent, **votre vraie voix dans le micro**. Les créatures entendent. Chacune a ses propres règles, que les joueurs attentifs apprennent à reconnaître.

---

## Lancer le jeu (le plus simple)

Il faut **Node.js** (version 18 ou plus récente, gratuit : <https://nodejs.org>, prenez la version « LTS »).

1. Ouvrez un terminal dans le dossier du jeu.
2. Installez les dépendances (une seule fois) :
   ```
   npm install
   ```
3. Démarrez le serveur :
   ```
   npm start
   ```
4. Ouvrez **http://localhost:8080** dans Chrome, Edge ou Firefox.
5. Cliquez sur **« Jouer en solo »** puis **« Lancer la mission »**.

Le terminal affiche aussi l'adresse à utiliser depuis un autre appareil du même Wi-Fi.

### Jouer à plusieurs

- **Sur le même réseau (maison, LAN)** : un joueur lance `npm start`. Les autres ouvrent l'adresse affichée (`http://192.168.x.x:8080`). L'un clique sur **« Créer une partie en ligne »**, communique le **code à 5 caractères** (ou le lien « Copier le lien »), les autres le saisissent et cliquent sur **« Rejoindre »**.
- **Avec le micro sur téléphone** : les navigateurs n'autorisent le micro qu'en HTTPS. Lancez plutôt :
  ```
  npm run start:https
  ```
  puis ouvrez sur le téléphone l'adresse `https://192.168.x.x:8443` indiquée, et acceptez l'avertissement de sécurité (certificat généré localement, c'est normal).
- **Par Internet** : il faut héberger le serveur (voir « Mettre le jeu en ligne » plus bas).

### Sur téléphone (Android en priorité)

- Ouvrez l'adresse du jeu dans Chrome, tenez le téléphone **en paysage**.
- Joystick à gauche (il apparaît sous le pouce, poussez à fond pour courir), glissez à droite pour orienter la lampe, gros bouton ✋ pour l'action, 🎙 pour parler.
- Menu de Chrome → **« Installer l'application »** (ou « Ajouter à l'écran d'accueil ») : le jeu s'installe comme une application (PWA) et le mode solo fonctionne ensuite hors ligne.

---

## Commandes

| Action | PC | Manette | Mobile |
|---|---|---|---|
| Se déplacer | ZQSD / WASD / flèches | stick gauche | joystick gauche |
| Viser (lampe) | souris | stick droit | glisser à droite |
| Courir / discret | Maj / Ctrl ou C | gâchettes / L3 | 🏃 / 🤫 |
| Action (ramasser, lâcher, porte, casier, réanimer, levier) | E ou clic droit | A | ✋ |
| Lancer l'objet porté | R ou clic gauche | X | 🫴 |
| Équipement (leurre, fusée, trousse) | G | Y | 🎒 |
| Lampe torche | F | B | 🔦 |
| Parler (appuyer pour parler) | V (maintenir) | RB | 🎙 (maintenir) |
| Talkie-walkie | B (maintenir) | LB | 📻 |
| Chat écrit / emotes / pause | Entrée / 1-4 / Échap | Select / — / Start | 💬 / 😱 / ☰ |

Toutes les touches sont modifiables dans **Réglages**.

---

## Ce qui est dans cette version

- **Menu, salon (lobby) complet** : code d'invitation, lien à partager, liste des joueurs avec avatars, prêt / pas prêt, choix de la mission, de la difficulté (4 niveaux) et d'une variante, taille d'équipe, places max, verrouillage, exclusion, transfert d'hôte, lancement réservé à l'hôte, **bots pour compléter l'équipe** (choix des personnalités).
- **Solo avec bots** (aucune connexion nécessaire) et **multijoueur en ligne réel** (serveur autoritaire WebSocket). Si un joueur perd la connexion, **un bot prend le relais** jusqu'à son retour (reconnexion automatique).
- **3 lieux** générés de façon procédurale mais toujours navigables : Entrepôt Morvan, Hôtel Bellevue-Mortel (portes qui changent d'avis), Labo Δ-7. Cachettes, portes, sols bruyants (verre, grilles), monte-charges (raccourcis), lampes qui clignotent, **pièce secrète** derrière un mur fissuré.
- **8 créatures** aux règles différentes (voir le Bestiaire en jeu et `docs/DESIGN.md`).
- **27 événements de chaos** pilotés par des fichiers de données (black-out, gravité détraquée, faux fourgon, contrôle qualité avec canard géant, client spectral, alarme de confettis…), déclenchés par un « directeur » qui alterne calme et panique.
- **Système de bruit** complet : pas, portes, chocs, casse, voix réelle du micro, radio, leurres. Les murs et portes fermées étouffent le son.
- **Objets physiques** : poids, chocs bruyants, objets fragiles qui perdent de la valeur, objets lourds plus rapides à deux, lancer un objet sur une créature l'étourdit.
- **Chat vocal de proximité réel** (WebRTC) : volume selon la distance, voix étouffées par les murs, stéréo, talkie-walkie (avec grésillement audible par les monstres et batterie), appuyer-pour-parler ou micro ouvert, coupure par joueur, indicateur de qui parle. **Votre niveau de micro est transmis à la simulation : crier attire les créatures, y compris en solo.**
- **Chat écrit**, emotes, bulles de dialogue des bots (avec synthèse vocale du navigateur, désactivable).
- **Fin de partie** : paie, XP, distinctions amusantes (mégaphone humain, ange gardien, brocanteur distrait, mort la plus absurde…), **moments forts avec mini-replays**.
- **Progression** : crédits, niveaux, succès, défis quotidiens et hebdomadaires, casier cosmétique (combinaisons, masques, couvre-chefs, couleurs de lampe, emotes, titres), équipements utilitaires. **Aucun achat réel, aucun avantage payant.** Sauvegarde dans le navigateur avec copie de secours et export/import.
- **Accessibilité / confort** : indicateurs visuels des sons, qualité graphique automatique (baisse si l'appareil chauffe), tremblements désactivables.

---

## Mettre le jeu en ligne (pour jouer par Internet)

Le jeu a besoin d'un **serveur Node.js qui reste allumé** (connexions WebSocket permanentes). Les hébergements « serverless » comme Vercel ou Netlify **ne conviennent pas** au serveur de jeu (ils peuvent servir les fichiers statiques, mais alors seul le mode solo fonctionne).

Options possibles (non testées depuis cet environnement — tarifs et conditions à vérifier au moment du déploiement) :

- **Render / Railway / Fly.io / Koyeb** : créer un « Web Service » Node depuis ce dépôt GitHub, commande d'installation `npm install`, commande de démarrage `npm start`. Les offres gratuites, quand elles existent, mettent souvent le serveur en veille après inactivité (premier chargement lent).
- **Un petit serveur privé (VPS)** : quelques euros par mois en général ; `npm install && npm start` derrière un proxy HTTPS (Caddy, Nginx). Un `Dockerfile` est fourni.

Variables d'environnement utiles : `PORT` (défaut 8080), `MAX_ROOMS` (200), `MAX_PLAYERS` (places humaines par défaut, 4, maximum 8), et pour le vocal à travers certains réseaux d'entreprise/4G : `TURN_URL`, `TURN_USER`, `TURN_PASS` (serveur TURN, voir limites).

---

## Coûts

| Élément | Coût |
|---|---|
| Jouer en solo, en réseau local, développer | **0 €** |
| Moteur, bibliothèques (Node.js, `ws`, `selfsigned`) | **0 €** (open source) |
| Sons, graphismes | **0 €** (tout est généré par le code, aucun asset tiers) |
| Bots | **0 €** (IA locale, aucune API payante) |
| Hébergement du serveur en ligne | 0 € (offre gratuite avec mise en veille, si disponible) à quelques €/mois (VPS) |
| Serveur TURN (vocal à travers les réseaux restrictifs) | facultatif ; auto-hébergé (coturn) sur le même VPS ou service payant |
| Publication Google Play (si application Android emballée plus tard) | frais d'inscription développeur uniques (à vérifier) |

---

## Limites connues (honnêtement)

- **C'est un jeu web 2D vu de dessus**, pas un jeu 3D natif. Choix volontaire : une seule base de code jouable immédiatement sur PC et Android, testable automatiquement, légère pour les téléphones modestes. Voir `docs/ARCHITECTURE.md`.
- **Chat vocal** : vérifié automatiquement entre deux navigateurs sur la même machine (connexion WebRTC, appuyer-pour-parler, voix transmise à la simulation). **Pas encore testé** entre deux réseaux Internet différents : sans serveur TURN, environ une partie des connexions (4G, réseaux d'entreprise) peuvent échouer. Maillage pair-à-pair prévu pour 4 à 6 joueurs.
- **iOS / Safari** : le jeu devrait fonctionner (WebRTC et WebAudio sont supportés sur iOS récents) mais **n'a pas été testé sur un appareil Apple**. Le plein écran et le verrouillage en paysage sont limités sur iPhone.
- **Application Android native (.apk)** : non produite. Le jeu s'installe comme PWA. Un emballage (Capacitor ou TWA) est possible plus tard sans réécrire le jeu.
- **Progression stockée dans le navigateur** : effacer les données du site efface la progression (utilisez l'export). Elle n'est pas vérifiée par le serveur (sans conséquence en coopératif).
- **Équilibrage** : réglé par simulations automatiques de parties de bots et de courtes sessions ; il faudra l'ajuster avec de vraies parties entre amis.
- Les environnements « centre commercial », « installation de recherche » et « zone de stockage » de la vision du projet ne sont **pas encore** créés (3 lieux sur 6).

---

## Tests

```
npm test            # 45 tests : carte, créatures, événements, mission, progression, salon, réseau
npm run test:e2e    # tests dans de vrais navigateurs (Chromium + Playwright requis)
npm run sim         # simule une mission complète jouée par 4 bots (équilibrage)
```

Le détail de ce qui est testé (et de ce qui ne l'est pas) est dans `docs/TESTS.md`.

## Documentation

- `docs/DESIGN.md` — concept, créatures, événements, bots, progression.
- `docs/ARCHITECTURE.md` — choix techniques, organisation du code, protocole réseau, comment ajouter du contenu, renommer le jeu.
- `docs/ROADMAP.md` — plan de développement, risques, prochaines étapes.
- `docs/TESTS.md` — rapport de tests.
