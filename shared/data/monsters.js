// Définitions des créatures. Les nombres sont réglables ici ; le comportement est dans
// shared/sim/monsters/<behavior>.js. Ajouter un monstre = une entrée + un module de comportement.
//
// sight      : portée de vue (0 = aveugle) · fov : demi-angle de vision (radians)
// hearing    : multiplicateur d'audition · speed : vitesses par état
// damage     : PV retirés par attaque · cycle : durées [min,max] des phases actives/repos
// cost       : « poids » pour la composition d'une mission (budget selon la difficulté)
export const MONSTERS = {
  sourdine: {
    name: 'La Sourdine',
    behavior: 'sourdine',
    title: 'Aveugle. Entend tout.',
    lore: 'Une grande chose maigre à la tête en forme de cornet. Elle n\'a pas d\'yeux, elle n\'en a jamais eu besoin.',
    clues: ['Cliquetis réguliers : elle « écoute » les murs.', 'Accroupissez-vous et taisez-vous : elle passe à côté sans vous voir.', 'Votre micro compte : ne criez pas près d\'elle.'],
    sight: 0, fov: 0, hearing: 1.7, radius: 0.38,
    speed: { roam: 1.25, investigate: 3.2, chase: 5.4 },
    damage: 2, attackCooldown: 1.6, cycle: { active: [70, 110], rest: [18, 28] },
    cost: 2, minDifficulty: 0,
  },
  inspecteur: {
    name: 'L\'Inspecteur',
    behavior: 'inspecteur',
    title: 'Contrôle des marchandises.',
    lore: 'Il porte une lanterne, un tampon et aucun visage. Il veut voir ce que vous transportez.',
    clues: ['Sa lanterne jaune le trahit de loin.', 'Quand il crie « CONTRÔLE ! », ne bougez plus.', 'Il confisque le butin et le range dans son bureau… où l\'on peut le reprendre.'],
    sight: 8.5, fov: 0.95, hearing: 0.7, radius: 0.34,
    speed: { roam: 1.5, approach: 2.3, chase: 4.7 },
    damage: 2, attackCooldown: 1.4, cycle: { active: [90, 140], rest: [12, 20] },
    cost: 2, minDifficulty: 0,
  },
  mannequine: {
    name: 'La Mannequine',
    behavior: 'mannequine',
    title: 'Ne bouge que si personne ne la regarde.',
    lore: 'Un mannequin de vitrine au sourire peint. Il était dans la réserve. Puis dans le couloir. Puis derrière vous.',
    clues: ['Craquement de plastique : elle vient de bouger.', 'Gardez-la dans le faisceau de votre lampe.', 'Les pièces éclairées la ralentissent.'],
    sight: 14, fov: Math.PI, hearing: 0.6, radius: 0.3,
    speed: { roam: 0, chase: 6.2 },
    damage: 3, attackCooldown: 2.5, cycle: { active: [60, 100], rest: [25, 40] },
    cost: 3, minDifficulty: 1,
  },
  demenageur: {
    name: 'Le Déménageur',
    behavior: 'demenageur',
    title: 'Énorme. Maladroit. Pressé.',
    lore: 'Un colosse avec un carton sur la tête. Il renverse tout, défonce les portes et fonce droit devant.',
    clues: ['Le sol tremble quand il approche.', 'Il charge en ligne droite : esquivez, il s\'assomme contre les murs.', 'Il peut ouvrir les murs fissurés… à sa manière.'],
    sight: 5.5, fov: 0.7, hearing: 1.0, radius: 0.46,
    speed: { roam: 1.6, chase: 3.4, charge: 7.5 },
    damage: 2, attackCooldown: 1.2, cycle: { active: [80, 120], rest: [20, 30] },
    cost: 2, minDifficulty: 0,
  },
  berger: {
    name: 'Le Berger',
    behavior: 'berger',
    title: 'Il disperse les troupeaux.',
    lore: 'Une silhouette à mille bras qui porte une cloche. Il déteste les groupes et adore les retardataires.',
    clues: ['Sa cloche tinte plus fort quand vous êtes groupés.', 'Son cri « dispersion » renverse tout le monde.', 'Il chasse ensuite celui qui est le plus isolé.'],
    sight: 9, fov: 1.2, hearing: 0.9, radius: 0.34,
    speed: { roam: 1.4, stalk: 2.6, chase: 4.4 },
    damage: 2, attackCooldown: 1.5, cycle: { active: [80, 120], rest: [20, 30] },
    cost: 2, minDifficulty: 1,
  },
  echo: {
    name: 'L\'Écho',
    behavior: 'echo',
    title: 'Répète ce qu\'il entend.',
    lore: 'Une chose plate qui rampe au plafond. Elle a écouté vos pas, vos portes, vos « par ici ! ».',
    clues: ['Ses imitations sont un peu trop aiguës et grésillent.', 'Un bruit d\'objet là où il n\'y a rien ? Méfiance.', 'Il attend en embuscade près de ses faux bruits.'],
    sight: 4, fov: 1.4, hearing: 1.3, radius: 0.3,
    speed: { roam: 1.8, chase: 3.6 },
    damage: 2, attackCooldown: 1.6, cycle: { active: [80, 120], rest: [15, 25] },
    cost: 2, minDifficulty: 1,
  },
  sauveteur: {
    name: 'Le Faux Sauveteur',
    behavior: 'sauveteur',
    title: '« Suivez-moi, la sortie est par là ! »',
    lore: 'Un secouriste en gilet orange, lanterne à la main. Très serviable. Beaucoup trop serviable.',
    clues: ['Sa lanterne est verte. Les vraies sont jaunes.', 'Ses pas ne font aucun bruit.', 'Éclairez-le en plein visage pour le démasquer.'],
    sight: 10, fov: 1.3, hearing: 0.8, radius: 0.3,
    speed: { roam: 1.7, lead: 2.4, chase: 5.0, flee: 5.5 },
    damage: 3, attackCooldown: 2.0, cycle: { active: [90, 130], rest: [25, 40] },
    cost: 2, minDifficulty: 2,
  },
  invite: {
    name: 'Le Dernier Invité',
    behavior: 'invite',
    title: 'Il ressemble à quelqu\'un de l\'équipe.',
    lore: 'Il prend l\'apparence d\'un collègue éloigné. Il sourit un peu trop. Sa lampe ne s\'allume jamais.',
    clues: ['Il n\'a pas de faisceau de lampe.', 'Son nom clignote et ses lettres se mélangent.', 'Lancez-lui un objet ou éclairez-le de près.'],
    sight: 9, fov: 1.2, hearing: 0.8, radius: 0.3,
    speed: { roam: 2.2, approach: 2.8, chase: 5.0, flee: 5.6 },
    damage: 2, attackCooldown: 2.0, cycle: { active: [90, 130], rest: [20, 35] },
    cost: 2, minDifficulty: 2,
  },
};

export const MONSTER_IDS = Object.keys(MONSTERS);
