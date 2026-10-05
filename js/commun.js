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

// « D'après … » à partir d'une liste de clés de sources.json
export function srcLine(SOURCES, keys) {
  const labels = keys.map(k => SOURCES[k] && SOURCES[k].label).filter(Boolean);
  return el('p', 'srcline', 'D’après ' + labels.join(' · '));
}
