begin;

create table if not exists public.cosmetic_catalog (
  item_id text primary key,
  slot text not null check(slot in ('character','skin','weapon','trail','death','frame','title')),
  rarity text not null check(rarity in ('common','rare','epic','legendary')),
  price integer not null check(price>0)
);
insert into public.cosmetic_catalog(item_id,slot,rarity,price) values
 ('nomade_mousse','character','common',40),
 ('veilleuse_ecume','character','epic',150),
 ('roi_braise','character','legendary',290),
 ('peau_saule','skin','common',45),
 ('peau_cendre','skin','rare',75),
 ('peau_mauve','skin','epic',155),
 ('peau_or','skin','legendary',305),
 ('trait_fanal','weapon','common',45),
 ('trait_azur','weapon','rare',90),
 ('trait_or','weapon','legendary',325),
 ('pas_spores','trail','common',35),
 ('pas_lune','trail','rare',80),
 ('pas_marais','trail','epic',145),
 ('mort_brume','death','common',50),
 ('mort_flamb','death','epic',160),
 ('mort_aurore','death','legendary',310),
 ('cadre_jonc','frame','common',30),
 ('cadre_etain','frame','rare',100),
 ('cadre_or','frame','legendary',260),
 ('titre_guetteur','title','common',30),
 ('titre_mistral','title','rare',70),
 ('titre_feu','title','legendary',255)
on conflict(item_id) do update set slot=excluded.slot,rarity=excluded.rarity,price=excluded.price;

create table if not exists public.cosmetic_daily_chests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  claim_day date not null,
  item_id text not null references public.cosmetic_catalog(item_id),
  primary key(user_id,claim_day)
);
alter table public.cosmetic_catalog enable row level security;
alter table public.cosmetic_daily_chests enable row level security;
revoke all on public.cosmetic_catalog,public.cosmetic_daily_chests from public,anon,authenticated;
create unique index if not exists transactions_ash_award_once
  on public.transactions(user_id,kind,item_id) where kind in ('ash_match','ash_achievement');

create or replace function public.cosmetics_state() returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise insufficient_privilege; end if;
  return jsonb_build_object(
    'ash',coalesce((select c.ash_points from public.currencies c where c.user_id=uid),0),
    'items',coalesce((select jsonb_agg(i.item_id order by i.item_id) from public.inventory i
      join public.cosmetic_catalog c on c.item_id=i.item_id where i.user_id=uid),'[]'),
    'equipped',coalesce((select p.equipped from public.profiles p where p.id=uid),'{}'),
    'chestAvailable',not exists(select from public.cosmetic_daily_chests d where d.user_id=uid and d.claim_day=(now() at time zone 'UTC')::date)
      and exists(select from public.cosmetic_catalog c where c.rarity in ('common','rare') and
        not exists(select from public.inventory i where i.user_id=uid and i.item_id=c.item_id)),
    'achievements',coalesce((select jsonb_agg(t.item_id) from public.transactions t
      where t.user_id=uid and t.kind='ash_achievement'),'[]')
  );
end;
$$;

