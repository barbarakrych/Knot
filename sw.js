/* Service worker : un petit programme que le navigateur garde à côté de l'app.
   Il range une copie des fichiers dans une réserve sur le téléphone, pour que Knot s'ouvre même sans réseau.
   Stratégie « réserve d'abord, mise à jour en arrière-plan » : on montre tout de suite la copie en réserve,
   et si le réseau répond, on remplace la copie pour la prochaine fois.
   → Après une mise en ligne, la nouvelle version apparaît à la 2ᵉ ouverture de l'app (bien fermée entre les deux). */
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

/* « pret.gif » : une image invisible demandée par la page au démarrage. Le navigateur attend ses images avant
   d'annoncer « page chargée », et Chrome sur Android garde l'écran de démarrage jusqu'à ce moment-là.
   On ne livre donc l'image que quand l'app nous dit « pret » (voir app.js), ou au bout de 4 secondes au plus tard :
   l'écran de démarrage disparaît directement sur l'app, sans moment vide entre les deux. */
const IMAGE_VIDE = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), c => c.charCodeAt(0));
const PRETES = new Set();      // pages qui ont déjà dit « pret »
const EN_ATTENTE = new Map();  // page → fonction qui livre son image

self.addEventListener('message', evenement => {
  if (evenement.data !== 'pret' || !evenement.source) return;
  const page = evenement.source.id;
  const livrer = EN_ATTENTE.get(page);
  if (livrer) livrer(); else PRETES.add(page);
});

function attendrePage(page) {
  return new Promise(livrer => {
    if (PRETES.delete(page)) { livrer(); return; }
    const fin = () => { EN_ATTENTE.delete(page); livrer(); };
    EN_ATTENTE.set(page, fin);
    setTimeout(fin, 4000);
  }).then(() => new Response(IMAGE_VIDE, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' } }));
}

self.addEventListener('fetch', evenement => {
  const demande = evenement.request;
  if (demande.method !== 'GET') return;
  const url = new URL(demande.url);
  if (url.origin === self.location.origin && url.pathname.endsWith('/pret.gif')) {
    evenement.respondWith(attendrePage(evenement.clientId));
    return;
  }
  if (url.origin !== self.location.origin && !POLICES.includes(url.origin)) return;

  evenement.respondWith(caches.open(RESERVE).then(async reserve => {
    // ignoreSearch : « index.html?x=1 » utilise la même copie que « index.html »
    const copie = await reserve.match(demande, { ignoreSearch: true });
    // cache: 'no-cache' : on redemande toujours au serveur. Sinon le navigateur ressort sa propre copie
    // (GitHub Pages l'autorise à la garder 10 minutes) et la réserve garderait l'ancienne version.
    const reseau = fetch(demande, { cache: 'no-cache' }).then(reponse => {
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
