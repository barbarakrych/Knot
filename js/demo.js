/* Mode démo : une personne seule découvre toute l'app, sans couple ni compte.
   Rien n'est envoyé à Supabase : la partie reste dans la mémoire de l'onglet (sessionStorage),
   effacée à la fermeture de l'onglet ou quand on quitte la démo.
   On y entre seulement par le bouton « Découvrir en mode démo » de l'accueil. Le lien partagé (…/?demo=1, sur le site
   et dans les mails) arrive sur l'accueil comme n'importe quelle ouverture : on voit le parcours d'entrée avant la démo.
   La partie et le couple « réels » de ce téléphone (localStorage) ne sont jamais touchés. */

const CLE = 'knot-demo';             // '1' tant que l'onglet est en démo (garde la démo après un rechargement)
export const CLE_PARTIE = 'knot-demo-partie';

function lireSession(cle) { try { return sessionStorage.getItem(cle); } catch (e) { return null; } }

// Démo déjà lancée dans cet onglet (rechargement, mise à jour de l'app) : on y reste.
let actif = lireSession(CLE) === '1';

export function estDemo() { return actif; }

export function entrerDemo() {
  actif = true;
  try { sessionStorage.setItem(CLE, '1'); } catch (e) {}
}

// Quitter : on oublie la démo et on rouvre l'app à son adresse normale (sans ?demo=1).
// Le démarrage habituel reprend : accueil, ou la partie du couple si ce téléphone en a un.
export function quitterDemo() {
  try { sessionStorage.removeItem(CLE); sessionStorage.removeItem(CLE_PARTIE); } catch (e) {}
  location.replace(location.pathname);
}

// Couple interne de la démo : il ne sert qu'au fonctionnement (place 1). Aucun prénom n'est affiché.
export const COUPLE_DEMO = { place: 1, prenomMoi: '', prenomAutre: '', complet: true, codeCouple: 'demo', codeRelier: null };
