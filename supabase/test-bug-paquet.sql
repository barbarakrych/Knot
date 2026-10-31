-- Knot · enquête : la réponse de B disparaît-elle quand A répond, sur une carte « Pour plus tard » ?
-- À coller dans Supabase → SQL Editor → Run. Rien n'est gardé : tout est annulé à la fin.
-- Un faux couple (A et B) est créé pour l'occasion ; aucun vrai couple n'est lu ni modifié.
-- Le résultat s'affiche en tableau. Les lignes « · » décrivent ce qui est dans la base (sans les textes).

create temp table if not exists resultats_bug (n serial, resultat text);
truncate resultats_bug;

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  code1 text; couple1 uuid;
  rep jsonb; ligne record; def text;
  r text[] := '{}';
begin
  begin  -- tout ce bloc est annulé à la fin (voir « fin_des_tests »)

    -- 0. Les fonctions en ligne sont-elles celles de schema.sql ? (ménage par personne)
    def := pg_get_functiondef('public.annuler_interne(uuid,text,text)'::regprocedure);
    r := r || (case when def like '%r.place in (select x.place%' then '✅' else '❌' end
               || ' annuler_interne en ligne : ménage des « rendue » par personne');
    def := pg_get_functiondef('public.repondre(text,text,text)'::regprocedure);
    r := r || (case when def like '%r.place = ma and r.fois <> la_fois and r.statut = ''rendue''%' then '✅' else '❌' end
               || ' repondre en ligne : ménage des « rendue » par personne');
    def := pg_get_functiondef('public.finaliser(uuid,text,text)'::regprocedure);
    r := r || (case when def like '%r.place = b.place and r.fois <> la_fois%' then '✅' else '❌' end
               || ' finaliser en ligne : ménage des « rendue » par personne');

    insert into auth.users (id, aud, role) values
      (a, 'authenticated', 'authenticated'), (b, 'authenticated', 'authenticated');
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    code1 := public.creer_couple('Alix', 'Bao');
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    rep := public.utiliser_code(code1, null);
    couple1 := public.mon_couple_id();

    -- A commence un paquet (comme « Commencer le paquet » : t = 1000)
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    rep := public.jouer('[{"set": ["paquets", "p1"], "valeur": {"i": 0, "max": 0, "t": 1000}}]'::jsonb);

    -- 1. Carte simple, même « fois » des deux côtés : B répond, puis A
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    rep := public.repondre('paquet:p1:0', '1000', 'Réponse de B');
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    rep := public.repondre('paquet:p1:0', '1000', 'Réponse de A');
    r := r || (case when rep->>'autre' = 'Réponse de B' then '✅' else '❌' end
               || ' 1. Même fois : après son envoi, A voit la réponse de B');
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    rep := public.lire_reponses('paquet:p1:0', '1000');
    r := r || (case when rep->>'moi' = 'Réponse de B' then '✅' else '❌' end
               || ' 1. Même fois : B voit toujours sa propre réponse');

    -- 2. Exercice chronométré (commencer_reponse puis repondre), même « fois »
    rep := public.commencer_reponse('paquet:p1:1', '1000', 300);
    rep := public.repondre('paquet:p1:1', '1000', 'Exercice de B');
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    rep := public.commencer_reponse('paquet:p1:1', '1000', 300);
    rep := public.repondre('paquet:p1:1', '1000', 'Exercice de A');
    r := r || (case when rep->>'autre' = 'Exercice de B' then '✅' else '❌' end
               || ' 2. Exercice chronométré : A voit la réponse de B');

    -- 3. Les deux téléphones n'ont pas la même « fois » (ex. 0 chez B, 1000 chez A)
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    rep := public.repondre('paquet:p1:2', '0', 'Réponse de B (fois 0)');
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    rep := public.repondre('paquet:p1:2', '1000', 'Réponse de A (fois 1000)');
    r := r || (case when rep->'autre' = 'null'::jsonb or rep->>'autre' is null then '⚠️' else '✅' end
               || ' 3. Fois différentes : A ' || case when rep->>'autre' is null then 'ne trouve pas' else 'trouve' end
               || ' la réponse de B');

    -- 4. Correctif : l'heure de début est à part (debuts) ; « Carte suivante » d'un téléphone en retard n'y touche pas
    rep := public.jouer('[{"set": ["debuts", "p1"], "valeur": 2000}, {"set": ["paquets", "p1"], "valeur": {"i": 0, "max": 0}}]'::jsonb);
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    rep := public.jouer('[{"set": ["paquets", "p1"], "valeur": {"i": 1, "max": 1}}]'::jsonb);
    r := r || (case when rep->'etat'->'debuts'->>'p1' = '2000' then '✅' else '❌' end
               || ' 4. Correctif : l''heure de début reste 2000 après « Carte suivante » de B');
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

    -- Ce qui reste dans la base pour ce faux couple
    perform set_config('role', 'postgres', true);
    for ligne in select carte, fois, place, statut from public.reponses
        where couple_id = couple1 order by carte, fois, place loop
      r := r || ('· ' || ligne.carte || ' | fois ' || ligne.fois || ' | personne ' || ligne.place || ' | ' || ligne.statut);
    end loop;
    r := r || ('· paquets dans la partie : ' || coalesce((select (etat->'paquets')::text from public.parties where couple_id = couple1), '?'));

    raise exception 'fin_des_tests';
  exception when others then
    if sqlerrm <> 'fin_des_tests' then
      r := r || ('❌ Erreur inattendue : ' || sqlerrm);
    end if;
  end;
  insert into resultats_bug (resultat) select unnest(r);
end $$;

select resultat from resultats_bug order by n;
