// Cosmétiques : purement visuels, aucun avantage en jeu (pas de pay-to-win).
// Tout se débloque avec des crédits gagnés en mission ou des niveaux / succès. Aucun achat réel.
export const COSMETICS = {
  suit: [
    { id: 'orange', name: 'Combinaison réglementaire', color: '#e67e22', price: 0 },
    { id: 'blue', name: 'Bleu de travail', color: '#3a7bd5', price: 0 },
    { id: 'green', name: 'Vert sapin', color: '#2e9d5b', price: 0 },
    { id: 'red', name: 'Rouge alerte', color: '#cf3a3a', price: 0 },
    { id: 'purple', name: 'Violet cadre', color: '#8e44ad', price: 120 },
    { id: 'pink', name: 'Rose bonbon', color: '#ff7eb6', price: 120 },
    { id: 'white', name: 'Blanc laboratoire', color: '#e8e8e8', price: 180 },
    { id: 'black', name: 'Noir ninja (pas plus discret)', color: '#26262b', price: 250 },
    { id: 'gold', name: 'Or massif', color: '#e8c547', price: 0, achievement: 'golden_gnome' },
    { id: 'camo', name: 'Camouflage douteux', color: '#6b7d3a', price: 200, level: 4 },
  ],
  mask: [
    { id: 'visor', name: 'Visière standard', price: 0 },
    { id: 'goggles', name: 'Lunettes de soudeur', price: 0 },
    { id: 'smile', name: 'Masque sourire', price: 150 },
    { id: 'gas', name: 'Masque à gaz', price: 200 },
    { id: 'paper', name: 'Sac en papier', price: 80 },
    { id: 'hockey', name: 'Masque de gardien', price: 220, level: 3 },
    { id: 'cyclops', name: 'Mono-lentille', price: 260, level: 5 },
  ],
  hat: [
    { id: 'none', name: 'Aucun', price: 0 },
    { id: 'helmet', name: 'Casque de chantier', price: 0 },
    { id: 'beanie', name: 'Bonnet', price: 60 },
    { id: 'cap', name: 'Casquette', price: 60 },
    { id: 'crown', name: 'Couronne en carton', price: 300, level: 3 },
    { id: 'antenna', name: 'Antenne', price: 140 },
    { id: 'chef', name: 'Toque', price: 160 },
    { id: 'party', name: 'Chapeau de fête', price: 0, achievement: 'confetti' },
  ],
  light: [
    { id: 'warm', name: 'Faisceau chaud', color: '255,230,170', price: 0 },
    { id: 'cold', name: 'Faisceau froid', color: '200,225,255', price: 100 },
    { id: 'pink', name: 'Faisceau disco', color: '255,170,220', price: 180 },
    { id: 'green', name: 'Faisceau radioactif', color: '180,255,170', price: 220, level: 4 },
  ],
  emote: [
    { id: 'wave', name: 'Coucou', price: 0, text: '👋' },
    { id: 'panic', name: 'Panique', price: 0, text: '😱' },
    { id: 'thumb', name: 'Pouce', price: 0, text: '👍' },
    { id: 'shh', name: 'Chut', price: 0, text: '🤫' },
    { id: 'dance', name: 'Danse de la victoire', price: 120, text: '💃' },
    { id: 'skull', name: 'C\'est fini', price: 90, text: '💀' },
    { id: 'money', name: 'Kaching', price: 150, text: '💰' },
    { id: 'clown', name: 'Clown', price: 200, level: 3, text: '🤡' },
  ],
  title: [
    { id: 'intern', name: 'Stagiaire', price: 0 },
    { id: 'mover', name: 'Déménageur du dimanche', price: 0, level: 2 },
    { id: 'coward', name: 'Lâche professionnel', price: 0, achievement: 'abandon' },
    { id: 'hero', name: 'Héros du quotidien', price: 0, achievement: 'revive5' },
    { id: 'rich', name: 'Employé du mois', price: 0, achievement: 'rich' },
    { id: 'loud', name: 'Mégaphone humain', price: 0, achievement: 'loudest' },
    { id: 'ghost', name: 'Fantôme bavard', price: 0, achievement: 'ghost' },
    { id: 'ceo', name: 'Futur PDG', price: 0, level: 8 },
  ],
};

export const DEFAULT_COSMETICS = { suit: 'orange', mask: 'visor', hat: 'helmet', light: 'warm', emotes: ['wave', 'panic', 'thumb', 'shh'], title: 'intern' };

export function cosmeticById(slot, id) {
  return (COSMETICS[slot] || []).find((c) => c.id === id) || COSMETICS[slot]?.[0];
}
