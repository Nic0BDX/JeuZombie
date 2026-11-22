begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  pseudo text not null check (char_length(pseudo) between 3 and 16 and pseudo ~ '^[[:alnum:]_-]+$'),
  friend_code text not null unique check (friend_code ~ '^[A-Z0-9]{6}$'),
  created_at timestamptz not null default now(),
  equipped jsonb not null default '{}' check (jsonb_typeof(equipped) = 'object'),
  stats jsonb not null default '{}' check (jsonb_typeof(stats) = 'object')
);
create unique index if not exists profiles_pseudo_unique on public.profiles (lower(pseudo));

create table if not exists public.friendships (
  a uuid not null references public.profiles(id) on delete cascade,
  b uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','blocked')),
  created_at timestamptz not null default now(),
  primary key (a,b), check (a <> b)
);
create unique index if not exists friendships_pair_unique on public.friendships (least(a,b),greatest(a,b));
create index if not exists friendships_b_idx on public.friendships (b);

create table if not exists public.currencies (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  gold bigint not null default 0 check (gold >= 0),
  ash_points bigint not null default 0 check (ash_points >= 0)
);

create table if not exists public.inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id,item_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  duration_s integer not null default 0 check (duration_s >= 0),
  result text check (result in ('win','loss')),
  team_size smallint not null check (team_size between 1 and 4),
  difficulty text not null default 'normal',
  boss_kills integer not null default 0 check (boss_kills >= 0),
  total_kills integer not null default 0 check (total_kills >= 0)
);

create table if not exists public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  character text not null,
  kills integer not null default 0 check (kills >= 0),
  damage_dealt bigint not null default 0 check (damage_dealt >= 0),
  damage_taken bigint not null default 0 check (damage_taken >= 0),
  revives integer not null default 0 check (revives >= 0),
  deaths integer not null default 0 check (deaths >= 0),
  level_reached integer not null default 1 check (level_reached >= 1),
  weapons jsonb not null default '[]' check (jsonb_typeof(weapons) = 'array'),
  points_earned bigint not null default 0 check (points_earned >= 0),
  primary key (match_id,user_id)
);
create index if not exists match_players_user_idx on public.match_players (user_id,match_id);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  amount bigint not null,
  item_id text,
  created_at timestamptz not null default now()
);
create index if not exists transactions_user_idx on public.transactions (user_id,created_at desc);

