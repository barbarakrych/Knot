/* Mémoire de l'appareil (localStorage).
   Le navigateur garde ces données pour ce site, même après rechargement ou fermeture.
   Tout est protégé par try/catch : si la mémoire est bloquée (navigation privée…),
   l'app marche quand même, elle oublie simplement en partant. */

export const CLES = {
  pioche: 'knot-pioche',      // cartes tirées, carte affichée, cartes ajoutées
  distance: 'knot-distance',  // interrupteur « À distance » (true ou false)
  paquets: 'knot-paquets',    // progression dans chaque paquet « Pour plus tard »
  ecran: 'knot-ecran'         // onglet et paquet ouverts
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
