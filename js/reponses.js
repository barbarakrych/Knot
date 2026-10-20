/* Répondre chacun de son côté (étape 6).
   Sous la carte affichée, chacun peut écrire sa réponse. Tant que les deux n'ont pas répondu, on sait seulement
   si l'autre a répondu, jamais ce qu'il a écrit. Quand les deux ont répondu, les deux réponses s'affichent ensemble.

   Les textes ne passent pas par la partie partagée (partie.js), que les deux téléphones lisent en entier :
   ils sont rangés à part dans Supabase, et seule la fonction lire_reponses() les rend (voir supabase/schema.sql).
   Quand quelqu'un répond, la base laisse un petit repère dans la partie (etat.reponses, sans texte) :
   le temps réel prévient l'autre téléphone, qui relit alors les réponses de sa carte.

   Une carte est repérée par { carte, fois } : son identifiant, et la « fois » où elle est sortie
   (heure du tirage, ou début du paquet). Une carte qui ressort plus tard repart sans réponses.
   Il faut internet pour répondre (pas de file d'attente : plus simple, et rien d'intime ne reste en attente sur l'appareil).
   En démo, rien n'est envoyé : l'autre « répond » tout seul, pour montrer le principe. */
import { el } from './commun.js';
import { coupleLocal, obtenirClient } from './couple.js';
import { ecouter } from './partie.js';
import { estDemo } from './demo.js';

const MAX = 1000;
const MESSAGES = {
  deja_revele: 'Vous avez déjà répondu tous les deux à cette carte.',
  reponse_invalide: 'Écris une réponse (1000 caractères au plus).',
  hors_ligne: 'Il faut internet pour envoyer ta réponse. Ton texte est gardé : réessaie quand tu es connecté.'
};
const AUTRE_DEMO = 'En vrai, la réponse de l’autre s’afficherait ici, en même temps que la tienne.';
const demoReponses = new Map(); // démo : « carte|fois » → { moi, autre }

const blocs = new Set();
let dernierRepere = null;
// Quand l'autre téléphone répond, la partie change (repère etat.reponses) : chaque bloc relit sa carte.
ecouter(e => {
  const repere = JSON.stringify(e.reponses || null);
  if (repere === dernierRepere) return;
  dernierRepere = repere;
  blocs.forEach(b => b.relire());
});

async function appeler(fonction, params) {
  const sb = await obtenirClient();
  const { data, error } = await sb.rpc(fonction, params);
  if (error) throw error;
  return data;
}

