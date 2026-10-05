/* Onglet « Pour plus tard » : les 8 paquets, carte par carte, dans l'ordre. */
import { $, el, fmt, lenClass, cornerNodes, srcLine, balayer, iconeMinuteur } from './commun.js';
import { CLES, lire, ecrire } from './stockage.js';

const GUIDE = [
  'Celui qui parle parle de lui, avec des « je », en phrases courtes.',
  'L’autre reformule ce qu’il a compris avant de répondre : « Si je comprends bien, pour toi… »',
  'On cherche à comprendre, pas à convaincre. Les solutions viendront après.',
  'On a le droit de passer une carte, sans se justifier.',
  'Si ça chauffe, pause de 20 minutes, puis on reprend.'
];

export function demarrerPourPlusTard({ SOURCES, PAQUETS }) {
  // Progression par paquet : i = carte affichée (-1 = pas commencé), max = carte la plus loin atteinte.
  let K = lire(CLES.paquets, {});
  if (typeof K !== 'object') K = {};
  let open = lire(CLES.ecran, {}).open || null;
  let visible = false;
  let ptimer = { key: null, left: 0, end: 0, running: false, done: false, id: null };

  function kSave() { ecrire(CLES.paquets, K); }
  function kGet(id) { return K[id] || (K[id] = { i: -1, max: -1 }); }
  function setOpen(id) { open = id; ecrire(CLES.ecran, { ...lire(CLES.ecran, {}), open: id }); }
  function stopTimer() { clearInterval(ptimer.id); ptimer.running = false; }

  function guideBox(isOpen) {
    const g = el('details', 'guide'); if (isOpen) g.open = true;
    g.append(el('summary', null, 'Guide de conversation'));
    const r = el('ul', 'rule');
    GUIDE.forEach(x => r.append(el('li', null, x)));
    g.append(el('p', 'muted', 'Valable pour tous les paquets.'), r, srcLine(SOURCES, ['prep', 'conflict']));
    return g;
  }

  function render() {
    if (!visible) return;
    const root = $('view-topics'); root.textContent = '';
    if (open) {
      const pq = PAQUETS.find(x => x.id === open);
      if (pq) { renderPaquet(root, pq); return; }
      setOpen(null);
    }

    const intro = el('div', 'panel');
    intro.append(
      el('h2', null, 'Pour plus tard'),
      el('p', null, 'Huit paquets, chacun tiré d’une étude ou d’un questionnaire reconnu. Les cartes se suivent dans l’ordre prévu par la méthode, pour avancer pas à pas.'),
      el('p', 'muted', 'Rien à configurer : votre progression reste sur ce téléphone.')
    );
    root.append(intro, guideBox(true));

    const ul = el('ul', 'plist');
    PAQUETS.forEach((pq, n) => {
      const d = K[pq.id]; const tot = pq.cards.length;
      const fini = d && d.max >= tot - 1, commence = d && d.i >= 0;
      const st = fini ? 'Terminé' : (commence ? (d.i + 1) + ' / ' + tot : tot + ' cartes · ' + pq.dur);
      const li = el('li'); const b = el('button', 'pitem'); b.type = 'button';
      const txt = el('span', 'ptxt');
      txt.append(el('b', null, pq.name), el('span', null, pq.study), el('span', 'status' + (fini ? ' done' : (commence ? ' go' : '')), st));
      b.append(el('span', 'num', String(n + 1).padStart(2, '0')), txt);
      b.onclick = () => { setOpen(pq.id); render(); window.scrollTo(0, 0); };
      li.append(b); ul.append(li);
    });
    root.append(ul);
  }

  function renderPaquet(root, pq) {
    const d = kGet(pq.id); const tot = pq.cards.length;
    if (d.i >= tot) d.i = tot - 1;
    const back = el('button', 'link back', '← Tous les paquets'); back.type = 'button';
    back.onclick = () => { stopTimer(); setOpen(null); render(); };
    root.append(back);

    const head = el('div', 'panel');
    head.append(el('p', 'muted', pq.study), el('h2', null, pq.name), el('p', 'muted', tot + ' cartes · environ ' + pq.dur));
    if (d.i < 0) head.append(el('p', null, pq.intro));
    else {
      const det = el('details', 'mini');
      det.append(el('summary', null, 'À propos de cette étude'), el('p', null, pq.intro));
      head.append(det);
    }
    head.append(el('p', 'muted', pq.how), srcLine(SOURCES, pq.src));
    if (pq.url) { const a = el('a', 'srclink', 'Voir l’étude'); a.href = pq.url; a.target = '_blank'; a.rel = 'noopener'; head.append(a); }
    root.append(head);

    if (d.i < 0) {
      const go = el('button', 'btn primary wide', 'Commencer le paquet'); go.type = 'button';
      go.onclick = () => { d.i = 0; d.max = Math.max(d.max, 0); kSave(); render(); };
      root.append(go);
      return;
    }

    const c = pq.cards[d.i];
    const prog = el('div', 'prog'); const bar = el('span'); bar.style.width = Math.round((d.i + 1) / tot * 100) + '%'; prog.append(bar);
    prog.setAttribute('role', 'progressbar'); prog.setAttribute('aria-valuemin', '1');
    prog.setAttribute('aria-valuemax', String(tot)); prog.setAttribute('aria-valuenow', String(d.i + 1));
    root.append(prog);

    const card = el('article', 'card pcard'); const inn = el('div', 'card-in');
    ['tl', 'br'].forEach(pos => {
      const co = el('div', 'corner ' + pos); co.setAttribute('aria-hidden', 'true');
      co.append(...cornerNodes(String(PAQUETS.indexOf(pq) + 1), (d.i + 1) + '/' + tot));
      inn.append(co);
    });
    inn.append(el('p', 'kicker', c.partie + (c.ex ? ' · Exercice' : '')), el('p', 'q' + lenClass(c.texte), c.texte));

    // Minuteur pour les exercices qui ont une durée
    if (c.ex && c.min) {
      const key = pq.id + ':' + d.i;
      if (ptimer.key !== key) { stopTimer(); ptimer = { key, left: c.min * 60, end: 0, running: false, done: false, id: null }; }
      const tw = el('div', 'timer');
      const clock = el('span', 'clock');
      const tb = el('button', 'rond primary');
      const tr = el('button', 'rond');
      tb.type = tr.type = 'button';
      // Met l'horloge et les deux boutons dans l'état du minuteur
      const afficher = () => {
        clock.textContent = ptimer.done ? 'Temps écoulé' : fmt(ptimer.left);
        clock.className = 'clock' + (ptimer.done ? ' done' : '');
        if (ptimer.running) iconeMinuteur(tb, 'pause', 'Pause');
        else iconeMinuteur(tb, 'lancer', ptimer.done ? 'Relancer' : (ptimer.left < c.min * 60 ? 'Reprendre' : 'Lancer le minuteur'));
        iconeMinuteur(tr, 'recommencer', 'Recommencer');
        tr.hidden = !(ptimer.running || ptimer.done || ptimer.left < c.min * 60);
      };
      const tick = () => {
        ptimer.left = Math.max(0, Math.round((ptimer.end - Date.now()) / 1000));
        if (ptimer.left === 0) { clearInterval(ptimer.id); ptimer.running = false; ptimer.done = true; }
        afficher();
      };
      tb.onclick = () => {
        if (ptimer.running) { stopTimer(); tick(); return; }
        if (ptimer.done || ptimer.left <= 0) { ptimer.left = c.min * 60; ptimer.done = false; }
        ptimer.end = Date.now() + ptimer.left * 1000; ptimer.running = true;
        clearInterval(ptimer.id); ptimer.id = setInterval(tick, 500); afficher();
      };
      tr.onclick = () => { stopTimer(); ptimer.left = c.min * 60; ptimer.done = false; afficher(); };
      afficher();
      const boutons = el('div', 'timer-boutons');
      boutons.append(tb, tr);
      tw.append(clock, boutons); inn.append(tw);
    }
    card.append(inn); root.append(card);

    const row = el('div', 'actions pnav');
    const prev = el('button', 'btn', 'Précédente'); prev.type = 'button'; prev.disabled = d.i === 0;
    // Swipe : vers la gauche pour revenir, vers la droite pour avancer.
    prev.onclick = () => { balayer(card, () => root.querySelector('.pcard'), 'gauche'); d.i--; kSave(); render(); };
    const last = d.i >= tot - 1;
    const next = el('button', 'btn primary', last ? 'Terminer le paquet' : 'Carte suivante'); next.type = 'button';
    next.onclick = () => {
      if (last) { d.max = tot - 1; d.i = tot - 1; kSave(); setOpen(null); render(); window.scrollTo(0, 0); return; }
      balayer(card, () => root.querySelector('.pcard'), 'droite'); // l'ancienne carte part, la suivante est dessous
      d.i++; d.max = Math.max(d.max, d.i); kSave(); render();
    };
    row.append(prev, next); root.append(row);

    root.append(guideBox(false));

    const rs = el('button', 'link', 'Recommencer ce paquet'); rs.type = 'button';
    const conf = el('div', 'confirm'); conf.hidden = true;
    conf.append(el('span', null, 'Le paquet reviendra à la première carte, sur ce téléphone.'));
    const cr = el('div', 'actions');
    const y = el('button', 'btn small primary', 'Recommencer'); y.type = 'button';
    const n = el('button', 'btn small', 'Annuler'); n.type = 'button';
    y.onclick = () => { stopTimer(); K[pq.id] = { i: -1, max: -1 }; kSave(); render(); };
    n.onclick = () => { conf.hidden = true; };
    cr.append(y, n); conf.append(cr);
    rs.onclick = () => { conf.hidden = false; };
    root.append(rs, conf);
  }

  // app.js appelle ceci quand on change d'onglet
  return {
    montrer(v) { visible = v; render(); }
  };
}
