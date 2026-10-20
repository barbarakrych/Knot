// Knot · fonction en ligne « notifier » (Supabase Edge Function).
// L'app l'appelle juste après un geste, avec le compte invisible du téléphone :
//   { type: 'reponse' }  → « [prénom] a répondu à une carte. »
//   { type: 'tirage' }   → « [prénom] a tiré une carte. » (ignorée si la carte précédente a été tirée il y a moins de 30 secondes)
// Elle prévient seulement les téléphones de L'AUTRE personne du couple qui ont activé les notifications.
//
// Secrets à créer dans Supabase → Edge Functions → Secrets (jamais dans le code) :
//   VAPID_PUBLIQUE, VAPID_SECRETE (fabriquées par node outils/generer-cles-vapid.js), VAPID_CONTACT (ex. mailto:…).
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase, côté serveur seulement.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const repondre = (statut: number, corps: unknown) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } });

const TRENTE_SECONDES = 30 * 1000;
const DEUX_MINUTES = 2 * 60 * 1000;

// Les clés sont chargées au premier appel (et pas au démarrage) : une clé mal collée donne un message clair au lieu d'un plantage.
let clesPretes = '';
function preparerCles() {
  if (clesPretes === 'ok') return 'ok';
  try {
    webpush.setVapidDetails(
      (Deno.env.get('VAPID_CONTACT') ?? '').trim() || 'mailto:knot@example.com',
      (Deno.env.get('VAPID_PUBLIQUE') ?? '').trim(),
      (Deno.env.get('VAPID_SECRETE') ?? '').trim()
    );
    clesPretes = 'ok';
  } catch (e) {
    clesPretes = 'cles_vapid: ' + ((e as Error).message ?? e);
  }
  return clesPretes;
}
const base = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false }
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return repondre(405, { erreur: 'methode' });
  const cles = preparerCles();
  if (cles !== 'ok') return repondre(500, { erreur: cles });

  // Qui appelle ? (le compte invisible du téléphone, vérifié par Supabase)
  const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await base.auth.getUser(jeton);
  if (!user) return repondre(401, { erreur: 'non_connecte' });

  let type = '';
  try { type = (await req.json()).type; } catch { /* corps vide */ }
  if (type !== 'reponse' && type !== 'tirage') return repondre(400, { erreur: 'type' });

  const { data: membre } = await base.from('membres').select('couple_id, place').eq('user_id', user.id).maybeSingle();
  if (!membre) return repondre(403, { erreur: 'pas_de_couple' });
  const { data: couple } = await base.from('couples').select('prenom_1, prenom_2').eq('id', membre.couple_id).single();
  const prenom = membre.place === 1 ? couple?.prenom_1 : couple?.prenom_2;
  const autrePlace = membre.place === 1 ? 2 : 1;
  const maintenant = Date.now();

  if (type === 'reponse') {
    // On vérifie qu'une réponse vient vraiment d'être écrite par ce téléphone
    const { count } = await base.from('reponses').select('*', { count: 'exact', head: true })
      .eq('couple_id', membre.couple_id).eq('place', membre.place)
      .gt('ecrite_le', new Date(maintenant - DEUX_MINUTES).toISOString());
    if (!count) return repondre(200, { envoye: 0, raison: 'pas_de_reponse_recente' });
  } else {
    // Tirages : si la carte précédente a été tirée il y a moins de 30 secondes, on ignore celle-ci.
    // L'heure de chaque tirage est notée, même ignoré : les 30 secondes comptent depuis la dernière carte tirée.
    const { data: dernier } = await base.from('notifs_envoyees').select('le')
      .eq('couple_id', membre.couple_id).eq('type', 'tirage').maybeSingle();
    await base.from('notifs_envoyees').upsert({ couple_id: membre.couple_id, type, le: new Date(maintenant).toISOString() });
    if (dernier && maintenant - new Date(dernier.le).getTime() < TRENTE_SECONDES) {
      return repondre(200, { envoye: 0, raison: 'trop_tot' });
    }
  }

  const message = JSON.stringify({
    titre: 'Knot',
    texte: (prenom ?? 'L’autre') + (type === 'reponse' ? ' a répondu à une carte.' : ' a tiré une carte.'),
    tag: 'knot-' + type
  });

  const { data: abonnements } = await base.from('abonnements').select('user_id, endpoint, p256dh, auth')
    .eq('couple_id', membre.couple_id).eq('place', autrePlace);
  let envoye = 0;
  for (const a of abonnements ?? []) {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, message, { TTL: 60 * 60 * 12 });
      envoye++;
    } catch (e) {
      // 404 / 410 : l'app a été supprimée ou les notifications coupées sur ce téléphone → on oublie l'abonnement
      const statut = (e as { statusCode?: number }).statusCode;
      if (statut === 404 || statut === 410) await base.from('abonnements').delete().eq('user_id', a.user_id);
      else console.error('Envoi impossible', statut, e);
    }
  }
  return repondre(200, { envoye });
});
