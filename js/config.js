/* Adresse du projet Supabase et sa clé PUBLIQUE (« publishable » ou « anon »).
   Cette clé peut être dans le code : elle ne donne accès qu'à ce que les règles de sécurité (RLS) permettent.
   Ne jamais mettre ici la clé secrète (« secret » ou « service_role »). */
export const SUPABASE_URL = 'https://gfjqthxizcurqudlmfjl.supabase.co';
export const SUPABASE_CLE = 'sb_publishable_UvdQKtCfoh_kPTGcdt_iMQ_M50MPRFv';
// Clé PUBLIQUE des notifications (node outils/generer-cles-vapid.js). Vide = notifications pas encore configurées.
// La clé SECRÈTE, elle, va seulement dans les secrets Supabase (Edge Functions → Secrets).
export const VAPID_PUBLIQUE = 'BNjEL7NBcNX66zcotJEo4mEbgD4vwsaJeNODNOCGUfZwPxAYqP8tJiQn2a4R5LrQKGfC4xLavKU4XSGMTpazj8I';
