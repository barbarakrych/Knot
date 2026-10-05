-- Knot · étape 3 : le couple.
-- À coller dans Supabase → SQL Editor → Run. Peut être relancé sans danger (rien n'est effacé).
--
-- Principe de sécurité :
--   • Chaque téléphone a un compte invisible (connexion anonyme). auth.uid() = l'identifiant de ce compte.
--   • RLS (Row Level Security) : à chaque lecture, la base ne renvoie que les lignes du couple de la personne.
--   • Aucune écriture directe n'est permise (pas de règle « insert / update / delete ») :
--     tout passe par les 4 fonctions en bas du fichier, qui vérifient chaque cas.

create extension if not exists pgcrypto with schema extensions;

-- ───────────── Tables ─────────────

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- code pour que l'autre rejoigne, ex. KNOT-BV-7K3Q
  prenom_1 text not null check (char_length(prenom_1) between 1 and 30),  -- personne qui a créé le couple
  prenom_2 text not null check (char_length(prenom_2) between 1 and 30),  -- l'autre personne
  cree_le timestamptz not null default now()
);

create table if not exists public.membres (
  user_id uuid primary key references auth.users(id) on delete cascade,   -- un compte = un seul couple
  couple_id uuid not null references public.couples(id) on delete cascade,
  place smallint not null check (place in (1, 2)),
  rejoint_le timestamptz not null default now(),
  unique (couple_id, place)                  -- une place = un seul téléphone : jamais plus de 2 par couple
);

create table if not exists public.codes_relier (
  code text primary key,
  couple_id uuid not null references public.couples(id) on delete cascade,
  place smallint not null check (place in (1, 2)),   -- la place que le nouveau téléphone reprendra
  cree_par uuid not null references auth.users(id) on delete cascade,
  cree_le timestamptz not null default now(),
  utilise_le timestamptz                     -- vide tant que le code n'a pas servi
);
-- Au plus un code non utilisé par place
create unique index if not exists codes_relier_un_seul_en_attente
  on public.codes_relier (couple_id, place) where utilise_le is null;

create table if not exists public.essais_codes (   -- codes faux tapés, pour bloquer qui essaie au hasard
  user_id uuid not null references auth.users(id) on delete cascade,
  essaye_le timestamptz not null default now()
);
create index if not exists essais_codes_par_compte on public.essais_codes (user_id, essaye_le);

-- ───────────── Règles de sécurité (RLS) ─────────────

-- Le couple de la personne connectée (ou rien). « security definer » : la fonction lit la table membres
-- sans passer par ses propres règles, sinon la règle de membres s'appellerait elle-même sans fin.
create or replace function public.mon_couple_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select couple_id from public.membres where user_id = auth.uid()
$$;

alter table public.couples enable row level security;
alter table public.membres enable row level security;
alter table public.codes_relier enable row level security;
alter table public.essais_codes enable row level security;   -- aucune règle : personne ne la lit

drop policy if exists "voir mon couple" on public.couples;
create policy "voir mon couple" on public.couples
  for select to authenticated using (id = public.mon_couple_id());

drop policy if exists "voir les membres de mon couple" on public.membres;
create policy "voir les membres de mon couple" on public.membres
  for select to authenticated using (couple_id = public.mon_couple_id());

drop policy if exists "voir mes codes relier" on public.codes_relier;
create policy "voir mes codes relier" on public.codes_relier
  for select to authenticated using (couple_id = public.mon_couple_id() and cree_par = auth.uid());

-- ───────────── Petits outils (internes) ─────────────

