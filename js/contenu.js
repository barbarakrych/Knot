/* Lecture du contenu : les fichiers JSON du dossier contenu/.
   On les traduit dans le format qu'utilise le reste du code (repris du prototype). */

async function lireJSON(nom) {
  const reponse = await fetch('contenu/' + nom + '.json');
  if (!reponse.ok) throw new Error('Fichier contenu/' + nom + '.json introuvable (' + reponse.status + ')');
  return reponse.json();
}

export async function chargerContenu() {
  const [verites, actions, paquets, sources, themes] = await Promise.all(
    ['verites', 'actions', 'pour-plus-tard', 'sources', 'themes'].map(lireJSON)
  );

  // Sources : clé → { label (« D'après … »), name, what, url }
  const SOURCES = {};
  for (const [cle, s] of Object.entries(sources)) {
    SOURCES[cle] = { label: s.etiquette, name: s.nom, what: s.resume, url: s.lien || '' };
  }

  // Cartes de base des deux piles.
  // mode des actions : 'ensemble' (en vrai), 'distance' (seulement à distance), 'les-deux'.
  // min : 0 = pas de minuteur (minutes vaut null dans le fichier).
  // big : true pour les actions « grande », appelées « défis » dans l'interface.
  // detail : thèmes ou idées affichés en petit sous le texte (souvent vide).
  const BASE = [];
  verites.forEach(v => BASE.push({
    id: v.id, pile: 'verite', theme: v.theme || '', src: v.source || '', text: v.texte, min: 0, when: '', mode: '', big: false, detail: ''
  }));
  actions.forEach(a => BASE.push({
    id: a.id, pile: 'action', theme: '', src: a.source || '', text: a.texte,
    min: a.minutes == null ? 0 : a.minutes, when: a.quand === 'semaine' ? 'week' : '', mode: a.mode || 'les-deux',
    big: a.taille === 'grande', detail: a.detail || ''
  }));

  // Paquets « Pour plus tard ».
  const PAQUETS = paquets.map(p => ({
    id: p.id, name: p.nom, study: p.etude, dur: p.duree, src: p.sources || [], url: p.lien || '',
    intro: p.intro, how: p.conseil,
    cards: p.cartes.map(c => ({ partie: c.partie, ex: c.type === 'exercice', texte: c.texte, min: c.minutes || 0 }))
  }));

  return { SOURCES, THEMES: themes, BASE, PAQUETS };
}
