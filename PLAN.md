# Plan de Knot, étape par étape

Une étape = une session de Claude Code. Entre deux étapes, tape `/clear` pour repartir sur une conversation propre (le fichier CLAUDE.md, lui, est relu à chaque fois).

Pour chaque étape :
1. Passe en mode **Plan** (sélecteur à côté du bouton d'envoi dans l'app, ou `Shift+Tab` dans le terminal).
2. Colle le prompt de l'étape.
3. Lis le plan proposé, pose tes questions, puis valide.
4. Teste comme Claude te l'explique.
5. Si ça marche : « Fais un commit de cette étape. »

---

## Étape 0 · Mise en route (une seule fois)

Prompt :
> Lis CLAUDE.md et PLAN.md. Regarde le prototype et le dossier contenu, sans rien modifier. Explique-moi en mots simples ce que tu as compris du projet, puis vérifie ce qui est installé sur mon ordinateur (Git, Node.js) et dis-moi ce qui manque et comment l'installer. Enfin, initialise un dépôt Git et fais un premier commit avec les fichiers actuels.

---

## Étape 1 · L'app hors ligne, sans compte

Objectif : reconstruire le prototype proprement, en fichiers séparés, avec le contenu lu depuis `contenu/`. Tout reste sur le téléphone (pas encore de partage).

Prompt :
> Étape 1 du PLAN. Reconstruis l'app à partir du prototype, en fichiers séparés (index.html, styles, scripts) et en lisant le contenu dans le dossier contenu. Garde exactement le même design et les mêmes fonctions : Action ou Vérité avec l'interrupteur À distance, le minuteur, l'ajout, la modification et la suppression de cartes, et Pour plus tard avec ses 8 paquets. La progression est enregistrée sur l'appareil. Propose d'abord un plan avec la liste des fichiers, et explique-moi le rôle de chacun.

Test : ouvrir l'app dans l'aperçu, tirer des cartes, recharger la page, vérifier que tout est retenu.

---

## Étape 2 · Installable sur les téléphones et en ligne

Objectif : une vraie PWA (icône sur l'écran d'accueil, marche hors ligne) mise en ligne gratuitement, pour l'ouvrir sur vos deux téléphones.

