/* Mises à jour automatiques de l'app.
   Le service worker (sw.js) télécharge une nouvelle version en arrière-plan. Quand elle est prête, on attend
   un moment calme, on lui dit « installer », puis l'app se recharge une seule fois, discrètement.

   Moment calme = rien ne serait interrompu : pas de minuteur qui tourne, pas de texte en train d'être écrit,
   pas d'étape de l'accueil en cours, pas de carte en train de glisser. Et en plus :
   • soit la personne n'a encore rien touché depuis l'ouverture (ou depuis son retour dans l'app) ;
   • soit l'app vient de passer en arrière-plan (on la quitte un instant) : le rechargement ne se voit pas. */
import { etat, maintenant } from './partie.js';

function minuteurEnCours() {
  const m = etat().minuteur;
  return !!(m && m.marche && m.fin > maintenant());
}
function texteEnCours() {
  return [...document.querySelectorAll('input[type="text"], textarea')].some(c => c.value.trim());
}
function accueilEnCours() {
  const accueil = document.getElementById('view-accueil');
  return !!accueil && !accueil.hidden && document.getElementById('acc-choix').hidden;
}
function animationEnCours() { return !!document.querySelector('.swipe'); }

function calme() { return !minuteurEnCours() && !texteEnCours() && !accueilEnCours() && !animationEnCours(); }

// A-t-on touché l'app depuis l'ouverture (ou depuis le retour dans l'app) ?
let touchee = false;
function guetterPremierGeste() {
  touchee = false;
  const geste = () => {
    touchee = true;
    removeEventListener('pointerdown', geste, true);
    removeEventListener('keydown', geste, true);
  };
  addEventListener('pointerdown', geste, true);
  addEventListener('keydown', geste, true);
}

export function surveillerMisesAJour() {
  if (!('serviceWorker' in navigator)) return;
  const dejaGeree = !!navigator.serviceWorker.controller; // false à la toute première installation
  let prete = null;       // nouvelle version téléchargée, qui attend
  let demandee = false;   // on lui a dit « installer »

  guetterPremierGeste();

  // La nouvelle version a pris la place : on recharge, une seule fois. La page devient invisible juste avant,
  // comme au démarrage (classe « chargement »), pour que rien ne clignote.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!demandee) return;
    document.documentElement.classList.add('chargement');
    location.reload();
  });

  function essayer() {
    if (!prete || demandee || !calme()) return;
    if (touchee && document.visibilityState === 'visible') return; // on attend un vrai moment calme
    demandee = true;
    prete.postMessage('installer');
  }

  navigator.serviceWorker.register('sw.js').then(reg => {
    const attendre = sw => {
      if (!sw) return;
      const pret = () => { if (sw.state === 'installed' && dejaGeree) { prete = sw; essayer(); } };
      sw.addEventListener('statechange', pret);
      pret();
    };
    attendre(reg.waiting);                                     // déjà téléchargée lors d'une ouverture précédente
    reg.addEventListener('updatefound', () => attendre(reg.installing));

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        guetterPremierGeste();
        reg.update().catch(() => {});                          // retour dans l'app : y a-t-il du nouveau ?
      }
      essayer();
    });
    // L'app reste ouverte longtemps : on vérifie de temps en temps, et on réessaie quand le minuteur s'arrête, etc.
    setInterval(() => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); }, 30 * 60 * 1000);
    setInterval(essayer, 3000);
  }).catch(e => console.warn('Hors ligne indisponible :', e));
}
