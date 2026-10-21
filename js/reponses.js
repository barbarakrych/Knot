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
   En démo, rien n'est envoyé : l'autre « répond » tout seul, pour montrer le principe.

   La carte qui se retourne : attacher(carte) place la carte dans un cadre à deux faces.
   Recto = la carte (la question) ; verso = les deux réponses, dès que les deux ont répondu.
   La première fois qu'une carte est révélée, elle se retourne toute seule (une seule fois par téléphone),
   ensuite elle s'affiche directement côté réponses ; un bouton (ou un appui sur la carte) la retourne. */
import { el } from './commun.js';
import { coupleLocal, obtenirClient } from './couple.js';
import { ecouter } from './partie.js';
import { estDemo } from './demo.js';
import { prevenir } from './notifications.js';
import { CLES, lire, ecrire as garder } from './stockage.js';

const MAX = 1000;
const MESSAGES = {
  deja_revele: 'Vous avez déjà répondu tous les deux à cette carte.',
  reponse_invalide: 'Écris une réponse (1000 caractères au plus).',
  hors_ligne: 'Il faut internet pour envoyer ta réponse. Ton texte est gardé : réessaie quand tu es connecté.',
  hors_ligne_minuteur: 'Il faut internet pour lancer le minuteur de cette carte.',
  fin_hors_ligne: 'Temps écoulé. Ton texte sauvegardé sera envoyé tout seul.'
};
const SAUVER_TOUTES = 2500; // brouillon d'une carte chronométrée : sauvé toutes les 2,5 s s'il a changé
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
// compact : version réduite (« Carte précédente »), visible seulement une fois les deux réponses révélées ;
// montrer() reçoit alors aussi { texte, titre } de la carte.
// Options : quandRecu(r), appelée chaque fois que les réponses de la carte sont relues (ex. ouvrir l'encadré du défi
// si quelqu'un a répondu) ; bouton, un bouton « Répondre » placé ailleurs (ex. à côté de « Passer cette carte »),
// que le bloc montre seulement quand il sert, à la place du sien.
export function creerBlocReponses({ quandRecu = () => {}, bouton: boutonExterne = null, compact = false } = {}) {
  const racine = el('section', 'reponses');
  racine.hidden = true;
  let cle = null;          // { carte, fois } de la carte affichée
  let r = null;            // { places, moi, autre } reçu de la base, ou null tant qu'on ne sait pas
  let ecrire = false;      // zone de texte ouverte
  let brouillon = '';      // texte en cours (gardé si l'écran se redessine)
  let erreur = '';
  let envoi = false;
  let demande = 0;         // pour ignorer une réponse de la base arrivée après un changement de carte
  let saisie = { ta: el('textarea') };
  let anciennes = null;    // « La dernière fois » : [{ date, moi, autre }] des fois précédentes, ou null tant qu'on ne sait pas
  let anciennesOuvert = false; // éléments de la zone de saisie ouverte (voir dessiner)
  let flip = null;         // { el, recto, verso, label } : la carte qui se retourne (voir attacher)
  let retournee = false;   // côté réponses visible
  let vueCle = null;       // carte dont on a déjà décidé si elle se retourne toute seule
  let infos = {};          // compact : { texte, titre } de la carte
  let deplie = false;      // compact : réponses en entier
  let maReponseOuverte = false; // en attente de l'autre : ma réponse dépliée sous la ligne
  // Carte chronométrée (partie 3) : le minuteur démarre au tap sur « Répondre », compté depuis l'heure de la base.
  let secondes = 0;        // durée de la carte affichée (0 = pas de minuteur)
  let decalage = 0;        // heure de la base − heure du téléphone (ms)
  let expire = false;      // temps écoulé : le champ est en lecture seule, la réponse part toute seule
  let tic = 0;             // le compte à rebours qui tourne
  let dernierSauve = '';   // dernier texte sauvé dans la base
  let derniereSauvegarde = 0;

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
    // Un minuteur déjà lancé (app rouverte, autre écran) : la zone de texte se rouvre avec le brouillon
    if (enCours() && !ecrire) ouvrirBrouillon();
    else if (ecrire && r && r.mon_brouillon == null && !r.moi && chrono()) { ecrire = false; arreter(); } // la carte a été annulée
    dessiner();
    quandRecu(r);
    if (r && r.moi && r.autre && anciennes === null) lireAnciennes(c, n);
  }

  // Les réponses des fois précédentes où cette carte était sortie (seulement une fois qu'on a répondu tous les deux)
  async function lireAnciennes(c, n) {
    if (estDemo()) return;
    anciennes = [];
    try {
      const data = await appeler('anciennes_reponses', { la_carte: c.carte, la_fois: c.fois });
      if (n !== demande || !memeCle(cle, c)) return;
      anciennes = Array.isArray(data) ? data : [];
    } catch (e) {
      anciennes = null; // on réessaiera à la prochaine relecture
      return;
    }
    dessiner();
  }

  // 12 oct. (avec l'année si ce n'est pas l'année en cours)
  function jour(d) {
    const t = new Date(d);
    if (isNaN(t)) return '';
    const o = { day: 'numeric', month: 'short' };
    if (t.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return t.toLocaleDateString('fr-FR', o);
  }

  function blocAnciennes() {
    const z = el('div', 'anciennes');
    const titre = anciennes.length === 1 ? 'La dernière fois · ' + jour(anciennes[0].date) : 'Les fois précédentes (' + anciennes.length + ')';
    const b = bouton('link anciennes-lien', (anciennesOuvert ? '▾ ' : '▸ ') + titre, () => { anciennesOuvert = !anciennesOuvert; dessiner(); });
    b.setAttribute('aria-expanded', String(anciennesOuvert));
    z.append(b);
    if (anciennesOuvert) {
      anciennes.forEach(f => {
        const fois = el('div', 'ancienne');
        if (anciennes.length > 1) fois.append(el('p', 'reponses-titre', jour(f.date)));
        fois.append(bulle(autre(), f.autre || ''), bulle(moi(), f.moi || ''));
        z.append(fois);
      });
    }
    return z;
  }

  function lireDemo(c) {
    const d = demoReponses.get(c.carte + '|' + c.fois) || {};
    const places = [];
    if (d.moi) places.push(1);
    if (d.autre) places.push(2);
    return { places, moi: d.moi || null, autre: d.moi ? d.autre || null : null,
      moi_le: d.moi_le || null, autre_le: d.moi ? d.autre_le || null : null,
      mon_brouillon: d.moi ? null : (d.brouillon == null ? null : d.brouillon), fin: d.fin || null, maintenant: Date.now() };
  }

  /* ---------- Minuteur des cartes chronométrées ---------- */
  const chrono = () => secondes > 0;
  // Mon minuteur tourne : un brouillon existe, avec une heure limite pas encore traitée
  const enCours = () => !!(cle && chrono() && r && r.fin && r.mon_brouillon != null && !r.moi && !expire);
  const reste = () => (r && r.fin ? r.fin - (Date.now() + decalage) : 0);
  const cleLocale = () => cle.carte + '|' + cle.fois;

  // Tap sur « Répondre ». Carte chronométrée : la base note l'heure de départ et crée le brouillon.
  async function commencer() {
    erreur = '';
    if (!cle) return;
    if (!chrono()) {
      ecrire = true;
      if (!brouillon && r && r.rendue) brouillon = r.rendue; // texte rendu après une annulation : on repart de lui
      dessiner(); return;
    }
    if (enCours()) { ouvrirBrouillon(); return; }
    const c = cle;
    if (estDemo()) {
      const k = c.carte + '|' + c.fois, d = demoReponses.get(k) || {};
      demoReponses.set(k, { ...d, brouillon: d.brouillon || '', fin: d.fin || Date.now() + secondes * 1000 });
      r = lireDemo(c);
    } else {
      if (!navigator.onLine) { erreur = MESSAGES.hors_ligne_minuteur; dessiner(); return; }
      try {
        const data = await appeler('commencer_reponse', { la_carte: c.carte, la_fois: c.fois, secondes });
        if (!memeCle(cle, c)) return;
        r = data;
      } catch (e) {
        const code = String((e && e.message) || '');
        erreur = MESSAGES[code] || MESSAGES.hors_ligne_minuteur; dessiner(); return;
      }
    }
    ouvrirBrouillon();
  }

  // Ouvre la zone de texte sur le brouillon (celui de la base, ou la copie du téléphone si elle est plus récente)
  function ouvrirBrouillon() {
    if (r && typeof r.maintenant === 'number') decalage = r.maintenant - Date.now();
    const local = lire(CLES.brouillon, null);
    const texteBase = (r && r.mon_brouillon) || '';
    brouillon = local && local.cle === cleLocale() && typeof local.texte === 'string' ? local.texte : texteBase;
    dernierSauve = texteBase;
    ecrire = true; expire = false;
    dessiner();
    demarrer();
  }

  function demarrer() {
    if (tic) return;
    tic = setInterval(battre, 250);
    battre();
  }
  function arreter() { clearInterval(tic); tic = 0; }

  // Chaque quart de seconde : le compte à rebours, la sauvegarde régulière, et la fin du temps
  function battre() {
    if (!enCours()) { arreter(); return; }
    const ms = Math.max(0, reste());
    if (saisie.compte) {
      const s = Math.ceil(ms / 1000);
      saisie.compte.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      saisie.compte.classList.toggle('bientot', s <= 60 && s > 10);
      saisie.compte.classList.toggle('dernieres', s <= 10);
    }
    if (Date.now() - derniereSauvegarde >= SAUVER_TOUTES) sauver();
    if (ms <= 0) finDuTemps();
  }

  // Sauve le brouillon (dans la base, et une copie sur le téléphone en cas de coupure)
  async function sauver() {
    if (!enCours()) return;
    if (saisie.ta && saisie.ta.isConnected) brouillon = saisie.ta.value;
    derniereSauvegarde = Date.now();
    if (brouillon === dernierSauve) return;
    const c = cle, texte = brouillon;
    garder(CLES.brouillon, { cle: cleLocale(), texte });
    if (estDemo()) {
      const k = c.carte + '|' + c.fois;
      demoReponses.set(k, { ...demoReponses.get(k), brouillon: texte });
      dernierSauve = texte; return;
    }
    try {
      const data = await appeler('sauver_brouillon', { la_carte: c.carte, la_fois: c.fois, mon_texte: texte });
      if (memeCle(cle, c)) dernierSauve = texte;
      if (data && data.termine && memeCle(cle, c)) relire(); // le temps était déjà écoulé côté base
    } catch (e) { /* hors ligne : la copie du téléphone reste, on réessaiera */ }
  }

  // Temps écoulé : le champ passe en lecture seule et la réponse part telle quelle, sans confirmation.
  // Rien d'écrit : la base annule la carte (voir finaliser dans schema.sql).
  async function finDuTemps() {
    if (expire) return;
    if (saisie.ta && saisie.ta.isConnected) { brouillon = saisie.ta.value; saisie.ta.readOnly = true; }
    expire = true; arreter();
    const c = cle;
    if (brouillon.trim()) {
      await envoyer();
      if (erreur === MESSAGES.hors_ligne) { erreur = MESSAGES.fin_hors_ligne; dessiner(); }
    } else if (estDemo()) {
      demoReponses.delete(c.carte + '|' + c.fois);
      ecrire = false; brouillon = ''; r = lireDemo(c); dessiner();
    } else {
      ecrire = false; brouillon = ''; dessiner();
      setTimeout(() => { if (memeCle(cle, c)) relire(); }, 1500); // la base termine (ici : annule) dès qu'on relit
    }
  }

  // L'app passe en arrière-plan : on sauve tout de suite. Elle revient : le temps a continué de s'écouler.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { derniereSauvegarde = 0; sauver(); }
    else if (enCours()) battre();
  });
  addEventListener('pagehide', () => { derniereSauvegarde = 0; sauver(); });

  async function envoyer() {
    const texte = brouillon.trim();
    if (!texte) { erreur = MESSAGES.reponse_invalide; dessiner(); return; }
    const c = cle;
    if (estDemo()) {
      const k = c.carte + '|' + c.fois;
      demoReponses.set(k, { ...(demoReponses.get(k) || {}), moi: texte, moi_le: Date.now() });
      ecrire = false; brouillon = ''; erreur = ''; garder(CLES.brouillon, null);
      r = lireDemo(c); dessiner();
      // En démo, l'autre répond tout seul un instant après
      setTimeout(() => { demoReponses.set(k, { ...demoReponses.get(k), autre: AUTRE_DEMO, autre_le: Date.now() }); if (memeCle(cle, c)) relire(); }, 1500);
      return;
    }
    if (!navigator.onLine) { erreur = MESSAGES.hors_ligne; dessiner(); return; }
    envoi = true; dessiner();
    try {
      const data = await appeler('repondre', { la_carte: c.carte, la_fois: c.fois, mon_texte: texte });
      prevenir('reponse'); // notification chez l'autre (s'il les a activées)
      if (memeCle(cle, c)) { r = data; ecrire = false; brouillon = ''; erreur = ''; garder(CLES.brouillon, null); }
      if (memeCle(cle, c) && r && r.moi && r.autre && anciennes === null) lireAnciennes(c, demande);
    } catch (e) {
      const code = String((e && e.message) || '');
      erreur = MESSAGES[code] || MESSAGES.hors_ligne;
      if (code === 'deja_revele') { ecrire = false; relire(); }
    } finally { envoi = false; dessiner(); }
  }

  function bouton(cls, texte, action) {
    const b = el('button', cls, texte); b.type = 'button'; b.onclick = action; return b;
  }
  // 21:14 (avec le jour si ce n'est pas aujourd'hui)
  function heure(d) {
    const t = new Date(d);
    if (!d || isNaN(t)) return '';
    const h = t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return t.toDateString() === new Date().toDateString() ? h : jour(d) + ', ' + h;
  }
  function bulle(nom, texte, le) {
    const d = el('div', 'reponse');
    const h = heure(le);
    d.append(el('p', 'reponse-nom', nom.charAt(0).toUpperCase() + nom.slice(1) + (h ? ' · ' + h : '')), el('p', 'reponse-texte', texte));
    return d;
  }

  // Met la carte du bon côté (et le bouton à jour). Le côté caché n'est ni lisible ni cliquable.
  function appliquer() {
    if (!flip) return;
    const r0 = flip.recto;
    ['action', 'verite', 'cover'].forEach(k => flip.verso.classList.toggle(k, r0.classList.contains(k))); // couleurs du recto
    flip.el.classList.toggle('retournee', retournee);
    flip.label.textContent = '';
    flip.label.append(el('span', 'flip-icone', '↻'), retournee ? 'Voir la question' : 'Voir les réponses');
    flip.label.setAttribute('aria-pressed', String(retournee));
    r0.inert = retournee; flip.verso.inert = !retournee;
    r0.setAttribute('aria-hidden', String(retournee)); flip.verso.setAttribute('aria-hidden', String(!retournee));
  }

  // Carte chronométrée, avant le tap sur « Répondre » : une ligne sur la carte dit la durée et quand le minuteur démarre
  function majDureeInfo() {
    if (!flip) return;
    const inn = flip.recto.querySelector('.card-in');
    let info = inn.querySelector('.duree-info');
    const montrer = chrono() && !(r && (r.moi || r.mon_brouillon != null));
    if (!montrer) { if (info) info.remove(); return; }
    if (!info) { info = el('p', 'duree-info'); inn.insertBefore(info, inn.querySelector('.meta')); }
    const duree = secondes % 60 ? secondes + ' s' : secondes / 60 + ' min';
    info.textContent = '⏱ ' + duree + ' · démarre quand tu cliques sur Répondre';
  }

  // Révélée (les deux ont répondu) ou pas. La toute première fois : la carte se retourne sous nos yeux.
  function majFlip(revele) {
    majDureeInfo();
    if (!flip) return;
    flip.el.classList.toggle('revelee', revele);
    flip.label.hidden = !revele;
    if (!revele) { retournee = false; appliquer(); return; }
    const k = cle.carte + '|' + cle.fois;
    if (vueCle !== k) {
      vueCle = k;
      const vues = lire(CLES.revelees, []);
      if (Array.isArray(vues) && vues.includes(k)) retournee = true;
      else {
        retournee = false;
        garder(CLES.revelees, (Array.isArray(vues) ? vues : []).concat(k).slice(-300));
        // Un court instant plus tard : la carte est affichée côté question, puis elle tourne
        setTimeout(() => { if (vueCle === k) { retournee = true; appliquer(); } }, 60);
      }
    }
    const inn = flip.verso.firstChild; inn.textContent = '';
    flip.recto.querySelectorAll('.corner').forEach(c => { const coin = c.cloneNode(true); coin.removeAttribute('id'); inn.append(coin); });
    const suite = bouton('link lire-suite', 'Lire la suite', ouvrirLecture);
    inn.append(el('p', 'kicker', 'Vos réponses'), bulle(autre(), r.autre, r.autre_le), bulle(moi(), r.moi, r.moi_le), suite);
    flip.suite = suite;
    mesurer();
    appliquer();
  }

  // Réponses longues : le verso ne défile jamais. On mesure sa hauteur rendue (version complète, sans la hauteur
  // minimale de la carte) ; au-delà de 60 % de l'écran, chaque réponse est coupée (aperçu) et « Lire la suite » apparaît.
  function mesurer() {
    if (!flip || !flip.suite || !flip.el.classList.contains('revelee')) return;
    const v = flip.verso;
    v.classList.remove('apercu');
    flip.suite.hidden = true; // le lien ne compte pas dans la hauteur des réponses
    Object.assign(v.style, { alignSelf: 'start', minHeight: '0' });
    const trop = v.offsetHeight > window.innerHeight * 0.6;
    Object.assign(v.style, { alignSelf: '', minHeight: '' });
    v.classList.toggle('apercu', trop);
    flip.suite.hidden = !trop;
  }

  // « Lire la suite » : les deux réponses en entier, en plein écran. « ← Retour », Échap ou le bouton retour du téléphone ferment.
  function ouvrirLecture() {
    if (!r || !r.moi || !r.autre || document.querySelector('.lecture')) return;
    const vue = el('section', 'lecture');
    vue.setAttribute('role', 'dialog'); vue.setAttribute('aria-modal', 'true'); vue.setAttribute('aria-label', 'Vos réponses');
    const retour = bouton('btn lecture-retour', '← Retour', () => history.back());
    const q = flip && flip.recto.querySelector('.q');
    vue.append(retour, el('p', 'kicker', 'Vos réponses'), el('p', 'lecture-q', q ? q.textContent : ''),
      bulle(autre(), r.autre, r.autre_le), bulle(moi(), r.moi, r.moi_le));
    document.body.append(vue);
    document.documentElement.classList.add('lecture-ouverte');
    history.pushState({ lecture: true }, ''); // le bouton retour du téléphone ferme la vue au lieu de quitter l'app
    const echap = e => { if (e.key === 'Escape') history.back(); };
    const fermer = () => {
      vue.remove();
      document.documentElement.classList.remove('lecture-ouverte');
      removeEventListener('popstate', fermer); removeEventListener('keydown', echap);
      if (flip && flip.suite && flip.suite.isConnected) flip.suite.focus();
    };
    addEventListener('popstate', fermer); addEventListener('keydown', echap);
    retour.focus();
  }

  // Compact : « Carte précédente », seulement quand les deux réponses sont révélées. Un appui montre tout.
  function dessinerCompact() {
    racine.hidden = !(r && r.moi && r.autre);
    if (racine.hidden) return;
    racine.textContent = '';
    racine.classList.toggle('deplie', deplie);
    const b = el('button', 'precedente-in'); b.type = 'button';
    b.setAttribute('aria-expanded', String(deplie));
    b.onclick = () => { deplie = !deplie; dessiner(); };
    b.append(el('p', 'kicker', 'Carte précédente' + (infos.titre ? ' · ' + infos.titre : '')),
      el('p', 'precedente-q', infos.texte || ''), bulle(autre(), r.autre, r.autre_le), bulle(moi(), r.moi, r.moi_le),
      el('span', 'precedente-plus', deplie ? 'Réduire' : 'Tout lire'));
    racine.append(b);
  }

  function dessiner() {
    const c = couple();
    // Il faut être deux : rien tant que l'autre n'a pas rejoint le couple (sauf en démo)
    racine.hidden = !cle || !c || (!c.complet && !estDemo());
    if (boutonExterne) boutonExterne.hidden = true; // montré plus bas, seulement s'il sert
    if (racine.hidden) { majFlip(false); return; }
    if (compact) { dessinerCompact(); return; }

    const places = (r && r.places) || [];
    const autreARepondu = places.includes(placeAutre());
    const jAiRepondu = !!(r && r.moi);
    majFlip(!!(jAiRepondu && r.autre));

    // En train d'écrire : la zone de texte reste en place (elle garde le curseur), seul l'état autour change
    if (ecrire && !(jAiRepondu && r.autre) && saisie.ta.isConnected) {
      saisie.ok.textContent = envoi ? 'Envoi…' : 'Valider';
      saisie.ok.disabled = envoi || expire;
      saisie.ta.readOnly = expire;
      saisie.etat.textContent = autreARepondu ? autre() + ' a répondu · à toi' : '';
      saisie.erreur.textContent = erreur; saisie.erreur.hidden = !erreur;
      return;
    }
    racine.textContent = '';

    if (jAiRepondu && r.autre) {
      ecrire = false;
      // Les deux ont répondu : l'autre d'abord, comme partout dans l'app
      // Sur la carte qui se retourne, les réponses sont au verso ; sinon (encadré du défi), ici
      if (!flip) racine.append(el('p', 'reponses-titre', 'Vos réponses'), bulle(autre(), r.autre, r.autre_le), bulle(moi(), r.moi, r.moi_le));
      if (anciennes && anciennes.length) racine.append(blocAnciennes());
    } else if (ecrire) {
      const ta = el('textarea'); ta.maxLength = MAX; ta.value = brouillon;
      ta.placeholder = 'Ta réponse… ' + autre() + ' ne la verra qu’après avoir répondu.';
      ta.setAttribute('aria-label', 'Ta réponse');
      ta.oninput = () => { brouillon = ta.value; };
      ta.readOnly = expire;
      const actions = el('div', 'actions');
      const ok = bouton('btn primary', envoi ? 'Envoi…' : 'Valider', () => { brouillon = ta.value; envoyer(); });
      ok.disabled = envoi || expire;
      actions.append(ok);
      // Carte chronométrée : pas d'« Annuler » (le minuteur tourne ; « Passer cette carte » reste possible)
      if (!chrono()) actions.append(bouton('btn', 'Annuler', () => { ecrire = false; brouillon = ''; erreur = ''; dessiner(); }));
      const etat = el('p', 'muted', autreARepondu ? autre() + ' a répondu · à toi' : '');
      const err = el('p', 'note', erreur); err.hidden = !erreur;
      // Compte à rebours discret, en haut du champ
      const compte = chrono() ? el('p', 'compte') : null;
      if (compte) { compte.setAttribute('role', 'timer'); compte.setAttribute('aria-label', 'Temps restant'); racine.append(compte); }
      racine.append(ta, actions, etat, err);
      saisie = { ta, ok, etat, erreur: err, compte };
      if (enCours()) battre();
      setTimeout(() => { try { ta.focus(); } catch (e) {} }, 0);
      return;
    } else if (jAiRepondu) {
      // Une ligne discrète (rien qui ressemble à une carte sous la carte) ; ma réponse se déplie si on veut la relire
      racine.append(el('p', 'muted', 'Ta réponse est envoyée · en attente de ' + autre()));
      const voir = bouton('link', maReponseOuverte ? 'Masquer ma réponse' : 'Voir ma réponse', () => { maReponseOuverte = !maReponseOuverte; dessiner(); });
      voir.setAttribute('aria-expanded', String(maReponseOuverte));
      const liens = el('div', 'reponses-liens');
      liens.append(voir);
      // Carte chronométrée : la réponse envoyée ne se modifie plus
      if (!chrono()) liens.append(bouton('link', 'Modifier ma réponse', () => { ecrire = true; brouillon = r.moi; erreur = ''; dessiner(); }));
      racine.append(liens);
      if (maReponseOuverte) racine.append(el('p', 'ma-reponse', r.moi));
    } else if (boutonExterne) {
      // Le bouton « Répondre » est ailleurs : ici, seulement si l'autre a déjà répondu
      boutonExterne.hidden = false;
      if (autreARepondu) racine.append(el('p', 'muted', autre() + ' a répondu · à toi'));
    } else {
      racine.append(bouton('btn wide', 'Répondre', commencer));
      racine.append(el('p', 'muted', autreARepondu
        ? autre() + ' a répondu · à toi'
        : 'Chacun écrit sa réponse ; vous les découvrez ensemble.'));
    }
    if (erreur) racine.append(el('p', 'note', erreur));
    racine.hidden = !racine.childNodes.length; // rien à montrer (le bouton est ailleurs)
  }

  if (boutonExterne) boutonExterne.onclick = commencer;

  const bloc = {
    element: racine,
    // Règle le bloc sur la carte affichée ({ carte, fois, secondes }), ou le cache (null). Rien ne change si c'est la même carte.
    // secondes : durée d'une carte chronométrée (son minuteur démarre au tap sur « Répondre »), sinon 0.
    montrer(nouvelle) {
      if (compact) infos = nouvelle ? { texte: nouvelle.texte, titre: nouvelle.titre } : {};
      secondes = (nouvelle && nouvelle.secondes) || 0;
      if (memeCle(nouvelle, cle) || (!nouvelle && !cle)) { dessiner(); return; }
      if (enCours()) { derniereSauvegarde = 0; sauver(); } // on quitte une carte dont le minuteur tourne : le brouillon est gardé
      arreter(); expire = false;
      cle = nouvelle ? { carte: String(nouvelle.carte), fois: String(nouvelle.fois) } : null;
      r = null; ecrire = false; brouillon = ''; erreur = ''; demande++;
      retournee = false; vueCle = null; deplie = false; maReponseOuverte = false;
      anciennes = null; anciennesOuvert = false;
      dessiner();
      relire();
    },
    relire,
    // Met la carte (l'élément .card) dans le cadre qui se retourne. À rappeler si la carte est recréée.
    attacher(carte) {
      if (!carte || (flip && flip.recto === carte)) return;
      const cadre = el('div', 'flip'), inn = el('div', 'flip-in'), verso = el('article', 'card verso');
      verso.append(el('div', 'card-in'));
      const label = bouton('flip-label', '', () => { retournee = !retournee; appliquer(); });
      label.hidden = true;
      carte.replaceWith(cadre); inn.append(carte, verso); cadre.append(inn, label);
      // Toute la carte se retourne d'un appui (sauf sur ses propres boutons). Pas de double-tap.
      cadre.onclick = e => {
        if (!cadre.classList.contains('revelee') || e.target.closest('button, a, textarea, input')) return;
        retournee = !retournee; appliquer();
      };
      flip = { el: cadre, recto: carte, verso, label };
      vueCle = cle && r && r.moi && r.autre ? cle.carte + '|' + cle.fois : null; // carte recréée : pas de nouvelle animation
      dessiner();
    },
    // Ouvre tout de suite la zone de texte (si je n'ai pas encore répondu)
    ouvrir() { if (cle && !(r && r.moi)) commencer(); },
    // Le minuteur personnel de la carte affichée tourne (pour ne pas recharger l'app à ce moment-là)
    minuteurEnCours: () => enCours()
  };
  blocs.add(bloc);
  // Écran tourné ou redimensionné : on remesure (une seule fois, quand ça s'arrête de bouger)
  let attente = 0;
  addEventListener('resize', () => { clearTimeout(attente); attente = setTimeout(mesurer, 150); });
  return bloc;
}