Prompt :
> Étape 2 du PLAN. Transforme l'app en PWA installable : manifest, icônes générées à partir de design/knot-logo.svg, service worker pour le hors ligne. Puis guide-moi pas à pas pour créer un dépôt GitHub et mettre l'app en ligne gratuitement sur Netlify (ou GitHub Pages si c'est plus simple). Explique-moi comment l'ajouter à l'écran d'accueil sur iPhone et sur Android.

Test : ouvrir le lien sur ton téléphone et celui de ton copain, l'ajouter à l'écran d'accueil, passer en mode avion et vérifier que ça marche encore.

---

## Étape 3 · Le couple (sans e-mail)

Objectif : relier vos deux téléphones avec un code, sans e-mail ni mot de passe. Chaque téléphone a automatiquement un compte invisible dans Supabase (connexion anonyme) et reste connecté.

Ce qui a été fait (détails dans CLAUDE.md, partie « Couple ») :
- Écran d'accueil à la première ouverture : « Créer notre couple » (« Je suis… », « Je joue avec… », puis le code KNOT-XX-XXXX à donner à l'autre) ou « J'ai un code » (« Tu es bien [prénom] ? »). Un couple = 2 téléphones au plus.
- Sous le titre : « ♥ [l'autre] et [moi] ». Plus aucun texte sur l'état du partage.
- Écran Réglages (engrenage en haut à droite) : code du couple tant que l'autre n'a pas rejoint, puis « Relier le téléphone de [l'autre] » (code à usage unique).
- Règles de sécurité (RLS) : chacun ne voit que son couple. Vérification : `supabase/test-rls.sql` dans l'éditeur SQL de Supabase.
- Le jeu (cartes tirées, progression) reste encore sur chaque téléphone : il sera partagé à l'étape 4. Un téléphone relié reprend donc sa place dans le couple, mais pas encore sa progression.

Test : sur ton téléphone, depuis l'icône Knot (sur iPhone, pas depuis Safari : ce sont deux mémoires séparées), crée le couple ; ton copain choisit « J'ai un code » sur le sien.

---

## Étape 4 · Le paquet partagé

Objectif : quand l'un tire une carte, elle s'affiche chez l'autre en direct et ne ressort plus.

Prompt :
> Étape 4 du PLAN. Partage le jeu entre les deux membres du couple avec Supabase : cartes déjà tirées, carte affichée en direct chez les deux, remélange, progression des paquets Pour plus tard. Garde le fonctionnement hors ligne : si on n'est pas connecté, l'app marche sur l'appareil et se synchronise ensuite. Propose un plan et explique-moi comment fonctionne le temps réel.

Test : chacun ouvre l'app, l'un tire une carte, elle apparaît chez l'autre.

À inclure dans cette étape :
- ~~Chacun son tour~~ : essayé puis abandonné. Chacun tire quand il veut ; seul l'historique « Déjà tirées » indique qui a tiré chaque carte.
- Minuteur partagé : une fois lancé, il s'écoule sur les deux téléphones (si l'app est ouverte sur les deux en même temps).
- Défi en cours partagé : le défi en cours s'affiche sur les deux téléphones, et « C'est fait ! » ou « Remettre dans la pile » sur l'un le retire aussi chez l'autre.
- Interrupteur « À distance » partagé : il est le même sur les deux téléphones, comme les cartes tirées. Le changer sur l'un le change aussi chez l'autre.
- Reprise de la progression : quand le partage s'active, la progression déjà faite sur un téléphone (cartes tirées, paquets « Pour plus tard ») devient celle du couple, au lieu de repartir de zéro.

✅ Fait (détails dans CLAUDE.md, « Règles du jeu » et « Couple ») :
- Table `parties` (une ligne par couple) et fonction `jouer()` dans `supabase/schema.sql`, tests dans `supabase/test-rls.sql`. Nouveau fichier `js/partie.js` : file d'attente hors ligne et temps réel.
- Cartes tirées, carte affichée, défi en cours, remélange, minuteur, cartes ajoutées et paquets « Pour plus tard » partagés en direct.
- « À distance » déplacé dans les Réglages (au-dessus de « Relier le téléphone de [l'autre] »). « Tirée par [prénom] » discret dans l'historique « Déjà tirées », pas sur la carte.

---

## Idée après l'étape 4 · Carte interactive « Nos valeurs »

Objectif : la première carte du paquet Nos valeurs devient interactive. Chacun écrit ses 5 valeurs sur son téléphone ; quand les deux ont fini, la carte se retourne et on voit les valeurs de l'autre.

À respecter : les réponses ne servent que pendant le jeu et peuvent être effacées. L'app reste un support, pas un journal du couple.

---

## Étape 5 · Cartes personnelles privées

Objectif : les cartes que j'ajoute, moi seule les vois dans ma liste ; pareil pour l'autre.

Décidé :
- Une carte ajoutée par une personne entre dans le paquet commun et peut sortir au tirage chez les deux.
- Elle n'apparaît que dans la liste « Vos cartes » de la personne qui l'a créée.
- Quand elle sort au tirage, elle ressemble exactement aux autres cartes : rien n'indique qui l'a ajoutée.

Prompt :
> Étape 5 du PLAN. Les cartes ajoutées par une personne doivent être privées : visibles seulement dans sa propre liste « Vos cartes », mais elles entrent dans le paquet commun et peuvent sortir au tirage chez les deux, sans rien qui indique qui les a ajoutées (voir « Décidé »). Utilise les règles RLS de Supabase pour que ce soit garanti par la base de données, pas seulement par l'affichage, et montre-moi comment le vérifier avec les deux comptes.

---

## Étape 6 · Finitions

Idées à piocher, une par session :
- Écran d'accueil et explication du jeu à la première ouverture
- Mode sombre et réglages
  - L'écran Réglages existe depuis l'étape 3 (engrenage en haut à droite, un bloc `<section class="reglage">` par réglage dans index.html). « À distance » y est depuis l'étape 4. Y ajouter : le thème (Clair, Sombre ou Comme le téléphone, Clair par défaut) et le son de fin du minuteur (activé ou non). Quand À distance est activé, afficher une petite mention « À distance » sur la pile Action. D'autres réglages viendront plus tard : prévoir un écran facile à compléter.
  - Quand À distance est activé, afficher la distance entre nous (par exemple « ✈ 5 500 km entre vous »). À décider : localisation automatique (arrondie à la ville, jamais la position exacte) ou ville choisie une fois dans les Réglages.
  - Un son doux quand le minuteur se termine (à faire avec l'écran Réglages, qui permet de le couper). La vibration a été essayée et retirée : elle ne marchait pas sur Android et n'est pas possible sur iPhone. À revoir avec le son.
- Pouvoir balayer la carte du doigt pour en tirer une nouvelle.
- ✅ Fait autrement : mises à jour automatiques dès la 1ʳᵉ ouverture, sans bandeau. La nouvelle version s'installe toute seule et l'app se recharge une fois, à un moment calme (jamais pendant un minuteur ou une saisie). Détails dans CLAUDE.md, « Choix techniques ».
- Démarrage sur Android : entre l'écran de démarrage (le logo) et l'app, il y a encore comme un saut d'environ une seconde.
  - Déjà fait (et gardé) : fond de la même couleur partout dès le premier instant, page invisible et sans animation tant qu'elle n'est pas prête, puis affichée d'un coup.
  - Déjà essayé (sans effet, retiré) : retarder le signal « page chargée » jusqu'à ce que l'app soit prête, pour que Chrome garde le logo plus longtemps.
  - Piste suivante : garder sur le téléphone une copie de la dernière page affichée et la montrer tout de suite à l'ouverture.
- Exporter ses notes ou ses cartes
- ✅ Fait : note « Pourquoi Knot ? » en bas de toutes les pages (élément fixe, comme le logo), avec ce texte, sans le modifier :
  > Les Grecs l'appelaient Hêraklêotikon hamma, le nœud d'Héraclès : deux cordes passées l'une dans l'autre, qui ne font plus qu'un. Il porte le nom de celui qui a traversé douze épreuves sans lâcher. On ne le défait pas en tirant, seulement en prenant le temps de le comprendre, boucle après boucle. Knot, c'est ce nœud-là : deux fils qui se découvrent sans masque et choisissent de tenir ensemble, même quand ça tire.
- Faire relire le projet : « Utilise un sous-agent pour relire tout le code et me dire ce qui pourrait poser problème. Ne signale que ce qui compte vraiment. »

## Plus tard · Des cartes infinies

Générer de nouvelles cartes avec une IA, à partir de sources.json, pour qu'on ne fasse jamais le tour du jeu. À faire une fois tout le reste solide.

---

## Pense-bête
- `Esc` : arrêter Claude en plein travail. `Esc` deux fois ou `/rewind` : revenir en arrière.
- Si tu corriges Claude deux fois sur la même chose sans succès : `/clear`, puis un prompt plus précis.
- « Explique-moi ce que tu viens de faire en mots simples » marche à tout moment.
- Une capture d'écran glissée dans le message vaut mieux qu'une longue description.
- Ne fais qu'une étape à la fois. Les idées nouvelles vont dans une liste « Plus tard » ici, pas dans l'étape en cours.
