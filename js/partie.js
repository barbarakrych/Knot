/* La partie du couple, partagée entre les deux téléphones (étape 4).

   Comment ça marche :
   • Chaque geste (tirer, passer, remélanger…) devient une liste de petits « ordres » :
       { set: ['tirees', 'v12'], valeur: {…} }  → écrire une valeur
       { suppr: ['tirees', 'v12'] }            → l'effacer
     La fonction jouer() de Supabase applique exactement les mêmes ordres de son côté.
   • Un ordre est appliqué tout de suite sur ce téléphone, puis rangé dans une file d'attente (sur l'appareil)
     et envoyé à Supabase dès que le réseau le permet. Hors ligne, le jeu marche donc quand même.
   • Ce qu'on affiche = la dernière partie reçue de Supabase + les ordres encore en attente.
   • Temps réel : ce téléphone garde une connexion ouverte avec Supabase (un « WebSocket »).
     Dès que la partie du couple change, Supabase le prévient et il relit la partie.

   État de la partie :
     tirees   { id: { pile, at, par } }  cartes tirées (par = place 1 ou 2 de qui l'a tirée)
     affichee id de la carte affichée, ou null
     defi     id du défi en cours, ou null
     distance interrupteur « À distance »
     perso    { id: carte } cartes ajoutées
     paquets  { id: { i, max } } progression des paquets « Pour plus tard »
     minuteur { cle, marche, fin, reste } le minuteur commun (fin en heure du serveur) */
import { CLES, lire, ecrire, effacer } from './stockage.js';
import { obtenirClient, coupleLocal, actualiser } from './couple.js';

const VIDE = { tirees: {}, perso: {}, paquets: {}, distance: true, affichee: null, defi: null, minuteur: null };
const LOT = 300; // au plus 300 ordres par envoi (limite de jouer())

// base : { couple (code du couple), etat, version, decalage } · attente : ordres pas encore envoyés
let base = lire(CLES.partie, null);
let attente = lire(CLES.attente, []);
if (!Array.isArray(attente)) attente = [];
let reprise = lireAncienJeu();
let courant = null;
const auditeurs = new Set();

let options = {};      // { detache } donné par app.js
let canal = null;      // abonnement temps réel
let envoiEnCours = false, relectureEnCours = false, relireEncore = false, reessai = null;

/* ---------- Appliquer un ordre (la même règle que jouer() dans la base) ---------- */
export function appliquer(e, o) {
  const chemin = o.set || o.suppr;
  if (!Array.isArray(chemin) || !chemin.length) return e;
  const [cle, id] = chemin;
  const valeur = o.valeur === undefined ? null : o.valeur;
  if (chemin.length === 2) {
    const liste = { ...(e[cle] && typeof e[cle] === 'object' ? e[cle] : {}) };
    if (o.set) liste[id] = valeur; else delete liste[id];
    return { ...e, [cle]: liste };
  }
  const n = { ...e };
  if (o.set) n[cle] = valeur; else delete n[cle];
  return n;
}

function calculer() {
  let e = { ...VIDE, ...(base ? base.etat : {}) };
  if (reprise) for (const o of ordresReprise(e, base ? base.version : 0)) e = appliquer(e, o);
  for (const o of attente) e = appliquer(e, o);
  // Valeurs absentes (effacées) → valeurs par défaut
  for (const k of Object.keys(VIDE)) if (e[k] === undefined || (typeof VIDE[k] === 'object' && VIDE[k] && !e[k])) e[k] = VIDE[k];
  courant = e;
}

function prevenir(origine) {
  calculer();
  auditeurs.forEach(fn => { try { fn(courant, origine); } catch (err) { console.error(err); } });
}

function sauver() {
  if (base) ecrire(CLES.partie, base); else effacer(CLES.partie);
  ecrire(CLES.attente, attente);
}

/* ---------- Reprise de la progression faite avant l'étape 4 ---------- */
function lireAncienJeu() {
  const pioche = lire(CLES.pioche, null), paquets = lire(CLES.paquets, null), distance = lire(CLES.distance, null);
  if (!pioche && !paquets && distance === null) return null;
  return { pioche: pioche || {}, paquets: paquets || {}, distance };
}

// Ordres qui ajoutent l'ancien jeu à la partie e, sans rien effacer de ce que l'autre a déjà fait.
function ordresReprise(e, version) {
  const r = reprise, o = [];
  const p = r.pioche;
  for (const [id, v] of Object.entries(p.drawn || {})) {
    if (v && !e.tirees[id]) o.push({ set: ['tirees', id], valeur: { pile: v.pile, at: v.at || 0, par: null } });
  }
  for (const [id, c] of Object.entries(p.custom || {})) {
    if (c && !e.perso[id]) o.push({ set: ['perso', id], valeur: c });
  }
  if (!e.affichee && p.current) o.push({ set: ['affichee'], valeur: p.current });
  if (!e.defi && p.defi) o.push({ set: ['defi'], valeur: p.defi });
  for (const [id, d] of Object.entries(r.paquets || {})) {
    const serveur = e.paquets[id];
    if (d && typeof d.max === 'number' && (!serveur || d.max > serveur.max)) o.push({ set: ['paquets', id], valeur: { i: d.i, max: d.max } });
  }
  // L'interrupteur n'est repris que dans une partie toute neuve
  if (!version && typeof r.distance === 'boolean') o.push({ set: ['distance'], valeur: r.distance });
  return o;
}

// Appelé quand on a lu la vraie partie : l'ancien jeu devient des ordres à envoyer (en tête de file).
function terminerReprise() {
  if (!reprise || !base) return;
  const o = ordresReprise({ ...VIDE, ...base.etat }, base.version);
  reprise = null;
  effacer(CLES.pioche); effacer(CLES.paquets); effacer(CLES.distance);
  if (o.length) attente = o.concat(attente);
  sauver();
}

