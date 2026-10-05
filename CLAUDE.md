# Knot

Jeu de cartes pour couples, à distance ou non : « Action ou Vérité » et « Pour plus tard » (8 paquets tirés d'études reconnues sur le couple). Application web installable sur iPhone et Android (PWA), sans passer par les stores.

## Qui je suis
- Je débute en code. J'apprends en construisant ce projet.
- IMPORTANT : explique ce que tu fais en mots simples, en français, à chaque étape. Quand tu introduis une notion nouvelle (base de données, service worker, Git…), donne une explication d'une ou deux phrases.
- Propose un plan et attends mon accord avant tout changement important.
- Après chaque étape, dis-moi exactement comment tester sur mon ordinateur et sur mon téléphone.

## Référence
- `prototype/knot-prototype.html` : la version qui marche dans claude.ai. C'est la référence pour le design, les écrans et le comportement. Ne pas l'éditer : reconstruire proprement à côté.
- `contenu/` : tout le contenu en JSON (vérités, actions, paquets « Pour plus tard », sources, thèmes). Les textes sont validés : ne jamais les réécrire sans me demander.
- `design/knot-logo.svg` : le logo (nœud d'Héraclès, bleu marine bordé d'or).
- `PLAN.md` : les étapes du projet, dans l'ordre. On en fait une à la fois.

## Choix techniques
- HTML, CSS et JavaScript simples, sans framework ni étape de build, tant que c'est possible.
- PWA : manifest, icône, service worker pour fonctionner hors ligne.
- Supabase (offre gratuite) pour les comptes et le partage, à partir de l'étape 3 seulement. Connexion par lien envoyé par e-mail, sans mot de passe.
- Hébergement gratuit (Netlify ou GitHub Pages), relié au dépôt GitHub.

## Règles du jeu à respecter
- Une carte tirée ne ressort pas tant qu'on ne remélange pas la pile. « Passer » remet la carte dans la pile.
- Interrupteur « À distance » : activé, il retire les actions `mode: "ensemble"` ; désactivé, il retire les actions `mode: "distance"`. Il ne concerne que la pile Action.
- Les actions avec `minutes` ont un minuteur ; `minutes: null` = pas de minuteur. `quand: "semaine"` s'affiche « Cette semaine ».
- Champ `taille` des actions : `"petite"` (se fait sur le moment) ou `"grande"` (demande de s'organiser ou se fait plus tard). Dans l'interface, les grandes actions s'appellent des « défis ». Une carte ajoutée par le couple est un défi si la case « C'est un défi » est cochée, sinon elle est petite.
- Défi en cours : quand on tire un défi, il devient le défi en cours, affiché en haut de l'écran Action ou Vérité avec « C'est fait ! » et un lien « Remettre dans la pile ». Tant qu'il y a un défi en cours, aucun autre défi ne sort au tirage (les petites actions, si). « C'est fait ! » termine le défi (la carte reste tirée) ; « Remettre dans la pile » l'annule et la carte peut ressortir. Passer un défi juste tiré l'annule aussi. Remélanger et l'interrupteur « À distance » ne touchent pas au défi en cours.
- Champ `detail` (facultatif) : thèmes ou idées, affichés sous le texte de la carte, en plus petit, sans chevaucher les coins.
- Chaque carte affiche sa source (« D'après … ») à partir de `sources.json`.
- « Pour plus tard » : les cartes d'un paquet se suivent dans l'ordre, avec Précédente / Carte suivante et une progression. Le guide de conversation est affiché sur la liste des paquets et dans chaque paquet.
- Aucun défi ne demande de dépenser de l'argent ou de se faire livrer.

## Design
- Cartes verticales façon carte à jouer (ratio 5:7), bordure rayée rouge, blanc, bleu « par avion », coins avec lettre (V bleu, A rouge), numéro et petit nœud.
- Couleurs : papier #EEF1F6, carte #FFFFFF, encre #1C2740, gris #5B6782, rouge #C8323A, bleu #2A4A98, or du logo #C9A646, vert interrupteur #34C759. Mode sombre : reprendre les valeurs du prototype.
- Polices : Bricolage Grotesque (titres, interface), Newsreader (texte des cartes), DM Mono (petites étiquettes).
- L'interrupteur « À distance » ressemble à celui des réveils d'iPhone.

## Habitudes de travail
- Git : sauvegarde (commit) après chaque étape qui marche, avec un message clair en français.
- Ne jamais mettre de clé secrète dans le code. La clé publique (« anon ») de Supabase peut y être ; la clé « service_role » jamais.
- Vérifie ton travail toi-même avant de dire que c'est fini : ouvre l'app, teste le parcours, montre-moi le résultat.
