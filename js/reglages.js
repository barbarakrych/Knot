/* Écran Réglages (l'engrenage en haut à droite).
   Un bloc <section class="reglage"> par réglage dans index.html. De haut en bas : « À distance » (partagé avec l'autre
   téléphone), le thème (propre à ce téléphone, voir theme.js), puis le couple (code à donner à l'autre,
   ou « Relier le téléphone de [l'autre] »). */
import { $, el, copier } from './commun.js';
import { actualiser, demanderCodeRelier, messageErreur } from './couple.js';
import { etat, agir, ecouter } from './partie.js';
import { themeChoisi, themeSuivant, choisirTheme } from './theme.js';
import { estDemo } from './demo.js';

// Icônes du bouton Thème, en trait simple comme l'engrenage (pas de caractère : l'iPhone en ferait des émojis)
const ICONES_THEME = {
  sombre: '<path d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6Z"/>',
  clair: '<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.5 1.5M17.1 17.1l1.5 1.5M5.4 18.6l1.5-1.5M17.1 6.9l1.5-1.5"/>',
  auto: '<path d="M6.4 19.5 12 4.5l5.6 15M8.5 14h7"/>'
};
const NOMS_THEME = { sombre: 'sombre', clair: 'clair', auto: 'auto, comme le téléphone' };

// detache() : appelée si la base dit que ce téléphone ne fait plus partie du couple.
export function preparerReglages(detache) {
  let ouvert = false;

  // Interrupteur partagé : il montre la partie, et un appui envoie l'ordre à l'autre téléphone aussi.
  // À distance : activé, il retire les actions « ensemble » ; désactivé, les actions « distance ».
  const INTERRUPTEURS = { distsw: 'distance' };
  function afficherInterrupteurs() {
    const e = etat();
    for (const [id, cle] of Object.entries(INTERRUPTEURS)) $(id).setAttribute('aria-checked', String(e[cle] !== false));
  }
  for (const [id, cle] of Object.entries(INTERRUPTEURS)) {
    $(id).onclick = () => agir([{ set: [cle], valeur: etat()[cle] === false }]);
  }
  ecouter(afficherInterrupteurs);
  afficherInterrupteurs();

  // Thème : un seul bouton. Chaque appui passe au mode suivant (sombre → clair → auto), appliqué tout de suite
  // à toute l'app et gardé sur l'appareil. La phrase sur Auto ne s'affiche qu'en mode Auto.
  function afficherTheme() {
    const t = themeChoisi();
    const b = $('themebtn');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONES_THEME[t] + '</svg>';
    const libelle = 'Thème : ' + NOMS_THEME[t] + '. Toucher pour changer';
    b.setAttribute('aria-label', libelle);
    b.title = libelle;
    $('themeauto').hidden = t !== 'auto';
  }
  $('themebtn').onclick = () => { choisirTheme(themeSuivant()); afficherTheme(); };
  afficherTheme();

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
    // En démo : pas de bloc « Notre couple » (pas de couple, pas de Supabase).
    ouvrir(c) {
      ouvert = true;
      $('reglage-couple').hidden = estDemo();
      if (estDemo()) return;
      rendre(c);
      actualiser().then(c2 => {
        if (!ouvert) return;
        if (c2) rendre(c2); else detache();
      }).catch(() => {});
    },
    fermer() { ouvert = false; }
  };
}