/* ---------- Échanges avec Supabase ---------- */
function codeErreur(error) { return error && error.message ? String(error.message) : ''; }

// Reçu de jouer() : on garde la partie si elle est au moins aussi récente que la nôtre.
function recevoir(data, t0) {
  if (!data || !data.etat || !base) return;
  const decalage = typeof data.maintenant === 'number' ? data.maintenant - (t0 + Date.now()) / 2 : (base.decalage || 0);
  if (data.version >= (base.version || 0)) base = { ...base, etat: data.etat, version: data.version, decalage };
  else base = { ...base, decalage };
}

async function appelerJouer(ordres) {
  const sb = await obtenirClient();
  const t0 = Date.now();
  const { data, error } = await sb.rpc('jouer', { ordres });
  if (error) throw error;
  return { data, t0 };
}

function gererErreur(e) {
  const code = codeErreur(e);
  if (code === 'pas_de_couple') { if (options.detache) options.detache(); return; }
  // Autre souci (réseau…) : on réessaiera
  console.info('Partie non synchronisée (hors ligne ?) :', code || e);
  clearTimeout(reessai);
  reessai = setTimeout(() => { envoyer(); relire(); }, 15000);
}

// Envoie la file d'attente, par lots.
async function envoyer() {
  if (envoiEnCours || !base || !attente.length || !navigator.onLine) return;
  envoiEnCours = true;
  try {
    while (attente.length && base) {
      const lot = attente.slice(0, LOT);
      try {
        const { data, t0 } = await appelerJouer(lot);
        attente = attente.slice(lot.length);
        recevoir(data, t0);
      } catch (e) {
        const code = codeErreur(e);
        if (code === 'ordres_invalides' || code === 'partie_trop_grande') {
          // Ces ordres ne passeront jamais : on les laisse tomber pour ne pas bloquer la suite
          console.error('Ordres refusés par la base :', code, lot);
          attente = attente.slice(lot.length);
        } else { gererErreur(e); break; }
      }
      sauver();
      prevenir('serveur');
    }
  } finally { envoiEnCours = false; }
}

// Relit la partie (jouer avec une liste vide ne change rien et renvoie la partie et l'heure du serveur).
async function relire() {
  if (!base) return;
  if (relectureEnCours) { relireEncore = true; return; }
  relectureEnCours = true;
  try {
    const { data, t0 } = await appelerJouer([]);
    recevoir(data, t0);
    terminerReprise();
    sauver();
    prevenir('serveur');
    // L'autre vient peut-être de rejoindre le couple : on met à jour la copie du couple
    const c = coupleLocal();
    if (c && !c.complet) {
      actualiser().then(c2 => { if (c2) prevenir('serveur'); else if (options.detache) options.detache(); }).catch(() => {});
    }
    envoyer();
  } catch (e) {
    gererErreur(e);
  } finally {
    relectureEnCours = false;
    if (relireEncore) { relireEncore = false; relire(); }
  }
}

async function ecouterSupabase() {
  if (canal) return;
  try {
    const sb = await obtenirClient();
    await sb.auth.getSession(); // la connexion temps réel utilise le compte de ce téléphone
    if (!base) return;
    // Les règles de sécurité (RLS) font que seuls les changements de la partie de MON couple arrivent ici.
    canal = sb.channel('partie')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parties' }, () => relire())
      .subscribe(statut => { if (statut === 'SUBSCRIBED') relire(); });
  } catch (e) {
    console.info('Temps réel indisponible :', e.message || e);
  }
}

/* ---------- Ce qu'utilisent les autres fichiers ---------- */

// La partie à afficher (ne pas la modifier directement : passer par agir).
export function etat() { if (!courant) calculer(); return courant; }

// Applique des ordres tout de suite, puis les envoie à Supabase.
export function agir(ordres) {
  if (!ordres || !ordres.length) return;
  attente = attente.concat(ordres);
  sauver();
  prevenir('moi');
  envoyer();
}

// fn(etat, origine) est appelée à chaque changement. origine : 'moi' (geste fait ici) ou 'serveur' (reçu).
export function ecouter(fn) { auditeurs.add(fn); }

// Heure du serveur estimée, en millisecondes (pour que le minuteur finisse au même moment chez les deux).
export function maintenant() { return Date.now() + ((base && base.decalage) || 0); }

// Démarre la synchronisation pour ce couple. options.detache() : ce téléphone ne fait plus partie du couple.
export function demarrer(couple, opts = {}) {
  options = opts;
  if (!couple) return;
  if (!base || base.couple !== couple.codeCouple) {
    // Nouveau couple pour ce téléphone : on repart de la partie du couple
    base = { couple: couple.codeCouple, etat: {}, version: 0, decalage: 0 };
    attente = [];
    sauver();
    prevenir('serveur');
  }
  relire();
  ecouterSupabase();
}

// Ce téléphone n'a pas (ou plus) de couple : on oublie la partie. Un jeu d'avant le partage (reprise), s'il y en a un,
// est gardé : il rejoindra le couple que ce téléphone créera ou rejoindra.
export function oublier() {
  base = null; attente = [];
  sauver();
  if (canal) { const c = canal; canal = null; obtenirClient().then(sb => sb.removeChannel(c)).catch(() => {}); }
  prevenir('serveur');
}

// Retour du réseau, ou retour dans l'app : on envoie et on relit.
addEventListener('online', () => { envoyer(); relire(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { envoyer(); relire(); } });
