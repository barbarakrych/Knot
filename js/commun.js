/* Petits outils partagés par les deux onglets. */

export const $ = id => document.getElementById(id);

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Minuteur : 125 secondes → « 2:05 »
export function fmt(sec) { return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }

// Boutons ronds du minuteur : petite icône dessinée (pas de caractère ▶, que l'iPhone change en émoji).
// Le libellé reste lu par les lecteurs d'écran et s'affiche au survol.
const ICONES_MINUTEUR = {
  lancer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.8v12.4a.8.8 0 0 0 1.2.7l9.8-6.2a.8.8 0 0 0 0-1.4L9.7 5.1a.8.8 0 0 0-1.2.7Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>',
  recommencer: '<svg viewBox="0 0 24 24" aria-hidden="true" class="trait"><path d="M5 12a7 7 0 1 0 2.1-5"/><path d="M5 4.5V9h4.5"/></svg>'
};
export function iconeMinuteur(bouton, icone, libelle) {
  bouton.innerHTML = ICONES_MINUTEUR[icone];
  bouton.setAttribute('aria-label', libelle);
  bouton.title = libelle;
}

// Texte long → police un peu plus petite sur la carte
export function lenClass(t) { return t.length > 220 ? ' xlong' : (t.length > 140 ? ' long' : ''); }

// Swipe : à appeler juste AVANT d'afficher la nouvelle carte. Une copie de la carte actuelle est posée
// par-dessus, puis part sur le côté en tournant ; la nouvelle carte, déjà entière dessous, se révèle.
// Rien si le téléphone est réglé pour réduire les animations.
// nouvelle : fonction qui renvoie la nouvelle carte (par défaut, la même carte, mise à jour sur place).
// sens : 'gauche' (par défaut) ou 'droite'.
export function balayer(card, nouvelle = () => card, sens = 'gauche') {
  if (!card || !card.isConnected) return;
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
  const r = card.getBoundingClientRect();
  if (!r.width || r.bottom < 0 || r.top > innerHeight) return; // carte hors de l'écran : pas besoin
  const copie = card.cloneNode(true);
  copie.removeAttribute('id');
  copie.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  copie.setAttribute('aria-hidden', 'true');
  copie.inert = true;
  copie.classList.add('swipe');
  if (sens === 'droite') copie.classList.add('droite');
  Object.assign(copie.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  document.body.append(copie);
  // Si la nouvelle carte a bougé (ex. l'encadré « Défi en cours » apparaît au-dessus),
  // on recale la copie sur elle avant que l'écran soit redessiné : elle part bien de dessus.
  requestAnimationFrame(() => {
    const n = nouvelle();
    if (!n || !n.isConnected) return;
    const r2 = n.getBoundingClientRect();
    copie.style.left = r2.left + 'px'; copie.style.top = r2.top + 'px';
  });
  const fin = () => copie.remove();
  copie.addEventListener('animationend', fin);
  setTimeout(fin, 1000); // sécurité si l'animation ne se termine pas
}

// Coin de carte : lettre (V, A, K, numéro du paquet), numéro, et petit nœud
// (copié depuis le logo du titre, pour ne pas répéter le dessin).
export function cornerNodes(letter, num) {
  const nodes = [el('b', null, letter)];
  if (num) nodes.push(el('span', null, num));
  const knot = document.querySelector('h1 .knot');
  if (knot) nodes.push(knot.cloneNode(true));
  return nodes;
}

// Bouton « Copier » : met le texte dans le presse-papiers et affiche « Copié ✓ » un instant.
export function copier(texte, bouton) {
  const libelle = bouton.textContent;
  const fini = ok => {
    bouton.textContent = ok ? 'Copié ✓' : 'Copie impossible';
    setTimeout(() => { bouton.textContent = libelle; }, 2000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texte).then(() => fini(true), () => fini(false));
  else fini(false);
}

// « D'après … » à partir d'une liste de clés de sources.json
export function srcLine(SOURCES, keys) {
  const labels = keys.map(k => SOURCES[k] && SOURCES[k].label).filter(Boolean);
  return el('p', 'srcline', 'D’après ' + labels.join(' · '));
}
