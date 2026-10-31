-- Knot · migration « heure de début des paquets » (réponses qui semblaient s'effacer dans « Pour plus tard »).
-- À coller UNE fois dans Supabase → SQL Editor → Run. Rien n'est effacé : on peut le relancer sans risque.
-- Ce bloc est la copie des parties correspondantes de schema.sql (qui décrit l'état final de la base).

-- L'heure de début des paquets quitte la progression (paquets.id.t) pour sa propre liste (debuts.id).
update public.parties p set
  etat = jsonb_set(p.etat, '{debuts}', coalesce(p.etat->'debuts', '{}'::jsonb) || (
    select jsonb_object_agg(k, v->'t') from jsonb_each(p.etat->'paquets') as t(k, v)
    where jsonb_typeof(v) = 'object' and v ? 't' and not coalesce(p.etat->'debuts', '{}'::jsonb) ? k)),
  version = p.version + 1, modifiee_le = now()
where jsonb_typeof(p.etat->'paquets') = 'object'
  and exists (select 1 from jsonb_each(p.etat->'paquets') as t(k, v)
              where jsonb_typeof(v) = 'object' and v ? 't' and not coalesce(p.etat->'debuts', '{}'::jsonb) ? k);

-- 5. Jouer : applique une liste de petits ordres à la partie de MON couple, puis renvoie
--    {"etat": …, "version": …, "maintenant": heure du serveur en millisecondes}.
--    Un ordre : {"set": ["tirees", "v12"], "valeur": {…}} (écrire) ou {"suppr": ["tirees", "v12"]} (effacer).
--    Seules quelques clés sont permises :
--      • tirees, perso, paquets, debuts : des listes « identifiant → valeur », chemin de 2 éléments
--        (debuts : heure de début de chaque paquet « Pour plus tard », la « fois » de ses réponses ; à part de
--        paquets pour que « Carte suivante », qui réécrit toute la progression, ne la change jamais) ;
--      • affichee, defi, distance, minuteur : une seule valeur, chemin de 1 élément.
--    Une liste vide ne change rien : elle sert à lire la partie et l'heure du serveur.
--    Étape 5 : une carte ajoutée (perso) porte la place de son auteur, écrite ici par la base (jamais celle
--    envoyée par le téléphone). Un ordre qui modifie ou efface la carte de l'autre est ignoré, sans bloquer les autres.
create or replace function public.jouer(ordres jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  le_couple uuid := public.mon_couple_id();
  ma smallint := public.ma_place();
  existante jsonb;
  e jsonb;
  v bigint;
  o jsonb;
  chemin text[];
  cle text;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if le_couple is null then raise exception 'pas_de_couple'; end if;
  if jsonb_typeof(ordres) is distinct from 'array' or jsonb_array_length(ordres) > 300 then
    raise exception 'ordres_invalides';
  end if;

  insert into public.parties (couple_id, etat) values (le_couple, public.etat_vide()) on conflict do nothing;
  -- « for update » : si les deux téléphones jouent au même instant, le second attend le premier
  select etat, version into e, v from public.parties where couple_id = le_couple for update;

  if jsonb_array_length(ordres) > 0 then
    for o in select * from jsonb_array_elements(ordres) loop
      if jsonb_typeof(o->'set') = 'array' then
        chemin := array(select jsonb_array_elements_text(o->'set'));
      elsif jsonb_typeof(o->'suppr') = 'array' then
        chemin := array(select jsonb_array_elements_text(o->'suppr'));
      else
        raise exception 'ordres_invalides';
      end if;
      cle := chemin[1];
      if cle in ('tirees', 'perso', 'paquets', 'debuts') then
        if cardinality(chemin) <> 2 or coalesce(char_length(chemin[2]), 0) not between 1 and 80 then
          raise exception 'ordres_invalides';
        end if;
        if jsonb_typeof(e->cle) is distinct from 'object' then e := jsonb_set(e, array[cle], '{}'::jsonb); end if;
      elsif cle in ('affichee', 'defi', 'distance', 'minuteur') then
        if cardinality(chemin) <> 1 then raise exception 'ordres_invalides'; end if;
      else
        raise exception 'ordres_invalides';
      end if;
      if cle = 'perso' then
        -- Seul l'auteur touche à sa carte (une carte sans place, d'avant l'étape 5, est à la personne 1)
        existante := e->'perso'->chemin[2];
        if jsonb_typeof(existante) = 'object' and coalesce(existante->>'place', '1') <> ma::text then
          continue;
        end if;
        if o ? 'set' then
          if jsonb_typeof(o->'valeur') is distinct from 'object' then raise exception 'ordres_invalides'; end if;
          o := jsonb_set(o, '{valeur,place}', to_jsonb(ma));
        end if;
      end if;
      if o ? 'set' then e := jsonb_set(e, chemin, coalesce(o->'valeur', 'null'::jsonb), true);
      else e := e #- chemin;
      end if;
    end loop;
    if octet_length(e::text) > 500000 then raise exception 'partie_trop_grande'; end if;
    update public.parties set etat = e, version = version + 1, modifiee_le = now()
      where couple_id = le_couple returning version into v;
  end if;

  return jsonb_build_object('etat', e, 'version', v,
    'maintenant', floor(extract(epoch from clock_timestamp()) * 1000));
end $$;