create or replace function public.cosmetics_purchase(p_item text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare uid uuid:=auth.uid(); cost integer; balance bigint;
begin
  if uid is null then raise insufficient_privilege; end if;
  select price into cost from public.cosmetic_catalog where item_id=p_item;
  if cost is null then raise exception 'Cosmétique introuvable' using errcode='P0001'; end if;
  select ash_points into balance from public.currencies where user_id=uid for update;
  if exists(select from public.inventory where user_id=uid and item_id=p_item) then return public.cosmetics_state(); end if;
  if coalesce(balance,0)<cost then raise exception 'Points de Cendre insuffisants' using errcode='P0001'; end if;
  insert into public.inventory(user_id,item_id) values(uid,p_item);
  update public.currencies set ash_points=ash_points-cost where user_id=uid;
  insert into public.transactions(user_id,kind,amount,item_id) values(uid,'ash_purchase',-cost,p_item);
  return public.cosmetics_state();
end;
$$;

create or replace function public.cosmetics_equip(p_character integer,p_slot text,p_item text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare uid uuid:=auth.uid(); outf jsonb; loadouts jsonb; current_loadout jsonb;
begin
  if uid is null then raise insufficient_privilege; end if;
  if p_character is null or p_character not between 0 and 4 or p_slot is null or
    p_slot not in ('character','skin','weapon','trail','death','frame','title') then
      raise exception 'Emplacement invalide' using errcode='P0001';
  end if;
  if p_item is not null and not exists(select from public.inventory i
    join public.cosmetic_catalog c on c.item_id=i.item_id
    where i.user_id=uid and i.item_id=p_item and c.slot=p_slot) then
      raise exception 'Cosmétique non acquis' using errcode='P0001';
  end if;
  select equipped into outf from public.profiles where id=uid for update;
  loadouts:=coalesce(outf->'cosmetics','{}');
  current_loadout:=coalesce(loadouts->p_character::text,'{}');
  if p_item is null then current_loadout:=current_loadout-p_slot;
  else current_loadout:=jsonb_set(current_loadout,array[p_slot],to_jsonb(p_item)); end if;
  loadouts:=jsonb_set(loadouts,array[p_character::text],current_loadout);
  update public.profiles set equipped=jsonb_set(outf,array['cosmetics'],loadouts) where id=uid;
  return public.cosmetics_state();
end;
$$;

create or replace function public.cosmetics_daily() returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare uid uuid:=auth.uid(); today date:=(now() at time zone 'UTC')::date; award text;
begin
  if uid is null then raise insufficient_privilege; end if;
  perform 1 from public.currencies where user_id=uid for update;
  select d.item_id into award from public.cosmetic_daily_chests d where d.user_id=uid and d.claim_day=today;
  if award is not null then return public.cosmetics_state()||jsonb_build_object('chestItem',award); end if;
  select c.item_id into award from public.cosmetic_catalog c
    where c.rarity in ('common','rare') and not exists(select from public.inventory i where i.user_id=uid and i.item_id=c.item_id)
    order by -ln(greatest(random(),0.000000001::double precision))/case when c.rarity='rare' then 1 else 3 end limit 1;
  if award is null then raise exception 'Collection quotidienne complète' using errcode='P0001'; end if;
  insert into public.cosmetic_daily_chests(user_id,claim_day,item_id) values(uid,today,award);
  insert into public.inventory(user_id,item_id) values(uid,award);
  return public.cosmetics_state()||jsonb_build_object('chestItem',award);
end;
$$;

create or replace function public.credit_match_ash(p_match uuid) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  game public.matches%rowtype;
  participant record; earned integer; granted integer; badge record;
  total_games integer; total_wins integer; total_kills bigint; total_revives bigint;
begin
  select * into game from public.matches where id=p_match for update;
  if not found or game.result is null or game.result not in ('win','loss') or game.duration_s not between 1 and 3600
    or game.team_size not between 1 and 4 or game.boss_kills not between 0 and least(3,game.duration_s/300) then
    raise exception 'Résultat du combat incohérent' using errcode='22023';
  end if;
  if (select count(*) from public.match_players where match_id=p_match)<>game.team_size or
    (select coalesce(sum(kills),0) from public.match_players where match_id=p_match)<>game.total_kills then
    raise exception 'Équipe du combat incohérente' using errcode='22023';
  end if;
  for participant in select p.user_id,p.kills,p.revives from public.match_players p
    where p.match_id=p_match order by p.user_id loop
    if participant.kills>150+game.duration_s*3 or participant.revives>game.duration_s/3 then
      raise exception 'Statistiques du combat incohérentes' using errcode='22023';
    end if;
    earned:=least(300,10+17*((game.duration_s+59)/60),
      2*(game.duration_s/60)+participant.kills/50+40*game.boss_kills+3*participant.revives
      +case when game.result='win' then 30 else 0 end+case when game.team_size>1 then 10 else 0 end);
    insert into public.currencies(user_id) values(participant.user_id) on conflict(user_id) do nothing;
    perform 1 from public.currencies where user_id=participant.user_id for update;
    insert into public.transactions(user_id,kind,amount,item_id)
      values(participant.user_id,'ash_match',earned,p_match::text) on conflict do nothing;
    if not found then continue; end if;
    update public.match_players set points_earned=earned where match_id=p_match and user_id=participant.user_id;
    granted:=earned;
    select count(*),count(*) filter(where m.result='win'),sum(p.kills),sum(p.revives)
      into total_games,total_wins,total_kills,total_revives
      from public.match_players p join public.matches m on m.id=p.match_id
      where p.user_id=participant.user_id and m.result in ('win','loss');
    for badge in select * from (values
      ('first_match',15,total_games>=1),('first_win',30,total_wins>=1),('hundred_kills',25,total_kills>=100),
      ('ten_revives',35,total_revives>=10),('ten_matches',40,total_games>=10)
    ) as b(id,points,achieved) where achieved loop
      insert into public.transactions(user_id,kind,amount,item_id)
        values(participant.user_id,'ash_achievement',badge.points,badge.id) on conflict do nothing;
      if found then granted:=granted+badge.points; end if;
    end loop;
    update public.currencies set ash_points=ash_points+granted where user_id=participant.user_id;
  end loop;
end;
$$;

revoke execute on function public.cosmetics_state(),public.cosmetics_purchase(text),public.cosmetics_equip(integer,text,text),
  public.cosmetics_daily(),public.credit_match_ash(uuid) from public,anon,authenticated;
grant execute on function public.cosmetics_state(),public.cosmetics_purchase(text),
  public.cosmetics_equip(integer,text,text),public.cosmetics_daily() to authenticated;
commit;
