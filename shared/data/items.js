// Objets récupérables. Ajouter une entrée ici suffit pour qu'elle puisse apparaître
// (si elle est référencée dans une table de butin d'un thème ou par un événement).
//
// value    : [min, max] valeur en crédits à neuf
// weight   : 1 léger · 2 moyen · 3 lourd (ralentit, porter à deux aide) · 4 très lourd
// radius   : taille physique en cases
// fragile  : 0 = incassable · 1 = perd très vite sa valeur aux chocs
// loud     : multiplicateur du bruit d'impact
// shape    : clé de dessin côté client
export const ITEMS = {
  vase:       { name: 'Vase Ming (probablement)', value: [90, 160], weight: 1, radius: 0.22, fragile: 1.0, loud: 1.3, shape: 'vase', color: '#5b8fd6' },
  lamp:       { name: 'Lampe de chevet hantée', value: [30, 60], weight: 1, radius: 0.2, fragile: 0.5, loud: 1.0, shape: 'lamp', color: '#e0c060' },
  radio_old:  { name: 'Vieux poste radio', value: [50, 90], weight: 2, radius: 0.26, fragile: 0.4, loud: 1.2, shape: 'radio', color: '#8a5a3a' },
  painting:   { name: 'Tableau d\'un monsieur triste', value: [110, 200], weight: 2, radius: 0.3, fragile: 0.6, loud: 0.9, shape: 'painting', color: '#a07040' },
  tv:         { name: 'Télé cathodique', value: [80, 140], weight: 3, radius: 0.34, fragile: 0.8, loud: 1.6, shape: 'tv', color: '#3a3a42' },
  safe:       { name: 'Petit coffre-fort', value: [220, 340], weight: 4, radius: 0.36, fragile: 0.0, loud: 2.2, shape: 'safe', color: '#55606a' },
  statue:     { name: 'Statue de flamant rose', value: [120, 190], weight: 3, radius: 0.3, fragile: 0.5, loud: 1.4, shape: 'flamingo', color: '#ff7aa8' },
  clock:      { name: 'Horloge qui avance', value: [60, 110], weight: 2, radius: 0.24, fragile: 0.7, loud: 1.1, shape: 'clock', color: '#c9a36a' },
  crate:      { name: 'Caisse « NE PAS OUVRIR »', value: [70, 130], weight: 3, radius: 0.36, fragile: 0.2, loud: 1.5, shape: 'crate', color: '#9b7a4a' },
  toolbox:    { name: 'Caisse à outils', value: [40, 70], weight: 2, radius: 0.24, fragile: 0.0, loud: 1.8, shape: 'toolbox', color: '#c0392b' },
  gnome:      { name: 'Nain de jardin', value: [15, 30], weight: 1, radius: 0.2, fragile: 0.6, loud: 0.8, shape: 'gnome', color: '#d04040' },
  bottle:     { name: 'Grand cru douteux', value: [70, 120], weight: 1, radius: 0.16, fragile: 1.0, loud: 1.2, shape: 'bottle', color: '#6a1b3a' },
  trophy:     { name: 'Trophée du meilleur employé', value: [80, 120], weight: 1, radius: 0.2, fragile: 0.2, loud: 1.0, shape: 'trophy', color: '#e8c547' },
  servers:    { name: 'Baie de serveurs', value: [250, 380], weight: 4, radius: 0.4, fragile: 0.5, loud: 2.0, shape: 'servers', color: '#2c3e50' },
  jar:        { name: 'Bocal à spécimen', value: [90, 150], weight: 1, radius: 0.18, fragile: 1.0, loud: 1.0, shape: 'jar', color: '#7fd67f' },
  microscope: { name: 'Microscope de luxe', value: [130, 190], weight: 2, radius: 0.22, fragile: 0.8, loud: 1.2, shape: 'microscope', color: '#bfc7d0' },
  piano:      { name: 'Piano droit', value: [400, 520], weight: 4, radius: 0.45, fragile: 0.3, loud: 3.0, shape: 'piano', color: '#2a1a12', twoHanded: true },
  suitcase:   { name: 'Valise oubliée', value: [60, 140], weight: 2, radius: 0.26, fragile: 0.1, loud: 1.0, shape: 'suitcase', color: '#7b4b94' },
  chandelier: { name: 'Lustre en cristal', value: [200, 300], weight: 3, radius: 0.34, fragile: 1.0, loud: 2.0, shape: 'chandelier', color: '#dfe8ff' },
  // Objets spéciaux (événements, secrets)
  golden_gnome: { name: 'Nain de jardin DORÉ', value: [600, 600], weight: 2, radius: 0.22, fragile: 0.0, loud: 1.0, shape: 'gnome', color: '#ffd700', secret: true },
  duck:       { name: 'Canard géant certifié ISO-9001', value: [10, 10], weight: 2, radius: 0.3, fragile: 0.0, loud: 0.6, shape: 'duck', color: '#ffd23f', squeak: true, quest: true },
  urgent_box: { name: 'Colis URGENT', value: [300, 380], weight: 3, radius: 0.32, fragile: 0.3, loud: 1.4, shape: 'parcel', color: '#e67e22' },
  junk:       { name: 'Truc sans valeur', value: [1, 4], weight: 1, radius: 0.18, fragile: 0.0, loud: 0.8, shape: 'junk', color: '#777777' },
  decoy:      { name: 'Leurre sonore', value: [0, 0], weight: 1, radius: 0.14, fragile: 0.0, loud: 0.5, shape: 'decoy', color: '#2ecc71', noLoot: true },
};

export function itemDef(type) { return ITEMS[type] || ITEMS.junk; }
