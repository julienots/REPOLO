# Opération Panique — Document de conception

## 1. Identité

**Pitch** : une équipe d'employés sous-payés de *Récup'Express S.A.R.L.* « récupère » des objets de valeur dans des lieux abandonnés et hantés. Le patron fixe un quota. Les créatures, elles, n'ont pas signé de contrat.

**Ton** : horreur par l'anticipation (obscurité, sons, règles des créatures à découvrir) + comédie *émergente* (objets qui tombent au pire moment, collègues paniqués, faux fourgon, canard géant qui couine). Les blagues écrites (répliques des bots, événements) restent courtes ; le rire doit surtout venir de ce qui arrive.

**Direction artistique** : vue de dessus stylisée, silhouettes expressives dessinées par le code, éclairage par lampes torches et néons qui clignotent, brouillard très sombre, quelques couleurs-repères (jaune du fourgon et des balises, vert inquiétant de la lanterne du faux sauveteur, rouge des yeux). Sons entièrement synthétisés : ambiance de bourdonnement, craquements, signatures sonores propres à chaque créature, et de rares sons comiques (fanfare, BONK, couinement).

Le nom du jeu, de l'entreprise et le slogan se changent dans `shared/config/game.js`.

## 2. Boucle de partie

1. **Salon** : on choisit son équipement, l'hôte choisit lieu, difficulté, variante, bots.
2. **Arrivée** au quai de chargement (zone éclairée, sûre au début), briefing, objectifs bonus.
3. **Exploration / récupération** : on fouille dans le noir, on porte les objets (lourds = lents, fragiles = attention).
4. **Créatures** : apparition échelonnée hors de vue (35 s de grâce au début), cycles chasse / repos.
5. **Événements** : le directeur alterne calme, montée, pic et répit.
6. **Risque** : une fois le quota atteint, partir ou continuer pour la prime ? Le temps qui passe fait monter le risque ; à l'« heure de fermeture », toutes les créatures chassent et le fourgon démarre de force.
7. **Extraction** : levier (2 s maintenu) → 12 s de compte à rebours, moteur bruyant qui attire les créatures. Qui n'est pas dans le fourgon reste sur place.
8. **Résultats** : paie (partagée, prime de décès réduite), XP, distinctions, moments forts rejouables, défis et succès.
9. **Retour au salon** → casier, boutique, nouvelle mission.

**Variantes** : standard, Déménagement (objets lourds plus précieux), Coupure de courant (néons hors service), Livraison express (moins de temps, quota réduit), Écho maximal (tous les sons portent plus loin).

**Objectifs bonus** (2 tirés par mission) : personne ne meurt, 3 objets fragiles intacts, dépasser le quota de 50 %, discrétion (< 8 alertes), 2 objets très lourds, partir avec 2 min d'avance.

**Secrets** : une pièce secrète par carte, derrière un mur fissuré (indice visuel : fissures). Elle s'ouvre si quelqu'un y projette un objet lourd… ou si le Déménageur charge dedans. Elle contient le *nain de jardin doré* (succès secret) et d'autres objets précieux.

## 3. Le bruit (mécanique centrale)

Chaque action crée un événement sonore avec une intensité (≈ rayon d'audibilité en cases). L'intensité perçue = intensité × ouïe − distance − pénalités d'obstacles (mur ≈ 2,6 cases, porte fermée 1,4, étagère 0,8).

| Source | Intensité |
|---|---|
| Pas discrets / marche / course | ~0,9 / 2,6 / 5,5 |
| Sur verre brisé / grille | ≥ 3,2 / ≥ 2,2 (même en discret) |
| Porte (normale / claquée en courant / défoncée) | 2,5 / 6 / 10 |
| Choc d'objet | selon la vitesse et le matériau (jusqu'à 14) |
| Objet cassé | 7 à 13 |
| **Voix réelle (micro)** | 1,5 + 14 × niveau (chuchoter ≈ 2-3, parler ≈ 6, crier ≈ 15) |
| Talkie-walkie | grésillement de 3,5 chez chaque récepteur |
| Leurre / sirène / moteur du fourgon | 15 / 30 / 16 |

