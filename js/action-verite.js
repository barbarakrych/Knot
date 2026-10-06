/* Onglet « Action ou Vérité » : tirage, Passer, remélange, minuteur,
   défi en cours, historique, cartes ajoutées, sources.
   La partie est partagée par les deux téléphones (partie.js) : chaque geste envoie des ordres avec agir(),
   et l'écran se redessine à chaque changement, d'ici ou de l'autre téléphone. */
import { $, el, fmt, lenClass, cornerNodes, balayer, iconeMinuteur, etatMinuteur, ordreMinuteur } from './commun.js';
import { coupleLocal } from './couple.js';
import { etat, agir, ecouter, maintenant } from './partie.js';

const PILES = { verite: { name: 'Vérité' }, action: { name: 'Action' } };
const PILE_IDS = Object.keys(PILES);

export function demarrerActionVerite({ SOURCES, THEMES, BASE }) {
  const BY_ID = new Map(BASE.map(c => [c.id, c]));

  // Copie de la partie partagée, sous les noms utilisés dans ce fichier. drawn : cartes déjà tirées
  // { id: {pile, at, par} } ; custom : cartes ajoutées ; current : carte affichée ; defi : défi en cours, ou null.
  // confirming (remélange à confirmer) reste propre à ce téléphone.
  const S = { drawn: {}, custom: {}, current: null, defi: null, confirming: null };
  let noteTimer = null, confirmDel = null, editing = null;
  let DIST = true, MINUTEUR = null;

  function charger() {
    const e = etat();
    S.drawn = e.tirees; S.custom = e.perso; S.current = e.affichee; S.defi = e.defi;
    DIST = e.distance !== false; MINUTEUR = e.minuteur;
  }

  /* ---------- Qui a tiré ---------- */
  // Chacun tire quand il veut. On retient seulement qui a tiré chaque carte, pour l'historique.
  function maPlace() { const c = coupleLocal(); return c ? c.place : null; }
  // Prénom de la personne à cette place (1 ou 2), ou '' si inconnu
  function prenom(place) {
    const c = coupleLocal(); if (!c || !place) return '';
    return place === c.place ? c.prenomMoi : c.prenomAutre;
  }
  // Une carte ajoutée est à moi si elle porte ma place (une carte sans place, d'avant l'étape 5, est à la personne 1).
  // Même règle que jouer() dans la base, qui refuse qu'on modifie ou supprime la carte de l'autre.
  function aMoi(c) { return (c.place || 1) === maPlace(); }

  function allCards(pile) {
    const custom = Object.values(S.custom).filter(c => c.pile === pile).sort((a, b) => (a.at || 0) - (b.at || 0));
    return BASE.filter(c => c.pile === pile).concat(custom);
  }
  function cardById(id) { if (!id) return null; return BY_ID.get(id) || S.custom[id] || null; }
  // À distance : on retire les actions « ensemble ». Sinon : on retire les actions « distance ».
  function modeOk(c) {
    if (c.pile !== 'action') return true;
    return DIST ? c.mode !== 'ensemble' : c.mode !== 'distance';
  }
  // Tant qu'un défi est en cours, aucun autre défi ne peut sortir.
  function remaining(pile) { const defi = cardById(S.defi); return allCards(pile).filter(c => !S.drawn[c.id] && modeOk(c) && !(defi && c.big)); }

  function note(msg, ok) {
    const n = $('note'); n.textContent = msg; n.className = 'note' + (ok ? ' ok' : ''); n.hidden = false;
    clearTimeout(noteTimer); noteTimer = setTimeout(() => { n.hidden = true; }, 6000);
  }

  function renderRefs() {
    const ul = $('refs'); ul.textContent = '';
    Object.values(SOURCES).forEach(s => {
      const li = el('li');
      li.append(el('b', null, s.name), el('span', null, s.what));
      if (s.url) { const a = el('a', null, 'En savoir plus'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; li.append(a); }
      ul.append(li);
    });
  }

  /* ---------- Minuteur ---------- */
  // Durée du minuteur en secondes : champ « secondes » s'il existe, sinon les minutes.
  function duree(c) { return c ? (c.sec || (c.min || 0) * 60) : 0; }
  // Pour l'étiquette de la carte : « 30 s » ou « 5 min ».
  function dureeTxt(c) { return c.sec ? c.sec + ' s' : c.min + ' min'; }
  // Le minuteur est dans la partie partagée : lancé ici, il s'écoule aussi chez l'autre.
  function renderTimer() {
    const c = cardById(S.current);
    const show = !!(c && c.pile === 'action' && duree(c));
    $('timer').hidden = !show; if (!show) return;
    const timer = etatMinuteur(MINUTEUR, c.id, duree(c), maintenant());
    const clock = $('clock');
    if (timer.done && !timer.running) { clock.textContent = 'Temps écoulé'; clock.className = 'clock done'; }
    else { clock.textContent = fmt(timer.left); clock.className = 'clock'; }
    if (timer.running) iconeMinuteur($('timerbtn'), 'pause', 'Pause');
    else iconeMinuteur($('timerbtn'), 'lancer', timer.done ? 'Relancer' : (timer.left < duree(c) ? 'Reprendre' : 'Lancer le minuteur'));
    iconeMinuteur($('timerreset'), 'recommencer', 'Recommencer');
    $('timerreset').hidden = !(timer.running || timer.left < duree(c) || timer.done);
  }
  $('timerbtn').onclick = () => {
    const c = cardById(S.current); if (!c || !duree(c)) return;
    agir([ordreMinuteur(MINUTEUR, c.id, duree(c), maintenant())]);
  };
  $('timerreset').onclick = () => agir([{ suppr: ['minuteur'] }]);
  // Le cadran se met à jour deux fois par seconde quand le minuteur tourne
  setInterval(() => { if (MINUTEUR && MINUTEUR.marche) renderTimer(); }, 500);

  /* ---------- Affichage ---------- */
  function setCorners(letter, num) {
    ['ctl', 'cbr'].forEach(id => { const c = $(id); c.textContent = ''; c.append(...cornerNodes(letter, num)); });
  }

  function render() {
    for (const p of PILE_IDS) {
      const left = remaining(p).length;
      $('count-' + p).textContent = left + ' / ' + allCards(p).filter(modeOk).length + ' cartes';
      $('pile-' + p).disabled = left === 0;
    }

    const cur = cardById(S.current);
    const card = $('card'), q = $('q'), meta = $('meta');
    meta.textContent = '';
    if (cur) {
      const idx = allCards(cur.pile).findIndex(c => c.id === cur.id) + 1;
      card.className = 'card ' + cur.pile;
      setCorners(cur.pile === 'action' ? 'A' : 'V', String(idx));
      let k = PILES[cur.pile].name;
      if (cur.pile === 'verite' && THEMES[cur.theme]) k += ' · ' + THEMES[cur.theme];
      if (cur.pile === 'action') k += (cur.big ? ' · Défi' : '') + ' · ' + (cur.when === 'week' ? 'Cette semaine' : (duree(cur) ? dureeTxt(cur) : 'Maintenant'));
      $('kicker').textContent = k;
      q.textContent = cur.text; q.className = 'q' + lenClass(cur.text);
      $('detail').textContent = cur.detail || ''; $('detail').hidden = !cur.detail;
      const src = SOURCES[cur.src]; const s = el('span');
      if (src) { s.className = 'src'; s.textContent = 'D’après ' + src.label; }
      else if (S.custom[cur.id]) { s.className = 'src'; s.textContent = 'Carte ajoutée'; } // jamais par qui
      if (s.textContent) meta.append(s);
      meta.hidden = !meta.childNodes.length;
    } else {
      card.className = 'card cover';
      setCorners('K', '');
      $('kicker').textContent = 'Prêts ?';
      q.className = 'q cover';
      q.textContent = 'Choisissez Vérité ou Action pour tirer la première carte.';
      $('detail').hidden = true;
      meta.hidden = true;
    }
    renderTimer();

    const defi = cardById(S.defi);
    $('defi').hidden = !defi;
    if (defi) $('defitext').textContent = defi.text;

    $('skip').disabled = !cur;

    const drawn = Object.entries(S.drawn).filter(([id, v]) => v && cardById(id)).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
    $('hcount').textContent = '(' + drawn.length + ')';
    const hl = $('hlist'); hl.textContent = '';
    if (!drawn.length) hl.append(el('li', 'empty', 'Aucune carte tirée pour l’instant.'));
    drawn.slice(0, 60).forEach(([id]) => {
      const c = cardById(id); const li = el('li');
      const txt = el('div', null, c.text);
      const par = tireePar(id);
      if (par) txt.append(el('span', 'par', par));
      li.append(el('span', c.pile === 'action' ? 'a' : 'v', PILES[c.pile].name), txt);
      hl.append(li);
    });

    renderMine();
    for (const p of PILE_IDS) $('reshuffle-' + p).disabled = aRemelanger(p).length === 0;
    const total = aRemelanger('tout').length;
    $('reshuffle-tout').disabled = total === 0;
    $('confirm').hidden = !S.confirming;
    if (S.confirming === 'tout') {
      $('confirmtext').textContent = 'Les ' + total + ' carte' + (total > 1 ? 's' : '') + ' déjà tirée' + (total > 1 ? 's' : '') + ' (vérités et actions) reviendront dans leur pile, pour vous deux.';
    } else if (S.confirming) {
      const n = aRemelanger(S.confirming).length;
      $('confirmtext').textContent = 'Les ' + n + ' carte' + (n > 1 ? 's' : '') + ' « ' + PILES[S.confirming].name + ' » déjà tirée' + (n > 1 ? 's' : '') + ' reviendront dans la pile, pour vous deux.';
    }
  }

  // « Tirée par [prénom] », ou '' si on ne sait pas (cartes tirées avant le partage)
  function tireePar(id) {
    const t = S.drawn[id];
    const p = t && prenom(t.par);
    return p ? 'Tirée par ' + p : '';
  }

  /* ---------- Tirer, passer, remélanger ---------- */
  // Une carte tirée ne ressort pas tant qu'on ne remélange pas.
  // Ordres pour tirer la carte c : elle devient la carte affichée (par = qui l'a tirée, pour l'historique).
  function ordresTirer(c) {
    const moi = maPlace();
    const o = [
      { set: ['tirees', c.id], valeur: { pile: c.pile, at: Date.now(), par: moi } },
      { set: ['affichee'], valeur: c.id },
      { suppr: ['minuteur'] }
    ];
    if (c.big) o.push({ set: ['defi'], valeur: c.id }); // un défi tiré devient le défi en cours
    return o;
  }
  const auHasard = liste => liste[Math.floor(Math.random() * liste.length)];

  function draw(pile) {
    const p = remaining(pile);
    if (!p.length) return;
    balayer($('card'), undefined, 'droite'); // l'ancienne carte part vers la droite, la nouvelle est dessous
    agir(ordresTirer(auHasard(p)));
  }
  // Passer (toujours possible) : on tire une autre carte, et celle passée retourne dans la pile.
  // S'il n'y a pas d'autre carte, elle retourne quand même dans la pile et on revient à « Prêts ? ».
  function skip() {
    const old = S.current; const c = cardById(old); if (!c) return;
    const wasDefi = S.defi === old; // passer un défi l'annule : les autres défis peuvent alors sortir
    const defi = wasDefi ? null : cardById(S.defi);
    const p = allCards(c.pile).filter(x => x.id !== old && !S.drawn[x.id] && modeOk(x) && !(defi && x.big));
    balayer($('card'), undefined, 'gauche');
    const o = [{ suppr: ['tirees', old] }];
    if (wasDefi) o.push({ suppr: ['defi'] });
    if (p.length) agir(o.concat(ordresTirer(auHasard(p))));
    else agir(o.concat({ set: ['affichee'], valeur: null }, { suppr: ['minuteur'] }));
  }
  // Défi en cours : « C'est fait ! » le termine (la carte reste tirée) ;
  // « Remettre dans la pile » l'annule et la carte peut ressortir.
  function defiDone() {
    agir([{ suppr: ['defi'] }]);
    note('Bravo ! Les défis peuvent de nouveau sortir.', true);
  }
  function defiBack() {
    const id = S.defi; if (!id) return;
    const o = [{ suppr: ['defi'] }, { suppr: ['tirees', id] }];
    if (S.current === id) o.push({ set: ['affichee'], valeur: null }, { suppr: ['minuteur'] });
    agir(o);
    note('Le défi est retourné dans la pile.', true);
  }

  // Cartes tirées qu'un remélange de cette pile ('verite', 'action' ou 'tout') remet dans la pile :
  // toutes, sauf celle du défi en cours, qui reste tirée (elle ne ressort pas tant que le défi est en cours).
  function aRemelanger(pile) {
    return Object.keys(S.drawn).filter(id => {
      const d = S.drawn[id];
      return d && (pile === 'tout' || d.pile === pile) && id !== S.defi && cardById(id);
    });
  }

  // Le défi en cours n'est pas touché : il reste affiché chez les deux, et s'il est la carte affichée, elle reste aussi.
  function reshuffle(pile) {
    S.confirming = null;
    const o = aRemelanger(pile).map(id => ({ suppr: ['tirees', id] }));
    const cur = cardById(S.current);
    if (cur && cur.id !== S.defi && (pile === 'tout' || cur.pile === pile)) o.push({ set: ['affichee'], valeur: null }, { suppr: ['minuteur'] });
    if (o.length) agir(o); else render();
  }

  /* ---------- Cartes ajoutées ----------
     Elles entrent dans le paquet commun et peuvent sortir chez les deux (avec « Carte ajoutée », jamais par qui).
     Seul leur auteur les voit dans « Vos cartes » et peut les modifier ou les supprimer (garanti par jouer()). */
  function addCard(pile, text, min, big) {
    const id = 'perso-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    min = pile === 'action' ? Math.max(0, Math.min(120, min | 0)) : 0;
    big = pile === 'action' && !!big;
    agir([{ set: ['perso', id], valeur: { id, pile, theme: '', src: '', text, min, when: '', mode: '', big, detail: '', at: Date.now(), place: maPlace() } }]);
    note('Carte ajoutée à la pile « ' + PILES[pile].name + ' ».', true);
  }
  function editCard(id, text, min, big) {
    const c = S.custom[id]; if (!c || !aMoi(c)) return;
    min = c.pile === 'action' ? Math.max(0, Math.min(120, min | 0)) : 0;
    big = c.pile === 'action' && !!big;
    editing = null;
    const o = [{ set: ['perso', id], valeur: { ...c, text, min, big } }];
    if (S.defi === id && !big) o.push({ suppr: ['defi'] }); // ce n'est plus un défi
    if (S.current === id) o.push({ suppr: ['minuteur'] });
    agir(o);
    note('Carte modifiée.', true);
  }
  function deleteCard(id) {
    confirmDel = null;
    if (!S.custom[id] || !aMoi(S.custom[id])) return;
    const o = [{ suppr: ['perso', id] }, { suppr: ['tirees', id] }];
    if (S.current === id) o.push({ set: ['affichee'], valeur: null }, { suppr: ['minuteur'] });
    if (S.defi === id) o.push({ suppr: ['defi'] });
    agir(o);
    note('Carte supprimée.', true);
  }

  function renderMine() {
    if (editing && document.getElementById('edit-' + editing) && S.custom[editing]) return;
    const mine = Object.values(S.custom).filter(aMoi).sort((a, b) => (b.at || 0) - (a.at || 0));
    $('minetitle').textContent = mine.length ? 'Vos cartes (' + mine.length + ')' : 'Les cartes que vous ajoutez apparaîtront ici.';
    const ul = $('minelist'); ul.textContent = '';
    mine.forEach(c => {
      const li = el('li');
      const txt = el('div', 'txt');
      txt.append(
        el('span', c.pile === 'action' ? 'a' : '', PILES[c.pile].name + (c.pile === 'action' && c.big ? ' · Défi' : '') + (c.pile === 'action' && c.min ? ' · ' + c.min + ' min' : '')),
        el('div', null, c.text)
      );
      const del = el('div', 'del');

      if (editing === c.id) {
        li.className = 'editing';
        const ta = el('textarea'); ta.id = 'edit-' + c.id; ta.maxLength = 300; ta.value = c.text;
        const wrap = el('div', 'editbox'); wrap.append(ta);
        let sel = null, big = null;
        if (c.pile === 'action') {
          sel = el('input', 'editmin'); sel.type = 'number'; sel.min = '1'; sel.max = '120'; sel.step = '1'; sel.inputMode = 'numeric'; sel.placeholder = '—';
          sel.id = 'editmin-' + c.id; sel.value = c.min ? String(c.min) : '';
          const r = el('div', 'row'); const l = el('label', null, 'Minuteur'); l.htmlFor = sel.id;
          r.append(l, sel, el('span', 'muted', 'minutes · facultatif')); wrap.append(r);
          big = el('input'); big.type = 'checkbox'; big.checked = !!c.big;
          const bl = el('label'); bl.append(big, document.createTextNode(' C’est un défi'));
          const br = el('div', 'bigrow');
          br.append(bl, el('span', 'muted', 'À organiser ou à faire dans les jours qui viennent. Un seul défi à la fois.'));
          wrap.append(br);
        }
        const acts = el('div', 'del');
        const save = el('button', 'btn primary', 'Enregistrer'); save.type = 'button';
        save.onclick = () => {
          const t = ta.value.trim(); if (!t) { note('La carte ne peut pas être vide.'); return; }
          editCard(c.id, t.slice(0, 300), sel ? Math.round(+sel.value) || 0 : 0, big && big.checked);
        };
        const cancel = el('button', 'btn', 'Annuler'); cancel.type = 'button';
        cancel.onclick = () => { editing = null; renderMine(); };
        acts.append(save, cancel); wrap.append(acts);
        li.append(wrap); ul.append(li);
        setTimeout(() => { try { ta.focus(); } catch (e) {} }, 0);
        return;
      }

      if (confirmDel === c.id) {
        const yes = el('button', 'btn primary', 'Supprimer'); yes.type = 'button'; yes.onclick = () => deleteCard(c.id);
        const no = el('button', 'btn', 'Annuler'); no.type = 'button'; no.onclick = () => { confirmDel = null; renderMine(); };
        del.append(yes, no);
      } else {
        const m = el('button', 'btn', 'Modifier'); m.type = 'button';
        m.setAttribute('aria-label', 'Modifier la carte : ' + c.text);
        m.onclick = () => { editing = c.id; confirmDel = null; renderMine(); };
        const b = el('button', 'btn', 'Supprimer'); b.type = 'button';
        b.setAttribute('aria-label', 'Supprimer la carte : ' + c.text);
        b.onclick = () => { confirmDel = c.id; editing = null; renderMine(); };
        del.append(m, b);
      }
      li.append(txt, del); ul.append(li);
    });
  }

  /* ---------- Détection des doublons à l'ajout ---------- */
  const STOP = new Set('le la les l un une des du de d au aux et ou ton ta tes tu toi te t mon ma mes moi me m je j nous notre nos vous votre vos il elle on ils elles ce cet cette ces c ca cela qu que qui quoi quel quelle quels quelles est es suis etre a as ai avez avons en dans sur pour par avec sans plus pas ne n y se s si sa son ses leur leurs comme quand comment pourquoi ou est-ce ce-que tout tous toute toutes tres bien fait faire peu deja encore autre autres celui celle ceux lui eux meme aussi alors donc mais car'.split(' '));
  function toks(s) {
    const w = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/);
    const out = new Set();
    w.forEach(x => { if (!x || STOP.has(x) || x.length < 3) return; out.add(x.replace(/(s|x)$/, '').slice(0, 5)); });
    return out;
  }
  const TOK = new Map();
  function tokOf(c) { const k = c.id + '|' + c.text; let t = TOK.get(k); if (!t) { t = toks(c.text); TOK.set(k, t); } return t; }
  function similar(text, pile, exceptId) {
    const A = toks(text); if (A.size < 2) return null;
    let best = null, bs = 0;
    for (const c of allCards(pile)) {
      if (c.id === exceptId) continue;
      const B = tokOf(c); if (B.size < 2) continue;
      let n = 0; A.forEach(x => { if (B.has(x)) n++; });
      if (n < 2) continue;
      const cont = n / Math.min(A.size, B.size), jac = n / (A.size + B.size - n);
      const s = cont * 0.6 + jac * 0.4;
      const need = Math.min(A.size, B.size) < 3 ? 0.66 : 0.4;
      if (cont >= 0.75 && jac >= need && s > bs) { bs = s; best = c; }
    }
    return best;
  }
  let dupTimer = null;
  function checkDup() {
    const w = $('dupwarn'); const t = $('addtext').value.trim();
    const pile = $('add-action').checked ? 'action' : 'verite';
    const m = t ? similar(t, pile, null) : null;
    w.textContent = ''; w.hidden = !m;
    $('addbtn').textContent = m ? 'Ajouter quand même' : 'Ajouter à la pile';
    if (!m) return;
    w.append(document.createTextNode('Cette carte existe déjà sous une autre forme, ce n’est sans doute pas utile de l’ajouter :'), el('q', null, m.text));
  }
  function syncAddMin() { const a = $('add-action').checked; $('addminrow').hidden = !a; $('addbigrow').hidden = !a; checkDup(); }

  /* ---------- Boutons ---------- */
  $('addtext').addEventListener('input', () => { clearTimeout(dupTimer); dupTimer = setTimeout(checkDup, 250); });
  $('add-action').addEventListener('change', syncAddMin);
  $('add-verite').addEventListener('change', syncAddMin);
  $('pile-verite').onclick = () => draw('verite');
  $('pile-action').onclick = () => draw('action');
  $('skip').onclick = skip;
  $('defidone').onclick = defiDone;
  $('defiback').onclick = defiBack;
  $('reshuffle-verite').onclick = () => { S.confirming = 'verite'; render(); };
  $('reshuffle-action').onclick = () => { S.confirming = 'action'; render(); };
  $('reshuffle-tout').onclick = () => { S.confirming = 'tout'; render(); };
  $('confirmno').onclick = () => { S.confirming = null; render(); };
  $('confirmyes').onclick = () => { if (S.confirming) reshuffle(S.confirming); };
  $('addform').addEventListener('submit', e => {
    e.preventDefault();
    const t = $('addtext').value.trim(); if (!t) return;
    addCard($('add-action').checked ? 'action' : 'verite', t.slice(0, 300), Math.round(+$('addmin').value) || 0, $('addbig').checked);
    $('addtext').value = ''; $('addmin').value = ''; $('addbig').checked = false; checkDup();
  });

  // Chaque changement de la partie (geste fait ici, ou reçu de l'autre téléphone) redessine l'écran.
  // Si c'est l'autre qui a tiré une nouvelle carte, elle arrive avec le même swipe que chez lui.
  ecouter((e, origine) => {
    const avant = S.current;
    charger();
    if (origine === 'serveur' && S.current !== avant && S.current) balayer($('card'), undefined, 'droite');
    render();
  });

  charger();
  renderRefs();
  render();
}
