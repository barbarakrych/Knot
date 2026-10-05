/* Point de départ : charge le contenu, démarre les deux onglets et gère le passage de l'un à l'autre. */
import { $ } from './commun.js';
import { CLES, lire, ecrire } from './stockage.js';
import { chargerContenu } from './contenu.js';
import { demarrerActionVerite } from './action-verite.js';
import { demarrerPourPlusTard } from './pour-plus-tard.js';

const FOOTER = {
  av: 'Rien à écrire ici : parlez-en, et gardez le reste dans votre carnet.',
  topics: 'Un sujet quand vous voulez, à votre rythme.'
};

async function demarrer() {
  let contenu;
  try {
    contenu = await chargerContenu();
  } catch (e) {
    console.error(e);
    $('view-av').hidden = true;
    const err = $('loaderr');
    err.textContent = 'Les cartes n’ont pas pu être chargées. Recharge la page ; si ça continue, vérifie que l’app est bien ouverte via le serveur (http://…) et pas en double-cliquant sur le fichier.';
    err.hidden = false;
    return;
  }

  demarrerActionVerite(contenu);
  const plusTard = demarrerPourPlusTard(contenu);

  function setView(v) {
    $('tab-av').setAttribute('aria-selected', String(v === 'av'));
    $('tab-topics').setAttribute('aria-selected', String(v === 'topics'));
    $('view-av').hidden = v !== 'av';
    $('view-topics').hidden = v !== 'topics';
    $('footer').textContent = FOOTER[v];
    ecrire(CLES.ecran, { ...lire(CLES.ecran, {}), view: v });
    plusTard.montrer(v === 'topics');
  }
  $('tab-av').onclick = () => setView('av');
  $('tab-topics').onclick = () => setView('topics');

  setView(lire(CLES.ecran, {}).view === 'topics' ? 'topics' : 'av');
}

demarrer();

// Service worker (sw.js) : garde une copie de l'app sur l'appareil pour qu'elle marche hors ligne.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('Hors ligne indisponible :', e));
}