Les bots parlent aussi à voix haute : leurs bavardages attirent les créatures.

## 4. Les créatures

Chaque créature a : une silhouette, une signature sonore, des règles, des indices, des phases de chasse et de repos, des interactions avec le décor, et un potentiel comique. Aucune ne fonce simplement vers le joueur le plus proche.

### La Sourdine — *Aveugle. Entend tout.*
Grande, maigre, tête en pavillon de gramophone, aucun œil.
- **Règles** : ne voit rien. Erre lentement ; se dirige vers les bruits ; fonce vers le **dernier bruit entendu** de sa cible (pas vers sa position réelle) : se taire et s'écarter permet de la semer. Percute tout ce qu'elle touche.
- **Indices** : cliquetis d'écholocalisation réguliers, plus rapides en chasse.
- **Repos** : retourne à son repaire, n'entend plus que les bruits forts. Après une attaque, elle s'éloigne quelques secondes (fenêtre pour réanimer).
- **Comique** : un bot paniqué qui hurle « AAAAH » à côté d'elle.

### L'Inspecteur — *Contrôle des marchandises.*
Long manteau, casquette, visage vide, lanterne jaune et tampon.
- **Règles** : patrouille. S'il vous voit : « **CONTRÔLE ! On ne bouge plus !** ». Immobile → il vérifie : il **confisque l'objet porté** et l'emporte dans son bureau (on peut le reprendre), ou vous laisse partir (« Circulez ») avec 25 s d'immunité. Bouger pendant le contrôle → poursuite rapide.
- **Indices** : lanterne visible de loin, cliquetis de clés, sifflet.
- **Comique** : le joueur cupide qui s'enfuit avec le piano.

### La Mannequine — *Ne bouge que si personne ne la regarde.*
Mannequin de vitrine au sourire peint.
- **Règles** : figée si elle est dans un faisceau de lampe, dans le rayon de vision rapproché d'un joueur ou près d'une fusée éclairante. Sinon elle fonce. Les zones éclairées par les néons la ralentissent. Dormante jusqu'à ce qu'on la voie ou qu'on fasse du bruit.
- **Indices** : craquement de plastique à chaque reprise de mouvement ; sa pose change à chaque fois.
- **Équité** : pendant un black-out ou une panne de lampe, elle est fortement ralentie.

### Le Déménageur — *Énorme. Maladroit. Pressé.*
Colosse voûté avec un carton « FRAGILE » sur la tête.
- **Règles** : vue courte. Renverse les objets, défonce les portes, casse les néons en chargeant. En vous voyant, il **gratte le sol (0,9 s)** puis **charge en ligne droite**. S'il percute un mur : **BONK**, assommé 3 s (et il ouvre les murs fissurés).
- **Indices** : le sol tremble (pas lourds), rugissement avant la charge.
- **Comique** : l'appâter contre un mur ; il ouvre la pièce secrète à votre place.

### Le Berger — *Il disperse les troupeaux.*
Silhouette aux mille bras, cloche dorée.
- **Règles** : sent les **groupes** (2 joueurs ou plus à moins de 4,5 cases) à travers les murs. S'approche, fait sonner sa cloche (1,2 s), puis **onde de choc** : tout le monde est projeté, lâche ses objets, les lampes vacillent. Il chasse ensuite **le plus isolé**. Si la cible rejoint un groupe, il hésite. Joueur isolé vu de près : attaque opportuniste.
- **Indices** : cloche dont le volume dépend de la taille du groupe.
- **Tension** : rester groupé vs se séparer.

### L'Écho — *Répète ce qu'il entend.*
Chose plate qui rampe, bouche en haut-parleur.
- **Règles** : mémorise les sons (pas, portes, chocs, « ka-ching », voix des bots) et les **rejoue** pour attirer les joueurs, puis attend en embuscade dans le noir.
- **Indices** : ses imitations sont **légèrement trop aiguës et grésillent** ; les bulles de voix sont signées « ??? » et bégayent. En interne, chaque imitation est marquée `mimic` : les autres créatures les ignorent, le jeu reste cohérent.

