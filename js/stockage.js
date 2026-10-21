/* Mémoire de l'appareil (localStorage).
   Le navigateur garde ces données pour ce site, même après rechargement ou fermeture.
   Tout est protégé par try/catch : si la mémoire est bloquée (navigation privée…),
   l'app marche quand même, elle oublie simplement en partant. */

export const CLES = {
  partie: 'knot-partie',      // dernière copie de la partie du couple reçue de Supabase (voir partie.js)
  attente: 'knot-attente',    // gestes faits sur ce téléphone, pas encore envoyés à Supabase
  ecran: 'knot-ecran',        // onglet et paquet ouverts (propres à ce téléphone)
  couple: 'knot-couple',      // prénoms, place de ce téléphone et codes, copiés depuis Supabase
  ancien: 'knot-ancien',      // { prenomMoi, prenomAutre } du couple que ce téléphone vient de perdre (écran de secours)
  retenue: 'knot-retenue',    // carte révélée gardée à l'écran jusqu'à « J'ai lu · voir la carte tirée » (action-verite.js)
  son: 'knot-son',            // réglage « Son » de ce téléphone : false = coupé (voir son.js)
  brouillon: 'knot-brouillon', // copie du brouillon d'une carte chronométrée, en cas de coupure (effacée une fois envoyé)
  revelees: 'knot-revelees',  // cartes dont la révélation (la carte qui se retourne) a déjà été jouée ici (voir reponses.js)
  theme: 'knot-theme',        // thème choisi sur ce téléphone : 'clair', 'sombre' ou 'auto' (voir theme.js)
  // Avant l'étape 4, la partie restait sur le téléphone. Ces clés ne sont plus que lues une fois,
  // pour que la progression déjà faite rejoigne la partie du couple (puis elles sont effacées).
  pioche: 'knot-pioche',      // cartes tirées, carte affichée, cartes ajoutées
  distance: 'knot-distance',  // interrupteur « À distance »
  paquets: 'knot-paquets'     // progression dans chaque paquet « Pour plus tard »
};

export function lire(cle, parDefaut) {
  try {
    const brut = localStorage.getItem(cle);
    if (brut === null) return parDefaut;
    const valeur = JSON.parse(brut);
    return valeur === null || valeur === undefined ? parDefaut : valeur;
  } catch (e) {
    return parDefaut;
  }
}

export function ecrire(cle, valeur) {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) {}
}

export function effacer(cle) {
  try { localStorage.removeItem(cle); } catch (e) {}
}
