/* Fabrique les icônes de l'app à partir du logo (design/knot-logo.svg).
   Lancer :  node outils/generer-icones.js
   1. Écrit design/icone.svg (icône normale) et design/icone-maskable.svg (version Android « découpable »).
   2. Ouvre Chrome en mode invisible pour les « photographier » en PNG dans le dossier icones/. */
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

// Le contenu du logo (les traits du nœud), sans la balise <svg> qui l'entoure. Il mesure 100 × 44.
const logo = fs.readFileSync(path.join(RACINE, 'design/knot-logo.svg'), 'utf8');
const noeud = logo.slice(logo.indexOf('>') + 1, logo.lastIndexOf('</svg>'));

/* Icône carrée de 512 : fond rayé « par avion » (comme la bordure des cartes), panneau blanc arrondi, nœud au centre.
   marge = largeur de la bande rayée autour du panneau ; largeurNoeud = largeur du nœud. */
function icone(marge, rayon, largeurNoeud) {
  const echelle = largeurNoeud / 100;
  const x = (512 - largeurNoeud) / 2;
  const y = (512 - 44 * echelle) / 2;
  const cote = 512 - 2 * marge;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs><pattern id="rayures" width="72" height="72" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
<rect width="72" height="72" fill="#FFFFFF"/><rect width="24" height="72" fill="#C8323A"/><rect x="36" width="24" height="72" fill="#2A4A98"/>
</pattern></defs>
<rect width="512" height="512" fill="url(#rayures)"/>
<rect x="${marge}" y="${marge}" width="${cote}" height="${cote}" rx="${rayon}" fill="#FFFFFF"/>
<g transform="translate(${x} ${y}) scale(${echelle})">${noeud}</g>
</svg>
`;
}

// Android découpe parfois l'icône en rond : dans la version « maskable », le panneau et le nœud sont plus petits pour rester visibles.
const normale = icone(56, 72, 320);
const maskable = icone(96, 64, 236);
fs.writeFileSync(path.join(RACINE, 'design/icone.svg'), normale);
fs.writeFileSync(path.join(RACINE, 'design/icone-maskable.svg'), maskable);

const chrome = CHROMES.find(c => fs.existsSync(c));
if (!chrome) { console.error('Chrome (ou Edge) introuvable : impossible de créer les PNG.'); process.exit(1); }

const sortie = path.join(RACINE, 'icones');
fs.mkdirSync(sortie, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-icones-'));

function photographier(svg, taille, nom) {
  const page = path.join(temp, nom + '.html');
  fs.writeFileSync(page, `<!doctype html><style>html,body{margin:0;overflow:hidden}svg{display:block;width:${taille}px;height:${taille}px}</style>${svg}`);
  execFileSync(chrome, ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=' + taille + ',' + taille, '--screenshot=' + path.join(sortie, nom), 'file:///' + page.replace(/\\/g, '/')], { stdio: 'ignore' });
  console.log('icones/' + nom);
}

photographier(normale, 192, 'icone-192.png');
photographier(normale, 512, 'icone-512.png');
photographier(maskable, 512, 'icone-maskable-512.png');
photographier(normale, 180, 'apple-touch-icon.png');
fs.rmSync(temp, { recursive: true, force: true });