### Le Faux Sauveteur — *« Suivez-moi, la sortie est par là ! »*
Secouriste en gilet orange.
- **Règles** : vient vers vous, propose de vous guider, vous attend si vous traînez… et vous mène dans une salle dangereuse où il se révèle et attaque.
- **Indices** : **lanterne verte** (les vraies sont jaunes), **pas silencieux**, **pas d'ombre**, répliques insistantes. L'éclairer en plein visage 1,6 s le démasque : il s'enfuit.
- **Comique** : les bots naïfs le suivent avec enthousiasme ; les prudents préviennent « Sa lanterne est VERTE ».

### Le Dernier Invité — *Il ressemble à quelqu'un de l'équipe.*
- **Règles** : prend l'apparence d'un coéquipier **éloigné**, s'approche, vous suit… et attaque quand vous lui tournez le dos. Évite d'être vu à côté de la personne copiée.
- **Indices** : **aucun faisceau de lampe**, nom qui clignote et dont les lettres se mélangent, phrases bégayées.
- **Contre** : l'éclairer de près ou lui lancer un objet le démasque (il hurle et s'enfuit).

**Composition** : chaque mission a une créature « signature » et un budget de coût selon la difficulté (Stagiaire : 2 créatures max, PDG : 5). Les créatures n'apparaissent jamais en vue d'un joueur ni à moins de 14 cases. En pic de tension prolongé, le directeur offre un répit (une créature abandonne).

## 5. Événements de chaos

