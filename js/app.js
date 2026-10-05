/* Point de départ : charge le contenu, démarre les deux onglets et gère le passage de l'un à l'autre. */
import { $ } from './commun.js';
import { CLES, lire, ecrire } from './stockage.js';
import { chargerContenu } from './contenu.js';
import { demarrerActionVerite } from './action-verite.js';
import { demarrerPourPlusTard } from './pour-plus-tard.js';

const FOOTER = {
  av: '',
  topics: 'Un sujet quand vous voulez, à votre rythme.'
};

// Montre la page d'un coup, déjà dans son bon état. La classe « chargement » (voir index.html) la gardait invisible
// et sans animation. On attend les polices (au plus 1,5 s) pour que le texte ne change pas de forme sous nos yeux.
async function montrerPage() {
  try { await Promise.race([document.fonts.ready, new Promise(ok => setTimeout(ok, 1500))]); } catch (e) {}
  void document.body.offsetWidth; // le navigateur prend en compte l'état final avant de réactiver les animations
  document.documentElement.classList.remove('chargement');
  // Une fois l'app dessinée, on prévient le service worker : il livre « pret.gif », le navigateur annonce
  // « page chargée » et l'écran de démarrage d'Android peut laisser la place à l'app.
  // (Secours au bout de 200 ms : quand la page n'est pas à l'écran, le navigateur ne dessine pas.)
  let dit = false;
  const direPret = () => {
    if (dit) return; dit = true;
    if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('pret');
  };
  requestAnimationFrame(() => setTimeout(direPret, 0));
  setTimeout(direPret, 200);
}

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
    montrerPage();
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
    $('footer').hidden = !FOOTER[v];
    ecrire(CLES.ecran, { ...lire(CLES.ecran, {}), view: v });
    plusTard.montrer(v === 'topics');
  }
  $('tab-av').onclick = () => setView('av');
  $('tab-topics').onclick = () => setView('topics');

  setView(lire(CLES.ecran, {}).view === 'topics' ? 'topics' : 'av');
  montrerPage();
}

demarrer();

// Service worker (sw.js) : garde une copie de l'app sur l'appareil pour qu'elle marche hors ligne.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('Hors ligne indisponible :', e));
}
