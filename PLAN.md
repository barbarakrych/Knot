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

## Étape 3 · Comptes et couple

Objectif : chacun se connecte avec son e-mail (lien magique, sans mot de passe), puis vous vous reliez avec un code d'invitation.

Prompt :
> Étape 3 du PLAN. Je veux ajouter des comptes avec Supabase : connexion par lien envoyé par e-mail, puis création d'un « couple » avec un code d'invitation que l'autre saisit. Interviewe-moi d'abord sur les cas particuliers (perte du téléphone, changement d'e-mail, quitter un couple…), puis propose un plan. Guide-moi pas à pas pour créer le projet Supabase. Mets en place des règles de sécurité (RLS) pour qu'un couple ne voie jamais les données d'un autre, et montre-moi comment les tester.

Test : te connecter sur ton téléphone, créer le couple, ton copain rejoint avec le code.

---

## Étape 4 · Le paquet partagé

Objectif : quand l'un tire une carte, elle s'affiche chez l'autre en direct et ne ressort plus.

Prompt :
> Étape 4 du PLAN. Partage le jeu entre les deux membres du couple avec Supabase : cartes déjà tirées, carte affichée en direct chez les deux, remélange, progression des paquets Pour plus tard. Garde le fonctionnement hors ligne : si on n'est pas connecté, l'app marche sur l'appareil et se synchronise ensuite. Propose un plan et explique-moi comment fonctionne le temps réel.

Test : chacun ouvre l'app, l'un tire une carte, elle apparaît chez l'autre.

---

## Étape 5 · Cartes personnelles privées

Objectif : les cartes que j'ajoute, moi seule les vois dans ma liste ; pareil pour lui.

À décider avant : quand ma carte privée sort au tirage, mon copain la voit-il à l'écran ? (Proposition : oui, c'est une carte surprise, mais il ne la voit jamais dans les listes.)

Prompt :
> Étape 5 du PLAN. Les cartes ajoutées par une personne doivent être privées : visibles seulement dans sa propre liste « Vos cartes ». Voici ma décision sur le tirage : [écris ta réponse]. Utilise les règles RLS de Supabase pour que ce soit garanti par la base de données, pas seulement par l'affichage, et montre-moi comment le vérifier avec les deux comptes.

---

## Étape 6 · Finitions

Idées à piocher, une par session :
- Écran d'accueil et explication du jeu à la première ouverture
- Mode sombre et réglages
- Exporter ses notes ou ses cartes
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
