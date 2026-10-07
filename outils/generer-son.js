/* Fabrique le son de fin du minuteur : sons/fin-minuteur.wav.
   Un petit carillon doux de deux notes (sol puis do, qui montent), comme une clochette qu'on effleure :
   chaque note a une attaque très courte puis s'éteint doucement. Pas d'alarme, rien d'agressif.
   Volume volontairement modéré : le volume du téléphone fait le reste.
   À lancer à la main si on veut changer le son :  node outils/generer-son.js */
const fs = require('fs');
const path = require('path');

const FREQ_ECH = 22050;   // échantillons par seconde (largement assez pour un carillon, et un fichier léger)
const DUREE = 1.4;        // secondes
const NOTES = [           // départ (s), fréquence (Hz)
  { t: 0, f: 783.99 },    // sol
  { t: 0.2, f: 1046.5 }   // do, au-dessus
];
// Harmoniques d'une clochette : la note, puis quelques sons plus aigus, plus faibles et plus brefs
const HARMONIQUES = [{ x: 1, a: 1, d: 0.42 }, { x: 2, a: 0.28, d: 0.22 }, { x: 3.01, a: 0.09, d: 0.12 }];
const CRETE = 0.5;        // la crête du son à la moitié du maximum possible

const n = Math.round(FREQ_ECH * DUREE);
const son = new Float32Array(n);
for (const note of NOTES) {
  const debut = Math.round(note.t * FREQ_ECH);
  for (let i = debut; i < n; i++) {
    const s = (i - debut) / FREQ_ECH;
    const attaque = Math.min(1, s / 0.006); // 6 ms : pas de « clic » au départ
    let v = 0;
    for (const h of HARMONIQUES) v += h.a * Math.exp(-s / h.d) * Math.sin(2 * Math.PI * note.f * h.x * s);
    son[i] += attaque * v;
  }
}
// Fin en douceur, puis mise au bon volume
for (let i = 0; i < n; i++) son[i] *= Math.min(1, (n - i) / (0.08 * FREQ_ECH));
const max = son.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

// Fichier WAV : un en-tête de 44 octets, puis les échantillons en entiers de 16 bits
const donnees = Buffer.alloc(n * 2);
for (let i = 0; i < n; i++) donnees.writeInt16LE(Math.round((son[i] / max) * CRETE * 32767), i * 2);
const entete = Buffer.alloc(44);
entete.write('RIFF', 0); entete.writeUInt32LE(36 + donnees.length, 4); entete.write('WAVE', 8);
entete.write('fmt ', 12); entete.writeUInt32LE(16, 16); entete.writeUInt16LE(1, 20); entete.writeUInt16LE(1, 22);
entete.writeUInt32LE(FREQ_ECH, 24); entete.writeUInt32LE(FREQ_ECH * 2, 28); entete.writeUInt16LE(2, 32); entete.writeUInt16LE(16, 34);
entete.write('data', 36); entete.writeUInt32LE(donnees.length, 40);

const sortie = path.resolve(__dirname, '..', 'sons', 'fin-minuteur.wav');
fs.mkdirSync(path.dirname(sortie), { recursive: true });
fs.writeFileSync(sortie, Buffer.concat([entete, donnees]));
console.log('generer-son : ' + path.relative(process.cwd(), sortie) + ' (' + Math.round((44 + donnees.length) / 1024) + ' Ko)');
