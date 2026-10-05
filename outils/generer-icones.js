/* Fabrique les icônes PNG de l'app à partir des originaux SVG.
   Lancer :  node outils/generer-icones.js
   Part de design/icone.svg (icône normale) et design/icone-maskable.svg (version Android « découpable »),
   puis ouvre Chrome en mode invisible pour les « photographier » en PNG dans le dossier icones/.
   Pour changer l'icône : modifier ces deux SVG, puis relancer l'outil. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const RACINE = path.resolve(__dirname, '..');
const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

const normale = fs.readFileSync(path.join(RACINE, 'design/icone.svg'), 'utf8');
const maskable = fs.readFileSync(path.join(RACINE, 'design/icone-maskable.svg'), 'utf8');

const chrome = CHROMES.find(c => fs.existsSync(c));
if (!chrome) { console.error('Chrome (ou Edge) introuvable : impossible de créer les PNG.'); process.exit(1); }

// Dossier de sortie : icones/ par défaut, ou celui donné après la commande (pratique pour comparer sans rien écraser).
const sortie = path.resolve(RACINE, process.argv[2] || 'icones');
fs.mkdirSync(sortie, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-icones-'));

function photographier(svg, taille, nom) {
  const page = path.join(temp, nom + '.html');
  fs.writeFileSync(page, `<!doctype html><style>html,body{margin:0;overflow:hidden}svg{display:block;width:${taille}px;height:${taille}px}</style>${svg}`);
  execFileSync(chrome, ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=' + taille + ',' + taille, '--screenshot=' + path.join(sortie, nom), 'file:///' + page.replace(/\\/g, '/')], { stdio: 'ignore' });
  console.log(path.relative(RACINE, path.join(sortie, nom)));
}

photographier(normale, 192, 'icone-192.png');
photographier(normale, 512, 'icone-512.png');
photographier(maskable, 512, 'icone-maskable-512.png');
photographier(normale, 180, 'apple-touch-icon.png');
fs.rmSync(temp, { recursive: true, force: true });
