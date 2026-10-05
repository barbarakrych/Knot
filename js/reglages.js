/* Écran Réglages (l'engrenage en haut à droite).
   Un bloc <section class="reglage"> par réglage dans index.html : thème, son et À distance s'ajouteront à côté (étape 6).
   Pour l'instant : le couple (code à donner à l'autre, ou « Relier le téléphone de [l'autre] »). */
import { $, el, copier } from './commun.js';
import { actualiser, demanderCodeRelier, messageErreur } from './couple.js';

// detache() : appelée si la base dit que ce téléphone ne fait plus partie du couple.
export function preparerReglages(detache) {
  let ouvert = false;

  // Code bien visible + bouton Copier + petite phrase d'aide
  function blocCode(etiquette, code, aide) {
    const copie = el('button', 'btn small', 'Copier');
    copie.type = 'button';
    copie.onclick = () => copier(code, copie);
    return [el('p', 'etiquette', etiquette), el('p', 'code-grand', code), copie, el('p', 'muted', aide)];
  }

  function rendre(c) {
    const box = $('reglage-couple-contenu');
    box.replaceChildren();
    const autre = c.prenomAutre;

    if (!c.complet) {
      // L'autre n'a pas encore rejoint : on garde le code du couple sous la main
      box.append(...blocCode('Code du couple · en attente de ' + autre, c.codeCouple,
        'Sur son téléphone, ' + autre + ' ouvre Knot et choisit « J’ai un code ».'));
      return;
    }

    const bouton = el('button', 'btn', 'Relier le téléphone de ' + autre);
    bouton.type = 'button';
    const note = el('p', 'note');
    note.hidden = true;
    box.append(bouton, el('p', 'muted', 'Si ' + autre + ' a supprimé l’app ou changé de téléphone.'), note);
    if (c.codeRelier) {
      box.append(...blocCode('Code en cours de validité · en attente de ' + autre, c.codeRelier,
        'Sur son nouveau téléphone, ' + autre + ' ouvre Knot, choisit « J’ai un code » et tape ce code. Il ne sert qu’une fois.'));
    }

    bouton.onclick = async () => {
      bouton.disabled = true;
      try {
        const c2 = await demanderCodeRelier();
        if (!c2) { detache(); return; }
        rendre(c2);
      } catch (e) {
        console.warn(e);
        note.textContent = messageErreur(e);
        note.hidden = false;
        bouton.disabled = false;
      }
    };
  }

  return {
    // Affiche tout de suite la copie de l'appareil, puis la version à jour de Supabase (ex. code relier déjà utilisé).
    ouvrir(c) {
      ouvert = true;
      rendre(c);
      actualiser().then(c2 => {
        if (!ouvert) return;
        if (c2) rendre(c2); else detache();
      }).catch(() => {});
    },
    fermer() { ouvert = false; }
  };
}
