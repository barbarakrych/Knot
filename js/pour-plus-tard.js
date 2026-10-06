/* Onglet « Pour plus tard » : les 8 paquets, carte par carte, dans l'ordre. */
import { $, el, fmt, lenClass, cornerNodes, srcLine, balayer, iconeMinuteur, etatMinuteur, ordreMinuteur } from './commun.js';
import { CLES, lire, ecrire } from './stockage.js';
import { etat, agir, ecouter, maintenant } from './partie.js';

const GUIDE = [
  'Celui qui parle parle de lui, avec des « je », en phrases courtes.',
  'L’autre reformule ce qu’il a compris avant de répondre : « Si je comprends bien, pour toi… »',
  'On cherche à comprendre, pas à convaincre. Les solutions viendront après.',
  'On a le droit de passer une carte, sans se justifier.',
  'Si ça chauffe, pause de 20 minutes, puis on reprend.'
];

export function demarrerPourPlusTard({ SOURCES, PAQUETS }) {
  // Progression par paquet : i = carte affichée (-1 = pas commencé), max = carte la plus loin atteinte.
  // Elle est partagée par les deux téléphones (partie.js) ; le paquet ouvert, lui, reste propre à ce téléphone.
  let K = {}, MINUTEUR = null;
  function charger() { const e = etat(); K = e.paquets; MINUTEUR = e.minuteur; }
  let open = lire(CLES.ecran, {}).open || null;
  let visible = false;
  let afficherMinuteur = null; // met à jour le minuteur de la carte affichée, s'il y en a un

  function kSave(id, d) { agir([{ set: ['paquets', id], valeur: { i: d.i, max: d.max } }]); }
  function kGet(id) { return { ...(K[id] || { i: -1, max: -1 }) }; }
  function setOpen(id) { open = id; ecrire(CLES.ecran, { ...lire(CLES.ecran, {}), open: id }); }

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
    afficherMinuteur = null;
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
      // Même phrase sous « Pourquoi Knot ? » (index.html)
      el('p', 'affiliation', 'Knot n’est affilié à aucun des chercheurs, auteurs ou organismes cités. Les cartes sont des créations originales inspirées de leurs travaux.')
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
    back.onclick = () => { setOpen(null); render(); };
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
      go.onclick = () => { d.i = 0; d.max = Math.max(d.max, 0); kSave(pq.id, d); render(); };
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
    // Le minuteur est celui de la partie, partagé avec l'autre téléphone (clé « paquet:id:numéro de carte »).
    if (c.ex && c.min) {
      const cle = 'paquet:' + pq.id + ':' + d.i, total = c.min * 60;
      const tw = el('div', 'timer');
      const clock = el('span', 'clock');
      const tb = el('button', 'rond primary');
      const tr = el('button', 'rond');
      tb.type = tr.type = 'button';
      // Met l'horloge et les deux boutons dans l'état du minuteur
      afficherMinuteur = () => {
        const t = etatMinuteur(MINUTEUR, cle, total, maintenant());
        clock.textContent = t.done ? 'Temps écoulé' : fmt(t.left);
        clock.className = 'clock' + (t.done ? ' done' : '');
        if (t.running) iconeMinuteur(tb, 'pause', 'Pause');
        else iconeMinuteur(tb, 'lancer', t.done ? 'Relancer' : (t.left < total ? 'Reprendre' : 'Lancer le minuteur'));
        iconeMinuteur(tr, 'recommencer', 'Recommencer');
        tr.hidden = !(t.running || t.done || t.left < total);
      };
      tb.onclick = () => agir([ordreMinuteur(MINUTEUR, cle, total, maintenant())]);
      tr.onclick = () => agir([{ suppr: ['minuteur'] }]);
      afficherMinuteur();
      const boutons = el('div', 'timer-boutons');
      boutons.append(tb, tr);
      tw.append(clock, boutons); inn.append(tw);
    }
    card.append(inn); root.append(card);

    const row = el('div', 'actions pnav');
    const prev = el('button', 'btn', 'Précédente'); prev.type = 'button'; prev.disabled = d.i === 0;
    // Swipe : vers la gauche pour revenir, vers la droite pour avancer.
    prev.onclick = () => { balayer(card, () => root.querySelector('.pcard'), 'gauche'); d.i--; kSave(pq.id, d); render(); };
    const last = d.i >= tot - 1;
    const next = el('button', 'btn primary', last ? 'Terminer le paquet' : 'Carte suivante'); next.type = 'button';
    next.onclick = () => {
      if (last) { d.max = tot - 1; d.i = tot - 1; kSave(pq.id, d); setOpen(null); render(); window.scrollTo(0, 0); return; }
      balayer(card, () => root.querySelector('.pcard'), 'droite'); // l'ancienne carte part, la suivante est dessous
      d.i++; d.max = Math.max(d.max, d.i); kSave(pq.id, d); render();
    };
    row.append(prev, next); root.append(row);

    root.append(guideBox(false));

    const rs = el('button', 'link', 'Recommencer ce paquet'); rs.type = 'button';
    const conf = el('div', 'confirm'); conf.hidden = true;
    conf.append(el('span', null, 'Le paquet reviendra à la première carte, pour vous deux.'));
    const cr = el('div', 'actions');
    const y = el('button', 'btn small primary', 'Recommencer'); y.type = 'button';
    const n = el('button', 'btn small', 'Annuler'); n.type = 'button';
    y.onclick = () => { kSave(pq.id, { i: -1, max: -1 }); render(); };
    n.onclick = () => { conf.hidden = true; };
    cr.append(y, n); conf.append(cr);
    rs.onclick = () => { conf.hidden = false; };
    root.append(rs, conf);
  }

  // Changement de la partie. Geste fait ici : l'écran est déjà redessiné par le bouton, seul le minuteur est mis à jour.
  // Reçu de l'autre téléphone : on redessine si la progression a changé (avec un swipe si la carte ouverte a changé),
  // sinon seulement le minuteur.
  ecouter((e, origine) => {
    const avant = K;
    charger();
    if (origine === 'serveur' && visible && JSON.stringify(avant) !== JSON.stringify(K)) {
      const a = open && avant[open], b = open && K[open];
      const card = document.querySelector('#view-topics .pcard');
      if (card && a && b && a.i !== b.i && b.i >= 0) {
        balayer(card, () => document.querySelector('#view-topics .pcard'), b.i > a.i ? 'droite' : 'gauche');
      }
      render();
    } else if (afficherMinuteur) afficherMinuteur();
  });
  setInterval(() => { if (afficherMinuteur && MINUTEUR && MINUTEUR.marche) afficherMinuteur(); }, 500);
  charger();

  // app.js appelle ceci quand on change d'onglet
  return {
    montrer(v) { visible = v; render(); }
  };
}
