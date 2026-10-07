/* Le couple : tout ce qui parle à Supabase.
   Chaque téléphone a un compte invisible (connexion anonyme) : pas d'e-mail, pas de mot de passe.
   La bibliothèque Supabase (js/vendor/supabase.js) n'est chargée qu'au besoin : si elle ou le réseau
   manquent, le jeu marche quand même. Une copie du couple est gardée sur l'appareil (CLES.couple)
   pour afficher les prénoms tout de suite, même hors ligne. */
import { CLES, lire, ecrire, effacer } from './stockage.js';
import { SUPABASE_URL, SUPABASE_CLE } from './config.js';
import { estDemo, COUPLE_DEMO } from './demo.js';

// Erreurs connues → message pour l'écran. Les autres (réseau…) donnent ERREUR_RESEAU.
export const MESSAGES = {
  complet: 'Ce couple a déjà ses deux téléphones. Ce code ne permet plus de le rejoindre.',
  code_inconnu: 'Ce code ne marche pas. Vérifie chaque lettre et chaque chiffre.',
  trop_d_essais: 'Trop de codes essayés. Réessaie dans une heure.',
  deja_en_couple: 'Ce téléphone fait déjà partie d’un couple.',
  prenom_invalide: 'Écris un prénom (30 caractères au plus).',
  pas_configure: 'Le partage n’est pas encore configuré (Supabase).'
};
const ERREUR_RESEAU = 'Impossible de joindre Knot. Il faut une connexion internet pour cette étape : vérifie-la et réessaie.';

export function messageErreur(e) {
  const code = e && (e.code_knot || (MESSAGES[e.message] ? e.message : null));
  return code ? MESSAGES[code] : ERREUR_RESEAU;
}
function erreur(code) { const e = new Error(code); e.code_knot = code; return e; }

let client = null;

// Charge js/vendor/supabase.js (une seule fois) et prépare le client. Aussi utilisé par partie.js.
export async function obtenirClient() {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_CLE) throw erreur('pas_configure');
  if (!window.supabase) {
    await new Promise((ok, pasOk) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/supabase.js';
      s.onload = ok;
      s.onerror = () => pasOk(new Error('bibliotheque'));
      document.head.append(s);
    });
  }
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_CLE, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'knot-session' }
  });
  return client;
}

// Compte du téléphone : celui déjà gardé, ou un nouveau compte anonyme.
async function compte() {
  const sb = await obtenirClient();
  const { data: { session } } = await sb.auth.getSession();
  if (session) return { sb, uid: session.user.id };
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  return { sb, uid: data.user.id };
}

// Appel d'une fonction de la base. Les erreurs « levées » par la base (ex. prenom_invalide) gardent leur nom.
async function appeler(sb, fonction, params) {
  const { data, error } = await sb.rpc(fonction, params);
  if (error) throw MESSAGES[error.message] ? erreur(error.message) : error;
  if (data && data.erreur) throw erreur(data.erreur);
  return data;
}

// Le couple gardé sur l'appareil, ou null. En démo : le couple interne de la démo (sans prénoms).
// { place, prenomMoi, prenomAutre, complet, codeCouple, codeRelier }
export function coupleLocal() {
  if (estDemo()) return COUPLE_DEMO;
  return lire(CLES.couple, null);
}

// Relit le couple dans Supabase et met à jour la copie de l'appareil.
// Renvoie le couple, ou null si ce téléphone n'en fait pas (ou plus) partie. Lève une erreur si pas de réseau.
export async function actualiser() {
  const sb = await obtenirClient();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { effacer(CLES.couple); return null; }
  const uid = session.user.id;

  // Grâce aux règles de sécurité, la base ne renvoie que les membres de MON couple.
  const { data: membres, error } = await sb.from('membres').select('user_id, place, couples(code, prenom_1, prenom_2)');
  if (error) throw error;
  const moi = membres.find(m => m.user_id === uid);
  if (!moi) { effacer(CLES.couple); return null; }

  const { data: codes, error: e2 } = await sb.from('codes_relier').select('code').is('utilise_le', null);
  if (e2) throw e2;

  const c = moi.couples;
  const couple = {
    place: moi.place,
    prenomMoi: moi.place === 1 ? c.prenom_1 : c.prenom_2,
    prenomAutre: moi.place === 1 ? c.prenom_2 : c.prenom_1,
    complet: membres.length === 2,
    codeCouple: c.code,
    codeRelier: codes.length ? codes[0].code : null
  };
  ecrire(CLES.couple, couple);
  return couple;
}

// « Créer notre couple ». Renvoie le couple (avec son code).
export async function creerCouple(monPrenom, autrePrenom) {
  const { sb } = await compte();
  await appeler(sb, 'creer_couple', { mon_prenom: monPrenom, autre_prenom: autrePrenom });
  return actualiser();
}

// « J'ai un code », 1re étape : quel prénom est attendu ? → { type: 'couple' | 'relier', prenom }
export async function apercuCode(code) {
  const { sb } = await compte();
  return appeler(sb, 'apercu_code', { code });
}

// « J'ai un code », 2e étape. prenom : null pour garder le prénom prévu.
export async function utiliserCode(code, prenom) {
  const { sb } = await compte();
  await appeler(sb, 'utiliser_code', { code, prenom: prenom || null });
  return actualiser();
}

// Réglages : code pour relier le nouveau téléphone de l'autre. Renvoie le couple à jour.
export async function demanderCodeRelier() {
  const { sb } = await compte();
  await appeler(sb, 'code_relier', {});
  return actualiser();
}

// « ♥ [l'autre] et [moi] » : le prénom de l'autre d'abord, partout.
export function nomsDuCouple(couple) {
  return couple.prenomAutre + ' et ' + couple.prenomMoi;
}

// Pour la console du navigateur (vérification des règles de sécurité) : window.knotSupabase()
window.knotSupabase = obtenirClient;
