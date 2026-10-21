/* Son de fin du minuteur des cartes Action (sons/fin-minuteur.wav, fabriqué par outils/generer-son.js).

   Quand sonner : le minuteur est dans la partie partagée { cle, marche, fin } (fin = heure du serveur, voir partie.js).
   Ce fichier prévoit un seul réveil (setTimeout) pour l'instant exact où il atteint 0, quel que soit l'écran affiché.
   À chaque changement de la partie, l'ancien réveil est annulé et un nouveau est prévu : jamais deux à la fois.
   Une « course » = une carte + une heure de fin. Elle ne sonne qu'une fois. Relancer, reprendre après une pause
   ou recommencer donne une nouvelle heure de fin, donc une nouvelle course, qui pourra sonner à son tour.
   Le minuteur est partagé : il sonne sur les deux téléphones, si l'app est ouverte.

   Comment : Web Audio, qui suit le volume du téléphone. Sur iPhone, il se tait en mode silencieux
   (type « ambient » demandé quand c'est possible), et ne coupe pas la musique en cours.
   Les navigateurs n'acceptent de jouer un son qu'après un geste de la personne : au premier appui dans l'app,
   on prépare le son, pour qu'il puisse sonner plus tard tout seul (même si c'est l'autre qui a lancé le minuteur). */
import { etat, ecouter, maintenant } from './partie.js';
import { CLES, lire, ecrire } from './stockage.js';

// Réglage « Son du minuteur » (propre à ce téléphone) : un volume de 0 à 100, 70 par défaut.
// 0 = aucun minuteur ne sonne (la vibration reste). Ancien réglage oui/non : oui → 70, non → 0.
export const VOLUME_DEFAUT = 70;
export function volumeSon() {
  const v = lire(CLES.son, VOLUME_DEFAUT);
  if (v === true) return VOLUME_DEFAUT;
  if (v === false) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : VOLUME_DEFAUT;
}
export function choisirVolume(v) { ecrire(CLES.son, Math.min(100, Math.max(0, Math.round(Number(v) || 0)))); }

const FICHIER = 'sons/fin-minuteur.wav';
// App en arrière-plan : le téléphone peut endormir les réveils. Si on revient plus de 5 s après la fin,
// on ne sonne pas en retard (l'écran affiche déjà « Temps écoulé »).
const RETARD_MAX = 5000;

let audio = null, tampon = null, chargement = null;
let reveil = null;          // le seul réveil prévu
const sonnees = new Set();  // courses qui ont déjà sonné (ou sont passées) : jamais deux fois
let concerne = () => false; // le minuteur de cette clé est-il celui d'une carte Action ?

function contexte() {
  if (!audio) {
    const Contexte = window.AudioContext || window.webkitAudioContext;
    if (!Contexte) return null;
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) {}
    audio = new Contexte();
  }
  return audio;
}

function charger() {
  const c = contexte();
  if (!c || tampon) return Promise.resolve();
  if (!chargement) {
    chargement = fetch(FICHIER)
      .then(r => r.arrayBuffer())
      .then(octets => new Promise((ok, ko) => c.decodeAudioData(octets, ok, ko))) // forme acceptée aussi par les vieux Safari
      .then(t => { tampon = t; })
      .catch(e => { chargement = null; console.info('Son non chargé :', e && e.message); });
  }
  return chargement;
}

// À chaque geste : le son est autorisé et prêt (et réveillé, si le téléphone l'avait endormi en arrière-plan).
function preparer() {
  const c = contexte(); if (!c) return;
  if (c.state !== 'running') c.resume().catch(() => {});
  charger();
}

function jouer() {
  const c = contexte();
  const v = volumeSon();
  if (!c || !tampon || !v) return;
  if (c.state !== 'running') c.resume().catch(() => {});
  const source = c.createBufferSource();
  const volume = c.createGain();
  source.buffer = tampon;
  volume.gain.value = v / 100; // ne peut que baisser le son : le maximum reste le volume du téléphone
  source.connect(volume);
  volume.connect(c.destination);
  source.start();
}

/* Minuteur personnel d'une carte chronométrée (reponses.js).
   Au tap sur « Répondre » (un vrai geste) : on réveille le son et on joue un son muet d'un instant.
   Sans ça, l'iPhone refuserait de sonner plus tard, à la fin du temps, quand plus personne ne touche l'écran. */
export function debloquerSon() {
  const c = contexte(); if (!c) return;
  try {
    if (c.state !== 'running') c.resume().catch(() => {});
    const muet = c.createBufferSource();
    muet.buffer = c.createBuffer(1, 1, 22050);
    muet.connect(c.destination);
    muet.start(0);
  } catch (e) {}
  charger();
}

// Son d'essai, quand on relâche le curseur du volume dans les Réglages (pour ne pas régler à l'aveugle)
export function essayerSon() {
  preparer();
  charger().then(jouer);
}

// Fin du temps de mon minuteur : le son doux (au volume du réglage, rien à 0) et une vibration courte (si possible)
export function sonnerFinReponse() {
  jouer();
  try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) {}
}

const course = m => m.cle + '@' + m.fin;

function prevoir() {
  clearTimeout(reveil); reveil = null;
  const m = etat().minuteur;
  if (!m || !m.marche || typeof m.fin !== 'number' || !concerne(m.cle)) return;
  const id = course(m);
  if (sonnees.has(id)) return;
  const delai = m.fin - maintenant();
  if (delai < -RETARD_MAX) { sonnees.add(id); return; } // fini depuis longtemps : pas de son en retard
  reveil = setTimeout(() => {
    reveil = null;
    const m2 = etat().minuteur;
    // Vérifié au dernier moment : toujours la même course, pas déjà sonnée, et pas trop en retard
    if (!m2 || !m2.marche || course(m2) !== id || sonnees.has(id)) return;
    sonnees.add(id);
    if (maintenant() - m2.fin <= RETARD_MAX) jouer();
  }, Math.max(0, delai));
}

// estAction(cle) : dit si la clé du minuteur est celle d'une carte Action (donné par action-verite.js).
export function sonnerALaFinDuMinuteur(estAction) {
  concerne = estAction;
  addEventListener('pointerdown', preparer, { passive: true });
  addEventListener('keydown', preparer);
  ecouter(prevoir);
  // Retour dans l'app : le réveil a pu être endormi, on le recalcule
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') prevoir(); });
  prevoir();
}
