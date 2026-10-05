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
- `design/knot-logo.svg` : le logo (nœud d'Héraclès, bleu marine bordé d'or, sans traits aux extrémités).
- `PLAN.md` : les étapes du projet, dans l'ordre. On en fait une à la fois.

## Choix techniques
- HTML, CSS et JavaScript simples, sans framework ni étape de build, tant que c'est possible.
- PWA : manifest, icône, service worker pour fonctionner hors ligne.
- Supabase (offre gratuite) pour le couple et le partage, à partir de l'étape 3. Pas d'e-mail ni de mot de passe : connexion anonyme (chaque téléphone a automatiquement un compte invisible et reste connecté), sans écran de connexion. La base est décrite dans `supabase/schema.sql` ; `supabase/test-rls.sql` vérifie les règles de sécurité (RLS). L'adresse du projet et la clé publique sont dans `js/config.js`. La bibliothèque Supabase est copiée dans `js/vendor/supabase.js` (hors ligne).
- Hébergement gratuit sur GitHub Pages (dépôt public, branche main, dossier racine). Chaque mise à jour en ligne = commit + `git push`.

## Règles du jeu à respecter
- Une carte tirée ne ressort pas tant qu'on ne remélange pas la pile. « Passer » remet la carte dans la pile.
- Interrupteur « À distance » : activé, il retire les actions `mode: "ensemble"` ; désactivé, il retire les actions `mode: "distance"`. Il ne concerne que la pile Action.
- Les actions avec `minutes` ont un minuteur ; `minutes: null` = pas de minuteur. Le minuteur correspond au temps écrit sur la carte (« en 5 minutes » → 5). Si c'est chacun son tour, c'est le temps d'un tour : on relance le minuteur pour l'autre. Une durée en secondes s'écrit avec le champ `secondes` et `minutes: null` (ex. « Câlin de vingt secondes » → `"minutes": null, "secondes": 20`) ; la carte affiche alors « 20 s ». Une durée qui n'est pas un temps à chronométrer (« à une heure inattendue ») n'a pas de minuteur. `quand: "semaine"` s'affiche « Cette semaine ».
- Champ `taille` des actions : `"petite"` (se fait sur le moment) ou `"grande"` (demande de s'organiser ou se fait plus tard). Dans l'interface, les grandes actions s'appellent des « défis ». Une carte ajoutée par le couple est un défi si la case « C'est un défi » est cochée, sinon elle est petite.
- Défi en cours : quand on tire un défi, il devient le défi en cours, affiché en haut de l'écran Action ou Vérité avec « C'est fait ! » et un lien « Remettre dans la pile ». Tant qu'il y a un défi en cours, aucun autre défi ne sort au tirage (les petites actions, si). « C'est fait ! » termine le défi (la carte reste tirée) ; « Remettre dans la pile » l'annule et la carte peut ressortir. Passer un défi juste tiré l'annule aussi. Remélanger et l'interrupteur « À distance » ne touchent pas au défi en cours.
- Champ `detail` (facultatif) : thèmes ou idées, affichés sous le texte de la carte, en plus petit, sans chevaucher les coins.
- Chaque carte affiche sa source (« D'après … ») à partir de `sources.json`.
- « Pour plus tard » : les cartes d'un paquet se suivent dans l'ordre, avec Précédente / Carte suivante et une progression. Le guide de conversation est affiché sur la liste des paquets et dans chaque paquet.
- Aucun défi ne demande de dépenser de l'argent ou de se faire livrer.
- L'app est un support pour jouer, pas un journal du couple : ce que le couple écrit pendant le jeu (par exemple les réponses d'une carte interactive) ne sert que pendant la partie et peut être effacé.

## Couple
- Première ouverture : écran d'accueil obligatoire, « Créer notre couple » ou « J'ai un code ». Internet est nécessaire cette fois-là seulement.
- « Créer notre couple » : « Je suis… » et « Je joue avec… ». La personne qui crée est la personne 1, l'autre la personne 2. Les deux prénoms sont enregistrés dans Supabase, et chaque téléphone sait s'il est la personne 1 ou 2.
- Les prénoms sont des variables : jamais écrits dans le code, ni affichés par défaut, ni pré-remplis. L'app marche pour n'importe quel couple, quel que soit le genre : pas de « il / elle », on écrit le prénom ou « l'autre ».
- Sous le titre : « ♥ [prénom de l'autre] et [mon prénom] ». Le prénom de l'autre d'abord, partout dans l'app. Rien tant que le couple n'existe pas. Aucun texte sur l'état du partage (« Sur cet appareil seulement », « Paquet partagé à deux »…).
- Codes : `KNOT-` + initiales (personne 1 puis 2) + `-` + 4 caractères tirés au hasard par la base, sans 0, O, 1, I (ex. KNOT-VB-7K3Q). Saisie tolérante (minuscules, espaces). Plus de 10 codes faux en une heure : bloqué une heure.
- « J'ai un code » : on tape le code, puis « Tu es bien [prénom] ? » (« Oui, c'est moi » ou « Corriger mon prénom »). Un couple a au plus 2 téléphones : une fois complet, son code ne permet plus de rejoindre.
- Réglages (engrenage en haut à droite) : tant que l'autre n'a pas rejoint, « Code du couple · en attente de [l'autre] » avec Copier. Ensuite, « Relier le téléphone de [l'autre] » (« Si [l'autre] a supprimé l'app ou changé de téléphone. ») : code à usage unique, sans expiration, qui ne sert qu'à l'autre pour reprendre sa propre place, jamais la mienne. Recliquer redonne le même code tant qu'il n'a pas servi (« Code en cours de validité · en attente de [l'autre] »). Une fois utilisé, l'ancien téléphone est détaché et revient à l'accueil.
- Si les deux téléphones perdent l'app, on recrée un couple : pas de sauvegarde.
- Sécurité : une personne ne voit que les données de son couple, garanti par les règles RLS de la base. Aucune écriture directe dans les tables : tout passe par les fonctions de `supabase/schema.sql`.

## Design
- Cartes verticales façon carte à jouer (ratio 5:7), bordure rayée rouge, blanc, bleu « par avion », coins avec lettre (V bleu, A rouge), numéro et petit nœud.
- Couleurs : papier #EEF1F6, carte #FFFFFF, encre #1C2740, gris #5B6782, rouge #C8323A, bleu #2A4A98, or du logo #C9A646, vert interrupteur #34C759. Mode sombre : reprendre les valeurs du prototype.
- Polices : Bricolage Grotesque (titres, interface), Newsreader (texte des cartes), DM Mono (petites étiquettes).
- L'interrupteur « À distance » ressemble à celui des réveils d'iPhone.
- Icône de l'app : le nœud et le mot Knot en blanc, dans la police des titres, sur fond bleu nuit #1C2740 (aussi la couleur de l'écran de démarrage, `background_color` du manifest). Originaux : `design/icone.svg` (aussi utilisée comme favicon) et la version Android `design/icone-maskable.svg` (plus de marge). `node outils/generer-icones.js` en tire les PNG de `icones/`.

## Habitudes de travail
- Git : sauvegarde (commit) après chaque étape qui marche, avec un message clair en français.
- Avant chaque `git push` : `git pull --rebase`. Le 1er de chaque mois, la tâche GitHub « Garder Supabase éveillé » (`.github/workflows/garder-supabase-eveille.yml`) ajoute elle-même un commit (date dans `.github/derniere-activite.txt`) pour que GitHub ne la suspende jamais ; il faut donc récupérer ce commit avant d'envoyer les nôtres. Elle appelle aussi tous les 3 jours la fonction `reveil()` de Supabase pour que le projet gratuit ne se mette pas en pause.
- Ne jamais mettre de clé secrète dans le code. La clé publique (« anon ») de Supabase peut y être ; la clé « service_role » jamais.
- Vérifie ton travail toi-même avant de dire que c'est fini : ouvre l'app, teste le parcours, montre-moi le résultat.
