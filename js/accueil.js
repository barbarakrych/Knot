/* Écran d'accueil (première ouverture) : « Créer notre couple » ou « J'ai un code ».
   Aucun prénom n'est écrit ici : ils viennent toujours de ce que le couple a tapé. */
import { $, copier } from './commun.js';
import { creerCouple, apercuCode, utiliserCode, messageErreur } from './couple.js';

const ETAPES = ['acc-choix', 'acc-form-creer', 'acc-code-cree', 'acc-form-code', 'acc-confirmer'];

// entrer(couple) : appelée quand le couple est prêt, pour ouvrir le jeu.
export function preparerAccueil(entrer) {
  let couple = null;     // couple qui vient d'être créé
  let codeTape = '';     // code tapé à l'étape « J'ai un code »

  function montrer(id) {
    ETAPES.forEach(e => { $(e).hidden = e !== id; });
    document.querySelectorAll('.accueil .note').forEach(n => { n.hidden = true; });
    const champ = $(id).querySelector('input');
    if (champ) champ.focus();
  }

  function erreur(id, e) {
    console.warn(e);
    $(id).textContent = messageErreur(e);
    $(id).hidden = false;
  }

  // Bouton occupé pendant l'échange avec Supabase
  async function occupe(bouton, travail) {
    if (bouton.disabled) return;
    const libelle = bouton.textContent;
    bouton.disabled = true;
    bouton.textContent = 'Un instant…';
    try { await travail(); } finally { bouton.disabled = false; bouton.textContent = libelle; }
  }

  $('acc-creer').onclick = () => montrer('acc-form-creer');
  $('acc-jai-code').onclick = () => montrer('acc-form-code');
  document.querySelectorAll('.accueil [data-retour]').forEach(b => { b.onclick = () => montrer('acc-choix'); });

  // Créer notre couple → affiche le code à donner à l'autre
  $('acc-form-creer').onsubmit = ev => {
    ev.preventDefault();
    occupe($('acc-creer-ok'), async () => {
      try {
        couple = await creerCouple($('acc-moi').value, $('acc-autre').value);
        $('acc-code').textContent = couple.codeCouple;
        $('acc-code-aide').textContent = 'Donne ce code à ' + couple.prenomAutre + ' : sur son téléphone, dans Knot, « J’ai un code ». Tu le retrouveras dans les Réglages (l’engrenage en haut à droite).';
        $('acc-partager').hidden = !navigator.share;
        montrer('acc-code-cree');
      } catch (e) { erreur('acc-creer-erreur', e); }
    });
  };
  $('acc-copier').onclick = () => copier(couple.codeCouple, $('acc-copier'));
  $('acc-partager').onclick = () => {
    navigator.share({
      title: 'Knot',
      text: 'Rejoins-moi sur Knot : ouvre l’app, choisis « J’ai un code » et tape ' + couple.codeCouple,
      url: location.origin + location.pathname
    }).catch(() => {});
  };
  $('acc-jouer').onclick = () => entrer(couple);

  // J'ai un code → « Tu es bien … ? »
  $('acc-form-code').onsubmit = ev => {
    ev.preventDefault();
    occupe($('acc-code-ok'), async () => {
      try {
        codeTape = $('acc-saisie-code').value;
        const apercu = await apercuCode(codeTape);
        $('acc-question').textContent = 'Tu es bien ' + apercu.prenom + ' ?';
        $('acc-confirmer-aide').textContent = apercu.type === 'relier'
          ? 'Ce téléphone va reprendre ta place dans le couple. L’ancien téléphone sera détaché.'
          : 'Tu vas rejoindre le couple.';
        $('acc-form-prenom').hidden = true;
        $('acc-corriger').hidden = false;
        $('acc-prenom').value = '';
        montrer('acc-confirmer');
      } catch (e) { erreur('acc-code-erreur', e); }
    });
  };

  async function rejoindre(bouton, prenom) {
    await occupe(bouton, async () => {
      try {
        const c = await utiliserCode(codeTape, prenom);
        if (!c) throw new Error('rejoindre');
        entrer(c);
      } catch (e) { erreur('acc-confirmer-erreur', e); }
    });
  }
  $('acc-oui').onclick = () => rejoindre($('acc-oui'), null);
  $('acc-corriger').onclick = () => {
    $('acc-corriger').hidden = true;
    $('acc-form-prenom').hidden = false;
    $('acc-prenom').focus();
  };
  $('acc-form-prenom').onsubmit = ev => {
    ev.preventDefault();
    rejoindre($('acc-form-prenom').querySelector('button'), $('acc-prenom').value);
  };

  return { ouvrir: () => montrer('acc-choix') };
}
