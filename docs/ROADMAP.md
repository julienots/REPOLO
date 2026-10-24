# Plan de développement, risques et suite

## Étapes

| Étape | Contenu | État |
|---|---|---|
| 1. Audit et plan | Dépôt vide au départ ; choix technique (voir ARCHITECTURE) ; structure modulaire | ✔ fait |
| 2. Prototype jouable | Joueur, carte, récupération, créature, bruit, extraction, victoire/défaite, événement, bot, interface PC+mobile | ✔ fait (au-delà : 3 lieux, 8 créatures, 27 événements) |
| 3. Multijoueur | Serveur WebSocket autoritaire, salon, codes, synchronisation, déconnexion/reconnexion, vocal WebRTC | ✔ fait, vérifié entre deux navigateurs sur une même machine |
| 4. Extension | Progression, cosmétiques, défis, succès, replays, variantes, objectifs bonus | ✔ première version |
| 5. Tests | Unitaires, intégration réseau, navigateurs réels (voir TESTS.md) | ✔ automatisés |
| 6. Validation finale | Lancement, erreurs console, parcours complet | ✔ (limites listées dans le README) |

## Critères de réussite mesurables (et état)

- Une partie solo complète se joue du menu aux résultats sans erreur JavaScript — ✔ vérifié automatiquement.
- Deux navigateurs rejoignent le même salon par code, voient la même carte et les déplacements de l'autre — ✔.
- La voix est transmise uniquement en appuyant (appuyer-pour-parler) et le niveau du micro produit du bruit dans la simulation — ✔.
- Toutes les cartes générées (120 graines testées) sont navigables, tout le butin hors pièce secrète est accessible — ✔.
- Chaque créature respecte ses règles (tests dédiés) — ✔ 8/8.
- Chaque événement démarre, agit et se termine sans erreur ; pas de combinaison interdite — ✔ 27/27.
- Une partie de bots se termine pour chaque lieu et difficulté — ✔ 12/12.

## Risques techniques principaux

1. **Vocal à travers Internet** : sans serveur TURN, certaines connexions (4G, NAT symétriques, réseaux d'entreprise) échoueront. → Ajouter un TURN (coturn auto-hébergé) ; variables déjà prévues.
2. **Maillage WebRTC** : la bande passante montante croît avec le nombre de joueurs. OK jusqu'à ~6. Au-delà → SFU (mediasoup, LiveKit auto-hébergé).
3. **iOS** : WebAudio + WebRTC fonctionnent sur iOS récents mais des comportements spécifiques (reprise audio après interruption, plein écran) restent à tester sur appareil.
4. **Hébergement gratuit** : mise en veille, limites de connexions. Pour jouer régulièrement : petit VPS.
5. **Triche** : la progression est locale (sans enjeu en coopératif). Si un classement est ajouté un jour, il faudra des comptes et une progression côté serveur.
6. **Équilibrage** : à affiner avec de vraies sessions entre amis (les simulations de bots ne remplacent pas des humains qui paniquent).

## Prochaines étapes proposées (par priorité)

1. Sessions de jeu réelles à 2-4 joueurs ; ajuster vitesses, quotas, fréquence des événements.
2. Déploiement en ligne + serveur TURN ; test du vocal entre deux réseaux différents.
3. Test sur un vrai téléphone Android modeste et sur iPhone.
4. Trois lieux supplémentaires prévus par la vision : centre commercial plongé dans le noir, installation de recherche isolée, zone de stockage d'objets étranges.
5. Emballage Android (Capacitor ou TWA) si une publication sur le Play Store est souhaitée.
6. Plus de sons « signature » et d'animations ; écran de personnalisation avec aperçu animé.
7. Replays plus riches (export en GIF/vidéo des moments forts).