27 événements, définis dans `shared/data/events.js` (conditions, durée, avertissement, effets, fin, règles d'équité, fréquence). Catégories : humoristique, tension, danger, rare, exceptionnel, provoqué par les joueurs.

| Événement | Catégorie | Effet |
|---|---|---|
| BLACK-OUT TOTAL | Tension | Toutes les lumières fixes s'éteignent. Il ne reste que vos lampes. |
| GRAVITÉ DÉTRAQUÉE | Humoristique | Les objets se mettent à flotter. Tenez bien votre butin. |
| ALERTE ROUGE | Danger | Une sirène hurle quelque part. Toutes les créatures convergent vers elle. |
| INTERDICTION DE PARLER | Tension | Les créatures deviennent hypersensibles aux voix. Chuchotez. Ou pas. |
| VOIX INVERSÉES | Humoristique | Les voix sont déformées et gauche/droite sont inversées. Qui parle ? D'où ? |
| SOL GLISSANT | Humoristique | Quelqu'un a renversé 400 litres de cire. Freinez tôt. |
| LIVRAISON URGENTE | Tension | Un colis très précieux vient d'être livré… dans la zone la plus dangereuse. |
| LE FAUX FOURGON | Tension | Un second fourgon est apparu ! Il est peut-être réel. Vérifiez la plaque. |
| LE VOLEUR INVISIBLE | Humoristique | Un ricanement… Quelque chose vient de vous faire les poches. |
| PANNE DE LAMPE | Tension | Les lampes torches faiblissent et clignotent. |
| ASCENSEUR CAPRICIEUX | Humoristique | Le monte-charge n'en fait qu'à sa tête : il vous dépose n'importe où. |
| LE DOUBLE | Tension | Les balises de position ont un bug : un collègue apparaît à deux endroits. |
| CONTRÔLE QUALITÉ | Humoristique | La direction exige qu'un canard géant soit livré au point de contrôle. Il couine. |
| NUIT DE LA CHASSE | Danger | Les créatures sont plus rapides et plus attentives. |
| PLUIE D'OBJETS | Humoristique | Le faux plafond cède. Il pleut des objets. Certains ont de la valeur. |
| ALARME DE CONFETTIS | Humoristique | FÉLICITATIONS ! Vous êtes le millionième visiteur ! (Tout le bâtiment l'a entendu.) |
| LE CLIENT EST ROI | Tension | Un client spectral attend au fourgon. Il veut un objet précis. Il paie double. |
| SILENCE RADIO | Tension | Les talkies-walkies ne captent plus rien. |
| PORTES FOLLES | Humoristique | Les portes s'ouvrent et claquent toutes seules. Bruyamment. |
| DERNIÈRE MINUTE | Provoqué | La direction vient de relever le quota de 15 %. Désolé. |
| SURTENSION | Rare | Tout s'illumine d'un coup… vous voyez enfin ce qui vous entoure. Puis plus rien. |
| BRUME TOXIQUE | Tension | Une brume épaisse réduit la vision… des joueurs comme des créatures. |
| PAUSE CAFÉ DES MONSTRES | Exceptionnel | Syndicat des créatures : 10 secondes de pause réglementaire. Profitez-en. |
| PRIME DE RISQUE | Exceptionnel | Pendant 40 s, tout objet chargé vaut 50 % de plus. Les créatures, elles, ont faim. |
| ALARME ANTIVOL | Provoqué | Vous avez cassé un objet de valeur. L'alarme antivol se déclenche. |
| ILS VOUS ONT ENTENDUS | Provoqué | Tout ce bruit a réveillé quelque chose de plus. |
| LES COULOIRS BOUGENT | Tension | L'hôtel se réorganise : des portes se verrouillent, d'autres s'ouvrent. |

**Déclenchement** : jamais avant 25 s, au moins 14 s entre deux événements spontanés, probabilité modulée par la phase (calme ×1,7, pic ×0,25), le risque (temps, quota, bruit) et la difficulté. Les événements provoqués réagissent à des signaux de jeu (objet précieux cassé, quota atteint, équipe trop bruyante).

**Équité** : un seul événement actif par « tag » (pas de black-out + panne de lampe), 2 événements à durée simultanés maximum, conditions de tension maximale pour les dangers, ajustements par créature (la Mannequine ralentit dans le noir).

## 6. Bots

IA locale (aucun service externe) : perception (vue avec lampe, ouïe des signatures sonores) → mémoire des créatures → décision utilitaire toutes les ~0,3 s → exécution (A*, portes, endurance).

Priorités : sortir du casier quand c'est calme, réagir au contrôle de l'Inspecteur (se figer… ou paniquer), garder la Mannequine dans le faisceau, fuir ou se cacher, courir au fourgon au départ, réanimer, livrer, partir ou continuer selon le quota, choisir un objet (valeur / distance / danger), explorer.

| Profil | Traits marquants |
|---|---|
| Le Prudent | fuit tôt, se cache, veut partir dès le quota |
| Le Courageux | prend les objets près des monstres, fuit tard |
| Le Paniqué | crie, court parfois n'importe où, lâche ses objets, donne de fausses indications |
| Le Cupide | ignore le quota, s'enfuit avec l'objet pendant un contrôle |
| Le Protecteur | réanime coûte que coûte |
| Le Comique involontaire | maladroit, lâche des objets, répliques absurdes |

Les bots marquent une pause en entrant dans une nouvelle salle ou après un dépôt (rythme plus humain), ne connaissent que les objets des salles explorées, et parlent avec des répliques contextuelles non répétitives (anti-répétition sur les 40 dernières répliques de l'équipe).

## 7. Statistiques et distinctions

Mégaphone humain, Ange gardien, Brocanteur distrait (valeur abandonnée), Marathonien de la peur (plus longue poursuite), Catastrophe ambulante, Chacun pour soi (coéquipiers à terre « oubliés »), Employé du mois, Contrôle positif, Fantôme bavard, **Mort la plus absurde** (déterminée par les circonstances : objet sans valeur, confettis, pause café des monstres, lampe éteinte face à la Mannequine…), In extremis (réanimation ou montée dans le fourgon à la dernière seconde).

Moments forts : morts, sauvetages in extremis, objets précieux cassés, pièce secrète, confiscations… avec **mini-replay** des 8 secondes précédentes (positions de tous les joueurs et créatures).

## 8. Progression

- Crédits (paie de mission, défis), XP et niveaux (débloquent lieux, difficulté PDG, équipements, cosmétiques).
- Équipements utilitaires (talkie-walkie, leurres, baskets en mousse, trousse de secours, projecteur, fusée éclairante) : utiles mais jamais indispensables ; la lampe de base suffit.
- Cosmétiques : combinaisons, masques, couvre-chefs, couleurs de faisceau, emotes, titres. Certains uniquement par succès.
- 15 succès (dont secrets), 3 défis quotidiens + 3 hebdomadaires (identiques pour tout le monde, générés depuis la date).
