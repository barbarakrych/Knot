/* Service worker : un petit programme que le navigateur garde à côté de l'app.
   Il range une copie complète de l'app dans une réserve sur le téléphone, pour que Knot s'ouvre même sans réseau.

   Mises à jour :
   • VERSION change à chaque commit qui modifie l'app (outils/version-sw.js, lancé tout seul par Git).
   • Le téléphone vérifie souvent si sw.js a changé. Si oui, la nouvelle version est téléchargée en entier
     dans une nouvelle réserve, pendant que l'app continue de tourner avec l'ancienne.
   • Quand c'est prêt, l'app (js/mise-a-jour.js) choisit un moment calme, demande à la nouvelle version
     de prendre la place (message « installer »), puis se recharge une fois.
   • Sans réseau, rien ne change : l'app s'ouvre avec la dernière version gardée en réserve. */
const VERSION = 'e13be0a99364';
const RESERVE = 'knot-' + VERSION;
const RESERVE_POLICES = 'knot-polices'; // gardées d'une version à l'autre

// Toute l'app, mise en réserve dès l'installation. Un fichier oublié ici est gardé dès sa première utilisation,
// mais outils/version-sw.js signale ceux qui manquent.
const OSSATURE = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/commun.js', 'js/stockage.js', 'js/contenu.js', 'js/action-verite.js', 'js/pour-plus-tard.js',
  'js/config.js', 'js/couple.js', 'js/partie.js', 'js/mise-a-jour.js', 'js/accueil.js', 'js/reglages.js', 'js/theme.js', 'js/son.js',
  'js/vendor/supabase.js', 'sons/fin-minuteur.wav',
  'contenu/verites.json', 'contenu/actions.json', 'contenu/pour-plus-tard.json', 'contenu/sources.json', 'contenu/themes.json',
  'design/icone.svg', 'icones/icone-192.png', 'icones/icone-512.png', 'icones/icone-maskable-512.png', 'icones/apple-touch-icon.png'
];

// Seuls nos propres fichiers et les polices Google sont gardés. Les échanges avec Supabase (autre site) ne le sont jamais.
const POLICES = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

// Sur l'ordinateur (serveur local), on prend toujours la dernière version des fichiers pour voir tout de suite
// ce qu'on modifie ; la réserve ne sert qu'en cas de coupure.
// Adresse du site de présentation, à côté de l'app (ex. https://barbarakrych.github.io/Knot/site/)
const SITE = new URL('site/', self.registration.scope).href;

const SUR_ORDINATEUR =['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', evenement => {
  // cache: 'reload' : on va chercher la version du serveur, pas une vieille copie du navigateur.
  // Pas de skipWaiting ici : la nouvelle version attend que l'app lui dise « installer » (moment calme).
  evenement.waitUntil(
    caches.open(RESERVE).then(reserve => reserve.addAll(OSSATURE.map(f => new Request(f, { cache: 'reload' }))))
  );
});

self.addEventListener('message', evenement => {
  if (evenement.data === 'installer') self.skipWaiting();
});

self.addEventListener('activate', evenement => {
  // Les réserves des anciennes versions sont effacées
  evenement.waitUntil(
    caches.keys()
      .then(noms => Promise.all(noms.filter(n => n !== RESERVE && n !== RESERVE_POLICES).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evenement => {
  const demande = evenement.request;
  if (demande.method !== 'GET') return;
  const url = new URL(demande.url);

  if (POLICES.includes(url.origin)) {
    // Polices : la copie gardée tout de suite, mise à jour en arrière-plan
    evenement.respondWith(caches.open(RESERVE_POLICES).then(async reserve => {
      const copie = await reserve.match(demande);
      const reseau = fetch(demande).then(reponse => {
        // « opaque » : réponse d'un autre site que le code ne peut pas lire, mais qu'on peut garder
        if (reponse.ok || reponse.type === 'opaque') reserve.put(demande, reponse.clone());
        return reponse;
      });
      if (copie) { evenement.waitUntil(reseau.catch(() => {})); return copie; }
      return reseau;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Le site de présentation (dossier site/) est une page indépendante : jamais mis en réserve, jamais intercepté
  if (url.href.startsWith(SITE)) return;

  evenement.respondWith(caches.open(RESERVE).then(async reserve => {
    // ignoreSearch : « index.html?x=1 » utilise la même copie que « index.html »
    const copie = await reserve.match(demande, { ignoreSearch: true });
    const garder = reponse => { if (reponse.ok) reserve.put(demande, reponse.clone()); return reponse; };
    if (SUR_ORDINATEUR) return fetch(demande, { cache: 'no-cache' }).then(garder).catch(() => copie || Response.error());
    // Sur le téléphone : la réserve de cette version, toujours complète et cohérente
    return copie || fetch(demande).then(garder);
  }));
});
