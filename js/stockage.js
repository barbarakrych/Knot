/* Mémoire de l'appareil (localStorage).
   Le navigateur garde ces données pour ce site, même après rechargement ou fermeture.
   Tout est protégé par try/catch : si la mémoire est bloquée (navigation privée…),
   l'app marche quand même, elle oublie simplement en partant. */

export const CLES = {
  partie: 'knot-partie',      // dernière copie de la partie du couple reçue de Supabase (voir partie.js)
  attente: 'knot-attente',    // gestes faits sur ce téléphone, pas encore envoyés à Supabase
  ecran: 'knot-ecran',        // onglet et paquet ouverts (propres à ce téléphone)
  couple: 'knot-couple',      // prénoms, place de ce téléphone et codes, copiés depuis Supabase
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
