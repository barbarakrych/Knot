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