create table if not exists public.solo_saves (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  state jsonb not null default '{}' check (jsonb_typeof(state) = 'object'),
  balance bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.solo_sync_devices (
  user_id uuid not null references public.solo_saves(user_id) on delete cascade,
  device uuid not null,
  last_seq bigint not null check (last_seq > 0),
  primary key (user_id,device)
);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.currencies enable row level security;
alter table public.inventory enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.transactions enable row level security;
alter table public.solo_saves enable row level security;
alter table public.solo_sync_devices enable row level security;

revoke all on public.profiles, public.friendships, public.currencies, public.inventory,
  public.matches, public.match_players, public.transactions, public.solo_saves,
  public.solo_sync_devices from public, anon, authenticated;
grant select on public.profiles, public.friendships, public.currencies, public.inventory,
  public.matches, public.match_players, public.transactions to authenticated;

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select to authenticated using (id = (select auth.uid()));

drop policy if exists friendships_read_related on public.friendships;
create policy friendships_read_related on public.friendships for select to authenticated
  using ((select auth.uid()) in (a,b));

drop policy if exists currencies_read_own on public.currencies;
create policy currencies_read_own on public.currencies for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists inventory_read_own on public.inventory;
create policy inventory_read_own on public.inventory for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists match_players_read_own on public.match_players;
create policy match_players_read_own on public.match_players for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists matches_read_participated on public.matches;
create policy matches_read_participated on public.matches for select to authenticated using (
  exists (select 1 from public.match_players mp where mp.match_id = matches.id and mp.user_id = (select auth.uid()))
);

drop policy if exists transactions_read_own on public.transactions;
create policy transactions_read_own on public.transactions for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.ensure_profile() returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  uid uuid := auth.uid();
  profile public.profiles%rowtype;
  code text;
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  random_bytes bytea;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  for attempt in 1..16 loop
    select * into profile from public.profiles where id = uid;
    if found then exit; end if;

    random_bytes := uuid_send(gen_random_uuid());
    code := '';
    for i in 0..5 loop
      code := code || substr(chars, 1 + (get_byte(random_bytes,i) % 32), 1);
    end loop;
    begin
      insert into public.profiles(id,pseudo,friend_code)
      values (uid,'Survivant-'||code,code)
      on conflict (id) do nothing
      returning * into profile;
      if found then exit; end if;
    exception when unique_violation then null;
    end;
  end loop;

  if profile.id is null then raise exception 'Could not create profile' using errcode = '55000'; end if;
  insert into public.currencies(user_id) values(uid) on conflict do nothing;
  return jsonb_build_object('pseudo',profile.pseudo,'friend_code',profile.friend_code,'equipped',profile.equipped,'stats',profile.stats);
end;
$$;

create or replace function public.rename_profile(p_pseudo text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  uid uuid := auth.uid();
  desired text := btrim(p_pseudo);
  cleaned text;
  profile public.profiles%rowtype;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if desired is null or char_length(desired) not between 3 and 16 or desired !~ '^[[:alnum:]_-]+$' then
    raise exception 'Invalid nickname' using errcode = '22023';
  end if;
  cleaned := regexp_replace(translate(lower(desired),'àâäáãåçèéêëìíîïñòóôöõùúûüÿ','aaaaaaceeeeiiiinooooouuuuy'),'[^a-z0-9]','','g');
  if cleaned ~ '(admin|moderateur|moderator|supabase|jeuzombie|connard|connasse|salope|putain|encul|fdp|merde|fuck|bitch|nazi|hitler|nigg)' then
    raise exception 'Invalid nickname' using errcode = '22023';
  end if;

  perform public.ensure_profile();
  update public.profiles set pseudo = desired where id = uid returning * into profile;
  return jsonb_build_object('pseudo',profile.pseudo,'friend_code',profile.friend_code,'equipped',profile.equipped,'stats',profile.stats);
end;
$$;

create or replace function public.find_public_profile(p_pseudo text) returns jsonb
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select jsonb_build_object('pseudo',p.pseudo,'equipped',p.equipped)
  from public.profiles p
  where (select auth.uid()) is not null and char_length(btrim(p_pseudo)) between 3 and 16
    and lower(p.pseudo) = lower(btrim(p_pseudo));
$$;


create or replace function public.solo_int(value jsonb, fallback bigint, low bigint, high bigint) returns bigint
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when jsonb_typeof(value) = 'number'
    then greatest(low,least(high,trunc((value #>> '{}')::numeric)))::bigint else fallback end;
$$;

create or replace function public.solo_value(value jsonb, fallback jsonb) returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when jsonb_typeof(value) = jsonb_typeof(fallback) then value else fallback end;
$$;

create or replace function public.solo_volume(value jsonb, fallback numeric) returns numeric
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when jsonb_typeof(value) = 'number'
    then greatest(0,least(1,(value #>> '{}')::numeric)) else fallback end;
$$;

create or replace function public.solo_shape(raw jsonb) returns jsonb
language plpgsql immutable set search_path = pg_catalog, public, pg_temp as $$
declare
  cfg jsonb := raw->'options';
  col jsonb := raw->'collection';
  rec jsonb := raw->'records';
  upgrades jsonb := '[]';
  invested jsonb := '[]';
  kills jsonb := '[]';
  options jsonb;
  collection jsonb;
  records jsonb := '{}';
  field text;
  cap constant bigint := 1000000000000;
begin
  for i in 0..11 loop
    upgrades := upgrades || to_jsonb(public.solo_int(raw->'upgrades'->i,0,0,5));
    invested := invested || to_jsonb(public.solo_int(raw->'invested'->i,0,0,1000000000));
  end loop;
  for i in 0..8 loop
    kills := kills || to_jsonb(public.solo_int(col->'kills'->i,0,0,cap));
  end loop;
  options := jsonb_build_object(
    'sound',public.solo_value(cfg->'sound','true'),
    'musicVolume',public.solo_volume(cfg->'musicVolume',0.55),
    'sfxVolume',public.solo_volume(cfg->'sfxVolume',0.8),
    'vibration',public.solo_value(cfg->'vibration','true'),
    'shake',public.solo_value(cfg->'shake','true'),
    'quality',public.solo_int(cfg->'quality',2,0,2),
    'leftHanded',public.solo_value(cfg->'leftHanded','false')
  );
  collection := jsonb_build_object(
    'seen',public.solo_int(col->'seen',0,0,511),'kills',kills,
    'weapons',public.solo_int(col->'weapons',0,0,4095),
    'seenWeapons',public.solo_int(col->'seenWeapons',0,0,4095),
    'evolutions',public.solo_int(col->'evolutions',0,0,4095),
    'achievements',public.solo_int(col->'achievements',0,0,1048575)
  );
  foreach field in array array['runs','wins','kills','bosses','bestTime','bestLevel','bestScore','totalScore'] loop
    records := jsonb_set(records,array[field],to_jsonb(public.solo_int(rec->field,0,0,cap)));
  end loop;
  return jsonb_build_object(
    'version',2,'gold',public.solo_int(raw->'gold',0,0,cap),
    'characters',public.solo_int(raw->'characters',1,0,31) | 1,
    'weapons',public.solo_int(raw->'weapons',15,0,4095) | 15,
    'character',public.solo_int(raw->'character',0,0,4),
    'startingWeapon',public.solo_int(raw->'startingWeapon',-1,-1,11),
    'upgrades',upgrades,'invested',invested,'options',options,'collection',collection,'records',records
  );
end;
$$;

create or replace function public.sync_solo_save(p_device uuid,p_seq bigint,p_save jsonb,p_base jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  uid uuid := auth.uid();
  saved public.solo_saves%rowtype;
  last_seq bigint;
  inbound jsonb;
  baseline jsonb;
  merged jsonb;
  remote jsonb;
  field text;
  ranks jsonb := '[]';
  invested jsonb := '[]';
  kills jsonb := '[]';
  changes bigint;
  gold_delta bigint;
  remote_rank bigint;
  base_rank bigint;
  local_rank bigint;
  remote_cost bigint;
  base_cost bigint;
  local_cost bigint;
  final_cost bigint;
  cap constant bigint := 1000000000000;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_device is null or p_seq is null or p_seq < 1
      or jsonb_typeof(p_save) is distinct from 'object'
      or jsonb_typeof(coalesce(p_base,'{}')) is distinct from 'object'
      or octet_length(p_save::text) > 32768 or octet_length(coalesce(p_base,'{}')::text) > 32768 then
    raise exception 'Invalid solo save payload' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = uid) then perform public.ensure_profile(); end if;
  insert into public.solo_saves(user_id) values(uid) on conflict do nothing;
  select * into strict saved from public.solo_saves where user_id = uid for update;
  select d.last_seq into last_seq from public.solo_sync_devices d where d.user_id = uid and d.device = p_device;
  if last_seq is not null and p_seq <= last_seq then return saved.state; end if;

  inbound := public.solo_shape(p_save);
  baseline := public.solo_shape(coalesce(p_base,'{}'));
  remote := public.solo_shape(saved.state);
  merged := remote;
  gold_delta := (inbound->>'gold')::bigint - (baseline->>'gold')::bigint;

  foreach field in array array['characters','weapons'] loop
    changes := (remote->>field)::bigint | (inbound->>field)::bigint;
    merged := jsonb_set(merged,array[field],to_jsonb(changes));
  end loop;
  foreach field in array array['character','startingWeapon'] loop
    if inbound->field is distinct from baseline->field then
      merged := jsonb_set(merged,array[field],inbound->field);
    end if;
  end loop;
  foreach field in array array['sound','musicVolume','sfxVolume','vibration','shake','quality','leftHanded'] loop
    if inbound->'options'->field is distinct from baseline->'options'->field then
      merged := jsonb_set(merged,array['options',field],inbound->'options'->field);
    end if;
  end loop;

  for i in 0..11 loop
    base_rank := (baseline->'upgrades'->>i)::bigint;
    local_rank := (inbound->'upgrades'->>i)::bigint;
    remote_rank := (remote->'upgrades'->>i)::bigint;
    base_cost := (baseline->'invested'->>i)::bigint;
    local_cost := (inbound->'invested'->>i)::bigint;
    remote_cost := (remote->'invested'->>i)::bigint;
    final_cost := remote_cost;
    if (local_rank,local_cost) is distinct from (base_rank,base_cost) and
        ((remote_rank,remote_cost) is not distinct from (base_rank,base_cost) or
         (local_rank > base_rank and local_rank > remote_rank)) then
      remote_rank := local_rank;
      final_cost := local_cost;
    end if;
    -- Reconcile concurrent payments for the same rank.
    gold_delta := gold_delta + local_cost - base_cost - (final_cost - remote_cost);
    ranks := ranks || to_jsonb(remote_rank);
    invested := invested || to_jsonb(final_cost);
  end loop;
  merged := jsonb_set(jsonb_set(merged,'{upgrades}',ranks),'{invested}',invested);

  foreach field in array array['seen','weapons','seenWeapons','evolutions','achievements'] loop
    changes := (remote->'collection'->>field)::bigint | (inbound->'collection'->>field)::bigint;
    merged := jsonb_set(merged,array['collection',field],to_jsonb(changes));
  end loop;
  for i in 0..8 loop
    changes := greatest(0,(inbound->'collection'->'kills'->>i)::bigint - (baseline->'collection'->'kills'->>i)::bigint);
    kills := kills || to_jsonb(least(cap,(remote->'collection'->'kills'->>i)::bigint + changes));
  end loop;
  merged := jsonb_set(merged,'{collection,kills}',kills);
  foreach field in array array['runs','wins','kills','bosses','totalScore'] loop
    changes := greatest(0,(inbound->'records'->>field)::bigint - (baseline->'records'->>field)::bigint);
    merged := jsonb_set(merged,array['records',field],to_jsonb(least(cap,(remote->'records'->>field)::bigint + changes)));
  end loop;
  foreach field in array array['bestTime','bestLevel','bestScore'] loop
    changes := greatest((remote->'records'->>field)::bigint,(inbound->'records'->>field)::bigint);
    merged := jsonb_set(merged,array['records',field],to_jsonb(changes));
  end loop;

  saved.balance := greatest(-cap,least(cap,saved.balance + gold_delta));
  merged := jsonb_set(merged,'{gold}',to_jsonb(greatest(0,saved.balance)));
  update public.solo_saves set state = merged,balance = saved.balance,updated_at = now() where user_id = uid;
  insert into public.solo_sync_devices(user_id,device,last_seq) values(uid,p_device,p_seq)
    on conflict (user_id,device) do update set last_seq = excluded.last_seq;
  return merged;
end;
$$;

revoke execute on function public.ensure_profile(), public.rename_profile(text), public.find_public_profile(text),
  public.solo_int(jsonb,bigint,bigint,bigint), public.solo_value(jsonb,jsonb), public.solo_volume(jsonb,numeric),
  public.solo_shape(jsonb), public.sync_solo_save(uuid,bigint,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.ensure_profile(), public.rename_profile(text),
  public.find_public_profile(text), public.sync_solo_save(uuid,bigint,jsonb,jsonb) to authenticated;

commit;
