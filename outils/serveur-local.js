/* Mini-serveur pour ouvrir Knot sur l'ordinateur (et sur le téléphone, via le même Wi-Fi).
   Lancer :  node outils/serveur-local.js   puis ouvrir http://localhost:8080
   Il ne fait que donner les fichiers du dossier du projet au navigateur. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const RACINE = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wav': 'audio/wav',
  '.webmanifest': 'application/manifest+json'
};

http.createServer((req, res) => {
  let chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (chemin.endsWith('/')) chemin += 'index.html';
  const fichier = path.join(RACINE, chemin);
  // Sécurité : on ne sert rien en dehors du dossier du projet, ni le dossier .git
  if (!fichier.startsWith(RACINE + path.sep) || fichier.includes(path.sep + '.git')) { res.writeHead(403); res.end(); return; }
  fs.readFile(fichier, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Introuvable'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('Knot tourne sur http://localhost:' + PORT);
  for (const liste of Object.values(os.networkInterfaces())) {
    for (const a of liste || []) {
      if (a.family === 'IPv4' && !a.internal) console.log('Sur le téléphone (même Wi-Fi) : http://' + a.address + ':' + PORT);
    }
  }
});
