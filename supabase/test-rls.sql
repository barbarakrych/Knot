-- Knot · test des règles de sécurité (RLS).
-- À coller dans Supabase → SQL Editor → Run, APRÈS schema.sql. Rien n'est gardé : tout est annulé à la fin.
--
-- On fabrique de faux téléphones :
--   A et B forment le couple 1 · C forme le couple 2 · D, E, F, G sont d'autres téléphones.
-- Puis on se met à la place de chacun (comme si l'app de ce téléphone parlait à la base)
-- et on vérifie ce qu'il peut voir et faire. Le résultat s'affiche en tableau : chaque ligne doit commencer par ✅.

create temp table if not exists resultats_rls (n serial, resultat text);
truncate resultats_rls;

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  d uuid := gen_random_uuid(); e uuid := gen_random_uuid(); f uuid := gen_random_uuid(); g uuid := gen_random_uuid();
  code1 text; code2 text; relier1 text; relier1_bis text;
  couple1 uuid;
  rep jsonb;
  nb int;
  txt text;
  r text[] := '{}';
  ok boolean;
begin
  begin  -- tout ce bloc est annulé à la fin (voir « fin_des_tests »)

    insert into auth.users (id, aud, role) values
      (a, 'authenticated', 'authenticated'), (b, 'authenticated', 'authenticated'),
      (c, 'authenticated', 'authenticated'), (d, 'authenticated', 'authenticated'),
      (e, 'authenticated', 'authenticated'), (f, 'authenticated', 'authenticated'),
      (g, 'authenticated', 'authenticated');

    -- Se mettre à la place d'un téléphone : rôle « authenticated » et son identifiant
    perform set_config('role', 'authenticated', true);

    -- A crée le couple 1, C crée le couple 2
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    code1 := public.creer_couple('Alix', 'Bao');
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    code2 := public.creer_couple('Cam', 'Dany');
    r := r || (case when code1 ~ '^KNOT-AB-[2-9A-HJ-NP-Z]{4}$' then '✅' else '❌' end
               || ' Format du code : ' || code1);

    -- B rejoint le couple 1
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    rep := public.apercu_code(lower(replace(code1, '-', ' ')));
    r := r || (case when rep->>'prenom' = 'Bao' then '✅' else '❌' end
               || ' B tape le code (même en minuscules) : prénom attendu « ' || coalesce(rep->>'prenom', '?') || ' »');
    rep := public.utiliser_code(code1, null);
    r := r || (case when rep->>'ok' = 'true' then '✅' else '❌' end || ' B rejoint le couple 1');

    -- D (un 3e téléphone) essaie le même code
    perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
    rep := public.utiliser_code(code1, 'Intrus');
    r := r || (case when rep->>'erreur' = 'complet' then '✅' else '❌' end
               || ' Un 3e téléphone ne peut pas rejoindre un couple complet');

    -- A voit son couple et ses 2 membres, rien d'autre
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    select count(*) into nb from public.couples;
    r := r || (case when nb = 1 then '✅' else '❌' end || ' A voit ' || nb || ' couple (le sien)');
    select count(*) into nb from public.membres;
    r := r || (case when nb = 2 then '✅' else '❌' end || ' A voit ' || nb || ' membres (A et B)');
    select id into couple1 from public.couples;

    -- C ne voit rien du couple 1
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    select count(*) into nb from public.couples where id = couple1 or code = code1;
    r := r || (case when nb = 0 then '✅' else '❌' end || ' C ne voit pas le couple 1');
    select count(*) into nb from public.membres where couple_id = couple1;
    r := r || (case when nb = 0 then '✅' else '❌' end || ' C ne voit pas les membres du couple 1');

    -- C essaie d'écrire directement dans les tables
    begin
      insert into public.membres (user_id, couple_id, place) values (c, couple1, 2);
      r := r || '❌ C a pu s''ajouter lui-même au couple 1'::text;
    exception when others then
      r := r || ('✅ C ne peut pas s''ajouter au couple 1 (refusé : ' || sqlerrm || ')');
    end;
    begin
      update public.couples set prenom_1 = 'Pirate' where id = couple1;
      get diagnostics nb = row_count;
      r := r || (case when nb = 0 then '✅' else '❌' end || ' C ne peut pas changer les prénoms du couple 1');
    exception when others then
      r := r || ('✅ C ne peut pas changer les prénoms du couple 1 (refusé : ' || sqlerrm || ')');
    end;

    -- A ne peut pas non plus écrire directement dans son propre couple : tout passe par les fonctions
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    begin
      delete from public.membres where couple_id = couple1;
      get diagnostics nb = row_count;
      r := r || (case when nb = 0 then '✅' else '❌' end || ' Même A ne peut pas effacer de membre directement');
    exception when others then
      r := r || ('✅ Même A ne peut pas effacer de membre directement (refusé : ' || sqlerrm || ')');
    end;

    -- Code « relier » : A le crée pour B
    relier1 := public.code_relier();
    relier1_bis := public.code_relier();
    r := r || (case when relier1 = relier1_bis then '✅' else '❌' end
               || ' Recliquer redonne le même code relier (' || relier1 || ')');
    select count(*) into nb from public.codes_relier where code = relier1 and place = 2;
    r := r || (case when nb = 1 then '✅' else '❌' end || ' Le code de A sert à la place de B, jamais à celle de A');

    -- C ne voit pas ce code
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    select count(*) into nb from public.codes_relier;
    r := r || (case when nb = 0 then '✅' else '❌' end || ' C ne voit aucun code relier du couple 1');

    -- C ne peut pas créer de code relier : son couple n'est pas complet
    begin
      txt := public.code_relier();
      r := r || '❌ C a obtenu un code relier sans couple complet'::text;
    exception when others then
      r := r || '✅ C n''obtient pas de code relier tant que son couple n''est pas complet'::text;
    end;

    -- C, déjà en couple, ne peut pas utiliser le code relier du couple 1
    rep := public.utiliser_code(relier1, null);
    r := r || (case when rep->>'erreur' = 'deja_en_couple' then '✅' else '❌' end
               || ' Un téléphone d''un autre couple ne peut pas utiliser le code relier');

    -- E (nouveau téléphone de B) utilise le code relier
    perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
    rep := public.apercu_code(relier1);
    r := r || (case when rep->>'prenom' = 'Bao' then '✅' else '❌' end
               || ' Le nouveau téléphone voit qu''il reprend la place de « ' || coalesce(rep->>'prenom', '?') || ' »');
    rep := public.utiliser_code(relier1, null);
    r := r || (case when rep->>'ok' = 'true' then '✅' else '❌' end || ' Le nouveau téléphone reprend la place');
    select count(*) into nb from public.couples;
    r := r || (case when nb = 1 then '✅' else '❌' end || ' Le nouveau téléphone voit le couple 1');

    -- L'ancien téléphone de B est détaché
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    select count(*) into nb from public.couples;
    r := r || (case when nb = 0 then '✅' else '❌' end || ' L''ancien téléphone de B ne voit plus le couple');

    -- F essaie le même code relier : déjà utilisé
    perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
    rep := public.utiliser_code(relier1, null);
    r := r || (case when rep->>'erreur' = 'code_inconnu' then '✅' else '❌' end
               || ' Un code relier ne sert qu''une seule fois');

    -- A recrée un code relier : c'est un nouveau code
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    txt := public.code_relier();
    r := r || (case when txt <> relier1 then '✅' else '❌' end || ' Après usage, le bouton crée un nouveau code');

    -- G essaie des codes au hasard
    perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
    for i in 1..10 loop
      rep := public.apercu_code('KNOT-ZZ-' || lpad(i::text, 4, '2'));
    end loop;
    rep := public.apercu_code(code2);
    r := r || (case when rep->>'erreur' = 'trop_d_essais' then '✅' else '❌' end
               || ' Après 10 codes faux, même un bon code est bloqué pour une heure');

    -- Un visiteur non connecté (rôle anon) ne peut rien appeler
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    begin
      txt := public.creer_couple('X', 'Y');
      r := r || '❌ Un visiteur non connecté a pu créer un couple'::text;
    exception when others then
      r := r || '✅ Un visiteur non connecté ne peut rien faire'::text;
    end;
    begin
      select count(*) into nb from public.couples;
      r := r || (case when nb = 0 then '✅' else '❌' end || ' Un visiteur non connecté ne voit aucun couple');
    exception when others then
      r := r || ('✅ Un visiteur non connecté ne voit aucun couple (refusé : ' || sqlerrm || ')');
    end;

    raise exception 'fin_des_tests';
  exception when others then
    if sqlerrm <> 'fin_des_tests' then
      r := r || ('❌ Erreur inattendue : ' || sqlerrm);
    end if;
  end;
  -- Ici, tout ce qui a été créé plus haut est déjà annulé.
  insert into resultats_rls (resultat) select unnest(r);
end $$;

select resultat from resultats_rls order by n;
