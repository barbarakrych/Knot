/* Point de départ : charge le contenu, démarre les deux onglets et gère le passage d'un écran à l'autre
   (accueil, Action ou Vérité, Pour plus tard, Réglages). */
import { $ } from './commun.js';
import { CLES, lire, ecrire, effacer } from './stockage.js';
import { chargerContenu } from './contenu.js';
import { demarrerActionVerite } from './action-verite.js';
import { demarrerPourPlusTard } from './pour-plus-tard.js';
import { coupleLocal, actualiser, nomsDuCouple } from './couple.js';
import * as partie from './partie.js';
import { surveillerMisesAJour } from './mise-a-jour.js';
import { preparerAccueil } from './accueil.js';
import { preparerReglages } from './reglages.js';
import { appliquerTheme } from './theme.js';

const FOOTER = {
  av: '',
  topics: 'Un sujet quand vous voulez, à votre rythme.'
};
const ECRANS_DE_JEU = ['av', 'topics'];

// Montre la page d'un coup, déjà dans son bon état. La classe « chargement » (voir index.html) la gardait invisible
// et sans animation. On attend les polices (au plus 1,5 s) pour que le texte ne change pas de forme sous nos yeux.
async function montrerPage() {
  try { await Promise.race([document.fonts.ready, new Promise(ok => setTimeout(ok, 1500))]); } catch (e) {}
  void document.body.offsetWidth; // le navigateur prend en compte l'état final avant de réactiver les animations
  document.documentElement.classList.remove('chargement');
}

async function demarrer() {
  appliquerTheme(); // déjà posé par le petit script d'index.html ; on le confirme ici, même si le contenu ne charge pas
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

  // v : 'av', 'topics' (les deux onglets du jeu), 'reglages' ou 'accueil'
  function setView(v) {
    const jeu = ECRANS_DE_JEU.includes(v);
    $('tab-av').setAttribute('aria-selected', String(v === 'av'));
    $('tab-topics').setAttribute('aria-selected', String(v === 'topics'));
    document.querySelector('.tabs').hidden = !jeu;
    $('view-av').hidden = v !== 'av';
    $('view-topics').hidden = v !== 'topics';
    $('view-reglages').hidden = v !== 'reglages';
    $('view-accueil').hidden = v !== 'accueil';
    $('footer').textContent = FOOTER[v] || '';
    $('footer').hidden = !FOOTER[v];
    if (jeu) ecrire(CLES.ecran, { ...lire(CLES.ecran, {}), view: v });
    if (v !== 'reglages') reglages.fermer();
    plusTard.montrer(v === 'topics');
    scrollTo(0, 0);
  }
  const ongletDuJeu = () => (lire(CLES.ecran, {}).view === 'topics' ? 'topics' : 'av');

  // Sous le titre : « ♥ [l'autre] et [moi] », et l'engrenage. Rien tant que le couple n'existe pas.
  function afficherCouple(c) {
    $('couple').hidden = !c;
    $('ouvrir-reglages').hidden = !c;
    if (c) $('couple-noms').textContent = nomsDuCouple(c);
  }

  // Ce téléphone n'a pas (ou plus) de couple → accueil, et la partie de l'ancien couple est oubliée
  function versAccueil() {
    effacer(CLES.couple);
    partie.oublier();
    afficherCouple(null);
    accueil.ouvrir();
    setView('accueil');
  }

  // La partie partagée démarre dès que le couple est connu.
  // Si la base dit que ce téléphone n'a plus de place dans le couple, on vérifie puis on revient à l'accueil.
  function jouerAvec(c) {
    partie.demarrer(c, {
      detache: () => actualiser().then(c2 => { if (!c2) versAccueil(); }).catch(() => {})
    });
  }

  const accueil = preparerAccueil(c => { afficherCouple(c); jouerAvec(c); setView(ongletDuJeu()); });
  const reglages = preparerReglages(versAccueil);

  $('tab-av').onclick = () => setView('av');
  $('tab-topics').onclick = () => setView('topics');
  $('ouvrir-reglages').onclick = () => {
    if ($('view-reglages').hidden) { reglages.ouvrir(coupleLocal()); setView('reglages'); }
    else setView(ongletDuJeu());
  };
  $('fermer-reglages').onclick = () => setView(ongletDuJeu());

  // Démarrage : le couple gardé sur l'appareil s'affiche tout de suite (même hors ligne),
  // puis on vérifie discrètement auprès de Supabase (prénoms changés, téléphone détaché…).
  const couple = coupleLocal();
  if (couple) {
    afficherCouple(couple);
    jouerAvec(couple);
    setView(ongletDuJeu());
    actualiser().then(c => { if (c) afficherCouple(c); else versAccueil(); })
      .catch(e => console.info('Couple non vérifié (hors ligne ?) :', e.message));
  } else {
    versAccueil();
  }
  montrerPage();
}

demarrer();

// Service worker (sw.js) : garde une copie de l'app sur l'appareil pour qu'elle marche hors ligne,
// et installe les nouvelles versions toutes seules, à un moment calme (voir mise-a-jour.js).
surveillerMisesAJour();
