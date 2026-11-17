-- Défis entre amis en différé (« Bats mon score »).
--
-- Constat (diagnostic du 16/11/2026) : les joueurs qui ont au moins un ami
-- jouent 10,5 jours en moyenne contre 3,3 sans ami, mais le jeu en ligne en
-- temps réel tourne à vide (811 recherches classées sans adversaire en 30 j).
-- Un défi en différé ne demande pas que les deux joueurs soient là en même
-- temps : A joue une grille (même graine pour tout le monde), envoie un lien,
-- B la joue quand il veut, A reçoit le résultat. Jouer un défi rend les deux
-- joueurs amis.
--
-- Les grilles réutilisent les écrans du défi du jour : (mode, graine, date du
-- vivier) suffit à reproduire exactement la même partie.
-- Re-jouable.

create table if not exists public.friend_challenges (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  creator_id    uuid not null references auth.users(id) on delete cascade,
  game_mode     text not null,
  seed          bigint not null,
  pool_date     date not null,
  creator_score int  not null,
  created_at    timestamptz not null default now()
);
create index if not exists friend_challenges_creator_idx on public.friend_challenges (creator_id, created_at desc);

create table if not exists public.friend_challenge_results (
  challenge_id uuid not null references public.friend_challenges(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  score        int  not null,
  created_at   timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index if not exists friend_challenge_results_user_idx on public.friend_challenge_results (user_id);

-- Tout passe par les fonctions ci-dessous : aucune lecture ni écriture directe.
alter table public.friend_challenges enable row level security;
alter table public.friend_challenge_results enable row level security;
revoke all on public.friend_challenges from anon, authenticated;
revoke all on public.friend_challenge_results from anon, authenticated;

-- Modes jouables en défi : ceux du défi du jour (mêmes écrans, même graine).
create or replace function public._friend_challenge_mode_ok(p_mode text)
returns boolean language sql immutable as $$
  select p_mode in ('globe','regions','guess','borders','silhouette','higherlower','classic',
                    'streak','quiz-capital','quiz-flag','languages','challenge','pinpoint','scale','split')
$$;

-- Créer un défi après avoir joué sa grille. Renvoie le code à partager.
create or replace function public.create_friend_challenge(
  p_mode text, p_seed bigint, p_pool_date date, p_score int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_code text;
  recent int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public._friend_challenge_mode_ok(p_mode) then raise exception 'bad game mode'; end if;
  if p_score < 0 or p_score > 100000 then raise exception 'bad score'; end if;
  if p_pool_date < current_date - 7 or p_pool_date > current_date + 1 then raise exception 'bad date'; end if;
  -- Garde-fou anti-spam : 30 défis par heure et par joueur.
  select count(*) into recent from friend_challenges
    where creator_id = uid and created_at > now() - interval '1 hour';
  if recent >= 30 then raise exception 'rate limited'; end if;

  loop
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    exit when not exists (select 1 from friend_challenges where code = v_code);
  end loop;

  insert into friend_challenges (code, creator_id, game_mode, seed, pool_date, creator_score)
    values (v_code, uid, p_mode, p_seed, p_pool_date, p_score);
  return jsonb_build_object('code', v_code);
end $$;

-- Lire un défi (joueur connecté ou non : le lien s'ouvre aussi dans le navigateur).
create or replace function public.get_friend_challenge(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c friend_challenges%rowtype;
begin
  select * into c from friend_challenges where code = upper(p_code);
  if not found then return null; end if;
  return jsonb_build_object(
    'code', c.code,
    'mode', c.game_mode,
    'seed', c.seed,
    'pool_date', c.pool_date,
    'creator_id', c.creator_id,
    'creator_name', (select username from profiles where id = c.creator_id),
    'creator_score', c.creator_score,
    'created_at', c.created_at,
    'results', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'username', p.username, 'score', r.score)
                       order by r.score desc, r.created_at)
      from friend_challenge_results r left join profiles p on p.id = r.user_id
      where r.challenge_id = c.id), '[]'::jsonb)
  );
end $$;

-- Enregistrer son score sur le défi d'un autre. Le premier essai compte (pas
-- de réessai pour améliorer). Rend les deux joueurs amis.
create or replace function public.submit_friend_challenge(p_code text, p_score int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c friend_challenges%rowtype;
  n_ins int := 0;
  befriended boolean := false;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_score < 0 or p_score > 100000 then raise exception 'bad score'; end if;
  select * into c from friend_challenges where code = upper(p_code);
  if not found then raise exception 'not found'; end if;
  if c.creator_id = uid then
    return jsonb_build_object('recorded', false, 'reason', 'own_challenge');
  end if;

  insert into friend_challenge_results (challenge_id, user_id, score)
    values (c.id, uid, p_score)
    on conflict (challenge_id, user_id) do nothing;
  get diagnostics n_ins = row_count;

  -- Amitié automatique : une ligne par paire (index friends_unique_pair), une
  -- demande en attente entre eux devient acceptée.
  update friends set status = 'accepted'
    where status = 'pending'
      and least(user_id1, user_id2) = least(uid, c.creator_id)
      and greatest(user_id1, user_id2) = greatest(uid, c.creator_id);
  if not exists (
    select 1 from friends
    where least(user_id1, user_id2) = least(uid, c.creator_id)
      and greatest(user_id1, user_id2) = greatest(uid, c.creator_id)
  ) then
    insert into friends (user_id1, user_id2, status) values (c.creator_id, uid, 'accepted')
      on conflict do nothing;
    befriended := true;
  end if;

  return jsonb_build_object('recorded', n_ins > 0, 'befriended', befriended,
                            'creator_score', c.creator_score);
end $$;

-- Mes défis récents et leurs réponses (pour l'onglet Duel).
create or replace function public.my_friend_challenges(p_limit int default 20)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'code', c.code, 'mode', c.game_mode, 'creator_score', c.creator_score,
      'created_at', c.created_at,
      'results', coalesce((
        select jsonb_agg(jsonb_build_object('username', p.username, 'score', r.score) order by r.score desc)
        from friend_challenge_results r left join profiles p on p.id = r.user_id
        where r.challenge_id = c.id), '[]'::jsonb)
    ) x
    from friend_challenges c
    where c.creator_id = auth.uid()
    order by c.created_at desc
    limit least(greatest(p_limit, 1), 50)
  ) s
$$;

revoke all on function public._friend_challenge_mode_ok(text) from public, anon, authenticated;
revoke all on function public.create_friend_challenge(text, bigint, date, int) from public, anon;
grant execute on function public.create_friend_challenge(text, bigint, date, int) to authenticated;
revoke all on function public.get_friend_challenge(text) from public;
grant execute on function public.get_friend_challenge(text) to anon, authenticated;
revoke all on function public.submit_friend_challenge(text, int) from public, anon;
grant execute on function public.submit_friend_challenge(text, int) to authenticated;
revoke all on function public.my_friend_challenges(int) from public, anon;
grant execute on function public.my_friend_challenges(int) to authenticated;
