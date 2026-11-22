begin;
alter table public.matches add column if not exists map text not null default 'marais';
alter table public.matches add column if not exists damage_by_minute jsonb not null default '[]'::jsonb;
alter table public.match_players add column if not exists heals bigint not null default 0;
create index if not exists matches_started_idx on public.matches(started_at desc);

create or replace function public.combat_detail(p_match uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select to_jsonb(m)||jsonb_build_object('players',(select jsonb_agg(to_jsonb(mp)||jsonb_build_object('pseudo',p.pseudo)
   order by (mp.user_id=m.host_id) desc,mp.user_id)
   from public.match_players mp join public.profiles p on p.id=mp.user_id where mp.match_id=m.id))
 from public.matches m where m.id=p_match and exists(
   select from public.match_players my where my.match_id=m.id and my.user_id=auth.uid());
$$;

create or replace function public.submit_match(p_match jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
 uid uuid:=auth.uid(); match_id uuid:=(p_match->>'id')::uuid; duration integer:=(p_match->>'duration_s')::integer;
 outcome text:=p_match->>'result'; n integer; bosses integer:=(p_match->>'boss_kills')::integer;
 timeline jsonb:=p_match->'damage_by_minute'; started timestamptz;
 difficulty text:=coalesce(p_match->>'difficulty','normal'); match_map text:=coalesce(p_match->>'map','marais');
 start_row public.coop_starts%rowtype; entry jsonb; registered jsonb; weapon jsonb;
 player_id uuid; ids uuid[]:='{}'; weapon_ids integer[]; weapon_id integer;
 player_kills integer; taken bigint; dealt bigint; healed bigint; revives_count integer; deaths_count integer;
 reached integer; weapon_data jsonb; weapon_damage bigint; weapon_kills integer;
 weapon_damage_sum bigint; weapon_kill_sum bigint; timeline_sum bigint:=0; timeline_value bigint;
 team_kills integer:=0; team_damage bigint:=0; team_deaths integer:=0; team_revives integer:=0;
begin
 if uid is null then raise insufficient_privilege; end if;
 if match_id is null or jsonb_typeof(p_match) is distinct from 'object' or octet_length(p_match::text)>24000
    or jsonb_typeof(p_match->'players') is distinct from 'array' or jsonb_typeof(timeline) is distinct from 'array' then
   raise exception 'Résultat invalide' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(match_id::text,139));
 if exists(select from public.matches m where m.id=match_id) then
   if not exists(select from public.matches m where m.id=match_id and m.host_id=uid) then raise insufficient_privilege; end if;
   return public.combat_detail(match_id);
 end if;
 n:=jsonb_array_length(p_match->'players');
 if n not between 1 and 4 or duration is null or duration not between 1 and 3600 or outcome is null or outcome not in ('win','loss')
    or bosses is null or bosses not between 0 and least(3,duration/300)
    or (outcome='win' and (duration<900 or bosses=0))
    or jsonb_array_length(timeline) not between 1 and least(61,duration/60+1) then
   raise exception 'Résultat hors limites' using errcode='22023';
 end if;
 select * into start_row from public.coop_starts c where c.match_id=match_id;
 if n>1 then
   if start_row.host_id is distinct from uid or jsonb_array_length(start_row.players) is distinct from n then
     raise insufficient_privilege;
   end if;
   started:=start_row.started_at;
   difficulty:=start_row.difficulty; match_map:=start_row.map;
 else
   if start_row.host_id is not null then raise insufficient_privilege; end if;
   started:=(p_match->>'started_at')::timestamptz;
 end if;
 if started is null or started<'2020-01-01'::timestamptz or started>clock_timestamp()+interval '15 seconds'
    or started+make_interval(secs=>duration)>clock_timestamp()+interval '15 seconds'
    or char_length(difficulty)>32 or char_length(match_map)>32 then
   raise exception 'Horodatage invalide' using errcode='22023';
 end if;
 for entry in select value from jsonb_array_elements(timeline) loop
   timeline_value := (entry #>> '{}')::bigint;
   if timeline_value is null or timeline_value not between 0 and 3000000 then
     raise exception 'Courbe de dégâts invalide' using errcode='22023';
   end if;
   timeline_sum:=timeline_sum+timeline_value;
 end loop;

 insert into public.matches(id,host_id,started_at,duration_s,result,team_size,difficulty,boss_kills,total_kills,map,damage_by_minute)
 values(match_id,uid,started,duration,outcome,n,difficulty,bosses,0,match_map,timeline);

 for entry in select value from jsonb_array_elements(p_match->'players') loop
   player_id:=case when n=1 then uid else (entry->>'user_id')::uuid end;
   if player_id is null or player_id=any(ids) then raise exception 'Équipe invalide' using errcode='22023'; end if;
   ids:=array_append(ids,player_id);
   if n>1 then
     select value into registered from jsonb_array_elements(start_row.players) where value->>'id'=player_id::text;
     if registered is null or registered->>'character' is distinct from entry->>'character' then raise insufficient_privilege; end if;
   end if;
   if coalesce(entry->>'character','') !~ '^[0-4]$' then raise exception 'Personnage invalide' using errcode='22023'; end if;
   player_kills:=(entry->>'kills')::integer; dealt:=(entry->>'damage_dealt')::bigint; taken:=(entry->>'damage_taken')::bigint;
   healed:=(entry->>'heals')::bigint; revives_count:=(entry->>'revives')::integer; deaths_count:=(entry->>'deaths')::integer;
   reached:=(entry->>'level_reached')::integer; weapon_data:=entry->'weapons';
   if player_kills is null or player_kills not between 0 and duration*65+75
      or dealt is null or dealt not between 0 and least(duration*50000::bigint,(player_kills+250)*6000::bigint)
      or taken is null or taken not between 0 and duration*1200::bigint
      or healed is null or healed not between 0 and duration*1200::bigint
      or revives_count is null or revives_count not between 0 and duration/3
      or deaths_count is null or deaths_count not between 0 and duration/3+1
      or reached is null or reached not between 1 and 300
      or jsonb_typeof(weapon_data) is distinct from 'array' then
     raise exception 'Statistiques hors limites' using errcode='22023';
   end if;
   if jsonb_array_length(weapon_data)>12 then raise exception 'Armes invalides' using errcode='22023'; end if;
   weapon_ids:='{}'; weapon_damage_sum:=0; weapon_kill_sum:=0;
   for weapon in select value from jsonb_array_elements(weapon_data) loop
     weapon_id:=(weapon->>'id')::integer; weapon_damage:=(weapon->>'damage')::bigint; weapon_kills:=(weapon->>'kills')::integer;
     if weapon_id is null or weapon_id not between 0 and 11 or weapon_id=any(weapon_ids)
       or weapon_damage is null or weapon_damage not between 0 and dealt
       or weapon_kills is null or weapon_kills not between 0 and player_kills then
       raise exception 'Statistiques d’arme invalides' using errcode='22023';
     end if;
     weapon_ids:=array_append(weapon_ids,weapon_id);
     weapon_damage_sum:=weapon_damage_sum+weapon_damage; weapon_kill_sum:=weapon_kill_sum+weapon_kills;
   end loop;
   if weapon_damage_sum>dealt or weapon_kill_sum>player_kills then raise exception 'Armes incohérentes' using errcode='22023'; end if;
   insert into public.match_players(match_id,user_id,character,kills,damage_dealt,damage_taken,heals,revives,deaths,level_reached,weapons)
   values(match_id,player_id,entry->>'character',player_kills,dealt,taken,healed,revives_count,deaths_count,reached,weapon_data);
   team_kills:=team_kills+player_kills; team_damage:=team_damage+dealt;
   team_deaths:=team_deaths+deaths_count; team_revives:=team_revives+revives_count;
 end loop;
 if not (uid=any(ids)) or team_kills<bosses or team_kills>duration*65+75
    or team_damage<>timeline_sum or team_revives>team_deaths or (n=1 and team_revives<>0)
    or team_kills is distinct from (p_match->>'total_kills')::integer then
   raise exception 'Résultat d’équipe incohérent' using errcode='22023';
 end if;
 update public.matches set total_kills=team_kills where id=match_id;
 perform public.credit_match_ash(match_id);
 return public.combat_detail(match_id);
end;
$$;

create or replace function public.combat_history() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise insufficient_privilege; end if;
 return jsonb_build_object(
   'matches',coalesce((select jsonb_agg(summary order by (summary->>'started_at')::timestamptz desc) from (
     select jsonb_build_object('id',m.id,'started_at',m.started_at,'result',m.result,'duration_s',m.duration_s,
     'team_size',m.team_size,'points_earned',mp.points_earned) summary
     from public.match_players mp join public.matches m on m.id=mp.match_id
     where mp.user_id=uid order by m.started_at desc,m.id limit 30
   ) recent),'[]'::jsonb),
   'stats',(select jsonb_build_object('matches',count(*),'wins',count(*) filter(where m.result='win'),
     'time_s',coalesce(sum(m.duration_s),0),'kills',coalesce(sum(mp.kills),0),'best_time',coalesce(max(m.duration_s),0),
     'revives',coalesce(sum(mp.revives),0),'deaths',coalesce(sum(mp.deaths),0),'weapon',
     (select (w.value->>'id')::integer from public.match_players p2
      cross join lateral jsonb_array_elements(p2.weapons) w(value) where p2.user_id=uid
      group by w.value->>'id' order by count(*) desc,(w.value->>'id')::integer limit 1))
     from public.match_players mp join public.matches m on m.id=mp.match_id where mp.user_id=uid),
   'friends',coalesce((select jsonb_agg(jsonb_build_object('pseudo',ranking.pseudo,'kills',ranking.kills,'best_time',ranking.best_time)
     order by ranking.kills desc,ranking.best_time desc,ranking.pseudo) from (
      select p.pseudo,coalesce(sum(mp.kills),0) kills,coalesce(max(m.duration_s),0) best_time
      from public.profiles p left join public.match_players mp on mp.user_id=p.id
      left join public.matches m on m.id=mp.match_id
      where p.id=uid or exists(select from public.friendships f where f.status='accepted'
        and least(f.a,f.b)=least(uid,p.id) and greatest(f.a,f.b)=greatest(uid,p.id))
      group by p.id,p.pseudo
    ) ranking),'[]'::jsonb)
 );
end;
$$;

revoke execute on function public.submit_match(jsonb),public.combat_detail(uuid),public.combat_history() from public,anon,authenticated;
grant execute on function public.submit_match(jsonb),public.combat_detail(uuid),public.combat_history() to authenticated;
commit;
