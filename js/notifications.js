/* Notifications (étape 7) : « [prénom] a répondu à une carte », « [prénom] a tiré une carte ».
   Une notification « push » s'affiche même quand l'app est fermée. Le navigateur du téléphone donne une adresse
   d'abonnement ; on la range dans Supabase (s_abonner) ; la fonction en ligne « notifier »
   (supabase/functions/notifier) envoie le message à l'adresse de l'AUTRE téléphone. sw.js l'affiche.
   Ça marche sur Android, et sur iPhone seulement en iOS 16.4 ou plus, avec Knot ouvert depuis l'écran d'accueil.
   Le choix est propre à chaque téléphone (interrupteur dans les Réglages). */
import { obtenirClient } from './couple.js';
import { VAPID_PUBLIQUE } from './config.js';
import { estDemo } from './demo.js';

// Ce téléphone peut-il recevoir des notifications ? 'oui', 'non' (navigateur trop ancien, ou iPhone avant iOS 16.4
// ou ouvert hors de l'écran d'accueil) ou 'pas_configure' (clé publique pas encore mise dans config.js).
export function possible() {
  if (!VAPID_PUBLIQUE) return 'pas_configure';
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  return ok ? 'oui' : 'non';
}

async function abonnementActuel() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// Activées sur ce téléphone ? (autorisation donnée et abonnement présent)
export async function actives() {
  if (possible() !== 'oui' || Notification.permission !== 'granted') return false;
  try { return !!(await abonnementActuel()); } catch (e) { return false; }
}

// La clé publique est écrite en « base64url » ; le navigateur la veut en octets
function enOctets(cle) {
  const b64 = (cle + '='.repeat((4 - cle.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// Active : demande l'autorisation au téléphone, s'abonne, et range l'adresse dans Supabase.
// Renvoie true, ou un code : 'refuse' (autorisation refusée), 'erreur'.
export async function activer() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'refuse';
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: enOctets(VAPID_PUBLIQUE) });
    const j = sub.toJSON();
    const sb = await obtenirClient();
    const { error } = await sb.rpc('s_abonner', { adresse: j.endpoint, cle_p256dh: j.keys.p256dh, cle_auth: j.keys.auth });
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('Notifications non activées :', e.message || e);
    return 'erreur';
  }
}

export async function desactiver() {
  try { const sub = await abonnementActuel(); if (sub) await sub.unsubscribe(); } catch (e) {}
  try { const sb = await obtenirClient(); await sb.rpc('se_desabonner'); } catch (e) {}
}

// Après un geste ici : prévient l'autre téléphone (s'il a activé les notifications). Jamais en démo ni hors ligne.
// Si ça échoue, tant pis : la notification n'est qu'un plus, le jeu continue.
export function prevenir(type) {
  if (estDemo() || !navigator.onLine || !VAPID_PUBLIQUE) return;
  obtenirClient()
    .then(sb => sb.functions.invoke('notifier', { body: { type } }))
    .catch(e => console.info('Notification non envoyée :', e.message || e));
}
