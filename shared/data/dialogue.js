// Répliques contextuelles des bots. {item}, {monster}, {name}, {dir}, {value} sont remplacés.
// Chaque déclencheur a des répliques communes + des répliques par personnalité.
// Le système anti-répétition (bots/chatter.js) évite de redire une phrase récente.
export const LINES = {
  spot_monster: {
    all: ['Y a un truc là-bas.', 'Euh… c\'est quoi, ça ?', '{monster} ! {monster} !', 'Ne bougez pas. Ou bougez. Je sais plus.', 'J\'ai vu quelque chose. Je préfère ne pas en parler.'],
    prudent: ['On recule doucement. Doucement.', 'Je l\'avais dit qu\'il fallait rester au fourgon.'],
    courageux: ['Je m\'en occupe ! …Comment on s\'en occupe ?', 'Approche, si t\'es un monstre !'],
    panique: ['AAAAAAH !', 'NON NON NON NON', 'C\'EST LUI ! ENFIN ELLE ! ENFIN ÇA !', 'Je veux rentrer chez ma mère !'],
    cupide: ['Il est entre moi et le butin. Inacceptable.', 'Il vaut combien, lui ?'],
    protecteur: ['Restez derrière moi !', 'Tout le monde va bien ? Comptez-vous !'],
    comique: ['Bonjour monsieur ! …Il répond pas.', 'C\'est le stagiaire de l\'autre équipe ?'],
  },
  flee: {
    all: ['Je me casse !', 'Courez !', 'Chacun pour soi !', 'Je reviens ! (Je reviens pas.)'],
    panique: ['IL ME SUIT ! IL ME SUIT !', 'Pourquoi c\'est toujours moi ?!', 'Je cours dans quelle direction ? N\'IMPORTE LAQUELLE !'],
    cupide: ['Je garde l\'objet ! Je garde l\'objet !'],
    courageux: ['Repli stratégique ! C\'est pas pareil que fuir !'],
  },
  pickup: {
    all: ['J\'ai un {item} !', 'Oh, {item}. Joli.', 'Je prends ça.', 'Ça, ça vaut au moins {value}.'],
    cupide: ['À MOI LE {item} !', 'Ça, c\'est ma prime.', 'Chaque crédit compte. Surtout les miens.'],
    comique: ['C\'est lourd, un {item}. Personne ne m\'avait prévenu.', 'J\'ai trouvé un {item}. Ou c\'est lui qui m\'a trouvé.'],
    prudent: ['Je prends le {item} et je rentre.'],
  },
  deliver: {
    all: ['Livré !', 'Un de plus dans le fourgon.', 'Et de un ! Enfin, et de plusieurs.', 'Ka-ching.'],
    cupide: ['Mon chiffre d\'affaires explose.', 'Combien on en est ? Pas assez !'],
  },
  drop_scared: {
    all: ['J\'ai lâché le truc !', 'Oups. Il est tombé.', 'Mes mains ont paniqué avant moi.'],
    comique: ['Il m\'a glissé des doigts… comme ma carrière.', 'Ça va, c\'était sûrement pas fragile.'],
  },
  teammate_down: {
    all: ['{name} est à terre !', 'On a perdu {name} ! Enfin, presque.', '{name} ?! Tiens bon !'],
    protecteur: ['J\'arrive, {name} ! Personne ne reste derrière !'],
    cupide: ['Paix à son âme. Je prends son butin ?'],
    panique: ['ON VA TOUS Y PASSER !'],
  },
  reviving: {
    all: ['Debout, {name} ! On a du travail.', 'Allez, allez, allez…', 'Je te relève, ne bouge pas.'],
    protecteur: ['Je suis là. Respire.'],
  },
  revived: {
    all: ['Merci, je te dois un café.', 'J\'ai vu une lumière blanche. C\'était ta lampe.'],
  },
  hurt: {
    all: ['Aïe !', 'Ça fait mal !', 'Il m\'a eu !', 'Ouch. C\'est couvert par la mutuelle ?'],
  },
  idle: {
    all: ['C\'est calme. Trop calme.', 'Quelqu\'un a entendu ça ?', 'Vous saviez que cet endroit est classé « déconseillé » ?', 'J\'ai faim.', 'Je déteste cet endroit.', 'On fait une pause ? Non ? D\'accord.'],
    comique: ['Si je meurs, dites à mon chat que c\'était pour lui.', 'J\'ai oublié pourquoi je suis entré dans cette pièce.', 'Hé, j\'ai trouvé un bouton ! …Il fait rien.', 'Qui a pété ?'],
    prudent: ['On devrait rester groupés.', 'J\'aime pas cette porte.'],
    panique: ['J\'entends des voix. C\'est vous ? C\'EST VOUS ?', 'Je respire. Je respire. Je respire.'],
    cupide: ['Ça sent l\'argent par ici.', 'Je flaire un coffre-fort.'],
  },
  wrong_info: {
    all: ['Le fourgon c\'est par {dir} ! Je crois.', 'J\'ai vu un truc précieux à {dir} ! Ou un monstre. Un des deux.', 'Tout est clair par {dir} !'],
  },
  quota: {
    all: ['Quota atteint ! On rentre ?', 'C\'est bon, on a le quota !', 'Bon, on y va ou on est cupides ?'],
    cupide: ['Le quota c\'est le minimum. Moi je vise le maximum.'],
    prudent: ['ON. RENTRE. MAINTENANT.'],
  },
  departure: {
    all: ['LE FOURGON PART !', 'Attendez-moi !', 'Courez au fourgon !', 'Démarre pas sans moi !'],
  },
  inspector_stop: {
    all: ['Je bouge pas, je bouge pas…', 'Bonjour monsieur l\'inspecteur.', 'Tout est en règle, promis.'],
    panique: ['NON ! Je panique ! Je cours !'],
    cupide: ['Il aura pas mon butin. Jamais.'],
  },
  event: {
    all: ['C\'est quoi ce délire ?', 'Évidemment. ÉVIDEMMENT.', 'Qui a touché à quelque chose ?', 'Ça arrive souvent, ça ?'],
    comique: ['C\'est moi. J\'ai appuyé sur un truc.'],
  },
  hide: {
    all: ['Je me planque.', 'Je suis un casier. Je suis un casier.', 'Personne ne me voit.'],
  },
  follow_rescuer: {
    all: ['Un sauveteur ! On est sauvés !', 'Je le suis, il a l\'air sympa.'],
  },
  mimic_hint: {
    all: ['Attends… {name} est pas censé être avec moi ?', 'Pourquoi {name} a pas de lampe ?'],
  },
};

// Lignes « déformées » utilisées par l'Écho et le Dernier Invité (identifiables comme fausses).
export const MIMIC_LINES = ['P-p-par ici !', 'J\'ai… j\'ai un… objet…', 'Venez vvvoir…', 'C\'est c-calme. Trop c-calme.', 'Au s-s-secours…', 'Le fourgon est par ici-ici-ici.'];

export const RESCUER_LINES = ['Par ici ! La sortie de secours est par là !', 'Suivez-moi, je connais un raccourci !', 'Restez près de moi, vous êtes en sécurité.', 'Plus vite ! C\'est juste derrière cette porte !', 'Faites-moi confiance. Je suis secouriste.'];
