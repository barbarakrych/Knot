/* Fabrique les deux clés « VAPID » des notifications : node outils/generer-cles-vapid.js
   Une notification push est signée par Knot ; le téléphone vérifie la signature avec la clé publique.
   • Clé PUBLIQUE : à mettre dans js/config.js (VAPID_PUBLIQUE) ET dans les secrets Supabase (VAPID_PUBLIQUE).
   • Clé SECRÈTE : seulement dans les secrets Supabase (Edge Functions → Secrets → VAPID_SECRETE). Jamais dans le code.
   À ne faire qu'une fois : changer de clés oblige chaque téléphone à réactiver les notifications.
   Rien n'est enregistré : les clés s'affichent seulement ici. */
const crypto = require('crypto');

const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();
const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

console.log('Clé PUBLIQUE (js/config.js et secret VAPID_PUBLIQUE) :');
console.log(b64url(ecdh.getPublicKey()));
console.log('');
console.log('Clé SECRÈTE (secret VAPID_SECRETE seulement, ne la colle nulle part ailleurs) :');
const secrete = ecdh.getPrivateKey();
console.log(b64url(Buffer.concat([Buffer.alloc(32 - secrete.length), secrete]))); // toujours 32 octets
