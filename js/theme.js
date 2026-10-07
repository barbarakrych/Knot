/* Thème de l'app : Sombre (par défaut), Clair ou Auto (comme le téléphone). Propre à chaque téléphone, gardé sur l'appareil.

   Les couleurs sont dans css/styles.css (variables --paper, --ink…). Ce fichier ne fait que poser
   data-theme sur <html> :
     • 'light' → toujours clair · 'dark' → toujours sombre ;
     • rien → le CSS suit le réglage du téléphone (@media prefers-color-scheme), même s'il change en cours de route.
   Le petit script en haut d'index.html fait la même chose avant le premier affichage (pas d'éclair de la mauvaise couleur). */
import { CLES, lire, ecrire } from './stockage.js';

// Dans l'ordre du bouton des Réglages : chaque appui passe au suivant (sombre → clair → auto → sombre…)
export const THEMES = ['sombre', 'clair', 'auto'];
const DEFAUT = 'sombre'; // rien d'enregistré sur le téléphone → sombre

export function themeSuivant(t = themeChoisi()) { return THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]; }
const FOND = { clair: '#EEF1F6', sombre: '#0F1420' }; // couleur de la barre du téléphone (comme --paper)

export function themeChoisi() {
  const t = lire(CLES.theme, DEFAUT);
  return THEMES.includes(t) ? t : DEFAUT;
}

export function appliquerTheme(t = themeChoisi()) {
  const html = document.documentElement;
  if (t === 'auto') html.removeAttribute('data-theme');
  else html.setAttribute('data-theme', t === 'sombre' ? 'dark' : 'light');
  // Barre du téléphone : en Auto, chaque balise garde sa condition (clair / sombre) ; sinon, toutes prennent la couleur choisie.
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    const sienne = (m.media || '').includes('dark') ? FOND.sombre : FOND.clair;
    m.setAttribute('content', t === 'auto' ? sienne : FOND[t]);
  });
}

export function choisirTheme(t) {
  if (!THEMES.includes(t)) return;
  ecrire(CLES.theme, t);
  appliquerTheme(t);
}
