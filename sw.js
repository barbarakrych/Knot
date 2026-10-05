/* Service worker : un petit programme que le navigateur garde à côté de l'app.
   Il range une copie des fichiers dans une réserve sur le téléphone, pour que Knot s'ouvre même sans réseau.
   Stratégie « réserve d'abord, mise à jour en arrière-plan » : on montre tout de suite la copie en réserve,
   et si le réseau répond, on remplace la copie pour la prochaine fois.
   → Après une mise en ligne, la nouvelle version apparaît à la 2ᵉ ouverture de l'app. */
const RESERVE = 'knot';

// Fichiers mis en réserve dès l'installation. Un fichier oublié ici sera quand même gardé dès sa première utilisation.
const OSSATURE = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/commun.js', 'js/stockage.js', 'js/contenu.js', 'js/action-verite.js', 'js/pour-plus-tard.js',
  'contenu/verites.json', 'contenu/actions.json', 'contenu/pour-plus-tard.json', 'contenu/sources.json', 'contenu/themes.json',
  'design/icone.svg', 'icones/icone-192.png', 'icones/icone-512.png', 'icones/apple-touch-icon.png'
];

// Seuls nos propres fichiers et les polices Google sont gardés.
const POLICES = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', evenement => {
  // cache: 'reload' : on va chercher la version du serveur, pas une vieille copie du navigateur
  evenement.waitUntil(
    caches.open(RESERVE)
      .then(reserve => reserve.addAll(OSSATURE.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evenement => {
  evenement.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', evenement => {
  const demande = evenement.request;
  if (demande.method !== 'GET') return;
  const url = new URL(demande.url);
  if (url.origin !== self.location.origin && !POLICES.includes(url.origin)) return;

  evenement.respondWith(caches.open(RESERVE).then(async reserve => {
    // ignoreSearch : « index.html?x=1 » utilise la même copie que « index.html »
    const copie = await reserve.match(demande, { ignoreSearch: true });
    const reseau = fetch(demande).then(reponse => {
      // « opaque » : réponse d'un autre site (la feuille de style Google Fonts) que le code ne peut pas lire, mais qu'on peut garder
      if (reponse.ok || reponse.type === 'opaque') reserve.put(demande, reponse.clone());
      return reponse;
    });
    if (copie) {
      evenement.waitUntil(reseau.catch(() => {})); // mise à jour discrète, sans erreur si hors ligne
      return copie;
    }
    return reseau;
  }));
});
