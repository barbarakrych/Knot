/* Numéro de version de l'app, écrit dans sw.js (const VERSION = '…').
   C'est une « empreinte » calculée à partir du contenu de tous les fichiers de l'app (liste OSSATURE de sw.js) :
   si un seul fichier change, l'empreinte change, et les téléphones savent qu'une nouvelle version est en ligne.
   Lancé tout seul avant chaque commit (.githooks/pre-commit). À la main :  node outils/version-sw.js */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.resolve(__dirname, '..');
const SW = path.join(RACINE, 'sw.js');
let sw = fs.readFileSync(SW, 'utf8');

// La liste des fichiers mis en réserve, lue dans sw.js
const liste = sw.match(/const OSSATURE = \[([\s\S]*?)\];/);
if (!liste) { console.error('version-sw : liste OSSATURE introuvable dans sw.js'); process.exit(1); }
const fichiers = [...liste[1].matchAll(/'([^']+)'/g)].map(m => m[1]).filter(f => f !== './');

// Empreinte : contenu de chaque fichier (fins de ligne uniformisées, pour que Windows et GitHub donnent la même)
const empreinte = crypto.createHash('sha256');
for (const f of fichiers) {
  const chemin = path.join(RACINE, f);
  if (!fs.existsSync(chemin)) { console.error('version-sw : fichier introuvable : ' + f); process.exit(1); }
  let contenu = fs.readFileSync(chemin);
  if (!/\.(png|ico|wav)$/.test(f)) contenu = Buffer.from(contenu.toString('utf8').replace(/\r\n/g, '\n'));
  empreinte.update(f + '\0').update(contenu);
}
const version = empreinte.digest('hex').slice(0, 12);

// Fichiers de l'app oubliés dans la liste (ils marcheraient hors ligne seulement après une première utilisation)
const dossiers = { js: /\.js$/, 'js/vendor': /\.js$/, css: /\.css$/, contenu: /\.json$/, icones: /\.png$/, sons: /\.wav$/ };
for (const [dossier, motif] of Object.entries(dossiers)) {
  for (const nom of fs.readdirSync(path.join(RACINE, dossier))) {
    const f = dossier + '/' + nom;
    if (motif.test(nom) && !fichiers.includes(f)) console.warn('version-sw : ' + f + ' n’est pas dans OSSATURE (sw.js)');
  }
}

const nouveau = sw.replace(/const VERSION = '[^']*';/, "const VERSION = '" + version + "';");
if (nouveau !== sw) {
  fs.writeFileSync(SW, nouveau);
  console.log('version-sw : nouvelle version ' + version);
} else {
  console.log('version-sw : version inchangée (' + version + ')');
}