// Crée le bloc (à placer une fois dans la page). montrer({ carte, fois }) le règle sur une carte, montrer(null) le cache.
// quandRecu(r) : appelée chaque fois que les réponses de la carte sont relues (ex. ouvrir l'encadré du défi si quelqu'un a répondu).
export function creerBlocReponses(quandRecu = () => {}) {
  const racine = el('section', 'reponses');
  racine.hidden = true;
  let cle = null;          // { carte, fois } de la carte affichée
  let r = null;            // { places, moi, autre } reçu de la base, ou null tant qu'on ne sait pas
  let ecrire = false;      // zone de texte ouverte
  let brouillon = '';      // texte en cours (gardé si l'écran se redessine)
  let erreur = '';
  let envoi = false;
  let demande = 0;         // pour ignorer une réponse de la base arrivée après un changement de carte
  let saisie = { ta: el('textarea') }; // éléments de la zone de saisie ouverte (voir dessiner)

  const memeCle = (a, b) => !!a && !!b && a.carte === b.carte && a.fois === b.fois;
  const couple = () => coupleLocal();
  const autre = () => (couple() && couple().prenomAutre) || 'l’autre';
  const moi = () => (couple() && couple().prenomMoi) || 'Toi';
  const placeAutre = () => (couple() && couple().place === 2 ? 1 : 2);

  async function relire() {
    if (!cle) return;
    const n = ++demande, c = cle;
    if (estDemo()) { r = lireDemo(c); dessiner(); quandRecu(r); return; }
    try {
      const data = await appeler('lire_reponses', { la_carte: c.carte, la_fois: c.fois });
      if (n !== demande) return;
      r = data; erreur = '';
    } catch (e) {
      if (n !== demande) return;
      console.info('Réponses non lues (hors ligne ?) :', e.message || e);
    }
    dessiner();
    quandRecu(r);
  }

  function lireDemo(c) {
    const d = demoReponses.get(c.carte + '|' + c.fois) || {};
    const places = [];
    if (d.moi) places.push(1);
    if (d.autre) places.push(2);
    return { places, moi: d.moi || null, autre: d.moi ? d.autre || null : null };
  }

  async function envoyer() {
    const texte = brouillon.trim();
    if (!texte) { erreur = MESSAGES.reponse_invalide; dessiner(); return; }
    const c = cle;
    if (estDemo()) {
      const k = c.carte + '|' + c.fois;
      demoReponses.set(k, { ...(demoReponses.get(k) || {}), moi: texte });
      ecrire = false; brouillon = ''; erreur = '';
      r = lireDemo(c); dessiner();
      // En démo, l'autre répond tout seul un instant après
      setTimeout(() => { demoReponses.set(k, { ...demoReponses.get(k), autre: AUTRE_DEMO }); if (memeCle(cle, c)) relire(); }, 1500);
      return;
    }
    if (!navigator.onLine) { erreur = MESSAGES.hors_ligne; dessiner(); return; }
    envoi = true; dessiner();
    try {
      const data = await appeler('repondre', { la_carte: c.carte, la_fois: c.fois, mon_texte: texte });
      if (memeCle(cle, c)) { r = data; ecrire = false; brouillon = ''; erreur = ''; }
    } catch (e) {
      const code = String((e && e.message) || '');
      erreur = MESSAGES[code] || MESSAGES.hors_ligne;
      if (code === 'deja_revele') { ecrire = false; relire(); }
    } finally { envoi = false; dessiner(); }
  }

  function bouton(cls, texte, action) {
    const b = el('button', cls, texte); b.type = 'button'; b.onclick = action; return b;
  }
  function bulle(nom, texte) {
    const d = el('div', 'reponse');
    d.append(el('p', 'reponse-nom', nom.charAt(0).toUpperCase() + nom.slice(1)),el('p', 'reponse-texte', texte));
    return d;
  }

  function dessiner() {
    const c = couple();
    // Il faut être deux : rien tant que l'autre n'a pas rejoint le couple (sauf en démo)
    racine.hidden = !cle || !c || (!c.complet && !estDemo());
    if (racine.hidden) return;

    const places = (r && r.places) || [];
    const autreARepondu = places.includes(placeAutre());
    const jAiRepondu = !!(r && r.moi);

    // En train d'écrire : la zone de texte reste en place (elle garde le curseur), seul l'état autour change
    if (ecrire && !(jAiRepondu && r.autre) && saisie.ta.isConnected) {
      saisie.ok.textContent = envoi ? 'Envoi…' : 'Valider';
      saisie.ok.disabled = envoi;
      saisie.etat.textContent = autreARepondu ? autre() + ' a répondu · à toi' : '';
      saisie.erreur.textContent = erreur; saisie.erreur.hidden = !erreur;
      return;
    }
    racine.textContent = '';

    if (jAiRepondu && r.autre) {
      ecrire = false;
      // Les deux ont répondu : l'autre d'abord, comme partout dans l'app
      racine.append(el('p', 'reponses-titre', 'Vos réponses'), bulle(autre(), r.autre), bulle(moi(), r.moi));
    } else if (ecrire) {
      const ta = el('textarea'); ta.maxLength = MAX; ta.value = brouillon;
      ta.placeholder = 'Ta réponse… ' + autre() + ' ne la verra qu’après avoir répondu.';
      ta.setAttribute('aria-label', 'Ta réponse');
      ta.oninput = () => { brouillon = ta.value; };
      const actions = el('div', 'actions');
      const ok = bouton('btn primary', envoi ? 'Envoi…' : 'Valider', () => { brouillon = ta.value; envoyer(); });
      ok.disabled = envoi;
      const non = bouton('btn', 'Annuler', () => { ecrire = false; brouillon = ''; erreur = ''; dessiner(); });
      actions.append(ok, non);
      const etat = el('p', 'muted', autreARepondu ? autre() + ' a répondu · à toi' : '');
      const err = el('p', 'note', erreur); err.hidden = !erreur;
      racine.append(ta, actions, etat, err);
      saisie = { ta, ok, etat, erreur: err };
      setTimeout(() => { try { ta.focus(); } catch (e) {} }, 0);
      return;
    } else if (jAiRepondu) {
      racine.append(el('p', 'muted', 'Ta réponse est envoyée · en attente de ' + autre()), bulle(moi(), r.moi));
      racine.append(bouton('link', 'Modifier ma réponse', () => { ecrire = true; brouillon = r.moi; erreur = ''; dessiner(); }));
    } else {
      racine.append(bouton('btn wide', 'Répondre', () => { ecrire = true; erreur = ''; dessiner(); }));
      racine.append(el('p', 'muted', autreARepondu
        ? autre() + ' a répondu · à toi'
        : 'Chacun écrit sa réponse ; vous les découvrez ensemble.'));
    }
    if (erreur) racine.append(el('p', 'note', erreur));
  }

  const bloc = {
    element: racine,
    // Règle le bloc sur la carte affichée ({ carte, fois }), ou le cache (null). Rien ne change si c'est la même carte.
    montrer(nouvelle) {
      if (memeCle(nouvelle, cle) || (!nouvelle && !cle)) { dessiner(); return; }
      cle = nouvelle ? { carte: String(nouvelle.carte), fois: String(nouvelle.fois) } : null;
      r = null; ecrire = false; brouillon = ''; erreur = ''; demande++;
      dessiner();
      relire();
    },
    relire,
    // Ouvre tout de suite la zone de texte (si je n'ai pas encore répondu)
    ouvrir() { if (cle && !(r && r.moi)) { ecrire = true; erreur = ''; dessiner(); } }
  };
  blocs.add(bloc);
  return bloc;
}
