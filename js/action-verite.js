/* Onglet « Action ou Vérité » : tirage, Passer, remélange, minuteur,
   interrupteur « À distance », historique, cartes ajoutées, sources. */
import { $, el, fmt, lenClass, vibrer, cornerNodes } from './commun.js';
import { CLES, lire, ecrire } from './stockage.js';

const PILES = { verite: { name: 'Vérité' }, action: { name: 'Action' } };
const PILE_IDS = Object.keys(PILES);

export function demarrerActionVerite({ SOURCES, THEMES, BASE }) {
  const BY_ID = new Map(BASE.map(c => [c.id, c]));

  // État du jeu. drawn : cartes déjà tirées { id: {pile, at} } ; custom : cartes ajoutées ; current : carte affichée.
  const S = { drawn: {}, custom: {}, current: null, confirming: null };
  let animate = false, noteTimer = null, confirmDel = null, editing = null;
  let timer = { end: 0, left: 0, running: false, done: false, id: null, cardId: null };
  let DIST = lire(CLES.distance, true) !== false;

  function charger() {
    const r = lire(CLES.pioche, null);
    if (r && typeof r === 'object') {
      S.drawn = r.drawn || {};
      S.custom = r.custom || {};
      S.current = r.current || null;
    }
  }
  function sauver() { ecrire(CLES.pioche, { drawn: S.drawn, custom: S.custom, current: S.current }); }

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
  function remaining(pile) { return allCards(pile).filter(c => !S.drawn[c.id] && modeOk(c)); }

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
  function resetTimer(c) {
    clearInterval(timer.id);
    timer = { end: 0, left: c && c.min ? c.min * 60 : 0, running: false, done: false, id: null, cardId: c ? c.id : null };
  }
  function tick() {
    timer.left = Math.max(0, Math.round((timer.end - Date.now()) / 1000));
    if (timer.left === 0) { clearInterval(timer.id); timer.running = false; timer.done = true; vibrer(); }
    renderTimer();
  }
  function renderTimer() {
    const c = cardById(S.current);
    const show = !!(c && c.pile === 'action' && c.min);
    $('timer').hidden = !show; if (!show) return;
    if (timer.cardId !== c.id) resetTimer(c);
    const clock = $('clock');
    if (timer.done && !timer.running) { clock.textContent = 'Temps écoulé'; clock.className = 'clock done'; }
    else { clock.textContent = fmt(timer.left); clock.className = 'clock'; }
    $('timerbtn').textContent = timer.running ? 'Pause' : (timer.done ? 'Relancer' : (timer.left < c.min * 60 ? 'Reprendre' : 'Lancer le minuteur'));
    $('timerreset').hidden = !(timer.running || timer.left < c.min * 60 || timer.done);
  }
  $('timerbtn').onclick = () => {
    const c = cardById(S.current); if (!c || !c.min) return;
    if (timer.running) { clearInterval(timer.id); timer.running = false; tick(); return; }
    if (timer.done || timer.left <= 0) { timer.left = c.min * 60; timer.done = false; }
    timer.end = Date.now() + timer.left * 1000; timer.running = true;
    clearInterval(timer.id); timer.id = setInterval(tick, 500); renderTimer();
  };
  $('timerreset').onclick = () => { resetTimer(cardById(S.current)); renderTimer(); };

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
    $('distsw').setAttribute('aria-checked', String(DIST));

    const cur = cardById(S.current);
    const card = $('card'), q = $('q'), meta = $('meta');
    meta.textContent = '';
    if (cur) {
      const idx = allCards(cur.pile).findIndex(c => c.id === cur.id) + 1;
      card.className = 'card ' + cur.pile;
      setCorners(cur.pile === 'action' ? 'A' : 'V', String(idx));
      let k = PILES[cur.pile].name;
      if (cur.pile === 'verite' && THEMES[cur.theme]) k += ' · ' + THEMES[cur.theme];
      if (cur.pile === 'action') k += ' · ' + (cur.when === 'week' ? 'Cette semaine' : (cur.min ? cur.min + ' min' : 'Maintenant'));
      $('kicker').textContent = k;
      q.textContent = cur.text; q.className = 'q' + lenClass(cur.text);
      const src = SOURCES[cur.src]; const s = el('span');
      if (src) { s.className = 'src'; s.textContent = 'D’après ' + src.label; }
      else if (String(cur.id).startsWith('perso-')) { s.textContent = 'Carte ajoutée par vous'; }
      if (s.textContent) meta.append(s);
      meta.hidden = !meta.childNodes.length;
    } else {
      card.className = 'card cover';
      setCorners('K', '');
      $('kicker').textContent = 'Prêts ?';
      q.className = 'q cover';
      q.textContent = 'Choisissez Vérité ou Action pour tirer la première carte.';
      meta.hidden = true;
    }
    if (animate) { card.classList.remove('enter'); void card.offsetWidth; card.classList.add('enter'); animate = false; }
    renderTimer();

    $('skip').disabled = !cur;

    const drawn = Object.entries(S.drawn).filter(([id, v]) => v && cardById(id)).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
    $('hcount').textContent = '(' + drawn.length + ')';
    const hl = $('hlist'); hl.textContent = '';
    if (!drawn.length) hl.append(el('li', 'empty', 'Aucune carte tirée pour l’instant.'));
    drawn.slice(0, 60).forEach(([id]) => {
      const c = cardById(id); const li = el('li');
      li.append(el('span', c.pile === 'action' ? 'a' : 'v', PILES[c.pile].name), el('div', null, c.text));
      hl.append(li);
    });

    renderMine();
    for (const p of PILE_IDS) {
      const n = Object.values(S.drawn).filter(v => v && v.pile === p).length;
      $('reshuffle-' + p).disabled = n === 0;
    }
    $('confirm').hidden = !S.confirming;
    if (S.confirming) {
      const n = Object.values(S.drawn).filter(v => v && v.pile === S.confirming).length;
      $('confirmtext').textContent = 'Les ' + n + ' carte' + (n > 1 ? 's' : '') + ' « ' + PILES[S.confirming].name + ' » déjà tirée' + (n > 1 ? 's' : '') + ' reviendront dans la pile, pour vous deux.';
    }
  }

  /* ---------- Tirer, passer, remélanger ---------- */
  // Une carte tirée ne ressort pas tant qu'on ne remélange pas.
  function draw(pile, excludeId) {
    const p = remaining(pile).filter(c => c.id !== excludeId);
    if (!p.length) return false;
    const c = p[Math.floor(Math.random() * p.length)];
    S.drawn = { ...S.drawn, [c.id]: { pile, at: Date.now() } };
    S.current = c.id; animate = true;
    render(); sauver();
    return true;
  }
  // Passer : on tire une autre carte, et celle passée retourne dans la pile.
  function skip() {
    const old = S.current; const c = cardById(old); if (!c) return;
    if (!remaining(c.pile).some(x => x.id !== old)) { note('Il n’y a plus d’autre carte dans cette pile.'); return; }
    if (!draw(c.pile, old)) return;
    const d = { ...S.drawn }; delete d[old]; S.drawn = d;
    render(); sauver();
  }
  function reshuffle(pile) {
    S.confirming = null;
    const d = { ...S.drawn };
    Object.keys(d).forEach(id => { if (d[id] && d[id].pile === pile) delete d[id]; });
    S.drawn = d;
    const cur = cardById(S.current);
    if (cur && cur.pile === pile) S.current = null;
    render(); sauver();
  }

  /* ---------- Cartes ajoutées ---------- */
  function addCard(pile, text, min) {
    const id = 'perso-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    min = pile === 'action' ? Math.max(0, Math.min(120, min | 0)) : 0;
    S.custom = { ...S.custom, [id]: { id, pile, theme: '', src: '', text, min, when: '', mode: '', at: Date.now() } };
    render(); sauver();
    note('Carte ajoutée à la pile « ' + PILES[pile].name + ' ».', true);
  }
  function editCard(id, text, min) {
    const c = S.custom[id]; if (!c) return;
    min = c.pile === 'action' ? Math.max(0, Math.min(120, min | 0)) : 0;
    const upd = { ...c, text, min };
    editing = null; S.custom = { ...S.custom, [id]: upd };
    if (S.current === id) resetTimer(upd);
    render(); sauver();
    note('Carte modifiée.', true);
  }
  function deleteCard(id) {
    confirmDel = null;
    const x = { ...S.custom }; delete x[id]; S.custom = x;
    if (S.drawn[id]) { const d = { ...S.drawn }; delete d[id]; S.drawn = d; }
    if (S.current === id) S.current = null;
    render(); sauver();
    note('Carte supprimée.', true);
  }

  function renderMine() {
    if (editing && document.getElementById('edit-' + editing) && S.custom[editing]) return;
    const mine = Object.values(S.custom).sort((a, b) => (b.at || 0) - (a.at || 0));
    $('minetitle').textContent = mine.length ? 'Vos cartes (' + mine.length + ')' : 'Les cartes que vous ajoutez apparaîtront ici.';
    const ul = $('minelist'); ul.textContent = '';
    mine.forEach(c => {
      const li = el('li');
      const txt = el('div', 'txt');
      txt.append(
        el('span', c.pile === 'action' ? 'a' : '', PILES[c.pile].name + (c.pile === 'action' && c.min ? ' · ' + c.min + ' min' : '')),
        el('div', null, c.text)
      );
      const del = el('div', 'del');

      if (editing === c.id) {
        li.className = 'editing';
        const ta = el('textarea'); ta.id = 'edit-' + c.id; ta.maxLength = 300; ta.value = c.text;
        const wrap = el('div', 'editbox'); wrap.append(ta);
        let sel = null;
        if (c.pile === 'action') {
          sel = el('input', 'editmin'); sel.type = 'number'; sel.min = '1'; sel.max = '120'; sel.step = '1'; sel.inputMode = 'numeric'; sel.placeholder = '—';
          sel.id = 'editmin-' + c.id; sel.value = c.min ? String(c.min) : '';
          const r = el('div', 'row'); const l = el('label', null, 'Minuteur'); l.htmlFor = sel.id;
          r.append(l, sel, el('span', 'muted', 'minutes · facultatif')); wrap.append(r);
        }
        const acts = el('div', 'del');
        const save = el('button', 'btn primary', 'Enregistrer'); save.type = 'button';
        save.onclick = () => {
          const t = ta.value.trim(); if (!t) { note('La carte ne peut pas être vide.'); return; }
          editCard(c.id, t.slice(0, 300), sel ? Math.round(+sel.value) || 0 : 0);
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
  function syncAddMin() { $('addminrow').hidden = !$('add-action').checked; checkDup(); }

  /* ---------- Boutons ---------- */
  $('addtext').addEventListener('input', () => { clearTimeout(dupTimer); dupTimer = setTimeout(checkDup, 250); });
  $('add-action').addEventListener('change', syncAddMin);
  $('add-verite').addEventListener('change', syncAddMin);
  $('distsw').onclick = () => { DIST = !DIST; ecrire(CLES.distance, DIST); render(); };
  $('pile-verite').onclick = () => draw('verite');
  $('pile-action').onclick = () => draw('action');
  $('skip').onclick = skip;
  $('reshuffle-verite').onclick = () => { S.confirming = 'verite'; render(); };
  $('reshuffle-action').onclick = () => { S.confirming = 'action'; render(); };
  $('confirmno').onclick = () => { S.confirming = null; render(); };
  $('confirmyes').onclick = () => { if (S.confirming) reshuffle(S.confirming); };
  $('addform').addEventListener('submit', e => {
    e.preventDefault();
    const t = $('addtext').value.trim(); if (!t) return;
    addCard($('add-action').checked ? 'action' : 'verite', t.slice(0, 300), Math.round(+$('addmin').value) || 0);
    $('addtext').value = ''; $('addmin').value = ''; checkDup();
  });

  charger();
  renderRefs();
  render();
}