-- Première lettre d'un prénom, sans accent, en majuscule (« Élodie » → E). X si ce n'est pas une lettre.
create or replace function public.initiale(p text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(regexp_replace(upper(translate(left(btrim(p), 1),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝŸ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUYY')), '[^A-Z]', '', 'g'), ''), 'X')
$$;

-- Prénom propre : espaces en trop retirés, entre 1 et 30 caractères.
create or replace function public.prenom_propre(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare r text := regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g');
begin
  if char_length(r) < 1 or char_length(r) > 30 then raise exception 'prenom_invalide'; end if;
  return r;
end $$;

-- Code tapé → forme officielle. Accepte minuscules, espaces, tirets oubliés : « knot vb 7k3q » → KNOT-VB-7K3Q.
create or replace function public.code_propre(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare r text := regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g');
begin
  if left(r, 4) = 'KNOT' then r := substr(r, 5); end if;
  if char_length(r) <> 6 then return null; end if;
  -- Dans les initiales, un 0 tapé à la place d'un O (ou 1 pour I) est corrigé
  return 'KNOT-' || translate(left(r, 2), '01', 'OI') || '-' || right(r, 4);
end $$;

-- Nouveau code jamais utilisé. Les 4 caractères viennent d'un tirage cryptographique (impossible à prévoir),
-- dans un alphabet sans 0, O, 1, I. 256 est un multiple de 32 : chaque caractère a la même chance de sortir.
create or replace function public.nouveau_code(p1 text, p2 text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  octets bytea;
  suite text;
  candidat text;
begin
  loop
    octets := extensions.gen_random_bytes(4);
    suite := '';
    for i in 0..3 loop
      suite := suite || substr(alphabet, get_byte(octets, i) % 32 + 1, 1);
    end loop;
    candidat := 'KNOT-' || public.initiale(p1) || public.initiale(p2) || '-' || suite;
    if not exists (select 1 from public.couples where code = candidat)
       and not exists (select 1 from public.codes_relier where code = candidat) then
      return candidat;
    end if;
  end loop;
end $$;

-- Plus de 10 codes faux dans l'heure → bloqué pour l'heure.
create or replace function public.trop_d_essais() returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) >= 10 from public.essais_codes
  where user_id = auth.uid() and essaye_le > now() - interval '1 hour'
$$;

-- ───────────── Les 4 fonctions appelées par l'app ─────────────

-- 1. Créer le couple. Renvoie le code à donner à l'autre.
create or replace function public.creer_couple(mon_prenom text, autre_prenom text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  p1 text := public.prenom_propre(mon_prenom);
  p2 text := public.prenom_propre(autre_prenom);
  nouveau public.couples;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if public.mon_couple_id() is not null then raise exception 'deja_en_couple'; end if;
  insert into public.couples (code, prenom_1, prenom_2)
    values (public.nouveau_code(p1, p2), p1, p2) returning * into nouveau;
  insert into public.membres (user_id, couple_id, place) values (auth.uid(), nouveau.id, 1);
  return nouveau.code;
end $$;

-- 2. Regarder un code sans l'utiliser : quel prénom est attendu ?
--    Renvoie {"type": "couple" | "relier", "prenom": …} ou {"erreur": …}.
--    Les erreurs sont renvoyées (pas « levées ») pour que l'essai raté reste bien enregistré.
create or replace function public.apercu_code(code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c text := public.code_propre(code);
  cp public.couples;
  r public.codes_relier;
  place_libre smallint;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if public.mon_couple_id() is not null then return jsonb_build_object('erreur', 'deja_en_couple'); end if;
  if public.trop_d_essais() then return jsonb_build_object('erreur', 'trop_d_essais'); end if;

  select * into cp from public.couples where couples.code = c;
  if found then
    select p into place_libre from unnest(array[1, 2]::smallint[]) p
      where not exists (select 1 from public.membres m where m.couple_id = cp.id and m.place = p)
      order by p limit 1;
    if place_libre is null then
      insert into public.essais_codes (user_id) values (auth.uid());
      return jsonb_build_object('erreur', 'complet');
    end if;
    return jsonb_build_object('type', 'couple',
      'prenom', case place_libre when 1 then cp.prenom_1 else cp.prenom_2 end);
  end if;

  select * into r from public.codes_relier where codes_relier.code = c and utilise_le is null;
  if found then
    select * into cp from public.couples where id = r.couple_id;
    return jsonb_build_object('type', 'relier',
      'prenom', case r.place when 1 then cp.prenom_1 else cp.prenom_2 end);
  end if;

  insert into public.essais_codes (user_id) values (auth.uid());
  return jsonb_build_object('erreur', 'code_inconnu');
end $$;

-- 3. Utiliser un code. « prenom » vide = on garde le prénom prévu ; sinon il le remplace.
--    Renvoie {"ok": true} ou {"erreur": …}.
create or replace function public.utiliser_code(code text, prenom text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c text := public.code_propre(code);
  nouveau_prenom text := case when nullif(btrim(coalesce(prenom, '')), '') is null then null
                              else public.prenom_propre(prenom) end;
  cp public.couples;
  le_couple uuid;
  la_place smallint;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if public.mon_couple_id() is not null then return jsonb_build_object('erreur', 'deja_en_couple'); end if;
  if public.trop_d_essais() then return jsonb_build_object('erreur', 'trop_d_essais'); end if;

  -- Code du couple : on prend la place libre. « for update » : si deux téléphones arrivent
  -- en même temps, le second attend le premier, puis trouve le couple complet.
  select * into cp from public.couples where couples.code = c for update;
  if found then
    select p into la_place from unnest(array[1, 2]::smallint[]) p
      where not exists (select 1 from public.membres m where m.couple_id = cp.id and m.place = p)
      order by p limit 1;
    if la_place is null then
      insert into public.essais_codes (user_id) values (auth.uid());
      return jsonb_build_object('erreur', 'complet');
    end if;
    insert into public.membres (user_id, couple_id, place) values (auth.uid(), cp.id, la_place);
    le_couple := cp.id;
  else
    -- Code « relier » : marqué utilisé en une seule opération, seulement s'il ne l'était pas encore.
    -- Deux téléphones ne peuvent donc jamais s'en servir tous les deux.
    update public.codes_relier set utilise_le = now()
      where codes_relier.code = c and utilise_le is null
      returning couple_id, place into le_couple, la_place;
    if not found then
      insert into public.essais_codes (user_id) values (auth.uid());
      return jsonb_build_object('erreur', 'code_inconnu');
    end if;
    -- Le nouveau téléphone prend la place ; l'ancien n'a plus de couple (il reviendra à l'accueil).
    delete from public.membres where couple_id = le_couple and place = la_place;
    insert into public.membres (user_id, couple_id, place) values (auth.uid(), le_couple, la_place);
  end if;

  if nouveau_prenom is not null then
    update public.couples set
      prenom_1 = case when la_place = 1 then nouveau_prenom else prenom_1 end,
      prenom_2 = case when la_place = 2 then nouveau_prenom else prenom_2 end
    where id = le_couple;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- 4. Code pour relier le nouveau téléphone de l'AUTRE (jamais pour sa propre place).
--    Tant qu'il n'a pas servi, c'est toujours le même code. Seulement si le couple est complet.
create or replace function public.code_relier() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  moi public.membres;
  cp public.couples;
  autre_place smallint;
  existant text;
  nouveau text;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  select * into moi from public.membres where user_id = auth.uid();
  if not found then raise exception 'pas_de_couple'; end if;
  autre_place := 3 - moi.place;
  if not exists (select 1 from public.membres where couple_id = moi.couple_id and place = autre_place) then
    raise exception 'couple_incomplet';
  end if;

  select code into existant from public.codes_relier
    where couple_id = moi.couple_id and place = autre_place and utilise_le is null;
  if found then
    -- Le code en attente devient « le mien » (si c'est l'autre qui l'avait créé, je peux maintenant le voir)
    update public.codes_relier set cree_par = auth.uid() where code = existant;
    return existant;
  end if;

  select * into cp from public.couples where id = moi.couple_id;
  nouveau := public.nouveau_code(cp.prenom_1, cp.prenom_2);
  insert into public.codes_relier (code, couple_id, place, cree_par)
    values (nouveau, moi.couple_id, autre_place, auth.uid());
  return nouveau;
end $$;

-- ───────────── Qui peut lire quoi ─────────────
-- Le projet n'ouvre rien automatiquement (« Automatically expose new tables » décoché) : on ouvre à la main
-- la lecture seule aux téléphones connectés. Les règles RLS plus haut choisissent ensuite les lignes visibles.
-- Aucune permission d'écrire : double verrou avec les règles RLS.

revoke all on public.couples, public.membres, public.codes_relier, public.essais_codes from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.couples, public.membres, public.codes_relier to authenticated;

-- ───────────── Qui peut appeler quoi ─────────────
-- Les visiteurs non connectés (rôle « anon ») ne peuvent rien appeler.
-- Les outils internes ne sont appelables par personne de l'extérieur.

revoke all on function public.initiale(text), public.prenom_propre(text), public.code_propre(text),
  public.nouveau_code(text, text), public.trop_d_essais()
  from public, anon, authenticated;

revoke all on function public.mon_couple_id(), public.creer_couple(text, text), public.apercu_code(text),
  public.utiliser_code(text, text), public.code_relier()
  from public, anon;
grant execute on function public.mon_couple_id(), public.creer_couple(text, text), public.apercu_code(text),
  public.utiliser_code(text, text), public.code_relier()
  to authenticated;
